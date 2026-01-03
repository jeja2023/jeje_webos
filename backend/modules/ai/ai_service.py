"""
AI 模块业务逻辑 Service
支持混合模式：本地 Llama-cpp 推理 + 在线 API (OpenAI 兼容格式)
"""

import os
import json
import logging
import asyncio
import httpx
from typing import List, Dict, Any, Optional, Generator, Union
from llama_cpp import Llama

from core.config import get_settings
from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)
storage_manager = get_storage_manager()

class AIService:
    _model_instances = {}
    
    @classmethod
    def get_model_path(cls, model_filename: str = "qwen2.5-coder-7b-instruct-q4_k_m.gguf") -> str:
        """获取本地模型绝对路径"""
        # 模型存放于 storage/modules/ai/ai_models/
        models_dir = storage_manager.get_module_dir("ai", "ai_models")
        if not model_filename:
            return str(models_dir)
        return str(models_dir / model_filename)

    @classmethod
    def _get_llm(cls, model_filename: str) -> Llama:
        """获取或初始化本地模型实例"""
        if model_filename not in cls._model_instances:
            model_path = cls.get_model_path(model_filename)
            
            if not os.path.exists(model_path):
                logger.error(f"本地模型文件不存在: {model_path}")
                raise FileNotFoundError(f"Model file not found at {model_path}")
            
            logger.info(f"正在加载本地模型: {model_path}...")
            cls._model_instances[model_filename] = Llama(
                model_path=model_path,
                n_ctx=2048,
                n_threads=os.cpu_count(),
                n_gpu_layers=0,
                verbose=False
            )
            logger.info("本地模型加载完成")
            
        return cls._model_instances[model_filename]

    @classmethod
    async def _chat_local(cls, messages: List[Dict[str, str]], stream: bool = True) -> Any:
        """本地模型推理"""
        loop = asyncio.get_event_loop()

        # 默认使用已存在的 coder 模型
        model_name = "qwen2.5-coder-7b-instruct-q4_k_m.gguf"

        # 确保模型已加载 (在线程中加载以防阻塞)
        if model_name not in cls._model_instances:
            await loop.run_in_executor(None, cls._get_llm, model_name)
            
        llm = cls._get_llm(model_name)

        def _create_generator():
            return llm.create_chat_completion(
                messages=messages,
                stream=stream,
                temperature=0.7,
                max_tokens=2048
            )

        # 获取同步迭代器
        sync_iterator = await loop.run_in_executor(None, _create_generator)

        # 转换为异步迭代器，并在线程中执行计算密集型的 next()
        async def _async_generator():
            # 定义一个带有异常捕获的迭代辅助函数
            def _get_next():
                try:
                    return next(sync_iterator)
                except StopIteration:
                    return None # 使用 None 作为结束信号
            
            while True:
                try:
                    # 在线程池中获取下一个 token
                    chunk = await loop.run_in_executor(None, _get_next)
                    if chunk is None:
                        break
                    yield chunk
                except Exception as e:
                    logger.error(f"Local inference error: {e}")
                    break
        
        return _async_generator()

    @classmethod
    async def _chat_online(cls, messages: List[Dict[str, str]], stream: bool = True, api_config: Optional[Dict[str, str]] = None) -> Any:
        """在线 API 推理 (OpenAI 兼容格式)"""
        settings = get_settings()
        
        # 优先使用前端传入的配置
        if api_config:
            api_key = api_config.get("apiKey")
            base_url = api_config.get("baseUrl")
            model_name = api_config.get("model")
        else:
            api_key = getattr(settings, "ai_online_api_key", "sk-xxx")
            base_url = getattr(settings, "ai_online_base_url", "https://api.deepseek.com/v1")
            model_name = getattr(settings, "ai_online_model", "deepseek-chat")

        if not api_key or api_key == "sk-xxx":
            raise ValueError("未配置在线 API Key")

        async def generator():
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": stream,
                        "temperature": 0.7
                    }
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        raise Exception(f"在线 API 请求失败 ({response.status_code}): {error_text.decode()}")
                    
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        
                        try:
                            chunk = json.loads(data_str)
                            yield chunk
                        except:
                            continue

        return generator() if stream else await cls._chat_online_sync(messages)

    @classmethod
    async def _chat_online_sync(cls, messages: List[Dict[str, str]]) -> Dict:
        # 简化版同步调用
        return {"choices": [{"message": {"content": "在线同步模式暂未完全实现"}}]}

    @classmethod
    def _is_data_analysis_query(cls, query: str) -> bool:
        """检测问题是否涉及数据分析"""
        query_lower = query.lower()
        # 数据分析相关的关键词
        data_keywords = [
            '数据', 'dataset', '数据集', '统计', '分析', '查询', 'sql',
            '表格', '表', '列', '行', '字段', '汇总', '聚合', '平均值',
            '最大值', '最小值', '总和', '计数', '图表', '可视化',
            'excel', 'csv', '导入', '导出', '清洗', '建模',
            '找出', '显示', '列出', '获取', '筛选', '过滤'
        ]
        return any(keyword in query_lower for keyword in data_keywords)

    @classmethod
    def _generate_sql_from_natural_language(cls, query: str, dataset) -> Optional[str]:
        """从自然语言生成SQL查询"""
        try:
            query_lower = query.lower()
            table_name = dataset.table_name
            
            # 获取数据集列信息（从表名推断或查询）
            # 这里简化处理，实际可以查询表结构
            base_sql = f"SELECT * FROM {table_name}"
            
            # 简单的关键词匹配生成SQL
            conditions = []
            limit_clause = ""
            
            # 检测限制数量
            limit_match = re.search(r'(前|top|limit|最多|只显示)\s*(\d+)', query_lower)
            if limit_match:
                limit_num = int(limit_match.group(2))
                limit_clause = f" LIMIT {min(limit_num, 100)}"
            elif '前10' in query_lower or '前十' in query_lower:
                limit_clause = " LIMIT 10"
            elif '前20' in query_lower or '前二十' in query_lower:
                limit_clause = " LIMIT 20"
            elif '前5' in query_lower or '前五' in query_lower:
                limit_clause = " LIMIT 5"
            else:
                limit_clause = " LIMIT 100"  # 默认限制
            
            # 检测排序
            order_clause = ""
            if '最大' in query_lower or '最高' in query_lower or '最多' in query_lower:
                # 尝试找到要排序的列
                # 简化处理：如果有明确的列名，使用它；否则使用第一列
                order_clause = " ORDER BY 1 DESC"
            elif '最小' in query_lower or '最低' in query_lower or '最少' in query_lower:
                order_clause = " ORDER BY 1 ASC"
            elif '最新' in query_lower or '最近' in query_lower:
                # 尝试找时间列
                order_clause = " ORDER BY 1 DESC"
            
            # 检测筛选条件（简化版）
            # 实际应用中可以使用更复杂的NLP或LLM来生成
            if 'where' in query_lower or '条件' in query_lower or '筛选' in query_lower:
                # 这里简化处理，实际应该解析条件
                pass
            
            # 组合SQL
            sql = base_sql
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            if order_clause:
                sql += order_clause
            sql += limit_clause
            
            return sql
        except Exception as e:
            logger.warning(f"生成SQL失败: {e}")
            return None

    @classmethod
    async def _get_analysis_context(cls, query: str) -> str:
        """获取数据分析上下文"""
        try:
            from core.database import async_session
            from modules.analysis.analysis_models import AnalysisDataset
            from modules.analysis.analysis_modeling_service import ModelingService
            from sqlalchemy import select
            import re
            
            context_parts = []
            
            async with async_session() as db:
                # 1. 获取数据集列表
                result = await db.execute(
                    select(AnalysisDataset).order_by(AnalysisDataset.updated_at.desc()).limit(10)
                )
                datasets = result.scalars().all()
                
                if datasets:
                    context_parts.append("\n--- 可用数据集 ---")
                    for ds in datasets:
                        context_parts.append(f"- 数据集ID {ds.id}: {ds.name} ({ds.row_count or 0} 行, 表名: {ds.table_name})")
                
                # 2. 检测并执行 SQL 查询
                query_lower = query.lower()
                
                # 检测是否包含 SQL 语句
                sql_match = re.search(r'select\s+.*?\s+from\s+(\w+)', query_lower, re.IGNORECASE)
                if sql_match:
                    table_name = sql_match.group(1)
                    # 查找对应的数据集
                    dataset = None
                    for ds in datasets:
                        if ds.table_name == table_name or str(ds.id) == table_name:
                            dataset = ds
                            break
                    
                    if dataset:
                        try:
                            # 提取完整的 SQL 语句
                            sql_full_match = re.search(r'(select\s+.*?\s+from\s+\w+.*?)(?:[。，,\.\n]|$)', query, re.IGNORECASE | re.DOTALL)
                            if sql_full_match:
                                sql_query = sql_full_match.group(1).strip()
                                # 替换表名为实际表名
                                sql_query = re.sub(r'from\s+\w+', f'FROM {dataset.table_name}', sql_query, flags=re.IGNORECASE)
                                
                                # 执行 SQL 查询
                                sql_result = await ModelingService.execute_sql(db, sql_query, limit=100)
                                context_parts.append(f"\n--- SQL 查询结果 (数据集: {dataset.name}) ---")
                                context_parts.append(f"查询: {sql_query}")
                                context_parts.append(f"返回 {sql_result['row_count']} 行数据")
                                if sql_result['row_count'] > 0:
                                    # 只显示前5行作为示例
                                    sample_rows = sql_result['rows'][:5]
                                    context_parts.append(f"列: {', '.join(sql_result['columns'])}")
                                    context_parts.append(f"示例数据 (前5行): {json.dumps(sample_rows, ensure_ascii=False, indent=2)}")
                                    if sql_result['row_count'] > 5:
                                        context_parts.append(f"(共 {sql_result['row_count']} 行，仅显示前5行)")
                        except Exception as e:
                            logger.warning(f"执行 SQL 查询失败: {e}")
                            context_parts.append(f"\nSQL 查询执行失败: {str(e)}")
                
                # 3. 自然语言转SQL（如果问题包含查询意图但没有明确的SQL）
                elif any(kw in query_lower for kw in ['查询', '找出', '显示', '列出', '获取', '筛选', '过滤']) and 'select' not in query_lower:
                    # 尝试从问题中提取数据集信息
                    dataset_id_match = re.search(r'数据集[：:]\s*(\d+)', query)
                    dataset_name_match = re.search(r'数据集[：:]\s*([^\s，,。.]+)', query)
                    
                    dataset_id = None
                    if dataset_id_match:
                        dataset_id = int(dataset_id_match.group(1))
                    elif dataset_name_match and datasets:
                        dataset_name = dataset_name_match.group(1)
                        for ds in datasets:
                            if dataset_name in ds.name:
                                dataset_id = ds.id
                                break
                    elif datasets:
                        # 如果没有指定，使用最新的数据集
                        dataset_id = datasets[0].id
                    
                    if dataset_id:
                        dataset = next((ds for ds in datasets if ds.id == dataset_id), None)
                        if dataset:
                            # 生成SQL查询建议
                            sql_suggestion = cls._generate_sql_from_natural_language(query, dataset)
                            if sql_suggestion:
                                try:
                                    # 执行生成的SQL
                                    sql_result = await ModelingService.execute_sql(db, sql_suggestion, limit=100)
                                    context_parts.append(f"\n--- 自然语言查询结果 (数据集: {dataset.name}) ---")
                                    context_parts.append(f"生成的SQL: {sql_suggestion}")
                                    context_parts.append(f"返回 {sql_result['row_count']} 行数据")
                                    if sql_result['row_count'] > 0:
                                        sample_rows = sql_result['rows'][:5]
                                        context_parts.append(f"列: {', '.join(sql_result['columns'])}")
                                        context_parts.append(f"示例数据 (前5行): {json.dumps(sample_rows, ensure_ascii=False, indent=2)}")
                                        if sql_result['row_count'] > 5:
                                            context_parts.append(f"(共 {sql_result['row_count']} 行，仅显示前5行)")
                                except Exception as e:
                                    logger.warning(f"执行生成的SQL失败: {e}")
                                    context_parts.append(f"\nSQL生成建议: {sql_suggestion}")
                                    context_parts.append(f"执行失败: {str(e)}")
                
                # 4. 如果问题包含统计、汇总等关键词，尝试获取统计信息
                elif any(kw in query_lower for kw in ['统计', '汇总', '分析', '描述', 'summary']):
                    # 尝试从问题中提取数据集ID或名称
                    dataset_id_match = re.search(r'数据集[：:]\s*(\d+)', query)
                    dataset_name_match = re.search(r'数据集[：:]\s*([^\s，,。.]+)', query)
                    
                    dataset_id = None
                    if dataset_id_match:
                        dataset_id = int(dataset_id_match.group(1))
                    elif dataset_name_match and datasets:
                        dataset_name = dataset_name_match.group(1)
                        for ds in datasets:
                            if dataset_name in ds.name:
                                dataset_id = ds.id
                                break
                    elif datasets:
                        # 如果没有指定，使用最新的数据集
                        dataset_id = datasets[0].id
                    
                    # 如果找到了数据集，获取统计信息
                    if dataset_id:
                        try:
                            summary = await ModelingService.get_summary(db, dataset_id)
                            dataset = next((ds for ds in datasets if ds.id == dataset_id), None)
                            context_parts.append(f"\n--- 数据集统计信息 ({dataset.name if dataset else f'ID {dataset_id}'}) ---")
                            # 简化统计信息输出
                            if 'stats' in summary:
                                stats = summary['stats']
                                context_parts.append(f"数据集包含 {len(stats)} 个字段的统计信息")
                                # 显示关键统计指标
                                for col, col_stats in list(stats.items())[:5]:  # 只显示前5个字段
                                    if isinstance(col_stats, dict):
                                        context_parts.append(f"  {col}: {json.dumps(col_stats, ensure_ascii=False)}")
                            if 'missing' in summary:
                                missing = summary['missing']
                                total_missing = sum(missing.values())
                                if total_missing > 0:
                                    context_parts.append(f"缺失值统计: 共 {total_missing} 个缺失值")
                        except Exception as e:
                            logger.warning(f"获取数据集统计失败: {e}")
            
            return "\n".join(context_parts) if context_parts else ""
        except Exception as e:
            logger.error(f"获取数据分析上下文失败: {e}", exc_info=True)
            return ""

    @classmethod
    async def chat_with_context(
        cls, 
        query: str, 
        history: List[Dict[str, str]] = [],
        knowledge_base_id: Optional[int] = None,
        use_analysis: bool = False,
        provider: str = "local", # "local" 或 "online"
        api_config: Optional[Dict[str, str]] = None
    ) -> Any:
        """带有上下文的混合模式对话"""
        
        context = ""
        
        # 1. 知识库集成 (RAG)
        if knowledge_base_id:
            try:
                from modules.knowledge.knowledge_services import KnowledgeService
                from core.database import async_session
                async with async_session() as db:
                    search_results = await KnowledgeService.search(db, knowledge_base_id, query)
                    if search_results:
                        context += "\n--- 参考知识库资料 ---\n"
                        for res in search_results:
                            context += f"- {res['content']}\n"
            except Exception as e:
                logger.error(f"RAG search error: {e}")

        # 2. 数据分析助手集成
        if use_analysis and cls._is_data_analysis_query(query):
            try:
                analysis_context = await cls._get_analysis_context(query)
                if analysis_context:
                    context += "\n--- 数据分析助手信息 ---"
                    context += analysis_context
                    context += "\n\n你可以使用这些数据集信息来回答用户的问题。"
            except Exception as e:
                logger.error(f"数据分析助手错误: {e}", exc_info=True)

        # 3. 构造消息队列
        sys_prompt = "你是一个全能智能助手。"
        if use_analysis:
            sys_prompt += "你具备数据分析能力，可以帮助用户查询、分析和理解数据。"
        
        if context:
            sys_prompt += f"\n\n以下是相关的上下文信息，请结合这些信息来回答用户的问题：\n{context}"

        messages = [{"role": "system", "content": sys_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": query})

        if provider == "online":
            return await cls._chat_online(messages, stream=True, api_config=api_config)
        else:
            return await cls._chat_local(messages, stream=True)

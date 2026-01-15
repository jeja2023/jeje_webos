"""
AI助手模块业务逻辑 Service
支持混合模式：本地 Llama-cpp 推理 + 在线 API (OpenAI 兼容格式)
支持多角色预设、知识库RAG、数据分析助手
"""

import os
import re
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
    
    # 角色预设定义（与前端AIPage.ROLE_PRESETS对应）
    # default=通用助手, coder=编程助手, writer=写作助手, translator=翻译助手, analyst=数据助手
    ROLE_PRESETS = {
        'default': '你是一个全能智能助手。',
        'coder': '你是一个专业的编程助手，擅长多种编程语言和框架。请提供清晰、高效、可维护的代码解决方案，并附带必要的代码注释。',
        'writer': '你是一个专业的写作助手，擅长各种文体风格。请帮助我创作、修改和改进文字内容，确保语言流畅、条理清晰。',
        'translator': '你是一个专业的翻译助手，精通中英双语翻译。请帮助我翻译文本，保持原文的语气和风格，同时确保译文自然通顺。',
        'analyst': '你是一个数据分析专家，擅长SQL、Python和数据可视化。请帮助我分析数据并提供深入的洞察和建议。'
    }
    
    # 默认模型
    DEFAULT_MODEL = "qwen2.5-coder-7b-instruct-q4_k_m.gguf"
    
    @classmethod
    def get_available_models(cls) -> List[str]:
        """获取可用的本地模型列表"""
        models_dir = cls.get_model_path("")
        if not os.path.exists(models_dir):
            return []
        return [f for f in os.listdir(models_dir) if f.endswith(".gguf")]
    
    @classmethod
    def get_model_path(cls, model_filename: str = "qwen2.5-coder-7b-instruct-q4_k_m.gguf") -> str:
        """获取本地模型绝对路径"""
        # 模型存放于 storage/modules/ai/ai_models/
        models_dir = storage_manager.get_module_dir("ai", "ai_models")
        if not model_filename:
            return str(models_dir)
        return str(models_dir / model_filename)

    # 记录加载失败的模型，避免重复尝试
    _failed_models = set()
    
    @classmethod
    def _get_llm(cls, model_filename: str) -> Llama:
        """获取或初始化本地模型实例"""
        # 检查是否已知加载失败的模型
        if model_filename in cls._failed_models:
            raise RuntimeError(f"模型 {model_filename} 之前加载失败，请检查模型文件或选择其他模型")
        
        if model_filename not in cls._model_instances:
            model_path = cls.get_model_path(model_filename)
            
            if not os.path.exists(model_path):
                logger.error(f"本地模型文件不存在: {model_path}")
                raise FileNotFoundError(f"模型文件不存在: {model_path}")
            
            # 检查文件大小（警告大模型）
            file_size_gb = os.path.getsize(model_path) / (1024 ** 3)
            if file_size_gb > 10:
                logger.warning(f"模型文件较大 ({file_size_gb:.1f}GB)，加载可能需要较长时间和大量内存")
            
            try:
                logger.info(f"正在加载本地模型: {model_path}...")
                cls._model_instances[model_filename] = Llama(
                    model_path=model_path,
                    n_ctx=2048,
                    n_threads=os.cpu_count(),
                    n_gpu_layers=0,
                    verbose=False
                )
                logger.info("本地模型加载完成")
            except Exception as e:
                # 记录失败的模型
                cls._failed_models.add(model_filename)
                error_msg = str(e)
                
                # 提供更友好的错误信息
                if "Failed to load model" in error_msg:
                    logger.error(f"模型加载失败: {model_filename}")
                    logger.error("可能原因: 1) 模型文件损坏 2) 内存不足 3) 模型格式不兼容")
                    raise RuntimeError(f"模型 {model_filename} 加载失败，可能是文件损坏、内存不足或格式不兼容。请尝试使用较小的模型。")
                else:
                    logger.error(f"模型加载失败: {error_msg}")
                    raise RuntimeError(f"模型加载失败: {error_msg}")
            
        return cls._model_instances[model_filename]

    @classmethod
    async def _chat_local(cls, messages: List[Dict[str, str]], stream: bool = True, model_name: Optional[str] = None) -> Any:
        """本地模型推理"""
        loop = asyncio.get_event_loop()

        # 获取可用模型列表（排除已知失败的模型）
        available = [m for m in cls.get_available_models() if m not in cls._failed_models]
        
        if not available:
            if cls._failed_models:
                raise RuntimeError(f"所有模型加载失败。失败的模型: {', '.join(cls._failed_models)}。请检查模型文件或下载新的模型。")
            else:
                raise FileNotFoundError("未找到可用的本地模型，请将.gguf模型文件放置到storage/modules/ai/ai_models/目录")

        # 使用指定的模型或默认模型
        if model_name and model_name in cls._failed_models:
            # 如果指定的模型已知失败，选择其他可用模型
            logger.warning(f"指定的模型 {model_name} 已知加载失败，尝试使用其他模型")
            model_name = None
        
        if not model_name:
            # 优先使用默认模型
            if cls.DEFAULT_MODEL in available:
                model_name = available[0] if cls.DEFAULT_MODEL in cls._failed_models else cls.DEFAULT_MODEL
            else:
                model_name = available[0]  # 使用第一个可用模型

        # 确保模型已加载 (在线程中加载以防阻塞)
        try:
            if model_name not in cls._model_instances:
                await loop.run_in_executor(None, cls._get_llm, model_name)
            llm = cls._get_llm(model_name)
        except Exception as e:
            # 如果加载失败，尝试其他可用模型
            logger.warning(f"模型 {model_name} 加载失败，尝试其他模型...")
            other_models = [m for m in available if m != model_name and m not in cls._failed_models]
            for fallback_model in other_models:
                try:
                    logger.info(f"尝试加载备选模型: {fallback_model}")
                    if fallback_model not in cls._model_instances:
                        await loop.run_in_executor(None, cls._get_llm, fallback_model)
                    llm = cls._get_llm(fallback_model)
                    model_name = fallback_model
                    break
                except Exception:
                    continue
            else:
                # 所有模型都失败了
                raise RuntimeError(f"无法加载任何本地模型。请检查模型文件或使用在线模式。原始错误: {e}")

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
    def _generate_sql_from_natural_language(cls, query: str, dataset, columns: List[str] = None) -> Optional[str]:
        """从自然语言生成SQL查询"""
        try:
            query_lower = query.lower()
            table_name = dataset.table_name
            
            # 默认选择所有列
            select_clause = "*"
            conditions = []
            limit_clause = ""
            order_clause = ""
            group_clause = ""
            
            # 如果有列信息，尝试更智能地匹配
            if columns:
                columns_lower = [c.lower() for c in columns]
                
                # 检测聚合函数需求
                if any(kw in query_lower for kw in ['总数', '数量', '计数', 'count', '多少']):
                    select_clause = "COUNT(*) as 数量"
                elif any(kw in query_lower for kw in ['平均', 'average', 'avg', '均值']):
                    # 找到数值类型的列
                    for col in columns:
                        if any(kw in col.lower() for kw in ['amount', 'price', 'count', 'num', 'qty', 'value', '金额', '数量', '价格']):
                            select_clause = f"AVG({col}) as 平均值"
                            break
                elif any(kw in query_lower for kw in ['总和', '合计', 'sum', '总计']):
                    for col in columns:
                        if any(kw in col.lower() for kw in ['amount', 'price', 'count', 'num', 'qty', 'value', '金额', '数量', '价格']):
                            select_clause = f"SUM({col}) as 总计"
                            break
                elif any(kw in query_lower for kw in ['最大', 'max', '最高']):
                    for col in columns:
                        if any(kw in col.lower() for kw in ['amount', 'price', 'count', 'num', 'qty', 'value', '金额', '数量', '价格']):
                            select_clause = f"MAX({col}) as 最大值, *"
                            order_clause = f" ORDER BY {col} DESC"
                            break
                elif any(kw in query_lower for kw in ['最小', 'min', '最低']):
                    for col in columns:
                        if any(kw in col.lower() for kw in ['amount', 'price', 'count', 'num', 'qty', 'value', '金额', '数量', '价格']):
                            select_clause = f"MIN({col}) as 最小值, *"
                            order_clause = f" ORDER BY {col} ASC"
                            break
                
                # 检测分组需求
                if any(kw in query_lower for kw in ['按', '分组', 'group', '每个', '各个']):
                    for col in columns:
                        col_lower = col.lower()
                        if any(kw in col_lower for kw in ['category', 'type', 'status', '类别', '类型', '状态', 'name', '名称']):
                            group_clause = f" GROUP BY {col}"
                            if select_clause == "*":
                                select_clause = f"{col}, COUNT(*) as 数量"
                            break
            
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
            
            # 检测排序（如果还没有设置）
            if not order_clause:
                if '最大' in query_lower or '最高' in query_lower or '最多' in query_lower:
                    order_clause = " ORDER BY 1 DESC"
                elif '最小' in query_lower or '最低' in query_lower or '最少' in query_lower:
                    order_clause = " ORDER BY 1 ASC"
                elif '最新' in query_lower or '最近' in query_lower:
                    if columns:
                        for col in columns:
                            if any(kw in col.lower() for kw in ['date', 'time', 'created', 'updated', '日期', '时间']):
                                order_clause = f" ORDER BY {col} DESC"
                                break
            
            # 组合SQL
            sql = f"SELECT {select_clause} FROM {table_name}"
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            if group_clause:
                sql += group_clause
            if order_clause:
                sql += order_clause
            sql += limit_clause
            
            return sql
        except Exception as e:
            logger.warning(f"生成SQL失败: {e}")
            return None

    @classmethod
    def _suggest_visualization(cls, query: str, columns: List[str] = None, data_sample: List[dict] = None) -> str:
        """根据查询和数据特征推荐可视化类型"""
        query_lower = query.lower()
        suggestions = []
        
        # 基于查询关键词的建议
        if any(kw in query_lower for kw in ['趋势', '变化', '时间', '历史', 'trend']):
            suggestions.append("📈 **折线图**：适合展示数据随时间的变化趋势")
        
        if any(kw in query_lower for kw in ['占比', '比例', '分布', '百分比', 'pie']):
            suggestions.append("🥧 **饼图**：适合展示各部分占总体的比例")
        
        if any(kw in query_lower for kw in ['对比', '比较', '排名', 'top', '前', 'compare']):
            suggestions.append("📊 **柱状图**：适合对比不同类别的数值大小")
        
        if any(kw in query_lower for kw in ['散点', '相关', '关系', 'scatter', 'correlation']):
            suggestions.append("⭕ **散点图**：适合分析两个变量之间的关系")
        
        if any(kw in query_lower for kw in ['热力', '矩阵', '热度', 'heatmap']):
            suggestions.append("🔥 **热力图**：适合展示多维度数据的强度分布")
        
        # 基于数据特征的建议
        if columns:
            has_date = any(kw in col.lower() for col in columns for kw in ['date', 'time', '日期', '时间'])
            has_category = any(kw in col.lower() for col in columns for kw in ['category', 'type', 'status', '类别', '类型'])
            has_numeric = any(kw in col.lower() for col in columns for kw in ['amount', 'price', 'count', '金额', '数量'])
            
            if has_date and has_numeric and not suggestions:
                suggestions.append("📈 **折线图**：检测到时间和数值字段，适合展示时间趋势")
            elif has_category and has_numeric and not suggestions:
                suggestions.append("📊 **柱状图**：检测到分类和数值字段，适合对比分析")
        
        if not suggestions:
            suggestions.append("📊 **柱状图**：通用的数据对比展示方式")
            suggestions.append("📈 **折线图**：如果数据有时间维度，可以尝试")
        
        return "\n".join(suggestions)

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
                elif any(kw in query_lower for kw in ['查询', '找出', '显示', '列出', '获取', '筛选', '过滤', '统计', '合计', '总数', '平均']) and 'select' not in query_lower:
                    # 尝试从问题中提取数据集信息
                    dataset_id_match = re.search(r'数据集[：:]?\s*(\d+)', query)
                    dataset_name_match = re.search(r'数据集[：:]?\s*([^\s，,。.]+)', query)
                    
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
                            try:
                                # 获取数据集的列信息
                                columns = []
                                try:
                                    col_result = await ModelingService.execute_sql(
                                        db, 
                                        f"SELECT * FROM {dataset.table_name} LIMIT 1",
                                        limit=1
                                    )
                                    columns = col_result.get('columns', [])
                                except:
                                    pass
                                
                                # 使用增强的SQL生成
                                sql_suggestion = cls._generate_sql_from_natural_language(query, dataset, columns)
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
                                            
                                            # 添加可视化建议
                                            viz_suggestion = cls._suggest_visualization(query, sql_result['columns'])
                                            context_parts.append(f"\n--- 可视化建议 ---")
                                            context_parts.append(viz_suggestion)
                                    except Exception as e:
                                        logger.warning(f"执行生成的SQL失败: {e}")
                                        context_parts.append(f"\nSQL生成建议: {sql_suggestion}")
                                        context_parts.append(f"执行失败: {str(e)}")
                            except Exception as e:
                                logger.warning(f"自然语言转SQL处理失败: {e}")
                
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
        role_preset: str = "default",  # 角色预设
        model_name: Optional[str] = None,  # 本地模型名称
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
        # 使用角色预设确定系统提示词
        sys_prompt = cls.ROLE_PRESETS.get(role_preset, cls.ROLE_PRESETS['default'])
        
        if use_analysis:
            sys_prompt += " 你具备数据分析能力，可以帮助用户查询、分析和理解数据。"
        
        if context:
            sys_prompt += f"\n\n以下是相关的上下文信息，请结合这些信息来回答用户的问题：\n{context}"

        messages = [{"role": "system", "content": sys_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": query})

        if provider == "online":
            return await cls._chat_online(messages, stream=True, api_config=api_config)
        else:
            return await cls._chat_local(messages, stream=True, model_name=model_name)

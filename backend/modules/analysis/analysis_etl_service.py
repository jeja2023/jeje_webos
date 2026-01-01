# -*- coding: utf-8 -*-
"""
ETL 算子执行服务
真实执行 ETL 算子逻辑，使用 DuckDB 进行数据处理
"""

from typing import List, Dict, Any, Optional
import logging
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset, AnalysisModel
from .analysis_duckdb_service import duckdb_instance

logger = logging.getLogger(__name__)


class ETLExecutionService:
    """ETL 节点执行服务"""
    
    # 临时表缓存 - 存储节点执行结果（内存缓存）
    _node_cache: Dict[str, pd.DataFrame] = {}
    
    # 磁盘缓存目录
    _cache_dir: Optional[str] = None
    
    @classmethod
    def _get_cache_dir(cls) -> str:
        """获取缓存目录路径"""
        if cls._cache_dir is None:
            import tempfile
            from pathlib import Path
            # 使用系统临时目录下的专用子目录
            cache_path = Path(tempfile.gettempdir()) / "jeje_etl_cache"
            cache_path.mkdir(parents=True, exist_ok=True)
            cls._cache_dir = str(cache_path)
            
            # 初始化时尝试清理过期缓存
            cls._cleanup_old_cache()
            
        return cls._cache_dir

    @classmethod
    def _cleanup_old_cache(cls):
        """清理超过24小时的旧缓存文件"""
        try:
            import time
            import os
            from pathlib import Path
            
            if not cls._cache_dir:
                return

            cache_path = Path(cls._cache_dir)
            if not cache_path.exists():
                return
                
            now = time.time()
            ttl = 24 * 3600  # 24小时
            
            deleted_count = 0
            for f in cache_path.glob("*.parquet"):
                try:
                    # 检查文件最后修改时间
                    if now - f.stat().st_mtime > ttl:
                        f.unlink()
                        deleted_count += 1
                except Exception:
                    pass
            
            if deleted_count > 0:
                logger.info(f"已自动清理 {deleted_count} 个过期的 ETL 缓存文件")
                
        except Exception as e:
            logger.warning(f"清理旧缓存失败: {e}")
    
    @classmethod
    def _get_cache_file_path(cls, key: str) -> str:
        """获取缓存文件路径"""
        import hashlib
        # 使用 MD5 哈希作为文件名，避免特殊字符问题
        file_hash = hashlib.md5(key.encode()).hexdigest()
        return f"{cls._get_cache_dir()}/{file_hash}.parquet"
    
    @classmethod
    def clear_cache(cls, model_id: Optional[int] = None):
        """清除缓存（内存 + 磁盘）"""
        import os
        from pathlib import Path
        
        if model_id:
            prefix = f"model_{model_id}_"
            # 清除内存缓存
            keys_to_remove = [k for k in cls._node_cache.keys() if k.startswith(prefix)]
            for k in keys_to_remove:
                del cls._node_cache[k]
                # 清除磁盘缓存
                cache_file = cls._get_cache_file_path(k)
                if os.path.exists(cache_file):
                    os.remove(cache_file)
        else:
            # 清空所有内存缓存
            cls._node_cache.clear()
            # 清空磁盘缓存目录
            cache_dir = Path(cls._get_cache_dir())
            if cache_dir.exists():
                for f in cache_dir.glob("*.parquet"):
                    f.unlink()
        logger.info(f"ETL 缓存已清除 (model_id={model_id})")
    
    @classmethod
    def get_cache_key(cls, model_id: int, node_id: str) -> str:
        """生成缓存 key"""
        return f"model_{model_id}_node_{node_id}"
    
    @classmethod
    def get_cached_result(cls, model_id: int, node_id: str) -> Optional[pd.DataFrame]:
        """获取缓存的节点结果（优先内存，其次磁盘）"""
        key = cls.get_cache_key(model_id, node_id)
        
        # 1. 检查内存缓存
        if key in cls._node_cache:
            return cls._node_cache[key]
        
        # 2. 检查磁盘缓存
        cache_file = cls._get_cache_file_path(key)
        try:
            import os
            if os.path.exists(cache_file):
                df = pd.read_parquet(cache_file)
                # 加载到内存缓存
                cls._node_cache[key] = df
                logger.debug(f"从磁盘加载缓存: {key}")
                return df
        except Exception as e:
            logger.warning(f"读取磁盘缓存失败: {e}")
        
        return None
    
    @classmethod
    def set_cached_result(cls, model_id: int, node_id: str, df: pd.DataFrame):
        """缓存节点结果（同时写入内存和磁盘）"""
        key = cls.get_cache_key(model_id, node_id)
        
        # 1. 写入内存缓存
        cls._node_cache[key] = df
        
        # 2. 异步写入磁盘缓存（使用 Parquet 格式，高效且支持大文件）
        try:
            cache_file = cls._get_cache_file_path(key)
            df.to_parquet(cache_file, index=False)
            logger.debug(f"节点结果已持久化: {key}")
        except Exception as e:
            logger.warning(f"磁盘缓存写入失败: {e}")
        
        logger.info(f"节点结果已缓存: {key}, 行数: {len(df)}")
    
    @classmethod
    async def execute_model(cls, db: AsyncSession, model_id: int) -> Dict[str, Any]:
        """执行整个模型 (运行所有输出节点)"""
        from .analysis_modeling_service import ModelingService
        model = await ModelingService.get_model(db, model_id)
        
        if not model.graph_config or "nodes" not in model.graph_config:
            raise ValueError("模型配置为空")
            
        nodes = model.graph_config["nodes"]
        # 找到所有 Sink 节点
        sink_nodes = [n for n in nodes if n.get("type") == "sink"]
        
        if not sink_nodes:
            raise ValueError("模型中没有定义输出(Sink)节点，无法执行")
            
        results = []
        for node in sink_nodes:
            # 复用 execute_node 逻辑
            res = await cls.execute_node(db, model_id, node, model.graph_config)
            results.append({
                "node_id": node.get("id"),
                "node_label": node.get("data", {}).get("label", "输出节点"),
                "success": res.get("success", False),
                "message": res.get("message", "")
            })
            
        success_count = sum(1 for r in results if r["success"])
        return {
            "total": len(sink_nodes),
            "success": success_count,
            "details": results
        }

    @classmethod
    async def execute_node(
        cls,
        db: AsyncSession,
        model_id: int,
        node: Dict[str, Any],
        graph_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        执行单个节点
        
        Args:
            db: 数据库会话
            model_id: 模型ID
            node: 节点配置
            graph_config: 完整的图配置（包含所有节点和连线）
            
        Returns:
            执行结果，包含数据预览
        """
        node_id = node.get('id')
        node_type = node.get('type')
        node_data = node.get('data', {})
        nodes = graph_config.get('nodes', [])
        connections = graph_config.get('connections', [])
        
        logger.info(f"开始执行节点: {node_id} (类型: {node_type})")
        
        try:
            # 获取上游数据
            upstream_df = await cls._get_upstream_data(
                db, model_id, node_id, nodes, connections
            )
            
            # 根据节点类型执行不同的逻辑
            result_df = await cls._process_node(
                db, node_type, node_data, upstream_df, nodes, connections
            )
            
            # 缓存结果
            cls.set_cached_result(model_id, node_id, result_df)
            
            # 返回预览数据
            preview_rows = min(50, len(result_df))
            preview_df = result_df.head(preview_rows)
            
            # 处理特殊值
            preview_data = cls._df_to_records(preview_df)
            
            return {
                "success": True,
                "node_id": node_id,
                "node_type": node_type,
                "row_count": len(result_df),
                "column_count": len(result_df.columns),
                "columns": result_df.columns.tolist(),
                "preview": preview_data,
                "preview_count": preview_rows
            }
            
        except Exception as e:
            logger.error(f"节点 {node_id} 执行失败: {e}")
            return {
                "success": False,
                "node_id": node_id,
                "node_type": node_type,
                "error": str(e)
            }
    
    @classmethod
    async def _get_upstream_data(
        cls,
        db: AsyncSession,
        model_id: int,
        node_id: str,
        nodes: List[Dict],
        connections: List[Dict]
    ) -> pd.DataFrame:
        """获取上游节点的数据"""
        # 找到连接到当前节点的上游连线
        upstream_conn = None
        for conn in connections:
            if conn.get('targetId') == node_id:
                upstream_conn = conn
                break
        
        if not upstream_conn:
            # 没有上游，返回空 DataFrame
            return pd.DataFrame()
        
        # 找到上游节点
        source_id = upstream_conn.get('sourceId')
        
        # 检查是否有缓存
        cached = cls.get_cached_result(model_id, source_id)
        if cached is not None:
            logger.info(f"使用缓存的上游数据: {source_id}")
            return cached.copy()
        
        # 如果没有缓存，需要执行上游节点
        # 找到上游节点配置
        upstream_node = None
        for n in nodes:
            if n.get('id') == source_id:
                upstream_node = n
                break
        
        if not upstream_node:
            raise ValueError(f"找不到上游节点: {source_id}")
        
        # 递归执行上游节点
        result = await cls.execute_node(
            db, model_id, upstream_node, {'nodes': nodes, 'connections': connections}
        )
        
        if not result.get('success'):
            raise ValueError(f"上游节点执行失败: {result.get('error')}")
        
        # 从缓存获取结果
        return cls.get_cached_result(model_id, source_id).copy()
    
    @classmethod
    async def _process_node(
        cls,
        db: AsyncSession,
        node_type: str,
        node_data: Dict[str, Any],
        upstream_df: pd.DataFrame,
        nodes: List[Dict],
        connections: List[Dict]
    ) -> pd.DataFrame:
        """根据节点类型处理数据"""
        
        # 首先处理输出字段筛选（如果配置了）
        output_columns = node_data.get('outputColumns', '')
        
        if node_type == 'source':
            result = await cls._execute_source(db, node_data)
        elif node_type == 'sink':
            result = await cls._execute_sink(db, upstream_df, node_data)
        elif node_type == 'filter':
            result = cls._execute_filter(upstream_df, node_data)
        elif node_type == 'select':
            result = cls._execute_select(upstream_df, node_data)
        elif node_type == 'distinct':
            result = cls._execute_distinct(upstream_df, node_data)
        elif node_type == 'sample':
            result = cls._execute_sample(upstream_df, node_data)
        elif node_type == 'limit':
            result = cls._execute_limit(upstream_df, node_data)
        elif node_type == 'sort':
            result = cls._execute_sort(upstream_df, node_data)
        elif node_type == 'group':
            result = cls._execute_group(upstream_df, node_data)
        elif node_type == 'calculate':
            result = cls._execute_calculate(upstream_df, node_data)
        elif node_type == 'rename':
            result = cls._execute_rename(upstream_df, node_data)
        elif node_type == 'fillna':
            result = cls._execute_fillna(upstream_df, node_data)
        elif node_type == 'clean':
            result = cls._execute_clean(upstream_df, node_data)
        elif node_type == 'typecast':
            result = cls._execute_typecast(upstream_df, node_data)
        elif node_type == 'split':
            result = cls._execute_split(upstream_df, node_data)
        elif node_type == 'join':
            result = await cls._execute_join(db, upstream_df, node_data)
        elif node_type == 'union':
            result = await cls._execute_union(db, upstream_df, node_data)
        elif node_type == 'pivot':
            result = cls._execute_pivot(upstream_df, node_data)
        elif node_type == 'text_ops':
            result = cls._execute_text_ops(upstream_df, node_data)
        elif node_type == 'math_ops':
            result = cls._execute_math_ops(upstream_df, node_data)
        elif node_type == 'window':
            result = cls._execute_window(upstream_df, node_data)
        elif node_type == 'sql':
            result = cls._execute_sql(upstream_df, node_data)
        else:
            logger.warning(f"未知的节点类型: {node_type}, 透传数据")
            result = upstream_df
        
        # 应用输出字段筛选（除了 sink 节点，因为 sink 有自己的保存逻辑）
        if output_columns and node_type != 'sink':
            result = cls._apply_output_columns(result, output_columns)
        
        return result
    
    @classmethod
    def _apply_output_columns(cls, df: pd.DataFrame, output_columns: str) -> pd.DataFrame:
        """应用输出字段筛选"""
        if not output_columns:
            return df
        
        if isinstance(output_columns, str):
            cols = [c.strip() for c in output_columns.split(',') if c.strip()]
        else:
            cols = output_columns
        
        valid_cols = [c for c in cols if c in df.columns]
        if valid_cols:
            return df[valid_cols].copy()
        return df
    
    # ============ 算子实现 ============
    
    @classmethod
    async def _execute_source(cls, db: AsyncSession, node_data: Dict) -> pd.DataFrame:
        """执行数据源节点"""
        table_name = node_data.get('table')
        if not table_name:
            raise ValueError("未配置数据源表名")
        
        # 从数据集中查找表名
        result = await db.execute(
            select(AnalysisDataset).where(AnalysisDataset.name == table_name)
        )
        dataset = result.scalar_one_or_none()
        
        if not dataset:
            raise ValueError(f"数据集不存在: {table_name}")
        
        # 从 DuckDB 读取数据
        df = duckdb_instance.fetch_df(f"SELECT * FROM {dataset.table_name}")
        logger.info(f"Source 节点读取数据: {dataset.table_name}, 行数: {len(df)}")
        return df
    
    @classmethod
    async def _execute_sink(cls, db: AsyncSession, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行输出节点 - 持久化保存数据"""
        target_name = node_data.get('target', '')
        mode = node_data.get('mode', 'overwrite')
        
        if not target_name:
            # 未配置目标表，仅透传数据
            logger.info("Sink 节点: 未配置目标表，仅透传数据")
            return df
        
        # 生成内部表名
        import time
        table_name = f"etl_result_{target_name}_{int(time.time())}"
        
        try:
            # 检查是否已存在同名数据集
            result = await db.execute(
                select(AnalysisDataset).where(AnalysisDataset.name == target_name)
            )
            existing_dataset = result.scalar_one_or_none()
            
            if existing_dataset:
                if mode == 'overwrite':
                    # 覆盖模式：删除旧表，使用新表名
                    try:
                        duckdb_instance.conn.execute(f"DROP TABLE IF EXISTS {existing_dataset.table_name}")
                    except:
                        pass
                    # 更新现有记录
                    existing_dataset.table_name = table_name
                    existing_dataset.row_count = len(df)
                    
                    # 创建新表
                    duckdb_instance.conn.register('_temp_sink_df', df)
                    duckdb_instance.conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _temp_sink_df")
                    duckdb_instance.conn.unregister('_temp_sink_df')
                    
                    await db.commit()
                    logger.info(f"Sink 节点: 覆盖保存到 {target_name}, 行数: {len(df)}")
                else:
                    # 追加模式：向现有表追加数据
                    duckdb_instance.conn.register('_temp_sink_df', df)
                    duckdb_instance.conn.execute(f"INSERT INTO {existing_dataset.table_name} SELECT * FROM _temp_sink_df")
                    duckdb_instance.conn.unregister('_temp_sink_df')
                    
                    # 更新行数
                    count_result = duckdb_instance.conn.execute(f"SELECT COUNT(*) FROM {existing_dataset.table_name}").fetchone()
                    existing_dataset.row_count = count_result[0] if count_result else len(df)
                    
                    await db.commit()
                    logger.info(f"Sink 节点: 追加数据到 {target_name}, 新增行数: {len(df)}")
            else:
                # 创建新数据集
                duckdb_instance.conn.register('_temp_sink_df', df)
                duckdb_instance.conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _temp_sink_df")
                duckdb_instance.conn.unregister('_temp_sink_df')
                
                # 注册到数据集表
                new_dataset = AnalysisDataset(
                    name=target_name,
                    source_type="etl",
                    table_name=table_name,
                    row_count=len(df),
                    config={"mode": mode}
                )
                db.add(new_dataset)
                await db.commit()
                logger.info(f"Sink 节点: 创建新数据集 {target_name}, 行数: {len(df)}")
            
            return df
            
        except Exception as e:
            logger.error(f"Sink 节点保存失败: {e}")
            raise ValueError(f"保存失败: {str(e)}")
    
    @classmethod
    def _get_filter_mask(cls, df: pd.DataFrame, field: str, operator: str, value: Any) -> pd.Series:
        """计算单个过滤条件的 mask"""
        if field not in df.columns:
            # 字段不存在时，为了不报错且起到过滤作用，返回全 False (或者报错，这里选择宽容处理但记录日志)
            logger.warning(f"Filter field not found: {field}")
            return pd.Series([False] * len(df), index=df.index)

        # 尝试将 value 转换为数字
        try:
            float(value)
            is_numeric_val = True
            numeric_value = float(value)
        except (ValueError, TypeError):
            is_numeric_val = False
            numeric_value = 0

        mask = None

        # 标准比较符
        if operator == '=' or operator == '==':
            if is_numeric_val:
                # 尝试将列也转为数字比较
                mask = pd.to_numeric(df[field], errors='coerce') == numeric_value
            else:
                mask = df[field].astype(str) == str(value)
        elif operator == '>':
            mask = pd.to_numeric(df[field], errors='coerce') > numeric_value
        elif operator == '<':
            mask = pd.to_numeric(df[field], errors='coerce') < numeric_value
        elif operator == '>=':
            mask = pd.to_numeric(df[field], errors='coerce') >= numeric_value
        elif operator == '<=':
            mask = pd.to_numeric(df[field], errors='coerce') <= numeric_value
        elif operator == '!=' or operator == '<>':
            if is_numeric_val:
                mask = pd.to_numeric(df[field], errors='coerce') != numeric_value
            else:
                mask = df[field].astype(str) != str(value)
        
        # 字符串操作
        elif operator == 'contains' or operator.upper() == 'LIKE' or operator == '包含':
            mask = df[field].astype(str).str.contains(str(value), case=False, na=False)
        elif operator == 'not_contains' or operator == '不包含':
            mask = ~df[field].astype(str).str.contains(str(value), case=False, na=False)
        elif operator == 'start_with' or operator == '开始于':
            mask = df[field].astype(str).str.startswith(str(value), na=False)
        elif operator == 'end_with' or operator == '结束于':
            mask = df[field].astype(str).str.endswith(str(value), na=False)
        
        # 空值检查
        elif operator == 'is_null' or operator == '为空':
            mask = df[field].isnull()
        elif operator == 'not_null' or operator == '不为空':
            mask = df[field].notnull()
        elif operator == 'is_empty' or operator == '为空字符':
            mask = (df[field].isnull()) | (df[field].astype(str).str.strip() == '')
        elif operator == 'not_empty' or operator == '不为空字符':
            mask = (df[field].notnull()) & (df[field].astype(str).str.strip() != '')
        
        else:
            # 未知操作符，默认不筛选
            return pd.Series([True] * len(df), index=df.index)
            
        return mask

    @classmethod
    def _execute_filter(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行过滤节点 (支持多条件)"""
        conditions = node_data.get('conditions')
        
        # 兼容旧版单条件格式
        if not conditions:
            field = node_data.get('field')
            operator = node_data.get('operator')
            value = node_data.get('value')
            if field and operator:
                conditions = [{'field': field, 'operator': operator, 'value': value, 'join': 'AND'}]
            else:
                return df
        
        final_mask = None
        
        for cond in conditions:
            field = cond.get('field')
            operator = cond.get('operator')
            value = cond.get('value')
            join = cond.get('join', 'AND').upper()
            
            if not field or not operator:
                continue
                
            sub_mask = cls._get_filter_mask(df, field, operator, value)
            
            if final_mask is None:
                final_mask = sub_mask
            else:
                if join == 'OR':
                    final_mask = final_mask | sub_mask
                else:
                    final_mask = final_mask & sub_mask
                    
        if final_mask is not None:
            result = df[final_mask].copy()
            logger.info(f"Filter 节点 ({len(conditions)} conditions), 结果: {len(result)}")
            return result
            
        return df
    
    @classmethod
    def _execute_select(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行字段选择节点"""
        columns = node_data.get('columns', '')
        
        if not columns:
            return df
        
        if isinstance(columns, str):
            cols = [c.strip() for c in columns.split(',') if c.strip()]
        else:
            cols = columns
        
        # 只保留存在的列
        valid_cols = [c for c in cols if c in df.columns]
        
        if not valid_cols:
            raise ValueError(f"所有选择的字段都不存在")
        
        result = df[valid_cols].copy()
        logger.info(f"Select 节点: 保留列 {valid_cols}")
        return result
    
    @classmethod
    def _execute_distinct(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行去重节点"""
        columns = node_data.get('columns', '')
        
        if columns:
            if isinstance(columns, str):
                cols = [c.strip() for c in columns.split(',') if c.strip()]
            else:
                cols = columns
            valid_cols = [c for c in cols if c in df.columns]
            if valid_cols:
                result = df.drop_duplicates(subset=valid_cols).copy()
            else:
                result = df.drop_duplicates().copy()
        else:
            result = df.drop_duplicates().copy()
        
        logger.info(f"Distinct 节点: 去重后行数 {len(result)}")
        return result
    
    @classmethod
    def _execute_sample(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行采样节点"""
        rate = node_data.get('rate', 100)
        
        try:
            rate = max(1, min(100, int(rate)))
        except:
            rate = 100
        
        frac = rate / 100
        result = df.sample(frac=frac, random_state=42).copy()
        logger.info(f"Sample 节点: {rate}%, 结果行数: {len(result)}")
        return result
    
    @classmethod
    def _execute_limit(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行限制行数节点"""
        count = node_data.get('count', 100)
        
        try:
            count = max(1, int(count))
        except:
            count = 100
        
        result = df.head(count).copy()
        logger.info(f"Limit 节点: 取前 {count} 行")
        return result
    
    @classmethod
    def _execute_sort(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行排序节点"""
        order_by = node_data.get('orderBy', '')
        direction = node_data.get('direction', 'ASC')
        
        if not order_by:
            return df
        
        if order_by not in df.columns:
            raise ValueError(f"排序字段不存在: {order_by}")
        
        ascending = direction.upper() != 'DESC'
        result = df.sort_values(by=order_by, ascending=ascending).copy()
        logger.info(f"Sort 节点: 按 {order_by} {direction}")
        return result
    
    @classmethod
    def _execute_group(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行分组聚合节点"""
        group_by = node_data.get('groupBy', '')
        agg_func = node_data.get('aggFunc', 'COUNT')
        agg_col = node_data.get('aggCol', '')
        
        if not group_by:
            raise ValueError("未配置分组字段")
        
        if isinstance(group_by, str):
            group_cols = [c.strip() for c in group_by.split(',') if c.strip()]
        else:
            group_cols = group_by
        
        valid_group_cols = [c for c in group_cols if c in df.columns]
        if not valid_group_cols:
            raise ValueError("分组字段不存在")
        
        grouped = df.groupby(valid_group_cols)
        
        if agg_func == 'COUNT':
            result = grouped.size().reset_index(name='count')
        elif agg_func in ['SUM', 'AVG', 'MAX', 'MIN'] and agg_col:
            if agg_col not in df.columns:
                raise ValueError(f"聚合列不存在: {agg_col}")
            
            func_map = {'SUM': 'sum', 'AVG': 'mean', 'MAX': 'max', 'MIN': 'min'}
            agg_result = grouped[agg_col].agg(func_map[agg_func])
            result = agg_result.reset_index(name=f'{agg_func.lower()}_{agg_col}')
        else:
            result = grouped.size().reset_index(name='count')
        
        logger.info(f"Group 节点: 按 {valid_group_cols} 分组, {agg_func}")
        return result
    
    @classmethod
    def _execute_calculate(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行计算列节点"""
        new_column = node_data.get('newColumn', '')
        field_a = node_data.get('fieldA', '')
        op = node_data.get('op', '+')
        value = node_data.get('value', '0')
        
        if not new_column or not field_a:
            return df
        
        if field_a not in df.columns:
            raise ValueError(f"字段不存在: {field_a}")
        
        result = df.copy()
        col_a = pd.to_numeric(result[field_a], errors='coerce').fillna(0)
        
        # value 可能是字段名或数字
        if value in df.columns:
            col_b = pd.to_numeric(result[value], errors='coerce').fillna(0)
        else:
            try:
                col_b = float(value)
            except:
                col_b = 0
        
        if op == '+':
            result[new_column] = col_a + col_b
        elif op == '-':
            result[new_column] = col_a - col_b
        elif op == '*':
            result[new_column] = col_a * col_b
        elif op == '/':
            result[new_column] = col_a / col_b.replace(0, np.nan)
        
        logger.info(f"Calculate 节点: {new_column} = {field_a} {op} {value}")
        return result
    
    @classmethod
    def _execute_rename(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行重命名节点"""
        old_col = node_data.get('oldCol', '')
        new_col = node_data.get('newCol', '')
        
        if not old_col or not new_col:
            return df
        
        if old_col not in df.columns:
            raise ValueError(f"字段不存在: {old_col}")
        
        result = df.rename(columns={old_col: new_col}).copy()
        logger.info(f"Rename 节点: {old_col} -> {new_col}")
        return result
    
    @classmethod
    def _execute_fillna(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行空值填充节点"""
        target_col = node_data.get('targetCol', '')
        fill_value = node_data.get('fillValue', '')
        
        result = df.copy()
        
        if target_col:
            if target_col not in df.columns:
                raise ValueError(f"字段不存在: {target_col}")
            result[target_col] = result[target_col].fillna(fill_value)
        else:
            # 填充所有列
            result = result.fillna(fill_value)
        
        logger.info(f"Fillna 节点: 填充 {target_col or '所有列'} 为 {fill_value}")
        return result
    
    @classmethod
    def _execute_clean(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行清洗节点"""
        mode = node_data.get('mode', 'drop_na')
        
        result = df.copy()
        
        if mode == 'drop_na':
            result = result.dropna()
        elif mode == 'drop_duplicates':
            result = result.drop_duplicates()
        
        logger.info(f"Clean 节点: {mode}, 结果行数: {len(result)}")
        return result
    
    @classmethod
    def _execute_typecast(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行类型转换节点"""
        column = node_data.get('column', '')
        cast_type = node_data.get('castType', '')
        
        if not column or not cast_type:
            return df
        
        if column not in df.columns:
            raise ValueError(f"字段不存在: {column}")
        
        result = df.copy()
        
        type_map = {
            'INTEGER': 'int64',
            'DOUBLE': 'float64',
            'VARCHAR': 'str',
            'STRING': 'str',
            'BOOLEAN': 'bool',
            'DATE': 'datetime64[ns]',
            'TIMESTAMP': 'datetime64[ns]'
        }
        
        target_type = type_map.get(cast_type, 'str')
        
        try:
            if target_type in ['datetime64[ns]']:
                result[column] = pd.to_datetime(result[column], errors='coerce')
            elif target_type == 'int64':
                result[column] = pd.to_numeric(result[column], errors='coerce').fillna(0).astype(int)
            elif target_type == 'float64':
                result[column] = pd.to_numeric(result[column], errors='coerce')
            elif target_type == 'bool':
                result[column] = result[column].astype(bool)
            else:
                result[column] = result[column].astype(str)
        except Exception as e:
            logger.warning(f"类型转换失败: {e}")
        
        logger.info(f"Typecast 节点: {column} -> {cast_type}")
        return result
    
    @classmethod
    def _execute_split(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行字段拆分节点"""
        source_col = node_data.get('sourceCol', '')
        separator = node_data.get('separator', ',')
        limit = node_data.get('limit', 2)
        
        if not source_col:
            return df
        
        if source_col not in df.columns:
            raise ValueError(f"字段不存在: {source_col}")
        
        try:
            limit = max(1, int(limit))
        except:
            limit = 2
        
        result = df.copy()
        
        # 拆分列
        split_df = result[source_col].astype(str).str.split(separator, n=limit-1, expand=True)
        
        for i in range(min(limit, split_df.shape[1])):
            result[f"{source_col}_{i+1}"] = split_df[i]
        
        logger.info(f"Split 节点: {source_col} 按 '{separator}' 拆分为 {limit} 列")
        return result
    
    @classmethod
    async def _execute_join(cls, db: AsyncSession, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行关联节点 (DuckDB Pushdown 优化版)"""
        import uuid
        join_table = node_data.get('joinTable', '')
        join_type = node_data.get('joinType', 'inner')
        left_on = node_data.get('leftOn', '')
        right_on = node_data.get('rightOn', '')
        
        if not join_table or not left_on or not right_on:
            raise ValueError("关联配置不完整")
        
        # 获取右表信息
        result = await db.execute(
            select(AnalysisDataset).where(AnalysisDataset.name == join_table)
        )
        dataset = result.scalar_one_or_none()
        
        if not dataset:
            raise ValueError(f"关联数据集不存在: {join_table}")
        
        # 映射 Join 类型
        type_map = {
            'inner': 'INNER',
            'left': 'LEFT',
            'right': 'RIGHT',
            'full': 'FULL',
            'outer': 'FULL'
        }
        sql_join_type = type_map.get(join_type.lower(), 'INNER')
        
        # 注册左表为临时视图
        temp_left_name = f"temp_join_left_{uuid.uuid4().hex[:8]}"
        duckdb_instance.conn.register(temp_left_name, df)
        
        try:
            # 构建 SQL 查询
            # 注意：DuckDB 会自动处理同名列（通常添加后缀或保留）
            # 使用双引号包裹列名以处理特殊字符
            sql = f"""
                SELECT * 
                FROM {temp_left_name} t1
                {sql_join_type} JOIN {dataset.table_name} t2
                ON t1."{left_on}" = t2."{right_on}"
            """
            
            logger.info(f"Join 节点 (SQL Pushdown): {sql_join_type} JOIN {join_table}")
            result_df = duckdb_instance.fetch_df(sql)
            return result_df
            
        except Exception as e:
            logger.error(f"Join 执行失败: {e}")
            # 回退到 Pandas 模式（防止 SQL 兼容性问题）
            logger.info("回退到 Pandas 内存 Join 模式")
            right_df = duckdb_instance.fetch_df(f"SELECT * FROM {dataset.table_name}")
            how_map = {'inner': 'inner', 'left': 'left', 'right': 'right', 'full': 'outer', 'outer': 'outer'}
            return df.merge(right_df, left_on=left_on, right_on=right_on, how=how_map.get(join_type, 'inner'))
            
        finally:
            try:
                duckdb_instance.conn.unregister(temp_left_name)
            except:
                pass
    
    @classmethod
    async def _execute_union(cls, db: AsyncSession, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行合并节点"""
        union_table = node_data.get('tables', '')
        union_mode = node_data.get('unionMode', 'ALL')
        
        if not union_table:
            raise ValueError("未配置合并表")
        
        # 获取另一个表数据
        result = await db.execute(
            select(AnalysisDataset).where(AnalysisDataset.name == union_table)
        )
        dataset = result.scalar_one_or_none()
        
        if not dataset:
            raise ValueError(f"合并数据集不存在: {union_table}")
        
        other_df = duckdb_instance.fetch_df(f"SELECT * FROM {dataset.table_name}")
        
        # 执行合并
        result = pd.concat([df, other_df], ignore_index=True)
        
        if union_mode == 'DISTINCT':
            result = result.drop_duplicates()
        
        logger.info(f"Union 节点: {union_mode}, 结果行数: {len(result)}")
        return result
    
    @classmethod
    def _execute_pivot(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行透视节点"""
        index = node_data.get('index', '')
        columns = node_data.get('columns', '')
        values = node_data.get('values', '')
        agg_func_str = node_data.get('aggFunc', 'SUM').upper()
        
        if not index or not columns or not values:
            raise ValueError("透视配置不完整")
        
        if index not in df.columns or columns not in df.columns or values not in df.columns:
            raise ValueError("透视字段不存在")
            
        func_map = {'SUM': 'sum', 'AVG': 'mean', 'COUNT': 'count', 'MAX': 'max', 'MIN': 'min'}
        agg_func = func_map.get(agg_func_str, 'sum')
        
        result = df.pivot_table(index=index, columns=columns, values=values, aggfunc=agg_func)
        result = result.reset_index()
        
        logger.info(f"Pivot 节点: index={index}, columns={columns}, values={values}, agg={agg_func}")
        return result
    
    @classmethod
    def _execute_sql(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行 SQL 节点"""
        query = node_data.get('query', '')
        
        if not query:
            return df
        
        # 将输入数据注册为临时表 'input'
        duckdb_instance.conn.register('input', df)
        
        try:
            result = duckdb_instance.fetch_df(query)
            logger.info(f"SQL 节点执行成功, 结果行数: {len(result)}")
            return result
        finally:
            # 清理临时表
            try:
                duckdb_instance.conn.unregister('input')
            except:
                pass
    
    @classmethod
    def _execute_text_ops(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行文本处理节点"""
        target_col = node_data.get('targetCol', '')
        func = node_data.get('func', 'UPPER')
        new_col = node_data.get('newCol', '')
        
        if not target_col:
            return df
        
        if target_col not in df.columns:
            raise ValueError(f"字段不存在: {target_col}")
        
        # 如果未指定新字段名，覆盖原字段
        result_col_name = new_col if new_col else target_col
        
        result = df.copy()
        series = result[target_col].astype(str)
        
        if func == 'UPPER':
            result[result_col_name] = series.str.upper()
        elif func == 'LOWER':
            result[result_col_name] = series.str.lower()
        elif func == 'TRIM':
            result[result_col_name] = series.str.strip()
        elif func == 'LENGTH':
            result[result_col_name] = series.str.len()
        elif func == 'REVERSE':
            result[result_col_name] = series.apply(lambda x: x[::-1] if isinstance(x, str) else x)
            
        logger.info(f"TextOps 节点: {target_col} -> {func} -> {result_col_name}")
        return result

    @classmethod
    def _execute_math_ops(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行数学运算节点"""
        field_a = node_data.get('fieldA', '')
        op = node_data.get('op', '+')
        value = node_data.get('value', '0')
        new_col = node_data.get('newCol', '')
        
        if not field_a or not new_col:
            return df
            
        if field_a not in df.columns:
            raise ValueError(f"字段不存在: {field_a}")
            
        result = df.copy()
        
        # 尝试将输入转为数字
        col_a = pd.to_numeric(result[field_a], errors='coerce').fillna(0)
        
        # 处理操作数 B (可能是字段或常量)
        if value in df.columns:
            col_b = pd.to_numeric(result[value], errors='coerce').fillna(0)
        else:
            try:
                col_b = float(value)
            except:
                col_b = 0
                
        if op == '+':
            result[new_col] = col_a + col_b
        elif op == '-':
            result[new_col] = col_a - col_b
        elif op == '*':
            result[new_col] = col_a * col_b
        elif op == '/':
            result[new_col] = col_a / col_b.replace(0, np.nan) # 防止除零
        elif op == '%':
            result[new_col] = col_a % col_b.replace(0, np.nan)
            
        logger.info(f"MathOps 节点: {new_col} = {field_a} {op} {value}")
        return result

    @classmethod
    def _execute_window(cls, df: pd.DataFrame, node_data: Dict) -> pd.DataFrame:
        """执行窗口函数节点 (Using DuckDB)"""
        import uuid
        func = node_data.get('func', 'ROW_NUMBER')
        partition_by = node_data.get('partitionBy', '')
        order_by = node_data.get('orderBy', '')
        new_col = node_data.get('newCol', '')
        
        if not new_col:
            raise ValueError("必须指定目标新字段名")
            
        # 注册临时表
        temp_name = f"temp_window_{uuid.uuid4().hex[:8]}"
        duckdb_instance.conn.register(temp_name, df)
        
        try:
            # 构建 OVER 子句
            over_parts = []
            if partition_by:
                # 兼容多字段
                parts = [f'"{p.strip()}"' for p in partition_by.split(',') if p.strip()]
                if parts:
                    over_parts.append(f"PARTITION BY {', '.join(parts)}")
            
            if order_by:
                orders = [f'"{o.strip()}"' for o in order_by.split(',') if o.strip()]
                if orders:
                    over_parts.append(f"ORDER BY {', '.join(orders)}")
            else:
                pass
                
            over_clause = f"OVER ({' '.join(over_parts)})"
            
            # 构建函数调用
            if func in ['LEAD', 'LAG']:
                # See thought above about LEAD/LAG args
                if not order_by:
                     raise ValueError(f"{func} 函数需要指定排序列(Order By)作为操作对象")
                target_col = order_by.split(',')[0].strip()
                func_call = f"{func}(\"{target_col}\", 1)"
            else:
                func_call = f"{func}()"
                
            sql = f"""
                SELECT *, {func_call} {over_clause} AS "{new_col}"
                FROM {temp_name}
            """
            
            logger.info(f"Window 节点 (SQL): {new_col} = {func} OVER(...)")
            return duckdb_instance.fetch_df(sql)
            
        finally:
            duckdb_instance.conn.unregister(temp_name)

    @classmethod
    def _df_to_records(cls, df: pd.DataFrame) -> List[Dict]:
        """将 DataFrame 转换为记录列表，处理特殊值"""
        # 处理 NaN, Inf 等特殊值
        df_clean = df.replace([np.inf, -np.inf], np.nan)
        
        # 处理时间类型
        for col in df_clean.select_dtypes(include=['datetime64', 'datetimetz']).columns:
            df_clean[col] = df_clean[col].astype(str).str.replace('T', ' ', regex=False)
        
        return df_clean.astype(object).where(pd.notnull(df_clean), None).to_dict(orient='records')

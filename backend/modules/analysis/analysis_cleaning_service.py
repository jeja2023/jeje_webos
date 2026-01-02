from typing import List, Dict, Any, Optional
import uuid
import logging
import pandas as pd
import numpy as np
import io
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset
from .analysis_duckdb_service import duckdb_instance

logger = logging.getLogger(__name__)

class CleaningService:
    @staticmethod
    async def get_dataset(db: AsyncSession, dataset_id: int) -> AnalysisDataset:
        """
        获取数据集
        
        Args:
            db: 数据库会话
            dataset_id: 数据集ID
        
        Returns:
            数据集对象
        
        Raises:
            ValueError: 如果数据集不存在
        """
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            raise ValueError("数据集不存在")
        return dataset

    @staticmethod
    def _perform_cleaning(df: pd.DataFrame, op: str, cols: List[str], params: Dict[str, Any], fill_value: Optional[str]) -> pd.DataFrame:
        """核心清洗逻辑"""
        # 执行清洗操作
        if op == "skip_rows":
            # 跳过前N行
            rows_to_skip = int(params.get("rows", 1))
            if rows_to_skip > 0 and rows_to_skip < len(df):
                df = df.iloc[rows_to_skip:].reset_index(drop=True)
        elif op == "use_row_as_header":
            # 将指定行作为标题
            header_row = int(params.get("header_row", 1)) - 1  # 转为0索引
            if 0 <= header_row < len(df):
                new_columns = df.iloc[header_row].astype(str).tolist()
                # 处理重复列名
                seen = {}
                for i, col in enumerate(new_columns):
                    if col in seen:
                        seen[col] += 1
                        new_columns[i] = f"{col}_{seen[col]}"
                    else:
                        seen[col] = 0
                df.columns = new_columns
                # 删除标题行及之前的所有行
                df = df.iloc[header_row + 1:].reset_index(drop=True)
        elif op == "drop_missing":
            df = df.dropna(subset=cols)
        elif op == "fill_missing":
            if fill_value is not None:
                # 尝试转为数字
                try:
                    val = float(fill_value)
                except:
                    val = fill_value
                df[cols] = df[cols].fillna(val)
            else:
                strategy = params.get("strategy", "constant")
                if strategy == "mean":
                    df[cols] = df[cols].fillna(df[cols].mean())
                elif strategy == "median":
                    df[cols] = df[cols].fillna(df[cols].median())
                elif strategy == "mode":
                    df[cols] = df[cols].fillna(df[cols].mode().iloc[0])
        elif op == "drop_duplicates":
            df = df.drop_duplicates(subset=cols)
        elif op == "trim_whitespace":
            for col in cols:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.strip()
        elif op == "to_lowercase":
            for col in cols:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.lower()
        elif op == "to_uppercase":
            for col in cols:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.upper()
        elif op == "replace_text":
            old_val = params.get("old_value", "")
            new_val = params.get("new_value", "")
            for col in cols:
                df[col] = df[col].astype(str).str.replace(old_val, new_val, regex=False)
        elif op == "format_datetime":
            target_fmt = params.get("format", "%Y-%m-%d %H:%M:%S")
            for col in cols:
                try:
                    # 先尝试转为时间类型再格式化
                    tmp_dt = pd.to_datetime(df[col], errors='coerce')
                    df[col] = tmp_dt.dt.strftime(target_fmt)
                except:
                    pass
        elif op == "round_numeric":
            decimals = int(params.get("decimals", 2))
            for col in cols:
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce').round(decimals)
                except:
                    pass
        elif op == "drop_empty_columns":
            # 删除所有值均为空的列
            df = df.dropna(axis=1, how='all')
        elif op == "rename_column":
            # 列重命名
            old_name = params.get("old_name", "")
            new_name = params.get("new_name", "")
            if old_name and new_name and old_name in df.columns:
                df = df.rename(columns={old_name: new_name})
        elif op == "drop_columns":
            # 删除指定列
            cols_to_drop = params.get("columns", [])
            if cols_to_drop:
                existing_cols = [c for c in cols_to_drop if c in df.columns]
                if existing_cols:
                    df = df.drop(columns=existing_cols)
        elif op == "convert_type":
            target_type = params.get("type", "string")
            for col in cols:
                if target_type == "numeric":
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                elif target_type == "datetime":
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                else:
                    df[col] = df[col].astype(str)
        else:
            raise ValueError(f"不支持的操作: {op}")
        return df

    @staticmethod
    async def apply_cleaning(db: AsyncSession, req: Any) -> Dict[str, Any]:
        """
        应用数据清洗操作（支持多个步骤）
        
        Args:
            db: 数据库会话
            req: 清洗请求对象（包含 dataset_id, operations, save_mode 等）
        
        Returns:
            清洗结果字典（包含 row_count, columns, preview 等）
        """
        dataset = await CleaningService.get_dataset(db, req.dataset_id)
        table_name = dataset.table_name
        
        # 将数据读入 DataFrame 进行清洗
        # 优化：如果是预览模式，只读取部分数据进行处理，极大提高响应速度
        if req.save_mode == "preview":
            # 读取前 1000 行用于预览
            df = duckdb_instance.fetch_df(f"SELECT * FROM {table_name} LIMIT 1000")
        else:
            # 完整模式，读取所有数据
            df = duckdb_instance.fetch_df(f"SELECT * FROM {table_name}")
        
        # 兼容单操作和多操作
        ops_list = []
        if hasattr(req, 'operations') and req.operations:
            ops_list = req.operations
        elif hasattr(req, 'operation') and req.operation:
            ops_list = [{
                "operation": req.operation,
                "columns": req.columns,
                "params": req.params or {},
                "fill_value": req.fill_value
            }]
            
        if not ops_list:
            raise ValueError("未指定任何清洗操作")

        # 按顺序执行所有操作
        applied_ops = []
        for op_item in ops_list:
            # 兼容模型对象或字典
            if not isinstance(op_item, dict):
                op_item = op_item.model_dump()
                
            curr_op = op_item.get("operation")
            curr_cols = op_item.get("columns") or df.columns.tolist()
            curr_params = op_item.get("params") or {}
            curr_fill = op_item.get("fill_value")
            
            df = CleaningService._perform_cleaning(df, curr_op, curr_cols, curr_params, curr_fill)
            applied_ops.append(curr_op)
        
        row_count = len(df)
        columns = df.columns.tolist()
        save_mode = req.save_mode
        
        # 仅预览模式
        if save_mode == "preview":
            # 处理时间列格式，仅替换 'T' 保证美观，不强制格式
            for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)
                
            # 处理 NaN/Inf 为 None，确保 JSON 兼容
            preview_df = df.head(100)
            preview_data = preview_df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(preview_df), None).to_dict(orient='records')
            return {
                "row_count": row_count,
                "columns": columns,
                "preview": preview_data,
                "saved": False
            }
        
        # 新建数据集 (save_mode == "new")
        new_table_name = f"dataset_{uuid.uuid4().hex[:8]}"
        
        # 修复点：显式注册 DataFrame 以确保 DuckDB 能够正确读取
        temp_name = f"df_{uuid.uuid4().hex[:8]}"
        duckdb_instance.conn.register(temp_name, df)
        duckdb_instance.conn.execute(f"CREATE TABLE {new_table_name} AS SELECT * FROM {temp_name}")
        duckdb_instance.conn.unregister(temp_name)
        
        # 根据操作类型生成描述性名称
        op_names = {
            "skip_rows": "跳行",
            "use_row_as_header": "设标题",
            "rename_column": "重命名",
            "drop_columns": "删列",
            "convert_type": "转类型",
            "drop_missing": "去空",
            "fill_missing": "填充",
            "drop_duplicates": "去重",
            "drop_empty_columns": "删全空列",
            "trim_whitespace": "修边",
            "to_lowercase": "小写",
            "to_uppercase": "大写",
            "replace_text": "替换",
            "format_datetime": "格式化",
            "round_numeric": "取整"
        }
        
        op_suffix = "_".join([op_names.get(o, "清洗") for o in applied_ops[:2]])
        if len(applied_ops) > 2:
            op_suffix += f"等{len(applied_ops)}项"
            
        new_name = f"{dataset.name}_{op_suffix}"
        
        new_dataset = AnalysisDataset(
            name=new_name,
            source_type=dataset.source_type,
            table_name=new_table_name,
            row_count=row_count,
            config=dataset.config.copy() if dataset.config else {}
        )
        db.add(new_dataset)
        await db.commit()
        await db.refresh(new_dataset)
        
        return {
            "id": new_dataset.id,
            "name": new_dataset.name,
            "row_count": row_count,
            "saved": True
        }

    @staticmethod
    async def export_cleaning(
        db: AsyncSession, 
        req: Any, 
        format: str = 'csv'
    ) -> io.BytesIO:
        """
        执行清洗并返回导出数据（支持 CSV、Excel、JSON）
        
        Args:
            db: 数据库会话
            req: 清洗请求对象
            format: 导出格式 ('csv', 'excel', 'json')
        
        Returns:
            导出数据的 BytesIO 对象
        """
        dataset = await CleaningService.get_dataset(db, req.dataset_id)
        table_name = dataset.table_name
        df = duckdb_instance.fetch_df(f"SELECT * FROM {table_name}")
        
        # 兼容多操作
        ops_list = []
        if hasattr(req, 'operations') and req.operations:
            ops_list = req.operations
        elif hasattr(req, 'operation') and req.operation:
            ops_list = [{
                "operation": req.operation,
                "columns": req.columns,
                "params": req.params or {},
                "fill_value": req.fill_value
            }]

        for op_item in ops_list:
            if not isinstance(op_item, dict):
                op_item = op_item.model_dump()
            curr_op = op_item.get("operation")
            curr_cols = op_item.get("columns") or df.columns.tolist()
            curr_params = op_item.get("params") or {}
            curr_fill = op_item.get("fill_value")
            df = CleaningService._perform_cleaning(df, curr_op, curr_cols, curr_params, curr_fill)
        
        output = io.BytesIO()
        
        if format == 'csv':
            df.to_csv(output, index=False, encoding='utf-8-sig')
        elif format == 'excel':
            try:
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    df.to_excel(writer, index=False, sheet_name='Sheet1')
            except ImportError:
                raise ValueError("Excel 导出需要安装 openpyxl: pip install openpyxl")
        elif format == 'json':
            # 处理日期时间类型
            for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)
            # 处理 NaN/Inf
            df = df.replace([np.inf, -np.inf], np.nan)
            json_str = df.to_json(orient='records', date_format='iso', force_ascii=False)
            output.write(json_str.encode('utf-8'))
        else:
            raise ValueError(f"不支持的导出格式: {format}")
        
        output.seek(0)
        return output

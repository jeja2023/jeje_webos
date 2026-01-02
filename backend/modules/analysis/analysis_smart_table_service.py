from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from .analysis_models import AnalysisSmartTable, AnalysisSmartTableData, AnalysisDataset
from .analysis_schemas import SmartTableCreate, SmartTableUpdate
from .analysis_duckdb_service import duckdb_instance
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)


def safe_eval_dataframe_formula(df, formula: str, allowed_columns: List[str]) -> Any:
    """
    安全地计算 DataFrame 公式表达式
    
    只允许：
    - 列名引用（使用反引号 `column_name`）
    - 基本数学运算符：+、-、*、/、%、括号
    - 数字常量
    
    不允许：
    - 函数调用
    - 变量访问
    - 其他危险操作
    
    Args:
        df: pandas DataFrame
        formula: 公式表达式，如 "`height` * `weight` / 100"
        allowed_columns: 允许的列名列表
    
    Returns:
        计算结果 Series
    """
    import pandas as pd
    import numpy as np
    
    # 1. 提取所有列引用（反引号内的内容）
    column_refs = re.findall(r'`([^`]+)`', formula)
    
    # 2. 验证所有列引用都在允许列表中
    for col_ref in column_refs:
        if col_ref not in allowed_columns:
            raise ValueError(f"不允许的列引用: {col_ref}")
        if col_ref not in df.columns:
            raise ValueError(f"列不存在: {col_ref}")
    
    # 3. 验证公式只包含允许的字符
    # 允许：列引用（反引号）、数字、运算符、括号、空格
    safe_pattern = r'^[`\w\s+\-*/().%]+$'
    if not re.match(safe_pattern, formula):
        raise ValueError(f"公式包含不允许的字符: {formula}")
    
    # 4. 替换列引用为实际的 Series
    # 按长度逆序替换，避免子串覆盖
    sorted_refs = sorted(set(column_refs), key=len, reverse=True)
    local_vars = {}
    for col_ref in sorted_refs:
        # 创建局部变量名（使用列名，但确保安全）
        var_name = f"col_{col_ref.replace(' ', '_').replace('-', '_')}"
        local_vars[var_name] = df[col_ref]
        # 替换公式中的列引用
        formula = formula.replace(f"`{col_ref}`", var_name)
    
    # 5. 验证替换后的公式只包含变量名、数字、运算符和括号
    # 变量名应该是 col_ 开头
    final_pattern = r'^[col_\w\s+\-*/().%]+$'
    if not re.match(final_pattern, formula):
        raise ValueError(f"公式验证失败: {formula}")
    
    # 6. 使用 pandas 的向量化操作计算
    try:
        # 使用 eval 但限制在局部变量范围内
        # 这里我们使用 pandas 的 eval，但已经验证了所有输入
        # 为了更安全，我们可以手动解析和计算
        result = pd.eval(formula, local_dict=local_vars, global_dict={})
        return result
    except Exception as e:
        logger.warning(f"公式计算失败: {formula}, 错误: {e}")
        raise ValueError(f"公式计算失败: {str(e)}")


class SmartTableService:
    @staticmethod
    async def get_tables(db: AsyncSession) -> List[AnalysisSmartTable]:
        res = await db.execute(select(AnalysisSmartTable).order_by(AnalysisSmartTable.created_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def get_table_by_id(db: AsyncSession, table_id: int) -> Optional[AnalysisSmartTable]:
        """获取单个智能表格"""
        result = await db.execute(select(AnalysisSmartTable).where(AnalysisSmartTable.id == table_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def create_table(db: AsyncSession, data: SmartTableCreate) -> AnalysisSmartTable:
        table = AnalysisSmartTable(
            name=data.name,
            fields=data.fields,
            config=data.config
        )
        db.add(table)
        await db.commit()
        await db.refresh(table)
        return table

    @staticmethod
    async def update_table(db: AsyncSession, table_id: int, data: SmartTableUpdate) -> AnalysisSmartTable:
        result = await db.execute(select(AnalysisSmartTable).where(AnalysisSmartTable.id == table_id))
        table = result.scalar_one_or_none()
        if not table:
            raise Exception("表格不存在")
        if data.name is not None:
            table.name = data.name
        if data.fields is not None:
            table.fields = data.fields
        if data.config is not None:
            table.config = data.config
        await db.commit()
        await db.refresh(table)
        return table

    @staticmethod
    async def delete_table(db: AsyncSession, table_id: int):
        result = await db.execute(select(AnalysisSmartTable).where(AnalysisSmartTable.id == table_id))
        table = result.scalar_one_or_none()
        if table:
            await db.execute(delete(AnalysisSmartTableData).where(AnalysisSmartTableData.table_id == table_id))
            await db.delete(table)
            await db.commit()

    # --- 数据行操作 ---
    @staticmethod
    async def get_table_data(db: AsyncSession, table_id: int) -> List[Dict[str, Any]]:
        res = await db.execute(
            select(AnalysisSmartTableData)
            .where(AnalysisSmartTableData.table_id == table_id)
            .order_by(AnalysisSmartTableData.created_at.asc())
        )
        rows = res.scalars().all()
        return [{"id": r.id, **r.row_data} for r in rows]

    @staticmethod
    async def add_row(db: AsyncSession, table_id: int, row_data: Dict[str, Any]) -> AnalysisSmartTableData:
        row = AnalysisSmartTableData(
            table_id=table_id,
            row_data=row_data
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        
        # 自动同步到数据集
        table = await SmartTableService.get_table_by_id(db, table_id)
        if table and table.dataset_id:
            await SmartTableService.sync_to_dataset(db, table_id)
            
        return row

    @staticmethod
    async def update_row(db: AsyncSession, row_id: int, row_data: Dict[str, Any]) -> AnalysisSmartTableData:
        result = await db.execute(select(AnalysisSmartTableData).where(AnalysisSmartTableData.id == row_id))
        row = result.scalar_one_or_none()
        if not row:
            raise Exception("记录不存在")
        row.row_data = row_data
        await db.commit()
        await db.refresh(row)
        
        # 自动同步
        if row.table_id:
            table = await SmartTableService.get_table_by_id(db, row.table_id)
            if table and table.dataset_id:
                await SmartTableService.sync_to_dataset(db, row.table_id)
                
        return row

    @staticmethod
    async def delete_row(db: AsyncSession, row_id: int):
        result = await db.execute(select(AnalysisSmartTableData).where(AnalysisSmartTableData.id == row_id))
        row = result.scalar_one_or_none()
        if row:
            table_id = row.table_id
            await db.delete(row)
            await db.commit()
            
            # 自动同步
            table = await SmartTableService.get_table_by_id(db, table_id)
            if table and table.dataset_id:
                await SmartTableService.sync_to_dataset(db, table_id)

    @staticmethod
    async def sync_to_dataset(db: AsyncSession, table_id: int):
        """将智能表格数据同步到 DuckDB 数据集"""
        import uuid
        import pandas as pd
        import numpy as np

        # 1. 获取表格定义
        table = await SmartTableService.get_table_by_id(db, table_id)
        if not table:
            raise Exception("智能表格不存在")

        # 2. 获取所有行数据
        rows = await SmartTableService.get_table_data(db, table_id)
        
        # 3. 准备 DataFrame (使用内部名称作为初始列名)
        df_data = [{k: v for k, v in r.items() if k != 'id'} for r in rows]
        df = pd.DataFrame(df_data)

        if not df.empty:
            # 数据类型转换：确保参与计算的列为数值型
            for f in table.fields:
                fname = f['name']
                if fname in df.columns:
                    if f['type'] in ['number', 'calculated']:
                        df[fname] = pd.to_numeric(df[fname], errors='coerce').fillna(0)
            
            # 重新计算计算字段（确保同步最新的公式设置）
            # 我们先建立标签到名称的映映射，因为公式使用的是标签
            label_to_name = {f.get('label', f['name']): f['name'] for f in table.fields}
            
            for f in table.fields:
                if f.get('type') == 'calculated' and f.get('formula'):
                    try:
                        formula = f['formula']
                        # 将公式中的标签替换为列引用，例如：`身高` -> `col_xxx`
                        # 需按长度逆序替换，防止子串覆盖
                        sorted_labels = sorted(label_to_name.keys(), key=len, reverse=True)
                        eval_expr = formula
                        for label in sorted_labels:
                            if label in eval_expr:
                                eval_expr = eval_expr.replace(label, f"`{label_to_name[label]}`")
                        
                        # 执行计算（使用安全计算函数）
                        allowed_cols = [label_to_name[label] for label in sorted_labels]
                        df[f['name']] = safe_eval_dataframe_formula(df, eval_expr, allowed_cols)
                    except Exception as e:
                        logger.warning(f"同步计算错误 ({f.get('label', f['name'])}): {e}")

            # 应用格式化 (精度和百分比)
            # 如果要用于图表分析，最好保持为数值
            # 但如果包含百分号，则必须转为字符串。
            # 这里我们决定：如果包含 showPercent，为满足预览需求存为字符串；
            # 否则如果只是精度，我们也存为数值舍入后的结果。
            for f in table.fields:
                fname = f['name']
                if f.get('type') == 'calculated':
                    precision = f.get('precision', 2)
                    show_percent = f.get('showPercent', False)
                    
                    if show_percent:
                        # 存为字符串带 % 号
                        df[fname] = df[fname].apply(lambda x: f"{x:.{precision}f}%")
                    else:
                        # 存为舍入后的数值
                        df[fname] = df[fname].round(precision)

            # 重命名列：从内部名称转为显示标签
            name_to_label = {f['name']: f.get('label', f['name']) for f in table.fields}
            df = df.rename(columns=name_to_label)
        else:
            # 空数据集的处理：使用标签作为列名
            columns = [f.get('label', f['name']) for f in table.fields]
            df = pd.DataFrame(columns=columns)

        # 4. 获取或创建关联的数据集元数据
        dataset = None
        if table.dataset_id:
            res_ds = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == table.dataset_id))
            dataset = res_ds.scalar_one_or_none()

        if not dataset:
            # 创建新数据集记录
            table_name = f"st_{uuid.uuid4().hex[:8]}"
            dataset = AnalysisDataset(
                name=f"智能表格:{table.name}",
                source_type="smart_table",
                table_name=table_name,
                config={"smart_table_id": table_id}
            )
            db.add(dataset)
            await db.flush() # 获取 ID
            table.dataset_id = dataset.id
        
        # 5. 更新 DuckDB 表
        duckdb_instance.query(f"DROP TABLE IF EXISTS {dataset.table_name}")
        
        # 将数据写入 DuckDB
        if not df.empty:
            duckdb_instance.conn.execute(f"CREATE TABLE {dataset.table_name} AS SELECT * FROM df")
            dataset.row_count = len(df)
        else:
            # 创建空表
            if df.columns.tolist():
                col_defs = ", ".join([f'"{c}" VARCHAR' for c in df.columns])
                duckdb_instance.query(f"CREATE TABLE {dataset.table_name} ({col_defs})")
            else:
                duckdb_instance.query(f"CREATE TABLE {dataset.table_name} (dummy VARCHAR)")
            dataset.row_count = 0
            
        dataset.updated_at = datetime.now()
        await db.commit()
        return dataset

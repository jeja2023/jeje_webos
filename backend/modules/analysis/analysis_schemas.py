from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class DatasetBase(BaseModel):
    name: str
    source_type: str
    config: Optional[Dict[str, Any]] = None

class DatasetCreate(DatasetBase):
    pass

class DatasetUpdate(DatasetBase):
    name: Optional[str] = None
    source_type: Optional[str] = None

class DatasetResponse(DatasetBase):
    id: int
    table_name: str
    row_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ImportFileRequest(BaseModel):
    name: str
    file_id: int  # 对应 sys_files 中的 ID
    options: Optional[Dict[str, Any]] = None

class ImportDatabaseRequest(BaseModel):
    name: str
    connection_url: str
    query: str
    options: Optional[Dict[str, Any]] = None

class CompareRequest(BaseModel):
    source_id: int  # 数据集1 ID
    target_id: int  # 数据集2 ID
    join_keys: List[str]  # 比对的主键
    compare_columns: Optional[List[str]] = None  # 需要对比的字段，为空对比全部

# --- 数据清洗 ---
class CleaningRequest(BaseModel):
    dataset_id: int
    operation: str  # drop_missing, fill_missing, drop_duplicates, convert_type
    columns: Optional[List[str]] = None
    params: Optional[Dict[str, Any]] = None
    new_dataset_name: Optional[str] = None  # 如果提供，保存为新数据集，否则覆盖（慎用）

# --- 数据建模 ---
class ModelingSummaryRequest(BaseModel):
    dataset_id: int
    columns: Optional[List[str]] = None

class ModelingCorrelationRequest(BaseModel):
    dataset_id: int
    columns: Optional[List[str]] = None

class ModelingAggregateRequest(BaseModel):
    dataset_id: int
    group_by: List[str]
    aggregates: Dict[str, str]  # 字段名 -> 聚合函数 (sum, avg, count, max, min)

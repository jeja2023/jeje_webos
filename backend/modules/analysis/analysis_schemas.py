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
    file_id: int  # 文件ID
    source: Optional[str] = "upload"  # 文件来源: 'upload'=新上传(sys_files), 'filemanager'=文件管理(fm_files)
    options: Optional[Dict[str, Any]] = None

class ImportDatabaseRequest(BaseModel):
    name: str
    connection_url: str
    query: str
    options: Optional[Dict[str, Any]] = None
    test_only: Optional[bool] = False  # 仅测试连接，不导入数据

class DbTablesRequest(BaseModel):
    connection_url: str

class CompareRequest(BaseModel):
    source_id: int  # 数据集1 ID
    target_id: int  # 数据集2 ID
    join_keys: List[str]  # 比对的主键
    compare_columns: Optional[List[str]] = None  # 需要对比的字段，为空对比全部

# --- 数据清洗 ---
class CleaningOperation(BaseModel):
    operation: str
    columns: Optional[List[str]] = None
    params: Optional[Dict[str, Any]] = None
    fill_value: Optional[str] = None

class CleaningRequest(BaseModel):
    dataset_id: int
    operations: Optional[List[CleaningOperation]] = None  # 支持多步骤清洗
    operation: Optional[str] = None  # 兼容旧版单一操作
    columns: Optional[List[str]] = None
    params: Optional[Dict[str, Any]] = None
    fill_value: Optional[str] = None  # 填充值
    save_mode: str = "new"  # new: 新建数据集, preview: 仅预览不保存

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

# SQL建模请求
class ModelingSqlRequest(BaseModel):
    sql: str  # 用户自定义SQL语句
    save_as: Optional[str] = None  # 可选：保存结果为新数据集

# --- ETL 模型管理 ---
class ModelBase(BaseModel):
    name: str
    description: Optional[str] = None

class ModelCreate(ModelBase):
    pass

class ModelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ModelSaveGraphRequest(BaseModel):
    graph_config: Dict[str, Any] # 包含 nodes, connections, etc.
    status: Optional[str] = None

class ModelResponse(ModelBase):
    id: int
    graph_config: Optional[Dict[str, Any]]
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# --- ETL 节点执行 ---
class ETLExecuteNodeRequest(BaseModel):
    """执行单个 ETL 节点请求"""
    model_id: int  # 模型ID
    node_id: str   # 要执行的节点ID
    graph_config: Dict[str, Any]  # 完整的图配置


class ETLPreviewNodeRequest(BaseModel):
    """预览节点数据请求"""
    model_id: int
    node_id: str

# --- BI 仪表盘 ---
class DashboardBase(BaseModel):
    name: str
    description: Optional[str] = None
    widgets: Optional[List[Dict[str, Any]]] = None

class DashboardCreate(DashboardBase):
    pass

class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    widgets: Optional[List[Dict[str, Any]]] = None

class DashboardResponse(DashboardBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- 智能表格 ---
class SmartTableBase(BaseModel):
    name: str
    fields: List[Dict[str, Any]] # e.g. [{"name": "age", "type": "number", "label": "年龄"}]

class SmartTableCreate(SmartTableBase):
    pass

class SmartTableUpdate(BaseModel):
    name: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None
    dataset_id: Optional[int] = None

class SmartTableResponse(SmartTableBase):
    id: int
    dataset_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class SmartTableDataRow(BaseModel):
    table_id: int
    row_data: Dict[str, Any]

class SmartTableDataUpdate(BaseModel):
    row_data: Dict[str, Any]

# --- 智能报告 ---
class SmartReportBase(BaseModel):
    name: str

class SmartReportCreate(SmartReportBase):
    pass
    # template_path 会在后端处理上传时生成，或者通过单独接口上传

class SmartReportUpdate(BaseModel):
    name: Optional[str] = None
    # template_path 通常不直接更新，而是通过上传新模板

class SmartReportResponse(SmartReportBase):
    id: int
    template_path: Optional[str] = None
    content_html: Optional[str] = None
    content_md: Optional[str] = None
    template_vars: Optional[List[str]] = None
    dataset_id: Optional[int] = None
    data_row: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class SmartReportUpdateContentRequest(BaseModel):
    content_md: str
    content_html: Optional[str] = None
    template_vars: List[str]
    dataset_id: Optional[int] = None
    data_row: Optional[str] = None

class SmartReportRecordCreate(BaseModel):
    report_id: int
    name: str
    # docx_file_path 由后端生成
    # pdf_file_path 可选

class GenerateReportRequest(BaseModel):
    data: Dict[str, Any] # 注入模板的数据
    save_record: bool = False # 是否保存为记录
    record_name: Optional[str] = None
    content_md: Optional[str] = None # 可选：处理后的 Markdown 内容（包含图表图片），如果提供则使用此内容而不是模板内容

class SmartReportRecordResponse(BaseModel):
    id: int
    report_id: int
    name: str
    docx_file_path: Optional[str] = None
    pdf_file_path: Optional[str] = None
    full_content: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- 图表管理 ---
class AnalysisChartBase(BaseModel):
    name: str
    dataset_id: int
    chart_type: str
    config: Dict[str, Any]
    description: Optional[str] = None

class AnalysisChartCreate(AnalysisChartBase):
    pass

class AnalysisChartUpdate(BaseModel):
    name: Optional[str] = None
    dataset_id: Optional[int] = None
    chart_type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    description: Optional[str] = None

class AnalysisChartResponse(AnalysisChartBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

"""
数据备份 Schema
"""

import re
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from datetime import datetime


class BackupInfo(BaseModel):
    """备份信息"""
    id: int
    backup_type: str
    status: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    description: Optional[str] = None
    error_message: Optional[str] = None
    is_encrypted: bool = False
    created_by: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class BackupCreate(BaseModel):
    """创建备份请求"""
    backup_type: str = Field(..., description="备份类型: full, database, files")
    description: Optional[str] = None
    note: Optional[str] = Field(None, description="备份备注")
    is_encrypted: bool = Field(False, description="是否加密备份")
    encrypt_password: Optional[str] = Field(None, description="加密密码")


class BackupRestore(BaseModel):
    """恢复备份请求"""
    backup_id: int = Field(..., description="备份记录ID")
    decrypt_password: Optional[str] = Field(None, description="解密密码（加密备份需要）")


class BackupListResponse(BaseModel):
    """备份列表响应"""
    items: list[BackupInfo]
    total: int
    page: int
    size: int


# 备份调度相关 Schema
class ScheduleInfo(BaseModel):
    """调度计划信息"""
    id: int
    name: str
    backup_type: str
    schedule_type: str
    schedule_time: str
    schedule_day: Optional[int] = None
    is_encrypted: bool = False
    is_enabled: bool = True
    retention_days: int = 30
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ScheduleCreate(BaseModel):
    """创建调度计划"""
    name: str = Field(..., min_length=1, max_length=100, description="计划名称")
    backup_type: str = Field("full", description="备份类型")
    schedule_type: str = Field(..., description="调度类型: daily, weekly, monthly")
    schedule_time: str = Field(..., description="执行时间 HH:MM")
    schedule_day: Optional[int] = Field(None, description="执行日期（周几或月几）")
    is_encrypted: bool = Field(False, description="是否加密")
    is_enabled: bool = Field(True, description="是否启用")
    retention_days: int = Field(30, ge=1, le=365, description="保留天数")
    
    @field_validator('schedule_time')
    @classmethod
    def validate_time_format(cls, v):
        """验证时间格式为 HH:MM"""
        if not re.match(r'^([01]\d|2[0-3]):([0-5]\d)$', v):
            raise ValueError("时间格式必须为 HH:MM（如 08:30）")
        return v
    
    @model_validator(mode='after')
    def validate_schedule_day(self):
        """根据调度类型验证执行日期"""
        if self.schedule_type == 'weekly' and self.schedule_day is not None:
            if not (1 <= self.schedule_day <= 7):
                raise ValueError("周调度的执行日期必须为 1-7（周一至周日）")
        elif self.schedule_type == 'monthly' and self.schedule_day is not None:
            if not (1 <= self.schedule_day <= 31):
                raise ValueError("月调度的执行日期必须为 1-31")
        return self


class ScheduleUpdate(BaseModel):
    """更新调度计划"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    backup_type: Optional[str] = None
    schedule_type: Optional[str] = None
    schedule_time: Optional[str] = None
    schedule_day: Optional[int] = None
    is_encrypted: Optional[bool] = None
    is_enabled: Optional[bool] = None
    retention_days: Optional[int] = Field(None, ge=1, le=365)


class ScheduleListResponse(BaseModel):
    """调度列表响应"""
    items: List[ScheduleInfo]
    total: int


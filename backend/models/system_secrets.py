"""
系统密钥存储模型
用于安全存储敏感信息，如 API Key 等
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Text, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base

class SystemSecret(Base):
    """
    系统敏感信息存储表
    用于存储加密后的敏感数据，如第三方 API Key、Token 等
    """
    __tablename__ = "sys_secrets"
    __table_args__ = (
        UniqueConstraint('user_id', 'key_name', name='uq_user_secret_key'),
        {"comment": "系统敏感信息存储表（加密存储）"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False, comment="关联用户ID")
    category: Mapped[str] = mapped_column(String(50), index=True, default="ai", comment="密钥分类(ai, storage, etc)")
    key_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False, comment="密钥名称标识")
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False, comment="加密后的密钥值")
    additional_info: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="附加配置信息(如 api_base_url)")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")

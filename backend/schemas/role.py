"""
用户组（权限模板） Schema
"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class UserGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    permissions: List[str] = []


class UserGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    permissions: Optional[List[str]] = None


class UserGroupInfo(BaseModel):
    id: int
    name: str
    permissions: List[str] = []
    user_count: int = 0

    model_config = ConfigDict(from_attributes=True)

# 兼容旧命名
RoleCreate = UserGroupCreate
RoleUpdate = UserGroupUpdate
RoleInfo = UserGroupInfo



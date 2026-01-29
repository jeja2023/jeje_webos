"""
用户组（权限模板） Schema
"""
from typing import List, Optional
import json
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    permissions: List[str] = []


class UserGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    permissions: Optional[List[str]] = None


class UserGroupInfo(BaseModel):
    id: int
    name: str
    permissions: Optional[List[str]] = []
    user_count: int = 0

    model_config = ConfigDict(from_attributes=True)

    @field_validator('permissions', mode='before')
    @classmethod
    def parse_json_list(cls, v):
        if isinstance(v, str):
            try:
                data = json.loads(v)
                return data if isinstance(data, list) else []
            except (json.JSONDecodeError, TypeError):
                return []
        return v or []

# 兼容旧命名
RoleCreate = UserGroupCreate
RoleUpdate = UserGroupUpdate
RoleInfo = UserGroupInfo



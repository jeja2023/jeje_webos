# -*- coding: utf-8 -*-
"""
安全校验工具
提供 SQL 注入防护、路径安全校验等功能
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def is_safe_table_name(table_name: str) -> bool:
    """
    验证表名是否安全（防止 SQL 注入）
    
    规则：
    - 只允许字母、数字、下划线
    - 必须以字母或下划线开头
    - 长度在 1-128 之间
    - 不允许 SQL 关键字
    
    Args:
        table_name: 表名
        
    Returns:
        是否安全
    """
    if not table_name or not isinstance(table_name, str):
        return False
    
    # 检查长度
    if len(table_name) < 1 or len(table_name) > 128:
        return False
    
    # 只允许字母、数字、下划线，必须以字母或下划线开头
    pattern = r'^[a-zA-Z_][a-zA-Z0-9_]*$'
    if not re.match(pattern, table_name):
        return False
    
    # 禁止的 SQL 关键字（转为大写比较）
    sql_keywords = {
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
        'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', 'JOIN', 'WHERE', 'FROM',
        'TABLE', 'DATABASE', 'SCHEMA', 'INDEX', 'VIEW', 'TRIGGER', 'PROCEDURE',
        'FUNCTION', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT'
    }
    if table_name.upper() in sql_keywords:
        return False
    
    return True


def sanitize_table_name(table_name: str, prefix: str = "tbl_") -> Optional[str]:
    """
    清理并返回安全的表名
    
    如果表名不安全，返回 None；否则返回带前缀的表名。
    
    Args:
        table_name: 原始表名
        prefix: 表名前缀（默认 "tbl_"）
        
    Returns:
        安全的表名，或 None
    """
    if not is_safe_table_name(table_name):
        logger.warning(f"不安全的表名被拒绝: {table_name}")
        return None
    
    # 如果已有前缀，直接返回
    if table_name.startswith(prefix):
        return table_name
    
    return f"{prefix}{table_name}"


def is_safe_column_name(column_name: str) -> bool:
    """
    验证列名是否安全
    
    规则与表名相同
    
    Args:
        column_name: 列名
        
    Returns:
        是否安全
    """
    return is_safe_table_name(column_name)


def escape_sql_identifier(identifier: str) -> str:
    """
    转义 SQL 标识符（表名、列名）
    
    使用双引号包裹并转义内部双引号
    
    Args:
        identifier: 标识符
        
    Returns:
        转义后的标识符
    """
    # 替换内部双引号为两个双引号
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def validate_and_escape_identifiers(identifiers: list, identifier_type: str = "column") -> list:
    """
    批量验证并转义标识符
    
    Args:
        identifiers: 标识符列表
        identifier_type: 类型描述（用于日志）
        
    Returns:
        安全的标识符列表
        
    Raises:
        ValueError: 如果有不安全的标识符
    """
    safe_identifiers = []
    for identifier in identifiers:
        if not is_safe_table_name(identifier):
            raise ValueError(f"不安全的{identifier_type}名: {identifier}")
        safe_identifiers.append(escape_sql_identifier(identifier))
    return safe_identifiers

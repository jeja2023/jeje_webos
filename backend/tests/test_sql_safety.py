"""
SQL 安全校验工具单元测试
覆盖：表名验证、列名验证、标识符转义、批量验证
"""

import pytest
from utils.sql_safety import (
    is_safe_table_name,
    is_safe_column_name,
    sanitize_table_name,
    escape_sql_identifier,
    validate_and_escape_identifiers,
)


class TestIsSafeTableName:
    """表名安全验证测试"""

    def test_valid_table_name(self):
        """测试有效表名"""
        assert is_safe_table_name("users") is True
        assert is_safe_table_name("user_roles") is True
        assert is_safe_table_name("_internal") is True
        assert is_safe_table_name("Table1") is True
        assert is_safe_table_name("t") is True

    def test_empty_table_name(self):
        """测试空表名"""
        assert is_safe_table_name("") is False
        assert is_safe_table_name(None) is False

    def test_starts_with_number(self):
        """测试数字开头"""
        assert is_safe_table_name("1table") is False
        assert is_safe_table_name("123") is False

    def test_special_characters(self):
        """测试特殊字符"""
        assert is_safe_table_name("table;drop") is False
        assert is_safe_table_name("table name") is False
        assert is_safe_table_name("table-name") is False
        assert is_safe_table_name("table.name") is False
        assert is_safe_table_name("table'name") is False

    def test_sql_keywords(self):
        """测试 SQL 关键字被拒绝"""
        assert is_safe_table_name("SELECT") is False
        assert is_safe_table_name("select") is False
        assert is_safe_table_name("INSERT") is False
        assert is_safe_table_name("DROP") is False
        assert is_safe_table_name("DELETE") is False
        assert is_safe_table_name("UPDATE") is False
        assert is_safe_table_name("CREATE") is False
        assert is_safe_table_name("ALTER") is False
        assert is_safe_table_name("TRUNCATE") is False
        assert is_safe_table_name("UNION") is False
        assert is_safe_table_name("TABLE") is False

    def test_sql_injection_attempts(self):
        """测试 SQL 注入尝试"""
        assert is_safe_table_name("users; DROP TABLE users") is False
        assert is_safe_table_name("users--") is False
        assert is_safe_table_name("users' OR '1'='1") is False
        assert is_safe_table_name("1=1") is False

    def test_too_long_name(self):
        """测试超长表名"""
        assert is_safe_table_name("a" * 128) is True
        assert is_safe_table_name("a" * 129) is False

    def test_non_string_input(self):
        """测试非字符串输入"""
        assert is_safe_table_name(123) is False
        assert is_safe_table_name([]) is False

    def test_unicode_table_name(self):
        """测试中文表名被拒绝"""
        assert is_safe_table_name("用户表") is False


class TestIsSafeColumnName:
    """列名安全验证测试"""

    def test_valid_column_name(self):
        """测试有效列名"""
        assert is_safe_column_name("id") is True
        assert is_safe_column_name("user_name") is True
        assert is_safe_column_name("createdAt") is True

    def test_invalid_column_name(self):
        """测试无效列名"""
        assert is_safe_column_name("") is False
        assert is_safe_column_name("col;drop") is False
        assert is_safe_column_name("SELECT") is False


class TestSanitizeTableName:
    """表名清理测试"""

    def test_safe_name_gets_prefix(self):
        """测试安全表名添加前缀"""
        result = sanitize_table_name("users")
        assert result == "tbl_users"

    def test_already_prefixed(self):
        """测试已有前缀的表名"""
        result = sanitize_table_name("tbl_users")
        assert result == "tbl_users"

    def test_custom_prefix(self):
        """测试自定义前缀"""
        result = sanitize_table_name("data", prefix="ds_")
        assert result == "ds_data"

    def test_unsafe_name_returns_none(self):
        """测试不安全表名返回 None"""
        result = sanitize_table_name("SELECT")
        assert result is None

    def test_empty_name_returns_none(self):
        """测试空名返回 None"""
        result = sanitize_table_name("")
        assert result is None

    def test_injection_attempt_returns_none(self):
        """测试注入尝试返回 None"""
        result = sanitize_table_name("users; DROP TABLE users")
        assert result is None


class TestEscapeSqlIdentifier:
    """SQL 标识符转义测试"""

    def test_simple_identifier(self):
        """测试简单标识符"""
        result = escape_sql_identifier("users")
        assert result == '"users"'

    def test_identifier_with_quotes(self):
        """测试包含双引号的标识符"""
        result = escape_sql_identifier('user"name')
        assert result == '"user""name"'

    def test_empty_identifier(self):
        """测试空标识符"""
        result = escape_sql_identifier("")
        assert result == '""'

    def test_identifier_with_spaces(self):
        """测试包含空格的标识符"""
        result = escape_sql_identifier("user name")
        assert result == '"user name"'


class TestValidateAndEscapeIdentifiers:
    """批量验证并转义标识符测试"""

    def test_valid_identifiers(self):
        """测试有效标识符列表"""
        result = validate_and_escape_identifiers(["id", "name", "age"])
        assert len(result) == 3
        assert '"id"' in result
        assert '"name"' in result
        assert '"age"' in result

    def test_invalid_identifier_raises(self):
        """测试无效标识符抛出异常"""
        with pytest.raises(ValueError, match="不安全的"):
            validate_and_escape_identifiers(["id", "SELECT", "name"])

    def test_empty_list(self):
        """测试空列表"""
        result = validate_and_escape_identifiers([])
        assert result == []

    def test_custom_identifier_type(self):
        """测试自定义类型描述"""
        with pytest.raises(ValueError, match="不安全的表名"):
            validate_and_escape_identifiers(["DROP"], identifier_type="表")

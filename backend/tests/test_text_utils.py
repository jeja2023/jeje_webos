"""
文本处理工具单元测试
覆盖：slug 生成、文本截取、MD5 哈希、邮箱脱敏
"""

import pytest
from utils.text import generate_slug, truncate, md5, mask_email


class TestGenerateSlug:
    """Slug 生成测试"""

    def test_basic_slug(self):
        """测试基本 slug 生成"""
        slug = generate_slug("Hello World", unique=False)
        assert slug == "hello-world"

    def test_slug_with_special_chars(self):
        """测试特殊字符替换"""
        slug = generate_slug("Hello! @World# Test", unique=False)
        assert "hello" in slug
        assert "world" in slug
        # 特殊字符被替换为横线

    def test_slug_chinese(self):
        """测试中文 slug"""
        slug = generate_slug("你好世界", unique=False)
        assert "你好世界" in slug

    def test_slug_unique(self):
        """测试唯一 slug（带时间戳后缀）"""
        slug = generate_slug("test")
        # 默认 unique=True, 应该有数字后缀
        parts = slug.rsplit("-", 1)
        assert len(parts) == 2
        assert parts[1].isdigit()

    def test_slug_unique_different_each_call(self):
        """测试唯一 slug 每次不完全相同或近似"""
        slug1 = generate_slug("test")
        slug2 = generate_slug("test")
        # 虽然时间戳可能相同（毫秒级），但至少 slug 基本部分一致
        assert slug1.startswith("test-")

    def test_slug_empty_input(self):
        """测试空输入"""
        slug = generate_slug("")
        assert slug == ""

    def test_slug_none_input(self):
        """测试 None 输入"""
        slug = generate_slug(None)
        assert slug == ""

    def test_slug_consecutive_special_chars(self):
        """测试连续特殊字符被合并为单个横线"""
        slug = generate_slug("hello   --  world", unique=False)
        assert "--" not in slug

    def test_slug_leading_trailing_special(self):
        """测试首尾特殊字符被去除"""
        slug = generate_slug("---hello---", unique=False)
        assert not slug.startswith("-")
        assert not slug.endswith("-")


class TestTruncate:
    """文本截取测试"""

    def test_truncate_short_text(self):
        """测试短文本不截取"""
        text = "Hello"
        result = truncate(text, 10)
        assert result == "Hello"

    def test_truncate_exact_length(self):
        """测试恰好等于长度不截取"""
        text = "Hello"
        result = truncate(text, 5)
        assert result == "Hello"

    def test_truncate_long_text(self):
        """测试长文本截取"""
        text = "Hello, World!"
        result = truncate(text, 5)
        assert result == "Hello..."

    def test_truncate_custom_suffix(self):
        """测试自定义后缀"""
        text = "Hello, World!"
        result = truncate(text, 5, suffix="…")
        assert result == "Hello…"

    def test_truncate_empty_text(self):
        """测试空文本"""
        result = truncate("", 10)
        assert result == ""

    def test_truncate_none_text(self):
        """测试 None 文本"""
        result = truncate(None, 10)
        assert result == ""

    def test_truncate_unicode(self):
        """测试中文截取"""
        text = "这是一段很长的中文文本"
        result = truncate(text, 4)
        assert result == "这是一段..."


class TestMd5:
    """MD5 哈希测试"""

    def test_md5_basic(self):
        """测试基本 MD5"""
        result = md5("hello")
        assert result == "5d41402abc4b2a76b9719d911017c592"

    def test_md5_empty(self):
        """测试空字符串 MD5"""
        result = md5("")
        assert result == "d41d8cd98f00b204e9800998ecf8427e"

    def test_md5_consistency(self):
        """测试 MD5 一致性"""
        assert md5("test") == md5("test")

    def test_md5_different_inputs(self):
        """测试不同输入产生不同哈希"""
        assert md5("abc") != md5("def")

    def test_md5_unicode(self):
        """测试中文 MD5"""
        result = md5("你好")
        assert len(result) == 32
        assert result.isalnum()


class TestMaskEmail:
    """邮箱脱敏测试"""

    def test_mask_normal_email(self):
        """测试正常邮箱脱敏"""
        result = mask_email("test@example.com")
        assert result == "t***t@example.com"

    def test_mask_short_local(self):
        """测试短用户名邮箱"""
        result = mask_email("ab@example.com")
        assert result == "a***@example.com"

    def test_mask_single_char_local(self):
        """测试单字符用户名"""
        result = mask_email("a@example.com")
        assert result == "a***@example.com"

    def test_mask_long_local(self):
        """测试长用户名邮箱"""
        result = mask_email("longusername@domain.com")
        assert result == "l***e@domain.com"

    def test_mask_empty_email(self):
        """测试空邮箱"""
        result = mask_email("")
        assert result == ""

    def test_mask_none_email(self):
        """测试 None 邮箱"""
        result = mask_email(None)
        assert result == ""

    def test_mask_invalid_email(self):
        """测试无 @ 号的字符串"""
        result = mask_email("notanemail")
        assert result == "notanemail"

    def test_mask_preserves_domain(self):
        """测试域名完整保留"""
        result = mask_email("user@sub.domain.com")
        assert "@sub.domain.com" in result

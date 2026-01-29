import pytest
from modules.knowledge.knowledge_parser import DocumentParser, RecursiveCharacterTextSplitter

class TestKnowledgeParser:
    """DocumentParser 单元测试"""

    def test_text_splitting(self):
        """测试文本分块逻辑"""
        text = "line1\nline2\nline3\nline4\nline5"
        # 设置极小的 chunk_size 以强制分块
        splitter = RecursiveCharacterTextSplitter(chunk_size=10, chunk_overlap=0)
        chunks = splitter.split_text(text)
        
        assert len(chunks) > 1
        assert "".join(chunks).replace("\n", "") == text.replace("\n", "")

    def test_chunk_text_method(self):
        """测试 chunk_text 静态方法"""
        text = "A" * 2000
        chunks = DocumentParser.chunk_text(text, chunk_size=500, overlap=100)
        
        assert len(chunks) >= 4
        for chunk in chunks:
            assert len(chunk) <= 600 # 允许少量溢出取决于实现

    def test_parse_simple_text(self):
        """测试简单文本解析"""
        content = b"hello world"
        result = DocumentParser._parse_sync(content, "txt")
        assert result == "hello world"

    def test_parse_csv(self):
        """测试 CSV 解析"""
        content = b"id,name\n1,test"
        result = DocumentParser._parse_sync(content, "csv")
        assert "id,name" in result
        assert "1,test" in result

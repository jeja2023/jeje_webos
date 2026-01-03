"""
知识库文件解析器
负责将不同格式的文件（PDF, Word, Excel, CSV）转换为纯文本
"""

import io
import csv
import logging
import mammoth
import pandas as pd
from pdfminer.high_level import extract_text as extract_pdf_text
from fastapi import UploadFile

logger = logging.getLogger(__name__)

class DocumentParser:
    
    @staticmethod
    async def parse_file(file_content: bytes, filename: str, content_type: str) -> str:
        """
        解析文件内容为纯文本
        """
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        
        try:
            if ext == 'pdf':
                return DocumentParser._parse_pdf(file_content)
            elif ext in ['docx', 'doc']:
                return DocumentParser._parse_word(file_content)
            elif ext in ['xlsx', 'xls']:
                return DocumentParser._parse_excel(file_content)
            elif ext == 'csv':
                return DocumentParser._parse_csv(file_content)
            elif ext in ['md', 'txt', 'py', 'js', 'html', 'css', 'json', 'yml', 'yaml', 'xml']:
                return file_content.decode('utf-8', errors='ignore')
            else:
                return ""
        except Exception as e:
            logger.error(f"解析文件失败 {filename}: {e}")
            return ""

    @staticmethod
    def _parse_pdf(content: bytes) -> str:
        """解析 PDF"""
        # pdfminer 需要 file-like object
        with io.BytesIO(content) as f:
            text = extract_pdf_text(f)
        return text

    @staticmethod
    def _parse_word(content: bytes) -> str:
        """解析 Word (.docx)"""
        # mammoth 虽然主要转HTML，但也支持raw text
        with io.BytesIO(content) as f:
            result = mammoth.extract_raw_text(f)
            return result.value

    @staticmethod
    def _parse_excel(content: bytes) -> str:
        """解析 Excel"""
        # 转为 CSV 格式的文本表示，或者每行平铺
        # 简单策略：读取所有sheet，转为 string
        with io.BytesIO(content) as f:
            # 读取所有sheet
            dfs = pd.read_excel(f, sheet_name=None)
            text_parts = []
            for sheet_name, df in dfs.items():
                text_parts.append(f"Sheet: {sheet_name}")
                # 将DataFrame转为csv字符串
                text_parts.append(df.to_csv(index=False))
            return "\n".join(text_parts)

    @staticmethod
    def _parse_csv(content: bytes) -> str:
        """解析 CSV"""
        return content.decode('utf-8', errors='ignore')

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
        """
        简单的文本分块策略
        TODO: 使用更高级的 LangChain TextSplitter
        """
        if not text:
            return []
            
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            # 移动步长（减去重叠）
            start += (chunk_size - overlap)
            
        return chunks

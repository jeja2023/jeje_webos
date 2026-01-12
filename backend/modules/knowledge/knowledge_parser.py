"""
文档解析器模块
支持多种文件格式的文本提取和分块处理
支持的格式：PDF、Word、Excel、CSV、图片OCR、文本文件等
"""

import io
import re
import logging
import mammoth
import pandas as pd
import asyncio
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor

# 可选依赖：PDF解析
try:
    from pdfminer.high_level import extract_text as extract_pdf_text
except ImportError:
    extract_pdf_text = None

# 可选依赖：OCR图像识别
try:
    from paddleocr import PaddleOCR
except ImportError:
    PaddleOCR = None

logger = logging.getLogger(__name__)

class RecursiveCharacterTextSplitter:
    """
    递归字符文本分割器（灵感来自 LangChain）
    """
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200, separators: List[str] = None):
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap
        self._separators = separators or ["\n\n", "\n", " ", ""]

    def split_text(self, text: str) -> List[str]:
        final_chunks = []
        separator = self._separators[-1]
        
        # 寻找最佳分隔符
        for _s in self._separators:
            if _s == "":
                separator = _s
                break
            if _s in text:
                separator = _s
                break
                
        # 分割
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text) # 按字符分割
            
        # 合并
        _good_splits = []
        _separator_len = len(separator) if separator else 0
        
        current_chunk = []
        current_len = 0
        
        for s in splits:
            s_len = len(s)
            if current_len + s_len + _separator_len > self._chunk_size:
                if current_chunk:
                    doc = separator.join(current_chunk) if separator else "".join(current_chunk)
                    final_chunks.append(doc)
                    
                    # 处理重叠逻辑（简化版）
                    while current_len > self._chunk_overlap:
                        if not current_chunk: break
                        pop_s = current_chunk.pop(0)
                        current_len -= len(pop_s) + _separator_len
                        
                current_chunk = [s]
                current_len = s_len
            else:
                current_chunk.append(s)
                current_len += s_len + _separator_len
                
        if current_chunk:
            doc = separator.join(current_chunk) if separator else "".join(current_chunk)
            final_chunks.append(doc)
            
        return final_chunks

class DocumentParser:
    
    _executor = ThreadPoolExecutor(max_workers=4)
    _ocr_model = None
    
    @classmethod
    def get_ocr(cls):
        if cls._ocr_model is None and PaddleOCR:
            # 初始化 OCR（语言：中英文）
            cls._ocr_model = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        return cls._ocr_model

    @staticmethod
    async def parse_file(file_content: bytes, filename: str, content_type: str) -> str:
        """
        异步解析文件内容为文本
        """
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        
        return await asyncio.get_event_loop().run_in_executor(
            DocumentParser._executor,
            DocumentParser._parse_sync,
            file_content, ext
        )

    @staticmethod
    def _parse_sync(content: bytes, ext: str) -> str:
        try:
            if ext == 'pdf':
                return DocumentParser._parse_pdf(content)
            elif ext in ['docx', 'doc']:
                return DocumentParser._parse_word(content)
            elif ext in ['xlsx', 'xls']:
                return DocumentParser._parse_excel(content)
            elif ext == 'csv':
                return DocumentParser._parse_csv(content)
            elif ext in ['jpg', 'jpeg', 'png', 'bmp']:
                return DocumentParser._parse_image(content)
            elif ext in ['md', 'txt', 'py', 'js', 'html', 'css', 'json', 'yml', 'yaml', 'xml']:
                return content.decode('utf-8', errors='ignore')
            else:
                return ""
        except Exception as e:
            logger.error(f"解析文件类型失败 {ext}: {e}")
            return ""

    @staticmethod
    def _parse_pdf(content: bytes) -> str:
        if extract_pdf_text:
            with io.BytesIO(content) as f:
                text = extract_pdf_text(f)
            return text
        return ""

    @staticmethod
    def _parse_word(content: bytes) -> str:
        with io.BytesIO(content) as f:
            result = mammoth.extract_raw_text(f)
            return result.value

    @staticmethod
    def _parse_excel(content: bytes) -> str:
        with io.BytesIO(content) as f:
            dfs = pd.read_excel(f, sheet_name=None)
            text_parts = []
            for sheet_name, df in dfs.items():
                text_parts.append(f"工作表: {sheet_name}")
                text_parts.append(df.to_csv(index=False))
            return "\n".join(text_parts)

    @staticmethod
    def _parse_csv(content: bytes) -> str:
        return content.decode('utf-8', errors='ignore')
        
    @staticmethod
    def _parse_image(content: bytes) -> str:
        """使用 PaddleOCR 解析图像"""
        ocr = DocumentParser.get_ocr()
        if not ocr:
            return "[OCR 不可用]"
            
        result = ocr.ocr(content, cls=True)
        # 结果结构: [[[[points], [text, score]], ...]]
        texts = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) > 1:
                    texts.append(line[1][0])
        return "\n".join(texts)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
        """
        使用 RecursiveCharacterTextSplitter 进行智能文本分块
        """
        if not text:
            return []
            
        splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=overlap)
        return splitter.split_text(text)

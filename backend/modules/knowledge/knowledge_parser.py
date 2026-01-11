import io
import re
import logging
import mammoth
import pandas as pd
import asyncio
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor

# Try importing dependencies
try:
    from pdfminer.high_level import extract_text as extract_pdf_text
except ImportError:
    extract_pdf_text = None

try:
    from paddleocr import PaddleOCR
except ImportError:
    PaddleOCR = None

logger = logging.getLogger(__name__)

class RecursiveCharacterTextSplitter:
    """
    Recursive character text splitter (inspired by LangChain)
    """
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200, separators: List[str] = None):
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap
        self._separators = separators or ["\n\n", "\n", " ", ""]

    def split_text(self, text: str) -> List[str]:
        final_chunks = []
        separator = self._separators[-1]
        
        # Find the best separator
        for _s in self._separators:
            if _s == "":
                separator = _s
                break
            if _s in text:
                separator = _s
                break
                
        # Split
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text) # Split by character
            
        # Merge
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
                    
                    # Handle overlap logic (simplified)
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
            # Initialize OCR (Language: Chinese & English)
            cls._ocr_model = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        return cls._ocr_model

    @staticmethod
    async def parse_file(file_content: bytes, filename: str, content_type: str) -> str:
        """
        Asynchronously parse file content to text
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
            logger.error(f"Failed to parse file type {ext}: {e}")
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
                text_parts.append(f"Sheet: {sheet_name}")
                text_parts.append(df.to_csv(index=False))
            return "\n".join(text_parts)

    @staticmethod
    def _parse_csv(content: bytes) -> str:
        return content.decode('utf-8', errors='ignore')
        
    @staticmethod
    def _parse_image(content: bytes) -> str:
        """Parse image using PaddleOCR"""
        ocr = DocumentParser.get_ocr()
        if not ocr:
            return "[OCR Unavailable]"
            
        result = ocr.ocr(content, cls=True)
        # result structure: [[[[points], [text, score]], ...]]
        texts = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) > 1:
                    texts.append(line[1][0])
        return "\n".join(texts)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
        """
        Smart text chunking using RecursiveCharacterTextSplitter
        """
        if not text:
            return []
            
        splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=overlap)
        return splitter.split_text(text)

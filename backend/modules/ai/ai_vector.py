"""
向量数据库管理器 (ChromaDB)
负责文本的向量化存储与检索
"""

import os
import logging
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Optional

from core.config import get_settings

logger = logging.getLogger(__name__)

class VectorStore:
    _instance = None
    _client = None
    _collection = None
    
    COLLECTION_NAME = "knowledge_base"

    def __init__(self):
        self._init_client()

    @classmethod
    def get_instance(cls):
        if not cls._instance:
            cls._instance = VectorStore()
        return cls._instance

    def _init_client(self):
        """初始化 ChromaDB 客户端"""
        try:
            # 存储路径
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
            persist_path = os.path.join(base_dir, "storage", "modules", "knowledge", "chroma_db")
            os.makedirs(persist_path, exist_ok=True)
            
            logger.info(f"Initializing ChromaDB at {persist_path}")
            
            self._client = chromadb.PersistentClient(
                path=persist_path,
                settings=Settings(anonymized_telemetry=False)
            )
            
            self._collection = self._client.get_or_create_collection(name=self.COLLECTION_NAME)
            logger.debug("ChromaDB initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to verify ChromaDB: {e}")
            self._client = None

    def add_documents(self, documents: List[str], metadatas: List[Dict[str, Any]], ids: List[str]):
        """
        添加文档向量
        :param documents: 文本列表
        :param metadatas: 元数据列表 [{"node_id": 1, "source": "file.pdf"}]
        :param ids: 唯一ID列表 ["node_1_chunk_0", "node_1_chunk_1"]
        """
        if not self._collection:
            return
            
        try:
            self._collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            logger.info(f"Added {len(documents)} chunks to vector store")
        except Exception as e:
            logger.error(f"Vector store add error: {e}")

    def query(self, query_text: str, n_results: int = 5, where: Optional[Dict] = None) -> List[Dict]:
        """
        语义搜索
        :param query_text: 查询文本
        :param n_results: 返回结果数量
        :param where: 过滤条件 {"base_id": 1}
        :return: 结果列表
        """
        if not self._collection:
            return []
            
        try:
            results = self._collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where
            )
            
            # 解析结果格式
            # results 结构: {'ids': [['id1']], 'distances': [[0.1]], 'metadatas': [[{...}]], 'documents': [['text']]}
            parsed_results = []
            if results['ids']:
                ids = results['ids'][0]
                docs = results['documents'][0]
                metas = results['metadatas'][0]
                dists = results['distances'][0] if results['distances'] else [0]*len(ids)
                
                for i in range(len(ids)):
                    parsed_results.append({
                        "id": ids[i],
                        "content": docs[i],
                        "metadata": metas[i],
                        "score": 1 - dists[i] # 距离越小越相似，这里简单反转展示并非准确概率
                    })
            
            return parsed_results
            
        except Exception as e:
            logger.error(f"Vector store query error: {e}")
            return []

    def delete_by_node_id(self, node_id: int):
        """删除指定节点的所有向量"""
        if not self._collection:
            return
            
        try:
            self._collection.delete(
                where={"node_id": node_id}
            )
            logger.info(f"Deleted vectors for node {node_id}")
        except Exception as e:
            logger.error(f"Vector store delete error: {e}")

# 全局变量
_vector_store: Optional[VectorStore] = None

def get_vector_store() -> VectorStore:
    """获取向量数据库单例（延迟初始化）"""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store

# 为了保持兼容性，保留原有的变量名作为代理对象或通过辅助函数访问
# 在业务逻辑中建议调用 get_vector_store()
class VectorStoreProxy:
    def __getattr__(self, name):
        return getattr(get_vector_store(), name)

vector_store = VectorStoreProxy()

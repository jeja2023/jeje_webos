"""
知识库向量存储 (ChromaDB 实现)
提供文档片段的存储、索引与检索功能
"""

import os
import chromadb
from chromadb.utils import embedding_functions
from typing import List, Dict, Optional, Any
import logging

from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)
storage_manager = get_storage_manager()

class KnowledgeVectorStore:
    def __init__(self):
        # 向量数据库存储路径: storage/modules/knowledge/vector_db
        self.persist_path = str(storage_manager.get_module_dir("knowledge", "vector_db"))
        # 预留本地模型路径: storage/modules/knowledge/embedding_models/模型名
        self.models_root = storage_manager.get_module_dir("knowledge", "embedding_models")
        self.model_name = "paraphrase-multilingual-MiniLM-L12-v2"
        self.model_local_path = os.path.join(self.models_root, self.model_name)
        
        # 延迟加载标志
        self._embedding_fn = None
        
        # 初始化 Chroma 客户端 (禁用匿名遥控，防止内网/离线环境下启动缓慢)
        self.client = chromadb.PersistentClient(
            path=self.persist_path,
            settings=chromadb.Settings(anonymized_telemetry=False)
        )
        
        # 获取或创建集合（使用 self 作为 embedding_function 以触发生命周期调用）
        self.collection = self.client.get_or_create_collection(
            name="jeje_knowledge",
            embedding_function=self,
            metadata={"description": "JeJe WebOS Knowledge Base Collection"}
        )

    def name(self) -> str:
        """实现 EmbeddingFunction 接口要求的 name 方法"""
        # 注意：此处必须与数据库中已持久化的名称一致，否则会报错
        return "sentence_transformer"

    def __call__(self, input):
        """实现 EmbeddingFunction 接口，支持懒加载调用"""
        if self._embedding_fn is None:
            self._init_embedding_fn()
        return self._embedding_fn(input)

    def _init_embedding_fn(self):
        """延迟初始化语义向量模型"""
        # 模型选择: 优先使用本地目录，前提是目录存在且包含关键配置文件
        model_source = self.model_name
        try:
            is_local_valid = os.path.exists(self.model_local_path) and os.path.exists(os.path.join(self.model_local_path, "config.json"))
            model_source = self.model_local_path if is_local_valid else self.model_name
            
            if not is_local_valid:
                logger.info(f"未检测到本地向量模型文件 (需存放于: {self.model_local_path})，将尝试从网络加载...")
            else:
                logger.info(f"正在从本地加载向量模型: {self.model_local_path}")

            self._embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=model_source
            )
        except Exception as e:
            logger.warning(f"无法加载语义向量模型 (模型路径: {model_source}), 降级使用基础模型: {e}")
            self._embedding_fn = embedding_functions.DefaultEmbeddingFunction()

    def add_documents(self, documents: List[str], metadatas: List[Dict[str, Any]], ids: List[str]):
        """批量添加文档及元数据"""
        try:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            logger.info(f"成功索引 {len(ids)} 条知识片段")
        except Exception as e:
            logger.error(f"添加向量失败: {e}")

    def query(self, query_text: str, n_results: int = 5, where: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """语义搜索"""
        try:
            results = self.collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where
            )
            
            # 格式化结果
            formatted_results = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    formatted_results.append({
                        "id": results['ids'][0][i],
                        "content": results['documents'][0][i],
                        "metadata": results['metadatas'][0][i],
                        "distance": results['distances'][0][i] if 'distances' in results else None
                    })
            return formatted_results
        except Exception as e:
            logger.error(f"查询向量失败: {e}")
            return []

    def delete_by_node_id(self, node_id: int):
        """删除指定节点的各种向量片段"""
        try:
            self.collection.delete(where={"node_id": node_id})
            logger.info(f"已删除节点 {node_id} 的相关向量")
        except Exception as e:
            logger.error(f"删除向量失败: {e}")

# 全局单例
vector_store = KnowledgeVectorStore()

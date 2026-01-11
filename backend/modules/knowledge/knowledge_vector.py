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
        
        # 1. 文本向量集合 (Text Only)
        # 优化：添加 HNSW 索引参数
        # M: 每个节点的邻居数，ef_construction: 构建索引时的搜索深度
        self.collection = self.client.get_or_create_collection(
            name="jeje_knowledge",
            embedding_function=self,
            metadata={
                "description": "JeJe Knowledge Base Text Collection",
                "hnsw:space": "cosine",
                "hnsw:M": 16,
                "hnsw:construction_ef": 200
            }
        )
        
        # 2. 多模态/视觉向量集合 (CLIP)
        # 注意：多模态通常需要不同的维度和模型
        self.clip_collection = self.client.get_or_create_collection(
            name="jeje_knowledge_clip",
            # 这里暂时传 self，后续通过专门的 CLIP 函数处理输入
            embedding_function=self,
            metadata={
                "description": "JeJe Knowledge Base Image/CLIP Collection", 
                "hnsw:space": "cosine",
                "hnsw:M": 16
            }
        )
        
        # 预留 Reranker 实例容器
        self._reranker = None

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
            self.clip_collection.delete(where={"node_id": node_id}) # Also clear CLIP
            logger.info(f"已删除节点 {node_id} 的文本与多模态向量")
        except Exception as e:
            logger.error(f"删除向量失败: {e}")

    # ---------------- Multi-modal (CLIP) Support ----------------
    
    def _get_clip_fn(self):
        """懒加载 CLIP Embedding Function"""
        if not hasattr(self, '_clip_fn') or self._clip_fn is None:
            try:
                # 尝试使用 sentence-transformers 的 CLIP 实现
                from sentence_transformers import SentenceTransformer
                # 注意：第一次启动会下载约 600MB 模型
                model_name = "clip-ViT-B-32" 
                self._clip_fn = SentenceTransformer(model_name)
                logger.info("CLIP 多模态模型加载成功")
            except Exception as e:
                logger.error(f"CLIP 模型加载失败: {e}")
                self._clip_fn = None
        return self._clip_fn

    def add_image(self, node_id: int, base_id: int, image_path: str, title: str):
        """对图片进行多模态编码并存入 clip_collection"""
        clip_model = self._get_clip_fn()
        if not clip_model: return
        
        try:
            from PIL import Image
            img = Image.open(image_path)
            # 生成图片向量
            img_emb = clip_model.encode(img).tolist()
            
            self.clip_collection.add(
                embeddings=[img_emb],
                metadatas=[{
                    "node_id": node_id,
                    "base_id": base_id,
                    "title": title,
                    "type": "image"
                }],
                ids=[f"img_{node_id}"]
            )
            logger.info(f"成功为图片节点 {node_id} 建立视觉索引")
        except Exception as e:
            logger.error(f"图片索引失败: {e}")

    def query_multi_modal(self, query: str, n_results: int = 5, where: Optional[Dict] = None):
        """多模态搜索：用文字找图片"""
        clip_model = self._get_clip_fn()
        if not clip_model: return []
        
        try:
            # 将查询文本转为 CLIP 向量空间
            query_emb = clip_model.encode(query).tolist()
            
            results = self.clip_collection.query(
                query_embeddings=[query_emb],
                n_results=n_results,
                where=where
            )
            
            formatted = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    formatted.append({
                        "node_id": results['metadatas'][0][i]['node_id'],
                        "title": results['metadatas'][0][i]['title'],
                        "score": 1.0 / (1.0 + results['distances'][0][i]) if 'distances' in results else 0,
                        "type": "image"
                    })
            return formatted
        except Exception as e:
            logger.error(f"多模态查询失败: {e}")
            return []

    # ---------------- Reranking (Cross-Encoder) ----------------

    def _get_reranker(self):
        """懒加载 Reranker 模型"""
        if self._reranker is None:
            try:
                from sentence_transformers import CrossEncoder
                # 使用高性能的中英双语 Reranker
                model_name = "BAAI/bge-reranker-base"
                # 实际部署时建议下载到本地 local_path
                self._reranker = CrossEncoder(model_name, max_length=512)
                logger.info(f"Reranker 模型 {model_name} 加载成功")
            except Exception as e:
                logger.error(f"Reranker 加载失败: {e}")
                return None
        return self._reranker

    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_n: int = 10) -> List[Dict[str, Any]]:
        """利用 Cross-Encoder 对候选结果进行精细重排序"""
        model = self._get_reranker()
        if not model or not candidates:
            return candidates[:top_n]
            
        try:
            # 准备评分对
            pairs = [[query, c.get("content", "")] for c in candidates]
            # 执行评分 (计算密集型)
            scores = model.predict(pairs)
            
            # 更新分数并重新排序
            for i, score in enumerate(scores):
                candidates[i]["rerank_score"] = float(score)
                # 综合考虑原始分数和重排序分数 (或者完全信任重排序)
                candidates[i]["score"] = float(score) 
                
            # 排序
            reranked = sorted(candidates, key=lambda x: x["score"], reverse=True)
            return reranked[:top_n]
        except Exception as e:
            logger.error(f"重排序失败: {e}")
            return candidates[:top_n]

# 全局单例
vector_store = KnowledgeVectorStore()

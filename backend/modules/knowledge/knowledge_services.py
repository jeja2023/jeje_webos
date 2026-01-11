"""
知识库模块业务逻辑 Service
"""

import os
import shutil
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_, and_
from typing import List, Optional, Dict, Any
from fastapi import UploadFile

from utils.storage import get_storage_manager
from .knowledge_models import KnowledgeBase, KnowledgeNode
from .knowledge_schemas import KbBaseCreate, KbBaseUpdate, KbNodeCreate, KbNodeUpdate
from .knowledge_parser import DocumentParser
from .knowledge_vector import vector_store

storage_manager = get_storage_manager()

class KnowledgeService:
    
    # ---------------- Knowledge Base ----------------
    
    @staticmethod
    async def create_base(db: AsyncSession, user_id: int, data: KbBaseCreate) -> KnowledgeBase:
        base = KnowledgeBase(owner_id=user_id, **data.model_dump())
        db.add(base)
        await db.commit()
        await db.refresh(base)
        return base

    @staticmethod
    async def get_bases(db: AsyncSession, user_id: int) -> List[KnowledgeBase]:
        stmt = select(KnowledgeBase).where(
            or_(KnowledgeBase.owner_id == user_id, KnowledgeBase.is_public == True)
        ).order_by(KnowledgeBase.created_at.desc())
        result = await db.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    async def get_base(db: AsyncSession, base_id: int) -> Optional[KnowledgeBase]:
        return await db.get(KnowledgeBase, base_id)

    @staticmethod
    async def delete_base(db: AsyncSession, base_id: int):
        stmt = delete(KnowledgeBase).where(KnowledgeBase.id == base_id)
        await db.execute(stmt)
        await db.commit()
        # TODO: Cleanup vectors for all nodes in this base? 
        # Actually better to delete vectors node by node or use base_id metadata filtering
        # For now, let's leave it simple

    # ---------------- Knowledge Node ----------------
    
    @staticmethod
    async def create_node(db: AsyncSession, user_id: int, data: KbNodeCreate) -> KnowledgeNode:
        node = KnowledgeNode(created_by=user_id, **data.model_dump())
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        # 如果是纯文本内容（非文件上传），也建立索引
        if node.content and node.node_type == 'document':
            await KnowledgeService._index_node_content(node)
            
        return node
        
    @staticmethod
    async def get_node(db: AsyncSession, node_id: int) -> Optional[KnowledgeNode]:
        return await db.get(KnowledgeNode, node_id)

    @staticmethod
    async def update_node(db: AsyncSession, node_id: int, data: KbNodeUpdate) -> Optional[KnowledgeNode]:
        node = await db.get(KnowledgeNode, node_id)
        if not node:
            return None
            
        update_data = data.model_dump(exclude_unset=True)
        content_changed = "content" in update_data
        
        for key, value in update_data.items():
            setattr(node, key, value)
            
        await db.commit()
        await db.refresh(node)
        
        if content_changed and node.content:
             await KnowledgeService._index_node_content(node)
             
        return node
        
    @staticmethod
    async def delete_node(db: AsyncSession, node_id: int):
        # Delete vectors
        vector_store.delete_by_node_id(node_id)
        
        # Delete DB record
        stmt = delete(KnowledgeNode).where(KnowledgeNode.id == node_id)
        await db.execute(stmt)
        await db.commit()

    @staticmethod
    async def get_tree_nodes(db: AsyncSession, base_id: int) -> List[KnowledgeNode]:
        stmt = select(KnowledgeNode).where(KnowledgeNode.base_id == base_id).order_by(KnowledgeNode.sort_order)
        result = await db.execute(stmt)
        nodes = result.scalars().all()
        return nodes

    # ---------------- File Handling ----------------
    
    # ---------------- File Handling ----------------
    
    @staticmethod
    async def upload_file(db: AsyncSession, user_id: int, base_id: int, parent_id: Optional[int], file: UploadFile) -> KnowledgeNode:
        """
        处理文件上传：仅保存文件和创建记录，后续解析异步进行
        """
        # 1. Save File
        # Path: storage/modules/knowledge/files/{base_id}/{filename}
        relative_path = f"files/{base_id}"
        save_dir = storage_manager.get_module_dir("knowledge", relative_path)
        os.makedirs(save_dir, exist_ok=True)
        
        # Unique filename to prevent overwrite
        safe_filename = f"{int(os.times().elapsed)}_{file.filename}" 
        file_path = os.path.join(save_dir, safe_filename)
        
        # Write file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
            
        # 2. Create Node with 'processing' status
        node = KnowledgeNode(
            base_id=base_id,
            parent_id=parent_id,
            title=file.filename,
            node_type="file",
            file_path=str(file_path),
            file_meta={
                "size": len(content),
                "mime": file.content_type,
                "ext": file.filename.split('.')[-1] if '.' in file.filename else ''
            },
            created_by=user_id,
            status="processing" # Mark as processing
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        return node

    @staticmethod
    async def process_file_background(db: AsyncSession, node_id: int):
        """
        后台任务：解析文件内容并向量化
        """
        node = await db.get(KnowledgeNode, node_id)
        if not node or not node.file_path:
            return
            
        try:
            # 读取文件内容
            if not os.path.exists(node.file_path):
                raise FileNotFoundError(f"File not found: {node.file_path}")
                
            with open(node.file_path, "rb") as f:
                content = f.read()
            
            # 解析内容
            # Note: We need original filename for extension detection, which is in node.title usually
            extracted_text = await DocumentParser.parse_file(content, node.title, node.file_meta.get('mime'))
            
            # 3. 多模态索引 (Multi-modal Visual Index)
            if node.file_meta.get('mime', '').startswith('image/') and node.file_path:
                try:
                    vector_store.add_image(node.id, node.base_id, node.file_path, node.title)
                except Exception as vis_err:
                    logging.getLogger(__name__).warning(f"Visual indexing failed for node {node_id}: {vis_err}")

            if extracted_text:
                node.content = extracted_text
                
                # 1. 向量化索引 (Semantic Vector Index)
                await KnowledgeService._index_node_content(node)
                
                # 2. 知识图谱索引 (Graph Index Sync)
                try:
                    from .knowledge_graph_service import KnowledgeGraphService
                    await KnowledgeGraphService.extract_and_save(db, node.base_id, node.id, node.content)
                except Exception as graph_err:
                    logging.getLogger(__name__).warning(f"Graph extraction skipped for node {node_id}: {graph_err}")
            else:
                 node.content = "（无文本内容或解析失败）"

            node.status = "published"
            await db.commit()
            
        except Exception as e:
            # 记录错误状态
            import logging
            logging.getLogger(__name__).error(f"Background processing failed for node {node_id}: {e}")
            node.status = "error"
            node.description = f"解析失败: {str(e)}"
            await db.commit()


    @staticmethod
    async def _index_node_content(node: KnowledgeNode):
        """Helper to index node content into ChromaDB"""
        if not node.content:
            return
            
        # Clear old vectors first
        vector_store.delete_by_node_id(node.id)
        
        # Chunk text
        chunks = DocumentParser.chunk_text(node.content)
        if not chunks:
            return
            
        # Prepare data
        ids = [f"node_{node.id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [{
            "node_id": node.id,
            "base_id": node.base_id,
            "title": node.title,
            "type": node.node_type
        } for _ in chunks]
        
        # Add to vector store
        vector_store.add_documents(chunks, metadatas, ids)

    # ---------------- Search ----------------
    
    @classmethod
    async def search(cls, db: AsyncSession, base_id: Optional[int], q: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        混合搜索 (Hybrid Search) + 元数据过滤 + 重排序 (Rerank)
        """
        # 1. 构造过滤条件 (ChromaDB 格式)
        chroma_where = {"base_id": base_id} if base_id else {}
        if filters:
            if filters.get("type"):
                chroma_where["node_type"] = filters["type"]
            
        # 2. Vector Search (Semantic Text & Visual)
        vector_results = vector_store.query(q, n_results=30, where=chroma_where)
        visual_results = vector_store.query_multi_modal(q, n_results=15, where=chroma_where)
        
        candidates = {}
        
        # 处理文本向量召回
        for res in vector_results:
            nid = res['metadata']['node_id']
            score = 1.0 / (1.0 + res['distance']) if res.get('distance') is not None else 1.0
            if nid not in candidates:
                candidates[nid] = {
                    "node_id": nid, "score": 0.0, "vector_score": 0.0, "keyword_score": 0.0, "visual_score": 0.0,
                    "content": res['content'], "metadata": res['metadata'], "sources": []
                }
            candidates[nid]["vector_score"] = score
            candidates[nid]["sources"].append("语义")
            
        # 处理视觉召回
        for vr in visual_results:
            nid = vr['node_id']
            if nid not in candidates:
                candidates[nid] = {
                    "node_id": nid, "score": 0.0, "vector_score": 0.0, "keyword_score": 0.0, "visual_score": 0.0,
                    "content": "[图片内容]", "metadata": {"node_id": nid, "title": vr['title'], "type": "image"},
                    "sources": []
                }
            candidates[nid]["visual_score"] = vr['score']
            candidates[nid]["sources"].append("视觉")

        # 3. Keyword Search (SQL LIKE)
        sql_conditions = [
            or_(KnowledgeNode.title.like(f"%{q}%"), KnowledgeNode.content.like(f"%{q}%"))
        ]
        if base_id:
            sql_conditions.append(KnowledgeNode.base_id == base_id)
        if filters and filters.get("type"):
            sql_conditions.append(KnowledgeNode.node_type == filters["type"])
            
        stmt = select(KnowledgeNode).where(and_(*sql_conditions)).limit(20)
        result = await db.execute(stmt)
        nodes = result.scalars().all()
        
        for n in nodes:
            if n.id not in candidates:
                candidates[n.id] = {
                    "node_id": n.id, "score": 0.0, "vector_score": 0.0, "keyword_score": 0.4, "visual_score": 0.0,
                    "content": n.content[:200] if n.content else "", "metadata": {"title": n.title, "node_type": n.node_type},
                    "sources": ["关键词"]
                }
            else:
                candidates[n.id]["keyword_score"] = 0.8
                if "关键词" not in candidates[n.id]["sources"]:
                    candidates[n.id]["sources"].append("关键词")

        # 4. Fusion
        alpha, beta, gamma = 0.5, 0.2, 0.3
        fusion_results = []
        for nid, item in candidates.items():
            item["score"] = (item.get("vector_score", 0) * alpha) + \
                            (item.get("keyword_score", 0) * beta) + \
                            (item.get("visual_score", 0) * gamma)
            fusion_results.append(item)
            
        # 5. Reranking
        sorted_fusion = sorted(fusion_results, key=lambda x: x["score"], reverse=True)[:20]
        final_results = await asyncio.to_thread(vector_store.rerank, q, sorted_fusion, 10)
        
        for item in final_results:
            item["highlight"] = item["content"]
            
        return final_results

"""
知识库模块业务逻辑 Service
"""

import os
import shutil
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_
from typing import List, Optional
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
    
    @staticmethod
    async def upload_file(db: AsyncSession, user_id: int, base_id: int, parent_id: Optional[int], file: UploadFile) -> KnowledgeNode:
        """
        处理文件上传：保存文件 -> 创建节点 -> 解析内容 -> 向量化
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
            
        # 2. Create Node
        node = KnowledgeNode(
            base_id=base_id,
            parent_id=parent_id,
            title=file.filename,
            node_type="file", # explicit file type
            file_path=file_path,
            file_meta={
                "size": len(content),
                "mime": file.content_type,
                "ext": file.filename.split('.')[-1] if '.' in file.filename else ''
            },
            created_by=user_id,
            status="published"
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        # 3. Parse Content
        extracted_text = await DocumentParser.parse_file(content, file.filename, file.content_type)
        if extracted_text:
            node.content = extracted_text
            await db.commit() # Update DB with extracted text for preview
            
            # 4. Vectorize
            await KnowledgeService._index_node_content(node)
            
        return node

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
    
    @staticmethod
    async def search(db: AsyncSession, base_id: Optional[int], q: str):
        """语义搜索"""
        where = {"base_id": base_id} if base_id else None
        results = vector_store.query(q, n_results=10, where=where)
        return results

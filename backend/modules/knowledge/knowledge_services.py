"""
知识库模块业务逻辑 Service
"""

import os
import shutil
import asyncio
import logging
import hashlib
from cachetools import TTLCache
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_, and_
from typing import List, Optional, Dict, Any
from fastapi import UploadFile

from utils.storage import get_storage_manager
from .knowledge_models import KnowledgeBase, KnowledgeNode
from .knowledge_schemas import KbBaseCreate, KbBaseUpdate, KbNodeCreate, KbNodeUpdate
from .knowledge_parser import DocumentParser
from .knowledge_vector import vector_store

logger = logging.getLogger(__name__)
storage_manager = get_storage_manager()

# 搜索结果缓存 (最多100条记录，5分钟过期)
_search_cache = TTLCache(maxsize=100, ttl=300)


class KnowledgeService:
    
    # ==================== 知识库管理 ====================
    
    @staticmethod
    async def create_base(db: AsyncSession, user_id: int, data: KbBaseCreate) -> KnowledgeBase:
        """创建知识库"""
        base = KnowledgeBase(owner_id=user_id, **data.model_dump())
        db.add(base)
        await db.commit()
        await db.refresh(base)
        return base

    @staticmethod
    async def get_bases(db: AsyncSession, user_id: int) -> List[KnowledgeBase]:
        """获取用户可访问的知识库列表"""
        stmt = select(KnowledgeBase).where(
            or_(KnowledgeBase.owner_id == user_id, KnowledgeBase.is_public == True)
        ).order_by(KnowledgeBase.created_at.desc())
        result = await db.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    async def get_base(db: AsyncSession, base_id: int) -> Optional[KnowledgeBase]:
        """获取知识库详情"""
        return await db.get(KnowledgeBase, base_id)

    @staticmethod
    async def update_base(db: AsyncSession, base_id: int, data: KbBaseUpdate) -> Optional[KnowledgeBase]:
        """更新知识库信息"""
        base = await db.get(KnowledgeBase, base_id)
        if not base:
            return None
            
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(base, key, value)
            
        await db.commit()
        await db.refresh(base)
        return base

    @staticmethod
    async def delete_base(db: AsyncSession, base_id: int):
        """删除知识库及其所有关联数据"""
        # 获取知识库下所有节点ID，用于清理向量数据
        stmt = select(KnowledgeNode.id).where(KnowledgeNode.base_id == base_id)
        result = await db.execute(stmt)
        node_ids = [row[0] for row in result.fetchall()]
        
        # 批量清理向量索引
        for node_id in node_ids:
            try:
                vector_store.delete_by_node_id(node_id)
            except Exception as e:
                logger.warning(f"清理节点 {node_id} 向量时出错: {e}")
        
        # 删除数据库记录（级联删除节点、实体、关系）
        stmt = delete(KnowledgeBase).where(KnowledgeBase.id == base_id)
        await db.execute(stmt)
        await db.commit()
        
        # 清理相关搜索缓存
        KnowledgeService._invalidate_search_cache(base_id)
        
        logger.info(f"已删除知识库 {base_id}，共清理 {len(node_ids)} 个节点的向量数据")

    @staticmethod
    def _invalidate_search_cache(base_id: Optional[int] = None):
        """清理搜索缓存"""
        if base_id:
            # 清理指定知识库的缓存
            keys_to_delete = [k for k in _search_cache.keys() if k.startswith(f"{base_id}:")]
            for key in keys_to_delete:
                _search_cache.pop(key, None)
        else:
            # 清理所有缓存
            _search_cache.clear()

    # ==================== 节点管理 ====================
    
    @staticmethod
    async def create_node(db: AsyncSession, user_id: int, data: KbNodeCreate) -> KnowledgeNode:
        """创建知识节点"""
        node = KnowledgeNode(created_by=user_id, **data.model_dump())
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        # 如果是文档且有内容，建立向量索引
        if node.content and node.node_type == 'document':
            await KnowledgeService._index_node_content(node)
            
        # 清理相关缓存
        KnowledgeService._invalidate_search_cache(node.base_id)
            
        return node
        
    @staticmethod
    async def get_node(db: AsyncSession, node_id: int) -> Optional[KnowledgeNode]:
        """获取节点详情"""
        return await db.get(KnowledgeNode, node_id)

    @staticmethod
    async def update_node(db: AsyncSession, node_id: int, data: KbNodeUpdate) -> Optional[KnowledgeNode]:
        """更新节点信息"""
        node = await db.get(KnowledgeNode, node_id)
        if not node:
            return None
            
        update_data = data.model_dump(exclude_unset=True)
        content_changed = "content" in update_data
        
        for key, value in update_data.items():
            setattr(node, key, value)
            
        await db.commit()
        await db.refresh(node)
        
        # 内容变更时重建向量索引
        if content_changed and node.content:
            await KnowledgeService._index_node_content(node)
            KnowledgeService._invalidate_search_cache(node.base_id)
             
        return node
        
    @staticmethod
    async def delete_node(db: AsyncSession, node_id: int):
        """删除节点及其向量索引"""
        node = await db.get(KnowledgeNode, node_id)
        base_id = node.base_id if node else None
        
        # 删除向量索引
        vector_store.delete_by_node_id(node_id)
        
        # 删除数据库记录
        stmt = delete(KnowledgeNode).where(KnowledgeNode.id == node_id)
        await db.execute(stmt)
        await db.commit()
        
        # 清理相关缓存
        if base_id:
            KnowledgeService._invalidate_search_cache(base_id)

    @staticmethod
    async def get_tree_nodes(db: AsyncSession, base_id: int) -> List[KnowledgeNode]:
        """获取知识库下所有节点列表"""
        stmt = select(KnowledgeNode).where(KnowledgeNode.base_id == base_id).order_by(KnowledgeNode.sort_order)
        result = await db.execute(stmt)
        nodes = result.scalars().all()
        return nodes
    
    @staticmethod
    async def batch_update_sort(db: AsyncSession, updates: List[Dict[str, int]]):
        """批量更新节点排序"""
        for item in updates:
            stmt = update(KnowledgeNode).where(
                KnowledgeNode.id == item["node_id"]
            ).values(
                sort_order=item["sort_order"],
                parent_id=item.get("parent_id")
            )
            await db.execute(stmt)
        await db.commit()

    # ==================== 文件处理 ====================
    
    @staticmethod
    async def upload_file(db: AsyncSession, user_id: int, base_id: int, parent_id: Optional[int], file: UploadFile) -> KnowledgeNode:
        """
        处理文件上传：保存文件并创建节点记录
        实际的文件解析在后台异步执行
        """
        # 构建存储路径
        relative_path = f"files/{base_id}"
        save_dir = storage_manager.get_module_dir("knowledge", relative_path)
        os.makedirs(save_dir, exist_ok=True)
        
        # 使用时间戳防止文件名冲突
        safe_filename = f"{int(os.times().elapsed)}_{file.filename}" 
        file_path = os.path.join(save_dir, safe_filename)
        
        # 写入文件
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
            
        # 创建节点记录，状态设为处理中
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
            status="processing"
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        return node

    @staticmethod
    async def process_file_background(db: AsyncSession, node_id: int):
        """
        后台任务：解析文件内容并建立索引
        包括文本向量索引、视觉索引和知识图谱提取
        """
        node = await db.get(KnowledgeNode, node_id)
        if not node or not node.file_path:
            return
            
        try:
            # 读取文件内容
            if not os.path.exists(node.file_path):
                raise FileNotFoundError(f"文件未找到: {node.file_path}")
                
            with open(node.file_path, "rb") as f:
                content = f.read()
            
            # 解析文件内容为文本
            extracted_text = await DocumentParser.parse_file(content, node.title, node.file_meta.get('mime'))
            
            # 多模态索引：为图片建立视觉索引
            if node.file_meta.get('mime', '').startswith('image/') and node.file_path:
                try:
                    vector_store.add_image(node.id, node.base_id, node.file_path, node.title)
                except Exception as e:
                    logger.warning(f"节点 {node_id} 视觉索引建立失败: {e}")

            if extracted_text:
                node.content = extracted_text
                
                # 建立语义向量索引
                await KnowledgeService._index_node_content(node)
                
                # 提取知识图谱
                try:
                    from .knowledge_graph_service import KnowledgeGraphService
                    await KnowledgeGraphService.extract_and_save(db, node.base_id, node.id, node.content)
                except Exception as e:
                    logger.warning(f"节点 {node_id} 知识图谱提取跳过: {e}")
            else:
                node.content = "（无文本内容或解析失败）"

            node.status = "published"
            await db.commit()
            
            # 清理相关搜索缓存
            KnowledgeService._invalidate_search_cache(node.base_id)
            
        except Exception as e:
            logger.error(f"节点 {node_id} 后台处理失败: {e}")
            node.status = "error"
            node.content = f"解析失败: {str(e)}"
            await db.commit()


    @staticmethod
    async def _index_node_content(node: KnowledgeNode):
        """将节点内容分块并索引到向量数据库"""
        if not node.content:
            return
            
        # 先清除旧的向量索引
        vector_store.delete_by_node_id(node.id)
        
        # 文本分块
        chunks = DocumentParser.chunk_text(node.content)
        if not chunks:
            return
            
        # 准备向量数据
        ids = [f"node_{node.id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [{
            "node_id": node.id,
            "base_id": node.base_id,
            "title": node.title,
            "type": node.node_type
        } for _ in chunks]
        
        # 添加到向量存储
        vector_store.add_documents(chunks, metadatas, ids)

    # ==================== 搜索功能 ====================
    
    @classmethod
    async def search(cls, db: AsyncSession, base_id: Optional[int], q: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        混合搜索：结合语义向量搜索、视觉搜索和关键词搜索
        支持元数据过滤和结果重排序
        """
        # 检查缓存
        filter_str = str(sorted(filters.items())) if filters else ""
        cache_key = f"{base_id}:{q}:{filter_str}"
        
        if cache_key in _search_cache:
            logger.info(f"搜索命中缓存: {cache_key[:50]}")
            return _search_cache[cache_key]
        
        # 构造向量库过滤条件
        chroma_where = {"base_id": base_id} if base_id else {}
        if filters and filters.get("type"):
            chroma_where["node_type"] = filters["type"]
            
        # 执行语义向量搜索
        vector_results = vector_store.query(q, n_results=30, where=chroma_where)
        
        # 执行多模态视觉搜索
        visual_results = vector_store.query_multi_modal(q, n_results=15, where=chroma_where)
        
        candidates = {}
        
        # 处理语义向量召回结果
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
            
        # 处理视觉召回结果
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

        # 执行关键词搜索
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
        
        # 处理关键词召回结果
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

        # 多路召回融合评分
        # 权重: 语义50%, 关键词20%, 视觉30%
        alpha, beta, gamma = 0.5, 0.2, 0.3
        fusion_results = []
        for nid, item in candidates.items():
            item["score"] = (item.get("vector_score", 0) * alpha) + \
                            (item.get("keyword_score", 0) * beta) + \
                            (item.get("visual_score", 0) * gamma)
            fusion_results.append(item)
            
        # 精排重排序
        sorted_fusion = sorted(fusion_results, key=lambda x: x["score"], reverse=True)[:20]
        final_results = await asyncio.to_thread(vector_store.rerank, q, sorted_fusion, 10)
        
        # 设置高亮字段
        for item in final_results:
            item["highlight"] = item["content"]
        
        # 写入缓存
        _search_cache[cache_key] = final_results
            
        return final_results


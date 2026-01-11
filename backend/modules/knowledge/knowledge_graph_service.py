"""
知识图谱提取服务
利用大模型提取文档中的实体和关系
"""

import json
import logging
import re
from typing import List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from modules.ai.ai_service import AIService
from .knowledge_models import KnowledgeEntity, KnowledgeRelation

logger = logging.getLogger(__name__)

class KnowledgeGraphService:
    @staticmethod
    async def extract_and_save(db: AsyncSession, base_id: int, node_id: int, content: str):
        """
        从文本中提取实体和关系并保存到数据库
        """
        if not content or len(content) < 50:
            return
            
        try:
            # 1. 调用 LLM 提取 triples
            triples = await KnowledgeGraphService._extract_triples_with_llm(content)
            if not triples:
                return
                
            # 2. 保存实体
            # 为了简单起见，同名实体在同一知识库下视为同一个
            entity_map = {} # name -> entity_id
            
            for item in triples:
                source = item.get("source")
                target = item.get("target")
                rel_type = item.get("relation")
                
                if not source or not target or not rel_type:
                    continue
                    
                s_id = await KnowledgeGraphService._get_or_create_entity(
                    db, base_id, node_id, source, item.get("source_type", "概念")
                )
                t_id = await KnowledgeGraphService._get_or_create_entity(
                    db, base_id, node_id, target, item.get("target_type", "概念")
                )
                
                # 3. 保存关系
                await KnowledgeGraphService._create_relation(
                    db, base_id, s_id, t_id, rel_type, item.get("description", "")
                )
                
            await db.commit()
            logger.info(f"成功为节点 {node_id} 提取并同步了 {len(triples)} 条知识关系")
            
        except Exception as e:
            logger.error(f"提取知识图谱失败: {e}")

    @staticmethod
    def _clean_json_string(raw: str) -> str:
        """从 LLM 返回的内容中提取 JSON 块"""
        match = re.search(r'\[\s*{.*}\s*\]', raw, re.DOTALL)
        if match:
            return match.group(0)
        return raw

    @staticmethod
    async def _extract_triples_with_llm(content: str) -> List[Dict[str, str]]:
        """利用 LLM 提取知识三元组"""
        # 截取前 2000 字，避免模型窗口溢出
        text_segment = content[:2000]
        
        prompt = f"""
你是一个专业的知识图谱专家。请从以下文本中提取关键实体及其相互关系。
要求：
1. 以 JSON 数组格式返回，包含字段：source (实体A), target (实体B), relation (关系), source_type (实体A类型), target_type (实体B类型).
2. 实体类型可选：人物, 机构, 地点, 概念, 技术, 事件, 时间.
3. 关系尽可能简洁。
4. 只返回 JSON，不要任何解释。

文本：
---
{text_segment}
---
"""
        messages = [{"role": "user", "content": prompt}]
        
        try:
            # 使用本地模型或在线 API (优先在线更稳定)
            # 这里调用 AIService.chat_with_context
            response_gen = await AIService.chat_with_context(
                query=prompt, 
                history=[],
                provider="online" # 知识提取通常需要较强的逻辑能力，优先使用在线模型
            )
            
            # 收集结果
            full_response = ""
            async for chunk in response_gen:
                if 'choices' in chunk and len(chunk['choices']) > 0:
                    delta = chunk['choices'][0].get('delta', {})
                    if 'content' in delta:
                        full_response += delta['content']
            
            # 解析 JSON
            json_str = KnowledgeGraphService._clean_json_string(full_response)
            return json.loads(json_str)
            
        except Exception as e:
            logger.warning(f"LLM 提取三元组失败: {e}")
            return []

    @staticmethod
    async def _get_or_create_entity(db: AsyncSession, base_id: int, node_id: int, name: str, e_type: str) -> int:
        """根据名称获取或创建实体"""
        stmt = select(KnowledgeEntity).where(
            KnowledgeEntity.base_id == base_id,
            KnowledgeEntity.name == name
        )
        result = await db.execute(stmt)
        entity = result.scalar_one_or_none()
        
        if not entity:
            entity = KnowledgeEntity(
                base_id=base_id,
                node_id=node_id,
                name=name,
                entity_type=e_type
            )
            db.add(entity)
            await db.flush() # 获取 ID
        return entity.id

    @staticmethod
    async def _create_relation(db: AsyncSession, base_id: int, s_id: int, t_id: int, r_type: str, desc: str):
        """记录关系 (去重)"""
        stmt = select(KnowledgeRelation).where(
            KnowledgeRelation.base_id == base_id,
            KnowledgeRelation.source_id == s_id,
            KnowledgeRelation.target_id == t_id,
            KnowledgeRelation.relation_type == r_type
        )
        result = await db.execute(stmt)
        if not result.scalar_one_or_none():
            rel = KnowledgeRelation(
                base_id=base_id,
                source_id=s_id,
                target_id=t_id,
                relation_type=r_type,
                description=desc
            )
            db.add(rel)

    @staticmethod
    async def get_graph(db: AsyncSession, base_id: int) -> Dict[str, Any]:
        """获取知识库的完整图谱数据 (用于可视化)"""
        # 1. 查询所有实体
        e_stmt = select(KnowledgeEntity).where(KnowledgeEntity.base_id == base_id)
        e_result = await db.execute(e_stmt)
        entities = e_result.scalars().all()
        
        # 2. 查询所有关系
        r_stmt = select(KnowledgeRelation).where(KnowledgeRelation.base_id == base_id)
        r_result = await db.execute(r_stmt)
        relations = r_result.scalars().all()
        
        # 3. 格式化为前端图谱库 (如 Cytoscape/ECharts) 易读的格式
        nodes = []
        for e in entities:
            nodes.append({
                "id": f"e_{e.id}",
                "name": e.name,
                "type": e.entity_type,
                "node_id": e.node_id
            })
            
        edges = []
        for r in relations:
            edges.append({
                "id": f"r_{r.id}",
                "source": f"e_{r.source_id}",
                "target": f"e_{r.target_id}",
                "label": r.relation_type
            })
            
        return {
            "nodes": nodes,
            "edges": edges
        }

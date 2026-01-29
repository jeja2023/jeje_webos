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
    
    # 文本分段参数
    CHUNK_SIZE = 2000
    CHUNK_OVERLAP = 200
    
    @staticmethod
    async def extract_and_save(db: AsyncSession, base_id: int, node_id: int, content: str):
        """从文本中提取实体和关系并保存到数据库"""
        if not content or len(content) < 50:
            return
            
        try:
            # 使用滑动窗口处理长文档
            all_triples = []
            for segment in KnowledgeGraphService._sliding_window(content):
                triples = await KnowledgeGraphService._extract_triples_with_llm(segment)
                all_triples.extend(triples)
            
            if not all_triples:
                return
            
            # 去重三元组
            unique_triples = KnowledgeGraphService._deduplicate_triples(all_triples)
                
            # 保存实体和关系
            entity_map = {}
            
            for item in unique_triples:
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
                
                await KnowledgeGraphService._create_relation(
                    db, base_id, s_id, t_id, rel_type, item.get("description", "")
                )
                
            await db.commit()
            logger.info(f"成功为节点 {node_id} 提取并同步了 {len(unique_triples)} 条知识关系")
            
        except Exception as e:
            logger.error(f"提取知识图谱失败: {e}")

    @staticmethod
    def _sliding_window(content: str) -> List[str]:
        """滑动窗口分割长文本"""
        segments = []
        start = 0
        while start < len(content):
            end = min(start + KnowledgeGraphService.CHUNK_SIZE, len(content))
            segments.append(content[start:end])
            if end >= len(content):
                break
            start = end - KnowledgeGraphService.CHUNK_OVERLAP
        return segments

    @staticmethod
    def _deduplicate_triples(triples: List[Dict]) -> List[Dict]:
        """三元组去重"""
        seen = set()
        unique = []
        for t in triples:
            key = (t.get("source", ""), t.get("relation", ""), t.get("target", ""))
            if key not in seen:
                seen.add(key)
                unique.append(t)
        return unique

    @staticmethod
    def _clean_json_string(raw: str) -> str:
        """从大模型返回内容中提取JSON数组"""
        match = re.search(r'\[\s*{.*}\s*\]', raw, re.DOTALL)
        if match:
            return match.group(0)
        return raw

    @staticmethod
    async def _extract_triples_with_llm(content: str) -> List[Dict[str, str]]:
        """利用大模型提取知识三元组"""
        prompt = f"""
你是一个专业的知识图谱专家。请从以下文本中提取关键实体及其相互关系。
要求：
1. 以 JSON 数组格式返回，包含字段：source (实体A), target (实体B), relation (关系), source_type (实体A类型), target_type (实体B类型).
2. 实体类型可选：人物, 机构, 地点, 概念, 技术, 事件, 时间.
3. 关系尽可能简洁。
4. 只返回 JSON，不要任何解释。

文本：
---
{content}
---
"""
        messages = [{"role": "user", "content": prompt}]
        
        try:
            # 优先使用在线模型（如 DeepSeek）以获得更精准的提取效果
            response_gen = await AIService.chat_with_context(
                query=prompt, 
                history=[],
                provider="online"
            )
            
            # 收集结果
            full_response = ""
            async for chunk in response_gen:
                if 'choices' in chunk and len(chunk['choices']) > 0:
                    delta = chunk['choices'][0].get('delta', {})
                    if 'content' in delta:
                        full_response += delta['content']
            
            # 解析JSON
            json_str = KnowledgeGraphService._clean_json_string(full_response)
            return json.loads(json_str)
            
        except Exception as e:
            # 降级：如果在线 API 不可用或未配置，尝试使用本地模型
            if "未配置在线 API Key" in str(e) or "API 请求失败" in str(e):
                logger.debug("在线 API 不可用，尝试降级到本地模型提取三元组...")
                try:
                    response_gen = await AIService.chat_with_context(
                        query=prompt,
                        history=[],
                        provider="local"
                    )
                    full_response = ""
                    async for chunk in response_gen:
                        if 'choices' in chunk and len(chunk['choices']) > 0:
                            delta = chunk['choices'][0].get('delta', {})
                            if 'content' in delta:
                                full_response += delta['content']
                    
                    json_str = KnowledgeGraphService._clean_json_string(full_response)
                    return json.loads(json_str)
                except Exception as local_e:
                    logger.warning(f"本地模型提取三元组也失败了: {local_e}")
            else:
                logger.warning(f"大模型提取三元组失败: {e}")
            return []

    @staticmethod
    async def _get_or_create_entity(db: AsyncSession, base_id: int, node_id: int, name: str, e_type: str) -> int:
        """根据名称获取或创建实体，同名实体在同一知识库下视为同一个"""
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
            await db.flush()
        return entity.id

    @staticmethod
    async def _create_relation(db: AsyncSession, base_id: int, s_id: int, t_id: int, r_type: str, desc: str):
        """创建实体关系，自动去重"""
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
        """获取知识库的完整图谱数据，用于前端可视化"""
        # 查询所有实体
        e_stmt = select(KnowledgeEntity).where(KnowledgeEntity.base_id == base_id)
        e_result = await db.execute(e_stmt)
        entities = e_result.scalars().all()
        
        # 查询所有关系
        r_stmt = select(KnowledgeRelation).where(KnowledgeRelation.base_id == base_id)
        r_result = await db.execute(r_stmt)
        relations = r_result.scalars().all()
        
        # 格式化为前端图谱库可用的格式
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


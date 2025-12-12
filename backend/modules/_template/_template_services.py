"""
模块服务层模板

使用说明：
1. 复制此文件并重命名为 {module_id}_services.py
2. 替换所有 {module_id}、{ModuleName}、{module_name} 等占位符
3. 根据实际需求实现业务逻辑
"""

from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_

from .{module_id}_models import {ModuleName}
from .{module_id}_schemas import {ModuleName}Create, {ModuleName}Update


class {ModuleName}Service:
    """{模块名称}服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_{module_name}(self, data: {ModuleName}Create, user_id: int) -> {ModuleName}:
        """创建{模块名称}"""
        item = {ModuleName}(
            title=data.title,
            content=data.content,
            user_id=user_id
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def get_{module_name}(self, item_id: int) -> Optional[{ModuleName}]:
        """获取{模块名称}详情"""
        result = await self.db.execute(
            select({ModuleName}).where({ModuleName}.id == item_id)
        )
        return result.scalar_one_or_none()
    
    async def get_{module_name}s(
        self,
        page: int = 1,
        size: int = 10,
        user_id: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> Tuple[List[{ModuleName}], int]:
        """获取{模块名称}列表"""
        query = select({ModuleName})
        conditions = []
        
        if user_id:
            conditions.append({ModuleName}.user_id == user_id)
        
        if keyword:
            conditions.append({ModuleName}.title.contains(keyword))
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # 总数
        count_query = select(func.count()).select_from({ModuleName})
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 分页
        query = query.order_by(desc({ModuleName}.created_at))
        query = query.offset((page - 1) * size).limit(size)
        
        result = await self.db.execute(query)
        items = result.scalars().all()
        
        return list(items), total
    
    async def update_{module_name}(self, item_id: int, data: {ModuleName}Update) -> Optional[{ModuleName}]:
        """更新{模块名称}"""
        result = await self.db.execute(
            select({ModuleName}).where({ModuleName}.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def delete_{module_name}(self, item_id: int) -> bool:
        """删除{模块名称}"""
        result = await self.db.execute(
            select({ModuleName}).where({ModuleName}.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            return False
        
        await self.db.delete(item)
        await self.db.commit()
        return True











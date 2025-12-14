"""
笔记业务逻辑
包含严格的用户隔离校验
"""

from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, and_, or_

from .notes_models import NotesFolder, NotesNote, NotesTag, NotesNoteTag
from .notes_schemas import (
    FolderCreate, FolderUpdate, FolderTree,
    NoteCreate, NoteUpdate,
    TagCreate, TagUpdate
)


class NotesService:
    """笔记服务"""
    
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id  # 所有操作都限定在当前用户
    
    # ============ 文件夹操作 ============
    
    async def get_folders(self, parent_id: Optional[int] = None) -> List[NotesFolder]:
        """获取指定父目录下的文件夹（仅当前用户）"""
        query = select(NotesFolder).where(
            and_(
                NotesFolder.user_id == self.user_id,
                NotesFolder.parent_id == parent_id
            )
        ).order_by(NotesFolder.order, NotesFolder.id)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_folder(self, folder_id: int) -> Optional[NotesFolder]:
        """获取文件夹（验证用户权限）"""
        result = await self.db.execute(
            select(NotesFolder).where(
                and_(
                    NotesFolder.id == folder_id,
                    NotesFolder.user_id == self.user_id
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def get_folder_tree(self) -> List[FolderTree]:
        """获取完整文件夹树结构"""
        # 获取所有文件夹
        result = await self.db.execute(
            select(NotesFolder).where(NotesFolder.user_id == self.user_id)
            .order_by(NotesFolder.order, NotesFolder.id)
        )
        all_folders = list(result.scalars().all())
        
        # 使用单个查询获取所有文件夹的笔记数量（避免 N+1 问题）
        folder_ids = [f.id for f in all_folders]
        note_counts = {}
        
        if folder_ids:
            count_result = await self.db.execute(
                select(
                    NotesNote.folder_id,
                    func.count(NotesNote.id).label('count')
                ).where(
                    and_(
                        NotesNote.folder_id.in_(folder_ids),
                        NotesNote.user_id == self.user_id
                    )
                ).group_by(NotesNote.folder_id)
            )
            for row in count_result:
                note_counts[row.folder_id] = row.count
        
        # 构建树结构
        def build_tree(parent_id: Optional[int]) -> List[FolderTree]:
            children = []
            for folder in all_folders:
                if folder.parent_id == parent_id:
                    tree_node = FolderTree(
                        id=folder.id,
                        name=folder.name,
                        parent_id=folder.parent_id,
                        order=folder.order,
                        children=build_tree(folder.id),
                        note_count=note_counts.get(folder.id, 0)
                    )
                    children.append(tree_node)
            return children
        
        return build_tree(None)
    
    async def create_folder(self, data: FolderCreate) -> NotesFolder:
        """创建文件夹"""
        # 如果指定了父文件夹，验证权限
        if data.parent_id:
            parent = await self.get_folder(data.parent_id)
            if not parent:
                raise ValueError("父文件夹不存在或无权访问")
        
        folder = NotesFolder(
            name=data.name,
            parent_id=data.parent_id,
            user_id=self.user_id,
            order=data.order
        )
        self.db.add(folder)
        await self.db.commit()
        await self.db.refresh(folder)
        return folder
    
    async def update_folder(self, folder_id: int, data: FolderUpdate) -> Optional[NotesFolder]:
        """更新文件夹"""
        folder = await self.get_folder(folder_id)
        if not folder:
            return None
        
        # 如果要更改父文件夹，验证权限和循环引用
        if data.parent_id is not None:
            if data.parent_id == folder_id:
                raise ValueError("不能将文件夹移动到自身")
            if data.parent_id:
                parent = await self.get_folder(data.parent_id)
                if not parent:
                    raise ValueError("目标文件夹不存在或无权访问")
                # 检查循环引用
                if await self._is_descendant(data.parent_id, folder_id):
                    raise ValueError("不能移动到子文件夹中")
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(folder, key, value)
        
        await self.db.commit()
        await self.db.refresh(folder)
        return folder
    
    async def _is_descendant(self, folder_id: int, ancestor_id: int) -> bool:
        """检查folder_id是否是ancestor_id的后代"""
        folder = await self.get_folder(folder_id)
        while folder and folder.parent_id:
            if folder.parent_id == ancestor_id:
                return True
            folder = await self.get_folder(folder.parent_id)
        return False
    
    async def delete_folder(self, folder_id: int) -> bool:
        """删除文件夹（级联删除子文件夹和笔记）"""
        folder = await self.get_folder(folder_id)
        if not folder:
            return False
        
        # 删除文件夹内的笔记
        await self.db.execute(
            delete(NotesNote).where(
                and_(
                    NotesNote.folder_id == folder_id,
                    NotesNote.user_id == self.user_id
                )
            )
        )
        
        # 递归删除子文件夹
        children = await self.get_folders(folder_id)
        for child in children:
            await self.delete_folder(child.id)
        
        await self.db.delete(folder)
        await self.db.commit()
        return True
    
    # ============ 笔记操作 ============
    
    async def get_notes(
        self,
        folder_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        is_starred: Optional[bool] = None,
        keyword: Optional[str] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[NotesNote], int]:
        """获取笔记列表"""
        query = select(NotesNote).where(NotesNote.user_id == self.user_id)
        count_query = select(func.count(NotesNote.id)).where(NotesNote.user_id == self.user_id)
        
        # 筛选条件
        if folder_id is not None:
            query = query.where(NotesNote.folder_id == folder_id)
            count_query = count_query.where(NotesNote.folder_id == folder_id)
        
        if is_starred is not None:
            query = query.where(NotesNote.is_starred == is_starred)
            count_query = count_query.where(NotesNote.is_starred == is_starred)
        
        if keyword:
            keyword_filter = or_(
                NotesNote.title.contains(keyword),
                NotesNote.content.contains(keyword)
            )
            query = query.where(keyword_filter)
            count_query = count_query.where(keyword_filter)
        
        # 标签筛选
        if tag_id:
            tag_subquery = select(NotesNoteTag.note_id).where(NotesNoteTag.tag_id == tag_id)
            query = query.where(NotesNote.id.in_(tag_subquery))
            count_query = count_query.where(NotesNote.id.in_(tag_subquery))
        
        # 排序：置顶优先，然后按更新时间
        query = query.order_by(
            NotesNote.is_pinned.desc(),
            NotesNote.updated_at.desc()
        )
        
        # 分页
        query = query.offset((page - 1) * size).limit(size)
        
        result = await self.db.execute(query)
        notes = list(result.scalars().all())
        
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0
        
        return notes, total
    
    async def get_note(self, note_id: int) -> Optional[NotesNote]:
        """获取笔记详情（验证用户权限）"""
        result = await self.db.execute(
            select(NotesNote).where(
                and_(
                    NotesNote.id == note_id,
                    NotesNote.user_id == self.user_id
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def create_note(self, data: NoteCreate) -> NotesNote:
        """创建笔记"""
        # 如果指定了文件夹，验证权限
        if data.folder_id:
            folder = await self.get_folder(data.folder_id)
            if not folder:
                raise ValueError("文件夹不存在或无权访问")
        
        tags = data.tags
        note_data = data.model_dump(exclude={"tags"})
        note_data["user_id"] = self.user_id
        
        note = NotesNote(**note_data)
        self.db.add(note)
        await self.db.commit()
        await self.db.refresh(note)
        
        # 关联标签
        if tags:
            for tag_id in tags:
                # 验证标签归属
                tag = await self.get_tag(tag_id)
                if tag:
                    note_tag = NotesNoteTag(note_id=note.id, tag_id=tag_id)
                    self.db.add(note_tag)
            await self.db.commit()
        
        return note
    
    async def update_note(self, note_id: int, data: NoteUpdate) -> Optional[NotesNote]:
        """更新笔记"""
        note = await self.get_note(note_id)
        if not note:
            return None
        
        # 如果要更改文件夹，验证权限
        if data.folder_id is not None and data.folder_id:
            folder = await self.get_folder(data.folder_id)
            if not folder:
                raise ValueError("目标文件夹不存在或无权访问")
        
        tags = data.tags
        update_data = data.model_dump(exclude={"tags"}, exclude_unset=True)
        
        for key, value in update_data.items():
            setattr(note, key, value)
        
        # 更新标签
        if tags is not None:
            await self.db.execute(
                delete(NotesNoteTag).where(NotesNoteTag.note_id == note_id)
            )
            for tag_id in tags:
                tag = await self.get_tag(tag_id)
                if tag:
                    note_tag = NotesNoteTag(note_id=note.id, tag_id=tag_id)
                    self.db.add(note_tag)
        
        await self.db.commit()
        await self.db.refresh(note)
        return note
    
    async def delete_note(self, note_id: int) -> bool:
        """删除笔记"""
        note = await self.get_note(note_id)
        if not note:
            return False
        
        # 删除标签关联
        await self.db.execute(
            delete(NotesNoteTag).where(NotesNoteTag.note_id == note_id)
        )
        
        await self.db.delete(note)
        await self.db.commit()
        return True
    
    async def move_note(self, note_id: int, folder_id: Optional[int]) -> Optional[NotesNote]:
        """移动笔记到指定文件夹"""
        note = await self.get_note(note_id)
        if not note:
            return None
        
        if folder_id:
            folder = await self.get_folder(folder_id)
            if not folder:
                raise ValueError("目标文件夹不存在或无权访问")
        
        note.folder_id = folder_id
        await self.db.commit()
        await self.db.refresh(note)
        return note
    
    async def get_note_tags(self, note_id: int) -> List[NotesTag]:
        """获取笔记的标签"""
        result = await self.db.execute(
            select(NotesTag)
            .join(NotesNoteTag)
            .where(NotesNoteTag.note_id == note_id)
        )
        return list(result.scalars().all())
    
    # ============ 标签操作 ============
    
    async def get_tags(self) -> List[NotesTag]:
        """获取所有标签"""
        result = await self.db.execute(
            select(NotesTag).where(NotesTag.user_id == self.user_id)
            .order_by(NotesTag.name)
        )
        return list(result.scalars().all())
    
    async def get_tag(self, tag_id: int) -> Optional[NotesTag]:
        """获取标签（验证用户权限）"""
        result = await self.db.execute(
            select(NotesTag).where(
                and_(
                    NotesTag.id == tag_id,
                    NotesTag.user_id == self.user_id
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def create_tag(self, data: TagCreate) -> NotesTag:
        """创建标签"""
        tag = NotesTag(
            name=data.name,
            color=data.color,
            user_id=self.user_id
        )
        self.db.add(tag)
        await self.db.commit()
        await self.db.refresh(tag)
        return tag
    
    async def update_tag(self, tag_id: int, data: TagUpdate) -> Optional[NotesTag]:
        """更新标签"""
        tag = await self.get_tag(tag_id)
        if not tag:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(tag, key, value)
        
        await self.db.commit()
        await self.db.refresh(tag)
        return tag
    
    async def delete_tag(self, tag_id: int) -> bool:
        """删除标签"""
        tag = await self.get_tag(tag_id)
        if not tag:
            return False
        
        # 删除关联
        await self.db.execute(
            delete(NotesNoteTag).where(NotesNoteTag.tag_id == tag_id)
        )
        
        await self.db.delete(tag)
        await self.db.commit()
        return True
    
    # ============ 统计 ============
    
    async def get_stats(self) -> dict:
        """获取统计信息（使用并发查询优化性能）"""
        import asyncio
        
        # 并发执行所有统计查询
        note_query = select(func.count(NotesNote.id)).where(NotesNote.user_id == self.user_id)
        folder_query = select(func.count(NotesFolder.id)).where(NotesFolder.user_id == self.user_id)
        starred_query = select(func.count(NotesNote.id)).where(
            and_(
                NotesNote.user_id == self.user_id,
                NotesNote.is_starred == True
            )
        )
        tag_query = select(func.count(NotesTag.id)).where(NotesTag.user_id == self.user_id)
        
        # 使用 asyncio.gather() 并发执行查询
        results = await asyncio.gather(
            self.db.execute(note_query),
            self.db.execute(folder_query),
            self.db.execute(starred_query),
            self.db.execute(tag_query)
        )
        
        return {
            "notes": results[0].scalar() or 0,
            "folders": results[1].scalar() or 0,
            "starred": results[2].scalar() or 0,
            "tags": results[3].scalar() or 0
        }



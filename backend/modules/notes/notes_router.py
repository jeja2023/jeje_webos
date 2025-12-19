"""
笔记API路由
RESTful风格，所有接口都需要认证且限定用户
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas import success, paginate

from .notes_schemas import (
    FolderCreate, FolderUpdate, FolderInfo, FolderTree,
    NoteCreate, NoteUpdate, NoteInfo, NoteListItem, NoteMove,
    TagCreate, TagUpdate, TagInfo
)
from .notes_services import NotesService

router = APIRouter()


def get_service(db: AsyncSession, user: TokenData) -> NotesService:
    """创建笔记服务实例"""
    return NotesService(db, user.user_id)


# ============ 文件夹接口 ============

@router.get("/folders")
async def list_folders(
    parent_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文件夹列表"""
    service = get_service(db, user)
    folders = await service.get_folders(parent_id)
    return success([FolderInfo.model_validate(f).model_dump() for f in folders])


@router.get("/folders/tree")
async def get_folder_tree(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取完整文件夹树"""
    service = get_service(db, user)
    tree = await service.get_folder_tree()
    return success([t.model_dump() for t in tree])


@router.get("/folders/{folder_id}")
async def get_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文件夹详情"""
    service = get_service(db, user)
    folder = await service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    return success(FolderInfo.model_validate(folder).model_dump())


@router.post("/folders")
async def create_folder(
    data: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建文件夹"""
    service = get_service(db, user)
    try:
        folder = await service.create_folder(data)
        return success(FolderInfo.model_validate(folder).model_dump(), "创建成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/folders/{folder_id}")
async def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新文件夹"""
    service = get_service(db, user)
    try:
        folder = await service.update_folder(folder_id, data)
        if not folder:
            raise HTTPException(status_code=404, detail="文件夹不存在")
        return success(FolderInfo.model_validate(folder).model_dump(), "更新成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除文件夹（级联删除）"""
    service = get_service(db, user)
    if not await service.delete_folder(folder_id):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    return success(message="删除成功")


# ============ 笔记接口 ============

@router.get("/notes")
async def list_notes(
    folder_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    is_starred: Optional[bool] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取笔记列表"""
    service = get_service(db, user)
    notes, total = await service.get_notes(
        folder_id=folder_id,
        tag_id=tag_id,
        is_starred=is_starred,
        keyword=keyword,
        page=page,
        size=size
    )
    
    # 现在的 notes 对象已经包含了预加载的 tags
    items = []
    for note in notes:
        note_dict = NoteListItem.model_validate(note).model_dump()
        # 直接使用预加载的 tags 关系，无需 await service.get_note_tags
        note_dict["tags"] = [TagInfo.model_validate(t).model_dump() for t in note.tags]
        # 生成摘要
        note_dict["summary"] = note.content[:100] if note.content else ""
        items.append(note_dict)
    
    return paginate(items, total, page, size)


@router.get("/notes/starred")
async def list_starred_notes(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取收藏的笔记"""
    service = get_service(db, user)
    notes, total = await service.get_notes(is_starred=True, page=page, size=size)
    
    items = []
    for note in notes:
        note_dict = NoteListItem.model_validate(note).model_dump()
        note_dict["tags"] = [TagInfo.model_validate(t).model_dump() for t in note.tags]
        note_dict["summary"] = note.content[:100] if note.content else ""
        items.append(note_dict)
    
    return paginate(items, total, page, size)


@router.get("/notes/{note_id}")
async def get_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取笔记详情"""
    service = get_service(db, user)
    note = await service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    
    note_dict = NoteInfo.model_validate(note).model_dump()
    note_dict["tags"] = [TagInfo.model_validate(t).model_dump() for t in note.tags]
    
    return success(note_dict)


@router.post("/notes")
async def create_note(
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建笔记"""
    service = get_service(db, user)
    try:
        note = await service.create_note(data)
        return success({"id": note.id}, "创建成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/notes/{note_id}")
async def update_note(
    note_id: int,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新笔记"""
    service = get_service(db, user)
    try:
        note = await service.update_note(note_id, data)
        if not note:
            raise HTTPException(status_code=404, detail="笔记不存在")
        return success({"id": note.id}, "更新成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/notes/{note_id}/move")
async def move_note(
    note_id: int,
    data: NoteMove,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """移动笔记到指定文件夹"""
    service = get_service(db, user)
    try:
        note = await service.move_note(note_id, data.folder_id)
        if not note:
            raise HTTPException(status_code=404, detail="笔记不存在")
        return success({"id": note.id}, "移动成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/notes/{note_id}/star")
async def toggle_star(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """切换收藏状态"""
    service = get_service(db, user)
    note = await service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    
    from .notes_schemas import NoteUpdate
    updated = await service.update_note(note_id, NoteUpdate(is_starred=not note.is_starred))
    return success({"is_starred": updated.is_starred}, "收藏" if updated.is_starred else "取消收藏")


@router.put("/notes/{note_id}/pin")
async def toggle_pin(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """切换置顶状态"""
    service = get_service(db, user)
    note = await service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    
    from .notes_schemas import NoteUpdate
    updated = await service.update_note(note_id, NoteUpdate(is_pinned=not note.is_pinned))
    return success({"is_pinned": updated.is_pinned}, "置顶" if updated.is_pinned else "取消置顶")


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除笔记"""
    service = get_service(db, user)
    if not await service.delete_note(note_id):
        raise HTTPException(status_code=404, detail="笔记不存在")
    return success(message="删除成功")


# ============ 标签接口 ============

@router.get("/tags")
async def list_tags(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取标签列表"""
    service = get_service(db, user)
    tags = await service.get_tags()
    return success([TagInfo.model_validate(t).model_dump() for t in tags])


@router.post("/tags")
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建标签"""
    service = get_service(db, user)
    tag = await service.create_tag(data)
    return success(TagInfo.model_validate(tag).model_dump(), "创建成功")


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新标签"""
    service = get_service(db, user)
    tag = await service.update_tag(tag_id, data)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    return success(TagInfo.model_validate(tag).model_dump(), "更新成功")


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除标签"""
    service = get_service(db, user)
    if not await service.delete_tag(tag_id):
        raise HTTPException(status_code=404, detail="标签不存在")
    return success(message="删除成功")


# ============ 统计接口 ============

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取笔记统计"""
    service = get_service(db, user)
    stats = await service.get_stats()
    return success(stats)


# -*- coding: utf-8 -*-
"""
密码保险箱API路由
RESTful风格，所有接口都需要认证且限定用户
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission
from schemas import success, paginate, error

from .vault_schemas import (
    MasterKeyCreate, MasterKeyVerify, MasterKeyChange, MasterKeyStatus, MasterKeyRecover,
    CategoryCreate, CategoryUpdate, CategoryInfo,
    ItemCreate, ItemUpdate, ItemInfo, ItemDetail, ItemMove,
    PasswordGenerateRequest, PasswordGenerateResponse
)
from .vault_services import VaultService, VaultCrypto

router = APIRouter()


def get_service(db: AsyncSession, user: TokenData) -> VaultService:
    """创建密码保险箱服务实例"""
    return VaultService(db, user.user_id)


async def get_unlocked_service(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read")),
    x_vault_key: Optional[str] = Header(None, alias="X-Vault-Key", description="加密密钥")
) -> VaultService:
    """获取已解锁的服务实例"""
    service = get_service(db, user)
    
    if x_vault_key:
        # 验证主密码并设置加密密钥
        key = await service.verify_master_password(x_vault_key)
        if key:
            service.set_encryption_key(key)
    
    return service


# ============ 主密码接口 ============

@router.get("/master/status")
async def get_master_status(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取主密码状态"""
    service = get_service(db, user)
    has_key = await service.has_master_key()
    is_locked = await service.is_master_key_locked()
    return success(MasterKeyStatus(
        has_master_key=has_key,
        is_locked=is_locked
    ).model_dump())


@router.post("/master/create")
async def create_master_key(
    data: MasterKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.create"))
):
    """创建主密码"""
    service = get_service(db, user)
    try:
        ok, recovery_key = await service.create_master_key(data.master_password)
        return success({
            "recovery_key": recovery_key,
            "message": "主密码创建成功，请妥善保管恢复码"
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/master/verify")
async def verify_master_password(
    data: MasterKeyVerify,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """验证主密码并获取解锁状态"""
    service = get_service(db, user)
    try:
        key = await service.verify_master_password(data.master_password)
        if key:
            # 返回简单标识表示验证成功
            # 前端收到后应该在后续请求的Header中带上原始密码
            return success({"verified": True}, "验证成功")
        else:
            raise HTTPException(status_code=400, detail="主密码错误")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/master/change")
async def change_master_password(
    data: MasterKeyChange,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.update"))
):
    """修改主密码"""
    service = get_service(db, user)
    try:
        await service.change_master_password(data.old_password, data.new_password)
        return success(message="主密码修改成功，请使用新密码重新解锁")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/master/reset")
async def reset_vault(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.delete"))
):
    """重置密码箱（清除所有数据）"""
    service = get_service(db, user)
    await service.reset_vault()
    return success(message="密码箱已重置，所有数据已清除")


@router.post("/master/recover")
async def recover_with_recovery_key(
    data: MasterKeyRecover,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.update"))
):
    """使用恢复码重置主密码"""
    service = get_service(db, user)
    try:
        new_recovery_key = await service.recover_with_recovery_key(data.recovery_key, data.new_password)
        return success({
            "recovery_key": new_recovery_key,
            "message": "主密码重置成功，请保存新的恢复码"
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============ 分类接口 ============

@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取分类列表"""
    service = get_service(db, user)
    categories = await service.get_categories()
    
    result = []
    for cat in categories:
        item_count = await service.get_category_item_count(cat.id)
        cat_dict = CategoryInfo.model_validate(cat).model_dump()
        cat_dict["item_count"] = item_count
        result.append(cat_dict)
    
    return success(result)


@router.get("/categories/{category_id}")
async def get_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取分类详情"""
    service = get_service(db, user)
    category = await service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    
    item_count = await service.get_category_item_count(category_id)
    cat_dict = CategoryInfo.model_validate(category).model_dump()
    cat_dict["item_count"] = item_count
    
    return success(cat_dict)


@router.post("/categories")
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.create"))
):
    """创建分类"""
    service = get_service(db, user)
    category = await service.create_category(data)
    cat_dict = CategoryInfo.model_validate(category).model_dump()
    cat_dict["item_count"] = 0
    return success(cat_dict, "创建成功")


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.update"))
):
    """更新分类"""
    service = get_service(db, user)
    category = await service.update_category(category_id, data)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    return success(CategoryInfo.model_validate(category).model_dump(), "更新成功")


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.delete"))
):
    """删除分类"""
    service = get_service(db, user)
    if not await service.delete_category(category_id):
        raise HTTPException(status_code=404, detail="分类不存在")
    return success(message="删除成功")


# ============ 密码条目接口 ============

@router.get("/items")
async def list_items(
    category_id: Optional[int] = None,
    is_starred: Optional[bool] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取条目列表（不含敏感数据）"""
    service = get_service(db, user)
    items, total = await service.get_items(
        category_id=category_id,
        is_starred=is_starred,
        keyword=keyword,
        page=page,
        size=size
    )
    
    # 获取分类名称映射
    categories = await service.get_categories()
    cat_map = {c.id: c.name for c in categories}
    
    result = []
    for item in items:
        item_dict = ItemInfo.model_validate(item).model_dump()
        item_dict["category_name"] = cat_map.get(item.category_id) if item.category_id else None
        result.append(item_dict)
    
    return paginate(result, total, page, size)


@router.get("/items/starred")
async def list_starred_items(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取收藏的条目"""
    service = get_service(db, user)
    items, total = await service.get_items(is_starred=True, page=page, size=size)
    
    categories = await service.get_categories()
    cat_map = {c.id: c.name for c in categories}
    
    result = []
    for item in items:
        item_dict = ItemInfo.model_validate(item).model_dump()
        item_dict["category_name"] = cat_map.get(item.category_id) if item.category_id else None
        result.append(item_dict)
    
    return paginate(result, total, page, size)


@router.get("/items/{item_id}")
async def get_item(
    item_id: int,
    service: VaultService = Depends(get_unlocked_service)
):
    """获取条目详情（含解密的敏感数据）"""
    item = await service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    
    # 检查是否已解锁
    if not service._encryption_key:
        # 返回不含敏感数据的信息
        categories = await service.get_categories()
        cat_map = {c.id: c.name for c in categories}
        item_dict = ItemInfo.model_validate(item).model_dump()
        item_dict["category_name"] = cat_map.get(item.category_id) if item.category_id else None
        item_dict["locked"] = True
        return success(item_dict)
    
    # 解密敏感数据
    try:
        decrypted = service.decrypt_item(item)
    except Exception as e:
        raise HTTPException(status_code=500, detail="解密失败")
    
    # 记录使用
    await service.record_item_usage(item_id)
    
    # 获取分类名称
    categories = await service.get_categories()
    cat_map = {c.id: c.name for c in categories}
    
    result = {
        "id": item.id,
        "title": item.title,
        "website": item.website,
        "username": decrypted["username"],
        "password": decrypted["password"],
        "notes": decrypted["notes"],
        "category_id": item.category_id,
        "category_name": cat_map.get(item.category_id) if item.category_id else None,
        "is_starred": item.is_starred,
        "last_used_at": item.last_used_at,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "locked": False
    }
    
    return success(result)


@router.post("/items")
async def create_item(
    data: ItemCreate,
    service: VaultService = Depends(get_unlocked_service)
):
    """创建条目"""
    if not service._encryption_key:
        raise HTTPException(status_code=403, detail="请先解锁保险箱")
    
    try:
        item = await service.create_item(data)
        return success({"id": item.id}, "创建成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/items/{item_id}")
async def update_item(
    item_id: int,
    data: ItemUpdate,
    service: VaultService = Depends(get_unlocked_service)
):
    """更新条目"""
    if not service._encryption_key:
        raise HTTPException(status_code=403, detail="请先解锁保险箱")
    
    try:
        item = await service.update_item(item_id, data)
        if not item:
            raise HTTPException(status_code=404, detail="条目不存在")
        return success({"id": item.id}, "更新成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/items/{item_id}/star")
async def toggle_star(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.update"))
):
    """切换收藏状态"""
    service = get_service(db, user)
    item = await service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    
    # 不需要加密密钥，直接更新收藏状态
    from sqlalchemy import update as sql_update
    from .vault_models import VaultItem
    stmt = sql_update(VaultItem).where(
        VaultItem.id == item_id
    ).values(is_starred=not item.is_starred)
    await service.db.execute(stmt)
    await service.db.commit()
    
    return success({"is_starred": not item.is_starred}, "收藏" if not item.is_starred else "取消收藏")


@router.put("/items/{item_id}/move")
async def move_item(
    item_id: int,
    data: ItemMove,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.update"))
):
    """移动条目到指定分类"""
    service = get_service(db, user)
    item = await service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    
    # 验证分类存在
    if data.category_id:
        category = await service.get_category(data.category_id)
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在")
    
    from sqlalchemy import update as sql_update
    from .vault_models import VaultItem
    stmt = sql_update(VaultItem).where(
        VaultItem.id == item_id
    ).values(category_id=data.category_id)
    await service.db.execute(stmt)
    await service.db.commit()
    
    return success({"id": item_id}, "移动成功")


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.delete"))
):
    """删除条目"""
    service = get_service(db, user)
    if not await service.delete_item(item_id):
        raise HTTPException(status_code=404, detail="条目不存在")
    return success(message="删除成功")


# ============ 工具接口 ============

@router.post("/generate")
async def generate_password(
    data: PasswordGenerateRequest,
    user: TokenData = Depends(require_permission("vault.read"))
):
    """生成随机密码"""
    password = VaultCrypto.generate_password(
        length=data.length,
        include_uppercase=data.include_uppercase,
        include_lowercase=data.include_lowercase,
        include_numbers=data.include_numbers,
        include_symbols=data.include_symbols,
        exclude_ambiguous=data.exclude_ambiguous
    )
    strength = VaultCrypto.evaluate_password_strength(password)
    
    return success(PasswordGenerateResponse(
        password=password,
        strength=strength
    ).model_dump())


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("vault.read"))
):
    """获取统计信息"""
    service = get_service(db, user)
    stats = await service.get_stats()
    return success(stats)


# ============ 导入导出接口 ============

@router.get("/export")
async def export_data(
    service: VaultService = Depends(get_unlocked_service)
):
    """导出所有密码数据（需要解锁状态）"""
    try:
        data = await service.export_data()
        return success(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import")
async def import_data(
    data: dict,
    service: VaultService = Depends(get_unlocked_service)
):
    """导入密码数据（需要解锁状态）"""
    try:
        result = await service.import_data(data)
        return success(result, f"导入完成：{result['imported_items']}个密码，{result['imported_categories']}个分类")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

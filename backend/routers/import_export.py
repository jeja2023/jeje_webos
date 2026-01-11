"""
数据导入/导出路由
提供数据导出和导入功能
"""

from utils.timezone import get_beijing_time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import require_admin, TokenData, decode_token
from models.account import User
from models.notification import Notification
from models.storage import FileRecord
from schemas.response import success
from utils.import_export import DataExporter, DataImporter

router = APIRouter(prefix="/api/v1/export", tags=["数据导入导出"])


def get_user_from_token(token: Optional[str] = Query(None)) -> TokenData:
    """
    从 URL query 参数中获取 token 并验证
    用于文件下载等需要在新窗口打开的场景
    """
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token_data = decode_token(token)
    if token_data is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="仅系统管理员可执行此操作")
    
    return token_data


@router.get("/users")
async def export_users(
    format: str = "csv",
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    导出用户数据
    
    仅系统管理员可执行
    支持格式: csv, json, xlsx
    通过 URL 参数 token 进行认证（用于文件下载）
    """
    # 验证 token
    current_user = get_user_from_token(token)
    if format not in ("csv", "json", "xlsx", "excel"):
        raise HTTPException(status_code=400, detail="不支持的格式，支持: csv, json, xlsx")
    
    # 查询所有用户
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    # 转换为字典列表
    data = []
    for user in users:
        data.append({
            "ID": user.id,
            "用户名": user.username,
            "手机号": user.phone or "",
            "昵称": user.nickname or "",
            "角色": user.role,
            "状态": "启用" if user.is_active else "禁用",
            "创建时间": user.created_at.strftime("%Y-%m-%d %H:%M:%S") if user.created_at else "",
            "最后登录": user.last_login.strftime("%Y-%m-%d %H:%M:%S") if user.last_login else ""
        })
    
    # 导出
    exporter = DataExporter()
    timestamp = get_beijing_time().strftime("%Y%m%d_%H%M%S")
    
    if format == "csv":
        file_stream = exporter.export_to_csv(data)
        return StreamingResponse(
            file_stream,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="users_{timestamp}.csv"'}
        )
    elif format in ("xlsx", "excel"):
        file_stream = exporter.export_to_excel(data, sheet_name="用户数据")
        return StreamingResponse(
            file_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="users_{timestamp}.xlsx"'}
        )
    else:  # json
        json_content = exporter.export_to_json(data)
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="users_{timestamp}.json"'}
        )
@router.get("/notification")
async def export_notifications(
    format: str = "csv",
    user_id: Optional[int] = None,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    导出通知数据
    
    仅系统管理员可执行
    支持格式: csv, json, xlsx
    通过 URL 参数 token 进行认证（用于文件下载）
    """
    # 验证 token
    current_user = get_user_from_token(token)
    if format not in ("csv", "json", "xlsx", "excel"):
        raise HTTPException(status_code=400, detail="不支持的格式，支持: csv, json, xlsx")
    
    # 构建查询
    query = select(Notification)
    if user_id:
        query = query.where(Notification.user_id == user_id)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    # 转换为字典列表
    data = []
    for notif in notifications:
        data.append({
            "ID": notif.id,
            "用户ID": notif.user_id,
            "标题": notif.title,
            "内容": notif.content or "",
            "类型": notif.type,
            "已读": "是" if notif.is_read else "否",
            "阅读时间": notif.read_at.strftime("%Y-%m-%d %H:%M:%S") if notif.read_at else "",
            "操作链接": notif.action_url or "",
            "创建时间": notif.created_at.strftime("%Y-%m-%d %H:%M:%S") if notif.created_at else ""
        })
    
    # 导出
    exporter = DataExporter()
    timestamp = get_beijing_time().strftime("%Y%m%d_%H%M%S")
    
    if format == "csv":
        file_stream = exporter.export_to_csv(data)
        return StreamingResponse(
            file_stream,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="notifications_{timestamp}.csv"'}
        )
    elif format in ("xlsx", "excel"):
        file_stream = exporter.export_to_excel(data, sheet_name="通知数据")
        return StreamingResponse(
            file_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="notifications_{timestamp}.xlsx"'}
        )
    else:  # json
        json_content = exporter.export_to_json(data)
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="notifications_{timestamp}.json"'}
        )


@router.get("/files")
async def export_files(
    format: str = "csv",
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    导出文件记录数据
    
    仅系统管理员可执行
    支持格式: csv, json, xlsx
    通过 URL 参数 token 进行认证（用于文件下载）
    """
    # 验证 token
    current_user = get_user_from_token(token)
    if format not in ("csv", "json", "xlsx", "excel"):
        raise HTTPException(status_code=400, detail="不支持的格式，支持: csv, json, xlsx")
    
    # 查询所有文件记录
    result = await db.execute(select(FileRecord))
    files = result.scalars().all()
    
    # 转换为字典列表
    data = []
    for file in files:
        # 格式化文件大小
        size = file.file_size
        if size >= 1024 * 1024:
            size_str = f"{size / 1024 / 1024:.1f} MB"
        elif size >= 1024:
            size_str = f"{size / 1024:.1f} KB"
        else:
            size_str = f"{size} B"
        
        data.append({
            "ID": file.id,
            "文件名": file.filename,
            "存储路径": file.storage_path,
            "文件大小": size_str,
            "大小(字节)": file.file_size,
            "类型": file.mime_type or "",
            "上传者ID": file.uploader_id or 0,
            "描述": file.description or "",
            "上传时间": file.created_at.strftime("%Y-%m-%d %H:%M:%S") if file.created_at else ""
        })
    
    # 导出
    exporter = DataExporter()
    timestamp = get_beijing_time().strftime("%Y%m%d_%H%M%S")
    
    if format == "csv":
        file_stream = exporter.export_to_csv(data)
        return StreamingResponse(
            file_stream,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="files_{timestamp}.csv"'}
        )
    elif format in ("xlsx", "excel"):
        file_stream = exporter.export_to_excel(data, sheet_name="文件记录")
        return StreamingResponse(
            file_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="files_{timestamp}.xlsx"'}
        )
    else:  # json
        json_content = exporter.export_to_json(data)
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="files_{timestamp}.json"'}
        )


@router.post("/import/users")
async def import_users(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    导入用户数据
    
    仅系统管理员可执行
    支持格式: csv, json, xlsx
    
    导入规则：
    - 必须有 username 字段
    - 如果没有密码，将使用默认密码 "123456"
    - 已存在的用户名将被跳过
    - 新用户默认为未激活状态，需要管理员审核
    """
    from core.security import hash_password
    
    # 读取文件内容
    content = await file.read()
    
    # 根据文件扩展名判断格式
    filename = file.filename or ""
    importer = DataImporter()
    
    if filename.endswith(".csv"):
        content_str = content.decode('utf-8-sig')  # 支持 BOM
        data = importer.import_from_csv(content_str)
    elif filename.endswith(".json"):
        content_str = content.decode('utf-8')
        data = importer.import_from_json(content_str)
    elif filename.endswith((".xlsx", ".xls")):
        data = importer.import_from_excel(content)
    else:
        raise HTTPException(status_code=400, detail="不支持的文件格式，支持: csv, json, xlsx")
    
    # 验证数据（支持中英文字段名）
    field_mapping = {
        "username": ["username", "用户名", "Username", "帐号", "账号"],
        "password": ["password", "密码", "Password"],
        "phone": ["phone", "手机号", "Phone", "电话", "手机"],
        "nickname": ["nickname", "昵称", "Nickname", "姓名", "名称"],
        "role": ["role", "角色", "Role"],
        "is_active": ["is_active", "状态", "Status", "激活"],
    }
    
    # 标准化数据字段名
    normalized_data = []
    for item in data:
        normalized_item = {}
        for target_field, possible_names in field_mapping.items():
            for name in possible_names:
                if name in item:
                    normalized_item[target_field] = item[name]
                    break
        # 保留其他字段
        for key, value in item.items():
            if key not in normalized_item:
                normalized_item[key] = value
        normalized_data.append(normalized_item)
    
    data = normalized_data
    
    # 验证数据
    required_fields = ["username", "phone"]  # 用户名和手机号必填
    is_valid, error_msg = importer.validate_data(data, required_fields)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 查询用户组（用于自动分配）
    from models import Role as UserGroup
    groups_result = await db.execute(select(UserGroup))
    groups = {g.name.lower(): g for g in groups_result.scalars().all()}
    
    # 导入数据
    imported_count = 0
    skipped_count = 0
    errors = []
    default_password = "Import@123"  # 默认密码（符合密码复杂度规则：至少8位、大小写字母、数字、特殊字符）
    
    for item in data:
        try:
            username = item.get("username")
            if not username:
                continue
            
            # 清理用户名
            username = str(username).strip()
            if not username:
                continue
                
            # 检查用户是否已存在
            result = await db.execute(select(User).where(User.username == username))
            if result.scalar_one_or_none():
                skipped_count += 1
                errors.append(f"用户 {username} 已存在，跳过")
                continue
            
            # 处理密码（使用默认密码）
            password = default_password
            password_hash = hash_password(str(password))
            
            # 处理手机号（必填）
            phone = item.get("phone")
            if not phone:
                errors.append(f"用户 {username} 缺少手机号，跳过")
                continue
            
            phone = str(phone).strip()
            # 验证手机号格式
            import re
            if not re.match(r'^1[3-9]\d{9}$', phone):
                errors.append(f"用户 {username} 手机号格式不正确，跳过")
                continue
            
            # 检查手机号是否已被使用
            phone_check = await db.execute(select(User).where(User.phone == phone))
            if phone_check.scalar_one_or_none():
                skipped_count += 1
                errors.append(f"用户 {username} 的手机号 {phone} 已存在，跳过")
                continue
            
            # 处理角色（默认为 guest）
            role = item.get("role") or "guest"
            if role not in ("admin", "manager", "user", "guest"):
                role = "guest"
            
            # 根据角色自动分配用户组和权限
            role_ids = []
            permissions = []
            
            # 查找对应的用户组
            group = groups.get(role.lower())
            if group:
                role_ids = [group.id]
                # 复制用户组的权限
                permissions = group.permissions.copy() if group.permissions else []
            
            # 处理激活状态
            is_active = item.get("is_active")
            if isinstance(is_active, str):
                is_active = is_active.lower() in ("true", "1", "是", "启用", "yes")
            elif isinstance(is_active, (int, float)):
                is_active = bool(is_active)
            else:
                is_active = False  # 默认未激活
            
            # 创建用户
            user = User(
                username=username,
                password_hash=password_hash,
                phone=phone,
                nickname=item.get("nickname") or username,
                role=role,
                permissions=permissions,
                role_ids=role_ids,
                is_active=is_active
            )
            db.add(user)
            imported_count += 1
            
        except Exception as e:
            errors.append(f"用户 {item.get('username')}: {str(e)}")
    
    # 提交事务
    if imported_count > 0:
        await db.commit()
    
    return success({
        "total": len(data),
        "imported": imported_count,
        "skipped": skipped_count,
        "errors": errors[:20]  # 只返回前20条错误
    }, f"导入完成：共 {len(data)} 条，成功 {imported_count} 条，跳过 {skipped_count} 条")


@router.get("/import/users/template")
async def download_user_import_template(
    format: str = Query("xlsx", description="模板格式: xlsx"),
    token: Optional[str] = Query(None)
):
    """
    下载用户导入模板（Excel格式）
    
    仅系统管理员可执行
    
    模板字段说明：
    - username (必填): 用户名，3-50个字符，需唯一
    - phone (必填): 11位手机号，需唯一
    - nickname (可选): 昵称
    - role (可选): 角色 (admin/manager/user/guest)，默认为 guest
    - is_active (可选): 是否激活 (true/false/是/否)，默认为 false（需审核）
    
    默认密码为 Import@123
    """
    # 验证 token
    current_user = get_user_from_token(token)
    
    # 模板数据（包含示例和说明）
    template_data = [
        {
            "username": "zhangsan",
            "phone": "13800138001",
            "nickname": "张三",
            "role": "user",
            "is_active": ""
        },
        {
            "username": "lisi",
            "phone": "13800138002",
            "nickname": "李四",
            "role": "",
            "is_active": ""
        },
        {
            "username": "【必填】用户名需唯一",
            "phone": "【必填】11位手机号需唯一",
            "nickname": "【可选】用户昵称",
            "role": "【可选】user/guest",
            "is_active": "【可选】是/否"
        }
    ]
    
    # 导出 Excel
    exporter = DataExporter()
    file_stream = exporter.export_to_excel(template_data, sheet_name="用户导入模板")
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="user_import_template.xlsx"'}
    )

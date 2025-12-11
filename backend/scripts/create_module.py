#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
模块脚手架工具
快速创建新模块的命令行工具

功能：
- 自动生成模块后端文件（manifest, models, schemas, services, router）
- 自动生成模块前端文件（JS, CSS）
- 自动注册前端路由到 app.js
- 自动更新 index.html 引入模块资源
- 使用最新的导入规范（core.security, core.errors）

Usage:
    python scripts/create_module.py <module_id> <module_name> [--author <author>] [--no-frontend]
    
Examples:
    python scripts/create_module.py product 商品管理
    python scripts/create_module.py product 商品管理 --author "张三"
    python scripts/create_module.py product 商品管理 --no-frontend
"""

import os
import re
import sys
import argparse
from pathlib import Path
from datetime import datetime

# 确保在 Windows 下正确处理 UTF-8 编码
if sys.platform == 'win32':
    import io
    # 设置标准输出为 UTF-8（如果可能）
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except:
        pass  # 如果失败，继续使用默认编码


# 确保可以导入项目模块
SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))


# ==================== 模板定义 ====================

MANIFEST_TEMPLATE = '''"""
{module_name}模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets

manifest = ModuleManifest(
    id="{module_id}",
    name="{module_name}",
    version="1.0.0",
    description="{module_name}模块",
    icon="📦",
    author="{author}",
    
    router_prefix="/api/v1/{module_id}",
    
    menu={{
        "title": "{module_name}",
        "icon": "📦",
        "path": "/{module_id}",
        "order": 10,
        "children": [
            {{"title": "列表", "path": "/{module_id}/list", "icon": "📄"}},
            {{"title": "新建", "path": "/{module_id}/create", "icon": "✏️"}}
        ]
    }},
    
    # 前端资源（可选，会自动发现 static/ 目录下的资源）
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    permissions=[
        "{module_id}.read",
        "{module_id}.create",
        "{module_id}.update",
        "{module_id}.delete"
    ],
    
    # 模块依赖（如果依赖其他模块，在此声明）
    dependencies=[],
    
    enabled=True,
    
    # 生命周期钩子（可选）
    # on_install=on_install_hook,
    # on_enable=on_enable_hook,
    # on_disable=on_disable_hook,
    # on_uninstall=on_uninstall_hook,
    # on_upgrade=on_upgrade_hook,
)


# ==================== 生命周期钩子示例 ====================

# async def on_install_hook():
#     """首次安装时执行"""
#     print(f"模块 {module_id} 安装完成")

# async def on_enable_hook():
#     """模块启用时执行"""
#     pass

# async def on_disable_hook():
#     """模块禁用时执行"""
#     pass

# async def on_uninstall_hook():
#     """模块卸载时执行"""
#     pass

# async def on_upgrade_hook():
#     """版本升级时执行"""
#     pass
'''

MODELS_TEMPLATE = '''"""
{module_name}模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base


class {ModelClass}(Base):
    """
    {module_name}数据表
    
    表名规范：{module_id}_<表名>
    """
    __tablename__ = "{module_id}_items"
    __table_args__ = {{'extend_existing': True}}  # 避免热重载时表重复定义错误
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    title = Column(String(200), nullable=False, comment="标题")
    content = Column(Text, nullable=True, comment="内容")
    
    # 状态字段
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, comment="更新时间")
    
    def __repr__(self):
        return f"<{ModelClass}(id={{self.id}}, title={{self.title}})>"
'''

SCHEMAS_TEMPLATE = '''"""
{module_name}模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ==================== 基础模型 ====================

class {ModelClass}Base(BaseModel):
    """基础数据模型"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")


class {ModelClass}Create({ModelClass}Base):
    """创建请求"""
    pass


class {ModelClass}Update(BaseModel):
    """更新请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")
    is_active: Optional[bool] = Field(None, description="是否启用")


class {ModelClass}Response({ModelClass}Base):
    """响应模型"""
    id: int = Field(..., description="ID")
    user_id: int = Field(..., description="用户ID")
    is_active: bool = Field(..., description="是否启用")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    
    class Config:
        from_attributes = True


class {ModelClass}ListResponse(BaseModel):
    """列表响应"""
    items: List[{ModelClass}Response] = Field(..., description="数据列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页数量")
'''

SERVICES_TEMPLATE = '''"""
{module_name}模块业务逻辑
实现具体的业务操作
"""

import logging
from typing import Optional, List, Tuple
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .{module_id}_models import {ModelClass}
from .{module_id}_schemas import {ModelClass}Create, {ModelClass}Update

logger = logging.getLogger(__name__)


class {ModelClass}Service:
    """
    {module_name}服务类
    
    提供 CRUD 和业务逻辑操作
    """
    
    @staticmethod
    async def create(
        db: AsyncSession,
        user_id: int,
        data: {ModelClass}Create
    ) -> {ModelClass}:
        """创建记录"""
        item = {ModelClass}(
            user_id=user_id,
            **data.model_dump()
        )
        db.add(item)
        await db.flush()
        await db.refresh(item)
        logger.info(f"创建{module_name}记录: id={{item.id}}, user_id={{user_id}}")
        return item
    
    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        item_id: int,
        user_id: Optional[int] = None
    ) -> Optional[{ModelClass}]:
        """
        根据ID获取记录
        
        Args:
            db: 数据库会话
            item_id: 记录ID
            user_id: 用户ID（如果指定，只返回该用户的记录）
        """
        query = select({ModelClass}).where({ModelClass}.id == item_id)
        if user_id is not None:
            query = query.where({ModelClass}.user_id == user_id)
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_list(
        db: AsyncSession,
        user_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 20,
        is_active: Optional[bool] = None,
        keyword: Optional[str] = None
    ) -> Tuple[List[{ModelClass}], int]:
        """
        获取列表（带分页）
        
        Returns:
            (items, total): 数据列表和总数
        """
        # 构建查询条件
        conditions = []
        if user_id is not None:
            conditions.append({ModelClass}.user_id == user_id)
        if is_active is not None:
            conditions.append({ModelClass}.is_active == is_active)
        if keyword:
            conditions.append({ModelClass}.title.ilike(f"%{{keyword}}%"))
        
        # 查询总数
        count_query = select(func.count({ModelClass}.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 查询数据
        query = select({ModelClass})
        if conditions:
            query = query.where(and_(*conditions))
        query = query.order_by({ModelClass}.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        items = result.scalars().all()
        
        return list(items), total
    
    @staticmethod
    async def update(
        db: AsyncSession,
        item_id: int,
        data: {ModelClass}Update,
        user_id: Optional[int] = None
    ) -> Optional[{ModelClass}]:
        """更新记录"""
        item = await {ModelClass}Service.get_by_id(db, item_id, user_id)
        if not item:
            return None
        
        # 更新字段
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        await db.flush()
        await db.refresh(item)
        logger.info(f"更新{module_name}记录: id={{item_id}}")
        return item
    
    @staticmethod
    async def delete(
        db: AsyncSession,
        item_id: int,
        user_id: Optional[int] = None
    ) -> bool:
        """删除记录"""
        item = await {ModelClass}Service.get_by_id(db, item_id, user_id)
        if not item:
            return False
        
        await db.delete(item)
        logger.info(f"删除{module_name}记录: id={{item_id}}")
        return True
'''

ROUTER_TEMPLATE = '''"""
{module_name}模块API路由
定义 RESTful API 接口
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, success_response, ErrorCode
from core.pagination import create_page_response

from .{module_id}_schemas import (
    {ModelClass}Create,
    {ModelClass}Update,
    {ModelClass}Response,
    {ModelClass}ListResponse
)
from .{module_id}_services import {ModelClass}Service

logger = logging.getLogger(__name__)

# 路由不设置 prefix，由 loader 自动添加
router = APIRouter()


@router.get("", response_model=dict, summary="获取列表")
async def get_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取{module_name}列表"""
    items, total = await {ModelClass}Service.get_list(
        db,
        user_id=user.user_id,
        page=page,
        page_size=page_size,
        keyword=keyword,
        is_active=is_active
    )
    
    return create_page_response(
        items=[{ModelClass}Response.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


@router.get("/{{item_id}}", response_model=dict, summary="获取详情")
async def get_detail(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取{module_name}详情"""
    item = await {ModelClass}Service.get_by_id(db, item_id, user.user_id)
    if not item:
        raise NotFoundException("{module_name}", item_id)
    
    return success_response(
        data={ModelClass}Response.model_validate(item),
        message="获取成功"
    )


@router.post("", response_model=dict, summary="创建")
async def create(
    data: {ModelClass}Create,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.create"))
):
    """创建{module_name}"""
    item = await {ModelClass}Service.create(db, user.user_id, data)
    await db.commit()
    
    return success_response(
        data={ModelClass}Response.model_validate(item),
        message="创建成功"
    )


@router.put("/{{item_id}}", response_model=dict, summary="更新")
async def update(
    item_id: int,
    data: {ModelClass}Update,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.update"))
):
    """更新{module_name}"""
    item = await {ModelClass}Service.update(db, item_id, data, user.user_id)
    if not item:
        raise NotFoundException("{module_name}", item_id)
    
    await db.commit()
    
    return success_response(
        data={ModelClass}Response.model_validate(item),
        message="更新成功"
    )


@router.delete("/{{item_id}}", response_model=dict, summary="删除")
async def delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.delete"))
):
    """删除{module_name}"""
    success = await {ModelClass}Service.delete(db, item_id, user.user_id)
    if not success:
        raise NotFoundException("{module_name}", item_id)
    
    await db.commit()
    
    return success_response(message="删除成功")
'''

INIT_TEMPLATE = '''"""
{module_name}模块
"""

from .{module_id}_manifest import manifest
from .{module_id}_models import {ModelClass}
from .{module_id}_services import {ModelClass}Service

__all__ = ["manifest", "{ModelClass}", "{ModelClass}Service"]
'''

FRONTEND_JS_TEMPLATE = '''/**
 * {module_name}页面脚本
 * 
 * 依赖：api.js, store.js, router.js, component.js, modal.js, toast.js
 */

class {ModelClass}Page extends Component {{
    constructor(container) {{
        super();
        this.container = container;
        this.state = {{
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            loading: false,
            keyword: ''
        }};
    }}

    async mount() {{
        // 设置全局引用，用于事件绑定
        window._{module_id}Page = this;
        if (this.container) {{
            this.container.innerHTML = this.render();
        }}
        await this.loadData();
    }}

    destroy() {{
        window._{module_id}Page = null;
    }}

    updateView() {{
        if (this.container) {{
            this.container.innerHTML = this.render();
        }}
    }}

    async loadData() {{
        this.state.loading = true;
        this.updateView();

        try {{
            const params = new URLSearchParams({{
                page: this.state.page,
                page_size: this.state.pageSize
            }});
            
            if (this.state.keyword) {{
                params.append('keyword', this.state.keyword);
            }}

            // 注意: Api 类已有 /api/v1 前缀，不需要重复
            const response = await Api.get(`/{module_id}?${{params}}`);
            if (response.code === 0) {{
                this.state.items = response.data.items || [];
                this.state.total = response.data.pagination?.total || 0;
            }}
        }} catch (error) {{
            Toast.error('加载失败');
            console.error(error);
        }} finally {{
            this.state.loading = false;
            this.updateView();
        }}
    }}

    async handleDelete(id) {{
        if (!confirm('确定要删除吗？')) return;

        try {{
            const response = await Api.delete(`/{module_id}/${{id}}`);
            if (response.code === 0) {{
                Toast.success('删除成功');
                await this.loadData();
            }}
        }} catch (error) {{
            Toast.error('删除失败');
        }}
    }}

    handleSearch(keyword) {{
        this.state.keyword = keyword;
        this.state.page = 1;
        this.loadData();
    }}

    handlePageChange(newPage) {{
        this.state.page = newPage;
        this.loadData();
    }}

    render() {{
        const {{ items, total, page, pageSize, loading, keyword }} = this.state;
        const totalPages = Math.ceil(total / pageSize) || 1;

        return `
            <div class="{module_id}-page page fade-in">
                <div class="page-header">
                    <h1>{module_name}</h1>
                    <div class="actions">
                        <input type="text" 
                               class="form-control"
                               placeholder="搜索..." 
                               value="${{keyword}}"
                               onchange="window._{module_id}Page.handleSearch(this.value)">
                        <button class="btn btn-primary" onclick="Router.push('/{module_id}/create')">
                            新建
                        </button>
                    </div>
                </div>

                <div class="content-card">
                    ${{loading ? '<div class="loading">加载中...</div>' : `
                        ${{items.length === 0 ? `
                            <div class="empty-state">
                                <div class="empty-icon">📋</div>
                                <p class="empty-text">暂无数据</p>
                            </div>
                        ` : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>标题</th>
                                        <th>状态</th>
                                        <th>创建时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${{items.map(item => `
                                        <tr>
                                            <td>${{item.id}}</td>
                                            <td>${{item.title}}</td>
                                            <td>
                                                <span class="tag ${{item.is_active ? 'tag-success' : 'tag-default'}}">
                                                    ${{item.is_active ? '启用' : '禁用'}}
                                                </span>
                                            </td>
                                            <td>${{new Date(item.created_at).toLocaleString()}}</td>
                                            <td class="actions">
                                                <button class="btn btn-sm" onclick="Router.push('/{module_id}/edit/${{item.id}}')">
                                                    编辑
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="window._{module_id}Page.handleDelete(${{item.id}})">
                                                    删除
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}}
                                </tbody>
                            </table>

                            <div class="pagination">
                                <span>共 ${{total}} 条</span>
                                <button class="btn btn-sm" ${{page <= 1 ? 'disabled' : ''}} onclick="window._{module_id}Page.handlePageChange(${{page - 1}})">
                                    上一页
                                </button>
                                <span>第 ${{page}} / ${{totalPages}} 页</span>
                                <button class="btn btn-sm" ${{page >= totalPages ? 'disabled' : ''}} onclick="window._{module_id}Page.handlePageChange(${{page + 1}})">
                                    下一页
                                </button>
                            </div>
                        `}}
                    `}}
                </div>
            </div>
        `;
    }}
}}

// 全局引用，用于事件绑定
window._{module_id}Page = null;
'''

FRONTEND_CSS_TEMPLATE = '''/**
 * {module_name}页面样式
 */

.{module_id}-page {{
    padding: var(--spacing-lg);
}}

.{module_id}-page .page-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);
}}

.{module_id}-page .page-header h1 {{
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
}}

.{module_id}-page .page-header .actions {{
    display: flex;
    gap: var(--spacing-md);
}}

.{module_id}-page .page-header input {{
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    width: 200px;
}}

.{module_id}-page .content-card {{
    background: var(--card-bg);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-sm);
}}

.{module_id}-page .loading {{
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-secondary);
}}

.{module_id}-page .pagination {{
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--border-color);
}}
'''


# ==================== 工具函数 ====================

def to_pascal_case(snake_str: str) -> str:
    """将 snake_case 转换为 PascalCase"""
    components = snake_str.split('_')
    return ''.join(x.title() for x in components)


def create_file(path: Path, content: str, overwrite: bool = False):
    """
    创建文件（确保 UTF-8 编码）
    
    在 Windows 下，确保正确处理中文编码
    """
    if path.exists() and not overwrite:
        print(f"  [跳过] 文件已存在: {path.name}")
        return False
    
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # 确保使用 UTF-8 编码写入，避免中文乱码
    try:
        # 方法1：直接使用 write_text（推荐）
        path.write_text(content, encoding='utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        # 方法2：如果遇到编码问题，使用 write_bytes
        try:
            path.write_bytes(content.encode('utf-8'))
        except Exception as e:
            print(f"  [错误] 写入文件失败 {path.name}: {e}")
            return False
    
    print(f"  [创建] 文件: {path.name}")
    return True


def disable_old_module(module_id: str, modules_dir: Path):
    """
    禁用旧模块（将 enabled 设置为 False）
    
    Args:
        module_id: 模块ID
        modules_dir: 模块目录
    """
    manifest_file = modules_dir / module_id / f"{module_id}_manifest.py"
    
    if not manifest_file.exists():
        return False
    
    try:
        content = manifest_file.read_text(encoding='utf-8')
        
        # 检查是否已经禁用
        if 'enabled=False' in content or 'enabled = False' in content:
            print(f"    [跳过] {module_id} 已禁用")
            return True
        
        # 替换 enabled=True 为 enabled=False
        import re
        # 匹配 enabled=True 或 enabled = True
        pattern = r'enabled\s*=\s*True'
        if re.search(pattern, content):
            content = re.sub(pattern, 'enabled=False  # 已禁用（由脚本自动处理）', content)
            manifest_file.write_text(content, encoding='utf-8')
            print(f"    [完成] 已禁用模块: {module_id}")
            return True
        else:
            print(f"    [警告] 无法找到 enabled 字段: {module_id}")
            return False
    except Exception as e:
        print(f"    [错误] 禁用模块失败 {module_id}: {e}")
        return False


def register_frontend_route(module_id: str, module_name: str, model_class: str, frontend_dir: Path):
    """
    自动在 app.js 中注册前端路由
    
    Args:
        module_id: 模块ID
        module_name: 模块显示名称
        model_class: 模型类名（PascalCase）
        frontend_dir: 前端目录
    """
    # 确保 module_name 是 UTF-8 编码的字符串（处理 Windows GBK 编码问题）
    if isinstance(module_name, bytes):
        module_name = module_name.decode('utf-8')
    elif not isinstance(module_name, str):
        module_name = str(module_name)
    
    app_js_path = frontend_dir / 'js' / 'pages' / 'app.js'
    
    if not app_js_path.exists():
        print(f"  [跳过] app.js 不存在，跳过路由注册")
        return False
    
    content = app_js_path.read_text(encoding='utf-8')
    
    # 检查是否已经注册过该模块的路由（更精确的检查）
    # 同时检查不带斜杠和带斜杠的形式
    if f"'{module_id}':" in content or f"'/{module_id}':" in content or f'"{module_id}":' in content or f'"/{module_id}":' in content:
        print(f"  [跳过] 路由已存在: /{module_id}")
        return False
    
    # 生成路由代码
    # 使用 .format() 而不是 f-string，确保中文正确编码
    route_code_template = '''
            // ========== {module_name}模块路由 (自动生成) ==========
            '/{module_id}': {{
                auth: true,
                handler: () => {{
                    Router.replace('/{module_id}/list');
                }}
            }},
            '/{module_id}/list': {{
                auth: true,
                handler: () => {{
                    this.renderLayout();
                    this.destroyCurrentPage();
                    this.currentPage = new {ModelClass}Page(this.content);
                    this.currentPage.mount();
                    this.header.setBreadcrumb(['{module_name}', '{module_name}列表']);
                }}
            }},
            '/{module_id}/create': {{
                auth: true,
                handler: () => {{
                    this.renderLayout();
                    // TODO: 实现创建页面
                    this.content.innerHTML = `
                        <div class="page fade-in">
                            <div class="page-header">
                                <h1>新建{module_name}</h1>
                                <button class="btn" onclick="Router.push('/{module_id}/list')">返回列表</button>
                            </div>
                            <div class="content-card">
                                <p>创建页面待实现...</p>
                            </div>
                        </div>
                    `;
                    this.header.setBreadcrumb(['{module_name}', '新建{module_name}']);
                }}
            }},
            '/{module_id}/edit/:id': {{
                auth: true,
                handler: ({{ params }}) => {{
                    this.renderLayout();
                    // TODO: 实现编辑页面
                    this.content.innerHTML = `
                        <div class="page fade-in">
                            <div class="page-header">
                                <h1>编辑{module_name} #${{params.id}}</h1>
                                <button class="btn" onclick="Router.push('/{module_id}/list')">返回列表</button>
                            </div>
                            <div class="content-card">
                                <p>编辑页面待实现...</p>
                            </div>
                        </div>
                    `;
                    this.header.setBreadcrumb(['{module_name}', '编辑{module_name}']);
                }}
            }}'''
    
    route_code = route_code_template.format(
        module_id=module_id,
        module_name=module_name,
        ModelClass=model_class
    )
    
    # 更精确地查找 registerAll 的闭合位置
    import re
    
    # 方法：查找最后一个路由项之后，registerAll 闭合之前
    # 查找模式：最后一个路由定义之后，registerAll 的闭合 "        });"
    lines = content.split('\n')
    insert_index = -1
    
    # 从后往前查找 registerAll 的闭合位置
    # 查找 "        });" 这行，它应该是 registerAll 的闭合
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        # 查找 "        });" 这行（允许不同的缩进，但必须是在路由定义区域内）
        if line.endswith("});"):
            # 检查前面是否有路由定义（包含 'handler:' 和路径定义）
            # 往前查找 30 行，看是否有路由模式
            context_start = max(0, i - 30)
            context = '\n'.join(lines[context_start:i])
            
            # 检查是否包含路由定义的特征
            if ("handler:" in context or "Router." in context) and ("'" in context or '"' in context):
                # 进一步检查：确保不是在函数定义或其他地方
                # 检查前面几行是否有路由路径定义（如 '/path':）
                route_check = '\n'.join(lines[max(0, i-30):i])
                # 确保该模块的路由还没有注册
                if f"'{module_id}" not in route_check and f'"/{module_id}"' not in route_check:
                    insert_index = i
                    break
    
    if insert_index > 0:
        # 在 insert_index 位置之前插入新路由
        
        # Check: 检查前面是否需要补逗号
        # 往前找，跳过空行，找到最后一行有效代码
        prev_code_index = insert_index - 1
        while prev_code_index >= 0:
            line = lines[prev_code_index].strip()
            if not line or line.startswith('//'):
                prev_code_index -= 1
                continue
            break
        
        # 如果找到了非空行，且是以 '}' 结尾但没有逗号，则补充逗号
        if prev_code_index >= 0:
            prev_line = lines[prev_code_index].rstrip() # 保留缩进，只去尾部空格
            stripped = prev_line.strip()
            if stripped.endswith('}') and not stripped.endswith(','):
                lines[prev_code_index] = prev_line + ','
                print(f"  [自动修复] 为上一行路由补充了逗号")

        lines.insert(insert_index, route_code)
        content = '\n'.join(lines)
        app_js_path.write_text(content, encoding='utf-8')
        print(f"  [完成] 路由已注册: /{module_id}/list, /{module_id}/create, /{module_id}/edit/:id")
        return True
    else:
        # 备用方案：使用正则表达式查找 registerAll 的闭合
        # 查找最后一个路由项（以 '},' 结尾）之后，registerAll 闭合之前
        pattern = r"(\s+            }\s*,\s*\n\s+//.*模块路由.*\n\s+}\s*\);)"
        match = re.search(pattern, content, re.MULTILINE)
        
        if match:
            # 在匹配位置之前插入
            pos = match.start()
            content = content[:pos] + route_code + "\n" + content[pos:]
            app_js_path.write_text(content, encoding='utf-8')
            print(f"  ✅ 路由已注册（备用方法）: /{module_id}/list, /{module_id}/create, /{module_id}/edit/:id")
            return True
        else:
            # 最后尝试：查找 "        });" 并插入
            last_pos = content.rfind("        });")
            if last_pos > 0:
                # 检查前面是否有路由定义
                before = content[max(0, last_pos-200):last_pos]
                if "handler:" in before or "Router." in before:
                    # 检查是否需要补逗号
                    # 找到插入点前的非空白字符
                    check_pos = last_pos - 1
                    while check_pos > 0 and content[check_pos].isspace():
                        check_pos -= 1
                    
                    if content[check_pos] == '}' and content[check_pos+1:last_pos].strip() == '':
                         # 插入逗号
                         content = content[:check_pos+1] + ',' + content[check_pos+1:]
                         # 这里的 last_pos 因为插入了一个字符，理论上要 +1，但我们直接拼接就好
                         last_pos += 1
                         print(f"  [自动修复] 为上一行路由补充了逗号（最后尝试模式）")
                    
                    content = content[:last_pos] + route_code + "\n" + content[last_pos:]
                    app_js_path.write_text(content, encoding='utf-8')
                    print(f"  ✅ 路由已注册（最后尝试）: /{module_id}/list, /{module_id}/create, /{module_id}/edit/:id")
                    return True
            
            print(f"  [警告] 无法找到路由插入位置，请手动添加路由到 app.js")
            print(f"      需要添加的路由代码:")
            print(f"      {route_code[:100]}...")
            return False


def update_index_html(module_id: str, frontend_dir: Path):
    """
    自动在 index.html 中引入模块的 CSS 和 JS 文件
    
    Args:
        module_id: 模块ID
        frontend_dir: 前端目录
    """
    index_path = frontend_dir / 'index.html'
    
    if not index_path.exists():
        print(f"  [跳过] index.html 不存在")
        return False
    
    content = index_path.read_text(encoding='utf-8')
    modified = False
    
    # 检查并添加 CSS
    css_link = f'    <link rel="stylesheet" href="/static/css/pages/{module_id}.css">'
    css_pattern = f'css/pages/{module_id}.css'
    
    if css_pattern not in content:
        # 在 </head> 之前添加 CSS
        if '</head>' in content:
            # 查找最后一个 CSS link 标签之后的位置
            import re
            # 查找最后一个 link rel="stylesheet" 标签
            css_links = list(re.finditer(r'<link[^>]*rel=["\']stylesheet["\'][^>]*>', content))
            if css_links:
                # 在最后一个 CSS link 之后插入
                last_css_pos = css_links[-1].end()
                content = content[:last_css_pos] + '\n' + css_link + content[last_css_pos:]
            else:
                # 如果没有找到其他 CSS，就在 </head> 之前添加
                content = content.replace('</head>', css_link + '\n</head>')
            modified = True
            print(f"  [完成] CSS 已引入: {module_id}.css")
        else:
            print(f"  [警告] 无法找到 </head>，请手动添加 CSS")
    else:
        print(f"  [跳过] CSS 已存在: {module_id}.css")
    
    # 检查并添加 JS
    js_script = f'    <script src="/static/js/pages/{module_id}.js"></script>'
    js_pattern = f'js/pages/{module_id}.js'
    
    if js_pattern not in content:
        # 在 app.js 之前添加（app.js 应该最后加载）
        import re
        # 查找 app.js 的 script 标签
        app_js_pattern = r'(\s*<script[^>]*js/pages/app\.js[^>]*></script>)'
        match = re.search(app_js_pattern, content)
        
        if match:
            # 在 app.js 之前插入
            content = content[:match.start()] + js_script + '\n' + content[match.start():]
            modified = True
            print(f"  [完成] JS 已引入: {module_id}.js")
        elif '</body>' in content:
            # 如果找不到 app.js，就在 </body> 之前添加
            content = content.replace('</body>', js_script + '\n</body>')
            modified = True
            print(f"  [完成] JS 已引入: {module_id}.js")
        else:
            print(f"  [警告] 无法找到插入位置，请手动添加 JS")
    else:
        print(f"  [跳过] JS 已存在: {module_id}.js")
    
    if modified:
        index_path.write_text(content, encoding='utf-8')
    
    return modified


def create_module(
    module_id: str,
    module_name: str,
    author: str = "JeJe WebOS",
    create_frontend: bool = True,
    force: bool = False
):
    """
    创建模块
    
    Args:
        module_id: 模块ID（小写+下划线）
        module_name: 模块显示名称（中文）
        author: 作者名称
        create_frontend: 是否创建前端文件
        force: 是否强制执行（跳过确认）
    """
    # 确保 module_name 是 UTF-8 编码的字符串（处理 Windows GBK 编码问题）
    if isinstance(module_name, bytes):
        module_name = module_name.decode('utf-8')
    elif not isinstance(module_name, str):
        module_name = str(module_name)
    
    # 验证模块ID
    if not module_id.replace('_', '').isalnum():
        print(f"[错误] 模块ID无效，只能包含小写字母、数字和下划线: {module_id}")
        return False
    
    if module_id[0].isdigit():
        print(f"[错误] 模块ID不能以数字开头: {module_id}")
        return False
    
    # 生成类名
    model_class = to_pascal_case(module_id)
    
    # 模板变量
    template_vars = {
        'module_id': module_id,
        'module_name': module_name,
        'ModelClass': model_class,
        'author': author,
        'date': datetime.now().strftime('%Y-%m-%d'),
    }
    
    # 模块目录
    module_dir = BACKEND_DIR / 'modules' / module_id
    
    # 检查是否有冲突的旧模块（检查是否有其他测试模块）
    if not force:
        old_test_modules = []
        modules_dir = BACKEND_DIR / 'modules'
        if modules_dir.exists():
            for item in modules_dir.iterdir():
                if item.is_dir() and not item.name.startswith("_") and item.name != module_id:
                    # 检查是否是测试模块（可以根据命名规则判断，比如 task_manager, test_module 等）
                    manifest_file = item / f"{item.name}_manifest.py"
                    if manifest_file.exists():
                        try:
                            # 尝试读取 manifest 检查是否是测试模块
                            manifest_content = manifest_file.read_text(encoding='utf-8')
                            # 简单检查：如果描述包含"测试"或"示例"，或者是常见的测试模块名
                            test_keywords = ['测试', '示例', 'test', 'demo', 'sample', 'template']
                            if any(kw in manifest_content.lower() for kw in test_keywords) or \
                               item.name in ['task_manager', 'test_module', 'demo_module']:
                                old_test_modules.append(item.name)
                        except:
                            pass
        
        if old_test_modules:
            print(f"\n[警告] 检测到可能的测试模块: {', '.join(old_test_modules)}")
            print(f"   建议：创建新模块前，可以禁用或删除这些测试模块以避免混淆")
            response = input("   是否禁用这些模块？[y/N] ")
            if response.lower() == 'y':
                for old_module_id in old_test_modules:
                    disable_old_module(old_module_id, modules_dir)
                    
    if module_dir.exists():
        if force:
             print(f"\n[提示] 模块目录已存在，强制继续: {module_dir}")
        else:
            print(f"\n[警告] 模块目录已存在: {module_dir}")
            response = input("是否继续（会跳过已存在的文件）？[y/N] ")
            if response.lower() != 'y':
                print("已取消")
                return False
    
    print(f"\n[创建模块] {module_name} ({module_id})")
    print(f"[目录] {module_dir}\n")
    
    # 创建后端文件
    print("后端文件:")
    module_dir.mkdir(parents=True, exist_ok=True)
    
    create_file(
        module_dir / '__init__.py',
        INIT_TEMPLATE.format(**template_vars)
    )
    create_file(
        module_dir / f'{module_id}_manifest.py',
        MANIFEST_TEMPLATE.format(**template_vars)
    )
    create_file(
        module_dir / f'{module_id}_models.py',
        MODELS_TEMPLATE.format(**template_vars)
    )
    create_file(
        module_dir / f'{module_id}_schemas.py',
        SCHEMAS_TEMPLATE.format(**template_vars)
    )
    create_file(
        module_dir / f'{module_id}_services.py',
        SERVICES_TEMPLATE.format(**template_vars)
    )
    create_file(
        module_dir / f'{module_id}_router.py',
        ROUTER_TEMPLATE.format(**template_vars)
    )
    
    # 创建前端文件（可选）
    if create_frontend:
        print("\n前端文件:")
        frontend_dir = BACKEND_DIR.parent / 'frontend'
        
        create_file(
            frontend_dir / 'js' / 'pages' / f'{module_id}.js',
            FRONTEND_JS_TEMPLATE.format(**template_vars)
        )
        create_file(
            frontend_dir / 'css' / 'pages' / f'{module_id}.css',
            FRONTEND_CSS_TEMPLATE.format(**template_vars)
        )
        
        # 自动注册前端路由
        print("\n[自动注册前端路由]...")
        register_frontend_route(module_id, module_name, model_class, frontend_dir)
        
        # 自动更新 index.html
        print("\n[自动更新 index.html]...")
        update_index_html(module_id, frontend_dir)
    
    print(f"\n[完成] 模块 {module_name} 创建完成！")
    print("\n[后续步骤]:")
    print(f"   1. 根据需求修改 {module_id}_models.py 中的数据模型")
    print(f"   2. 更新 {module_id}_schemas.py 中的数据验证")
    print(f"   3. 实现 {module_id}_services.py 中的业务逻辑")
    print(f"   4. 调整 {module_id}_router.py 中的 API 接口")
    print("   5. 重启后端服务，模块会自动加载")
    print("   6. 刷新浏览器即可访问新模块")
    
    if create_frontend:
        print(f"\n[前端文件] (已自动引入):")
        print(f"   - JS: frontend/js/pages/{module_id}.js")
        print(f"   - CSS: frontend/css/pages/{module_id}.css")
        print(f"   - 路由: /{module_id}/list, /{module_id}/create, /{module_id}/edit/:id")
    
    return True


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='JeJe WebOS 模块脚手架工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python scripts/create_module.py task_manager 任务管理
  python scripts/create_module.py task_manager 任务管理 --author "张三"
  python scripts/create_module.py task_manager 任务管理 --no-frontend
        '''
    )
    
    parser.add_argument(
        'module_id',
        help='模块ID（小写字母+下划线，如：task_manager）'
    )
    parser.add_argument(
        'module_name',
        help='模块显示名称（中文，如：任务管理）'
    )
    parser.add_argument(
        '--author',
        default='JeJe WebOS',
        help='作者名称（默认：JeJe WebOS）'
    )
    parser.add_argument(
        '--no-frontend',
        action='store_true',
        help='不创建前端文件'
    )
    
    args = parser.parse_args()
    
    success = create_module(
        module_id=args.module_id,
        module_name=args.module_name,
        author=args.author,
        create_frontend=not args.no_frontend
    )
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()


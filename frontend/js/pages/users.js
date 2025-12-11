/**
 * 用户管理页面
 */

// 用户列表页
class UserListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            users: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            groups: [],
            filters: {
                role: '',
                is_active: '',
                keyword: ''
            },
            importing: false,
            importResult: null
        };
        this._eventsBinded = false;
        this._auditing = {};
        this._toggling = {};
        this._deleting = {};
        this._permsModalOpen = false;
        this._handlers = {};
    }

    // 批量导入用户
    async handleImportUsers(file) {
        if (!file) return;

        this.setState({ importing: true, importResult: null });
        try {
            const res = await ExportApi.importUsers(file);
            const result = res.data || res;
            this.setState({
                importing: false,
                importResult: {
                    success: true,
                    total: result.total || 0,
                    imported: result.imported || 0,
                    skipped: result.skipped || 0,
                    errors: result.errors || []
                }
            });
            Toast.success(`导入完成：成功 ${result.imported || 0} 条`);
            // 刷新用户列表
            this.loadData();
        } catch (e) {
            this.setState({
                importing: false,
                importResult: {
                    success: false,
                    message: e.message || '导入失败'
                }
            });
            Toast.error(e.message || '导入失败');
        }
    }

    // 显示导入对话框
    showImportModal() {
        const content = `
            <div style="display:grid;gap:16px;">
                <div>
                    <input type="file" id="importUserFile" accept=".xlsx,.xls" style="display:none;">
                    <div class="upload-area-compact" id="uploadUserArea" style="padding:40px 20px;border:2px dashed var(--border-color);border-radius:12px;text-align:center;cursor:pointer;">
                        <div style="font-size:36px;margin-bottom:8px;">📄</div>
                        <div>点击或拖放 Excel 文件</div>
                        <small style="color:var(--text-secondary);">支持 .xlsx, .xls 格式</small>
                    </div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 16px;border-radius:8px;">
                    <div style="font-weight:500;margin-bottom:8px;">📋 导入说明</div>
                    <ul style="margin:0;padding-left:20px;color:var(--text-secondary);font-size:13px;line-height:1.8;">
                        <li><b>用户名</b>（必填）：username 或 用户名，需唯一</li>
                        <li><b>手机号</b>（必填）：phone 或 手机号，11位手机号码</li>
                        <li><b>昵称</b>（可选）：nickname 或 昵称</li>
                        <li><b>角色</b>（可选）：role 或 角色，默认 guest</li>
                        <li><b>是否激活</b>（可选）：is_active，默认未激活需审核</li>
                        <li style="margin-top:8px;">💡 密码将使用默认密码 <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">Import@123</code></li>
                        <li>已存在的用户名或手机号会被跳过</li>
                    </ul>
                </div>
                <div id="importProgress" style="display:none;">
                    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                        <div class="loading-sm"></div>
                        <span>正在导入...</span>
                    </div>
                </div>
                <div id="importResultBox"></div>
            </div>
        `;

        const { overlay, close } = Modal.show({
            title: '📥 批量导入用户',
            content,
            footer: `<button class="btn btn-secondary" data-action="cancel">关闭</button>`,
            width: '500px'
        });

        const fileInput = overlay.querySelector('#importUserFile');
        const uploadArea = overlay.querySelector('#uploadUserArea');
        const progressBox = overlay.querySelector('#importProgress');
        const resultBox = overlay.querySelector('#importResultBox');

        const handleFile = async (file) => {
            if (!file) return;

            progressBox.style.display = 'block';
            resultBox.innerHTML = '';

            try {
                const res = await ExportApi.importUsers(file);
                const result = res.data || res;

                progressBox.style.display = 'none';
                resultBox.innerHTML = `
                    <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;color:var(--color-success);">
                        <div style="font-weight:500;margin-bottom:8px;">✅ 导入完成</div>
                        <div style="font-size:14px;">
                            共 ${result.total || 0} 条，成功 ${result.imported || 0} 条，跳过 ${result.skipped || 0} 条
                        </div>
                        ${result.errors && result.errors.length > 0 ? `
                            <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);max-height:100px;overflow-y:auto;">
                                ${result.errors.slice(0, 10).map(e => `<div>• ${e}</div>`).join('')}
                                ${result.errors.length > 10 ? `<div>... 等 ${result.errors.length} 条</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;

                Toast.success(`导入完成：成功 ${result.imported || 0} 条`);
                this.loadData();
            } catch (e) {
                progressBox.style.display = 'none';
                resultBox.innerHTML = `
                    <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;color:var(--color-error);">
                        ❌ ${e.message || '导入失败'}
                    </div>
                `;
            }
        };

        uploadArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
            e.target.value = '';
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-primary)';
            uploadArea.style.background = 'var(--bg-secondary)';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--border-color)';
            uploadArea.style.background = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--border-color)';
            uploadArea.style.background = '';
            handleFile(e.dataTransfer.files[0]);
        });
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const params = {
                page: this.state.page,
                size: this.state.size
            };

            if (this.state.filters.role) {
                params.role = this.state.filters.role;
            }
            if (this.state.filters.is_active !== '') {
                params.is_active = this.state.filters.is_active === 'true';
            }
            if (this.state.filters.keyword) {
                params.keyword = this.state.filters.keyword;
            }

            const [usersRes, groupsRes] = await Promise.all([
                UserApi.getUsers(params),
                GroupApi.list().catch(() => ({ data: [] }))
            ]);
            this.setState({
                users: usersRes.data.items,
                total: usersRes.data.total,
                groups: groupsRes.data || [],
                loading: false
            });
        } catch (error) {
            Toast.error('加载用户列表失败');
            this.setState({ loading: false });
        }
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    handleFilter(key, value) {
        // 直接更新状态对象（不使用回调函数，因为Component.setState不支持）
        this.state.filters = { ...this.state.filters, [key]: value };
        this.state.page = 1;
        this.loadData();
    }

    async handleAudit(userId, isActive) {
        // 防止重复调用
        const key = `audit_${userId}_${isActive}`;
        if (this._auditing && this._auditing[key]) {
            return;
        }
        if (!this._auditing) {
            this._auditing = {};
        }
        this._auditing[key] = true;

        try {
            const action = isActive ? '通过' : '拒绝';
            const reason = await Modal.prompt(`审核${action}`, `请输入审核备注（可选）`);

            // 如果用户取消，reason 为 null
            if (reason === null) {
                delete this._auditing[key];
                return;
            }

            await UserApi.auditUser(userId, {
                is_active: isActive,
                reason: reason || null
            });
            Toast.success(`用户审核${action}成功`);
            this.loadData();
        } catch (error) {
            Toast.error(error.message);
        } finally {
            delete this._auditing[key];
        }
    }

    async handleToggleStatus(userId, currentStatus) {
        // 防止重复调用
        const key = `toggle_${userId}`;
        if (this._toggling && this._toggling[key]) {
            return;
        }
        if (!this._toggling) {
            this._toggling = {};
        }
        this._toggling[key] = true;

        const action = currentStatus ? '禁用' : '启用';
        Modal.confirm(`${action}用户`, `确定要${action}此用户吗？`, async () => {
            try {
                await UserApi.toggleUserStatus(userId, !currentStatus);
                Toast.success(`用户已${action}`);
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            } finally {
                delete this._toggling[key];
            }
        }, () => {
            // 用户取消时也清除标志
            delete this._toggling[key];
        });
    }

    async handleDelete(userId, username) {
        // 防止重复调用
        const key = `delete_${userId}`;
        if (this._deleting && this._deleting[key]) {
            return;
        }
        if (!this._deleting) {
            this._deleting = {};
        }
        this._deleting[key] = true;

        Modal.confirm('删除用户', `确定要删除用户 "${username}" 吗？此操作不可恢复。`, async () => {
            try {
                await UserApi.deleteUser(userId);
                Toast.success('用户已删除');
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            } finally {
                delete this._deleting[key];
            }
        }, () => {
            // 用户取消时也清除标志
            delete this._deleting[key];
        });
    }

    resolveRole(user) {
        if (user.role === 'admin') return { label: '系统管理员', cls: 'tag-danger' };
        if (user.role === 'manager') return { label: '管理员', cls: 'tag-warning' };
        // 优先根据用户组判断
        const groupIds = user.role_ids || [];
        const guestGroup = this.state.groups.find(g => g.name?.toLowerCase() === 'guest');
        if (guestGroup && groupIds.includes(guestGroup.id)) {
            return { label: '访客', cls: 'tag-default' };
        }
        if (user.role === 'guest') return { label: '访客', cls: 'tag-default' };
        return { label: '普通用户', cls: 'tag-info' };
    }

    render() {
        const { users, total, page, size, loading, filters } = this.state;
        const pages = Math.ceil(total / size);

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">用户管理</h1>
                        <p class="page-desc">共 ${total} 个用户</p>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button class="btn btn-secondary" id="downloadTemplateBtn">
                            📋 下载模板
                        </button>
                        <button class="btn btn-primary" id="importUsersBtn">
                            📥 批量导入
                        </button>
                        <button class="btn btn-secondary" id="exportUsersBtn">
                            📤 导出列表
                        </button>
                        <a href="#/users/pending" class="btn btn-secondary" style="color:var(--color-warning);">
                            ⏳ 待审核
                        </a>
                    </div>
                </div>
                
                <!-- 筛选器 -->
                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body" style="display: grid; grid-template-columns: 1fr 1fr 2fr auto; gap: var(--spacing-md); align-items: end">
                        <div class="form-group">
                            <label class="form-label">角色</label>
                            <select class="form-input form-select" id="filterRole" value="${filters.role}">
                                <option value="">全部</option>
                                <option value="admin" ${filters.role === 'admin' ? 'selected' : ''}>系统管理员</option>
                                <option value="manager" ${filters.role === 'manager' ? 'selected' : ''}>管理员</option>
                                <option value="user" ${filters.role === 'user' ? 'selected' : ''}>普通用户</option>
                                <option value="guest" ${filters.role === 'guest' ? 'selected' : ''}>访客</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="filterStatus" value="${filters.is_active}">
                                <option value="">全部</option>
                                <option value="true" ${filters.is_active === 'true' ? 'selected' : ''}>已激活</option>
                                <option value="false" ${filters.is_active === 'false' ? 'selected' : ''}>待审核</option>
                            </select>
                        </div>
                        <div class="form-group" style="display:flex; gap:8px; align-items:flex-end;">
                            <div style="flex:1;">
                                <label class="form-label">搜索</label>
                                <input type="text" class="form-input" id="filterKeyword" 
                                       placeholder="用户名、手机号、昵称" value="${filters.keyword || ''}">
                            </div>
                            <div style="padding-bottom: 0;">
                                <button class="btn btn-primary" id="searchBtn" style="margin-top:auto;">搜索</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${users.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>用户名</th>
                                        <th>手机号</th>
                                        <th>昵称</th>
                                        <th>角色</th>
                                        <th>状态</th>
                                        <th>注册时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => `
                                        <tr>
                                            <td>${user.id}</td>
                                            <td>${Utils.escapeHtml(user.username)}</td>
                                            <td>${user.phone || '-'}</td>
                                            <td>${Utils.escapeHtml(user.nickname || '-')}</td>
                                            <td>
                                                ${(() => {
                const info = this.resolveRole(user);
                return `<span class="tag ${info.cls}">${info.label}</span>`;
            })()}
                                            </td>
                                            <td>
                                                <span class="tag ${user.is_active ? 'tag-primary' : 'tag-danger'}">
                                                    ${user.is_active ? '已激活' : '待审核'}
                                                </span>
                                            </td>
                                            <td>${Utils.formatDate(user.created_at)}</td>
                                            <td>
                                                ${!user.is_active ? `
                                                    <button class="btn btn-ghost btn-sm" data-audit-pass="${user.id}">通过</button>
                                                    <button class="btn btn-ghost btn-sm" data-audit-reject="${user.id}">拒绝</button>
                                                ` : ''}
                                                ${user.is_active ? `
                                                    <button class="btn btn-ghost btn-sm" data-disable="${user.id}">禁用</button>
                                                ` : `
                                                    ${user.role !== 'guest' ? `<button class="btn btn-ghost btn-sm" data-enable="${user.id}">启用</button>` : ''}
                                                `}
                                                <button class="btn btn-ghost btn-sm" data-perms="${user.id}">权限</button>
                                                ${user.role !== 'admin' ? `
                                                    <button class="btn btn-ghost btn-sm" data-delete="${user.id}" data-username="${Utils.escapeHtml(user.username)}">删除</button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    ${Utils.renderPagination(page, pages)}
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">👥</div>
                            <p class="empty-text">暂无用户</p>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        // 重置事件绑定标志，确保重新挂载时能重新绑定
        this._eventsBinded = false;
        this._auditing = {};
        this._toggling = {};
        this._deleting = {};
        this._permsModalOpen = false;
        this._handlers = {};
        this._filterHandlers = {};
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        // 只在首次绑定后不再重复绑定
        if (!this._eventsBinded) {
            this.bindEvents();
        }
        // 每次更新后重新绑定筛选/搜索事件
        if (typeof this.bindFilterEvents === 'function') {
            this.bindFilterEvents();
        }
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // 批量导入按钮 - 使用事件委托
            this.delegate('click', '#importUsersBtn', () => {
                this.showImportModal();
            });

            // 下载导入模板按钮
            this.delegate('click', '#downloadTemplateBtn', () => {
                const token = Store.get('token');
                window.open(`/api/v1/export/import/users/template?format=xlsx&token=${token}`, '_blank');
            });

            // 筛选器
            this.delegate('change', '#filterRole', (e) => this.handleFilter('role', e.target.value));
            this.delegate('change', '#filterStatus', (e) => this.handleFilter('is_active', e.target.value));
            this.delegate('click', '#searchBtn', () => {
                const keyword = this.$('#filterKeyword')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            });
            this.delegate('keydown', '#filterKeyword', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const keyword = this.$('#filterKeyword')?.value.trim() || '';
                    this.handleFilter('keyword', keyword);
                }
            });
            this.delegate('click', '#exportUsersBtn', () => this.handleExport());

            // 使用单一的事件监听器处理所有点击事件
            const clickHandler = (e) => {
                // 分页
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && this.container.contains(pageBtn)) {
                    e.stopPropagation();
                    const page = parseInt(pageBtn.dataset.page);
                    if (page > 0) this.changePage(page);
                    return;
                }

                // 审核通过
                const auditPassBtn = e.target.closest('[data-audit-pass]');
                if (auditPassBtn && this.container.contains(auditPassBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(auditPassBtn.dataset.auditPass);
                    if (userId) this.handleAudit(userId, true);
                    return;
                }

                // 审核拒绝
                const auditRejectBtn = e.target.closest('[data-audit-reject]');
                if (auditRejectBtn && this.container.contains(auditRejectBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(auditRejectBtn.dataset.auditReject);
                    if (userId) this.handleAudit(userId, false);
                    return;
                }

                // 启用
                const enableBtn = e.target.closest('[data-enable]');
                if (enableBtn && this.container.contains(enableBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(enableBtn.dataset.enable);
                    if (userId) this.handleToggleStatus(userId, false);
                    return;
                }

                // 禁用
                const disableBtn = e.target.closest('[data-disable]');
                if (disableBtn && this.container.contains(disableBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(disableBtn.dataset.disable);
                    if (userId) this.handleToggleStatus(userId, true);
                    return;
                }

                // 删除
                const deleteBtn = e.target.closest('[data-delete]');
                if (deleteBtn && this.container.contains(deleteBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(deleteBtn.dataset.delete);
                    const username = deleteBtn.dataset.username;
                    if (userId && username) this.handleDelete(userId, username);
                    return;
                }
            };
            this._handlers.clickHandler = clickHandler;
            this.container.addEventListener('click', clickHandler);

            // 权限设置弹窗 - 防止重复打开
            const handlePerms = async (e, target) => {
                e.stopPropagation();
                const userId = target.dataset.perms;

                // 防止重复打开弹窗
                if (this._permsModalOpen) {
                    return;
                }
                this._permsModalOpen = true;

                const currentUser = this.state.users.find(u => String(u.id) === String(userId));

                // 拉取用户组
                let groups = [];
                try {
                    const res = await GroupApi.list();
                    groups = res.data || [];
                } catch (err) {
                    Toast.error('加载用户组失败');
                    return;
                }

                // 模块（只取已启用的）
                const modules = (Store.get('modules') || []).filter(m => m.enabled !== false);
                const moduleOptions = modules.map(m => ({ id: m.id, name: m.name || m.id }));

                const currentPerms = currentUser?.permissions || [];
                const currentModules = moduleOptions.filter(m => currentPerms.includes(`${m.id}.*`)).map(m => m.id);
                const currentGroupIds = currentUser?.role_ids || [];
                const currentRole = currentUser?.role || 'user';

                // 定义用户组优先级（数字越大优先级越高）
                const groupPriority = {
                    'admin': 4,
                    'manager': 3,
                    'user': 2,
                    'guest': 1
                };

                // 获取用户组的优先级
                const getGroupPriority = (groupIds) => {
                    if (!groupIds || groupIds.length === 0) return 0;
                    const group = groups.find(g => groupIds.includes(g.id));
                    return group ? (groupPriority[group.name] || 0) : 0;
                };

                const computeAllowed = (selectedIds) => {
                    const allowedModules = new Set();
                    const specific = new Set();
                    let wildcard = false;
                    groups.forEach(g => {
                        if (!selectedIds.includes(g.id)) return;
                        (g.permissions || []).forEach(p => {
                            if (p === '*') {
                                wildcard = true;
                            } else if (p.endsWith('.*')) {
                                allowedModules.add(p.split('.')[0]);
                            } else if (p.includes('.')) {
                                allowedModules.add(p.split('.')[0]);
                                specific.add(p);
                            }
                        });
                    });
                    return { wildcard, allowedModules, specific };
                };

                const renderModules = (selectedGroupIds, presetModules = [], isUpgrade = false) => {
                    const { wildcard, allowedModules } = computeAllowed(selectedGroupIds);

                    // 如果是升级，默认选中所有允许的模块
                    // 如果是降级或保持，使用预设的模块（保留用户已选择的）
                    let defaultModules;
                    if (isUpgrade) {
                        // 升级：默认选中所有允许的模块
                        defaultModules = wildcard ? moduleOptions.map(m => m.id) : Array.from(allowedModules);
                    } else {
                        // 降级或保持：只保留在允许范围内的已选模块
                        defaultModules = presetModules.length
                            ? presetModules.filter(m => wildcard || allowedModules.has(m))
                            : (wildcard ? moduleOptions.map(m => m.id) : Array.from(allowedModules));
                    }

                    return moduleOptions.map(m => {
                        const allowed = wildcard || allowedModules.has(m.id);
                        const checked = defaultModules.includes(m.id);
                        return `
                            <label style="display:flex;align-items:center;gap:6px;opacity:${allowed ? 1 : 0.55};">
                                <input type="checkbox" name="modules" value="${m.id}" ${checked ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
                                <span>${m.name}</span>
                                ${allowed ? '' : '<span class="tag tag-default">超出用户组</span>'}
                            </label>
                        `;
                    }).join('');
                };

                const rolesHtml = groups.map(r => `
                    <label style="display:flex;align-items:center;gap:6px;">
                        <input type="radio" name="roles" value="${r.id}" ${currentGroupIds.includes(r.id) ? 'checked' : ''}>
                        <span>${Utils.escapeHtml(r.name)}</span>
                    </label>
                `).join('');

                const renderSpecific = (selectedGroupIds, presetSpecific = [], isUpgrade = false) => {
                    const { specific, wildcard } = computeAllowed(selectedGroupIds);
                    const allowedSpecific = Array.from(specific);
                    if (!wildcard && allowedSpecific.length === 0) {
                        return '<div style="color:var(--text-secondary);">该用户组未暴露子功能权限</div>';
                    }

                    // 如果是升级，默认选中所有允许的子功能
                    // 如果是降级或保持，使用预设的子功能（保留用户已选择的）
                    let presets;
                    if (isUpgrade) {
                        // 升级：默认选中所有允许的子功能
                        // 如果用户组是全权限（wildcard），保留已有的子功能（如果有），否则为空（全权限不需要子功能）
                        // 如果用户组有具体权限，选中所有允许的子功能
                        presets = wildcard ? (presetSpecific.length ? presetSpecific : []) : allowedSpecific;
                    } else {
                        // 降级或保持：只保留在允许范围内的已选子功能
                        if (wildcard) {
                            // 全权限：保留已有的子功能
                            presets = presetSpecific.length ? presetSpecific : [];
                        } else {
                            // 具体权限：只保留在允许范围内的已选子功能
                            presets = presetSpecific.length ? presetSpecific.filter(p => specific.has(p)) : allowedSpecific;
                        }
                    }

                    // 构建分组显示
                    // 如果用户组是全权限，显示已有的子功能（如果有），否则显示所有允许的子功能
                    const displayList = wildcard && presets.length ? presets : allowedSpecific;
                    const grouped = {};
                    displayList.forEach(p => {
                        const [mod, ...rest] = p.split('.');
                        const tail = rest.join('.') || p;
                        if (!grouped[mod]) grouped[mod] = [];
                        grouped[mod].push({ id: p, tail });
                    });
                    const moduleKeys = Object.keys(grouped);
                    if (moduleKeys.length === 0 && wildcard) {
                        return '<div style="color:var(--text-secondary);">用户组为全权限，可通过不选来收紧。</div>';
                    }
                    return moduleKeys.map(mod => `
                        <div style="margin-bottom:8px;">
                            <div class="form-label" style="margin-bottom:4px;">${mod}</div>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${grouped[mod].map(item => `
                                    <label style="display:flex;align-items:center;gap:6px;">
                                        <input type="checkbox" name="specific" value="${item.id}" ${presets.includes(item.id) ? 'checked' : ''}>
                                        <span>${item.tail}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('');
                };

                const currentSpecific = (currentPerms || []).filter(p => p !== '*' && !p.endsWith('.*'));

                const content = `
                    <div style="display:grid;gap:12px;">
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">用户组（单选）</div>
                            <div id="groupBox" style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${rolesHtml || '<span style="color:var(--text-secondary)">暂无用户组，请先创建</span>'}
                            </div>
                        </div>
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">模块访问（在用户组权限范围内收紧）</div>
                            <div id="moduleAccessBox" style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${renderModules(currentGroupIds, currentModules)}
                            </div>
                            <div style="color:var(--text-secondary);font-size:12px;margin-top:4px;">
                                用户组决定可见的模块范围，勾选后为该用户开放，未勾选则收紧为不可用。
                            </div>
                        </div>
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">子功能权限（可在用户组范围内收紧）</div>
                            <div id="specificBox" style="display:flex;gap:12px;flex-direction:column;">
                                ${renderSpecific(currentGroupIds, currentSpecific)}
                            </div>
                        </div>
                    </div>
                `;

                const { overlay, close } = Modal.show({
                    title: `设置权限 - 用户ID ${userId}`,
                    content,
                    footer: `
                        <button class="btn btn-secondary" data-close>取消</button>
                        <button class="btn btn-primary" id="savePerms">保存</button>
                    `,
                    onClose: () => {
                        // 弹窗关闭时重置标志
                        this._permsModalOpen = false;
                    }
                });

                // 记录初始用户组，用于判断升级/降级
                let previousGroupIds = [...currentGroupIds];

                const getSelectedGroupIds = () => {
                    const checked = overlay.querySelector('#groupBox input[name="roles"]:checked');
                    return checked ? [parseInt(checked.value)] : [];
                };
                const getSelectedModules = () =>
                    Array.from(overlay.querySelectorAll('#moduleAccessBox input[name="modules"]:checked')).map(i => i.value);
                const getSelectedSpecific = () =>
                    Array.from(overlay.querySelectorAll('#specificBox input[name="specific"]:checked')).map(i => i.value);

                const refreshModules = () => {
                    const selectedGroupIds = getSelectedGroupIds();

                    // 判断是升级还是降级
                    // 从无用户组到有用户组，或者从低优先级到高优先级，都视为升级
                    const previousPriority = getGroupPriority(previousGroupIds);
                    const currentPriority = getGroupPriority(selectedGroupIds);
                    const isUpgrade = currentPriority > previousPriority;

                    // 获取当前已选中的模块和子功能（用于降级时保留）
                    const currentCheckedModules = getSelectedModules();
                    const currentCheckedSpecific = getSelectedSpecific();

                    // 刷新模块和子功能显示
                    overlay.querySelector('#moduleAccessBox').innerHTML = renderModules(selectedGroupIds, currentCheckedModules, isUpgrade);
                    overlay.querySelector('#specificBox').innerHTML = renderSpecific(selectedGroupIds, currentCheckedSpecific, isUpgrade);

                    // 更新记录的用户组
                    previousGroupIds = [...selectedGroupIds];
                };

                // 绑定用户组切换
                overlay.querySelectorAll('#groupBox input[name="roles"]').forEach(el => {
                    el.addEventListener('change', refreshModules);
                });

                // 保存 - 防止重复点击
                let saving = false;
                overlay.querySelector('#savePerms')?.addEventListener('click', async () => {
                    if (saving) {
                        return;
                    }
                    saving = true;

                    const selectedGroupIds = getSelectedGroupIds();
                    const selectedModules = getSelectedModules();
                    const selectedSpecific = getSelectedSpecific();
                    const { wildcard, allowedModules, specific } = computeAllowed(selectedGroupIds);

                    if (!wildcard) {
                        const invalid = selectedModules.filter(m => !allowedModules.has(m));
                        if (invalid.length) {
                            Toast.error(`存在超出用户组的模块：${invalid.join(', ')}`);
                            saving = false;
                            return;
                        }
                        const invalidSpec = selectedSpecific.filter(p => !specific.has(p));
                        if (invalidSpec.length) {
                            Toast.error(`存在超出用户组的子功能：${invalidSpec.join(', ')}`);
                            saving = false;
                            return;
                        }
                    }
                    if (!selectedGroupIds.length && selectedModules.length) {
                        Toast.error('请先选择用户组，再为用户分配模块');
                        saving = false;
                        return;
                    }
                    try {
                        await UserApi.updatePermissions(userId, {
                            module_access: selectedModules,
                            role_ids: selectedGroupIds,
                            specific_perms: selectedSpecific
                        });
                        Toast.success('权限已更新');
                        this._permsModalOpen = false;
                        close();
                        this.loadData();
                    } catch (err) {
                        Toast.error(err.message);
                        saving = false;
                    }
                });

                // 关闭按钮也重置标志
                overlay.querySelectorAll('[data-close]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._permsModalOpen = false;
                    }, { once: true });
                });
            };

            // 使用事件委托绑定权限按钮
            const permsClickHandler = (e) => {
                const permsBtn = e.target.closest('[data-perms]');
                if (permsBtn && this.container.contains(permsBtn)) {
                    handlePerms(e, permsBtn);
                }
            };
            this._handlers.permsClickHandler = permsClickHandler;
            this.container.addEventListener('click', permsClickHandler);
        }
    }

    bindFilterEvents() {
        // 为过滤和搜索绑定事件（非委托），避免渲染替换后失效
        const bind = (selector, event, key, handler) => {
            const el = this.$(selector);
            if (!el) return;
            if (this._filterHandlers[key]) {
                el.removeEventListener(event, this._filterHandlers[key]);
            }
            el.addEventListener(event, handler);
            this._filterHandlers[key] = handler;
        };

        bind('#filterRole', 'change', 'roleChange', (e) => this.handleFilter('role', e.target.value));
        bind('#filterStatus', 'change', 'statusChange', (e) => this.handleFilter('is_active', e.target.value));
        bind('#searchBtn', 'click', 'searchClick', () => {
            const keyword = this.$('#filterKeyword')?.value.trim() || '';
            this.handleFilter('keyword', keyword);
        });
        bind('#filterKeyword', 'keydown', 'searchEnter', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.$('#filterKeyword')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            }
        });
    }

    handleExport() {
        const token = localStorage.getItem(Config.storageKeys.token);
        if (!token) {
            Toast.error('请先登录');
            return;
        }
        window.open(`${ExportApi.exportUsers('xlsx')}&token=${token}`, '_blank');
    }

    destroy() {
        if (this._eventsBinded && this.container) {
            if (this._handlers.roleHandler) {
                this.$('#filterRole')?.removeEventListener('change', this._handlers.roleHandler);
            }
            if (this._handlers.statusHandler) {
                this.$('#filterStatus')?.removeEventListener('change', this._handlers.statusHandler);
            }
            if (this._handlers.searchHandler) {
                this.$('#searchBtn')?.removeEventListener('click', this._handlers.searchHandler);
            }
            if (this._handlers.clickHandler) {
                this.container.removeEventListener('click', this._handlers.clickHandler);
            }
            if (this._handlers.permsClickHandler) {
                this.container.removeEventListener('click', this._handlers.permsClickHandler);
            }
        }
        this._eventsBinded = false;
        this._handlers = {};
    }
}

// 待审核用户页
class PendingUsersPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            users: [],
            loading: true
        };
        this._eventsBinded = false;
        this._auditing = {};
        this._handlers = {};
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const res = await UserApi.getPendingUsers();
            this.setState({
                users: res.data,
                loading: false
            });
        } catch (error) {
            Toast.error('加载待审核用户失败');
            this.setState({ loading: false });
        }
    }

    async handleAudit(userId, isActive) {
        // 防止重复调用
        const key = `audit_${userId}_${isActive}`;
        if (this._auditing && this._auditing[key]) {
            return;
        }
        if (!this._auditing) {
            this._auditing = {};
        }
        this._auditing[key] = true;

        try {
            const action = isActive ? '通过' : '拒绝';
            const reason = await Modal.prompt(`审核${action}`, `请输入审核备注（可选）`);

            // 如果用户取消，reason 为 null
            if (reason === null) {
                delete this._auditing[key];
                return;
            }

            // 在审核过程中，禁用所有审核按钮，防止重复点击
            const auditButtons = this.container.querySelectorAll('[data-audit-pass], [data-audit-reject]');
            auditButtons.forEach(btn => {
                btn.disabled = true;
            });

            try {
                await UserApi.auditUser(userId, {
                    is_active: isActive,
                    reason: reason || null
                });
                Toast.success(`用户审核${action}成功`);

                // 审核成功后，重新加载数据（这会更新 DOM，用户会从列表中移除）
                await this.loadData();
            } catch (error) {
                Toast.error(error.message);
                // 如果审核失败，重新启用按钮
                auditButtons.forEach(btn => {
                    btn.disabled = false;
                });
            }
        } catch (error) {
            Toast.error(error.message || '审核操作失败');
        } finally {
            delete this._auditing[key];
        }
    }

    render() {
        const { users, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">待审核用户</h1>
                        <p class="page-desc">共 ${users.length} 个待审核用户</p>
                    </div>
                    <a href="#/users/list" class="btn btn-secondary">
                        ← 返回用户列表
                    </a>
                </div>
                
                ${users.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>用户名</th>
                                        <th>手机号</th>
                                        <th>昵称</th>
                                        <th>注册时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => `
                                        <tr>
                                            <td>${user.id}</td>
                                            <td>${Utils.escapeHtml(user.username)}</td>
                                            <td>${user.phone || '-'}</td>
                                            <td>${Utils.escapeHtml(user.nickname || '-')}</td>
                                            <td>${Utils.formatDate(user.created_at)}</td>
                                            <td>
                                                <button class="btn btn-primary btn-sm" data-audit-pass="${user.id}">通过</button>
                                                <button class="btn btn-danger btn-sm" data-audit-reject="${user.id}">拒绝</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">✅</div>
                            <p class="empty-text">暂无待审核用户</p>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        this._auditing = {};
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        // 待审核用户页面不需要在更新后重新绑定事件
        // 因为事件委托绑定在容器上，DOM 更新不影响事件监听
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // 审核通过 - 使用 once 选项防止重复触发
            const handlePass = (e, target) => {
                e.stopPropagation();
                const userId = parseInt(target.dataset.auditPass);
                if (userId) {
                    this.handleAudit(userId, true);
                }
            };

            // 审核拒绝 - 使用 once 选项防止重复触发
            const handleReject = (e, target) => {
                e.stopPropagation();
                const userId = parseInt(target.dataset.auditReject);
                if (userId) {
                    this.handleAudit(userId, false);
                }
            };

            // 使用事件委托，但只绑定一次
            const clickHandler = (e) => {
                const passBtn = e.target.closest('[data-audit-pass]');
                if (passBtn && this.container.contains(passBtn)) {
                    handlePass(e, passBtn);
                    return;
                }
                const rejectBtn = e.target.closest('[data-audit-reject]');
                if (rejectBtn && this.container.contains(rejectBtn)) {
                    handleReject(e, rejectBtn);
                    return;
                }
            };
            this._handlers.clickHandler = clickHandler;
            this.container.addEventListener('click', clickHandler);
        }
    }

    destroy() {
        if (this._eventsBinded && this.container && this._handlers?.clickHandler) {
            this.container.removeEventListener('click', this._handlers.clickHandler);
        }
        this._eventsBinded = false;
        this._handlers = {};
    }
}


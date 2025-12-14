/**
 * 用户组（权限模板）管理
 * 列出用户组，支持新增/编辑/删除，勾选模块功能点
 */

class RolesPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            roles: [],
            loading: true
        };
        // 功能列表由模块 manifest.permissions 动态生成；如果无法获取则回退为空
        this.featureMap = {};
    }

    getRoleDisplayName(name) {
        const map = {
            'admin': '系统管理员',
            'manager': '管理员',
            'guest': '访客',
            'user': '普通用户'
        };
        return map[name] || name;
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const [rolesRes, modulesRes] = await Promise.all([
                GroupApi.list(),
                SystemApi.getModules().catch(() => ({ data: [] }))
            ]);

            // 根据模块列表生成功能清单
            const featureMap = {};
            (modulesRes.data || []).forEach(m => {
                const perms = (m.permissions || []).map(p => {
                    const tail = p.split('.').slice(1).join('.') || p;
                    return { id: p, label: `${m.name || m.id} - ${tail}` };
                });
                if (perms.length) featureMap[m.id] = perms;
            });
            if (Object.keys(featureMap).length > 0) {
                this.featureMap = featureMap;
            }

            this.setState({ roles: rolesRes.data || [], loading: false });
        } catch (e) {
            Toast.error('加载用户组失败');
            this.setState({ loading: false });
        }
    }

    openEditor(role = null) {
        const isEdit = !!role;
        const isAdmin = role && role.name === 'admin';
        const isManager = role && role.name === 'manager';
        const isSystemRole = role && ['admin', 'manager', 'user', 'guest'].includes(role.name);
        const perms = role?.permissions || [];
        const featureEntries = Object.entries(this.featureMap);

        // admin 和 manager 用户组权限不可编辑
        let featuresHtml = '';
        if (isAdmin) {
            featuresHtml = `
                <div style="padding:12px;background:var(--bg-secondary);border-radius:4px;margin-bottom:12px;">
                    <div style="color:var(--text-primary);font-weight:500;margin-bottom:4px;">
                        ⚠️ 系统管理员用户组默认拥有所有功能模块的所有权限
                    </div>
                    <div style="color:var(--text-secondary);font-size:13px;">
                        无需手动设置权限，系统已自动分配全部权限
                    </div>
                </div>
                <div style="color:var(--text-secondary);font-size:13px;padding:8px;background:var(--bg-tertiary);border-radius:4px;">
                    权限列表：<code style="background:transparent;padding:0;">["*"]</code>（全权限）
                </div>
            `;
        } else if (isManager) {
            featuresHtml = `
                <div style="padding:12px;background:var(--bg-secondary);border-radius:4px;margin-bottom:12px;">
                    <div style="color:var(--text-primary);font-weight:500;margin-bottom:4px;">
                        ⚠️ 管理员用户组拥有受限的全部权限
                    </div>
                    <div style="color:var(--text-secondary);font-size:13px;">
                        管理员可以管理普通用户和访客，但无法管理系统管理员和其他管理员。部分系统级权限（如备份、日志审计）不可用。
                    </div>
                </div>
                <div style="color:var(--text-secondary);font-size:13px;padding:8px;background:var(--bg-tertiary);border-radius:4px;">
                    权限列表：<code style="background:transparent;padding:0;">["*"]</code>（受限全权限）
                </div>
            `;
        } else {
            const hasWildcard = perms.includes('*');
            featuresHtml = featureEntries.length ? featureEntries.map(([moduleId, list]) => `
                <div style="margin-bottom:10px;">
                    <div class="form-label" style="margin-bottom:4px;">${moduleId}</div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        ${list.map(f => `
                            <label style="display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" name="perms" value="${f.id}" ${hasWildcard || perms.includes(f.id) ? 'checked' : ''}>
                                <span>${f.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('') : '<div style="color:var(--text-secondary);">暂无可配置的模块功能，请先在应用中心加载模块</div>';
        }

        Modal.show({
            title: isEdit ? `编辑用户组 - ${this.getRoleDisplayName(role.name)}` : '新建用户组',
            content: `
                <form id="roleForm">
                    <div class="form-group">
                        <label class="form-label">名称</label>
                        ${isSystemRole ?
                    `<div class="form-input" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);">${this.getRoleDisplayName(role?.name)} <span style="color:var(--text-secondary)">(${role?.name})</span></div>
                             <input type="hidden" name="name" value="${role?.name}">`
                    : `<input type="text" class="form-input" name="name" value="${Utils.escapeHtml(role?.name || '')}" placeholder="用户组名称" required>`
                }
                        ${isSystemRole ? '<div style="color:var(--text-secondary);font-size:12px;margin-top:4px;">系统预置用户组名称不可修改</div>' : ''}
                    </div>
                    <div class="form-group">
                        <label class="form-label">功能权限（模块与子权限）</label>
                        ${featuresHtml}
                    </div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="saveRole">保存</button>
            `
        });

        document.getElementById('saveRole')?.addEventListener('click', async () => {
            const name = document.querySelector('#roleForm input[name="name"]').value.trim();
            let perms = Array.from(document.querySelectorAll('#roleForm input[name="perms"]:checked')).map(i => i.value);

            if (!name) {
                Toast.error('请输入名称');
                return;
            }

            // admin 和 manager 用户组自动设置为全权限（manager 受角色限制）
            if (name === 'admin' || name === 'manager') {
                perms = ['*'];
            }

            try {
                if (isEdit) {
                    await GroupApi.update(role.id, { name, permissions: perms });
                } else {
                    await GroupApi.create({ name, permissions: perms });
                }
                Toast.success('保存成功');
                Modal.closeAll();
                this.loadData();
            } catch (err) {
                Toast.error(err.message);
            }
        });
    }

    async removeRole(id) {
        Modal.confirm('删除用户组', '确定删除该用户组吗？', async () => {
            try {
                await GroupApi.remove(id);
                Toast.success('已删除');
                this.loadData();
            } catch (err) {
                Toast.error(err.message);
            }
        });
    }

    render() {
        const { roles, loading } = this.state;
        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h1 class="page-title">用户组</h1>
                        <p class="page-desc">用户组定义模块及子功能的允许范围，用户在组内可再收紧</p>
                    </div>
                    <button class="btn btn-primary" id="createRole">新建用户组</button>
                </div>
                <div class="card">
                    ${loading ? '<div class="loading"></div>' : roles.length === 0 ? `
                        <div class="empty-state" style="padding:40px 0;">
                            <div class="empty-icon">🧩</div>
                            <p class="empty-text">暂无用户组</p>
                        </div>
                    ` : `
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>名称</th>
                                        <th>用户数</th>
                                        <th>权限数</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${roles.map(r => {
            // 权限数显示逻辑
            const perms = r.permissions || [];
            let permCount;
            if (r.name === 'admin') {
                permCount = '∞ (全部)';
            } else if (perms.includes('*') && r.name === 'manager') {
                permCount = '∞ (受限)';
            } else if (perms.includes('*')) {
                permCount = '∞ (全部)';
            } else {
                permCount = perms.length;
            }
            return `
                                        <tr>
                                            <td>${r.id}</td>
                                            <td>${Utils.escapeHtml(this.getRoleDisplayName(r.name))} <span style="color:var(--text-secondary);font-size:12px;">(${r.name})</span></td>
                                            <td>${r.user_count || 0}</td>
                                            <td>${permCount}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-edit-role="${r.id}">编辑</button>
                                                <button class="btn btn-ghost btn-sm" data-del-role="${r.id}">删除</button>
                                                <button class="btn btn-ghost btn-sm" data-view-users="${r.id}">查看用户</button>
                                            </td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }
    afterUpdate() {
        this.bindEvents();
    }
    bindEvents() {
        if (this.container && !this.container._bindedRoles) {
            this.container._bindedRoles = true;
            // 用事件委托，避免重渲染后失效
            this.delegate('click', '#createRole', () => this.openEditor());
            this.delegate('click', '[data-edit-role]', (e, t) => {
                const id = parseInt(t.dataset.editRole);
                const role = this.state.roles.find(r => r.id === id);
                if (role) this.openEditor(role);
            });
            this.delegate('click', '[data-del-role]', (e, t) => {
                const id = parseInt(t.dataset.delRole);
                this.removeRole(id);
            });
            this.delegate('click', '[data-view-users]', async (e, t) => {
                const id = parseInt(t.dataset.viewUsers);
                try {
                    const res = await GroupApi.users(id);
                    const users = res.data || [];
                    const content = users.length ? `
                        <div class="table-wrapper" style="max-height:320px;overflow:auto;">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>用户名</th>
                                        <th>昵称</th>
                                        <th>角色</th>
                                        <th>状态</th>
                                        <th>创建时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(u => `
                                        <tr>
                                            <td>${u.id}</td>
                                            <td>${Utils.escapeHtml(u.username)}</td>
                                            <td>${Utils.escapeHtml(u.nickname || '-')}</td>
                                            <td>${u.role}</td>
                                            <td>${u.is_active ? '已激活' : '待审核'}</td>
                                            <td>${Utils.formatDate(u.created_at)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div style="color:var(--text-secondary);">暂无用户</div>';
                    Modal.show({
                        title: `用户组成员 - ID ${id}`,
                        content,
                        footer: `<button class="btn btn-primary" data-close>关闭</button>`
                    });
                } catch (err) {
                    Toast.error(err.message || '加载用户失败');
                }
            });
        }
    }
}

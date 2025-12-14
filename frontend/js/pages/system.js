/**
 * 系统管理页面
 * 包含：应用中心、系统设置、系统日志
 */

class AppCenterPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            modules: [],
            loading: true,
            creating: false,
            deleting: false
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const res = await SystemApi.getModules();
            this.setState({ modules: res.data, loading: false });
        } catch (e) {
            Toast.error('加载模块列表失败');
            this.setState({ loading: false });
        }
    }

    async toggleModule(id, enabled) {
        try {
            await SystemApi.toggleModule(id, enabled);
            Toast.success('已保存');
            this.loadData();
            await Store.refreshSystemInfo();
        } catch (e) {
            Toast.error(e.message);
        }
    }

    async checkHealth(id) {
        try {
            const res = await SystemApi.healthModule(id);
            Toast.success(`健康状态: ${res.data.health}`);
        } catch (e) {
            Toast.error('健康检查失败');
        }
    }

    /**
     * 检测是否是服务重启导致的错误
     * 热重载时请求可能被中断，导致假错误
     */
    isServerRestartError(error) {
        if (!error) return false;
        const msg = error.message || '';
        // 常见的连接中断错误特征
        return msg.includes('请求失败') ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError') ||
            msg.includes('network') ||
            msg.includes('ERR_CONNECTION') ||
            msg.includes('ECONNRESET') ||
            error.code === 500;
    }

    /**
     * 等待服务重启完成后自动刷新
     * @param {string} action 操作类型（创建/删除）
     */
    waitForServerAndRefresh(action = '') {
        let attempts = 0;
        const maxAttempts = 20; // 最多尝试20次，共约22秒

        const checkServer = async () => {
            attempts++;
            try {
                // 尝试请求API检测服务是否恢复
                await SystemApi.getModules();

                // 刷新系统信息（包括侧边栏菜单）
                await Store.refreshSystemInfo();

                Toast.success(`${action}操作完成，页面已刷新`);
                this.loadData();
            } catch (e) {
                if (attempts < maxAttempts) {
                    // 服务还没恢复，继续等待
                    setTimeout(checkServer, 1000);
                } else {
                    // 超时后提示用户手动刷新
                    Toast.warning('服务重启时间较长，请手动刷新页面');
                }
            }
        };

        // 延迟2秒后开始检测，给服务器重启留出时间
        setTimeout(checkServer, 2000);
    }

    showDeleteModal(id) {
        new Modal({
            title: '删除模块',
            confirmText: '确认删除',
            confirmType: 'danger',
            content: `
                <div class="alert alert-warning" style="margin-bottom: 20px;">
                    <p>确定要永久删除模块 <strong>"${id}"</strong> 吗？</p>
                    <p>此操作将删除后端代码、前端页面及路由配置。</p>
                </div>
                <div class="form-group" style="margin-bottom: 10px;">
                    <label class="checkbox">
                        <input type="checkbox" id="del_db_${id}">
                        <span>同时删除关联的数据库表 (表名以 ${id}_ 开头)</span>
                    </label>
                </div>
                <div class="form-group" style="margin-left: 24px; display: none;" id="backup_area_${id}">
                    <label class="checkbox">
                        <input type="checkbox" id="backup_db_${id}" checked>
                        <span>删除前备份数据 (推荐)</span>
                    </label>
                </div>
            `,
            onConfirm: async () => {
                const deleteDb = document.getElementById(`del_db_${id}`).checked;
                const backupDb = document.getElementById(`backup_db_${id}`).checked;

                // 二次确认
                if (deleteDb) {
                    if (!confirm('【严重警告】您选择了删除数据库表！\n此操作不可逆！确认要继续吗？')) {
                        return false;
                    }
                }

                try {
                    // 构建查询参数
                    const params = {
                        delete_db: deleteDb,
                        backup_db: backupDb
                    };

                    await SystemApi.deleteModule(id, params);
                    Toast.success('模块删除成功！后端服务正在重启...');

                    // 等待服务重启后自动刷新
                    this.waitForServerAndRefresh('删除');
                    return true;
                } catch (e) {
                    // 检查是否是因为服务重启导致的连接中断
                    if (this.isServerRestartError(e)) {
                        Toast.info('模块可能已删除成功，服务正在重启中...');
                        this.waitForServerAndRefresh('删除');
                        return true;
                    }
                    Toast.error(e.message || '删除失败');
                    return false;
                }
            }
        }).show();

        // 联动逻辑
        setTimeout(() => {
            const delCheck = document.getElementById(`del_db_${id}`);
            const backupArea = document.getElementById(`backup_area_${id}`);
            if (delCheck && backupArea) {
                delCheck.onchange = () => {
                    backupArea.style.display = delCheck.checked ? 'block' : 'none';
                };
            }
        }, 100);
    }

    handleDelete(id) {
        this.showDeleteModal(id);
    }

    showCreateModal() {
        new Modal({
            title: '新建模块',
            content: `
                <form id="createModuleForm">
                    <div class="form-group">
                        <label class="form-label">模块ID (英文)</label>
                        <input type="text" name="id" class="form-input" placeholder="例如: project_manager" required pattern="[a-z0-9_]+" title="仅限小写字母、数字和下划线">
                        <small class="form-hint">只能包含小写字母、数字和下划线</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">模块名称</label>
                        <input type="text" name="name" class="form-input" placeholder="例如: 项目管理" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">作者</label>
                        <input type="text" name="author" class="form-input" value="JeJe WebOS">
                    </div>
                </form>
            `,
            onConfirm: async () => {
                const form = document.getElementById('createModuleForm');
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return false; // 阻止关闭
                }

                const formData = new FormData(form);
                const data = {
                    id: formData.get('id'),
                    name: formData.get('name'),
                    author: formData.get('author')
                };

                const btn = form.closest('.modal').querySelector('[data-action="confirm"]');
                const originalText = btn.innerText;

                try {
                    btn.classList.add('loading');
                    btn.innerText = '创建中...';
                    btn.disabled = true;

                    await SystemApi.createModule(data);
                    Toast.success('模块创建成功！后端服务正在重启...');

                    // 等待服务重启后自动刷新
                    this.waitForServerAndRefresh('创建');
                    return true; // 关闭模态框
                } catch (e) {
                    // 检查是否是因为服务重启导致的连接中断
                    if (this.isServerRestartError(e)) {
                        Toast.info('模块可能已创建成功，服务正在重启中...');
                        this.waitForServerAndRefresh('创建');
                        return true; // 关闭模态框
                    }
                    Toast.error(e.message || '创建失败');
                    btn.classList.remove('loading');
                    btn.innerText = originalText;
                    btn.disabled = false;
                    return false;
                }
            }
        }).show();
    }

    render() {
        const { modules, loading, deleting } = this.state;
        return `
            <div class="page fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">应用中心</h1>
                        <p class="page-desc">管理模块启停、创建新模块与健康检查</p>
                    </div>
                    <div class="actions">
                        <button class="btn btn-primary" id="btnCreateModule">
                            <span class="icon">➕</span> 新建模块
                        </button>
                    </div>
                </div>
                <div class="card">
                    ${loading ? '<div class="loading"></div>' : modules.length === 0 ? `
                        <div class="empty-state" style="padding: 40px 0;">
                            <div class="empty-icon">🧩</div>
                            <p class="empty-text">暂无模块</p>
                        </div>
                    ` : `
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th style="text-align:left;">模块</th>
                                    <th style="width:80px;text-align:center;">版本</th>
                                    <th style="text-align:left;">描述</th>
                                    <th style="text-align:left;">路由前缀</th>
                                    <th style="width:160px;text-align:center;">状态 / 开关</th>
                                    <th style="width:180px;text-align:center;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${modules.map(m => `
                                    <tr>
                                        <td>${m.icon || '📦'} ${Utils.escapeHtml(m.name)} <code>${m.id}</code></td>
                                        <td>${m.version}</td>
                                        <td class="truncate" style="max-width:200px;">${Utils.escapeHtml(m.description || '')}</td>
                                        <td><code>${m.router_prefix}</code></td>
                                        <td style="text-align:center;">
                                            <div style="display:inline-flex; gap:10px; align-items:center;">
                                                <span class="tag ${m.enabled ? 'tag-primary' : 'tag-secondary'}">
                                                    ${m.enabled ? '已启用' : '已禁用'}
                                                </span>
                                                <label class="switch" title="${m.enabled ? '点击禁用' : '点击启用'}">
                                                    <input type="checkbox" data-toggle="${m.id}" ${m.enabled ? 'checked' : ''}>
                                                    <span class="slider"></span>
                                                </label>
                                            </div>
                                        </td>
                                        <td style="text-align:center;">
                                            <div class="btn-group">
                                                <button class="btn btn-ghost btn-sm" data-health="${m.id}" title="检查健康状态">检查</button>
                                                ${!['system', 'user', 'auth', 'boot'].includes(m.id) ? `
                                                    <button class="btn btn-ghost btn-sm text-danger" 
                                                            data-delete="${m.id}" 
                                                            ${deleting === m.id ? 'disabled' : ''}>
                                                        ${deleting === m.id ? '删除中...' : '删除'}
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    `}
                </div>
            </div>
        `;
    }

    afterMount() { this.loadData(); this.bindEvents(); }
    afterUpdate() { this.bindEvents(); }

    bindEvents() {
        if (this.container && !this.container._bindedAppCenter) {
            this.container._bindedAppCenter = true;

            // 绑定新建按钮
            this.delegate('click', '#btnCreateModule', () => {
                this.showCreateModal();
            });

            this.delegate('change', '[data-toggle]', (e, t) => {
                const id = t.dataset.toggle;
                this.toggleModule(id, t.checked);
            });
            this.delegate('click', '[data-health]', (e, t) => {
                this.checkHealth(t.dataset.health);
            });
            this.delegate('click', '[data-delete]', (e, t) => {
                this.handleDelete(t.dataset.delete);
            });
        }
    }
}

class SystemSettingsPage extends Component {
    constructor(container) {
        super(container);
        this.state = { data: null, saving: false, loading: true };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const res = await SystemApi.getSettings();
            this.setState({ data: res.data, loading: false });
        } catch (e) {
            Toast.error('加载系统设置失败');
            this.setState({ loading: false });
        }
    }


    render() {
        const { data, saving, loading } = this.state;
        if (loading) return '<div class="loading"></div>';
        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">系统设置</h1>
                    <p class="page-desc">主题、安全策略、任务开关（系统策略优先于用户本地选择）</p>
                </div>
                <div class="card">
                    <form id="systemSettingsForm" class="card-body">
                        <div class="form-group">
                            <label class="form-label">主题模式</label>
                            <select name="theme_mode" class="form-input form-select">
                                <option value="auto" ${data.theme_mode === 'auto' ? 'selected' : ''}>跟随系统</option>
                                <option value="light" ${data.theme_mode === 'light' ? 'selected' : ''}>浅色</option>
                                <option value="dark" ${data.theme_mode === 'dark' ? 'selected' : ''}>深色</option>
                                <option value="sunrise" ${data.theme_mode === 'sunrise' ? 'selected' : ''}>macOS 26 (概念版)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">密码最小长度</label>
                            <input type="number" name="password_min_length" class="form-input" min="4" max="128" value="${data.password_min_length}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">JWT 过期时间（分钟）</label>
                            <input type="number" name="jwt_expire_minutes" class="form-input" min="15" max="${60 * 24 * 30}" value="${data.jwt_expire_minutes}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">登录失败锁定阈值</label>
                            <input type="number" name="login_fail_lock" class="form-input" min="3" max="20" value="${data.login_fail_lock}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">JWT 自动轮换</label>
                            <label class="switch">
                                <input type="checkbox" name="jwt_rotate_enabled" ${data.jwt_rotate_enabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>

                        <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
                        <h3 style="margin-bottom: 20px; font-size: 1.1em;">API 速率限制</h3>
                        
                        <div class="form-group">
                            <label class="form-label">请求速率限制 (次)</label>
                            <input type="number" name="rate_limit_requests" class="form-input" min="1" max="10000" value="${data.rate_limit_requests || 200}">
                            <small class="form-hint">每个限制窗口内允许的最大请求数</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">限制窗口时间 (秒)</label>
                            <input type="number" name="rate_limit_window" class="form-input" min="1" max="3600" value="${data.rate_limit_window || 60}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">超限封禁时长 (秒)</label>
                            <input type="number" name="rate_limit_block_duration" class="form-input" min="1" max="3600" value="${data.rate_limit_block_duration || 30}">
                            <small class="form-hint">触发限制后 IP 将被封禁的时间</small>
                        </div>

                        <div style="display:flex;gap:12px;margin-top:20px;">
                            <button type="button" class="btn btn-primary" id="saveSettings" ${saving ? 'disabled' : ''}>${saving ? '保存中...' : '保存设置'}</button>
                            <button type="button" class="btn btn-secondary" id="reloadSettings">刷新</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    afterMount() {
        console.log('SystemSettingsPage: afterMount called');
        this.loadData();
        this.bindGlobalEvents();
    }

    afterUpdate() {
        // 不需要重新绑定
    }

    bindGlobalEvents() {
        console.log('SystemSettingsPage: bindGlobalEvents called');

        // 使用一个统一的 click 事件处理器
        if (!this._clickHandler) {
            console.log('SystemSettingsPage: creating click handler');
            this._clickHandler = (e) => {
                const target = e.target;
                if (!target) return;

                // 调试：记录所有点击的元素
                console.log('Click detected:', target.tagName, target.id, target.className, 'text:', target.textContent?.substring(0, 20));

                // 保存按钮 - 检查按钮文本
                if (target.id === 'saveSettings' ||
                    target.closest('#saveSettings') ||
                    (target.tagName === 'BUTTON' && target.textContent?.includes('保存'))) {
                    console.log('SystemSettingsPage: save button clicked');
                    e.preventDefault();
                    this.handleSave();
                    return;
                }

                // 刷新按钮
                if (target.id === 'reloadSettings' || target.closest('#reloadSettings')) {
                    console.log('SystemSettingsPage: reload button clicked');
                    this.loadData();
                }
            };
            document.addEventListener('click', this._clickHandler);
        }
    }

    async handleSave() {
        if (this.state.saving) return;

        const form = document.getElementById('systemSettingsForm');
        if (!form) {
            console.error('Form not found');
            return;
        }

        // 获取表单值
        const themeMode = form.querySelector('[name="theme_mode"]')?.value;
        const passwordMinLength = form.querySelector('[name="password_min_length"]')?.value;
        const jwtExpireMinutes = form.querySelector('[name="jwt_expire_minutes"]')?.value;
        const loginFailLock = form.querySelector('[name="login_fail_lock"]')?.value;
        const jwtRotateEnabled = form.querySelector('[name="jwt_rotate_enabled"]')?.checked;

        const payload = {
            theme_mode: themeMode,
            password_min_length: parseInt(passwordMinLength) || 8,
            jwt_expire_minutes: parseInt(jwtExpireMinutes) || 10080,
            login_fail_lock: parseInt(loginFailLock) || 5,
            jwt_rotate_enabled: jwtRotateEnabled || false,
            rate_limit_requests: parseInt(form.querySelector('[name="rate_limit_requests"]')?.value) || 200,
            rate_limit_window: parseInt(form.querySelector('[name="rate_limit_window"]')?.value) || 60,
            rate_limit_block_duration: parseInt(form.querySelector('[name="rate_limit_block_duration"]')?.value) || 30
        };

        console.log('保存系统设置:', payload);

        this.setState({ saving: true });
        try {
            const result = await SystemApi.updateSettings(payload);
            console.log('保存结果:', result);
            Toast.success('保存成功');
            console.log('应用主题:', payload.theme_mode);
            Store.setTheme(payload.theme_mode);
            console.log('当前 HTML 类:', document.documentElement.className);
            this.loadData();
        } catch (err) {
            console.error('保存失败:', err);
            Toast.error(err.message || '保存失败');
        } finally {
            this.setState({ saving: false });
        }
    }

    destroy() {
        // 清理事件监听器
        if (this._clickHandler) {
            document.removeEventListener('click', this._clickHandler);
            this._clickHandler = null;
        }
        super.destroy();
    }
}

class AuditLogsPage extends Component {
    constructor(container) {
        super(container);
        this.state = { items: [], total: 0, page: 1, size: 20, loading: true, level: '', module: '', action: '' };
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size, level, module, action } = this.state;
        try {
            const res = await SystemApi.getAuditLogs({
                page,
                size,
                ...(level ? { level } : {}),
                ...(module ? { module } : {}),
                ...(action ? { action } : {})
            });
            this.setState({ items: res.data.items, total: res.data.total, loading: false });
        } catch (e) {
            Toast.error('加载日志失败');
            this.setState({ loading: false });
        }
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    render() {
        const { items, total, page, size, loading, level, module, action } = this.state;
        const pages = Math.ceil(total / size) || 1;
        const formatTime = (t) => {
            if (!t) return '-';
            const d = new Date(t);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${y}-${m}-${dd} ${hh}:${mi}:${ss}`;
        };
        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">系统日志</h1>
                    <div class="form-inline" style="display:flex;gap:8px;flex-wrap:wrap;">
                        <select class="form-input form-select" id="filterLevel" style="min-width:120px;">
                            <option value="">级别: 全部</option>
                            <option value="INFO" ${level === 'INFO' ? 'selected' : ''}>INFO</option>
                            <option value="WARNING" ${level === 'WARNING' ? 'selected' : ''}>WARNING</option>
                            <option value="ERROR" ${level === 'ERROR' ? 'selected' : ''}>ERROR</option>
                        </select>
                        <input type="text" id="filterModule" class="form-input" placeholder="模块" value="${Utils.escapeHtml(module)}">
                        <input type="text" id="filterAction" class="form-input" placeholder="动作" value="${Utils.escapeHtml(action)}">
                        <button class="btn btn-primary" id="filterSubmit">筛选</button>
                    </div>
                </div>
                <div class="card">
                    ${loading ? '<div class="loading"></div>' : items.length === 0 ? `
                        <div class="empty-state" style="padding: 40px 0;">
                            <div class="empty-icon">📜</div>
                            <p class="empty-text">暂无审计记录</p>
                        </div>
                    ` : `
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>时间</th>
                                    <th>级别</th>
                                    <th>模块</th>
                                    <th>动作</th>
                                    <th>用户</th>
                                    <th>IP</th>
                                    <th>消息</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(i => `
                                    <tr>
                                        <td>${formatTime(i.created_at)}</td>
                                        <td><span class="tag ${i.level === 'ERROR' ? 'tag-danger' : i.level === 'WARNING' ? 'tag-warning' : 'tag-primary'}">${i.level}</span></td>
                                        <td>${Utils.escapeHtml(i.module || '')}</td>
                                        <td>${Utils.escapeHtml(i.action || '')}</td>
                                        <td>${i.username ?? '-'}</td>
                                        <td>${i.ip_address || '-'}</td>
                                        <td class="truncate" style="max-width:360px;">${Utils.escapeHtml(i.message || '')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${Utils.renderPagination(page, pages)}
                    `}
                </div>
            </div>
        `;
    }

    afterMount() { this.loadData(); this.bindEvents(); }
    afterUpdate() { this.bindEvents(); }

    bindEvents() {
        if (this.container && !this.container._bindedAudit) {
            this.container._bindedAudit = true;
            this.delegate('click', '[data-page]', (e, t) => {
                const p = parseInt(t.dataset.page);
                if (p > 0) this.changePage(p);
            });
            // 使用事件委托绑定筛选按钮，避免重渲染后失效
            this.delegate('click', '#filterSubmit', () => {
                this.state.level = this.$('#filterLevel').value;
                this.state.module = (this.$('#filterModule').value || '').trim();
                this.state.action = (this.$('#filterAction').value || '').trim();
                this.state.page = 1;
                this.loadData();
            });
        }
    }
}

/**
 * 系统管理页面
 * 包含：系统设置、系统日志
 * 注：应用中心已迁移至 market.js 中的 AppCenterMarketPage
 */

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
            <div class="page system-page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                    <div>
                        <h1 class="page-title">系统设置</h1>
                        <p class="page-desc">安全策略、系统默认配置（仅管理员可修改）</p>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('system', '系统设置') : ''}
                        <a href="#/system/audit" class="btn btn-secondary">📜 系统日志</a>
                        <a href="#/system/monitor" class="btn btn-secondary">📈 系统监控</a>
                        <a href="#/system/backup" class="btn btn-secondary">💾 数据备份</a>
                    </div>
                </div>
                <div class="card">
                    <form id="systemSettingsForm" class="card-body">
                        <div class="form-group">
                            <label class="form-label">系统默认主题</label>
                            <select name="theme_mode" class="form-input form-select">
                                <option value="sunrise" ${data.theme_mode === 'sunrise' ? 'selected' : ''}>日出印象</option>
                                <option value="neon" ${data.theme_mode === 'neon' ? 'selected' : ''}>星夜霓虹</option>
                            </select>
                            <small class="form-hint">新用户或未设置个人偏好的用户将使用此主题。用户可通过「主题」页面选择个人主题。</small>
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

                        <div class="section-divider"></div>
                        <h3 class="section-title">API 速率限制</h3>
                        
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

                        <div class="settings-footer">
                            <button type="button" class="btn btn-secondary" id="reloadSettings" title="重新加载配置">
                                <span>↺</span> 刷新
                            </button>
                            <button type="button" class="btn btn-primary" id="saveSettings" ${saving ? 'disabled' : ''}>
                                ${saving ? '<span class="spin">↻</span> 保存中...' : '<span>💾</span> 保存设置'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            `;
    }

    afterMount() {
        this.loadData();
        this.bindGlobalEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        // 绑定帮助按钮事件（页面更新后重新绑定）
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindGlobalEvents() {
        // 使用一个统一的 click 事件处理器
        if (!this._clickHandler) {
            this._clickHandler = (e) => {
                const target = e.target;
                if (!target) return;

                // 保存按钮 - 检查按钮文本
                if (target.id === 'saveSettings' ||
                    target.closest('#saveSettings') ||
                    (target.tagName === 'BUTTON' && target.textContent?.includes('保存'))) {
                    e.preventDefault();
                    this.handleSave();
                    return;
                }

                // 刷新按钮
                if (target.id === 'reloadSettings' || target.closest('#reloadSettings')) {
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
            console.error('表单未找到');
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


        this.setState({ saving: true });
        try {
            const result = await SystemApi.updateSettings(payload);
            Toast.success('保存成功');
            Store.setTheme(payload.theme_mode);
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

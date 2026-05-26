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
                        <h1 class="page-title"><i class="ri-settings-3-line"></i> 系统设置</h1>
                        <p class="page-desc">安全策略、速率限制、AI 模型配置（仅管理员可修改）</p>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('system', '系统设置') : ''}
                        <a href="#/system/audit" class="btn btn-secondary"><i class="ri-file-list-3-line"></i> 系统日志</a>
                        <a href="#/system/monitor" class="btn btn-secondary"><i class="ri-line-chart-line"></i> 系统监控</a>
                        <a href="#/system/backup" class="btn btn-secondary"><i class="ri-hard-drive-2-line"></i> 数据备份</a>
                    </div>
                </div>

                <form id="systemSettingsForm">
                    <!-- 基础设置卡片 -->
                    <div class="card" style="margin-bottom:var(--spacing-md);">
                        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                            <h3 class="card-title"><i class="ri-palette-line"></i> 基础设置</h3>
                        </div>
                        <div class="card-body">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">系统默认主题</label>
                                    <select name="theme_mode" class="form-input form-select">
                                        <option value="sunrise" ${data.theme_mode === 'sunrise' ? 'selected' : ''}>🌅 日出印象</option>
                                        <option value="neon" ${data.theme_mode === 'neon' ? 'selected' : ''}>🌙 星夜霓虹</option>
                                    </select>
                                    <small class="form-hint">新用户的默认主题</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ICP 备案设置卡片 -->
                    <div class="card" style="margin-bottom:var(--spacing-md);">
                        <div class="card-header">
                            <h3 class="card-title"><i class="ri-government-line"></i> ICP 备案信息</h3>
                        </div>
                        <div class="card-body">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">ICP 备案号</label>
                                    <input type="text" name="icp_number" class="form-input" value="${Utils.escapeHtml(data.icp_number || '')}" placeholder="如：京ICP备xxxxxxxx号">
                                    <small class="form-hint">显示在登录页底部</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">ICP 备案查询链接</label>
                                    <input type="text" name="icp_link" class="form-input" value="${Utils.escapeHtml(data.icp_link || 'https://beian.miit.gov.cn/')}" placeholder="https://beian.miit.gov.cn/">
                                    <small class="form-hint">点击备案号跳转的链接</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">公安备案号</label>
                                    <input type="text" name="psb_number" class="form-input" value="${Utils.escapeHtml(data.psb_number || '')}" placeholder="如：京公网安备 xxxxxxxxxxxxxx号">
                                    <small class="form-hint">含图标显示在 ICP 备案下方</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">公安备案查询链接</label>
                                    <input type="text" name="psb_link" class="form-input" value="${Utils.escapeHtml(data.psb_link || '')}" placeholder="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=xxx">
                                    <small class="form-hint">点击公安备案号跳转的链接</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 安全策略卡片 -->
                    <div class="card" style="margin-bottom:var(--spacing-md);">
                        <div class="card-header">
                            <h3 class="card-title"><i class="ri-shield-check-line"></i> 安全策略</h3>
                        </div>
                        <div class="card-body">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">密码最小长度</label>
                                    <input type="number" name="password_min_length" class="form-input" min="4" max="128" value="${Utils.escapeHtml(String(data.password_min_length))}">
                                    <small class="form-hint">用户密码的最小字符数</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">登录失败锁定阈值</label>
                                    <input type="number" name="login_fail_lock" class="form-input" min="3" max="20" value="${Utils.escapeHtml(String(data.login_fail_lock))}">
                                    <small class="form-hint">连续登录失败多少次后锁定</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">注册需要审核</label>
                                    <label class="switch" style="display:block;margin-top:8px;">
                                        <input type="checkbox" name="register_requires_review" ${data.register_requires_review ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <small class="form-hint">关闭后，注册用户将直接激活并可登录</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">JWT 过期时间（分钟）</label>
                                    <input type="number" name="jwt_expire_minutes" class="form-input" min="15" max="${60 * 24 * 30}" value="${Utils.escapeHtml(String(data.jwt_expire_minutes))}">
                                    <small class="form-hint">登录令牌有效期</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">默认存储配额</label>
                                    <input type="number" name="default_user_storage_quota" class="form-input" min="0" step="1" value="${data.default_user_storage_quota === null || data.default_user_storage_quota === undefined ? '' : Math.round(data.default_user_storage_quota / 1024 / 1024)}" placeholder="MB">
                                    <small class="form-hint">新用户默认配额，留空或 0 表示不限制</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">JWT 自动轮换</label>
                                    <label class="switch" style="display:block;margin-top:8px;">
                                        <input type="checkbox" name="jwt_rotate_enabled" ${data.jwt_rotate_enabled ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <small class="form-hint">自动刷新令牌，增强安全性</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 速率限制卡片 -->
                    <div class="card" style="margin-bottom:var(--spacing-md);">
                        <div class="card-header">
                            <h3 class="card-title"><i class="ri-speed-line"></i> API 速率限制</h3>
                        </div>
                        <div class="card-body">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">请求速率限制 (次)</label>
                                    <input type="number" name="rate_limit_requests" class="form-input" min="1" max="10000" value="${Utils.escapeHtml(String(data.rate_limit_requests || 200))}">
                                    <small class="form-hint">每个窗口内的最大请求数</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">限制窗口时间 (秒)</label>
                                    <input type="number" name="rate_limit_window" class="form-input" min="1" max="3600" value="${Utils.escapeHtml(String(data.rate_limit_window || 60))}">
                                    <small class="form-hint">统计请求数的时间窗口</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">超限封禁时长 (秒)</label>
                                    <input type="number" name="rate_limit_block_duration" class="form-input" min="1" max="3600" value="${Utils.escapeHtml(String(data.rate_limit_block_duration || 30))}">
                                    <small class="form-hint">触发限制后的封禁时间</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- AI 配置卡片 -->
                    <div class="card" style="margin-bottom:var(--spacing-md);">
                        <div class="card-header">
                            <h3 class="card-title"><i class="ri-robot-line"></i> AI 在线模型配置</h3>
                        </div>
                        <div class="card-body">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">API Key</label>
                                    <div style="position:relative;">
                                        <input type="password" name="ai_online_api_key" id="apiKeyInput" class="form-input" value="${Utils.escapeHtml(data.ai_online_api_key || '')}" placeholder="sk-..." style="padding-right:40px;">
                                        <button type="button" id="toggleApiKey" class="btn btn-ghost btn-sm" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);padding:4px 8px;" title="显示/隐藏">
                                            <i class="ri-eye-line" id="toggleApiKeyIcon"></i>
                                        </button>
                                    </div>
                                    <small class="form-hint">用于知识库解析及异步任务</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">Base URL</label>
                                    <input type="text" name="ai_online_base_url" class="form-input" value="${Utils.escapeHtml(data.ai_online_base_url || 'https://api.deepseek.com/v1')}" placeholder="https://api.deepseek.com/v1">
                                    <small class="form-hint">API 服务地址</small>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label class="form-label">模型名称</label>
                                    <input type="text" name="ai_online_model" class="form-input" value="${Utils.escapeHtml(data.ai_online_model || 'deepseek-chat')}" placeholder="deepseek-chat">
                                    <small class="form-hint">使用的模型标识</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 保存按钮 -->
                    <div class="card">
                        <div class="card-body" style="display:flex;justify-content:flex-end;gap:12px;">
                            <button type="button" class="btn btn-secondary" id="reloadSettings">
                                <i class="ri-refresh-line"></i> 刷新
                            </button>
                            <button type="button" class="btn btn-primary" id="saveSettings" ${saving ? 'disabled' : ''}>
                                ${saving ? '<i class="ri-loader-4-line spin"></i> 保存中...' : '<i class="ri-save-line"></i> 保存设置'}
                            </button>
                        </div>
                    </div>
                </form>
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
        if (!this._clickHandler) {
            this._clickHandler = (e) => {
                const target = e.target;
                if (!target) return;

                if (target.id === 'saveSettings' ||
                    target.closest('#saveSettings') ||
                    (target.tagName === 'BUTTON' && target.textContent?.includes('保存'))) {
                    e.preventDefault();
                    this.handleSave();
                    return;
                }

                if (target.id === 'reloadSettings' || target.closest('#reloadSettings')) {
                    this.loadData();
                    return;
                }

                if (target.id === 'toggleApiKey' || target.closest('#toggleApiKey')) {
                    const input = document.getElementById('apiKeyInput');
                    const icon = document.getElementById('toggleApiKeyIcon');
                    if (input && icon) {
                        if (input.type === 'password') {
                            input.type = 'text';
                            icon.className = 'ri-eye-off-line';
                        } else {
                            input.type = 'password';
                            icon.className = 'ri-eye-line';
                        }
                    }
                    return;
                }
            };
            this.addDocumentEvent('click', this._clickHandler);
        }
    }

    async handleSave() {
        if (this.state.saving) return;

        const form = document.getElementById('systemSettingsForm');
        if (!form) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('表单未找到');
            return;
        }

        this.setState({ saving: true });

        // 使用结构化方式收集表单数据
        const formData = new FormData(form);
        const payload = {
            theme_mode: formData.get('theme_mode'),
            password_min_length: parseInt(formData.get('password_min_length')) || 8,
            jwt_expire_minutes: parseInt(formData.get('jwt_expire_minutes')) || 10080,
            login_fail_lock: parseInt(formData.get('login_fail_lock')) || 5,
            register_requires_review: form.querySelector('[name="register_requires_review"]')?.checked || false,
            default_user_storage_quota: (() => {
                const raw = formData.get('default_user_storage_quota');
                if (raw === null || raw === '') return null;
                const mb = parseFloat(raw);
                if (!Number.isFinite(mb) || mb <= 0) return null;
                return Math.round(mb * 1024 * 1024);
            })(),
            jwt_rotate_enabled: form.querySelector('[name="jwt_rotate_enabled"]')?.checked || false,
            rate_limit_requests: parseInt(formData.get('rate_limit_requests')) || 200,
            rate_limit_window: parseInt(formData.get('rate_limit_window')) || 60,
            rate_limit_block_duration: parseInt(formData.get('rate_limit_block_duration')) || 30,
            ai_online_api_key: formData.get('ai_online_api_key') || '',
            ai_online_base_url: formData.get('ai_online_base_url') || '',
            ai_online_model: formData.get('ai_online_model') || '',
            icp_number: formData.get('icp_number') || '',
            icp_link: formData.get('icp_link') || 'https://beian.miit.gov.cn/',
            psb_number: formData.get('psb_number') || '',
            psb_link: formData.get('psb_link') || ''
        };
        try {
            const result = await SystemApi.updateSettings(payload);
            Toast.success('保存成功');
            Store.setTheme(payload.theme_mode);
            this.loadData();
        } catch (err) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('保存失败:', err);
            Toast.error(err.message || '保存失败');
        } finally {
            this.setState({ saving: false });
        }
    }

    destroy() {
        super.destroy();
    }
}

class AuditLogsPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            items: [],
            total: 0,
            page: 1,
            size: 20,
            loading: true,
            level: '',
            module: '',
            action: '',
            startTime: '',
            endTime: '',
            keyword: '',
            userId: '',
            username: ''
        };
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size, level, module, action, startTime, endTime, keyword, userId, username } = this.state;
        const params = {
            page,
            size,
            ...(level ? { level } : {}),
            ...(module ? { module } : {}),
            ...(action ? { action } : {}),
            ...(startTime ? { start_time: startTime } : {}),
            ...(endTime ? { end_time: endTime } : {}),
            ...(keyword ? { keyword } : {}),
            ...(userId ? { user_id: userId } : {}),
            ...(username ? { username } : {})
        };
        try {
            const res = await SystemApi.getAuditLogs(params);
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

    handleExport() {
        const { level, module, action, startTime, endTime, keyword, userId, username } = this.state;
        const params = {
            ...(level ? { level } : {}),
            ...(module ? { module } : {}),
            ...(action ? { action } : {}),
            ...(startTime ? { start_time: startTime } : {}),
            ...(endTime ? { end_time: endTime } : {}),
            ...(keyword ? { keyword } : {}),
            ...(userId ? { user_id: userId } : {}),
            ...(username ? { username } : {})
        };
        const token = localStorage.getItem(Config.storageKeys.token);
        const url = SystemApi.exportAuditLogs({ ...params, token });
        window.open(url, '_blank');
        Toast.success('正在导出，请稍候...');
    }

    showLogDetail(item) {
        const formatTime = (t) => {
            if (!t) return '-';
            const d = new Date(t);
            return d.toLocaleString('zh-CN');
        };

        Modal.show({
            title: `日志详情 #${item.id}`,
            content: `
                <div style="display:grid;gap:12px;font-size:14px;">
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">级别</span>
                        <span class="tag ${item.level === 'ERROR' ? 'tag-danger' : item.level === 'WARNING' ? 'tag-warning' : 'tag-primary'}">${Utils.escapeHtml(item.level)}</span>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">模块</span>
                        <span>${Utils.escapeHtml(item.module || '-')}</span>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">动作</span>
                        <span>${Utils.escapeHtml(item.action || '-')}</span>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">用户</span>
                        <span>${Utils.escapeHtml(item.username || '-')}</span>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">IP 地址</span>
                        <span>${Utils.escapeHtml(item.ip_address || '-')}</span>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <span style="color:var(--color-text-secondary);min-width:80px;">时间</span>
                        <span>${formatTime(item.created_at)}</span>
                    </div>
                    <div>
                        <div style="color:var(--color-text-secondary);margin-bottom:6px;">消息</div>
                        <div style="background:var(--color-bg-tertiary);padding:12px;border-radius:8px;word-break:break-all;max-height:200px;overflow:auto;">${Utils.escapeHtml(item.message || '-')}</div>
                    </div>
                    ${item.user_agent ? `
                    <div>
                        <div style="color:var(--color-text-secondary);margin-bottom:6px;">User-Agent</div>
                        <div style="background:var(--color-bg-tertiary);padding:12px;border-radius:8px;font-size:12px;word-break:break-all;">${Utils.escapeHtml(item.user_agent)}</div>
                    </div>
                    ` : ''}
                </div>
            `,
            footer: '<button class="btn btn-primary" data-close>关闭</button>'
        });
    }

    render() {
        const { items, total, page, size, loading, level, module, action, startTime, endTime, keyword, userId, username } = this.state;
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
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <a href="#/system/settings" class="btn btn-ghost btn-sm" title="返回系统设置"><i class="ri-arrow-left-line"></i></a>
                        <div>
                            <h1 class="page-title" style="margin:0;"><i class="ri-file-list-3-line"></i> 系统日志</h1>
                            <p class="page-desc" style="margin:0;">共 ${total} 条记录</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('audit', '系统日志') : ''}
                        <button class="btn btn-primary" id="exportLogs"><i class="ri-download-line"></i> 导出</button>
                    </div>
                </div>

                <!-- 筛选区域 -->
                <div class="card" style="margin-bottom:var(--spacing-md);">
                    <div class="card-body" style="padding:16px;">
                        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">级别</label>
                                <select class="form-input form-select" id="filterLevel" style="min-width:100px;">
                                    <option value="">全部</option>
                                    <option value="INFO" ${level === 'INFO' ? 'selected' : ''}>INFO</option>
                                    <option value="WARNING" ${level === 'WARNING' ? 'selected' : ''}>WARNING</option>
                                    <option value="ERROR" ${level === 'ERROR' ? 'selected' : ''}>ERROR</option>
                                </select>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">模块</label>
                                <input type="text" id="filterModule" class="form-input" placeholder="模块名" value="${Utils.escapeHtml(module)}" style="width:120px;">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">动作</label>
                                <input type="text" id="filterAction" class="form-input" placeholder="动作名" value="${Utils.escapeHtml(action)}" style="width:120px;">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">搜索消息/IP</label>
                                <input type="text" id="filterKeyword" class="form-input" placeholder="关键词" value="${Utils.escapeHtml(keyword)}" style="width:150px;">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">用户名</label>
                                <input type="text" id="filterUsername" class="form-input" placeholder="用户名" value="${Utils.escapeHtml(username)}" style="width:100px;">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">开始时间</label>
                                <input type="datetime-local" id="filterStartTime" class="form-input" value="${startTime}" style="width:180px;">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="font-size:12px;color:var(--color-text-secondary);">结束时间</label>
                                <input type="datetime-local" id="filterEndTime" class="form-input" value="${endTime}" style="width:180px;">
                            </div>
                            <button class="btn btn-primary" id="filterSubmit"><i class="ri-search-line"></i> 筛选</button>
                            <button class="btn btn-secondary" id="filterReset"><i class="ri-refresh-line"></i> 重置</button>
                        </div>
                    </div>
                </div>

                <div class="card">
                    ${loading ? '<div class="loading"></div>' : items.length === 0 ? `
                    <div class="empty-state" style="padding: 40px 0;">
                        <div class="empty-icon"><i class="ri-file-list-3-line"></i></div>
                        <p class="empty-text">暂无审计记录</p>
                    </div>
                ` : `
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="width:150px;">时间</th>
                                <th style="width:80px;">级别</th>
                                <th style="width:100px;">模块</th>
                                <th style="width:120px;">动作</th>
                                <th style="width:140px;">用户</th>
                                <th style="width:120px;">IP</th>
                                <th>消息</th>
                                <th style="width:60px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(i => `
                                <tr>
                                    <td style="font-size:12px;">${formatTime(i.created_at)}</td>
                                    <td><span class="tag ${i.level === 'ERROR' ? 'tag-danger' : i.level === 'WARNING' ? 'tag-warning' : 'tag-primary'}">${Utils.escapeHtml(i.level)}</span></td>
                                    <td>${Utils.escapeHtml(i.module || '')}</td>
                                    <td>${Utils.escapeHtml(i.action || '')}</td>
                                    <td style="white-space:nowrap;">
                                        ${i.user_id ? `<a href="javascript:void(0)" class="filter-user-trigger" data-user-id="${Utils.escapeHtml(i.user_id)}" style="color:var(--color-primary);text-decoration:none;">${Utils.escapeHtml(i.username || '-')}</a>` : Utils.escapeHtml(i.username || '-')}
                                    </td>
                                    <td style="font-size:12px;">${Utils.escapeHtml(i.ip_address || '-')}</td>
                                    <td class="truncate" style="max-width:300px;" title="${Utils.escapeHtml(i.message || '')}">${Utils.escapeHtml(i.message || '')}</td>
                                    <td>
                                        <button class="btn btn-ghost btn-sm" data-view-log="${Utils.escapeHtml(JSON.stringify(i))}" title="查看详情">
                                            <i class="ri-eye-line"></i>
                                        </button>
                                    </td>
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
    afterUpdate() {
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        if (this.container && !this.container._bindAudit) {
            this.container._bindAudit = true;

            // 分页
            this.delegate('click', '[data-page]', (e, t) => {
                const p = parseInt(t.dataset.page);
                if (p > 0) this.changePage(p);
            });

            // 筛选按钮
            this.delegate('click', '#filterSubmit', () => {
                this.state.level = this.$('#filterLevel')?.value || '';
                this.state.module = (this.$('#filterModule')?.value || '').trim();
                this.state.action = (this.$('#filterAction')?.value || '').trim();
                this.state.keyword = (this.$('#filterKeyword')?.value || '').trim();
                this.state.username = (this.$('#filterUsername')?.value || '').trim();
                this.state.userId = ''; // 手动筛选用户名时清除用户 ID 精确匹配
                this.state.startTime = this.$('#filterStartTime')?.value || '';
                this.state.endTime = this.$('#filterEndTime')?.value || '';
                this.state.page = 1;
                this.loadData();
            });

            // 重置按钮
            this.delegate('click', '#filterReset', () => {
                this.state.level = '';
                this.state.module = '';
                this.state.action = '';
                this.state.keyword = '';
                this.state.userId = '';
                this.state.username = '';
                this.state.startTime = '';
                this.state.endTime = '';
                this.state.page = 1;
                this.loadData();
            });

            // 导出按钮
            this.delegate('click', '#exportLogs', () => {
                this.handleExport();
            });

            // 查看详情
            this.delegate('click', '[data-view-log]', (e, t) => {
                try {
                    const logData = JSON.parse(t.dataset.viewLog);
                    this.showLogDetail(logData);
                } catch (err) {
                    Toast.error('解析日志数据失败');
                }
            });

            // 点击用户名进行筛选
            this.delegate('click', '.filter-user-trigger', (e, t) => {
                const uid = t.dataset.userId;
                if (uid) {
                    this.state.userId = uid;
                    this.state.username = ''; // 精确筛选 ID 时清除用户名筛选
                    this.state.page = 1;
                    this.loadData();
                    // 清除用户名输入框
                    const input = this.$('#filterUsername');
                    if (input) input.value = '';
                }
            });
        }
    }
}


// 将 SystemSettingsPage 导出到全局作用域以支持动态加载
window.SystemSettingsPage = SystemSettingsPage;

// 将 AuditLogsPage 导出到全局作用域以支持动态加载
window.AuditLogsPage = AuditLogsPage;

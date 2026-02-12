/**
 * 应用中心 - 应用市场风格
 */

class AppCenterMarketPage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin';
        this.activePopup = null; // 当前打开的弹窗 ID

        this.state = {
            modules: [],
            loading: true,
            view: 'home', // 主页, 管理, 市场, 开发
            processingId: null
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            let modules = [];
            const user = Store.get('user');
            // 总是获取最新模块列表（如果是管理员），或者从 store 获取
            if (this.isAdmin) {
                const res = await SystemApi.getModules();
                modules = Array.isArray(res) ? res : (res.data || []);
                Store.set('modules', modules);
            } else {
                // 普通用户需要刷新"我的应用"列表（基于最新的 user_modules 状态）
                const res = await Api.get('/system/init');
                modules = res.data?.modules || [];
                Store.set('modules', modules);
            }

            this.setState({
                modules: modules,
                loading: false
            });
        } catch (error) {
            Toast.error('加载应用列表失败: ' + (error.message || '未知错误'));
            this.setState({ loading: false, modules: [] });
        }
    }

    async loadMarketData() {
        this.setState({ marketLoading: true });
        try {
            const res = await Api.get('/system/market/list');
            const modules = Array.isArray(res) ? res : (res.data || []);
            this.setState({ marketModules: modules, marketLoading: false });
        } catch (error) {
            Toast.error('加载市场数据失败: ' + (error.message || '未知错误'));
            this.setState({ marketModules: [], marketLoading: false });
        }
    }

    async handleInstall(moduleId) {
        // 先获取应用详情用于通知
        const module = this.state.marketModules?.find(m => m.id === moduleId);
        const appName = module ? module.name : '应用';

        try {
            await Api.post(`/system/market/install/${moduleId}`);

            if (window.SystemNotification) {
                SystemNotification.notifyAppInstall(appName, true);
            } else {
                Toast.success('安装成功！');
            }

            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            if (window.SystemNotification) {
                SystemNotification.error('应用安装失败', `${appName}: ${error.message}`);
            } else {
                Toast.error('安装失败: ' + (error.message || '未知错误'));
            }
        }
    }

    async handleUninstall(moduleId) {
        const module = this.state.modules?.find(m => m.id === moduleId);
        const appName = module ? module.name : '应用';
        const confirmed = await Modal.confirm('确认卸载', `确定要卸载应用 "${Utils.escapeHtml(appName)}" 吗？卸载后需要重新安装才能使用。`);
        if (!confirmed) return;

        try {
            await Api.post(`/system/market/uninstall/${moduleId}`);
            Toast.success('卸载成功！');
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('卸载失败: ' + (error.message || '未知错误'));
        }
    }

    // ==================== 用户级模块管理 ====================

    async handleUserInstall(moduleId) {
        const module = this.state.marketModules?.find(m => m.id === moduleId);
        const appName = module ? module.name : '应用';

        try {
            await Api.post(`/system/market/user/install/${moduleId}`);
            Toast.success(`${appName} 安装成功！`);
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('安装失败: ' + (error.message || '未知错误'));
        }
    }

    async handleUserUninstall(moduleId) {
        const module = this.state.marketModules?.find(m => m.id === moduleId);
        const appName = module ? module.name : '应用';

        const confirmed = await Modal.confirm('确认卸载', `确定要从个人应用列表移除 "${Utils.escapeHtml(appName)}" 吗？`);
        if (!confirmed) return;

        try {
            await Api.post(`/system/market/user/uninstall/${moduleId}`);
            Toast.success('已从个人应用列表移除');
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('卸载失败: ' + (error.message || '未知错误'));
        }
    }

    async handleUserToggle(moduleId, enabled) {
        try {
            await Api.post(`/system/market/user/toggle/${moduleId}?enabled=${enabled}`);
            Toast.success(enabled ? '应用已启用' : '应用已禁用');
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('操作失败: ' + (error.message || '未知错误'));
        }
    }


    // 固定应用相关方法
    getPinnedApps() {
        // 初始默认固定应用（仅作为兜底）
        const DEFAULT_APPS = ['knowledge', 'ai', 'map', 'notes'];

        // 1. 优先从用户 Store 设置中读取（已同步后端）
        const user = Store.get('user');
        let pinned = null;

        if (user && user.settings && user.settings.dock_pinned_apps) {
            pinned = Array.isArray(user.settings.dock_pinned_apps)
                ? user.settings.dock_pinned_apps
                : null;
        }

        // 2. 只有在用户设置不存在时（初次使用），降级读取本地缓存或使用默认值
        if (pinned === null) {
            try {
                const saved = localStorage.getItem(Config.storageKeys.pinnedApps);
                pinned = saved ? JSON.parse(saved) : DEFAULT_APPS;
            } catch (e) {
                pinned = DEFAULT_APPS;
            }
        }

        return pinned;
    }

    async savePinnedApps(apps) {
        // 1. 更新本地状态（乐观更新 UI）
        localStorage.setItem(Config.storageKeys.pinnedApps, JSON.stringify(apps));
        Store.set('pinnedApps', apps);

        // 2. 同步到后端用户设置
        const user = Store.get('user');
        if (user) {
            try {
                // 发送 API 请求
                if (window.UserApi) {
                    const res = await UserApi.updateProfile({
                        settings: { dock_pinned_apps: apps }
                    });

                    // 后端返回格式: {code: 200, message: "success", data: {...}}
                    // 使用 res.data 获取实际数据（兼容 res.data || res）
                    const updatedUser = res.data || res;

                    if (updatedUser) {
                        const finalSettings = updatedUser.settings || {};
                        if (!finalSettings.dock_pinned_apps) {
                            finalSettings.dock_pinned_apps = apps;
                        }
                        const finalUser = {
                            ...user,
                            ...updatedUser,
                            settings: finalSettings
                        };
                        Store.set('user', finalUser);
                    } else {
                        const newSettings = { ...(user.settings || {}), dock_pinned_apps: apps };
                        Store.set('user', { ...user, settings: newSettings });
                    }
                } else {
                    const newSettings = { ...(user.settings || {}), dock_pinned_apps: apps };
                    Store.set('user', { ...user, settings: newSettings });
                }
            } catch (err) {
                // 即使失败也保持本地更新，避免 UI 闪烁
            }
        } else {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('[Market] 用户未登录，无法同步到后端');
        }
    }

    async togglePinApp(moduleId) {
        const pinned = this.getPinnedApps();
        const isPinned = pinned.includes(moduleId);

        if (isPinned) {
            // 取消固定
            const newPinned = pinned.filter(id => id !== moduleId);
            await this.savePinnedApps(newPinned);
            Toast.info('已从 Dock 移除');
        } else {
            // 固定
            pinned.push(moduleId);
            await this.savePinnedApps(pinned);
            Toast.success('已固定到 Dock');
        }

        // 强制重新渲染以更新图标状态
        this.setState({ _pinUpdate: Date.now() });
    }

    async handleToggleModule(module) {
        if (this.state.processingId) return;

        const action = module.enabled ? '禁用' : '启用';
        // 核心模块警告：不再包含 blog, notes, feedback
        if (['system', 'auth', 'user', 'boot'].includes(module.id) && module.enabled) {
            const confirm = await Modal.confirm(`禁用 ${Utils.escapeHtml(module.name)}`, `警告：禁用核心模块可能会导致相关功能不可用。确定要继续吗？`);
            if (!confirm) return;
        }

        this.setState({ processingId: module.id });
        try {
            await SystemApi.toggleModule(module.id, !module.enabled);
            Toast.success(`${module.name} 已${action}`);
            await this.loadData();
        } catch (error) {
            Toast.error(`${action}失败: ` + error.message);
        } finally {
            this.setState({ processingId: null });
        }
    }

    // 获取应用的入口路径
    getAppEntryPath(module) {
        if (!module) return null;

        // 1. 优先使用显式定义的路径映射（针对已整合成单一入口的应用）
        const pathMap = {
            'blog': '/blog/list',
            'knowledge': '/knowledge/list',
            'notes': '/notes/list',
            'feedback': '/feedback/my',
            'announcement': '/announcement/list',
            'users': '/users/list',
            'filemanager': '/filemanager',
            'ai': '/ai',
            'pdf': '/pdf'
        };

        if (pathMap[module.id]) {
            return pathMap[module.id];
        }

        // 2. 其次使用模块菜单配置中定义的路径
        if (module.menu && module.menu.path) {
            return module.menu.path;
        }

        // 3. 最后使用默认约定路径
        return `/${module.id}`;
    }

    // 获取应用的子功能菜单（已简化，配合单一入口整合）
    getChildLinks(module) {
        // 全面简化：所有应用均通过单一主入口访问，不再提供子菜单弹出
        return null;
    }

    togglePopup(id) {
        if (this.activePopup === id) {
            this.activePopup = null;
        } else {
            this.activePopup = id;
        }
        this.updatePopupState();
    }

    closePopup() {
        this.activePopup = null;
        this.updatePopupState();
    }

    updatePopupState() {
        const popups = this.container.querySelectorAll('.app-popup');
        popups.forEach(popup => {
            const parent = popup.closest('.app-card-wrapper');
            if (parent.dataset.id === this.activePopup) {
                popup.classList.add('show');
            } else {
                popup.classList.remove('show');
            }
        });
    }

    // 获取应用对应的图标类
    _getIconSpec(item) {
        const iconMap = {
            'blog': { ri: 'ri-article-line', gradient: 'gradient-blue' },
            'knowledge': { ri: 'ri-book-read-line', gradient: 'gradient-blue' },
            'notes': { ri: 'ri-sticky-note-line', gradient: 'gradient-yellow' },
            'feedback': { ri: 'ri-feedback-line', gradient: 'gradient-teal' },
            'announcement': { ri: 'ri-megaphone-line', gradient: 'gradient-orange' },
            'users': { ri: 'ri-group-line', gradient: 'gradient-cyan' },
            'filemanager': { ri: 'ri-folder-5-line', gradient: 'gradient-indigo' },
            'analysis': { ri: 'ri-bar-chart-grouped-line', gradient: 'gradient-purple' },
            'datalens': { ri: 'ri-database-2-line', gradient: 'gradient-violet' },
            'monitor': { ri: 'ri-dashboard-2-line', gradient: 'gradient-rose' },
            'system': { ri: 'ri-settings-4-line', gradient: 'gradient-grey' },
            'backup': { ri: 'ri-history-line', gradient: 'gradient-slate' },
            'theme_editor': { ri: 'ri-palette-line', gradient: 'gradient-pink' },
            'sys_manage': { ri: 'ri-settings-3-line', gradient: 'gradient-green' },
            'sys_market': { ri: 'ri-store-2-line', gradient: 'gradient-amber' },
            'sys_dev': { ri: 'ri-code-s-slash-line', gradient: 'gradient-emerald' },
            'market': { ri: 'ri-apps-2-line', gradient: 'gradient-blue' },
            'transfer': { ri: 'ri-share-forward-line', gradient: 'gradient-cyan' },
            'messages': { ri: 'ri-message-3-line', gradient: 'gradient-indigo' },
            'roles': { ri: 'ri-shield-user-line', gradient: 'gradient-red' },
            'profile': { ri: 'ri-user-settings-line', gradient: 'gradient-sky' },
            'help': { ri: 'ri-help-circle-line', gradient: 'gradient-blue' },
            'ai': { ri: 'ri-brain-line', gradient: 'gradient-indigo' },
            'map': { ri: 'ri-map-2-line', gradient: 'gradient-emerald' },
            'im': { ri: 'ri-message-3-line', gradient: 'gradient-cyan' },

            'album': { ri: 'ri-image-2-line', gradient: 'gradient-pink' },
            'video': { ri: 'ri-video-line', gradient: 'gradient-red' },
            'exam': { ri: 'ri-file-list-3-line', gradient: 'gradient-orange' },
            'ocr': { ri: 'ri-scan-2-line', gradient: 'gradient-cyan' },
            'course': { ri: 'ri-book-open-line', gradient: 'gradient-violet' },
            'schedule': { ri: 'ri-calendar-schedule-line', gradient: 'gradient-indigo' },
            'vault': { ri: 'ri-shield-keyhole-line', gradient: 'gradient-purple' },
            'pdf': { ri: 'ri-file-pdf-2-fill', gradient: 'gradient-red' },
            'markdown': { ri: 'ri-markdown-line', gradient: 'gradient-slate' },
            'lm_cleaner': { ri: 'ri-magic-line', gradient: 'gradient-indigo' },
        };

        const safeEmoji = (item.icon && !/<script/i.test(item.icon)) ? item.icon : 'ri-apps-line';
        return iconMap[item.id] || { ri: null, gradient: 'gradient-default', emoji: safeEmoji };
    }

    // 渲染主页：应用图标网格
    renderHome() {
        const { modules } = this.state;
        // 过滤掉内置管理模块，只显示业务应用
        const apps = modules.filter(m => m.enabled && !['market', 'sys_manage', 'sys_dev'].includes(m.id));

        // 获取已固定的应用列表
        const pinnedApps = this.getPinnedApps();

        return `
            <div class="apps-dashboard fade-in">
                <div class="view-header">
                    <h2 class="view-title">我的应用</h2>
                    <p class="view-subtitle">快速启动已安装的业务模块</p>
                </div>

                <div class="apps-grid">
                    ${apps.length > 0 ? apps.map(item => {
            const entryPath = this.getAppEntryPath(item);
            const isPinned = pinnedApps.includes(item.id);
            const iconSpec = this._getIconSpec(item);

            return `
                            <div class="app-card-wrapper" data-id="${Utils.escapeHtml(String(item.id))}">
                                <div class="app-card clickable" data-app-path="${Utils.escapeHtml(entryPath)}">
                                    <div class="app-icon-box ${iconSpec.gradient}">
                                        ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                    </div>
                                    <div class="app-name">${Utils.escapeHtml(item.name)}</div>
                                    <button class="pin-status ${isPinned ? 'pinned' : ''}" 
                                            data-pin-app="${Utils.escapeHtml(String(item.id))}" 
                                            title="${isPinned ? '从 Dock 取消固定' : '固定到 Dock'}">
                                        <i class="${isPinned ? 'ri-pushpin-2-fill' : 'ri-pushpin-2-line'}"></i>
                                    </button>
                                </div>
                            </div>
                        `;
        }).join('') : `
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-inbox-line"></i></div>
                            <p>暂无可用应用，请前往“应用市场”安装。</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderHeader(title) {
        return `
            <div class="view-header">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <h2 class="view-title">${title}</h2>
                    </div>
                    <div>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('market', title) : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // 应用管理列表
    renderManage() {
        const { modules, processingId } = this.state;
        return `
            <div class="view-content fade-in">
                ${this.renderHeader('应用管理')}
                <div class="card-grid">
                    ${modules.map(m => {
            const iconSpec = this._getIconSpec(m);
            return `
                        <div class="card module-card ${!m.enabled ? 'disabled' : ''}">
                            <div class="card-body">
                                <div class="module-header">
                                    <div class="module-icon-box ${iconSpec.gradient}">
                                        ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                    </div>
                                    <div class="module-info">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                            <h3 class="module-title">
                                                ${Utils.escapeHtml(m.name)}
                                                <span class="tag tag-default">${Utils.escapeHtml(m.version || '1.0.0')}</span>
                                            </h3>
                                            <div class="module-actions">
                                                <label class="switch">
                                                    <input type="checkbox" ${m.enabled ? 'checked' : ''} ${processingId === m.id ? 'disabled' : ''} data-toggle="${Utils.escapeHtml(String(m.id))}">
                                                    <span class="slider round"></span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <p class="module-desc">${Utils.escapeHtml(m.description || '暂无描述')}</p>
                            </div>
                        </div>
                    `;
        }).join('')}
                </div>
            </div>
        `;
    }

    renderMarket() {
        const { marketModules = [], marketLoading } = this.state;

        if (marketLoading) {
            return `
                <div class="view-content fade-in">
                    ${this.renderHeader('应用市场')}
                    <div class="loading-full"><div class="loading-spinner"></div></div>
                </div>
            `;
        }

        // 管理员视角：显示系统级安装/卸载
        if (this.isAdmin) {
            return this.renderAdminMarket(marketModules);
        }

        // 用户视角：显示个人级安装/卸载
        return this.renderUserMarket(marketModules);
    }

    // 管理员应用市场视图
    renderAdminMarket(marketModules) {
        const availableModules = marketModules.filter(m => !m.installed);
        const installedModules = marketModules.filter(m => m.installed);

        return `
            <div class="view-content fade-in">
                ${this.renderHeader('应用市场 - 系统管理')}
                <div class="info-box" style="background: rgba(var(--color-primary-rgb), 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px;">
                    <i class="ri-lightbulb-line"></i> 作为管理员，您可以在此安装/卸载/启用系统级应用。启用的应用将对所有用户可见。
                </div>
                
                ${availableModules.length > 0 ? `
                    <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--color-text-primary);"><i class="ri-download-cloud-2-line"></i> 可安装的应用</h3>
                    <div class="card-grid" style="margin-bottom: 40px;">
                        ${availableModules.map(app => {
            const iconSpec = this._getIconSpec(app);
            return `
                            <div class="card module-card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon-box ${iconSpec.gradient}">
                                            ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                        </div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--color-text-tertiary);">
                                        <span>版本: ${Utils.escapeHtml(app.version || '1.0.0')}</span>
                                        ${app.author ? `<span style="margin-left: 12px;">作者: ${Utils.escapeHtml(app.author)}</span>` : ''}
                                    </div>
                                    <div class="module-footer">
                                        <button class="btn btn-primary btn-block" data-install="${Utils.escapeHtml(String(app.id))}">
                                            <i class="ri-add-line"></i> 系统安装
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                    </div>
                ` : ''}

                ${installedModules.length > 0 ? `
                    <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--color-text-primary);"><i class="ri-checkbox-circle-line"></i> 已安装的应用</h3>
                    <div class="card-grid">
                        ${installedModules.map(app => {
            const iconSpec = this._getIconSpec(app);
            return `
                            <div class="card module-card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon-box ${iconSpec.gradient}">
                                            ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                        </div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--color-text-tertiary);">
                                        <span>版本: ${Utils.escapeHtml(app.version || '1.0.0')}</span>
                                        <span style="margin-left: 12px; color: ${app.enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)'};">
                                            ${app.enabled ? '● 系统已启用' : '○ 系统未启用'}
                                        </span>
                                    </div>
                                    <div class="module-footer" style="display: flex; gap: 8px;">
                                        <button class="btn btn-ghost" data-uninstall="${Utils.escapeHtml(String(app.id))}" style="flex: 1;">
                                            <i class="ri-delete-bin-line"></i> 系统卸载
                                        </button>
                                        <button class="btn btn-secondary" data-view-target="manage" style="flex: 1;">
                                            <i class="ri-settings-3-line"></i> 管理
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                    </div>
                ` : ''}

                ${marketModules.length === 0 ? `
                    <div class="empty-state">
                        <i class="ri-store-2-line"></i>
                        <p>市场记录为空</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // 用户应用市场视图
    renderUserMarket(marketModules) {
        // 用户看到的是系统已启用的应用（API 已过滤）
        // 区分用户已安装和未安装的
        const availableModules = marketModules.filter(m => m.enabled && !m.user_installed);
        const installedModules = marketModules.filter(m => m.enabled && m.user_installed);

        return `
            <div class="view-content fade-in">
                ${this.renderHeader('应用市场')}
                <div class="info-box" style="background: rgba(var(--color-primary-rgb), 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px;">
                    <i class="ri-lightbulb-line"></i> 在这里您可以安装/卸载个人应用，选择适合自己的工具。
                </div>
                
                ${availableModules.length > 0 ? `
                    <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--color-text-primary);"><i class="ri-add-circle-line"></i> 可添加的应用</h3>
                    <div class="card-grid" style="margin-bottom: 40px;">
                        ${availableModules.map(app => {
            const iconSpec = this._getIconSpec(app);
            return `
                            <div class="card module-card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon-box ${iconSpec.gradient}">
                                            ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                        </div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--color-text-tertiary);">
                                        <span>版本: ${Utils.escapeHtml(app.version || '1.0.0')}</span>
                                    </div>
                                    <div class="module-footer">
                                        <button class="btn btn-primary btn-block" data-user-install="${Utils.escapeHtml(String(app.id))}">
                                            <i class="ri-add-line"></i> 添加到我的应用
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                    </div>
                ` : ''}

                ${installedModules.length > 0 ? `
                    <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--color-text-primary);"><i class="ri-checkbox-circle-line"></i> 我的应用</h3>
                    <div class="card-grid">
                        ${installedModules.map(app => {
            const iconSpec = this._getIconSpec(app);
            return `
                            <div class="card module-card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon-box ${iconSpec.gradient}">
                                            ${iconSpec.ri ? `<i class="${iconSpec.ri}"></i>` : Utils.escapeHtml(iconSpec.emoji)}
                                        </div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--color-text-tertiary);">
                                        <span>版本: ${Utils.escapeHtml(app.version || '1.0.0')}</span>
                                        <span style="margin-left: 12px; color: ${app.user_enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)'};">
                                            ${app.user_enabled ? '● 已启用' : '○ 已禁用'}
                                        </span>
                                    </div>
                                    <div class="module-footer" style="display: flex; gap: 8px;">
                                        <button class="btn btn-ghost" data-user-uninstall="${Utils.escapeHtml(String(app.id))}" style="flex: 1;">
                                            <i class="ri-delete-bin-line"></i> 移除
                                        </button>
                                        <button class="btn btn-secondary" data-user-toggle="${Utils.escapeHtml(String(app.id))}" data-enabled="${!app.user_enabled}" style="flex: 1;">
                                            ${app.user_enabled ? '<i class="ri-pause-circle-line"></i> 禁用' : '<i class="ri-play-circle-line"></i> 启用'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                    </div>
                ` : ''}

                ${marketModules.length === 0 ? `
                    <div class="empty-state">
                        <i class="ri-store-2-line"></i>
                        <p>暂无可用的应用</p>
                    </div>
                ` : ''}
            </div>
        `;
    }


    renderDev() {
        return `
            <div class="view-content fade-in">
                ${this.renderHeader('开发套件')}
                
                <div style="margin-bottom: 32px;">
                     <div class="btn-group">
                         <button class="btn btn-primary" data-action="create-app">
                             <i class="ri-add-line"></i> 创建应用
                         </button>
                         <button class="btn btn-secondary" data-action="upload-app" title="上传 .jwapp 离线包安装">
                             <i class="ri-upload-cloud-2-line"></i> 离线安装
                         </button>
                         <button class="btn btn-ghost" data-action="delete-app" style="color: var(--color-danger);">
                             <i class="ri-delete-bin-line"></i> 删除应用
                         </button>
                     </div>
                     <input type="file" id="jwappPackageInput" accept=".jwapp,.zip" style="display:none;">
                </div>


                <div class="dev-grid">
                    <div class="card module-card">
                        <div class="card-header"><h3 class="card-title"><i class="ri-book-open-line"></i> 模块开发指南</h3></div>
                        <div class="card-body">
                             <div class="markdown-body">
                                 <h4>1. 创建模块</h4>
                                 <p>使用上方的"一键创建应用"按钮，输入模块ID（英文）和名称。</p>
                                 <p>系统会自动在 <code>backend/modules/</code> 和 <code>frontend/js/pages/</code> 下生成模板代码。</p>
                                 
                                 <h4>2. 后端开发</h4>
                                 <p>在 <code>backend/modules/{id}/</code> 中定义路由、模型和业务逻辑。</p>
                                 <p><strong><i class="ri-alert-line"></i> 注意：所有文件必须带有包含模块ID的前缀！</strong></p>
                                 
                                 <h4>3. 前端开发</h4>
                                 <p>在 <code>frontend/js/pages/{id}.js</code> 中编写页面组件。组件需继承 <code>Component</code> 类，并实现 <code>render()</code> 方法。</p>
                             </div>
                        </div>
                    </div>

                    <div class="card module-card">
                        <div class="card-header"><h3 class="card-title"><i class="ri-ruler-line"></i> 开发规范</h3></div>
                        <div class="card-body">
                             <div class="markdown-body">
                                 <h4>命名规范</h4>
                                 <ul style="padding-left: 20px; color: var(--color-text-secondary); font-size: 13px;">
                                     <li><strong>文件名</strong>: 必须使用 <code>{module_id}_</code> 前缀 (e.g., <code>todo_router.py</code>)</li>
                                     <li><strong>模块ID</strong>: 全小写英文，无空格</li>
                                     <li><strong>类名</strong>: PascalCase (e.g., <code>TodoListPage</code>)</li>
                                 </ul>
                                 
                                 <h4><i class="ri-archive-line"></i> 模块打包发布</h4>
                                 <div style="background: rgba(var(--color-primary-rgb), 0.1); padding: 12px; border-radius: 8px; font-size: 13px; margin-top: 10px;">
                                    <code style="display: block; background: var(--color-bg-tertiary); padding: 8px; border-radius: 4px; user-select: text; font-size: 11px;">
                                        cd backend<br>
                                        python scripts/pack_module.py &lt;模块ID&gt;
                                    </code>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async handleCreateApp() {
        const user = Store.get('user');
        new Modal({
            title: '创建新应用',
            content: `
                <form id="create-app-form">
                    <div class="form-group">
                        <label>模块ID (英文)</label>
                        <input type="text" class="form-input" name="id" placeholder="例如: todo_app" required pattern="^[a-z_][a-z0-9_]*$" title="只能包含小写字母、数字和下划线，且以字母或下划线开头">
                        <small style="color: var(--color-text-secondary);">只能包含小写字母、数字和下划线</small>
                    </div>
                    <div class="form-group">
                        <label>应用名称 (中文)</label>
                        <input type="text" class="form-input" name="name" placeholder="例如: 待办清单" required>
                    </div>
                    <div class="form-group">
                        <label>作者</label>
                        <input type="text" class="form-input" name="author" value="${Utils.escapeHtml(user?.nickname || user?.username || '')}">
                    </div>
                </form>
            `,
            confirmText: '立即创建',
            onConfirm: async () => {
                const form = document.getElementById('create-app-form');
                if (!form.reportValidity()) return false;

                const data = {
                    id: form.id.value.trim(),
                    name: form.name.value.trim(),
                    author: form.author.value.trim()
                };

                try {
                    await SystemApi.createModule(data);
                    await Modal.alert('创建成功', `新应用模块 <strong>${Utils.escapeHtml(data.name)}</strong> 已生成！<br>请<strong>手动重启后端服务</strong>以加载新模块。`);
                    return true;
                } catch (e) {
                    Toast.error('创建失败: ' + e.message);
                    return false;
                }
            }
        }).show();
    }

    async handleDeleteApp() {
        // 获取市场中所有模块（包括未安装的）
        let allModules = [];
        try {
            const res = await Api.get('/system/market/list');
            allModules = Array.isArray(res) ? res : (res.data || []);
        } catch (e) {
            Toast.error('获取模块列表失败');
            return;
        }

        // 筛选可删除的模块：只有未安装且非系统的模块才能删除
        const deletableModules = allModules.filter(m => {
            // 排除核心模块
            if (['system', 'user', 'auth', 'boot'].includes(m.id)) return false;
            // 只有未安装的模块才能删除
            return !m.installed;
        });

        // 已安装的模块
        const installedModules = allModules.filter(m =>
            m.installed && !['system', 'user', 'auth', 'boot'].includes(m.id)
        );

        if (deletableModules.length === 0 && installedModules.length === 0) {
            Toast.info('当前没有可删除的应用');
            return;
        }

        let warningHtml = '';
        if (installedModules.length > 0) {
            warningHtml += `
                <div class="info-box" style="background: rgba(255, 204, 0, 0.1); color: #cc9900; padding: 10px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                    <i class="ri-lightbulb-line"></i> 以下应用已安装，需先在「应用市场」中卸载后才能删除：<br>
                    <strong>${installedModules.map(m => Utils.escapeHtml(m.name)).join('、')}</strong>
                </div>
            `;
        }

        if (deletableModules.length === 0) {
            await Modal.alert('无法删除', warningHtml + '<p>当前没有可删除的应用。</p>');
            return;
        }

        new Modal({
            title: '删除应用',
            content: `
                <form id="delete-app-form">
                    ${warningHtml}
                    <div class="form-group">
                        <label>选择要删除的应用</label>
                        <select class="form-select" name="module_id" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                            ${deletableModules.map(m => `<option value="${Utils.escapeHtml(String(m.id))}">${Utils.escapeHtml(m.name)} (${Utils.escapeHtml(String(m.id))})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:20px;">
                        <label class="checkbox" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" name="delete_db" checked> 
                            <span>同时删除数据库表 (如果不选，数据将保留)</span>
                        </label>
                    </div>
                    <div class="alert" style="background: rgba(255, 59, 48, 0.1); color: #ff3b30; padding: 10px; border-radius: 8px; margin-top: 16px; font-size: 13px;">
                        <i class="ri-error-warning-line"></i> 警告：删除操作不可恢复！对应的代码文件将被永久删除。
                    </div>
                </form>
            `,
            confirmText: '确认删除',
            onConfirm: async () => {
                const form = document.getElementById('delete-app-form');
                const moduleId = form.module_id.value;
                const deleteDb = form.delete_db.checked;

                const confirmed = await Modal.confirm('最终确认', `确定要彻底删除应用 "${Utils.escapeHtml(moduleId)}" 吗？此操作无法撤销。`);
                if (!confirmed) return false;

                try {
                    await SystemApi.deleteModule(moduleId, { delete_db: deleteDb });
                    await Modal.alert('删除成功', '应用已删除！<br>请<strong>手动重启后端服务</strong>以清理缓存。');
                    this.loadData();
                    this.loadMarketData();
                    return true;
                } catch (e) {
                    Toast.error('删除失败: ' + e.message);
                    return false;
                }
            }
        }).show();
    }

    async handleUploadPackage() {
        // 触发文件选择
        const input = document.getElementById('jwappPackageInput');
        if (!input) return;

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            await this._doUploadPackage(file, false);
            input.value = ''; // 清空选择
        };

        input.click();
    }

    /**
     * 执行上传离线包
     * @param {File} file - 要上传的文件
     * @param {boolean} force - 是否强制覆盖
     */
    async _doUploadPackage(file, force = false) {
        const loading = Toast.loading('正在上传离线包...');
        try {
            const res = await MarketApi.upload(file, force);
            loading.close();

            // 检查是否是 409 冲突响应（已存在的模块）
            if (res.status === 409) {
                const detail = res.detail || {};
                const moduleName = detail.module_name || detail.module_id || '未知';
                const existingVersion = detail.existing_version || '未知';

                const confirmed = await Modal.confirm('模块已存在', `
                    <div style="line-height: 1.6;">
                        <p>模块 <strong>${Utils.escapeHtml(moduleName)}</strong> 已存在于系统中。</p>
                        <p style="margin-top: 8px; color: var(--color-text-secondary);">当前版本: ${Utils.escapeHtml(existingVersion)}</p>
                        <p style="margin-top: 12px;">是否要覆盖现有模块？</p>
                    </div>
                `);

                if (confirmed) {
                    // 用户确认覆盖，带 force=true 重新上传
                    await this._doUploadPackage(file, true);
                }
                return;
            }

            // 上传成功
            const moduleName = res.data?.module_name || res.data?.module_id || '未知';
            const isOverwrite = res.data?.is_overwrite;

            // 显示成功信息
            Toast.success(isOverwrite ? `模块 "${moduleName}" 已覆盖更新！` : `模块 "${moduleName}" 上传成功！`);

            await Modal.alert('上传成功', `
                <div class="alert alert-success" style="background: rgba(52,199,89,0.1); color: #34c759; padding: 16px; border-radius: 8px;">
                    <p>模块 <strong>${Utils.escapeHtml(moduleName)}</strong> ${isOverwrite ? '已覆盖更新' : '已上传成功'}！</p>
                    <p style="margin-top:10px;">接下来请：</p>
                    <ol style="margin: 10px 0 0 20px;">
                        <li>进入「<strong>应用市场</strong>」，找到该模块并点击「<strong>安装</strong>」</li>
                        <li>安装后进入「<strong>应用管理</strong>」，开启该模块</li>
                        <li>刷新浏览器页面</li>
                    </ol>
                </div>
            `);

            // 刷新市场数据
            this.loadMarketData();
        } catch (err) {
            loading.close();
            (typeof Config !== 'undefined' && Config.error) && Config.error('[Market] 上传失败:', err);
            Toast.error(err.message || '离线包上传失败');
        }
    }

    // 渲染当前视图
    renderCurrentView() {
        const { view } = this.state;
        switch (view) {
            case 'home': return this.renderHome();
            case 'manage': return this.renderManage();
            case 'market': return this.renderMarket();
            case 'dev': return this.renderDev();
            default: return this.renderHome();
        }
    }

    render() {
        const { loading, view } = this.state;
        if (loading) return '<div class="loading-full"><div class="loading-spinner"></div></div>';

        return `
            <div class="app-center-layout fade-in">
                <!-- 左侧导航栏 -->
                <aside class="app-center-sidebar">
                    <div class="sidebar-header">
                        <div class="sidebar-logo">
                            <i class="ri-apps-2-line"></i>
                            <span>应用中心</span>
                        </div>
                    </div>
                    
                    <nav class="sidebar-nav">
                        <div class="nav-group">
                            <div class="nav-item ${view === 'home' ? 'active' : ''}" data-view-target="home">
                                <i class="ri-home-4-line"></i>
                                <span>我的应用</span>
                            </div>
                            <div class="nav-item ${view === 'market' ? 'active' : ''}" data-view-target="market">
                                <i class="ri-store-2-line"></i>
                                <span>应用市场</span>
                            </div>
                        </div>

                        ${this.isAdmin ? `
                            <div class="nav-separator"></div>
                            <div class="nav-group-title">系统管理</div>
                            <div class="nav-group">
                                <div class="nav-item ${view === 'manage' ? 'active' : ''}" data-view-target="manage">
                                    <i class="ri-settings-5-line"></i>
                                    <span>应用管理</span>
                                </div>
                                <div class="nav-item ${view === 'dev' ? 'active' : ''}" data-view-target="dev">
                                    <i class="ri-code-s-slash-line"></i>
                                    <span>开发套件</span>
                                </div>
                            </div>
                        ` : ''}
                    </nav>

                    <div class="sidebar-footer">
                        <div class="user-brief">
                            <div class="user-avatar">${Utils.escapeHtml((Store.get('user')?.nickname || 'U').charAt(0))}</div>
                            <div class="user-info">
                                <div class="user-name">${Utils.escapeHtml(Store.get('user')?.nickname || '用户')}</div>
                                <div class="user-role">${Store.get('user')?.role === 'admin' ? '管理员' : '普通用户'}</div>
                            </div>
                        </div>
                    </div>
                </aside>

                <!-- 右侧主内容区 -->
                <main class="app-center-main custom-scrollbar">
                    <div class="main-content-container">
                        ${this.renderCurrentView()}
                    </div>
                </main>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
        // 恢复弹出层状态
        if (this.activePopup) {
            this.updatePopupState();
        }
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // Pin/Unpin App to Dock (优先级最高，必须在最前面绑定)
            this.delegate('click', '[data-pin-app]', async (e, t) => {
                // 阻止所有事件传播
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();

                const moduleId = t.dataset.pinApp;
                if (moduleId) {
                    await this.togglePinApp(moduleId);
                }
                return false;
            });

            // 视图切换
            this.delegate('click', '[data-view-target]', (e, t) => {
                const target = t.dataset.viewTarget;
                this.setState({ view: target });
                // 切换到市场视图时加载市场数据
                if (target === 'market') {
                    this.loadMarketData();
                }
            });

            // 安装模块
            this.delegate('click', '[data-install]', async (e, t) => {
                const moduleId = t.dataset.install;
                if (moduleId) {
                    t.disabled = true;
                    t.textContent = '安装中...';
                    await this.handleInstall(moduleId);
                }
            });

            // 卸载模块
            this.delegate('click', '[data-uninstall]', async (e, t) => {
                const moduleId = t.dataset.uninstall;
                if (moduleId) {
                    await this.handleUninstall(moduleId);
                }
            });

            // ==================== 用户级模块操作 ====================

            // 用户安装模块
            this.delegate('click', '[data-user-install]', async (e, t) => {
                const moduleId = t.dataset.userInstall;
                if (moduleId) {
                    t.disabled = true;
                    t.textContent = '添加中...';
                    await this.handleUserInstall(moduleId);
                }
            });

            // 用户卸载模块
            this.delegate('click', '[data-user-uninstall]', async (e, t) => {
                const moduleId = t.dataset.userUninstall;
                if (moduleId) {
                    await this.handleUserUninstall(moduleId);
                }
            });

            // 用户启用/禁用模块
            this.delegate('click', '[data-user-toggle]', async (e, t) => {
                const moduleId = t.dataset.userToggle;
                const enabled = t.dataset.enabled === 'true';
                if (moduleId) {
                    await this.handleUserToggle(moduleId, enabled);
                }
            });

            // 开发者操作
            this.delegate('click', '[data-action="create-app"]', (e) => {
                this.handleCreateApp();
            });
            this.delegate('click', '[data-action="delete-app"]', (e) => {
                this.handleDeleteApp();
            });
            this.delegate('click', '[data-action="upload-app"]', (e) => {
                this.handleUploadPackage();
            });

            // 切换模块
            this.delegate('change', '[data-toggle]', (e, t) => {
                const moduleId = t.dataset.toggle;
                const module = this.state.modules.find(m => m.id === moduleId);
                if (module) {
                    e.preventDefault();
                    this.handleToggleModule(module);
                }
            });

            // 打开应用（直接）- 排除固定按钮
            this.delegate('click', '[data-app-path]', (e, t) => {
                // 如果点击的是固定按钮或其子元素，不处理
                if (e.target.closest('[data-pin-app]') || e.target.closest('.pin-btn')) {
                    return;
                }

                e.stopPropagation();
                // 如果是 popup item，关闭所有 popup
                if (t.classList.contains('app-popup-item')) {
                    this.closePopup();
                }

                const path = t.dataset.appPath;
                if (path) {
                    Router.push(path, { from: 'apps' });
                }
            });

            // 切换弹窗 - 排除固定按钮
            this.delegate('click', '[data-toggle-popup]', (e, t) => {
                // 如果点击的是固定按钮或其子元素，不处理
                if (e.target.closest('[data-pin-app]') || e.target.closest('.pin-btn')) {
                    return;
                }

                e.stopPropagation();
                const id = t.dataset.togglePopup;
                this.togglePopup(id);
            });


            // 点击外部关闭弹窗
            document.addEventListener('click', (e) => {
                if (this.activePopup && !e.target.closest('.app-card-wrapper')) {
                    this.closePopup();
                }
            });
        }
    }
}


// 将 AppCenterMarketPage 导出到全局作用域以支持动态加载
window.AppCenterMarketPage = AppCenterMarketPage;
/**
 * 状态管理
 * 简易响应式状态存储
 */

const Store = {
    // 状态
    state: {
        // 用户信息
        user: null,
        token: null,
        isLoggedIn: false,

        // 系统信息
        appName: 'JeJe WebOS',
        version: '',
        modules: [],
        menus: [],
        systemSettings: null,

        // UI状态
        sidebarCollapsed: false,
        loading: false,
        theme: 'neon', // 默认星夜霓虹，可被系统设置/用户偏好覆盖

        // 当前路由
        currentRoute: '/',

        // CSRF Token
        csrfToken: null
    },

    // 监听器
    listeners: [],

    /**
     * 初始化状态
     */
    init() {
        // 从本地存储恢复
        const token = localStorage.getItem(Config.storageKeys.token);
        const userStr = localStorage.getItem(Config.storageKeys.user);
        const collapsed = localStorage.getItem(Config.storageKeys.sidebarCollapsed);
        const theme = localStorage.getItem(Config.storageKeys.theme);

        if (token) {
            this.state.token = token;
            this.state.isLoggedIn = true;
        }

        if (userStr) {
            try {
                const parsedUser = JSON.parse(userStr);
                this.state.user = parsedUser;
                // 确保 settings 中的 start_menu_shortcuts 是数组
                if (parsedUser && parsedUser.settings) {
                    if (!parsedUser.settings.start_menu_shortcuts ||
                        !Array.isArray(parsedUser.settings.start_menu_shortcuts)) {
                        parsedUser.settings.start_menu_shortcuts = [];
                    }
                }
            } catch (e) {
                Config.error('解析用户信息失败');
            }
        }

        if (collapsed === 'true') {
            this.state.sidebarCollapsed = true;
        }

        if (['sunrise', 'neon'].includes(theme)) {
            this.state.theme = theme;
        } else {
            // 如果存储的主题不在支持列表中，默认使用neon
            this.state.theme = 'neon';
        }

        this.applyTheme(this.state.theme);

        Config.log('Store初始化完成', this.state);
    },

    /**
     * 应用主题到文档
     */
    applyTheme(mode) {
        const root = document.documentElement;
        root.classList.remove('theme-sunrise', 'theme-neon');
        root.style = ''; // 重置内联样式

        if (mode === 'sunrise' || mode === 'neon') {
            root.classList.add(`theme-${mode}`);
        } else {
            // 默认回退到 neon 主题
            root.classList.add('theme-neon');
            this.state.theme = 'neon';
        }
    },

    /**
     * 设置状态
     */
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;

        // 自动持久化核心数据
        if (key === 'user' && value) {
            localStorage.setItem(Config.storageKeys.user, JSON.stringify(value));
        }

        // 通知监听器
        this.notify(key, value, oldValue);
    },

    /**
     * 获取状态
     */
    get(key) {
        return this.state[key];
    },

    /**
     * 批量更新状态
     */
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });
    },

    /**
     * 订阅状态变化
     */
    subscribe(key, callback) {
        this.listeners.push({ key, callback });
        return () => {
            this.listeners = this.listeners.filter(
                l => !(l.key === key && l.callback === callback)
            );
        };
    },

    /**
     * 通知监听器
     */
    notify(key, value, oldValue) {
        this.listeners
            .filter(l => l.key === key || l.key === '*')
            .forEach(l => l.callback(value, oldValue, key));
    },

    /**
     * 设置认证信息
     */
    setAuth(token, user) {
        this.state.token = token;
        this.state.user = user;
        this.state.isLoggedIn = true;

        localStorage.setItem(Config.storageKeys.token, token);
        localStorage.setItem(Config.storageKeys.user, JSON.stringify(user));

        this.notify('auth', { token, user });
    },

    /**
     * 清除认证信息
     */
    clearAuth() {
        this.state.token = null;
        this.state.user = null;
        this.state.isLoggedIn = false;

        localStorage.removeItem(Config.storageKeys.token);
        localStorage.removeItem(Config.storageKeys.user);

        this.notify('auth', null);
    },

    /**
     * 设置系统信息
     */
    setSystemInfo(info) {
        // 保存 CSRF Token
        if (info.csrf_token) {
            this.set('csrfToken', info.csrf_token);
        }

        // 先落库用户，再基于用户过滤模块/菜单
        if (info.user) {
            // 合并用户设置，避免覆盖已有的 settings
            const currentUser = this.state.user;

            // 深度合并 settings，确保 dock_pinned_apps 等设置不丢失
            // 后端数据优先，但保留当前已有的设置（如果后端没有）
            const backendSettings = info.user.settings || {};
            const currentSettings = currentUser?.settings || {};

            // 合并策略：
            // 1. 如果后端返回的 settings 是空对象，则保留当前的 settings
            // 2. 否则合并：后端优先，但保留当前已有的设置（如果后端没有对应的键）
            // 3. 特别处理 dock_pinned_apps 和 start_menu_shortcuts：如果后端没有，尝试从当前 settings 或 localStorage 读取
            let mergedSettings;
            if (Object.keys(backendSettings).length === 0) {
                // 后端返回空对象，保留当前的 settings
                mergedSettings = currentSettings;
            } else {
                // 后端有 settings，合并：后端优先，但保留当前已有的设置（如果后端没有对应的键）
                mergedSettings = {
                    ...currentSettings,
                    ...backendSettings
                };
            }

            // 特别处理 dock_pinned_apps：如果后端没有，尝试从当前 settings 或 localStorage 获取
            if (!mergedSettings.dock_pinned_apps) {
                if (currentSettings.dock_pinned_apps) {
                    mergedSettings.dock_pinned_apps = currentSettings.dock_pinned_apps;
                } else {
                    // 尝试从 localStorage 读取
                    try {
                        const localPinnedApps = localStorage.getItem('jeje_pinned_apps');
                        if (localPinnedApps) {
                            const parsed = JSON.parse(localPinnedApps);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                mergedSettings.dock_pinned_apps = parsed;
                            }
                        }
                    } catch (e) {
                        // 静默处理 localStorage 读取异常
                    }
                }
            }

            // 特别处理 start_menu_shortcuts：确保快捷方式持久化
            // 后端数据优先，但如果后端没有且当前有，则保留当前的
            if (!mergedSettings.start_menu_shortcuts || !Array.isArray(mergedSettings.start_menu_shortcuts)) {
                if (currentSettings.start_menu_shortcuts && Array.isArray(currentSettings.start_menu_shortcuts)) {
                    mergedSettings.start_menu_shortcuts = currentSettings.start_menu_shortcuts;
                } else {
                    // 如果都没有，初始化为空数组
                    mergedSettings.start_menu_shortcuts = [];
                }
            }

            const newUser = {
                ...info.user,
                // 使用合并后的 settings
                settings: mergedSettings
            };
            this.set('user', newUser);
            this.set('isLoggedIn', true);

            // 同步持久化到 localStorage
            localStorage.setItem(Config.storageKeys.user, JSON.stringify(newUser));

            // 触发 user 更新事件，通知 Dock 等组件更新
            this.notify('user', newUser);
        }
        if (info.app_name) this.set('appName', info.app_name);
        if (info.version) this.set('version', info.version);

        const filteredModules = this.filterModules(info.modules || [], this.state.user);
        const filteredMenus = this.filterMenus(info.menus || [], this.state.user, filteredModules);
        this.set('modules', filteredModules);
        this.set('menus', filteredMenus);
    },

    /**
     * 设置系统设置（并应用主题策略）
     */
    setSystemSettings(settings) {
        this.state.systemSettings = settings;
        this.notify('systemSettings', settings);
        const userPref = localStorage.getItem(Config.storageKeys.theme);
        const systemTheme = settings?.theme_mode;
        // 只接受sunrise或neon，否则使用neon作为默认值
        let mode = 'neon';
        if (userPref && ['sunrise', 'neon'].includes(userPref)) {
            mode = userPref;
        } else if (systemTheme && ['sunrise', 'neon'].includes(systemTheme)) {
            mode = systemTheme;
        }
        this.state.theme = mode;
        this.applyTheme(mode);
        // 仅在用户无偏好时，将系统默认写入存储
        if (!userPref && systemTheme && ['sunrise', 'neon'].includes(systemTheme)) {
            localStorage.setItem(Config.storageKeys.theme, systemTheme);
        }
    },

    /**
     * 过滤模块（前端兜底权限校验）
     */
    filterModules(modules, user) {
        const isSuperAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const isAdmin = isSuperAdmin || isManager;
        const perms = user?.permissions || [];
        return (modules || []).filter(m => {
            if (isAdmin) return true;
            if (!m.enabled) return false;
            if (perms.includes('*')) return true;
            return perms.some(p => p === m.id || p.startsWith(`${m.id}.`));
        }).map(m => ({ ...m, visible: true }));
    },

    /**
     * 过滤菜单（依赖模块可见性和权限）
     */
    filterMenus(menus, user, modules) {
        const moduleSet = new Set((modules || []).map(m => m.id));
        const isSuperAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const isAdmin = isSuperAdmin || isManager;
        const perms = user?.permissions || [];
        const hasModulePerm = (moduleId) => {
            if (isAdmin) return true;
            if (perms.includes('*')) return true;
            return perms.some(p => p === moduleId || p.startsWith(`${moduleId}.`));
        };
        return (menus || []).filter(menu => {
            if (!menu.module) return true;
            if (!moduleSet.has(menu.module)) return false;
            return hasModulePerm(menu.module);
        });
    },

    /**
     * 切换侧边栏
     */
    toggleSidebar() {
        this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
        localStorage.setItem(
            Config.storageKeys.sidebarCollapsed,
            this.state.sidebarCollapsed
        );
        this.notify('sidebarCollapsed', this.state.sidebarCollapsed);
    },

    /**
     * 设置主题
     */
    setTheme(mode) {
        const themeMode = ['sunrise', 'neon'].includes(mode) ? mode : 'neon';
        this.state.theme = themeMode;
        localStorage.setItem(Config.storageKeys.theme, themeMode);
        this.applyTheme(themeMode);
        this.notify('theme', themeMode);

        // 触发全局主题变化事件，供其他组件监听（如 ECharts 图表）
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: themeMode } }));
    },

    /**
     * 刷新系统信息（模块和菜单）
     * 用于模块创建/删除后更新侧边栏
     */
    async refreshSystemInfo() {
        try {
            const token = localStorage.getItem(Config.storageKeys.token);
            const res = await SystemApi.init(token);
            if (res && res.data) {
                this.setSystemInfo(res.data);

                // 刷新侧边栏显示
                if (typeof App !== 'undefined' && App.refreshSidebar) {
                    App.refreshSidebar();
                }

                Config.log('系统信息已刷新');
                return true;
            }
        } catch (e) {
            Config.error('刷新系统信息失败', e);
        }
        return false;
    }
};

// 初始化
Store.init();



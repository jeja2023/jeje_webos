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
        version: '1.0.0',
        modules: [],
        menus: [],
        systemSettings: null,

        // UI状态
        sidebarCollapsed: false,
        loading: false,
        theme: 'dark', // 默认深色，可被系统设置/用户偏好覆盖

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
                this.state.user = JSON.parse(userStr);
            } catch (e) {
                Config.error('解析用户信息失败');
            }
        }

        if (collapsed === 'true') {
            this.state.sidebarCollapsed = true;
        }

        if (['light', 'dark', 'auto', 'sunrise', 'neon', 'summer', 'winter', 'spring', 'autumn', 'custom'].includes(theme)) {
            this.state.theme = theme;
        }

        this.applyTheme(this.state.theme);

        Config.log('Store初始化完成', this.state);
    },

    /**
     * 应用主题到文档
     */
    applyTheme(mode) {
        const root = document.documentElement;
        root.classList.remove('theme-light', 'theme-dark', 'theme-auto', 'theme-sunrise', 'theme-neon', 'theme-summer', 'theme-winter', 'theme-spring', 'theme-autumn', 'theme-custom');
        root.style = ''; // Reset inline styles

        if (['light', 'dark', 'sunrise', 'neon', 'summer', 'winter', 'spring', 'autumn'].includes(mode)) {
            root.classList.add(`theme-${mode}`);
        } else if (mode === 'custom') {
            // 自定义主题：先添加 light 作为基础，再覆盖自定义变量
            root.classList.add('theme-light');
            // Load custom theme config
            try {
                const customConfig = JSON.parse(localStorage.getItem('user_theme_custom_config') || '{}');
                Object.entries(customConfig).forEach(([key, value]) => {
                    if (key.startsWith('--')) {
                        root.style.setProperty(key, value);
                    }
                });
            } catch (e) {
                console.error('加载自定义主题失败', e);
            }
        } else {
            // Auto/Default
            root.classList.add('theme-auto');
        }
    },

    /**
     * 设置状态
     */
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;

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
            this.set('user', info.user);
            this.set('isLoggedIn', true);
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
        const mode = userPref || settings?.theme_mode || 'dark';
        this.state.theme = mode;
        this.applyTheme(mode);
        // 仅在用户无偏好时，将系统默认写入存储
        if (!userPref && settings?.theme_mode) {
            localStorage.setItem(Config.storageKeys.theme, settings.theme_mode);
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
            return perms.some(p => p.startsWith(`${m.id}.`));
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
            return perms.some(p => p.startsWith(`${moduleId}.`));
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
        const themeMode = ['light', 'dark', 'auto', 'sunrise', 'neon', 'summer', 'winter', 'spring', 'autumn', 'custom'].includes(mode) ? mode : 'auto';
        this.state.theme = themeMode;
        localStorage.setItem(Config.storageKeys.theme, themeMode);
        this.applyTheme(themeMode);
        this.notify('theme', themeMode);
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



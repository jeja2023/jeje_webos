/**
 * Dock 底部快捷栏组件
 * 精美的底部快捷入口设计 - 显示系统入口 + 用户固定的应用
 */
class DockComponent extends Component {
    constructor(container) {
        super(container);
        this.state = {
            categories: [],
            activeApp: Store.get('currentRoute') || '/dashboard',
            openWindows: Store.get('openWindows') || [], // 当前打开的所有窗口ID
            openFolder: null // 当前打开的文件夹ID
        };

        // 固定应用的 localStorage key
        this.PINNED_APPS_KEY = 'jeje_pinned_apps';

        Store.subscribe('currentRoute', (route) => {
            this.setState({ activeApp: route, openFolder: null });
        });

        // 监听打开的窗口列表，用于确定的 Dock 指示器（小白点）
        Store.subscribe('openWindows', (windows) => {
            this.setState({ openWindows: windows || [] });
        });

        // 监听模块变化，动态更新 Dock
        Store.subscribe('modules', () => {
            this.updateCategories();
        });

        // 监听固定应用变化
        Store.subscribe('pinnedApps', () => {
            this.updateCategories();
        });

        // 监听用户信息变化（如设置同步完成后）
        Store.subscribe('user', () => {
            this.updateCategories();
        });
    }

    // 获取用户固定的应用列表
    getPinnedApps() {
        // 1. 优先从用户 Store 设置中读取（已同步后端）
        const user = Store.get('user');

        if (user && user.settings && user.settings.dock_pinned_apps) {
            const apps = Array.isArray(user.settings.dock_pinned_apps)
                ? user.settings.dock_pinned_apps
                : [];
            return apps;
        }

        // 2. 只有在未登录或无设置时降级读取本地缓存
        try {
            const saved = localStorage.getItem(this.PINNED_APPS_KEY);
            const apps = saved ? JSON.parse(saved) : [];
            return apps;
        } catch (e) {
            return [];
        }
    }

    // 保存固定的应用列表
    async savePinnedApps(apps) {
        // 1. 更新本地状态（乐观更新 UI）
        localStorage.setItem(this.PINNED_APPS_KEY, JSON.stringify(apps));
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
        }
    }

    // 固定应用到 Dock
    pinApp(moduleId) {
        const pinned = this.getPinnedApps();
        if (!pinned.includes(moduleId)) {
            pinned.push(moduleId);
            this.savePinnedApps(pinned);
            this.updateCategories();
        }
    }

    // 从 Dock 取消固定
    unpinApp(moduleId) {
        const pinned = this.getPinnedApps().filter(id => id !== moduleId);
        this.savePinnedApps(pinned);
        this.updateCategories();
    }

    // 检查应用是否已固定
    isAppPinned(moduleId) {
        return this.getPinnedApps().includes(moduleId);
    }

    updateCategories() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        // 获取当前模块列表
        const modules = Store.get('modules') || [];
        const pinnedAppIds = this.getPinnedApps();

        // 系统应用ID（用于过滤固定应用，避免重复）
        // feedback 已移除，现在由用户自由选择是否固定
        const SYSTEM_APP_IDS = ['announcement', 'notification'];

        // 初始化分类（仪表盘已移除，登录后直接显示桌面）
        const categories = [];



        // 添加用户固定的应用（排除系统应用，避免重复）
        for (const moduleId of pinnedAppIds) {
            if (SYSTEM_APP_IDS.includes(moduleId)) continue;  // 跳过系统应用
            const module = modules.find(m => m.id === moduleId && m.enabled);
            if (module) {
                const dockItem = this.buildDockItem(module, isAdmin, user);
                if (dockItem) {
                    categories.push(dockItem);
                }
            }
        }

        // === 固定功能区：文件管理 → 通知 → 公告 ===



        // 2. 信息（所有用户可见，直接进入通知列表）
        categories.push({
            id: 'message',
            title: '信息',
            icon: '✉️',
            isSystem: true,
            path: '/message/list',
            children: null
        });

        // 3. 公告（仅管理员/经理可见）
        if (isAdmin || user?.role === 'manager') {
            categories.push({
                id: 'sys_announcement',
                title: '公告管理',
                icon: '📢',
                isSystem: true,
                path: '/announcement/list',
                children: null
            });
        }

        // feedback 模块现在由用户自由选择是否固定，不再强制显示

        // 系统管理（仅管理员/管理员可见）
        if (isAdmin || user?.role === 'manager') {
            // 1. 用户管理（单一入口，内部可切换到待审核和用户组）
            categories.push({
                id: 'sys_users',
                title: '用户管理',
                icon: '👥',
                isSystem: true,
                path: '/users/list',
                children: null
            });

            // 2. 系统管理（仅系统管理员，单一入口，内部可切换到日志、监控、备份）
            if (isAdmin) {
                categories.push({
                    id: 'sys_ops',
                    title: '系统管理',
                    icon: '🖥️',
                    isSystem: true,
                    path: '/system/settings',
                    children: null
                });
            }
        }

        this.setState({ categories });
    }

    // 根据模块构建 Dock 项
    buildDockItem(module, isAdmin, user) {
        const menuConfig = {
            'blog': {
                singleEntry: true,
                path: '/blog/list'
            },
            // 笔记：单一入口，侧边栏已整合收藏和标签
            'notes': {
                singleEntry: true,
                path: '/notes/list'
            },
            // 反馈：单一入口，主页面已有提交和管理按钮
            'feedback': {
                singleEntry: true,
                path: '/feedback/my'
            },
            // 公告：单一入口，主页面已有发布按钮
            'announcement': {
                singleEntry: true,
                path: '/announcement/list'
            }
        };

        const config = menuConfig[module.id];

        if (config) {
            // 单一入口模式：直接跳转，不显示子菜单
            if (config.singleEntry) {
                return {
                    id: module.id,
                    title: module.name,
                    icon: module.icon || '📦',
                    path: config.path,
                    children: null,
                    isPinned: true
                };
            }
            // 有子菜单的模式
            return {
                id: module.id,
                title: module.name,
                icon: module.icon || '📦',
                children: config.children,
                isPinned: true
            };
        }

        // 通用模块（基于 menu 配置）
        if (module.menu) {
            return {
                id: module.id,
                title: module.name,
                icon: module.icon || '📦',
                path: module.menu.path || `/${module.id}`,
                children: null, // 强制移除通用模块的子菜单，保持 Dock 简洁
                isPinned: true
            };
        }

        // 无 menu 配置，使用默认路径
        return {
            id: module.id,
            title: module.name,
            icon: module.icon || '📦',
            path: `/${module.id}`,
            children: null,
            isPinned: true
        };
    }

    toggleFolder(folderId) {
        const { openFolder } = this.state;
        if (openFolder === folderId) {
            this.setState({ openFolder: null });
        } else {
            this.setState({ openFolder: folderId });
        }
    }

    closeFolder() {
        this.setState({ openFolder: null });
    }

    render() {
        // 解构 openWindows
        const { categories, activeApp, openFolder, openWindows } = this.state;

        // 应用中心是否激活：检查是否有以 /apps 开头的窗口打开
        const isAppsActive = openWindows && openWindows.some(id => id.startsWith('/apps'));

        return `
            <div class="dock-container">
                <div class="dock">
                    <!-- 开始按钮 -->
                    <div class="dock-item" id="dock-launcher" title="开始">
                        <span class="dock-icon">🚀</span>
                        <div class="dock-tooltip">开始</div>
                    </div>
                    
                    <div class="dock-separator"></div>
                    
                    <!-- 分类文件夹 -->
                    ${categories.map(cat => this.renderCategory(cat, activeApp, openFolder, openWindows)).join('')}
                    
                    <div class="dock-separator"></div>
                    
                    <!-- 应用中心（最右侧） -->
                    <div class="dock-item ${isAppsActive ? 'active' : ''}" 
                         onclick="Router.push('/apps')" 
                         title="应用中心">
                        <span class="dock-icon">🏪</span>
                        <div class="dock-tooltip">应用中心</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderCategory(category, activeApp, openFolder, openWindows) {
        const isOpen = openFolder === category.id;
        const hasChildren = category.children && category.children.length > 0;
        const hasSubgroups = category.hasSubgroups && category.subgroups;

        // 辅助函数：检查路径是否对应任何打开的窗口
        const isPathOpen = (path) => {
            if (!openWindows) return false;
            return openWindows.some(winId => winId.startsWith(path));
        };

        // 检查是否有子项激活（显示在图标下的小白点）
        let hasActiveChild = false;
        if (hasChildren) {
            hasActiveChild = category.children.some(child => isPathOpen(child.path));
        } else if (hasSubgroups) {
            hasActiveChild = category.subgroups.some(group =>
                group.children.some(child => isPathOpen(child.path))
            );
        }

        // 单个应用的激活状态
        const isActive = category.path && isPathOpen(category.path);

        // 如果没有子项也没有子分组，直接跳转
        if (!hasChildren && !hasSubgroups) {
            return `
                <div class="dock-item ${isActive ? 'active' : ''}" 
                     onclick="Router.push('${category.path}')" 
                     title="${category.title}">
                    <span class="dock-icon">${category.icon}</span>
                    <div class="dock-tooltip">${category.title}</div>
                </div>
            `;
        }

        // 渲染弹出内容
        let popupContent = '';
        if (hasSubgroups) {
            // 有子分组的情况（如系统管理）
            popupContent = category.subgroups.map(group => `
                <div class="folder-subgroup">
                    <div class="folder-subgroup-header">
                        <span class="subgroup-icon">${group.icon}</span>
                        <span class="subgroup-title">${group.title}</span>
                    </div>
                    <div class="folder-subgroup-items">
                        ${group.children.map(child => `
                            <div class="folder-app-item ${activeApp.startsWith(child.path) ? 'active' : ''}" 
                                 data-path="${child.path}">
                                <span class="folder-app-icon">${child.icon}</span>
                                <span class="folder-app-title">${child.title}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } else {
            // 普通子项列表
            popupContent = category.children.map(child => `
                <div class="folder-app-item ${activeApp.startsWith(child.path) ? 'active' : ''}" 
                     data-path="${child.path}">
                    <span class="folder-app-icon">${child.icon}</span>
                    <span class="folder-app-title">${child.title}</span>
                </div>
            `).join('');
        }

        // 有子项的文件夹
        return `
            <div class="dock-folder ${isOpen ? 'open' : ''} ${hasActiveChild ? 'active' : ''}" 
                 data-folder="${category.id}">
                <div class="dock-item dock-folder-trigger" title="${category.title}">
                    <span class="dock-icon">${category.icon}</span>
                    <div class="dock-tooltip">${category.title}</div>
                </div>
                
                <!-- 弹出菜单 -->
                <div class="dock-folder-popup ${isOpen ? 'show' : ''} ${hasSubgroups ? 'has-subgroups' : ''}">
                    <div class="folder-popup-header">${category.title}</div>
                    <div class="folder-popup-grid">
                        ${popupContent}
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.updateCategories();
        this.bindEvents();
    }

    afterUpdate() {
        // 重新绑定事件
    }

    bindEvents() {
        // 开始菜单
        this.delegate('click', '#dock-launcher', (e) => {
            e.stopPropagation();
            this.closeFolder();
            if (App && App.startMenu) {
                App.startMenu.toggle();
            }
        });

        // 文件夹点击
        this.delegate('click', '.dock-folder-trigger', (e, el) => {
            e.stopPropagation();
            const folder = el.closest('.dock-folder');
            if (folder) {
                const folderId = folder.dataset.folder;
                this.toggleFolder(folderId);
            }
        });

        // 子应用点击
        this.delegate('click', '.folder-app-item', (e, el) => {
            e.stopPropagation();
            const path = el.dataset.path;
            if (path) {
                Router.push(path);
                this.closeFolder();
            }
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dock-folder')) {
                this.closeFolder();
            }
        });
    }
}

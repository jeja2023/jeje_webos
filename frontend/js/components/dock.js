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
    }

    // 获取用户固定的应用列表
    getPinnedApps() {
        try {
            const saved = localStorage.getItem(this.PINNED_APPS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    // 保存固定的应用列表
    savePinnedApps(apps) {
        localStorage.setItem(this.PINNED_APPS_KEY, JSON.stringify(apps));
        Store.set('pinnedApps', apps);
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
        const SYSTEM_APP_IDS = ['feedback', 'announcement', 'notification'];

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

        // === 固定功能区：文件存储 → 通知 → 公告 → 交流意见 ===

        // 1. 文件存储（所有用户可见，直接跳转）
        categories.push({
            id: 'storage',
            title: '文件存储',
            icon: '📂',
            isSystem: true,
            path: '/storage/list',
            children: null
        });

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
                id: 'announcement',
                title: '公告',
                icon: '📢',
                isSystem: true,
                children: [
                    { title: '公告管理', icon: '📋', path: '/announcement/list' },
                    { title: '发布公告', icon: '✏️', path: '/announcement/edit' }
                ]
            });
        }

        // 3. 交流意见/反馈（所有用户可见）
        const feedbackModule = modules.find(m => m.id === 'feedback' && m.enabled);
        if (feedbackModule) {
            categories.push({
                id: 'feedback',
                title: '交流意见',
                icon: '💬',
                isSystem: true,
                children: [
                    { title: '我的反馈', icon: '📨', path: '/feedback/my' },
                    { title: '提交反馈', icon: '➕', path: '/feedback/create' },
                    ...(isAdmin || user?.role === 'manager' ? [{ title: '反馈管理', icon: '🗂️', path: '/feedback/list' }] : [])
                ]
            });
        }

        // 系统管理（仅管理员/管理员可见）
        if (isAdmin || user?.role === 'manager') {
            // 1. 用户管理
            categories.push({
                id: 'sys_users',
                title: '用户管理',
                icon: '👥',
                isSystem: true,
                children: [
                    { title: '用户列表', icon: '📄', path: '/users/list' },
                    { title: '待审核用户', icon: '⏳', path: '/users/pending' },
                    isAdmin ? { title: '用户组', icon: '🛡️', path: '/system/roles' } : null
                ].filter(Boolean)
            });

            // 2. 系统运维（仅系统管理员）
            if (isAdmin) {
                categories.push({
                    id: 'sys_ops',
                    title: '系统运维',
                    icon: '🖥️',
                    isSystem: true,
                    children: [
                        { title: '系统设置', icon: '⚙️', path: '/system/settings' },
                        { title: '系统日志', icon: '📜', path: '/system/audit' },
                        { title: '系统监控', icon: '📈', path: '/system/monitor' },
                        { title: '数据备份', icon: '💾', path: '/system/backup' }
                    ]
                });
            }
        }

        this.setState({ categories });
    }

    // 根据模块构建 Dock 项
    buildDockItem(module, isAdmin, user) {
        const menuConfig = {
            'blog': {
                children: [
                    { title: '文章列表', icon: '📄', path: '/blog/list' },
                    { title: '发布文章', icon: '✏️', path: '/blog/edit' },
                    { title: '分类管理', icon: '📁', path: '/blog/category' }
                ]
            },
            'notes': {
                children: [
                    { title: '所有笔记', icon: '📋', path: '/notes/list' },
                    { title: '我的收藏', icon: '⭐', path: '/notes/starred' },
                    { title: '标签管理', icon: '🏷️', path: '/notes/tags' }
                ]
            },
            'feedback': {
                children: [
                    { title: '我的反馈', icon: '📨', path: '/feedback/my' },
                    { title: '提交反馈', icon: '➕', path: '/feedback/create' },
                    ...(isAdmin || user?.role === 'manager' ? [{ title: '反馈管理', icon: '🗂️', path: '/feedback/list' }] : [])
                ]
            },
            'announcement': {
                children: [
                    { title: '公告列表', icon: '📢', path: '/announcement/list' },
                    isAdmin ? { title: '发布公告', icon: '✏️', path: '/announcement/edit' } : null
                ].filter(Boolean)
            }
        };

        const config = menuConfig[module.id];

        if (config) {
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
                children: module.menu.children || null,
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

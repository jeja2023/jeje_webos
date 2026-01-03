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

        // 监听是否有最大化窗口 - 触发重新渲染以更新auto-hide类
        Store.subscribe('hasMaximizedWindow', () => {
            this.update();
        });
    }

    // 获取用户固定的应用列表
    getPinnedApps() {
        // 智脑 AI、知识库、地图、桌面等核心模块默认固定
        const DEFAULT_APPS = ['knowledge', 'notes', 'ai', 'map'];

        // 1. 优先从用户 Store 设置中读取（已同步后端）
        const user = Store.get('user');
        let pinned = [];

        if (user && user.settings && user.settings.dock_pinned_apps) {
            pinned = Array.isArray(user.settings.dock_pinned_apps)
                ? user.settings.dock_pinned_apps
                : [];
        } else {
            // 2. 只有在未登录或无设置时降级读取本地缓存
            try {
                const saved = localStorage.getItem(this.PINNED_APPS_KEY);
                pinned = saved ? JSON.parse(saved) : [];
            } catch (e) {
                pinned = [];
            }
        }

        // 3. 彻底修复：合并默认固定应用，确保像 AI 这样的新模块即便没点击“固定”也能显示
        const result = [...pinned];
        DEFAULT_APPS.forEach(id => {
            if (!result.includes(id)) {
                result.push(id);
            }
        });

        return result;
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

        // 初始化分类（仪表盘已移除，登录后直接显示桌面）
        const categories = [];



        // 添加用户固定的应用
        for (const moduleId of pinnedAppIds) {
            const module = modules.find(m => m.id === moduleId && m.enabled);
            if (module) {
                const dockItem = this.buildDockItem(module, isAdmin, user);
                if (dockItem) {
                    categories.push(dockItem);
                }
            }
        }

        // === 固定功能区：文件管理 → 通知 → 公告 ===



        // 2. 通知（所有用户可见，直接进入通知列表）
        categories.push({
            id: 'notification',
            title: '通知',
            path: '/notifications',
            children: null
        });

        // 3. 公告（仅管理员/经理可见）
        if (isAdmin || user?.role === 'manager') {
            categories.push({
                id: 'sys_announcement',
                title: '公告管理',
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
                path: '/users/list',
                children: null
            });

            // 2. 系统管理（仅系统管理员，单一入口，内部可切换到日志、监控、备份）
            if (isAdmin) {
                categories.push({
                    id: 'sys_ops',
                    title: '系统管理',
                    icon: '🖥️',
                    path: '/system/settings',
                    children: null
                });
            }
        }

        this.setState({ categories });
    }

    // 获取应用对应的图标配置（同步设计规约）
    _getIconSpec(id, defaultIcon = '📦') {
        const iconMap = {
            'launcher': { ri: 'ri-menu-line', gradient: 'gradient-blue' }, // 开始按钮（菜单图标）
            'notification': { ri: 'ri-notification-3-line', gradient: 'gradient-orange' }, // 通知
            'knowledge': { ri: 'ri-book-read-line', gradient: 'gradient-blue' },
            'blog': { ri: 'ri-article-line', gradient: 'gradient-blue' },
            'notes': { ri: 'ri-sticky-note-line', gradient: 'gradient-yellow' },
            'feedback': { ri: 'ri-feedback-line', gradient: 'gradient-teal' },
            'announcement': { ri: 'ri-megaphone-line', gradient: 'gradient-orange' }, // 公告模块
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
            'message': { ri: 'ri-message-3-line', gradient: 'gradient-indigo' },
            'roles': { ri: 'ri-shield-user-line', gradient: 'gradient-red' },
            'sys_announcement': { ri: 'ri-megaphone-line', gradient: 'gradient-orange' }, // 公告管理
            'sys_users': { ri: 'ri-group-line', gradient: 'gradient-cyan' },
            'sys_ops': { ri: 'ri-settings-4-line', gradient: 'gradient-grey' },
            'ai': { ri: 'ri-brain-line', gradient: 'gradient-indigo' },
            'map': { ri: 'ri-map-2-line', gradient: 'gradient-emerald' },
            'office': { ri: 'ri-file-text-line', gradient: 'gradient-blue' },
            'im': { ri: 'ri-message-3-line', gradient: 'gradient-cyan' },
            'album': { ri: 'ri-image-2-line', gradient: 'gradient-pink' },
            'video': { ri: 'ri-video-line', gradient: 'gradient-red' },
            'exam': { ri: 'ri-file-list-3-line', gradient: 'gradient-orange' },
            'ocr': { ri: 'ri-scan-2-line', gradient: 'gradient-cyan' },
            'course': { ri: 'ri-book-open-line', gradient: 'gradient-violet' },
            'schedule': { ri: 'ri-calendar-schedule-line', gradient: 'gradient-indigo' },
        };

        return iconMap[id] || { ri: null, gradient: 'gradient-default', emoji: defaultIcon };
    }

    // 渲染图标 HTML 辅助函数
    _renderIcon(id, defaultIcon) {
        const spec = this._getIconSpec(id, defaultIcon);
        if (spec.ri) {
            return `<div class="dock-icon-wrapper ${spec.gradient}"><i class="${spec.ri}"></i></div>`;
        }
        return `<div class="dock-icon-wrapper">${spec.emoji}</div>`;
    }

    // 根据模块构建 Dock 项
    buildDockItem(module, isAdmin, user) {
        const menuConfig = {
            'blog': {
                singleEntry: true,
                path: '/blog/list'
            },
            'knowledge': {
                singleEntry: true,
                path: '/knowledge/list'
            },
            'ai': {
                singleEntry: true,
                path: '/ai'
            },
            'map': {
                singleEntry: true,
                path: '/map'
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
            },
            // 协同办公：单一入口
            'office': {
                singleEntry: true,
                path: '/office/list'
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

        // 检查是否有最大化窗口（从Store获取）
        const hasMaximized = Store.get('hasMaximizedWindow') || false;

        return `
            <div class="dock-container">
                <div class="dock ${hasMaximized ? 'auto-hide' : ''}">
                    <!-- 开始按钮 -->
                    <div class="dock-item" id="dock-launcher" title="开始">
                        <span class="dock-icon">${this._renderIcon('launcher', '🚀')}</span>
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
                        <span class="dock-icon">${this._renderIcon('market', '🏪')}</span>
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
                    <span class="dock-icon">${this._renderIcon(category.id, category.icon)}</span>
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
        this.setupAutoHideHotzone();
    }

    // 设置底部热区检测（解决最大化窗口时的 Dock 显示问题）
    setupAutoHideHotzone() {
        const HOTZONE_HEIGHT = 8; // 底部热区高度（像素）
        let hideTimeout = null;
        let isTriggered = false; // 是否已通过热区触发

        document.addEventListener('mousemove', (e) => {
            const dock = document.querySelector('.dock.auto-hide');
            if (!dock) return;

            const windowHeight = window.innerHeight;
            const isInHotzone = e.clientY >= windowHeight - HOTZONE_HEIGHT;
            const isHoveringDock = dock.classList.contains('show') && e.target.closest('.dock');

            // 只有在底部热区内才触发显示
            if (isInHotzone) {
                isTriggered = true;
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
                dock.classList.add('show');
            } else if (isTriggered && isHoveringDock) {
                // Dock 已显示且鼠标在 Dock 上，保持显示
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            } else {
                // 延迟隐藏 Dock
                if (dock.classList.contains('show') && !hideTimeout) {
                    hideTimeout = setTimeout(() => {
                        dock.classList.remove('show');
                        isTriggered = false;
                        hideTimeout = null;
                    }, 300);
                }
            }
        });

        // 鼠标离开窗口时隐藏
        document.addEventListener('mouseleave', () => {
            const dock = document.querySelector('.dock.auto-hide');
            if (dock) {
                dock.classList.remove('show');
                isTriggered = false;
            }
        });
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

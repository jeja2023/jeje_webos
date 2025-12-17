/**
 * 侧边栏组件
 */

class SidebarComponent extends Component {
    constructor(container) {
        super(container);
        this.state = {
            menus: Store.get('menus') || [],
            collapsed: Store.get('sidebarCollapsed'),
            currentPath: Store.get('currentRoute'),
            expandedMenus: {},      // 用户手动展开的菜单
            collapsedMenus: {}      // 用户手动折叠的菜单
        };

        // 监听菜单变化
        Store.subscribe('menus', (menus) => {
            this.setState({ menus });
        });

        // 监听路由变化
        Store.subscribe('currentRoute', (path) => {
            this.setState({ currentPath: path });
        });

        // 监听侧边栏状态
        Store.subscribe('sidebarCollapsed', (collapsed) => {
            this.setState({ collapsed });
        });
    }

    toggleMenu(menuId) {
        const expanded = { ...this.state.expandedMenus };
        const collapsed = { ...this.state.collapsedMenus };

        // 检查当前是否展开（包括手动展开或因活动子项自动展开）
        const isCurrentlyExpanded = expanded[menuId] || (!collapsed[menuId] && this.hasActiveChild(menuId));

        if (isCurrentlyExpanded) {
            // 折叠：标记为手动折叠
            delete expanded[menuId];
            collapsed[menuId] = true;
        } else {
            // 展开：移除手动折叠标记，标记为手动展开
            expanded[menuId] = true;
            delete collapsed[menuId];
        }

        this.setState({ expandedMenus: expanded, collapsedMenus: collapsed });
    }

    hasActiveChild(menuId) {
        // 根据 menuId 查找对应的菜单项，检查是否有活动子项
        const findMenu = (menus) => {
            for (const menu of menus) {
                const key = menu.module || menu.path || menu.title;
                if (key === menuId) return menu;
                if (menu.children) {
                    const found = findMenu(menu.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const menu = findMenu(this.getAllMenus());
        if (!menu || !menu.children) return false;

        return menu.children.some(child => {
            if (child.path && this.isActive(child.path)) return true;
            if (child.children) {
                return child.children.some(grand => grand.path && this.isActive(grand.path));
            }
            return false;
        });
    }

    getAllMenus() {
        const { menus } = this.state;
        const user = Store.get('user');
        const isSuperAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';

        const defaultMenus = [
            { module: 'dashboard', title: '仪表盘', icon: '📊', path: '/dashboard' }
        ];

        // 将模块菜单中"反馈"放到功能模块最下面，且排在"笔记"之后
        const orderedMenus = [...menus].sort((a, b) => {
            const rank = (m, idx) => {
                if (m?.module === 'feedback') return 10000; // 最底部
                if (m?.module === 'notes') return 9000;     // 保证在反馈之上
                return idx; // 其他保持原有顺序（相对稳定）
            };
            return rank(a, menus.indexOf(a)) - rank(b, menus.indexOf(b));
        });

        // 简化：返回完整菜单列表用于查找
        return [...defaultMenus, ...orderedMenus, ...this.getAdminMenus(isSuperAdmin, isManager)];
    }

    getAdminMenus(isSuperAdmin, isManager) {
        if (isSuperAdmin) {
            return [{
                module: 'system',
                title: '系统管理',
                icon: '🧰',
                children: [
                    {
                        title: '用户与权限',
                        icon: '👥',
                        children: [
                            { title: '用户列表', icon: '📋', path: '/users/list' },
                            { title: '待审核用户', icon: '⏳', path: '/users/pending' },
                            { title: '用户组', icon: '🛡️', path: '/system/roles' },
                        ]
                    },
                    {
                        title: '系统与运维',
                        icon: '🖥️',
                        children: [
                            { title: '系统设置', icon: '⚙️', path: '/system/settings' },
                            { title: '系统日志', icon: '📜', path: '/system/audit' },
                            { title: '系统监控', icon: '📈', path: '/system/monitor' },
                            { title: '数据备份', icon: '💾', path: '/system/backup' },
                            { title: '文件存储', icon: '📁', path: '/system/storage' },
                        ]
                    },
                    {
                        title: '通知与公告',
                        icon: '📬',
                        children: [
                            { title: '通知管理', icon: '🔔', path: '/notifications' },
                            { title: '公告管理', icon: '📢', path: '/announcement/list' },
                        ]
                    },

                    { title: '应用中心', icon: '🧩', path: '/system/apps' },
                ]
            }];
        }

        if (isManager) {
            return [{
                module: 'system',
                title: '系统管理',
                icon: '🧰',
                children: [
                    {
                        title: '用户与权限',
                        icon: '👥',
                        children: [
                            { title: '用户列表', icon: '📋', path: '/users/list' },
                            { title: '待审核用户', icon: '⏳', path: '/users/pending' },
                            { title: '用户组', icon: '🛡️', path: '/system/roles' },
                        ]
                    },
                    {
                        title: '通知与公告',
                        icon: '📬',
                        children: [
                            { title: '通知管理', icon: '🔔', path: '/notifications' },
                            { title: '公告管理', icon: '📢', path: '/announcement/list' },
                        ]
                    },
                    { title: '系统日志', icon: '📜', path: '/system/audit' },
                ]
            }];
        }

        return [];
    }

    isActive(path) {
        return this.state.currentPath === path ||
            this.state.currentPath?.startsWith(path + '/');
    }

    render() {
        const { collapsed, expandedMenus } = this.state;
        const allMenus = this.getAllMenus();

        return `
            <aside class="sidebar${collapsed ? ' collapsed' : ''}">
                <div class="sidebar-logo">
                    <span class="logo-icon">🌐</span>
                    <span class="logo-text">${Store.get('appName')}</span>
                </div>
                <nav class="nav-menu">
                    ${allMenus.map(menu => this.renderMenuItem(menu, expandedMenus)).join('')}
                </nav>
                <div class="sidebar-footer">
                    <a class="nav-item help-link${this.isActive('/help') ? ' active' : ''}" href="#/help">
                        <span class="nav-icon">📖</span>
                        <span class="nav-text">使用帮助</span>
                    </a>
                </div>
            </aside>
        `;
    }

    renderMenuItem(menu, expandedMenus) {
        const hasChildren = Array.isArray(menu.children) && menu.children.length > 0;
        const key = menu.module || menu.path || menu.title;
        const isActive = menu.path ? this.isActive(menu.path) : false;
        const { collapsedMenus } = this.state;

        if (hasChildren) {
            const hasActiveChild = menu.children.some(child => {
                if (child.path && this.isActive(child.path)) return true;
                if (child.children) {
                    return child.children.some(grand => grand.path && this.isActive(grand.path));
                }
                return false;
            });

            // 展开逻辑：用户手动展开 或 (有活动子项 且 用户未手动折叠)
            const isExpanded = expandedMenus[key] || (hasActiveChild && !collapsedMenus[key]);

            return `
                <div class="nav-item nav-parent${isExpanded ? ' expanded' : ''}" 
                     data-menu="${key}">
                    <span class="nav-icon">${menu.icon || '📄'}</span>
                    <span class="nav-text">${menu.title}</span>
                    <span class="nav-arrow">${isExpanded ? '▼' : '▶'}</span>
                </div>
                <div class="nav-submenu${isExpanded ? ' show' : ''}">
                    ${menu.children.map(child => this.renderMenuItem(child, expandedMenus)).join('')}
                </div>
            `;
        }

        return `
            <a class="nav-item${isActive ? ' active' : ''}" href="#${menu.path}">
                <span class="nav-icon">${menu.icon || '📄'}</span>
                <span class="nav-text">${menu.title}</span>
            </a>
        `;
    }

    afterMount() {
        this.bindEvents();

        // 确保使用最新的菜单数据
        const latestMenus = Store.get('menus') || [];
        if (latestMenus.length !== this.state.menus.length) {
            this.setState({ menus: latestMenus });
        }
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        // 每次更新都重新绑定事件（因为 DOM 可能重新渲染）
        this.container?.querySelectorAll('.nav-parent[data-menu]').forEach(item => {
            item.onclick = (e) => {
                e.preventDefault();
                const menuId = item.dataset.menu;
                this.toggleMenu(menuId);
            };
        });
    }
}



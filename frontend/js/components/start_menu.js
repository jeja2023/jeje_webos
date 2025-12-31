/**
 * 开始菜单组件
 * 动态显示已启用模块和用户权限对应的菜单
 */
class StartMenuComponent extends Component {
    constructor(container) {
        super(container);
        this.visible = false;

        // 展开/收起状态记录 - 默认全部折叠
        this.expanded = {};

        // 监听变化以刷新菜单
        const updateVisible = () => { if (this.visible) this.update(); };
        Store.subscribe('modules', updateVisible);
        Store.subscribe('pinnedApps', updateVisible);
        Store.subscribe('user', updateVisible);
    }

    // 动态构建菜单树
    buildMenuTree() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const modules = Store.get('modules') || [];

        const menuTree = [];

        // 1. 获取用户自定义快捷方式 (从 user.settings.start_menu_shortcuts)
        const allShortcuts = user?.settings?.start_menu_shortcuts || [];

        if (allShortcuts.length > 0) {
            allShortcuts.forEach(shortcut => {
                menuTree.push({
                    id: shortcut.id,
                    title: shortcut.name || shortcut.title,
                    icon: shortcut.icon || '🔗',
                    path: shortcut.path,
                    isShortcut: true,
                    type: shortcut.type
                });
            });

            if (menuTree.length > 0) {
                menuTree.push({ isSeparator: true });
            }
        }

        // 2. 获取 Dock 中已存在的应用 ID
        const dockPinnedApps = user?.settings?.dock_pinned_apps || [];
        const pinnedIds = new Set([...dockPinnedApps]);

        pinnedIds.add('message');
        pinnedIds.add('apps');
        if (isAdmin || isManager) {
            pinnedIds.add('announcement');
            pinnedIds.add('users');
        }
        if (isAdmin) {
            pinnedIds.add('system');
        }

        // 3. 遍历模块
        const menuConfigs = {
            'blog': '/blog/list',
            'notes': '/notes/list',
            'feedback': '/feedback/my'
        };

        for (const mod of modules) {
            if (!mod.enabled) continue;
            if (pinnedIds.has(mod.id)) continue;

            const targetPath = menuConfigs[mod.id];

            menuTree.push({
                id: mod.id,
                title: mod.name,
                icon: mod.icon || '📦',
                children: null,
                path: targetPath || (mod.menu?.path || `/${mod.id}`)
            });
        }

        // 系统内置应用
        const sysApps = [
            { id: 'filemanager', title: '文件管理', icon: '📂', path: '/filemanager' },
            { id: 'transfer', title: '快传', icon: '⚡', path: '/transfer' },
            { id: 'theme', title: '主题', icon: '🎨', path: '/theme/editor' }
        ];

        for (const app of sysApps) {
            if (!pinnedIds.has(app.id)) {
                menuTree.push(app);
            }
        }

        return menuTree;
    }

    // 获取应用对应的图标配置
    _getIconSpec(id, defaultIcon = '📦') {
        const iconMap = {
            'blog': { ri: 'ri-article-line' },
            'notes': { ri: 'ri-sticky-note-line' },
            'feedback': { ri: 'ri-feedback-line' },
            'announcement': { ri: 'ri-notification-3-line' },
            'users': { ri: 'ri-group-line' },
            'filemanager': { ri: 'ri-folder-5-line' },
            'analysis': { ri: 'ri-bar-chart-grouped-line' },
            'datalens': { ri: 'ri-database-2-line' },
            'monitor': { ri: 'ri-dashboard-2-line' },
            'system': { ri: 'ri-settings-4-line' },
            'backup': { ri: 'ri-history-line' },
            'theme_editor': { ri: 'ri-palette-line' },
            'transfer': { ri: 'ri-share-forward-line' },
            'message': { ri: 'ri-message-3-line' },
            'market': { ri: 'ri-store-2-line' },
            'theme': { ri: 'ri-palette-line' },
            'launcher': { ri: 'ri-rocket-2-line' }
        };

        return iconMap[id] || { ri: null, emoji: defaultIcon };
    }

    // 渲染图标 HTML
    _renderIcon(id, defaultIcon) {
        const spec = this._getIconSpec(id, defaultIcon);
        if (spec.ri) {
            return `<i class="${spec.ri}"></i>`;
        }
        return spec.emoji;
    }

    render() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        const renderItem = (item, level = 0, parentId = '') => {
            if (item.isSeparator) {
                return '<div class="menu-separator"></div>';
            }
            if (item.admin && !isAdmin) return '';

            const hasChildren = item.children && item.children.length > 0;
            const uniqueId = item.id || (parentId ? `${parentId}-${item.title}` : item.title);
            const isExpanded = this.expanded[uniqueId] === true;
            const indent = level * 16;
            const itemClass = `menu-item ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''} ${item.isShortcut ? 'menu-item-shortcut' : ''}`;

            return `
                <div class="menu-item-wrapper">
                    <div class="${itemClass}" 
                         data-id="${uniqueId}" 
                         ${item.path ? `data-path="${item.path}"` : ''}
                         style="padding-left: ${16 + indent}px">
                        <span class="menu-icon">${this._renderIcon(item.id, item.icon)}</span>
                        <span class="menu-title">${item.title}</span>
                         ${item.isShortcut ? '<span class="menu-badge"><i class="ri-pushpin-2-fill"></i></span>' : ''}
                        ${hasChildren ? `
                            <span class="menu-arrow"><i class="ri-arrow-down-s-line"></i></span>
                        ` : ''}
                    </div>
                    ${hasChildren ? `
                        <div class="menu-children ${isExpanded ? 'show' : ''}" id="children-${uniqueId}">
                            ${item.children.map(child => renderItem(child, level + 1, uniqueId)).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        };

        return `
            <div class="start-menu glass-panel ${this.visible ? 'visible' : ''}">
                <div class="start-menu-body custom-scrollbar">
                    ${this.buildMenuTree().map(item => renderItem(item)).join('')}
                </div>
            </div>
        `;
    }

    toggle() {
        this.visible = !this.visible;
        this.update();

        if (this.visible) {
            setTimeout(() => {
                document.addEventListener('click', this.handleOutsideClick);
            }, 0);
        } else {
            document.removeEventListener('click', this.handleOutsideClick);
        }
    }

    show() {
        this.visible = true;
        this.update();
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 0);
    }

    hide() {
        this.visible = false;
        this.update();
        document.removeEventListener('click', this.handleOutsideClick);
    }

    handleOutsideClick = (e) => {
        if (e.target.closest('#dock-launcher')) return;
        if (this.container && !this.container.contains(e.target)) {
            this.hide();
        }
    }

    bindEvents() {
        this.delegate('click', '.menu-item', (e, el) => {
            e.stopPropagation();
            const path = el.dataset.path;
            const id = el.dataset.id;

            if (path) {
                Router.push(path);
                this.hide();
            } else {
                const childrenContainer = this.container.querySelector(`#children-${id}`);
                if (childrenContainer) {
                    const isExpanded = el.classList.contains('expanded');
                    if (isExpanded) {
                        el.classList.remove('expanded');
                        childrenContainer.classList.remove('show');
                        this.expanded[id] = false;
                    } else {
                        el.classList.add('expanded');
                        childrenContainer.classList.add('show');
                        this.expanded[id] = true;
                    }
                }
            }
        });

        this.delegate('click', '#menuLogoutBtn', () => {
            Store.clearAuth();
            Toast.success('已安全退出');
            Router.push('/login');
        });

        this.delegate('click', '[data-path]', (e, el) => {
            const path = el.dataset.path;
            if (path) {
                Router.push(path);
                this.hide();
            }
        });
    }

    afterMount() {
        this.bindEvents();
    }

    update() {
        if (!this.container) return;
        this.container.innerHTML = this.render();
    }
}

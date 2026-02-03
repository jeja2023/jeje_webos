/**
 * 开始菜单组件
 * 动态显示已启用模块和用户权限对应的菜单
 * 
 * 菜单结构：
 * 1. 快捷方式分组 - 用户自定义的快捷方式
 * 2. 应用分组 - 已启用的模块应用（排除 Dock 固定项）
 * 3. 系统工具分组 - 系统内置应用（排除 Dock 固定项）
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

    /**
     * 获取 Dock 中已固定的应用 ID 集合
     * 这些应用不会在开始菜单中显示
     */
    _getPinnedAppIds() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const dockPinnedApps = user?.settings?.dock_pinned_apps || [];
        const pinnedIds = new Set([...dockPinnedApps]);

        // 默认固定在 Dock 的应用
        pinnedIds.add('message');
        pinnedIds.add('apps');

        // 管理员/经理固定在 Dock 的应用
        if (isAdmin || isManager) {
            pinnedIds.add('announcement');
            pinnedIds.add('users');
        }

        // 管理员固定在 Dock 的应用
        if (isAdmin) {
            pinnedIds.add('system');
        }

        return pinnedIds;
    }

    /**
     * 从模块配置中获取菜单路径
     * 优先级：模块配置的 menu.path > 默认路径 /{moduleId}
     */
    _getModulePath(module) {
        // 优先使用模块配置中的路径
        if (module.menu?.path) {
            return module.menu.path;
        }

        // 如果没有配置，使用默认路径
        return `/${module.id}`;
    }

    /**
     * 动态构建菜单树（带分组）
     */
    buildMenuTree() {
        const user = Store.get('user');
        const modules = Store.get('modules') || [];
        const pinnedIds = this._getPinnedAppIds();

        const menuTree = [];
        let hasShortcuts = false;
        let hasApps = false;
        let hasSystemTools = false;

        // ========== 1. 快捷方式分组 ==========
        const allShortcuts = user?.settings?.start_menu_shortcuts || [];
        if (allShortcuts.length > 0) {
            menuTree.push({ isGroupHeader: true, title: '快捷方式' });
            allShortcuts.forEach(shortcut => {
                menuTree.push({
                    id: shortcut.id,
                    title: shortcut.name || shortcut.title,
                    icon: shortcut.icon || 'ri-link',
                    path: shortcut.path,
                    isShortcut: true,
                    type: shortcut.type
                });
            });
            hasShortcuts = true;
        }

        // ========== 2. 应用分组 - 已启用的模块 ==========
        const appItems = [];
        for (const mod of modules) {
            if (!mod.enabled) continue;
            // if (pinnedIds.has(mod.id)) continue; // 允许在开始菜单显示已固定的应用

            appItems.push({
                id: mod.id,
                title: mod.name,
                icon: mod.icon || 'ri-apps-line',
                path: this._getModulePath(mod)
            });
        }

        if (appItems.length > 0) {
            if (hasShortcuts) {
                menuTree.push({ isSeparator: true });
            }
            menuTree.push({ isGroupHeader: true, title: '应用' });
            menuTree.push(...appItems);
            hasApps = true;
        }

        // ========== 3. 系统工具分组 - 系统内置应用 ==========
        const systemApps = [
            { id: 'filemanager', title: '文件管理', icon: 'ri-folder-5-line', path: '/filemanager' },
            { id: 'transfer', title: '快传', icon: 'ri-share-forward-line', path: '/transfer' }
        ];

        const systemItems = systemApps.filter(app => !pinnedIds.has(app.id));

        if (systemItems.length > 0) {
            if (hasShortcuts || hasApps) {
                menuTree.push({ isSeparator: true });
            }
            menuTree.push({ isGroupHeader: true, title: '系统工具' });
            menuTree.push(...systemItems);
            hasSystemTools = true;
        }

        // 如果没有任何菜单项，返回空数组
        if (!hasShortcuts && !hasApps && !hasSystemTools) {
            return [];
        }

        return menuTree;
    }

    // 获取应用对应的图标配置
    _getIconSpec(id, defaultIcon = 'ri-apps-line') {
        const iconMap = {
            'blog': { ri: 'ri-article-line' },
            'knowledge': { ri: 'ri-book-read-line' },
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
            'launcher': { ri: 'ri-rocket-2-line' },
            'ai': { ri: 'ri-brain-line' },
            'map': { ri: 'ri-map-2-line' },
            'im': { ri: 'ri-message-3-line' },

            'album': { ri: 'ri-image-2-line' },
            'video': { ri: 'ri-video-line' },
            'exam': { ri: 'ri-file-list-3-line' },
            'ocr': { ri: 'ri-scan-2-line' },
            'course': { ri: 'ri-book-open-line' },
            'schedule': { ri: 'ri-calendar-schedule-line' },
            'vault': { ri: 'ri-shield-keyhole-line' },
            'pdf': { ri: 'ri-file-pdf-2-fill' },
            'markdown': { ri: 'ri-markdown-line' },
            'lm_cleaner': { ri: 'ri-magic-line' }
        };

        return iconMap[id] || { ri: null, emoji: defaultIcon };
    }

    // 渲染图标 HTML
    _renderIcon(id, defaultIcon) {
        const spec = this._getIconSpec(id, defaultIcon);
        if (spec.ri) {
            return `<i class="${spec.ri}"></i>`;
        }
        // 如果是 RI class
        if (spec.emoji && spec.emoji.startsWith('ri-')) {
            return `<i class="${spec.emoji}"></i>`;
        }
        return spec.emoji;
    }

    /**
     * 渲染菜单项
     */
    render() {
        const menuTree = this.buildMenuTree();

        const renderItem = (item) => {
            // 分隔符
            if (item.isSeparator) {
                return '<div class="menu-separator"></div>';
            }

            // 分组标题
            if (item.isGroupHeader) {
                return `<div class="menu-group-header">${item.title}</div>`;
            }

            // 普通菜单项
            const uniqueId = item.id || `item-${item.title}`;
            const itemClass = `menu-item ${item.isShortcut ? 'menu-item-shortcut' : ''}`;

            return `
                <div class="menu-item-wrapper">
                    <div class="${itemClass}" 
                         data-id="${uniqueId}" 
                         ${item.path ? `data-path="${item.path}"` : ''}>
                        <span class="menu-icon">${this._renderIcon(item.id, item.icon)}</span>
                        <span class="menu-title">${item.title}</span>
                        ${item.isShortcut ? '<span class="menu-badge"><i class="ri-pushpin-2-fill"></i></span>' : ''}
                    </div>
                </div>
            `;
        };

        // 空状态
        if (menuTree.length === 0) {
            return `
                <div class="start-menu glass-panel ${this.visible ? 'visible' : ''}">
                    <div class="start-menu-body custom-scrollbar">
                        <div class="menu-empty-state">
                            <div class="menu-empty-icon"><i class="ri-clipboard-line"></i></div>
                            <div class="menu-empty-text">暂无可用应用</div>
                            <div class="menu-empty-hint">所有应用已固定在 Dock</div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="start-menu glass-panel ${this.visible ? 'visible' : ''}">
                <div class="start-menu-body custom-scrollbar">
                    ${menuTree.map(item => renderItem(item)).join('')}
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

    /**
     * 绑定事件处理
     * 优化：统一使用 .menu-item 选择器，避免重复绑定
     */
    bindEvents() {
        // 统一处理菜单项点击事件
        this.delegate('click', '.menu-item', (e, el) => {
            e.stopPropagation();
            const path = el.dataset.path;

            // 如果有路径，跳转并关闭菜单
            if (path) {
                Router.push(path);
                this.hide();
            }
        });

        // 处理退出登录按钮（如果存在）
        this.delegate('click', '#menuLogoutBtn', () => {
            Store.clearAuth();
            Toast.success('已安全退出');
            Router.push('/login');
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

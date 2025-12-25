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
        const shortcuts = user?.settings?.start_menu_shortcuts || [];

        // 兼容 DataLens 保存到 localStorage 的快捷方式
        const savedPinned = localStorage.getItem('jeje_pinned_apps');
        const localPinned = savedPinned ? JSON.parse(savedPinned) : [];
        const localShortcuts = localPinned.filter(app => typeof app === 'object' && app.id);

        // 合并远程和本地快捷方式 (优先以本地为准实时更新)
        const allShortcuts = [...shortcuts];
        localShortcuts.forEach(ls => {
            if (!allShortcuts.some(s => s.id === ls.id)) {
                allShortcuts.push(ls);
            }
        });

        if (allShortcuts.length > 0) {
            // 添加快捷方式
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

            // 添加分隔线
            if (menuTree.length > 0) {
                menuTree.push({ isSeparator: true });
            }
        }

        // 2. 获取 Dock 中已存在的应用 ID (字符串)，用于过滤
        const dockPinnedApps = user?.settings?.dock_pinned_apps || [];
        // 过滤出 localPinned 中的字符串 ID
        const localPinnedIds = localPinned.filter(app => typeof app === 'string');
        const pinnedIds = new Set([...dockPinnedApps, ...localPinnedIds]);

        // 添加 Dock 上硬编码的系统应用 ID，也要过滤
        pinnedIds.add('message'); // 信息
        pinnedIds.add('apps');    // 应用中心
        if (isAdmin || isManager) {
            pinnedIds.add('announcement'); // 公告管理 (Dock id: sys_announcement)
            pinnedIds.add('users');        // 用户管理 (Dock id: sys_users)
        }
        if (isAdmin) {
            pinnedIds.add('system');       // 系统管理 (Dock id: sys_ops)
        }

        // 3. 遍历模块和系统应用，过滤掉已在 Dock 的

        // 预定义的菜单配置
        const menuConfigs = {
            'blog': '/blog/list',
            'notes': '/notes/list',
            'feedback': '/feedback/my'
        };

        // 模块应用
        for (const mod of modules) {
            if (!mod.enabled) continue;
            if (pinnedIds.has(mod.id)) continue; // 如果在 Dock 上则跳过

            const targetPath = menuConfigs[mod.id];

            menuTree.push({
                id: mod.id,
                title: mod.name,
                icon: mod.icon || '📦',
                children: null,
                path: targetPath || (mod.menu?.path || `/${mod.id}`)
            });
        }

        // 系统内置应用（检查是否被过滤）
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

        // 如果 Dock 上没有固定这些管理应用，则在开始菜单显示
        // 注意：Dock 逻辑是 isAdmin/Manager 就会显示，所以只要用户是管理员，Dock 上一定有。
        // 但如果用户手动取消固定（目前 Dock 逻辑是硬编码的，无法取消固定系统区），
        // 所以这里只要判断权限即可，如果没权限自然看不到，有权限 Dock 上有，所以也不用显示。
        // 为了保险，还是保留基础逻辑，万一 Dock 逻辑变了。
        // 但是根据 User Requirement: "Remove same functional menus as Dock"
        // 管理员的“系统管理”、“用户管理”在 Dock 上都有，所以这里应该都不显示。

        return menuTree;
    }

    // 获取固定的应用
    getPinnedApps() {
        try {
            const saved = localStorage.getItem('jeje_pinned_apps');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    render() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        const renderItem = (item, level = 0, parentId = '') => {
            // 分隔符处理
            if (item.isSeparator) {
                return '<div class="menu-separator"></div>';
            }

            // 权限过滤
            if (item.admin && !isAdmin) return '';

            const hasChildren = item.children && item.children.length > 0;
            const uniqueId = item.id || (parentId ? `${parentId}-${item.title}` : item.title);
            const isExpanded = this.expanded[uniqueId] === true;

            const indent = level * 16;

            // 快捷方式特殊标记
            const itemClass = `menu-item ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''} ${item.isShortcut ? 'menu-item-shortcut' : ''}`;

            let html = `
                <div class="menu-item-wrapper">
                    <div class="${itemClass}" 
                         data-id="${uniqueId}" 
                         ${item.path ? `data-path="${item.path}"` : ''}
                         style="padding-left: ${16 + indent}px">
                        <span class="menu-icon">${item.emoji || item.icon}</span>
                        <span class="menu-title">${item.title}</span>
                         ${item.isShortcut ? '<span class="menu-badge">📌</span>' : ''}
                        ${hasChildren ? `
                            <span class="menu-arrow">▼</span>
                        ` : ''}
                    </div>
                    ${hasChildren ? `
                        <div class="menu-children ${isExpanded ? 'show' : ''}" id="children-${uniqueId}">
                            ${item.children.map(child => renderItem(child, level + 1, uniqueId)).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            return html;
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
            // 点击外部关闭
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
        // 如果点击的是 Dock 上的触发按钮，忽略（由 Dock 处理 toggling）
        if (e.target.closest('#dock-launcher')) return;

        if (this.container && !this.container.contains(e.target)) {
            this.hide();
        }
    }

    bindEvents() {
        // 菜单项点击
        this.delegate('click', '.menu-item', (e, el) => {
            e.stopPropagation();
            const path = el.dataset.path;
            const id = el.dataset.id;

            if (path) {
                // 如果有路径，跳转并关闭菜单
                Router.push(path);
                this.hide();
            } else {
                // 如果没有路径（或者是父级菜单），切换展开/收起
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

        // 底部按钮
        this.delegate('click', '#menuLogoutBtn', () => {
            // 调用 TopBar 中已有的登出逻辑，或者触发全局登出
            // 这里我们可以触发一个自定义事件或者直接调用 Store/Router
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
        // 初始不绑定 outside click，只在 show 时绑定
        this.bindEvents();
    }

    // 覆盖 update 方法以保留事件绑定
    update() {
        if (!this.container) return;
        this.container.innerHTML = this.render();
        // 重新绑定内部事件（因为 innerHTML 重置了 DOM）
        // 避免重复绑定 document 级的事件
    }
}

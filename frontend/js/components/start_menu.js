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

        // 监听模块变化
        Store.subscribe('modules', () => {
            if (this.visible) this.update();
        });
    }

    // 动态构建菜单树 - 直接显示所有已启用的应用
    buildMenuTree() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const modules = Store.get('modules') || [];

        const menuTree = [];

        // 仪表盘已移除，登录后直接显示桌面

        // 预定义的菜单配置
        const menuConfigs = {
            'blog': [
                { title: '文章列表', icon: '📄', path: '/blog/list' },
                { title: '发布文章', icon: '✏️', path: '/blog/edit' },
                { title: '分类管理', icon: '📁', path: '/blog/category' }
            ],
            'notes': [
                { title: '所有笔记', icon: '📋', path: '/notes/list' },
                { title: '我的收藏', icon: '⭐', path: '/notes/starred' },
                { title: '标签管理', icon: '🏷️', path: '/notes/tags' }
            ],
            'feedback': () => {
                const items = [
                    { title: '我的反馈', icon: '📨', path: '/feedback/my' },
                    { title: '提交反馈', icon: '➕', path: '/feedback/create' }
                ];
                if (isAdmin || isManager) {
                    items.push({ title: '反馈管理', icon: '🗂️', path: '/feedback/list' });
                }
                return items;
            }
        };

        // 遍历所有已启用的模块，直接显示
        for (const mod of modules) {
            if (!mod.enabled) continue;

            const config = menuConfigs[mod.id];
            let children = null;

            if (typeof config === 'function') {
                children = config();
            } else if (config) {
                children = config;
            } else if (mod.menu && mod.menu.children) {
                children = mod.menu.children;
            }

            menuTree.push({
                id: mod.id,
                title: mod.name,
                icon: mod.icon || '📦',
                children: children,
                path: children ? null : (mod.menu?.path || `/${mod.id}`)
            });
        }

        // 文件存储（所有人可见，直接进入）
        menuTree.push({
            id: 'storage',
            title: '文件存储',
            icon: '📂',
            path: '/storage/list'
        });

        // 信息（所有人可见，直接进入通知列表）
        menuTree.push({
            id: 'message',
            title: '信息',
            icon: '✉️',
            path: '/message/list'
        });

        // 个性化
        menuTree.push({
            id: 'theme',
            title: '主题美化',
            icon: '🎨',
            path: '/theme/editor'
        });

        // 公告（仅管理员/经理可见）
        if (isAdmin || isManager) {
            menuTree.push({
                id: 'announcement',
                title: '公告',
                icon: '📢',
                children: [
                    { title: '公告管理', icon: '📋', path: '/announcement/list' },
                    { title: '发布公告', icon: '✏️', path: '/announcement/edit' }
                ]
            });
        }

        // 系统管理（管理员/经理可见）
        if (isAdmin || isManager) {
            const sysChildren = [];

            // 用户管理
            const userChildren = [
                { title: '用户列表', icon: '📄', path: '/users/list' },
                { title: '待审核用户', icon: '⏳', path: '/users/pending' }
            ];
            if (isAdmin) {
                userChildren.push({ title: '用户组', icon: '🛡️', path: '/system/roles' });
            }
            sysChildren.push({ title: '用户管理', icon: '👥', children: userChildren });

            // 系统运维（仅管理员）
            if (isAdmin) {
                sysChildren.push({
                    title: '系统运维',
                    icon: '🖥️',
                    children: [
                        { title: '系统设置', icon: '⚙️', path: '/system/settings' },
                        { title: '系统日志', icon: '📜', path: '/system/audit' },
                        { title: '系统监控', icon: '📈', path: '/system/monitor' },
                        { title: '数据备份', icon: '💾', path: '/system/backup' }
                    ]
                });
            }

            menuTree.push({
                id: 'system',
                title: '系统管理',
                icon: '💼',
                children: sysChildren
            });
        }

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
            // 权限过滤
            if (item.admin && !isAdmin) return '';

            const hasChildren = item.children && item.children.length > 0;
            // 对于顶级菜单使用 item.id，对于子级菜单使用 parentId-title 格式
            const uniqueId = item.id || (parentId ? `${parentId}-${item.title}` : item.title);
            // 只有明确在 expanded 中标记为 true 的才展开，否则默认折叠
            const isExpanded = this.expanded[uniqueId] === true;

            const indent = level * 16;

            let html = `
                <div class="menu-item-wrapper">
                    <div class="menu-item ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''}" 
                         data-id="${uniqueId}" 
                         ${item.path ? `data-path="${item.path}"` : ''}
                         style="padding-left: ${16 + indent}px">
                        <span class="menu-icon">${item.emoji || item.icon}</span>
                        <span class="menu-title">${item.title}</span>
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

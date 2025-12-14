/**
 * 顶栏组件
 */

class HeaderComponent extends Component {
    constructor(container) {
        super(container);
        this.state = {
            user: Store.get('user'),
            breadcrumb: [],
            unreadCount: Store.get('unreadNotifications') || 0
        };

        // Portal 菜单引用
        this.portalMenu = null;
        this.closeHandler = null;

        // 监听用户状态变�?        Store.subscribe('auth', (auth) => {
            this.setState({ user: auth?.user || Store.get('user') });
        });

        // 监听未读通知数变�?        Store.subscribe('unreadNotifications', (count) => {
            this.setState({ unreadCount: count || 0 });
        });

        // 加载未读通知�?        this.loadUnreadCount();
    }

    async loadUnreadCount() {
        try {
            const res = await MessageApi.unreadCount();
            const count = res.data?.count || res.count || 0;
            Store.set('unreadNotifications', count);
        } catch (e) {
            // 忽略错误
        }
    }

    setBreadcrumb(items) {
        this.setState({ breadcrumb: items });
    }

    render() {
        const { user, breadcrumb, unreadCount } = this.state;
        const initial = user?.nickname?.charAt(0) || user?.username?.charAt(0) || '?';
        const theme = Store.get('theme') || 'auto';

        return `
            <header class="header">
                <div class="header-left">
                    <button class="toggle-btn" id="toggleSidebar">
                        �?                    </button>
                    <div class="breadcrumb">
                        ${breadcrumb.map((item, i) => `
                            <span>${item}</span>
                            ${i < breadcrumb.length - 1 ? '<span>/</span>' : ''}
                        `).join('')}
                    </div>
                </div>
                <div class="header-right">
                    <div class="theme-switcher">
                        <select id="themeSelect" class="form-input form-select" style="min-width: 120px;">
                            <option value="auto" ${theme === 'auto' ? 'selected' : ''}>跟随系统</option>
                            <option value="light" ${theme === 'light' ? 'selected' : ''}>浅色</option>
                            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>深色</option>
                        </select>
                    </div>
                    ${user ? `
                        <div class="notification-bell" id="notificationBell" title="通知">
                            🔔
                            ${unreadCount > 0 ? `<span class="notification-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
                        </div>
                        <div class="user-dropdown">
                            <div class="user-info" id="userMenuToggle">
                                <div class="user-avatar">${initial}</div>
                                <span class="user-name">${Utils.escapeHtml(user.nickname || user.username)}</span>
                                <span class="dropdown-arrow">�?/span>
                            </div>
                            <div class="user-dropdown-menu" id="userDropdownMenu">
                                <div class="dropdown-item" data-action="profile">
                                    <span class="dropdown-icon">👤</span>
                                    <span>个人中心</span>
                                </div>
                                <div class="dropdown-divider"></div>
                                <div class="dropdown-item dropdown-item-danger" data-action="logout">
                                    <span class="dropdown-icon">🚪</span>
                                    <span>退出登�?/span>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <button class="btn btn-primary btn-sm" onclick="Router.push('/login')">登录</button>
                    `}
                </div>
            </header>
        `;
    }

    afterMount() {
        this.bindEvents();
        // 启动轮询，每30秒检查一次未读消�?        this.stopPolling();
        this._pollTimer = setInterval(() => this.loadUnreadCount(), 30000);
    }

    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    destroy() {
        this.stopPolling();
        super.destroy();
    }

    afterUpdate() {
        // 更新 portal 菜单内容
        if (this.portalMenu) {
            const userDropdownMenu = this.$('#userDropdownMenu');
            if (userDropdownMenu && userDropdownMenu.parentElement) {
                this.portalMenu.innerHTML = userDropdownMenu.innerHTML;
                // 重新绑定 portal 菜单的事�?                this.bindPortalMenuEvents();
            }
        }
        this.bindEvents();
    }

    bindEvents() {
        // 侧边栏切�?        const toggleBtn = this.$('#toggleSidebar');
        if (toggleBtn && !toggleBtn._bindedHeader) {
            toggleBtn._bindedHeader = true;
            toggleBtn.addEventListener('click', () => {
                Store.toggleSidebar();
                const sidebar = document.querySelector('.sidebar');
                sidebar?.classList.toggle('collapsed', Store.get('sidebarCollapsed'));
            });
        }

        // 用户下拉菜单 - 使用 Portal 模式避免 z-index 问题
        const userMenuToggle = this.$('#userMenuToggle');
        const userDropdownMenu = this.$('#userDropdownMenu');

        if (userMenuToggle && userDropdownMenu && !userMenuToggle._bindedHeader) {
            userMenuToggle._bindedHeader = true;

            // 创建或获�?portal 菜单
            const portalId = 'userDropdownMenu-portal';
            if (!this.portalMenu) {
                this.portalMenu = document.getElementById(portalId);
                if (!this.portalMenu) {
                    this.portalMenu = document.createElement('div');
                    this.portalMenu.id = portalId;
                    document.body.appendChild(this.portalMenu);
                }
            }

            // 更新 portal 菜单内容
            this.portalMenu.innerHTML = userDropdownMenu.innerHTML;

            // 绑定切换菜单事件
            userMenuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShow = !this.portalMenu.classList.contains('show');

                if (isShow) {
                    const rect = userMenuToggle.getBoundingClientRect();
                    // 设置位置并显�?                    this.portalMenu.style.top = (rect.bottom + 8) + 'px';
                    this.portalMenu.style.right = (window.innerWidth - rect.right) + 'px';
                    this.portalMenu.classList.add('show');
                } else {
                    this.portalMenu.classList.remove('show');
                }
            });

            // 绑定点击外部关闭菜单事件（只绑定一次）
            if (!this.closeHandler) {
                this.closeHandler = (e) => {
                    if (this.portalMenu && this.portalMenu.classList.contains('show')) {
                        if (!e.target.closest(`#${portalId}`) && !e.target.closest('#userMenuToggle')) {
                            this.portalMenu.classList.remove('show');
                        }
                    }
                };
                document.addEventListener('click', this.closeHandler);
            }

            // 绑定 portal 菜单项点击事�?            this.bindPortalMenuEvents();
        }

        // 主题切换
        const themeSelect = this.$('#themeSelect');
        if (themeSelect && !themeSelect._bindedHeader) {
            themeSelect._bindedHeader = true;
            themeSelect.addEventListener('change', (e) => {
                Store.setTheme(e.target.value);
            });
        }

        // 通知铃铛
        const notifBell = this.$('#notificationBell');
        if (notifBell && !notifBell._bindedHeader) {
            notifBell._bindedHeader = true;
            notifBell.addEventListener('click', () => {
                Router.push('/notifications');
            });
        }
    }

    bindPortalMenuEvents() {
        if (!this.portalMenu) return;

        // 使用事件委托，避免重复绑�?        if (!this.portalMenu._eventsBinded) {
            this.portalMenu._eventsBinded = true;

            // 绑定下拉菜单项点击事�?            this.portalMenu.addEventListener('click', async (e) => {
                const item = e.target.closest('.dropdown-item[data-action]');
                if (item) {
                    e.stopPropagation();
                    this.portalMenu.classList.remove('show');

                    const action = item.dataset.action;
                    switch (action) {
                        case 'profile':
                            Router.push('/profile');
                            break;
                        case 'logout':
                            Modal.confirm('退出登�?, '确定要退出登录吗�?, async () => {
                                try {
                                    await AuthApi.logout();
                                } catch (e) { }
                                Store.clearAuth();
                                Router.push('/login');
                                Toast.success('已退出登�?);
                            });
                            break;
                    }
                }
            });
        }
    }
}




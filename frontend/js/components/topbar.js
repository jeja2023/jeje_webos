/**
 * Top Bar Component
 */
class TopBarComponent extends Component {
    constructor(container) {
        super(container);
        this.state = {
            time: this.getCurrentTime(),
            user: Store.get('user') || { nickname: 'Guest', username: 'guest' },
            unreadMessages: Store.get('unreadMessages') || 0,
            hideTime: false,

            // 消息中心状态
            msgActiveTab: 'message', // message, announcement, todo
            msgList: [],
            msgLoading: false,
            todoCount: 0
        };

        // 每分钟更新一次时间
        setInterval(() => {
            this.setState({ time: this.getCurrentTime() });
        }, 60000);

        // 监听用户变更
        Store.subscribe('user', (user) => {
            this.setState({ user });
            this.checkTodoCount();
        });

        // 监听未读消息变更
        Store.subscribe('unreadMessages', (count) => {
            this.setState({ unreadMessages: count || 0 });
        });

        // 初始加载待办数量
        this.checkTodoCount();
    }

    async checkTodoCount() {
        const user = this.state.user;
        if (user.role === 'admin' || user.role === 'manager') {
            try {
                // 如果有获取待审核数量的接口
                const res = await UserApi.getPendingUsers().catch(() => ({ data: [] }));
                const count = Array.isArray(res.data) ? res.data.length : 0;
                this.setState({ todoCount: count });
            } catch (e) {
                // ignore
            }
        }
    }

    getCurrentTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}年${month}月${date}日 ${weekDay} ${hours}:${minutes}`;
    }

    async loadMessageData(tab) {
        const contentList = this.container?.querySelector('.msg-content-list');
        const viewAllBtn = this.container?.querySelector('#viewAllBtn');
        if (!contentList) return;

        // Show Loading
        contentList.innerHTML = '<div class="loading-spinner"></div>';

        try {
            let list = [];
            if (tab === 'message') {
                const res = await MessageApi.list({ page: 1, size: 5 });
                list = res.data.items || [];
                if (viewAllBtn) viewAllBtn.onclick = () => Router.push('/message/list');
            } else if (tab === 'announcement') {
                const res = await AnnouncementApi.getPublished(5);
                list = res.data || [];
                // 普通用户没有list页，管理员有
                const isAdmin = this.state.user.role === 'admin' || this.state.user.role === 'manager';
                if (viewAllBtn) {
                    viewAllBtn.onclick = isAdmin ? () => Router.push('/announcement/list') : null;
                    viewAllBtn.style.display = isAdmin ? 'block' : 'none';
                }
            } else if (tab === 'todo') {
                const res = await UserApi.getPendingUsers();
                list = res.data || [];
                if (viewAllBtn) {
                    viewAllBtn.onclick = () => Router.push('/users/pending');
                    viewAllBtn.style.display = 'block';
                }
            }

            if (list.length === 0) {
                contentList.innerHTML = '<div class="empty-text">暂无内容</div>';
            } else {
                contentList.innerHTML = list.map(item => this.renderListItem(item, tab)).join('');
            }
        } catch (e) {
            contentList.innerHTML = '<div class="empty-text">加载失败</div>';
        }
    }

    render() {
        const { time, user, msgActiveTab, msgList, msgLoading, unreadMessages, todoCount } = this.state;

        // 计算总徽章数 (消息 + 待办)
        // 公告未读数暂时无法获取，忽略
        const totalBadge = unreadMessages + todoCount;

        return `
            <div class="top-bar ${this.state.hideTime ? 'hide-time' : ''}">
                <div class="top-bar-left">
                     <!-- Brand Title -->
                    <div class="status-pill" style="border:none; background:none; box-shadow:none; padding:0; height:auto;">
                        <span class="brand-title">JeJe WebOS</span>
                    </div>
                </div>

                <div class="top-bar-right">
                    <!-- 胶囊 3: 时间 -->
                    <div class="status-pill time-pill">
                        <span>${time}</span>
                    </div>
                    
                    <!-- 胶囊 2: 消息中心 -->
                    <div class="status-pill icon-pill" id="messageBtn" title="系统消息">
                        <span class="status-icon">🔔</span>
                        ${totalBadge > 0 ? `
                            <span class="notification-badge">
                                ${totalBadge > 99 ? '99+' : totalBadge}
                            </span>
                        ` : ''}

                        <!-- 下拉面板 -->
                        <div class="user-menu-dropdown message-dropdown" id="messageDropdown" style="width: 320px; right: -60px;">
                            <div class="msg-tabs">
                                <div class="msg-tab ${msgActiveTab === 'message' ? 'active' : ''}" data-tab="message">
                                    消息 ${unreadMessages > 0 ? `<span class="badge-dot"></span>` : ''}
                                </div>
                                <div class="msg-tab ${msgActiveTab === 'announcement' ? 'active' : ''}" data-tab="announcement">
                                    公告
                                </div>
                                ${(user.role === 'admin' || user.role === 'manager') ? `
                                    <div class="msg-tab ${msgActiveTab === 'todo' ? 'active' : ''}" data-tab="todo">
                                        待办 ${todoCount > 0 ? `<span class="badge-dot"></span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                            
                            <div class="msg-content-list">
                                ${msgLoading ? '<div class="loading-spinner"></div>' :
                msgList.length === 0 ? '<div class="empty-text">暂无新消息</div>' :
                    msgList.map(item => this.renderListItem(item, msgActiveTab)).join('')
            }
                            </div>
                            
                            <div class="msg-footer" id="viewAllBtn">
                                查看全部
                            </div>
                        </div>
                    </div>

                    <!-- 胶囊 1: 用户 -->
                    <div class="status-pill user-pill" id="userPillToggle">
                        <div class="user-avatar">
                            ${(user.nickname || user.username || 'U')[0].toUpperCase()}
                        </div>
                        <span class="user-name-text">${Utils.escapeHtml(user.nickname || user.username)}</span>

                        <!-- Dropdown Menu -->
                        <div class="user-menu-dropdown" id="userMenuDropdown">
                            <div class="menu-header">
                                <div class="menu-user-name">${Utils.escapeHtml(user.nickname || user.username)}</div>
                                <div class="menu-user-role">${user.role === 'admin' ? '系统管理员' : '普通用户'}</div>
                            </div>
                            <div class="menu-item" onclick="Router.push('/profile')">👤 个人中心</div>
                            ${user.role === 'admin' ? `<div class="menu-item" onclick="Router.push('/system/settings')">⚙️ 系统设置</div>` : ''}
                            <div class="menu-item" onclick="Router.push('/help')">❓ 帮助中心</div>
                            <div class="menu-divider"></div>
                            <div class="menu-item danger" id="btnLogout">🚪 退出登录</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderListItem(item, tab) {
        if (tab === 'message') {
            return `
                <div class="msg-item ${item.is_read ? '' : 'unread'}" onclick="Router.push('/message/list')">
                    <div class="msg-icon">✉️</div>
                    <div class="msg-body">
                        <div class="msg-title">${Utils.escapeHtml(item.title)}</div>
                        <div class="msg-time">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                </div>
            `;
        } else if (tab === 'announcement') {
            return `
                <div class="msg-item" onclick="Router.push('/announcement/view/${item.id}')">
                    <div class="msg-icon">📢</div>
                    <div class="msg-body">
                        <div class="msg-title">${Utils.escapeHtml(item.title)}</div>
                        <div class="msg-time">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                </div>
            `;
        } else if (tab === 'todo') {
            return `
                <div class="msg-item" onclick="Router.push('/users/pending')">
                    <div class="msg-icon">👤</div>
                    <div class="msg-body">
                        <div class="msg-title">新用户注册: ${Utils.escapeHtml(item.username)}</div>
                        <div class="msg-time">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                </div>
            `;
        }
        return '';
    }

    mount() {
        super.mount();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    destroy() {
        this.unbindEvents();
        super.destroy();
    }

    unbindEvents() {
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
            this._docClickHandler = null;
        }
    }

    bindEvents() {
        this.unbindEvents();

        if (this.container) {
            // 消息按钮
            const messageBtn = this.container.querySelector('#messageBtn');
            const messageDropdown = this.container.querySelector('#messageDropdown');

            if (messageBtn && messageDropdown) {
                messageBtn.onclick = (e) => {
                    // 如果点击的是内部元素（如Tab），不要切换显示状态
                    if (e.target.closest('.msg-tab') || e.target.closest('.msg-item') || e.target.closest('.msg-footer')) {
                        return;
                    }
                    e.stopPropagation();
                    const isShowing = messageDropdown.classList.contains('show');

                    // 关闭其他
                    this.container.querySelectorAll('.user-menu-dropdown.show').forEach(el => el.classList.remove('show'));

                    if (!isShowing) {
                        messageDropdown.classList.add('show');
                        this.loadMessageData(this.state.msgActiveTab);
                    } else {
                        messageDropdown.classList.remove('show');
                    }
                };

                // Tab 切换
                const tabs = messageDropdown.querySelectorAll('.msg-tab');
                tabs.forEach(tab => {
                    tab.onclick = (e) => {
                        e.stopPropagation();
                        const tabName = tab.dataset.tab;
                        this.setState({ msgActiveTab: tabName }); // 这会触发重新渲染，dropdown可能会关闭?
                        // setState 会导致 re-render，从而dom丢失。
                        // 由于 Component 的 setState 默认是 innerHTML 替换，这会导致 Dropdown 关闭。
                        // 我们需要在 re-render 后保持 Dropdown 打开状态。
                        // 或者，我们手动更新 DOM 而不触发全量 render？
                        // 鉴于 Component 框架限制，我们可以在 updated 后检查并恢复状态，或者手动处理 tab 切换。
                    };
                });

                // 为了避免 re-render 导致闪烁/关闭，最佳实践是手动操作 DOM 类名和内容。
                // 但这里为了使用 render 的模板能力，我们接受 re-render，并在 afterUpdate 中恢复 dropdown 状态。
                // 可是 Component 框架太简单，可能没有 preserve state。
                // 我们修改 onclick 逻辑：不 setState，而是手动更新 active 类和 list 内容。
            }
            // 修正：上述 Tab 切换会导致 Dropdown 关闭。
            // 更好的做法：Tab 切换时，手动更新 DOM，不调用 setState。
            if (messageBtn && messageDropdown) {
                const tabs = messageDropdown.querySelectorAll('.msg-tab');
                const contentList = messageDropdown.querySelector('.msg-content-list');
                const viewAllBtn = messageDropdown.querySelector('#viewAllBtn');

                tabs.forEach(tab => {
                    tab.onclick = async (e) => {
                        e.stopPropagation();
                        // Update Tabs UI
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');

                        // Update Data
                        const tabName = tab.dataset.tab;
                        this.state.msgActiveTab = tabName; // Update state silently

                        // Loading
                        contentList.innerHTML = '<div class="loading-spinner"></div>';

                        // Load data
                        try {
                            let list = [];
                            if (tabName === 'message') {
                                const res = await MessageApi.list({ page: 1, size: 5 });
                                list = res.data.items || [];
                                viewAllBtn.onclick = () => Router.push('/message/list');
                            } else if (tabName === 'announcement') {
                                const res = await AnnouncementApi.getPublished(5);
                                list = res.data || [];
                                viewAllBtn.onclick = () => Router.push('/announcement/list'); // Admin only? 
                                // Clean desktop for users: maybe just stay here or modal?
                                // If admin, go to list. If user... we removed the list page.
                                // Just keep it simple.
                            } else if (tabName === 'todo') {
                                const res = await UserApi.getPendingUsers();
                                list = res.data || [];
                                viewAllBtn.onclick = () => Router.push('/users/pending');
                            }

                            if (list.length === 0) {
                                contentList.innerHTML = '<div class="empty-text">暂无内容</div>';
                            } else {
                                contentList.innerHTML = list.map(item => this.renderListItem(item, tabName)).join('');
                            }
                            this.state.msgList = list; // Update state silently
                        } catch (err) {
                            contentList.innerHTML = '<div class="empty-text">加载失败</div>';
                        }
                    };
                });

                // 初始化 View All 按钮事件
                const viewBtn = messageDropdown.querySelector('#viewAllBtn');
                if (viewBtn) {
                    viewBtn.onclick = () => {
                        const tab = this.state.msgActiveTab;
                        if (tab === 'message') Router.push('/message/list');
                        else if (tab === 'announcement' && (this.state.user.role === 'admin' || this.state.user.role === 'manager')) {
                            Router.push('/announcement/list');
                        }
                        else if (tab === 'todo') Router.push('/users/pending');
                    };
                }
            }


            // 用户菜单切换
            const userPill = this.container.querySelector('#userPillToggle');
            const userDropdown = this.container.querySelector('#userMenuDropdown');

            if (userPill && userDropdown) {
                userPill.onclick = (e) => {
                    e.stopPropagation();
                    // Close others
                    this.container.querySelectorAll('.user-menu-dropdown.show').forEach(el => {
                        if (el !== userDropdown) el.classList.remove('show');
                    });
                    userDropdown.classList.toggle('show');
                };
            }

            // 点击外部关闭所有下拉
            this._docClickHandler = (e) => {
                if (!document.body.contains(this.container)) return;

                // 如果点击发生在 dropdown 内部，不关闭
                if (e.target.closest('.user-menu-dropdown')) return;

                // 如果点击在 Toggle 按钮上，由按钮事件处理，这里不处理
                if (e.target.closest('#messageBtn') || e.target.closest('#userPillToggle')) return;

                // 关闭所有
                this.container.querySelectorAll('.user-menu-dropdown.show').forEach(el => el.classList.remove('show'));
            };
            document.addEventListener('click', this._docClickHandler);

            // Logout
            const btnLogout = this.container.querySelector('#btnLogout');
            if (btnLogout) {
                btnLogout.onclick = (e) => {
                    e.stopPropagation();
                    this.handleLogout();
                };
            }
        }
    }

    async handleLogout() {
        if (confirm('确定要退出登录吗？')) {
            try {
                await AuthApi.logout().catch(() => { });
                localStorage.removeItem(Config.storageKeys.token);
                localStorage.removeItem(Config.storageKeys.user);
                Store.set('isLoggedIn', false);
                Store.set('user', null);
                Toast.success('已退出登录');
                window.location.reload();
            } catch (e) {
                console.error(e);
                window.location.reload();
            }
        }
    }
}

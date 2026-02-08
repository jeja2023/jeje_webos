/**
 * 顶部条组件
 */
class TopBarComponent extends Component {
    constructor(container) {
        super(container);
        this.state = {
            time: this.getCurrentTime(),
            user: Store.get('user') || { nickname: 'Guest', username: 'guest' },
            unreadMessages: Store.get('unreadMessages') || 0,
            showTime: false, // 默认为 false，只在有窗口时显示
            wsConnected: true, // WebSocket 连接状态

            // 消息中心状态
            msgActiveTab: 'message', // 消息类型: message (消息), announcement (公告), pending (待审核)
            msgList: [],
            msgLoading: false,
            pendingCount: 0  // 待审核用户数
        };

        // 每分钟更新一次时间（保存引用以便 destroy 时清理）
        this._timeInterval = setInterval(() => {
            this.setState({ time: this.getCurrentTime() });
        }, 60000);

        // 保存所有 Store 取消订阅函数
        this._storeUnsubscribes = [];
        
        this._storeUnsubscribes.push(
            Store.subscribe('user', (user) => {
                this.setState({ user });
                this.checkPendingCount();
            })
        );
        this._storeUnsubscribes.push(
            Store.subscribe('unreadMessages', (count) => {
                this.setState({ unreadMessages: count || 0 });
            })
        );
        this._storeUnsubscribes.push(
            Store.subscribe('appName', (name) => this.setState({ appName: name }))
        );
        this._storeUnsubscribes.push(
            Store.subscribe('version', (ver) => this.setState({ sysVersion: ver }))
        );

        // 监听 WebSocket 连接状态（保存引用以便移除）
        this._wsConnectedHandler = () => this.setState({ wsConnected: true });
        this._wsDisconnectedHandler = () => this.setState({ wsConnected: false });
        if (typeof WebSocketClient !== 'undefined') {
            WebSocketClient.on('connected', this._wsConnectedHandler);
            WebSocketClient.on('disconnected', this._wsDisconnectedHandler);
        }

        // 初始加载待审核用户数量
        this.checkPendingCount();
    }

    async checkPendingCount() {
        const user = this.state.user;
        if (user.role === 'admin' || user.role === 'manager') {
            try {
                // 如果有获取待审核数量的接口
                const res = await UserApi.getPendingUsers().catch(() => ({ data: [] }));
                const count = Array.isArray(res.data) ? res.data.length : 0;
                this.setState({ pendingCount: count });
            } catch (e) {
                // 忽略异常
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

        // 显示加载中
        contentList.innerHTML = '<div class="loading-spinner"></div>';

        try {
            let list = [];
            if (tab === 'message') {
                // 只获取未读消息
                const res = await NotificationApi.list({ page: 1, size: 5, is_read: false });
                list = res.data.items || [];
                if (viewAllBtn) viewAllBtn.onclick = () => Router.push('/notifications');
            } else if (tab === 'announcement') {
                const res = await AnnouncementApi.getPublished(5);
                list = res.data || [];
                // 普通用户没有list页，管理员有
                const isAdmin = this.state.user.role === 'admin' || this.state.user.role === 'manager';
                if (viewAllBtn) {
                    viewAllBtn.onclick = isAdmin ? () => Router.push('/announcement/list') : null;
                    viewAllBtn.style.display = isAdmin ? 'block' : 'none';
                }
            } else if (tab === 'pending') {
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
        const { time, user, msgActiveTab, msgList, msgLoading, unreadMessages, pendingCount, appName, sysVersion } = this.state;

        // 计算总徽章数 (消息 + 待审核)
        // 公告未读数暂时无法获取，忽略
        const totalBadge = unreadMessages + pendingCount;
        const displayAppName = appName || 'JeJe WebOS';
        const displayVersion = sysVersion || '';

        return `
            <div class="top-bar ${this.state.showTime ? 'show-time' : ''}">
                <div class="top-bar-left">
                     <!-- 品牌标题 -->
                    <div id="brandPill" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <img src="/static/images/logo.png" class="brand-icon" style="height: 28px; width: auto; border-radius: 6px;">
                        <span class="brand-title">${Utils.escapeHtml(displayAppName)}</span>
                    </div>
                </div>

                <div class="top-bar-right">
                    <!-- 连接状态指示器 -->
                    ${!this.state.wsConnected ? `
                        <div class="status-pill ws-status-pill offline" title="网络已断开，正在重连...">
                            <i class="ri-wifi-off-line" style="color: var(--color-error); font-size: 14px;"></i>
                            <span style="font-size: 12px; color: var(--color-error);">离线</span>
                        </div>
                    ` : ''}
                    
                    <!-- 胶囊 3: 时间 -->
                    <div class="status-pill time-pill">
                        <span>${time}</span>
                    </div>
                    
                    <!-- 胶囊 2: 消息中心 -->
                    <div class="status-pill icon-pill" id="messageBtn" title="系统消息">
                        <span class="status-icon"><i class="ri-mail-line"></i></span>
                        ${totalBadge > 0 ? `
                            <span class="notification-badge">
                                ${totalBadge > 99 ? '99+' : totalBadge}
                            </span>
                        ` : ''}

                        <!-- 下拉面板 -->
                        <div class="user-menu-dropdown message-dropdown" id="messageDropdown" style="width: 320px; right: -60px;">
                             <div class="msg-header-actions" style="padding: 0 12px 8px; display: flex; justify-content: flex-end; border-bottom: 1px solid var(--border-color); margin-bottom: 5px;">
                                <button class="btn btn-ghost btn-sm" id="quickMarkReadBtn" title="全部已读" style="font-size: 12px;">
                                    <i class="ri-check-double-line"></i> 全部已读
                                </button>
                            </div>
                            <div class="msg-tabs">
                                <div class="msg-tab ${msgActiveTab === 'message' ? 'active' : ''}" data-tab="message">
                                    消息 ${unreadMessages > 0 ? `<span class="badge-dot"></span>` : ''}
                                </div>
                                <div class="msg-tab ${msgActiveTab === 'announcement' ? 'active' : ''}" data-tab="announcement">
                                    公告
                                </div>
                                ${(user.role === 'admin' || user.role === 'manager') ? `
                                    <div class="msg-tab ${msgActiveTab === 'pending' ? 'active' : ''}" data-tab="pending">
                                        审核 ${pendingCount > 0 ? `<span class="badge-dot"></span>` : ''}
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

                        <!-- 下拉菜单 -->
                        <div class="user-menu-dropdown" id="userMenuDropdown">
                            <div class="menu-header">
                                <div class="menu-user-name">${Utils.escapeHtml(user.nickname || user.username)}</div>
                                <div class="menu-user-role">${user.role === 'admin' ? '系统管理员' : '普通用户'}</div>
                            </div>
                            <div class="menu-item" onclick="Router.push('/profile')"><i class="ri-user-line"></i> 个人中心</div>
                            <div class="menu-item" onclick="Router.push('/theme/editor')"><i class="ri-palette-line"></i> 系统主题</div>
                            <div class="menu-item" onclick="Router.push('/help')"><i class="ri-question-line"></i> 帮助中心</div>
                            <div class="menu-divider"></div>
                            <div class="menu-item danger" id="btnLogout"><i class="ri-logout-box-line"></i> 退出登录</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderListItem(item, tab) {
        if (tab === 'message') {
            // 根据类型显示不同图标
            let iconClass = 'ri-notification-line';
            let iconStyle = '';

            // 兼容 notification.js 中的类型：info, success, warning, error
            if (item.type === 'success') { iconClass = 'ri-checkbox-circle-fill'; iconStyle = 'color: var(--color-success);'; }
            else if (item.type === 'warning') { iconClass = 'ri-error-warning-fill'; iconStyle = 'color: var(--color-warning);'; }
            else if (item.type === 'error') { iconClass = 'ri-close-circle-fill'; iconStyle = 'color: var(--color-error);'; }
            else if (item.type === 'info' && item.sender_id === item.user_id) { iconClass = 'ri-notification-fill'; }

            return `
                <div class="msg-item ${item.is_read ? '' : 'unread'}" data-id="${item.id}" onclick="Router.push('/notifications')">
                    <div class="msg-icon" style="${iconStyle}">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="msg-body">
                        <div class="msg-title">${Utils.escapeHtml(item.title)}</div>
                        <div class="msg-time">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                    <div class="msg-actions">
                         ${!item.is_read ? `
                            <button class="msg-action-btn" data-action="read" title="标记已读">
                                <i class="ri-check-line"></i>
                            </button>
                         ` : ''}
                        <button class="msg-action-btn delete" data-action="delete" title="删除">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>
                </div>
            `;
        } else if (tab === 'announcement') {
            return `
                <div class="msg-item" onclick="Router.push('/announcement/view/${item.id}')">
                    <div class="msg-icon"><i class="ri-megaphone-fill" style="color: var(--color-primary)"></i></div>
                    <div class="msg-body">
                        <div class="msg-title">${Utils.escapeHtml(item.title)}</div>
                        <div class="msg-time">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                </div>
            `;
        } else if (tab === 'pending') {
            return `
                <div class="msg-item" onclick="Router.push('/users/pending')">
                    <div class="msg-icon"><i class="ri-user-follow-line" style="color: var(--color-info)"></i></div>
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
        
        // 清理定时器
        if (this._timeInterval) {
            clearInterval(this._timeInterval);
            this._timeInterval = null;
        }
        
        // 取消所有 Store 订阅
        if (this._storeUnsubscribes) {
            this._storeUnsubscribes.forEach(unsub => unsub && unsub());
            this._storeUnsubscribes = [];
        }
        
        // 移除 WebSocket 监听器
        if (typeof WebSocketClient !== 'undefined') {
            if (this._wsConnectedHandler) WebSocketClient.off('connected', this._wsConnectedHandler);
            if (this._wsDisconnectedHandler) WebSocketClient.off('disconnected', this._wsDisconnectedHandler);
        }
        
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
            // 品牌/Logo 点击
            const brandPill = this.container.querySelector('#brandPill');
            if (brandPill) {
                brandPill.onclick = () => this.showAboutModal();
            }

            // 消息按钮
            const messageBtn = this.container.querySelector('#messageBtn');
            const messageDropdown = this.container.querySelector('#messageDropdown');

            if (messageBtn && messageDropdown) {
                messageBtn.onclick = (e) => {
                    // 如果点击的是内部元素（如Tab或操作按钮），不要切换显示状态
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

                // 绑定消息操作事件代理 (删除/已读)
                messageDropdown.addEventListener('click', async (e) => {
                    const btn = e.target.closest('.msg-action-btn');
                    if (!btn) return;

                    e.stopPropagation(); // 阻止冒泡，防止触发跳转或关闭下拉

                    const item = btn.closest('.msg-item');
                    if (!item) return;

                    const id = item.dataset.id;
                    const action = btn.dataset.action;

                    // 防止重复点击
                    if (btn.disabled) return;
                    btn.disabled = true;

                    try {
                        if (action === 'read') {
                            await NotificationApi.markRead(id);
                            // 刷新未读数
                            const newCount = Math.max(0, this.state.unreadMessages - 1);
                            Store.set('unreadMessages', newCount);
                            // 局部更新 UI: 移除 "unread" 类和 "已读" 按钮
                            item.classList.remove('unread');
                            btn.remove();
                            Toast.success('已标记为已读');
                        } else if (action === 'delete') {
                            await NotificationApi.delete(id);
                            // 刷新列表和计数
                            this.loadMessageData(this.state.msgActiveTab);
                            // 如果是未读的，还要减数
                            if (item.classList.contains('unread')) {
                                const newCount = Math.max(0, this.state.unreadMessages - 1);
                                Store.set('unreadMessages', newCount);
                            }
                            Toast.success('删除成功');
                        }
                    } catch (err) {
                        console.error(err);
                        Toast.error('操作失败');
                        btn.disabled = false;
                    }
                });

                // Tab 切换逻辑在下方统一处理
            }

            // Tab 切换逻辑
            if (messageBtn && messageDropdown) {
                const tabs = messageDropdown.querySelectorAll('.msg-tab');
                const contentList = messageDropdown.querySelector('.msg-content-list');
                const viewAllBtn = messageDropdown.querySelector('#viewAllBtn');

                tabs.forEach(tab => {
                    tab.onclick = async (e) => {
                        e.stopPropagation();
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');

                        const tabName = tab.dataset.tab;
                        this.state.msgActiveTab = tabName;

                        contentList.innerHTML = '<div class="loading-spinner"></div>';

                        try {
                            let list = [];
                            if (tabName === 'message') {
                                // 只获取未读消息
                                const res = await NotificationApi.list({ page: 1, size: 5, is_read: false });
                                list = res.data.items || [];
                                if (viewAllBtn) viewAllBtn.onclick = () => Router.push('/notifications');
                            } else if (tabName === 'announcement') {
                                const res = await AnnouncementApi.getPublished(5);
                                list = res.data || [];
                                // 检查管理员权限
                                const isAdmin = this.state.user.role === 'admin' || this.state.user.role === 'manager';
                                if (viewAllBtn) {
                                    viewAllBtn.onclick = isAdmin ? () => Router.push('/announcement/list') : null;
                                    viewAllBtn.style.display = isAdmin ? 'block' : 'none';
                                }
                            } else if (tabName === 'pending') {
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
                                contentList.innerHTML = list.map(item => this.renderListItem(item, tabName)).join('');
                            }
                            this.state.msgList = list;
                        } catch (err) {
                            contentList.innerHTML = '<div class="empty-text">加载失败</div>';
                        }
                    };
                });

                // 初始化查看全部按钮逻辑
                const viewBtn = messageDropdown.querySelector('#viewAllBtn');
                if (viewBtn) {
                    viewBtn.onclick = () => {
                        const tab = this.state.msgActiveTab;
                        // 根据当前 Tab 跳转到对应页面
                        if (tab === 'message') Router.push('/notifications');
                        else if (tab === 'announcement') {
                            const isAdmin = this.state.user.role === 'admin' || this.state.user.role === 'manager';
                            if (isAdmin) Router.push('/announcement/list');
                        }
                        else if (tab === 'pending') Router.push('/users/pending');
                    };
                }
            }


            // 用户菜单切换
            const userPill = this.container.querySelector('#userPillToggle');
            const userDropdown = this.container.querySelector('#userMenuDropdown');

            if (userPill && userDropdown) {
                userPill.onclick = (e) => {
                    e.stopPropagation();
                    // 关闭其他下拉菜单
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

            // 退出登录
            const btnLogout = this.container.querySelector('#btnLogout');
            if (btnLogout) {
                // 快速全部已读
                const quickMarkReadBtn = messageDropdown.querySelector('#quickMarkReadBtn');
                if (quickMarkReadBtn) {
                    quickMarkReadBtn.onclick = async (e) => {
                        e.stopPropagation();
                        try {
                            await NotificationApi.markAllRead();
                            Toast.success('已全部标记为已读');
                            this.loadMessageData('message');
                            Store.set('unreadMessages', 0);
                        } catch (e) {
                            Toast.error('操作失败');
                        }
                    }
                }

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

    showAboutModal() {
        // 直接从 Store 获取最新值，确保数据准确
        const displayAppName = Store.get('appName') || 'JeJe WebOS';
        const displayVersion = Store.get('version') || '';
        const browser = this.getBrowserInfo();

        const modalResult = Modal.show({
            title: '关于本机',
            width: '400px',
            content: `
                <div style="text-align: center; padding: 10px 0;">
                    <div style="margin-bottom: 12px; animation: floatIcon 3s ease-in-out infinite;">
                        <img src="/static/images/logo.png" style="width: 48px; height: 48px; object-fit: contain;">
                    </div>
                    <h2 style="margin: 0; font-size: 22px; font-weight: 600; color:var(--color-text-primary);">${Utils.escapeHtml(displayAppName)}</h2>
                    <p style="color: var(--color-text-secondary); margin: 4px 0 16px; font-size: 14px;">Version ${Utils.escapeHtml(displayVersion)}</p>
                    
                    <div style="background: rgba(125,125,125,0.1); border-radius: 12px; padding: 12px 16px; text-align: left; font-size: 13px; line-height: 1.8;">
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(125,125,125,0.1); padding-bottom: 4px; margin-bottom: 4px;">
                            <span style="color: var(--color-text-secondary);">运行环境</span>
                            <span style="font-family: monospace;">FastAPI + Vanilla JS</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(125,125,125,0.1); padding-bottom: 4px; margin-bottom: 4px;">
                            <span style="color: var(--color-text-secondary);">浏览器</span>
                            <span>${browser}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(125,125,125,0.1); padding-bottom: 4px; margin-bottom: 4px;">
                            <span style="color: var(--color-text-secondary);">分辨率</span>
                            <span>${window.screen.width} x ${window.screen.height}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color: var(--color-text-secondary);">内核架构</span>
                            <span>JeJe Micro-Kernel</span>
                        </div>
                    </div>
                    
                    <p style="margin-top: 16px; font-size: 11px; color: var(--color-text-secondary); opacity: 0.7;">
                        Copyright © 2025 JeJe WebOS Team.<br>All rights reserved.
                    </p>
                </div>
                <style>
                    @keyframes floatIcon {
                        0% { transform: translateY(0px); }
                        50% { transform: translateY(-10px); }
                        100% { transform: translateY(0px); }
                    }
                </style>
            `,
            footer: false
        });

        // 禁用"关于本机"对话框的滚动条
        if (modalResult && modalResult.overlay) {
            const modalBody = modalResult.overlay.querySelector('.modal-body');
            if (modalBody) {
                modalBody.style.maxHeight = 'none';
                modalBody.style.overflowY = 'visible';
            }
        }
    }

    getBrowserInfo() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg')) return 'Microsoft Edge';
        if (ua.includes('Chrome')) return 'Google Chrome';
        if (ua.includes('Firefox')) return 'Mozilla Firefox';
        if (ua.includes('Safari')) return 'Apple Safari';
        return 'Unknown Browser';
    }
}

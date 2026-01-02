/**
 * 通知系统页面
 */

class NotificationsPage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin';
        this.state = {
            messages: [],
            total: 0,
            page: 1,
            size: 20,
            loading: true,
            filter: 'all', // all, unread
            users: [], // 用于发送通知时选择用户
            showSendModal: false
        };
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size, filter } = this.state;
        try {
            const params = { page, size };
            if (filter === 'unread') params.is_read = false;
            const res = await NotificationApi.list(params);
            this.setState({
                messages: res.data?.items || res.items || [],
                total: res.data?.total || res.total || 0,
                loading: false
            });
        } catch (e) {
            Toast.error('加载通知失败');
            this.setState({ loading: false });
        }
    }

    async handleMarkRead(id) {
        try {
            await NotificationApi.markRead(id);
            this.loadData();
            // 更新全局未读数
            this.updateUnreadCount();
        } catch (e) {
            Toast.error('操作失败');
        }
    }

    async handleMarkAllRead() {
        try {
            await NotificationApi.markAllRead();
            Toast.success('已全部标记为已读');
            this.loadData();
            this.updateUnreadCount();
        } catch (e) {
            Toast.error('操作失败');
        }
    }

    async handleDelete(id) {
        Modal.confirm('确认删除', '确定要删除这条通知吗？', async () => {
            try {
                await NotificationApi.delete(id);
                Toast.success('通知已删除');
                this.loadData();
            } catch (e) {
                Toast.error('删除失败');
            }
        });
    }

    async handleDeleteAll() {
        Modal.confirm('确认删除', '确定要删除所有通知吗？', async () => {
            try {
                await NotificationApi.deleteAll();
                Toast.success('所有通知已删除');
                this.loadData();
            } catch (e) {
                Toast.error('删除失败');
            }
        });
    }

    async updateUnreadCount() {
        try {
            const res = await NotificationApi.unreadCount();
            const count = res.data?.count || res.count || 0;
            Store.set('unreadMessages', count);
        } catch (e) { }
    }

    async loadUsers() {
        if (!this.isAdmin) return;
        try {
            const res = await UserApi.getUsers({ page: 1, size: 1000 });
            this.setState({ users: res.data?.items || [] });
        } catch (e) {
            // 忽略错误
        }
    }

    async handleSendNotification(data) {
        try {
            await NotificationApi.create(data);
            Toast.success('通知发送成功');
            this.setState({ showSendModal: false });
            this.loadData();
            // 立即刷新未读数（即时反馈给自己）
            this.updateUnreadCount();
        } catch (e) {
            Toast.error(e.message || '发送失败');
        }
    }

    handleExport() {
        const token = Store.get('token');
        window.open(`/api/v1/export/notification?token=${token}&format=xlsx`, '_blank');
    }

    async showSendNotificationModal() {
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        let userSelectHtml = '';
        if (isAdmin) {
            userSelectHtml = `
                <div class="form-group">
                    <label class="form-label">接收对象</label>
                    <div style="display:flex; gap:15px; margin: 10px 0;">
                        <label style="display:flex; align-items:center; cursor:pointer;">
                            <input type="radio" name="msgTargetType" value="all" checked style="margin-right:5px;"> 所有用户
                        </label>
                        <label style="display:flex; align-items:center; cursor:pointer;">
                            <input type="radio" name="msgTargetType" value="user" style="margin-right:5px;"> 指定用户
                        </label>
                    </div>
                </div>
                <div class="form-group" id="targetUserInput" style="display:none;">
                    <label class="form-label">用户名 <span class="required">*</span></label>
                    <input type="text" class="form-input" id="msgReceiverUsername" placeholder="请输入接收者用户名">
                </div>
             `;
        } else {
            userSelectHtml = `
                <div class="form-group">
                    <label class="form-label">接收用户 <span class="required">*</span></label>
                    <input type="text" class="form-input" id="msgReceiverUsername" placeholder="请输入对方用户名" required>
                </div>
             `;
        }

        const content = `
            <div class="form-container">
                ${userSelectHtml}
                <div class="form-group">
                    <label class="form-label">通知类型</label>
                    <select class="form-input form-select" id="msgType">
                        <option value="info">通知</option>
                        <option value="success">成功</option>
                        <option value="warning">警告</option>
                        <option value="error">错误</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">标题 <span class="required">*</span></label>
                    <input type="text" class="form-input" id="msgTitle" placeholder="请输入通知标题" required maxlength="200">
                </div>
                <div class="form-group">
                    <label class="form-label">内容</label>
                    <textarea class="form-input" id="msgContent" rows="4" placeholder="请输入通知内容（可选）"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">操作链接（可选）</label>
                    <input type="text" class="form-input" id="msgActionUrl" placeholder="例如：/dashboard">
                </div>
            </div>
        `;

        const { overlay, close } = Modal.show({
            title: '📤 发送通知',
            content,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="sendMsgBtn">发送</button>
            `,
            width: '500px'
        });

        if (isAdmin) {
            const rads = overlay.querySelectorAll('input[name="msgTargetType"]');
            const targetInput = overlay.querySelector('#targetUserInput');
            rads.forEach(rad => {
                rad.onchange = () => {
                    targetInput.style.display = rad.value === 'user' ? 'block' : 'none';
                };
            });
        }

        const sendBtn = overlay.querySelector('#sendMsgBtn');
        sendBtn?.addEventListener('click', () => {
            let userId = null;
            let receiverUsername = null;

            if (isAdmin) {
                const targetType = overlay.querySelector('input[name="msgTargetType"]:checked').value;
                if (targetType === 'all') {
                    userId = 0;
                } else {
                    receiverUsername = overlay.querySelector('#msgReceiverUsername').value.trim();
                    if (!receiverUsername) {
                        Toast.error('请输入用户名'); return;
                    }
                }
            } else {
                receiverUsername = overlay.querySelector('#msgReceiverUsername').value.trim();
                if (!receiverUsername) {
                    Toast.error('请输入用户名'); return;
                }
            }

            const type = overlay.querySelector('#msgType').value;
            const title = overlay.querySelector('#msgTitle').value.trim();
            const content = overlay.querySelector('#msgContent').value.trim();
            const actionUrl = overlay.querySelector('#msgActionUrl').value.trim();

            if (!title) {
                Toast.error('请输入通知标题');
                return;
            }

            this.handleSendNotification({
                user_id: userId,
                receiver_username: receiverUsername,
                title: title,
                content: content || null,
                type: type,
                action_url: actionUrl || null
            });
            close();
        });
    }

    getTypeIcon(type) {
        const icons = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        };
        return icons[type] || 'ℹ️';
    }

    getTypeTag(type) {
        const classes = {
            'info': 'tag-info',
            'success': 'tag-primary',
            'warning': 'tag-warning',
            'error': 'tag-danger'
        };
        return classes[type] || '';
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    render() {
        const { messages, total, page, size, loading, filter } = this.state;
        const pages = Math.ceil(total / size) || 1;

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">通知中心</h1>
                        <p class="page-desc">查看和管理系统通知</p>
                    </div>
                    ${this.isAdmin ? `
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-primary" id="openSendMsgModal">
                                📤 发送通知
                            </button>
                            <button class="btn btn-secondary" id="exportMsgBtn">
                                📤 导出列表
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="card" style="margin-bottom: var(--spacing-lg);">
                    <div class="card-body">
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
                            <div style="display: flex; gap: 8px;">
                                <button class="btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">
                                    全部
                                </button>
                                <button class="btn ${filter === 'unread' ? 'btn-primary' : 'btn-secondary'}" data-filter="unread">
                                    未读
                                </button>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary" id="markAllRead">✓ 全部已读</button>
                                <button class="btn btn-ghost" id="deleteAllNotif">🗑️ 清空</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    ${loading ? '<div class="loading"></div>' : messages.length === 0 ? `
                        <div class="empty-state" style="padding: 60px 0;">
                            <div class="empty-icon">✉️</div>
                            <p class="empty-text">暂无通知</p>
                        </div>
                    ` : `
                        <div class="notification-list">
                            ${messages.map(n => `
                                <div class="notification-item ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}">
                                    <div class="notification-icon">${this.getTypeIcon(n.type)}</div>
                                    <div class="notification-content">
                                        <div class="notification-header">
                                            <span class="notification-title">${Utils.escapeHtml(n.title)}</span>
                                            <span class="tag ${this.getTypeTag(n.type)}">${n.type}</span>
                                        </div>
                                        <p class="notification-message">${Utils.escapeHtml(n.content || '')}</p>
                                        <div class="notification-meta">
                                            <span>${Utils.formatDate(n.created_at)}</span>
                                        </div>
                                    </div>
                                    <div class="notification-actions">
                                        ${!n.is_read ? `
                                            <button class="btn btn-ghost btn-sm" data-mark="${n.id}" title="标记已读">✓</button>
                                        ` : ''}
                                        <button class="btn btn-ghost btn-sm" data-delete="${n.id}" title="删除">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${Utils.renderPagination(page, pages)}
                    `}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        if (this.isAdmin) {
            this.loadUsers();
        }
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedMsg) {
            this.container._bindedMsg = true;

            // 筛选
            this.delegate('click', '[data-filter]', (e, t) => {
                this.state.filter = t.dataset.filter;
                this.state.page = 1;
                this.loadData();
            });

            // 全部已读
            this.delegate('click', '#markAllRead', () => {
                this.handleMarkAllRead();
            });

            // 清空
            this.delegate('click', '#deleteAllMsg', () => {
                this.handleDeleteAll();
            });

            // 标记已读
            this.delegate('click', '[data-mark]', (e, t) => {
                e.stopPropagation();
                this.handleMarkRead(t.dataset.mark);
            });

            // 删除
            this.delegate('click', '[data-delete]', (e, t) => {
                e.stopPropagation();
                this.handleDelete(t.dataset.delete);
            });

            // 分页
            this.delegate('click', '[data-page]', (e, t) => {
                const p = parseInt(t.dataset.page);
                if (p > 0) this.changePage(p);
            });

            // 发送通知（管理员）
            if (this.isAdmin) {
                this.delegate('click', '#openSendMsgModal', () => {
                    this.showSendNotificationModal();
                });
                this.delegate('click', '#exportMsgBtn', () => {
                    this.handleExport();
                });
            }
        }
    }
}



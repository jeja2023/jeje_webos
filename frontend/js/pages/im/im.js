/**
 * 即时通讯页面
 * 支持实时消息、输入状态、消息撤回等功能
 */

const EMOJIS = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'
];

class IMPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            conversations: [],
            currentConversation: null,
            messages: [],
            contacts: [],
            showContacts: false,
            loading: false,
            loadingMore: false,
            page: 1,
            onlineStatusInterval: null,
            _bindEvents: false,
            hasMore: true,
            onlineUsers: new Set(),
            searchQuery: '',
            typingUsers: new Set(),
            connectionStatus: 'connecting' // 连接状态: connecting, connected, disconnected
        };

        this.messageInput = null;
        this.messagesContainer = null;
        this._wsHandlers = {}; // 保存WebSocket事件处理器引用，用于解绑

        // 设置全局实例引用
        window.imPageInstance = this;
    }

    /**
     * 显示新建会话对话框
     */
    async showNewConversationDialog() {
        const selectedIds = await IMComponents.showMemberSelector({
            title: '发起新聊天',
            multiSelect: true
        });

        if (selectedIds && selectedIds.length > 0) {
            if (selectedIds.length === 1) {
                await this.createPrivateConversation(selectedIds[0]);
            } else {
                await this.createGroupConversation(selectedIds);
            }
        }
    }

    /**
     * 创建私聊会话
     */
    async createPrivateConversation(userId) {
        try {
            const res = await Api.post('/im/conversations', {
                type: 'private',
                member_ids: [userId]
            });

            if (res.code === 200 || res.code === 0) {
                await this.loadConversations();
                if (res.data && res.data.id) {
                    this.selectConversation(res.data.id);
                }
            } else {
                Toast.error(res.message || '创建会话失败');
            }
        } catch (error) {
            console.error('创建会话失败', error);
            Toast.error('创建失败');
        }
    }

    /**
     * 创建群聊
     */
    async createGroupConversation(userIds) {
        try {
            const toastObj = Toast.loading('正在创建群聊...');
            const res = await Api.post('/im/conversations', {
                type: 'group',
                name: '新群聊',
                member_ids: userIds
            });
            toastObj.close();
            if (res.code === 200 || res.code === 0) {
                Toast.success('群聊创建成功');
                await this.loadConversations();
                if (res.data && res.data.id) {
                    this.selectConversation(res.data.id);
                }
            } else {
                Toast.error(res.message || '建群失败');
            }
        } catch (error) {
            console.error('建群失败', error);
            Toast.error('建群失败');
        }
    }

    async afterMount() {
        await this.loadConversations();
        this.setupWebSocketListeners();
        this.bindEvents();

        // 绑定refs
        this.setTimeout(() => {
            this.updateRefs();
        }, 0);
    }

    updateRefs() {
        this.messageInput = this.container.querySelector('.im-input');
        this.messagesContainer = this.container.querySelector('.im-messages');
    }

    /**
     * 绑定DOM事件
     */
    bindEvents() {
        if (this.state._bindEvents) return;
        this.state._bindEvents = true;

        // 监听滚动加载更多消息
        this.delegate('scroll', '.im-messages', (e, el) => {
            if (el.scrollTop < 100 && this.state.hasMore && !this.state.loadingMore) {
                this.loadMoreMessages();
            }
        });

        // 搜索框回车支持
        this.delegate('keydown', '.im-search-input', (e, el) => {
            if (e.key === 'Enter') {
                const query = el.value.trim().toLowerCase();
                this.setState({ searchQuery: query });
                this.filterConversations();
            }
        });

        // 搜索按钮点击
        this.delegate('click', '#btnIMSearch', () => {
            const input = this.container.querySelector('.im-search-input');
            if (input) {
                const query = input.value.trim().toLowerCase();
                this.setState({ searchQuery: query });
                this.filterConversations();
            }
        });

        // 发送消息按钮
        this.delegate('click', '.im-send-btn', () => {
            const input = this.container.querySelector('.im-input');
            if (input) {
                this.sendMessage(input.value);
            }
        });

        // 会话项点击
        this.delegate('click', '.im-conversation-item', (e, el) => {
            const id = parseInt(el.dataset.id);
            if (id) {
                this.selectConversation(id);
            }
        });

        // 联系人按钮 - 显示新建会话对话框
        this.delegate('click', '.im-contacts-btn', () => {
            this.showNewConversationDialog();
        });

        // 会话设置按钮
        this.delegate('click', '.im-settings-btn', () => {
            this.showConversationSettings();
        });

        // 附件按钮
        this.delegate('click', '.im-attach-btn', () => {
            const fileInput = this.container.querySelector('#imFileInput');
            if (fileInput) fileInput.click();
        });

        // 文件上传
        this.delegate('change', '#imFileInput', (e, el) => {
            if (el.files && el.files[0]) {
                this.uploadFile(el.files[0]);
                el.value = ''; // 清空，允许重复上传同一文件
            }
        });

        // 撤回消息
        this.delegate('click', '.im-msg-action-btn.delete', (e, el) => {
            const msgEl = el.closest('.im-message');
            if (msgEl && msgEl.dataset.id) {
                this.recallMessage(parseInt(msgEl.dataset.id));
            }
        });

        // 表情按钮
        this.delegate('click', '.im-emoji-btn', (e) => {
            e.stopPropagation();
            const panel = this.container.querySelector('.im-emoji-panel');
            if (panel) panel.classList.toggle('active');
        });

        // 表情选择
        this.delegate('click', '.im-emoji-item', (e, el) => {
            e.stopPropagation();
            const emoji = el.textContent;
            const input = this.container.querySelector('.im-input');
            if (input) {
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const text = input.value;
                input.value = text.substring(0, start) + emoji + text.substring(end);
                input.selectionStart = input.selectionEnd = start + emoji.length;
                input.focus();
            }
        });

        // 粘贴处理 (图片粘贴)
        this.delegate('paste', '.im-input', (e) => {
            this.handlePaste(e);
        });

        // 图片预览 (Lightbox)
        this.delegate('click', '.im-msg-image img', (e, el) => {
            this.showLightbox(el.src);
        });

        // 点击外部关闭表情面板
        this.addListener(this.container, 'click', (e) => {
            const panel = this.container.querySelector('.im-emoji-panel');
            if (panel && panel.classList.contains('active')) {
                if (!e.target.closest('.im-emoji-panel') && !e.target.closest('.im-emoji-btn')) {
                    panel.classList.remove('active');
                }
            }
        });

        // 定时刷新在线状态 (每30秒)
        this.onlineStatusInterval = this.setInterval(() => this.loadOnlineUsers(), 30000);
    }

    /**
     * 过滤会话列表
     */
    filterConversations() {
        const query = this.state.searchQuery;
        const items = this.container.querySelectorAll('.im-conversation-item');
        items.forEach(el => {
            const name = el.querySelector('.im-conv-name')?.textContent.toLowerCase() || '';
            if (name.includes(query)) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        });
    }

    /**
     * 处理粘贴内容
     */
    handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                const blob = items[i].getAsFile();
                if (blob) {
                    Toast.info('正在从剪贴板上传图片...');
                    this.uploadFile(blob);
                }
            }
        }
    }

    /**
     * 显示图片灯箱
     */
    showLightbox(src) {
        const overlay = document.createElement('div');
        overlay.className = 'im-lightbox-overlay';
        overlay.innerHTML = `<img src="${src}" class="im-lightbox-content" />`;

        overlay.onclick = () => {
            overlay.style.opacity = '0';
            this.setTimeout(() => overlay.remove(), 200);
        };

        document.body.appendChild(overlay);

        // 阻止冒泡防止触发底层点击
        overlay.querySelector('img').onclick = (e) => e.stopPropagation();
    }

    /**
    /**
     * 显示会话设置对话框
     */
    async showConversationSettings() {
        const conversation = this.state.currentConversation;
        if (!conversation) return Toast.warning('请先选择一个会话');

        const currentUser = Store.get('user');

        if (conversation.type === 'group') {
            IMComponents.showGroupSettings(conversation, currentUser, {
                onAddMember: async () => {
                    const results = await IMComponents.showMemberSelector({
                        title: '添加成员',
                        multiSelect: true,
                        excludeIds: (conversation.members || []).map(m => m.user_id)
                    });
                    if (results && results.length > 0) {
                        for (const uid of results) {
                            await this.addMember(conversation.id, uid);
                        }
                        await this.selectConversation(conversation.id);
                    }
                },
                onRemoveMember: async (uid) => {
                    await this.removeMember(conversation.id, uid);
                },
                onUpdateInfo: async (data) => {
                    await this.updateConversation(conversation.id, data);
                },
                onDelete: async () => {
                    await this.leaveOrDeleteConversation(conversation.id);
                },
                onClearHistory: () => {
                    this.clearLocalHistory();
                    Toast.success('本地聊天记录已清空');
                }
            });
        } else {
            IMComponents.showPrivateSettings(conversation, currentUser, {
                onDelete: async () => {
                    await this.leaveOrDeleteConversation(conversation.id);
                },
                onClearHistory: () => {
                    this.clearLocalHistory();
                    Toast.success('本地聊天记录已清空');
                }
            });
        }
    }

    /**
     * 更新会话信息
     */
    async updateConversation(conversationId, data) {
        try {
            const res = await Api.put(`/im/conversations/${conversationId}`, data);
            if (res.code === 200 || res.code === 0) {
                Toast.success('更新成功');
                await this.loadConversations();
                await this.selectConversation(conversationId);
            } else {
                Toast.error(res.message || '更新失败');
            }
        } catch (error) {
            console.error('更新会话失败', error);
            Toast.error('更新失败');
        }
    }

    /**
     * 添加成员
     */
    async addMember(conversationId, userId) {
        try {
            const res = await Api.post(`/im/conversations/${conversationId}/members`, {
                user_ids: [userId]
            });
            if (res.code === 200 || res.code === 0) {
                // 静默成功即可
            } else {
                Toast.error(res.message || '添加失败');
            }
        } catch (error) {
            console.error('添加成员失败', error);
            Toast.error('添加失败');
        }
    }

    /**
     * 移除成员
     */
    async removeMember(conversationId, userId) {
        try {
            const res = await Api.delete(`/im/conversations/${conversationId}/members/${userId}`);
            if (res.code === 200 || res.code === 0) {
                Toast.success('成员已移除');
                await this.selectConversation(conversationId);
            } else {
                Toast.error(res.message || '移除失败');
            }
        } catch (error) {
            console.error('移除成员失败', error);
            Toast.error('移除失败');
        }
    }

    /**
     * 清空本地聊天记录
     */
    clearLocalHistory() {
        this.setState({ messages: [] });
    }

    /**
     * 退出或删除会话
     */
    async leaveOrDeleteConversation(conversationId) {
        try {
            const res = await Api.delete(`/im/conversations/${conversationId}`);
            if (res.code === 200 || res.code === 0) {
                Toast.success(res.message || '操作成功');
                this.setState({ currentConversation: null, messages: [] });
                await this.loadConversations();
            } else {
                Toast.error(res.message || '操作失败');
            }
        } catch (error) {
            console.error('退出/删除会话失败', error);
            Toast.error('操作失败');
        }
    }

    setupWebSocketListeners() {
        // 监听WebSocket消息
        if (typeof WebSocketClient === 'undefined') {
            console.warn('WebSocketClient 不可用，IM功能可能受限');
            this.setState({ connectionStatus: 'disconnected' });
            return;
        }

        // 检查当前连接状态
        if (WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.OPEN) {
            this.setState({ connectionStatus: 'connected' });
        } else if (WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.CONNECTING) {
            this.setState({ connectionStatus: 'connecting' });
        } else {
            this.setState({ connectionStatus: 'disconnected' });
        }

        // 新消息
        this._wsHandlers.newMessage = (data) => {
            this.handleNewMessage(data.data);
        };
        WebSocketClient.on('im_message_new', this._wsHandlers.newMessage);

        // 消息发送确认
        this._wsHandlers.messageSent = (data) => {
            this.handleNewMessage(data.data);
        };
        WebSocketClient.on('im_message_sent', this._wsHandlers.messageSent);

        // 已读通知
        this._wsHandlers.readNotify = (data) => {
            this.handleReadNotify(data.data);
        };
        WebSocketClient.on('im_message_read_notify', this._wsHandlers.readNotify);

        // 输入状态
        this._wsHandlers.typing = (data) => {
            this.handleTyping(data.data);
        };
        WebSocketClient.on('im_typing', this._wsHandlers.typing);

        // 消息撤回
        this._wsHandlers.recalled = (data) => {
            this.handleMessageRecalled(data.data);
        };
        WebSocketClient.on('im_message_recalled', this._wsHandlers.recalled);

        // 连接状态监听
        this._wsHandlers.connected = () => {
            this.setState({ connectionStatus: 'connected' });
        };
        WebSocketClient.on('connected', this._wsHandlers.connected);

        this._wsHandlers.disconnected = () => {
            this.setState({ connectionStatus: 'disconnected' });
        };
        WebSocketClient.on('disconnected', this._wsHandlers.disconnected);
    }

    /**
     * 组件销毁时解绑事件
     */
    destroy() {
        // 解绑WebSocket事件
        if (typeof WebSocketClient !== 'undefined') {
            if (this._wsHandlers.newMessage) WebSocketClient.off('im_message_new', this._wsHandlers.newMessage);
            if (this._wsHandlers.messageSent) WebSocketClient.off('im_message_sent', this._wsHandlers.messageSent);
            if (this._wsHandlers.readNotify) WebSocketClient.off('im_message_read_notify', this._wsHandlers.readNotify);
            if (this._wsHandlers.typing) WebSocketClient.off('im_typing', this._wsHandlers.typing);
            if (this._wsHandlers.recalled) WebSocketClient.off('im_message_recalled', this._wsHandlers.recalled);
            if (this._wsHandlers.connected) WebSocketClient.off('connected', this._wsHandlers.connected);
            if (this._wsHandlers.disconnected) WebSocketClient.off('disconnected', this._wsHandlers.disconnected);
        }

        // 清理全局引用
        if (window.imPageInstance === this) {
            window.imPageInstance = null;
        }

        super.destroy();
    }

    async loadConversations() {
        try {
            this.setState({ loading: true });
            const res = await Api.get('/im/conversations', {
                page: 1,
                page_size: 50
            });

            // 兼容分页响应 code=0 和普通响应 code=200
            if (res.code === 200 || res.code === 0) {
                const items = res.data?.items || [];
                this.setState({
                    conversations: items,
                    loading: false
                });

                // 如果有会话，默认打开第一个
                if (items.length > 0 && !this.state.currentConversation) {
                    this.selectConversation(items[0].id);
                }
            } else {
                console.warn('[IM] API 返回错误:', res);
                this.setState({ loading: false });
            }
        } catch (error) {
            console.error('[IM] 加载会话列表失败', error);
            Toast.error('加载会话列表失败: ' + (error.message || '未知错误'));
            this.setState({ loading: false });
        }
    }

    async selectConversation(conversationId) {
        try {
            // 先更新会话，再清空消息
            this.setState({ messages: [], hasMore: true });

            // 获取会话详情
            const res = await Api.get(`/im/conversations/${conversationId}`);
            if (res.code === 200 || res.code === 0) {
                this.setState({ currentConversation: res.data });
                await this.loadMessages(conversationId);

                // 标记消息已读
                this.markConversationRead(conversationId);
            } else {
                console.error('[IM] 获取会话详情失败:', res);
                Toast.error(res.message || '获取会话详情失败');
            }
        } catch (error) {
            console.error('加载会话失败', error);
            Toast.error('加载会话失败');
        }
    }

    async loadMessages(conversationId, beforeMessageId = null) {
        try {
            const params = {
                page: 1,
                page_size: 50
            };
            if (beforeMessageId) {
                params.before_message_id = beforeMessageId;
            }

            const res = await Api.get(`/im/conversations/${conversationId}/messages`, params);

            if (res.code === 200 || res.code === 0) {
                const newMessages = res.data.items || [];

                if (beforeMessageId) {
                    // 加载更多历史消息，插入到前面
                    this.setState({
                        messages: [...newMessages, ...this.state.messages],
                        hasMore: res.data.has_more,
                        loadingMore: false
                    });
                } else {
                    // 首次加载
                    this.setState({
                        messages: newMessages,
                        hasMore: res.data.has_more
                    });

                    // 首次加载滚动到底部
                    this.setTimeout(() => {
                        this.scrollToBottom();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('加载消息失败', error);
            this.setState({ loadingMore: false });
        }
    }

    /**
     * 加载更多历史消息
     */
    async loadMoreMessages() {
        if (!this.state.currentConversation || this.state.loadingMore || !this.state.hasMore) return;

        const firstMessage = this.state.messages[0];
        if (!firstMessage) return;

        this.setState({ loadingMore: true });
        await this.loadMessages(this.state.currentConversation.id, firstMessage.id);
    }

    async sendMessage(content, type = 'text') {
        if (!content || !content.trim()) return;
        if (!this.state.currentConversation) {
            Toast.warning('请先选择一个会话');
            return;
        }

        const trimmedContent = content.trim();

        // 立即清空输入框，提升体验
        const input = this.container.querySelector('.im-input');
        if (input) {
            input.value = '';
            input.focus();
        }

        try {
            const messageData = {
                conversation_id: this.state.currentConversation.id,
                type: type,
                content: trimmedContent
            };

            // 通过WebSocket发送
            if (typeof WebSocketClient !== 'undefined' && WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.OPEN) {
                // 修复：send方法接收两个参数 (type, data)
                WebSocketClient.send('im_send', messageData);
                // WebSocket发送后，会通过 im_message_sent 或 im_message_new 收到回执，此处不做额外处理
            } else {
                // 降级到HTTP
                const res = await Api.post('/im/messages', messageData);
                if (res.code === 200 || res.code === 0) {
                    this.handleNewMessage(res.data);
                } else {
                    Toast.error(res.message || '发送失败');
                    // 发送失败，恢复输入框内容
                    if (input) {
                        input.value = trimmedContent;
                    }
                }
            }
        } catch (error) {
            console.error('发送消息失败', error);
            Toast.error('发送消息失败');
            // 发送失败，恢复输入框内容
            if (input) {
                input.value = trimmedContent;
            }
        }
    }

    handleNewMessage(message) {
        // 如果是当前会话的消息，添加到消息列表（避免重复）
        if (this.state.currentConversation &&
            message.conversation_id === this.state.currentConversation.id) {

            // 检查是否已存在该消息
            const exists = this.state.messages.some(m => m.id === message.id);
            if (!exists) {
                // 直接修改状态以提升性能（避免全量重绘导致输入框失焦）
                this.state.messages.push(message);

                // 手动将消息追加到 DOM，避免全量重绘导致输入框失焦
                this.appendMessageToDom(message);
            }
        }

        // 增量更新会话列表
        this.updateConversationPreview(message);
    }

    /**
     * 撤回消息
     */
    async recallMessage(messageId) {
        if (!confirm('确定要撤回这条消息吗？')) return;

        try {
            const res = await Api.post(`/im/messages/${messageId}/recall`);
            if (res.code === 200 || res.code === 0) {
                Toast.success('消息已撤回');
                // WebSocket 会推送撤回通知，这里不需要手动更新 DOM，
                // 但为了响应速度，可以先在本地更新
                this.handleMessageRecalled({
                    message_id: messageId,
                    conversation_id: this.state.currentConversation.id
                });
            } else {
                Toast.error(res.message || '撤回失败');
            }
        } catch (error) {
            console.error('撤回消息失败', error);
            Toast.error('撤回失败');
        }
    }

    /**
     * 上传文件
     */
    async uploadFile(file) {
        if (!this.state.currentConversation) return;

        // 验证文件大小
        const isImage = file.type.startsWith('image/');
        const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024; // 图片10MB，文件50MB

        if (file.size > maxSize) {
            Toast.warning(`文件大小不能超过 ${Math.floor(maxSize / 1024 / 1024)}MB`);
            return;
        }

        const formData = new FormData();
        formData.append('conversation_id', this.state.currentConversation.id);
        formData.append('file', file);
        formData.append('type', isImage ? 'image' : 'file');

        const toastId = Toast.loading('正在上传...');

        try {
            const res = await Api.upload('/im/messages/upload', formData);
            toastId.close();

            if (res.code === 200 || res.code === 0) {
                // 上传成功，调用 handleNewMessage 处理返回的消息对象
                this.handleNewMessage(res.data);
            } else {
                Toast.error(res.message || '上传失败');
            }
        } catch (error) {
            toastId.close();
            console.error('上传文件失败', error);
            Toast.error('上传失败');
        }
    }

    /**
     * 手动追加消息到 DOM
     */
    appendMessageToDom(msg) {
        if (!this.messagesContainer) {
            this.updateRefs();
        }
        if (!this.messagesContainer) return;

        // 移除可能的输入状态指示器
        const typingIndicator = this.messagesContainer.querySelector('.im-typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }

        const msgHtml = this._renderMessageHtml(msg);
        this.messagesContainer.insertAdjacentHTML('beforeend', msgHtml);

        if (typingIndicator) {
            this.messagesContainer.appendChild(typingIndicator);
        }

        this.setTimeout(() => {
            this.scrollToBottom();
        }, 50);

    }

    updateConversationPreview(message) {
        let conversationFound = false;

        const updatedConversations = this.state.conversations.map(c => {
            if (c.id === message.conversation_id) {
                conversationFound = true;
                const isCurrent = this.state.currentConversation && this.state.currentConversation.id === c.id;

                // 构建预览文本
                let preview = '';
                if (message.type === 'image') preview = '[图片]';
                else if (message.type === 'file') preview = '[文件]';
                else preview = message.content;

                if (message.is_recalled) preview = '[消息已撤回]';

                return {
                    ...c,
                    last_message: preview,
                    last_message_time: message.created_at,
                    unread_count: isCurrent ? 0 : (c.unread_count || 0) + 1
                };
            }
            return c;
        });

        // 如果会话在列表中，将其移动到顶部
        if (conversationFound) {
            updatedConversations.sort((a, b) => {
                const timeA = new Date(a.last_message_time || 0).getTime();
                const timeB = new Date(b.last_message_time || 0).getTime();
                return timeB - timeA;
            });

            this.setState({ conversations: updatedConversations });
        } else {
            // 如果是新会话，重新加载列表
            this.loadConversations();
        }
    }

    handleTyping(data) {
        if (data.conversation_id === this.state.currentConversation?.id) {
            const typingUsers = new Set(this.state.typingUsers);
            if (data.is_typing) {
                typingUsers.add(data.user_id);
            } else {
                typingUsers.delete(data.user_id);
            }

            // 更新状态
            this.state.typingUsers = typingUsers;

            // 手动更新 DOM
            this.updateTypingIndicatorDom();

            // 自动清除输入状态（5秒后）
            if (data.is_typing) {
                this.setTimeout(() => {
                    const newTypingUsers = new Set(this.state.typingUsers);
                    if (newTypingUsers.has(data.user_id)) {
                        newTypingUsers.delete(data.user_id);
                        this.state.typingUsers = newTypingUsers;
                        this.updateTypingIndicatorDom();
                    }
                }, 5000);
            }
        }
    }

    /**
     * 更新输入状态指示器 DOM
     */
    updateTypingIndicatorDom() {
        if (!this.messagesContainer) this.updateRefs();
        if (!this.messagesContainer) return;

        let indicator = this.messagesContainer.querySelector('.im-typing-indicator');

        if (this.state.typingUsers.size > 0) {
            if (!indicator) {
                const html = '<div class="im-typing-indicator"><i class="ri-more-2-fill"></i> 正在输入...</div>';
                this.messagesContainer.insertAdjacentHTML('beforeend', html);
                this.scrollToBottom();
            }
        } else {
            if (indicator) {
                indicator.remove();
            }
        }
    }

    handleMessageRecalled(data) {
        if (this.state.currentConversation &&
            data.conversation_id === this.state.currentConversation.id) {

            // 更新状态
            this.state.messages = this.state.messages.map(msg => {
                if (msg.id === data.message_id) {
                    return { ...msg, is_recalled: true, content: '[消息已撤回]' };
                }
                return msg;
            });

            // 全量重绘较为安全，因为撤回不常发生
            this.setState({ messages: this.state.messages });
        }
    }

    /**
     * 标记会话消息已读
     */
    markConversationRead(conversationId) {
        if (typeof WebSocketClient !== 'undefined' && WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.OPEN) {
            // 修复：send方法接收两个参数 (type, data)
            WebSocketClient.send('im_read', {
                conversation_id: conversationId
            });
        }

        // 更新本地会话未读数
        const conversations = this.state.conversations.map(c => {
            if (c.id === conversationId) {
                return { ...c, unread_count: 0 };
            }
            return c;
        });
        this.setState({ conversations });
    }

    /**
     * 发送输入状态通知
     */
    sendTypingStatus(isTyping) {
        if (!this.state.currentConversation) return;

        if (typeof WebSocketClient !== 'undefined' && WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.OPEN) {
            // 修复：send方法接收两个参数 (type, data)
            WebSocketClient.send('im_typing', {
                conversation_id: this.state.currentConversation.id,
                is_typing: isTyping
            });
        }
    }

    async loadOnlineUsers() {
        try {
            const res = await Api.get('/ws/online-users');
            if (res.code === 200 || res.code === 0) {
                const onlineUsers = new Set(res.data.online_users);
                this.state.onlineUsers = onlineUsers;
                this.updateOnlineStatusDom();
            }
        } catch (error) {
            console.error('获取在线用户失败', error);
        }
    }

    updateOnlineStatusDom() {
        const items = this.container.querySelectorAll('.im-conversation-item');
        items.forEach(item => {
            const id = parseInt(item.dataset.id);
            // 这里逻辑简化：实际会话可能是私聊或群聊
            // 如果是私聊，我们可以通过会话关联的用户来判断
            // 暂时假设我们从会话数据中拿到了对方的 user_id
            const conv = this.state.conversations.find(c => c.id === id);
            if (conv && conv.type === 'private' && conv.target_user_id) {
                if (this.state.onlineUsers.has(conv.target_user_id)) {
                    item.classList.add('online');
                } else {
                    item.classList.remove('online');
                }
            }
        });
    }

    scrollToBottom() {
        const container = this.container.querySelector('.im-messages');
        if (container) {
            // 使用平滑滚动增强体验
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * HTML转义，防止XSS攻击
     */
    escapeHtml(text) {
        if (!text) return '';
        if (typeof Utils !== 'undefined' && Utils.escapeHtml) {
            return Utils.escapeHtml(text);
        }
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 获取连接状态图标
     */
    getConnectionStatusIcon() {
        switch (this.state.connectionStatus) {
            case 'connected':
                return '<i class="ri-wifi-line" style="color: var(--color-success);" title="已连接"></i>';
            case 'disconnected':
                return '<i class="ri-wifi-off-line" style="color: var(--color-error);" title="连接断开"></i>';
            default:
                return '<i class="ri-loader-4-line spin" style="color: var(--color-warning);" title="连接中..."></i>';
        }
    }

    getFileIcon(fileName) {
        if (!fileName) return 'ri-file-text-line';
        const ext = fileName.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': 'ri-file-pdf-line im-file-icon-pdf',
            'doc': 'ri-file-word-line im-file-icon-doc',
            'docx': 'ri-file-word-line im-file-icon-doc',
            'xls': 'ri-file-excel-line im-file-icon-xls',
            'xlsx': 'ri-file-excel-line im-file-icon-xls',
            'zip': 'ri-file-zip-line im-file-icon-zip',
            'rar': 'ri-file-zip-line im-file-icon-zip',
            '7z': 'ri-file-zip-line im-file-icon-zip',
            'jpg': 'ri-image-line im-file-icon-img',
            'jpeg': 'ri-image-line im-file-icon-img',
            'png': 'ri-image-line im-file-icon-img',
            'gif': 'ri-image-line im-file-icon-img'
        };
        return iconMap[ext] || 'ri-file-text-line';
    }

    /**
     * 生成单条消息的HTML
     */
    handleContextMenu(e, msg) {
        e.preventDefault();

        // 移除已有的上下文菜单
        this.removeContextMenu();

        const isOwn = msg.sender_id === Store.get('user')?.id;
        const menu = document.createElement('div');
        menu.className = 'im-context-menu';

        let menuHtml = `
            <div class="im-context-menu-item" onclick="window.imPageInstance?.copyMessageText('${this.escapeHtml(msg.content).replace(/'/g, "\\'")}')">
                <i class="ri-file-copy-line"></i> 复制内容
            </div>
            <div class="im-context-menu-item" onclick="window.imPageInstance?.startReply(${msg.id}, '${this.escapeHtml(msg.sender_nickname || msg.sender_username || '用户').replace(/'/g, "\\'")}', '${this.escapeHtml(msg.content.substring(0, 20)).replace(/'/g, "\\'") + (msg.content.length > 20 ? '...' : '')}')">
                <i class="ri-reply-line"></i> 回复
            </div>
        `;

        if (isOwn && !msg.is_recalled) {
            // 检查消息是否在2分钟内（可撤回）
            const isRecallable = (new Date() - new Date(msg.created_at)) < 120000;
            if (isRecallable) {
                menuHtml += `
                    <div class="im-context-menu-item danger" onclick="window.imPageInstance?.recallMessage(${msg.id})">
                        <i class="ri-arrow-go-back-line"></i> 撤回消息
                    </div>
                `;
            }
        }

        menu.innerHTML = menuHtml;
        document.body.appendChild(menu);

        // 定位菜单
        const rect = menu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;

        if (x + rect.width > window.innerWidth) x -= rect.width;
        if (y + rect.height > window.innerHeight) y -= rect.height;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // 点击其他地方关闭菜单
        const closeHandler = (e) => {
            // 如果点击的是菜单项，由菜单项自身的 click 事件处理
            // 如果点击的是外部，则关闭菜单
            this.removeContextMenu();
        };
        // 延迟绑定，避免当前 ContextMenu 事件冒泡触发关闭
        this.setTimeout(() => {
            this.addDocumentEvent('click', closeHandler, { once: true });
        }, 0);
    }

    removeContextMenu() {
        const existing = document.querySelector('.im-context-menu');
        if (existing) existing.remove();
    }

    copyMessageText(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            Toast.success('已复制到剪贴板');
        }).catch(() => {
            Toast.error('复制失败');
        });
        this.removeContextMenu();
    }

    startReply(msgId, senderName, contentPreview) {
        this.state.replyTo = { id: msgId, name: senderName, content: contentPreview };

        const replyBar = this.container.querySelector('#imReplyBar');
        if (replyBar) {
            replyBar.style.display = 'flex';
            this.container.querySelector('#replyToName').textContent = senderName;
            this.container.querySelector('#replyToText').textContent = contentPreview;
            this.container.querySelector('.im-input').focus();
        }
        this.removeContextMenu();
    }

    cancelReply() {
        this.state.replyTo = null;
        const replyBar = this.container.querySelector('#imReplyBar');
        if (replyBar) replyBar.style.display = 'none';
    }

    playNotificationSound() {
        // 播放通知提示音
        try {
            const audio = new Audio('/static/assets/notification.mp3');
            audio.play().catch(() => { });
        } catch (e) { }
    }

    /**
     * 生成单条消息的HTML
     */
    _renderMessageHtml(msg) {
        const isOwn = msg.sender_id === Store.get('user')?.id;
        const isSameSender = msg._isSameSender;

        let contentHtml = '';
        if (msg.is_recalled) {
            contentHtml = '<span class="recalled">[消息已撤回]</span>';
        } else if (msg.type === 'image') {
            try {
                let src = msg.file_path;
                if (!src && typeof msg.content === 'string' && (msg.content.startsWith('{') || msg.content.startsWith('['))) {
                    try {
                        const parsed = JSON.parse(msg.content);
                        if (parsed.file_path) src = parsed.file_path;
                    } catch (e) { }
                } else if (!src) {
                    src = msg.content;
                }

                if (src) {
                    let fullSrc;
                    if (src.startsWith('http') || src.startsWith('/static/')) {
                        fullSrc = src;
                    } else if (src.startsWith('modules/') || src.startsWith('public/')) {
                        fullSrc = `/static/storage/${src}`;
                    } else {
                        fullSrc = `${Api.baseUrl}/${src.replace(/^\//, '')}`;
                    }
                    contentHtml = `<div class="im-msg-image"><img src="${fullSrc}" loading="lazy" /></div>`;
                } else {
                    contentHtml = '[图片无法加载]';
                }
            } catch (e) { contentHtml = '[图片无法加载]'; }
        } else if (msg.type === 'file') {
            try {
                let fileName = msg.file_name || '未命名文件';
                let fileSize = msg.file_size ? Utils.formatBytes(msg.file_size) : '';
                let filePath = msg.file_path || '#';
                let fullPath;
                if (filePath.startsWith('http') || filePath.startsWith('/static/')) {
                    fullPath = filePath;
                } else if (filePath.startsWith('modules/') || filePath.startsWith('public/')) {
                    fullPath = `/static/storage/${filePath}`;
                } else {
                    fullPath = `${Api.baseUrl}/${filePath.replace(/^\//, '')}`;
                }

                contentHtml = `
                    <a href="${fullPath}" target="_blank" class="im-msg-file">
                        <div class="im-msg-file-icon"><i class="${this.getFileIcon(fileName)}"></i></div>
                        <div class="im-msg-file-info">
                            <div class="im-msg-file-name">${this.escapeHtml(fileName)}</div>
                            <div class="im-msg-file-size">${fileSize}</div>
                        </div>
                    </a>
                `;
            } catch (e) { contentHtml = '[文件无法加载]'; }
        } else {
            contentHtml = this.escapeHtml(msg.content);
        }

        // 渲染引用回复（如果存在）
        let replyHtml = '';

        // 检查消息是否在2分钟内（可撤回）
        const isRecallable = (new Date() - new Date(msg.created_at)) < 120000;

        const actionHtml = `
            <div class="im-msg-actions">
                <button class="im-msg-action-btn" title="回复" onclick="window.imPageInstance?.startReply(${msg.id}, '${this.escapeHtml(msg.sender_nickname || msg.sender_username || '用户').replace(/'/g, "\\'")}', '回复...')"><i class="ri-reply-line"></i></button>
                ${(isOwn && !msg.is_recalled && isRecallable) ? `
                <button class="im-msg-action-btn delete" title="撤回">
                    <i class="ri-arrow-go-back-line"></i>
                </button>
                ` : ''}
            </div>
        `;

        // 右键菜单触发区域
        const contextMenuAttr = `oncontextmenu="window.imPageInstance?.handleContextMenu(event, {id:${msg.id}, sender_id:${msg.sender_id}, content:'${this.escapeHtml(msg.content || '').replace(/'/g, "\\'")}', sender_nickname:'${this.escapeHtml(msg.sender_nickname || msg.sender_username).replace(/'/g, "\\'")}', is_recalled:${msg.is_recalled}, created_at:'${msg.created_at}'})"`

        return `
            <div class="im-message ${isOwn ? 'own' : ''} ${isSameSender ? 'same-sender' : ''}" data-id="${msg.id}" style="${msg.state === 'error' ? 'opacity: 0.7;' : ''}">
                ${actionHtml}
                <div class="im-message-avatar">
                   ${msg.sender_avatar ? `<img src="${this.escapeHtml(msg.sender_avatar)}" />` : '<i class="ri-user-3-fill"></i>'}
                   <div class="im-status-dot"></div>
                </div>
                <div class="im-message-content" ${contextMenuAttr}>
                    ${!isSameSender ? `<div class="im-message-sender">
                        ${this.escapeHtml(msg.sender_nickname || msg.sender_username || '用户')}
                    </div>` : ''}
                    <div class="im-message-text">
                        ${contentHtml}
                        ${msg.state === 'error' ? '<i class="ri-error-warning-fill im-msg-retry" title="发送失败，点击重试"></i>' : ''}
                    </div>
                    ${!isSameSender ? `<div class="im-message-time">${this.formatTime(msg.created_at)}</div>` : ''}
                </div>
            </div>
        `;
    }

    render() {
        const { conversations, currentConversation, messages, loading, typingUsers, loadingMore } = this.state;

        return `
            <div class="page-im">
                <div class="im-container">
                    <!-- 会话列表 -->
                    <div class="im-sidebar">
                        <div class="im-sidebar-header">
                            <h2><i class="ri-message-3-line"></i> 即时通讯</h2>
                            <div class="im-header-actions">
                                ${this.getConnectionStatusIcon()}
                                <button class="btn-icon im-contacts-btn" title="联系人">
                                    <i class="ri-user-add-line"></i>
                                </button>
                                ${window.ModuleHelp ? ModuleHelp.createHelpButton('im', '即时通讯') : ''}
                            </div>
                        </div>
                        <div class="im-search-area">
                            <div class="search-group">
                                <input type="text" class="form-input im-search-input" placeholder="搜索会话..." value="${this.state.searchQuery || ''}">
                                <button class="btn btn-primary btn-sm" id="btnIMSearch">
                                    <i class="ri-search-line"></i>
                                </button>
                            </div>
                        </div>
                        <div class="im-conversation-list">
                            ${loading ? '<div class="loading"><i class="ri-loader-4-line spin"></i> 加载中...</div>' : ''}
                            ${conversations.length === 0 && !loading ? '<div class="im-empty-list">暂无会话</div>' : ''}
                            ${conversations.map(conv => `
                                <div class="im-conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" 
                                     data-id="${conv.id}">
                                    <div class="im-conv-avatar">${conv.avatar ? `<img src="${this.escapeHtml(conv.avatar)}" />` : '<i class="ri-user-3-fill"></i>'}</div>
                                    <div class="im-conv-info">
                                        <div class="im-conv-name">${this.escapeHtml(conv.name || '未命名会话')}</div>
                                        <div class="im-conv-preview">${conv.last_message_time ? this.formatTime(conv.last_message_time) : ''}</div>
                                    </div>
                                    ${conv.unread_count > 0 ? `<div class="im-unread-badge">${conv.unread_count > 99 ? '99+' : conv.unread_count}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- 消息区域 -->
                    <div class="im-main">
                        ${currentConversation ? `
                            <div class="im-header">
                                <div class="im-header-info">
                                    <div class="im-header-avatar">${currentConversation.avatar ? `<img src="${this.escapeHtml(currentConversation.avatar)}" />` : '<i class="ri-user-3-fill"></i>'}</div>
                                    <div class="im-header-name">${this.escapeHtml(currentConversation.name || '未命名会话')}</div>
                                </div>
                                <div class="im-header-actions">
                                    <button class="btn-icon im-settings-btn" title="会话设置"><i class="ri-settings-3-line"></i></button>
                                </div>
                            </div>
                            
                            <div class="im-messages">
                                ${loadingMore ? '<div class="im-loading-more"><i class="ri-loader-4-line spin"></i> 加载更多...</div>' : ''}
                                ${messages.map((msg, index) => {
            // 消息分组逻辑：如果是同一发件人且时间间隔小于 2 分钟，则合并显示
            const prevMsg = messages[index - 1];
            let isSameSender = false;
            if (prevMsg && prevMsg.sender_id === msg.sender_id && !prevMsg.is_recalled && !msg.is_recalled) {
                const timeDiff = new Date(msg.created_at) - new Date(prevMsg.created_at);
                if (timeDiff < 120000) { // 2分钟内
                    isSameSender = true;
                }
            }
            // 记录是否同一组，用于渲染
            msg._isSameSender = isSameSender;
            return this._renderMessageHtml(msg);
        }).join('')}
                                ${typingUsers.size > 0 ? '<div class="im-typing-indicator"><i class="ri-more-2-fill"></i> 正在输入...</div>' : ''}
                            </div>
                            
                            <div class="im-input-area-wrapper" style="display:flex; flex-direction:column; background:var(--color-bg-secondary); border-top:1px solid var(--color-border);">
                                <!-- 回复栏 -->
                                <div class="im-reply-bar" style="display:none;" id="imReplyBar">
                                    <i class="ri-reply-fill" style="color:var(--color-primary)"></i>
                                    <div class="reply-content">回复 <span id="replyToName" style="font-weight:600"></span>: <span id="replyToText"></span></div>
                                    <button class="btn-close-reply" onclick="window.imPageInstance?.cancelReply()"><i class="ri-close-line"></i></button>
                                </div>

                                <div class="im-input-area" style="border-top:none;">
                                    <div class="im-emoji-panel">
                                        <div class="im-emoji-list">
                                            ${EMOJIS.map(emoji => `<div class="im-emoji-item">${emoji}</div>`).join('')}
                                        </div>
                                    </div>
                                    <textarea class="im-input" placeholder="输入消息..." 
                                              onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.imPageInstance?.sendMessage(this.value); }"
                                              oninput="window.imPageInstance?.sendTypingStatus(true)"></textarea>
                                    <div class="im-input-actions">
                                        <button class="btn-icon im-emoji-btn" title="表情"><i class="ri-emotion-line"></i></button>
                                        <button class="btn-icon im-attach-btn" title="附件"><i class="ri-attachment-line"></i></button>
                                        <input type="file" id="imFileInput" style="display: none">
                                        <button class="btn-primary im-send-btn"><i class="ri-send-plane-fill"></i> 发送</button>
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <div class="im-empty">
                                <div class="im-empty-icon"><i class="ri-message-3-line"></i></div>
                                <div class="im-empty-text">选择一个会话开始聊天</div>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}


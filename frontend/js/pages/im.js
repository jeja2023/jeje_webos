/**
 * 即时通讯页面
 */

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
            page: 1,
            hasMore: true,
            typingUsers: new Set()
        };

        this.messageInput = null;
        this.messagesContainer = null;

        // 设置全局实例引用
        window.imPageInstance = this;
    }

    toggleContacts() {
        this.setState({ showContacts: !this.state.showContacts });
    }

    async afterMount() {
        await this.loadConversations();
        this.setupWebSocketListeners();

        // 绑定refs
        setTimeout(() => {
            this.messageInput = this.container.querySelector('.im-input');
            this.messagesContainer = this.container.querySelector('.im-messages');
        }, 0);
    }

    setupWebSocketListeners() {
        // 监听WebSocket消息
        if (typeof WebSocketClient !== 'undefined') {
            WebSocketClient.on('im_message_new', (data) => {
                this.handleNewMessage(data.data);
            });

            WebSocketClient.on('im_message_read_notify', (data) => {
                // 处理已读通知
            });

            WebSocketClient.on('im_typing', (data) => {
                this.handleTyping(data.data);
            });

            WebSocketClient.on('im_message_recalled', (data) => {
                this.handleMessageRecalled(data.data);
            });
        }
    }

    async loadConversations() {
        try {
            this.setState({ loading: true });
            const res = await Api.get('/im/conversations', {
                page: 1,
                page_size: 20
            });

            if (res.code === 200) {
                this.setState({
                    conversations: res.data.items || [],
                    loading: false
                });

                // 如果有会话，默认打开第一个
                if (res.data.items && res.data.items.length > 0 && !this.state.currentConversation) {
                    this.selectConversation(res.data.items[0].id);
                }
            }
        } catch (error) {
            Config.error('加载会话列表失败', error);
            this.setState({ loading: false });
        }
    }

    async selectConversation(conversationId) {
        try {
            // 获取会话详情
            const res = await Api.get(`/im/conversations/${conversationId}`);
            if (res.code === 200) {
                this.setState({ currentConversation: res.data });
                await this.loadMessages(conversationId);
            }
        } catch (error) {
            Config.error('加载会话失败', error);
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

            if (res.code === 200) {
                const newMessages = res.data.items || [];
                this.setState({
                    messages: [...newMessages, ...this.state.messages],
                    hasMore: res.data.has_more
                });

                // 滚动到底部
                setTimeout(() => {
                    this.scrollToBottom();
                }, 0);
            }
        } catch (error) {
            Config.error('加载消息失败', error);
        }
    }

    async sendMessage(content, type = 'text') {
        if (!content || !content.trim()) return;
        if (!this.state.currentConversation) {
            Toast.warning('请先选择一个会话');
            return;
        }

        try {
            const messageData = {
                conversation_id: this.state.currentConversation.id,
                type: type,
                content: content.trim()
            };

            // 通过WebSocket发送
            if (typeof WebSocketClient !== 'undefined' && WebSocketClient.ws && WebSocketClient.ws.readyState === WebSocket.OPEN) {
                WebSocketClient.send({
                    type: 'im_send',
                    data: messageData
                });
            } else {
                // 降级到HTTP
                const res = await Api.post('/im/messages', messageData);
                if (res.code === 200) {
                    this.handleNewMessage(res.data);
                }
            }

            // 清空输入框
            if (this.messageInput) {
                this.messageInput.value = '';
            }
        } catch (error) {
            Config.error('发送消息失败', error);
            Toast.error('发送消息失败');
        }
    }

    handleNewMessage(message) {
        // 如果是当前会话的消息，添加到消息列表
        if (this.state.currentConversation &&
            message.conversation_id === this.state.currentConversation.id) {
            this.setState({
                messages: [...this.state.messages, message]
            });

            setTimeout(() => {
                this.scrollToBottom();
            }, 0);
        }

        // 更新会话列表
        this.loadConversations();
    }

    handleTyping(data) {
        if (data.conversation_id === this.state.currentConversation?.id) {
            if (data.is_typing) {
                this.state.typingUsers.add(data.user_id);
            } else {
                this.state.typingUsers.delete(data.user_id);
            }
            this.setState({ typingUsers: new Set(this.state.typingUsers) });
        }
    }

    handleMessageRecalled(data) {
        if (this.state.currentConversation &&
            data.conversation_id === this.state.currentConversation.id) {
            const messages = this.state.messages.map(msg => {
                if (msg.id === data.message_id) {
                    return { ...msg, is_recalled: true, content: '[消息已撤回]' };
                }
                return msg;
            });
            this.setState({ messages });
        }
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    formatTime(timestamp) {
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
        // 使用Utils.escapeHtml如果存在，否则使用简单实现
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

    render() {
        const { conversations, currentConversation, messages, loading, typingUsers } = this.state;

        return `
            <div class="page-im">
                <div class="im-container">
                    <!-- 会话列表 -->
                    <div class="im-sidebar">
                        <div class="im-sidebar-header">
                            <h2>💬 即时通讯</h2>
                            <button class="btn-icon" onclick="window.imPageInstance?.toggleContacts()" title="联系人">
                                👥
                            </button>
                        </div>
                        <div class="im-conversation-list">
                            ${loading ? '<div class="loading">加载中...</div>' : ''}
                            ${conversations.map(conv => `
                                <div class="im-conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" 
                                     onclick="window.imPageInstance?.selectConversation(${conv.id})">
                                    <div class="im-conv-avatar">${conv.avatar ? `<img src="${conv.avatar}" />` : '👤'}</div>
                                    <div class="im-conv-info">
                                        <div class="im-conv-name">${conv.name || '未命名会话'}</div>
                                        <div class="im-conv-preview">${conv.last_message_time ? this.formatTime(conv.last_message_time) : ''}</div>
                                    </div>
                                    ${conv.unread_count > 0 ? `<div class="im-unread-badge">${conv.unread_count}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- 消息区域 -->
                    <div class="im-main">
                        ${currentConversation ? `
                            <div class="im-header">
                                <div class="im-header-info">
                                    <div class="im-header-avatar">${currentConversation.avatar ? `<img src="${currentConversation.avatar}" />` : '👤'}</div>
                                    <div class="im-header-name">${currentConversation.name || '未命名会话'}</div>
                                </div>
                            </div>
                            
                            <div class="im-messages" ref="messagesContainer" data-ref="messagesContainer">
                                ${messages.map(msg => `
                                    <div class="im-message ${msg.sender_id === Store.get('user')?.id ? 'own' : ''}">
                                        <div class="im-message-avatar">${msg.sender_avatar ? `<img src="${msg.sender_avatar}" />` : '👤'}</div>
                                        <div class="im-message-content">
                                            <div class="im-message-sender">${msg.sender_nickname || msg.sender_username || '用户'}</div>
                                            <div class="im-message-text">${msg.is_recalled ? '<span class="recalled">[消息已撤回]</span>' : this.escapeHtml(msg.content)}</div>
                                            <div class="im-message-time">${this.formatTime(msg.created_at)}</div>
                                        </div>
                                    </div>
                                `).join('')}
                                ${typingUsers.size > 0 ? '<div class="im-typing-indicator">正在输入...</div>' : ''}
                            </div>
                            
                            <div class="im-input-area">
                                <textarea ref="messageInput" class="im-input" placeholder="输入消息..." 
                                          onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.imPageInstance?.sendMessage(this.value); }"></textarea>
                                <div class="im-input-actions">
                                    <button class="btn-icon" onclick="window.imPageInstance?.sendMessage(window.imPageInstance?.messageInput?.value || '')" title="发送">📤</button>
                                </div>
                            </div>
                        ` : `
                            <div class="im-empty">
                                <div class="im-empty-icon">💬</div>
                                <div class="im-empty-text">选择一个会话开始聊天</div>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}


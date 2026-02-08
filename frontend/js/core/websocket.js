/**
 * WebSocket 客户端
 * 提供实时通信功能
 */

const WebSocketClient = {
    heartbeatTimeout: null,
    lastPingTime: 0,
    listeners: {},

    /**
     * 连接 WebSocket
     */
    connect() {
        // 如果已经连接或是正在建立，不要重复连接
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        const token = localStorage.getItem(Config.storageKeys.token);
        if (!token) {
            Config.log('WebSocket: 无 token，跳过连接');
            return;
        }

        // 构建 WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/ws?token=${token}`;

        Config.log('WebSocket: 正在连接...', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                Config.log('WebSocket: 连接成功');
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.emit('connected');

                // 请求浏览器通知权限
                this.requestNotificationPermission();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'pong') {
                        // 清除心跳超时器
                        if (this.heartbeatTimeout) {
                            clearTimeout(this.heartbeatTimeout);
                            this.heartbeatTimeout = null;
                        }
                        return;
                    }
                    Config.log('WebSocket: 收到消息', data);
                    this.handleMessage(data);
                } catch (e) {
                    Config.error('WebSocket: 解析消息失败', e);
                }
            };

            this.ws.onclose = (event) => {
                Config.log('WebSocket: 连接关闭', event.code, event.reason);
                this.stopHeartbeat();
                this.emit('disconnected');

                // 1008 是认证失败（由后端关闭），这种情况下不要盲目重连，可能需要刷新 Token
                if (event.code === 1008) {
                    Config.error('WebSocket: 认证失败或 Token 过期');
                    return;
                }

                // 非正常关闭时尝试重连
                if (event.code !== 1000) {
                    this.reconnect();
                }
            };

            this.ws.onerror = (error) => {
                Config.error('WebSocket: 错误', error);
                this.emit('error', error);
            };
        } catch (e) {
            Config.error('WebSocket: 创建连接失败', e);
        }
    },

    /**
     * 断开连接
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
    },

    /**
     * 重新连接
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            Config.warn('WebSocket: 已达到最大重连次数，停止自动重连');
            return;
        }

        this.reconnectAttempts++;
        // 指数退避：每次重连等待时间翻倍，最高 30s
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        Config.log(`WebSocket: 将在 ${delay / 1000}s 后尝试第 ${this.reconnectAttempts} 次重连`);

        setTimeout(() => {
            if (this.reconnectAttempts > 0) { // 避免重置 attempts 后仍触发
                this.connect();
            }
        }, delay);
    },

    /**
     * 发送消息
     */
    send(type, data) {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN)) {
            this.ws.send(JSON.stringify({ type, data }));
        } else {
            Config.log('WebSocket: 未在线，跳过消息发送', type);
        }
    },

    /**
     * 处理收到的消息
     */
    handleMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'pong':
                // 已在 onmessage 中处理
                break;

            case 'notification':
                // 新通知
                this.handleNotification(data);
                break;

            case 'broadcast':
                // 广播消息
                Toast.info(data.message || data.content);
                break;

            case 'system':
                // 系统消息
                Config.log('WebSocket: 系统消息', data);
                break;

            case 'schedule_reminder':
                // 日程提醒
                this.handleScheduleReminder(data);
                break;

            case 'system.settings_updated':
                // 系统设置变更
                this.handleSettingsUpdated(data);
                break;

            case 'system.backup_status':
                // 备份状态更新 - 触发自定义监听器
                this.emit('system.backup_status', data);
                break;

            default:
                // 触发自定义监听器
                this.emit(type, data);
        }
    },

    /**
     * 处理系统设置更新
     */
    handleSettingsUpdated(data) {
        Config.log('WebSocket: 收到系统设置更新', data);

        // 更新 Store 中的系统设置
        if (data && typeof Store !== 'undefined') {
            Store.setSystemSettings(data);
            Toast.info('系统设置已更新', 3000);
        }
    },

    /**
     * 处理日程提醒
     */
    handleScheduleReminder(data) {
        // 构建提醒时间描述
        let timeDesc = '';
        if (data.is_all_day) {
            timeDesc = '全天事件';
        } else if (data.start_time) {
            timeDesc = `${data.start_date} ${data.start_time}`;
        } else {
            timeDesc = data.start_date;
        }

        // 根据提前分钟数构建描述
        let reminderDesc = '';
        if (data.remind_before_minutes === 0) {
            reminderDesc = '现在开始';
        } else if (data.remind_before_minutes < 60) {
            reminderDesc = `${data.remind_before_minutes}分钟后开始`;
        } else if (data.remind_before_minutes === 60) {
            reminderDesc = '1小时后开始';
        } else if (data.remind_before_minutes === 1440) {
            reminderDesc = '明天开始';
        } else {
            reminderDesc = `${data.remind_before_minutes}分钟后开始`;
        }

        // 显示 Toast 提醒
        Toast.warning(`📅 ${data.title} - ${reminderDesc}`, 8000);

        // 显示系统通知（如果浏览器支持）
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('日程提醒', {
                body: `${data.title}\n${timeDesc}${data.location ? ' · ' + data.location : ''}`,
                icon: '/images/logo.jpg',
                tag: `schedule-${data.event_id}`,
                requireInteraction: true
            });

            notification.onclick = () => {
                window.focus();
                // 跳转到日程页面
                if (window.Router) {
                    Router.navigate(`/schedule?event=${data.event_id}`);
                }
                notification.close();
            };
        }

        // 触发日程提醒事件
        this.emit('schedule_reminder', data);
    },

    /**
     * 请求浏览器通知权限
     */
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                Config.log('浏览器通知权限:', permission);
            });
        }
    },

    /**
     * 显示浏览器原生通知
     */
    showBrowserNotification(title, body, options = {}) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                icon: '/static/images/logo.png',
                tag: options.tag || `notification-${Date.now()}`,
                requireInteraction: options.requireInteraction || false
            });

            notification.onclick = () => {
                window.focus();
                if (options.url && window.Router) {
                    Router.push(options.url);
                } else {
                    Router.push('/notifications');
                }
                notification.close();
            };

            // 5秒后自动关闭
            setTimeout(() => notification.close(), 5000);
        }
    },

    /**
     * 处理通知消息
     */
    async handleNotification(data) {
        // 更新未读数（从服务器获取最新计数）
        try {
            if (window.NotificationApi) {
                const res = await NotificationApi.unreadCount();
                const count = res.data?.count || res.count || 0;
                Store.set('unreadMessages', count);
                Store.set('unreadNotifications', count);
            } else {
                // 如果没有API，则乐观更新
                const currentCount = Store.get('unreadMessages') || 0;
                Store.set('unreadMessages', currentCount + 1);
                Store.set('unreadNotifications', currentCount + 1);
            }
        } catch (e) {
            // 如果获取失败，使用乐观更新
            const currentCount = Store.get('unreadMessages') || 0;
            Store.set('unreadMessages', currentCount + 1);
            Store.set('unreadNotifications', currentCount + 1);
        }

        // 显示 Toast
        const typeMap = {
            'info': () => Toast.info(data.title || data.content),
            'success': () => Toast.success(data.title || data.content),
            'warning': () => Toast.warning(data.title || data.content),
            'error': () => Toast.error(data.title || data.content)
        };

        (typeMap[data.type] || typeMap.info)();

        // 对于重要通知（警告、错误），显示浏览器原生通知
        if (data.type === 'warning' || data.type === 'error') {
            const iconPrefix = data.type === 'warning' ? '⚠️ ' : '❌ ';
            this.showBrowserNotification(
                iconPrefix + (data.title || '系统通知'),
                data.content || '',
                {
                    tag: `notification-${data.id || Date.now()}`,
                    url: data.action_url,
                    requireInteraction: data.type === 'error'
                }
            );
        }

        // 触发通知事件（其他组件可以监听此事件）
        this.emit('notification', data);

        // 如果当前在通知页面，刷新通知列表
        if (window.currentPage && window.currentPage.constructor &&
            (window.currentPage.constructor.name === 'NotificationsPage' ||
                window.currentPage.constructor.name === 'MessagesPage') &&
            typeof window.currentPage.loadData === 'function') {
            window.currentPage.loadData();
        }
    },

    /**
     * 开始心跳
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send('ping', {});

                // 设置超时检测：10秒内没收到 pong 就断开重连
                this.heartbeatTimeout = setTimeout(() => {
                    Config.warn('WebSocket: 心跳超时，正在断开重连...');
                    if (this.ws) {
                        this.ws.close(4000, 'Heartbeat timeout');
                    }
                }, 10000);
            }
        }, 30000); // 每30秒发送心跳
    },

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    },

    /**
     * 注册事件监听器
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    },

    /**
     * 移除事件监听器
     */
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    },

    /**
     * 触发事件
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    Config.error('WebSocket: 事件处理错误', e);
                }
            });
        }
    },

    /**
     * 检查连接状态
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
};



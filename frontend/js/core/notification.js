/**
 * 系统通知服务 (SystemNotification)
 * 用于发送通知，支持 Toast 提示和通知中心持久化
 */
const SystemNotification = {
    /**
     * 发送通知
     * @param {string} title 标题
     * @param {string} content 内容
     * @param {string} type 类型: info, success, warning, error
     * @param {string} url 跳转链接 (可选)
     */
    async push(title, content = '', type = 'info', url = null) {
        // 1. 持久化到消息中心
        // 注意：不再直接显示 Toast，而是等待后端 WebSocket 推送，避免双重通知
        try {
            const user = Store.get('user');
            if (!user) {
                // 未登录情况下，回退到直接显示 Toast
                const toastType = type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info');
                const toastMsg = content ? `${title}: ${content}` : title;
                Toast[toastType](toastMsg);
                return;
            }

            // 发送给当前用户自己
            await NotificationApi.create({
                user_id: user.id,
                title: title,
                content: content,
                type: type,
                action_url: url
            });

            // 3. 更新未读计数
            // 后端 WebSocket 或轮询逻辑会更新 Store，这里也可以乐观更新
            // this.refreshUnreadCount(); 

        } catch (e) {
            console.warn('保存通知失败', e);
            // 失败时降级显示 Toast
            const toastType = type === 'error' ? 'error' : 'info';
            Toast[toastType](title + (content ? `: ${content}` : ''));
        }
    },

    /**
     * 更新未读消息计数
     */
    async refreshUnreadCount() {
        try {
            const res = await NotificationApi.unreadCount();
            const count = res.data?.count || res.count || 0;
            Store.set('unreadMessages', count);
        } catch (e) {
            // ignore
        }
    },

    // 便捷方法
    success(title, content, url) { this.push(title, content, 'success', url); },
    info(title, content, url) { this.push(title, content, 'info', url); },
    warning(title, content, url) { this.push(title, content, 'warning', url); },
    error(title, content, url) { this.push(title, content, 'error', url); },

    // 特定场景方法
    notifyFileUpload(filename, success = true) {
        if (success) {
            this.success('文件上传成功', filename, '/filemanager');
        } else {
            this.error('文件上传失败', filename);
        }
    },

    notifyAppInstall(appName, success = true) {
        if (success) {
            this.success('应用安装成功', `${appName} 已安装`, '/apps');
        } else {
            this.error('应用安装失败', appName);
        }
    }
};

// 暴露到全局
window.SystemNotification = SystemNotification;

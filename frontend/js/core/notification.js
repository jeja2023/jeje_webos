/**
 * 系统通知服务 (SystemNotification)
 * 用于发送系统级通知，支持 Toast 提示和消息中心持久化
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
        // 1. 显示即时 Toast 提示
        // 映射 type 到 Toast 支持的方法
        const toastType = type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info');

        // 如果是 success 类型，且没有具体 content，只显示 title
        const toastMsg = content ? `${title}: ${content}` : title;
        Toast[toastType](toastMsg);

        // 2. 持久化到消息中心
        try {
            const user = Store.get('user');
            if (!user) return; // 未登录不保存

            // 发送给当前用户自己
            await MessageApi.create({
                user_id: user.id,
                title: title,
                content: content,
                type: type,
                action_url: url
            });

            // 3. 更新未读计数
            // 后端 WebSocket 或轮询逻辑会更新 Store，这里也可以乐观更新
            this.refreshUnreadCount();

        } catch (e) {
            console.warn('保存通知失败', e);
        }
    },

    /**
     * 更新未读消息计数
     */
    async refreshUnreadCount() {
        try {
            const res = await MessageApi.unreadCount();
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

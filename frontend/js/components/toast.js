/**
 * 消息提示组件
 */

const Toast = {
    container: null,
    
    /**
     * 初始化容器
     */
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    
    /**
     * 显示消息
     */
    show(message, type = 'info', duration = 3000) {
        this.init();
        
        const id = Utils.uniqueId('toast-');
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const html = `
            <div class="toast ${type}" id="${id}">
                <span class="toast-icon">${icons[type]}</span>
                <span class="toast-message">${Utils.escapeHtml(message)}</span>
            </div>
        `;
        
        this.container.insertAdjacentHTML('beforeend', html);
        
        const toast = document.getElementById(id);
        
        // 自动关闭
        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
        
        // 点击关闭
        toast.addEventListener('click', () => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        });
        
        return id;
    },
    
    /**
     * 成功消息
     */
    success(message, duration) {
        return this.show(message, 'success', duration);
    },
    
    /**
     * 错误消息
     */
    error(message, duration) {
        return this.show(message, 'error', duration);
    },
    
    /**
     * 警告消息
     */
    warning(message, duration) {
        return this.show(message, 'warning', duration);
    },
    
    /**
     * 信息消息
     */
    info(message, duration) {
        return this.show(message, 'info', duration);
    },
    
    /**
     * 清除所有消息
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
};




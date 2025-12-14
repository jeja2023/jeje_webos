/**
 * 组件基类
 * 提供基础的渲染和生命周期管理
 */

class Component {
    constructor(container) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.state = {};
        this.props = {};
        this._mounted = false;  // 标记是否已挂载
        this._listeners = [];   // 存储绑定的事件监听器以便销毁
    }

    /**
     * 设置状态并重新渲染
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.update();
    }

    /**
     * 设置属性
     */
    setProps(props) {
        this.props = { ...this.props, ...props };
    }

    /**
     * 渲染HTML模板
     */
    render() {
        return '';
    }

    /**
     * 挂载到DOM（首次挂载）
     */
    mount() {
        if (this.container) {
            this.container.innerHTML = this.render();
            if (!this._mounted) {
                this._mounted = true;
                this.afterMount();  // 仅首次挂载时调用
            }
            this.afterUpdate();  // 每次更新后调用
        }
    }

    /**
     * 更新DOM（状态变化时）
     */
    update() {
        if (this.container) {
            this.container.innerHTML = this.render();
            this.afterUpdate();  // 仅调用更新钩子，不调用afterMount
        }
    }

    /**
     * 首次挂载后的钩子（仅调用一次）
     */
    afterMount() { }

    /**
     * 每次更新后的钩子
     */
    afterUpdate() { }

    /**
     * 销毁组件
     */
    destroy() {
        // 移除所有绑定的事件监听器
        if (this._listeners) {
            this._listeners.forEach(({ element, event, handler }) => {
                element?.removeEventListener(event, handler);
            });
            this._listeners = [];
        }

        if (this.container) {
            this.container.innerHTML = '';
            // 清除自定义属性绑定标记，允许重建
            const keys = Object.keys(this.container).filter(k => k.startsWith('_bind'));
            keys.forEach(k => delete this.container[k]);
        }
    }

    /**
     * 查询元素
     */
    $(selector) {
        return this.container?.querySelector(selector);
    }

    /**
     * 查询多个元素
     */
    $$(selector) {
        return this.container?.querySelectorAll(selector);
    }

    /**
     * 绑定事件
     */
    on(selector, event, handler) {
        const elements = typeof selector === 'string'
            ? this.$$(selector)
            : [selector];
        elements.forEach(el => {
            if (el) {
                el.addEventListener(event, handler);
                // 记录非委托的直接绑定（如果在 destroy 前元素被移除也没关系，removeEventListener 不会报错）
                // 但通常组件内元素在 destroy 时会被 innerHTML='' 清除，所以手动移除主要是为了避免内存泄漏（如果元素还引用着）
                // 对于组件内部元素，直接绑定可能不需要太担心，主要问题在 delegate 绑定在 container 上
            }
        });
    }

    /**
     * 事件委托
     */
    delegate(event, selector, handler) {
        if (!this.container) return;

        const wrapper = (e) => {
            const target = e.target.closest(selector);
            if (target && this.container.contains(target)) {
                handler.call(target, e, target);
            }
        };

        this.container.addEventListener(event, wrapper);
        // 记录到 _listeners 以便销毁
        this._listeners.push({ element: this.container, event, handler: wrapper });
    }
}

/**
 * 工具函数
 */
const Utils = {
    /**
     * 防抖
     */
    debounce(fn, delay = 300) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 节流
     */
    throttle(fn, delay = 300) {
        let last = 0;
        return function (...args) {
            const now = Date.now();
            if (now - last >= delay) {
                last = now;
                fn.apply(this, args);
            }
        };
    },

    /**
     * 格式化日期
     */
    formatDate(date, format = 'YYYY-MM-DD HH:mm') {
        if (!date) return '';
        const d = new Date(date);
        const pad = n => String(n).padStart(2, '0');

        return format
            .replace('YYYY', d.getFullYear())
            .replace('MM', pad(d.getMonth() + 1))
            .replace('DD', pad(d.getDate()))
            .replace('HH', pad(d.getHours()))
            .replace('mm', pad(d.getMinutes()))
            .replace('ss', pad(d.getSeconds()));
    },

    /**
     * 相对时间
     */
    timeAgo(date) {
        if (!date) return '';
        const now = Date.now();
        const diff = now - new Date(date).getTime();

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const week = 7 * day;
        const month = 30 * day;

        if (diff < minute) return '刚刚';
        if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
        if (diff < day) return `${Math.floor(diff / hour)}小时前`;
        if (diff < week) return `${Math.floor(diff / day)}天前`;
        if (diff < month) return `${Math.floor(diff / week)}周前`;

        return this.formatDate(date, 'YYYY-MM-DD');
    },

    /**
     * 转义HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * 生成唯一ID
     */
    uniqueId(prefix = '') {
        return prefix + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 深拷贝
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 截取字符串
     */
    truncate(str, length, suffix = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length) + suffix;
    },

    /**
     * 渲染分页组件
     * @param {number} page - 当前页码
     * @param {number} totalPages - 总页数
     * @param {object} options - 配置选项
     * @returns {string} 分页HTML
     */
    renderPagination(page, totalPages, options = {}) {
        if (totalPages <= 1) return '';

        const {
            maxVisible = 5,  // 最多显示的页码数
            showFirstLast = true,  // 是否显示首页/末页
            firstText = '«',
            lastText = '»',
            prevText = '‹',
            nextText = '›'
        } = options;

        let buttons = [];

        // 首页按钮
        if (showFirstLast) {
            buttons.push(`<button class="pagination-btn pagination-first" ${page <= 1 ? 'disabled' : ''} data-page="1" title="首页">${firstText}</button>`);
        }

        // 上一页按钮
        buttons.push(`<button class="pagination-btn pagination-prev" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" title="上一页">${prevText}</button>`);

        // 计算显示的页码范围
        let startPage = 1;
        let endPage = totalPages;

        if (totalPages > maxVisible) {
            const half = Math.floor(maxVisible / 2);
            startPage = Math.max(1, page - half);
            endPage = Math.min(totalPages, startPage + maxVisible - 1);

            // 调整起始页，确保显示足够的页码
            if (endPage - startPage + 1 < maxVisible) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }
        }

        // 显示省略号和第一页
        if (startPage > 1) {
            buttons.push(`<button class="pagination-btn" data-page="1">1</button>`);
            if (startPage > 2) {
                buttons.push(`<span class="pagination-ellipsis">...</span>`);
            }
        }

        // 页码按钮
        for (let i = startPage; i <= endPage; i++) {
            if (i === 1 && startPage > 1) continue; // 已经显示了第一页
            if (i === totalPages && endPage < totalPages) continue; // 将显示最后一页
            buttons.push(`<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
        }

        // 显示省略号和最后一页
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                buttons.push(`<span class="pagination-ellipsis">...</span>`);
            }
            buttons.push(`<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`);
        }

        // 下一页按钮
        buttons.push(`<button class="pagination-btn pagination-next" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}" title="下一页">${nextText}</button>`);

        // 末页按钮
        if (showFirstLast) {
            buttons.push(`<button class="pagination-btn pagination-last" ${page >= totalPages ? 'disabled' : ''} data-page="${totalPages}" title="末页">${lastText}</button>`);
        }

        return `<div class="pagination">${buttons.join('')}</div>`;
    }
};

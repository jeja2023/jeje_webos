/**
 * 图片懒加载工具
 * 基于 IntersectionObserver 实现高性能图片懒加载
 */
const LazyLoader = {
    // 观察器实例
    observer: null,

    // 是否已初始化
    initialized: false,

    // 默认配置
    config: {
        // 根元素边距，提前加载即将进入视口的图片
        rootMargin: '100px 0px',
        // 触发阈值
        threshold: 0.01,
        // 加载动画类名
        loadingClass: 'lazy-loading',
        // 加载完成类名
        loadedClass: 'lazy-loaded',
        // 加载失败类名
        errorClass: 'lazy-error',
        // 默认占位图（可选）
        placeholder: null,
        // 错误占位图
        errorPlaceholder: '/static/images/default-avatar.png'
    },

    /**
     * 初始化懒加载器
     * @param {Object} customConfig - 自定义配置
     */
    init(customConfig = {}) {
        if (this.initialized) return;

        // 合并配置
        this.config = { ...this.config, ...customConfig };

        // 检查浏览器支持
        if (!('IntersectionObserver' in window)) {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('[LazyLoader] 浏览器不支持 IntersectionObserver，将立即加载所有图片');
            this.loadAllImages();
            return;
        }

        // 创建观察器
        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            {
                rootMargin: this.config.rootMargin,
                threshold: this.config.threshold
            }
        );

        this.initialized = true;
        Config.log('图片懒加载器初始化完成');

        // 自动观察现有的懒加载图片
        this.observeAll();

        // 监听 DOM 变化，自动观察新添加的图片
        this.setupMutationObserver();
    },

    /**
     * 处理交叉观察回调
     * @param {IntersectionObserverEntry[]} entries 
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.loadImage(entry.target);
                this.observer.unobserve(entry.target);
            }
        });
    },

    /**
     * 加载单张图片
     * @param {HTMLElement} element - 图片元素或包含 data-src 的元素
     */
    loadImage(element) {
        const src = element.dataset.src || element.dataset.lazySrc;
        if (!src) return;

        // 添加加载中状态
        element.classList.add(this.config.loadingClass);

        if (element.tagName === 'IMG') {
            // 直接加载 img 标签
            this.loadImgElement(element, src);
        } else {
            // 加载背景图片
            this.loadBackgroundImage(element, src);
        }
    },

    /**
     * 加载 img 元素
     * @param {HTMLImageElement} img 
     * @param {string} src 
     */
    loadImgElement(img, src) {
        // 创建临时图片进行预加载
        const tempImg = new Image();

        tempImg.onload = () => {
            img.src = src;
            img.removeAttribute('data-src');
            img.removeAttribute('data-lazy-src');
            img.classList.remove(this.config.loadingClass);
            img.classList.add(this.config.loadedClass);

            // 触发自定义加载完成事件
            img.dispatchEvent(new CustomEvent('lazyloaded', { detail: { src } }));
        };

        tempImg.onerror = () => {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('[LazyLoader] 图片加载失败:', src);
            if (this.config.errorPlaceholder) {
                img.src = this.config.errorPlaceholder;
            }
            img.classList.remove(this.config.loadingClass);
            img.classList.add(this.config.errorClass);

            // 触发自定义加载失败事件
            img.dispatchEvent(new CustomEvent('lazyerror', { detail: { src } }));
        };

        tempImg.src = src;
    },

    /**
     * 加载背景图片
     * @param {HTMLElement} element 
     * @param {string} src 
     */
    loadBackgroundImage(element, src) {
        const tempImg = new Image();

        tempImg.onload = () => {
            element.style.backgroundImage = `url('${src}')`;
            element.removeAttribute('data-src');
            element.removeAttribute('data-lazy-src');
            element.classList.remove(this.config.loadingClass);
            element.classList.add(this.config.loadedClass);

            element.dispatchEvent(new CustomEvent('lazyloaded', { detail: { src } }));
        };

        tempImg.onerror = () => {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('[LazyLoader] 背景图片加载失败:', src);
            if (this.config.errorPlaceholder) {
                element.style.backgroundImage = `url('${this.config.errorPlaceholder}')`;
            }
            element.classList.remove(this.config.loadingClass);
            element.classList.add(this.config.errorClass);

            element.dispatchEvent(new CustomEvent('lazyerror', { detail: { src } }));
        };

        tempImg.src = src;
    },

    /**
     * 观察所有带有 data-src 或 data-lazy-src 属性的元素
     */
    observeAll() {
        if (!this.observer) return;

        const lazyElements = document.querySelectorAll('[data-src], [data-lazy-src]');
        lazyElements.forEach(el => {
            // 跳过已加载的元素
            if (!el.classList.contains(this.config.loadedClass)) {
                this.observer.observe(el);
            }
        });
    },

    /**
     * 手动观察指定元素
     * @param {HTMLElement} element 
     */
    observe(element) {
        if (!this.observer) {
            this.init();
        }
        if (element && (element.dataset.src || element.dataset.lazySrc)) {
            this.observer.observe(element);
        }
    },

    /**
     * 停止观察指定元素
     * @param {HTMLElement} element 
     */
    unobserve(element) {
        if (this.observer && element) {
            this.observer.unobserve(element);
        }
    },

    /**
     * 立即加载所有图片（降级方案）
     */
    loadAllImages() {
        const lazyElements = document.querySelectorAll('[data-src], [data-lazy-src]');
        lazyElements.forEach(el => this.loadImage(el));
    },

    /**
     * 设置 MutationObserver 监听 DOM 变化
     */
    setupMutationObserver() {
        const mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element 节点
                        // 检查新添加的节点本身
                        if (node.dataset && (node.dataset.src || node.dataset.lazySrc)) {
                            this.observe(node);
                        }
                        // 检查子节点
                        if (node.querySelectorAll) {
                            const lazyChildren = node.querySelectorAll('[data-src], [data-lazy-src]');
                            lazyChildren.forEach(child => this.observe(child));
                        }
                    }
                });
            });
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    /**
     * 创建懒加载图片 HTML
     * @param {string} src - 图片地址
     * @param {string} alt - 替代文本
     * @param {Object} options - 额外选项
     * @returns {string} HTML 字符串
     */
    createLazyImg(src, alt = '', options = {}) {
        const { className = '', width = '', height = '', fallback = '' } = options;
        const placeholder = this.config.placeholder || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';

        const esc = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(s) : String(s).replace(/"/g, '&quot;');

        let attrs = `data-src="${esc(src)}" alt="${esc(alt)}" class="lazy-img ${esc(className)}"`;
        if (width) attrs += ` width="${esc(width)}"`;
        if (height) attrs += ` height="${esc(height)}"`;
        if (fallback) attrs += ` data-fallback="${esc(fallback)}"`;

        return `<img src="${esc(placeholder)}" ${attrs}>`;
    },

    /**
     * 销毁懒加载器
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.initialized = false;
    }
};

// 页面加载完成后自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LazyLoader.init());
} else {
    LazyLoader.init();
}

// 导出到全局
window.LazyLoader = LazyLoader;

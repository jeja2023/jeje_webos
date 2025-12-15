/**
 * 窗口管理器
 * 处理多窗口管理、层级堆叠 (z-index) 和窗口生命周期。
 */
const WindowManager = {
    windows: new Map(), // ID -> { id, element, component, zIndex, ... }
    activeWindowId: null,
    zIndexCounter: 3000,
    container: null,

    init(containerEl) {
        this.container = containerEl;
        this.bindGlobalEvents();
    },

    /**
     * 打开新窗口或聚焦现有窗口
     * @param {class} ComponentClass - 要挂载的页面组件类
     * @param {object} props - 组件构造函数的参数
     * @param {object} options - { title, id, width, height, x, y }
     */
    open(ComponentClass, props = [], options = {}) {
        const id = options.id || `win_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 如果已存在（且是单例类型），则聚焦它
        if (this.windows.has(id)) {
            // 更新该窗口关联的 URL（如果有）
            if (options.url) {
                const win = this.windows.get(id);
                win.url = options.url;
            }
            this.focus(id);
            return id;
        }

        // 创建 DOM
        const winEl = this.createWindowDOM(id, options.title || 'Application');
        this.container.appendChild(winEl);

        // 计算位置和大小
        this.positionWindow(winEl, options);

        // 挂载组件
        const contentEl = winEl.querySelector('.window-body');
        // 如果 props 是数组则展开，否则传给构造函数
        // 注意：App.js 传递的是 `(this.content, ...args)`
        // 我们需要传递 `(contentEl, ...props)`
        const componentInstance = new ComponentClass(contentEl, ...props);
        if (typeof componentInstance.mount === 'function') {
            componentInstance.mount();
        }

        // 保存记录
        this.windows.set(id, {
            id,
            element: winEl,
            component: componentInstance,
            minimized: false,
            maximized: false,
            url: options.url || (id.startsWith('/') ? id : null) // 保存 URL 状态
        });

        // 聚焦新窗口
        this.focus(id);

        // 绑定窗口特定事件（拖拽、调整大小、控件）
        this.bindWindowEvents(id, winEl);

        // 如果支持，设置标题绑定
        // 某些组件可能需要动态更改标题
        // 如果需要，我们可以暴露一个方法或钩子。

        // 更新桌面状态（如果有窗口打开，模糊背景小部件）
        this.updateDesktopState();

        return id;
    },

    close(id) {
        if (!this.windows.has(id)) return;

        const win = this.windows.get(id);

        // 销毁组件
        if (win.component && typeof win.component.destroy === 'function') {
            win.component.destroy();
        }

        // 带动画移除 DOM
        win.element.classList.add('closing');
        win.element.addEventListener('animationend', () => {
            if (win.element.parentNode) {
                win.element.parentNode.removeChild(win.element);
            }
        });

        // 如果动画失效则兜底处理
        setTimeout(() => {
            if (win.element.parentNode) win.element.parentNode.removeChild(win.element);
        }, 300);

        this.windows.delete(id);

        // 聚焦下一个顶层窗口
        if (this.activeWindowId === id) {
            this.activeWindowId = null;
            this.focusLastActive();
        }

        this.updateDesktopState();

        // 移除旧的路由逻辑注释，现在由 focusLastActive 处理
    },

    focus(id) {
        if (!this.windows.has(id)) return;

        const win = this.windows.get(id);

        // 置顶
        this.zIndexCounter++;
        win.element.style.zIndex = this.zIndexCounter;

        // 更新激活类
        this.windows.forEach(w => w.element.classList.remove('active'));
        win.element.classList.add('active');

        // 如果已最小化则恢复
        if (win.minimized) {
            this.restore(id);
        }

        this.activeWindowId = id;

        // 同步 URL 到 Router
        if (typeof Router !== 'undefined') {
            const targetUrl = win.url || (id.startsWith('/') ? id : null);
            if (targetUrl) {
                // 检查是否需要更新，避免循环
                const currentFn = () => {
                    const { path, query } = Router.current();
                    const qs = new URLSearchParams(query).toString();
                    return qs ? `${path}?${qs}` : path;
                };
                const currentUrl = currentFn();

                // 简单比对（注意 query 顺序可能影响，但暂忽略）
                if (currentUrl !== targetUrl && decodeURIComponent(currentUrl) !== decodeURIComponent(targetUrl)) {
                    Router.replace(targetUrl);
                }
            }
        }
    },

    minimize(id) {
        if (!this.windows.has(id)) return;
        const win = this.windows.get(id);

        win.minimized = true;
        win.element.classList.remove('active');
        win.element.classList.add('minimized'); // CSS 应该将其隐藏或动画到 Dock
        // 理想情况下，我们会动画到 Dock 图标位置。

        // 如果最小化的窗口是当前激活的窗口，清除 activeWindowId 并聚焦另一个窗口
        if (this.activeWindowId === id) {
            this.activeWindowId = null;
            this.focusLastActive();
        }

        this.updateDesktopState();
    },

    maximize(id) {
        if (!this.windows.has(id)) return;
        const win = this.windows.get(id);

        if (win.maximized) {
            win.element.classList.remove('maximized');
            win.maximized = false;
        } else {
            win.element.classList.add('maximized');
            win.maximized = true;
        }
    },

    restore(id) {
        if (!this.windows.has(id)) return;
        const win = this.windows.get(id);

        win.minimized = false;
        win.element.classList.remove('minimized');
        win.element.classList.add('active');

        this.updateDesktopState();
    },

    focusLastActive() {
        // 查找 z-index 最高的窗口
        let maxZ = 0;
        let pId = null;
        this.windows.forEach((w, id) => {
            const z = parseInt(w.element.style.zIndex || 0);
            if (z > maxZ && !w.minimized) {
                maxZ = z;
                pId = id;
            }
        });
        if (pId) {
            this.focus(pId);
        } else {
            // 没有活动窗口了，回到桌面
            if (typeof Router !== 'undefined') {
                const { path } = Router.current();
                if (path !== '/desktop') {
                    Router.replace('/desktop');
                }
            }
        }
    },


    updateDesktopState() {
        const windowsList = Array.from(this.windows.values());
        const hasOpenWindows = windowsList.some(w => !w.minimized);
        const widgets = document.getElementById('desktop-widgets');
        if (widgets) {
            if (hasOpenWindows) widgets.classList.add('blur-out');
            else widgets.classList.remove('blur-out');
        }

        // 更新 Store 中的打开窗口列表，供 Dock 使用
        if (typeof Store !== 'undefined') {
            // 保存所有窗口的 ID (即 path)
            const openWindowIds = windowsList.map(w => w.id);
            Store.set('openWindows', openWindowIds);
        }

        // TopBar 逻辑
        if (typeof App !== 'undefined' && App.topbar) {
            App.topbar.setState({ showTime: hasOpenWindows });
        }
    },

    createWindowDOM(id, title) {
        const div = document.createElement('div');
        div.className = 'window-container';
        div.id = id;
        div.style.position = 'absolute'; // 对拖拽很重要

        div.innerHTML = `
            <div class="window-header">
                <div class="window-controls">
                    <button class="window-btn close" title="关闭">
                        <svg class="btn-icon" viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                    <button class="window-btn minimize" title="最小化">
                        <svg class="btn-icon" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                    <button class="window-btn maximize" title="最大化">
                        <svg class="btn-icon" viewBox="0 0 12 12"><path d="M2 10L10 2M2 10V6M2 10H6M10 2V6M10 2H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
                <div class="window-title">${title}</div>
            </div>
            <div class="window-body"></div>
            <!-- 调整大小句柄 -->
            <div class="resize-handle n"></div>
            <div class="resize-handle e"></div>
            <div class="resize-handle s"></div>
            <div class="resize-handle w"></div>
            <div class="resize-handle ne"></div>
            <div class="resize-handle se"></div>
            <div class="resize-handle sw"></div>
            <div class="resize-handle nw"></div>
        `;
        return div;
    },

    positionWindow(el, options) {
        // 检查 CSS 中的移动端逻辑，但这里我们设置初始内联样式
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // CSS 处理全屏
            return;
        }

        // 恢复原始大小逻辑：90% 宽度 (最大 1400)，85% 高度
        const defaultWidth = Math.min(window.innerWidth * 0.9, 1400);
        const defaultHeight = window.innerHeight * 0.85;

        const width = options.width || defaultWidth;
        const height = options.height || defaultHeight;

        // 居中位置
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;

        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.left = `${Math.max(0, left)}px`;
        el.style.top = `${Math.max(50, top)}px`; // 避开顶部栏
    },

    bindWindowEvents(id, winEl) {
        const header = winEl.querySelector('.window-header');

        // --- 激活 ---
        winEl.addEventListener('mousedown', () => {
            this.focus(id);
        });

        // --- 拖拽 ---
        header.addEventListener('mousedown', (e) => {
            // 忽略按钮
            if (e.target.closest('.window-btn')) return;
            // 如果已最大化则忽略
            if (this.windows.get(id).maximized) return;

            e.preventDefault();
            this.startDragging(e, winEl);
        });

        // --- 控件 ---
        const controls = winEl.querySelector('.window-controls');
        controls.querySelector('.close').onclick = (e) => { e.stopPropagation(); this.close(id); };
        controls.querySelector('.minimize').onclick = (e) => { e.stopPropagation(); this.minimize(id); };
        controls.querySelector('.maximize').onclick = (e) => { e.stopPropagation(); this.maximize(id); };

        // --- 调整大小 ---
        const handles = winEl.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 从类名确定句柄类型
                const type = Array.from(handle.classList).find(c => ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(c));
                this.startResizing(e, winEl, type);
            });
        });

        // 双击标题栏最大化
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-btn')) return;
            this.maximize(id);
        });
    },

    startDragging(e, el) {
        let isDragging = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const initialLeft = el.offsetLeft;
        const initialTop = el.offsetTop;
        const width = el.offsetWidth;

        // 置顶
        this.focus(el.id);

        const onMouseMove = (ev) => {
            if (!isDragging) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // --- 边界磁吸/限制 ---
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            // 顶部限制：不能拖出顶部菜单栏 (假设高度 30px)
            if (newTop < 30) newTop = 30;

            // 底部限制：至少保留 50px 在可视区
            if (newTop > screenH - 50) newTop = screenH - 50;

            // 左右限制：避免完全拖出屏幕，至少保留 100px 可见
            if (newLeft + width < 100) newLeft = 100 - width;
            if (newLeft > screenW - 100) newLeft = screenW - 100;

            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
            el.style.transform = 'none';
        };

        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },

    startResizing(e, el, type) {
        let isResizing = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = el.getBoundingClientRect();

        const startW = rect.width;
        const startH = rect.height;
        const startL = el.offsetLeft;
        const startT = el.offsetTop;

        const MIN_W = 300;
        const MIN_H = 200;

        // Bring to front
        this.focus(el.id);

        const onMouseMove = (ev) => {
            if (!isResizing) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            let newW = startW;
            let newH = startH;
            let newL = startL;
            let newT = startT;

            if (type.includes('e')) newW = Math.max(MIN_W, startW + dx);
            if (type.includes('s')) newH = Math.max(MIN_H, startH + dy);

            if (type.includes('w')) {
                const maxD = startW - MIN_W;
                const d = Math.min(dx, maxD);
                newW = startW - d;
                newL = startL + d;
            }
            if (type.includes('n')) {
                const maxD = startH - MIN_H;
                const d = Math.min(dy, maxD);
                newH = startH - d;
                newT = startT + d;
            }

            el.style.width = `${newW}px`;
            el.style.height = `${newH}px`;
            // 仅在需要时更新位置
            if (type.includes('w')) el.style.left = `${newL}px`;
            if (type.includes('n')) el.style.top = `${newT}px`;
        };

        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },

    bindGlobalEvents() {
        // 如果需要，监听窗口大小调整
    },

    // --- 辅助函数：清除所有 ---
    closeAll() {
        this.windows.forEach((val, key) => this.close(key));
    }
};

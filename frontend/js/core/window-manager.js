/**
 * Window Manager
 * Handles multi-window management, z-index stacking, and window lifecycle.
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
     * Open a new window or focus existing one
     * @param {class} ComponentClass - The Page Component class to mount
     * @param {object} props - Arguments for the component constructor
     * @param {object} options - { title, id, width, height, x, y }
     */
    open(ComponentClass, props = [], options = {}) {
        const id = options.id || `win_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // If already exists (and is singleton type), focus it
        if (this.windows.has(id)) {
            this.focus(id);
            return id;
        }

        // Create DOM
        const winEl = this.createWindowDOM(id, options.title || 'Application');
        this.container.appendChild(winEl);

        // Calculate Position & Size
        this.positionWindow(winEl, options);

        // Mount Component
        const contentEl = winEl.querySelector('.window-body');
        // Spread props if array, or trigger constructor
        // Note: App.js passed `(this.content, ...args)`
        // We need to pass `(contentEl, ...props)`
        const componentInstance = new ComponentClass(contentEl, ...props);
        if (typeof componentInstance.mount === 'function') {
            componentInstance.mount();
        }

        // Store record
        this.windows.set(id, {
            id,
            element: winEl,
            component: componentInstance,
            minimized: false,
            maximized: false
        });

        // Focus the new window
        this.focus(id);

        // Bind Window specific events (Drag, Resize, Controls)
        this.bindWindowEvents(id, winEl);

        // Setup title binding if supported
        // Some components might want to change title dynamically
        // We can expose a method or hook if needed.

        // Update Desktop State (blur background widgets if any window is open)
        this.updateDesktopState();

        return id;
    },

    close(id) {
        if (!this.windows.has(id)) return;

        const win = this.windows.get(id);

        // Destroy component
        if (win.component && typeof win.component.destroy === 'function') {
            win.component.destroy();
        }

        // Remove DOM with animation
        win.element.classList.add('closing');
        win.element.addEventListener('animationend', () => {
            if (win.element.parentNode) {
                win.element.parentNode.removeChild(win.element);
            }
        });

        // Fallback if animation fails
        setTimeout(() => {
            if (win.element.parentNode) win.element.parentNode.removeChild(win.element);
        }, 300);

        this.windows.delete(id);

        // Focus next top window
        if (this.activeWindowId === id) {
            this.activeWindowId = null;
            this.focusLastActive();
        }

        this.updateDesktopState();

        // If no windows left, maybe route to desktop?
        // Actually, Router might still point to the closed app URL.
        // We should ideally sync Router, but for now, let's keep visual multi-window.
    },

    focus(id) {
        if (!this.windows.has(id)) return;

        const win = this.windows.get(id);

        // Bring to front
        this.zIndexCounter++;
        win.element.style.zIndex = this.zIndexCounter;

        // Update active class
        this.windows.forEach(w => w.element.classList.remove('active'));
        win.element.classList.add('active');

        // Restore if minimized
        if (win.minimized) {
            this.restore(id);
        }

        this.activeWindowId = id;
    },

    minimize(id) {
        if (!this.windows.has(id)) return;
        const win = this.windows.get(id);

        win.minimized = true;
        win.element.classList.remove('active');
        win.element.classList.add('minimized'); // CSS should hide it or animate to dock
        // Ideally we animate to the Dock icon position.

        // If the minimized window was the active one, clear activeWindowId and focus another
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
        // Find window with highest z-index
        let maxZ = 0;
        let pId = null;
        this.windows.forEach((w, id) => {
            const z = parseInt(w.element.style.zIndex || 0);
            if (z > maxZ && !w.minimized) {
                maxZ = z;
                pId = id;
            }
        });
        if (pId) this.focus(pId);
    },

    updateDesktopState() {
        const hasOpenWindows = Array.from(this.windows.values()).some(w => !w.minimized);
        const widgets = document.getElementById('desktop-widgets');
        if (widgets) {
            if (hasOpenWindows) widgets.classList.add('blur-out');
            else widgets.classList.remove('blur-out');
        }

        // TopBar logic?
        // App.topbar.setState({ hideTime: !hasOpenWindows });
        // We can emit an event or access App global if needed.
        if (typeof App !== 'undefined' && App.topbar) {
            App.topbar.setState({ hideTime: !hasOpenWindows });
        }
    },

    createWindowDOM(id, title) {
        const div = document.createElement('div');
        div.className = 'window-container';
        div.id = id;
        div.style.position = 'absolute'; // Important for drag

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
            <!-- Resize Handles -->
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
        // Check for mobile logic in CSS, but here we set initial inline styles
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // CSS handles fullscreen
            return;
        }

        // Restore original size logic: 90% width (max 1400), 85% height
        const defaultWidth = Math.min(window.innerWidth * 0.9, 1400);
        const defaultHeight = window.innerHeight * 0.85;

        const width = options.width || defaultWidth;
        const height = options.height || defaultHeight;

        // Center position
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;

        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.left = `${Math.max(0, left)}px`;
        el.style.top = `${Math.max(50, top)}px`; // Avoid topbar
    },

    bindWindowEvents(id, winEl) {
        const header = winEl.querySelector('.window-header');

        // --- Activation ---
        winEl.addEventListener('mousedown', () => {
            this.focus(id);
        });

        // --- Dragging ---
        header.addEventListener('mousedown', (e) => {
            // Ignore buttons
            if (e.target.closest('.window-btn')) return;
            // Ignore if maximized
            if (this.windows.get(id).maximized) return;

            e.preventDefault();
            this.startDragging(e, winEl);
        });

        // --- Controls ---
        const controls = winEl.querySelector('.window-controls');
        controls.querySelector('.close').onclick = (e) => { e.stopPropagation(); this.close(id); };
        controls.querySelector('.minimize').onclick = (e) => { e.stopPropagation(); this.minimize(id); };
        controls.querySelector('.maximize').onclick = (e) => { e.stopPropagation(); this.maximize(id); };

        // --- Resizing ---
        const handles = winEl.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Determine handle type from class
                const type = Array.from(handle.classList).find(c => ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(c));
                this.startResizing(e, winEl, type);
            });
        });

        // Double click header to maximize
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

        // Bring to front
        this.focus(el.id);

        const onMouseMove = (ev) => {
            if (!isDragging) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // --- 边界磁吸/限制 (Boundary Constraints) ---
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
            // Only update pos if needed
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
        // Listen to window resize if needed
    },

    // --- Helper to clear all ---
    closeAll() {
        this.windows.forEach((val, key) => this.close(key));
    }
};

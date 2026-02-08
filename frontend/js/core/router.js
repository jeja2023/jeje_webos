/**
 * 路由管理
 * 基于 History 的 SPA 路由
 */

const Router = {
    // 路由表
    routes: {},

    // 路由守卫
    beforeEach: null,

    // 404处理
    notFound: null,

    /**
     * 注册路由
     */
    register(path, handler, options = {}) {
        this.routes[path] = {
            handler,
            ...options
        };
        Config.log(`路由注册: ${path}`);
    },

    /**
     * 批量注册路由
     */
    registerAll(routes) {
        Object.entries(routes).forEach(([path, config]) => {
            if (typeof config === 'function') {
                this.register(path, config);
            } else {
                this.register(path, config.handler, config);
            }
        });
    },

    normalizePath(rawPath) {
        if (!rawPath) return '/';
        let p = rawPath.split('#')[0]; // 去除可能的 hash
        if (!p.startsWith('/')) p = '/' + p;
        // 去掉末尾斜杠（根路径除外）
        if (p.length > 1 && p.endsWith('/')) {
            p = p.replace(/\/+$/, '');
            if (p === '') p = '/';
        }
        return p;
    },

    /**
     * 获取当前路由
     */
    current() {
        // 优先兼容旧 hash 链接（#/path -> /path）
        if (window.location.hash.startsWith('#/')) {
            const hashPath = window.location.hash.slice(1);
            const [hp, qs] = hashPath.split('?');
            const queryFromHash = qs ? Object.fromEntries(new URLSearchParams(qs)) : {};
            return { path: this.normalizePath(hp || '/'), query: queryFromHash };
        }

        const path = this.normalizePath(window.location.pathname || '/');
        const qs = window.location.search.slice(1);
        const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : {};
        return { path, query };
    },

    /**
     * 跳转路由
     */
    push(path, query = {}) {
        path = this.normalizePath(path);
        const queryString = new URLSearchParams(query).toString();
        const url = queryString ? `${path}?${queryString}` : path;
        window.history.pushState({}, '', url);
        this.handleRoute();
    },

    /**
     * 替换路由
     */
    replace(path, query = {}) {
        path = this.normalizePath(path);
        const queryString = new URLSearchParams(query).toString();
        const url = queryString ? `${path}?${queryString}` : path;
        window.history.replaceState({}, '', url);
        this.handleRoute();
    },

    /**
     * 返回
     */
    back() {
        window.history.back();
    },

    /**
     * 解析路由
     */
    resolve(currentPath) {
        currentPath = this.normalizePath(currentPath);
        // 精确匹配
        if (this.routes[currentPath]) {
            return { route: this.routes[currentPath], params: {} };
        }

        // 动态路由匹配
        for (const [path, route] of Object.entries(this.routes)) {
            const paramNames = [];
            const regexPath = path.replace(/:([^/]+)/g, (_, name) => {
                paramNames.push(name);
                return '([^/]+)';
            });

            const regex = new RegExp(`^${regexPath}$`);
            const match = currentPath.match(regex);

            if (match) {
                const params = {};
                paramNames.forEach((name, i) => {
                    params[name] = match[i + 1];
                });
                return { route, params };
            }
        }

        return null;
    },

    // 路由处理版本号，用于防止快速导航时旧路由覆盖新路由
    _routeVersion: 0,

    /**
     * 处理路由变化（防竞态：快速导航时取消旧的路由处理）
     */
    async handleRoute() {
        const routeVersion = ++this._routeVersion;
        const { path, query } = this.current();
        Config.log(`路由变化: ${path}`);

        Store.set('currentRoute', path);

        // 路由守卫
        if (this.beforeEach) {
            const next = await this.beforeEach(path, query);
            if (next === false) return;
            if (typeof next === 'string') {
                this.replace(next);
                return;
            }
        }

        // 解析路由
        const resolved = this.resolve(path);

        if (resolved) {
            const { route, params } = resolved;

            // 权限检查
            if (route.auth && !Store.get('isLoggedIn')) {
                this.replace('/login');
                return;
            }

            // 按需加载模块资源（在执行路由处理函数前）
            if (typeof ResourceLoader !== 'undefined') {
                // 显示加载指示器（如果加载时间较长）
                let loadingTimeout = null;
                let loadingEl = null;

                loadingTimeout = setTimeout(() => {
                    loadingEl = document.createElement('div');
                    loadingEl.className = 'route-loading-overlay';
                    loadingEl.innerHTML = `
                        <div class="route-loading-spinner">
                            <div class="spinner"></div>
                            <span>加载中...</span>
                        </div>
                    `;
                    document.body.appendChild(loadingEl);
                }, 200); // 200ms 后才显示，避免闪烁

                try {
                    await ResourceLoader.loadModuleByPath(path);
                } catch (err) {
                    Config.error('模块资源加载失败:', err);
                    if (typeof Toast !== 'undefined') {
                        Toast.error('页面资源加载失败，请刷新重试');
                    }
                } finally {
                    // 清除加载指示器
                    if (loadingTimeout) clearTimeout(loadingTimeout);
                    if (loadingEl && loadingEl.parentNode) {
                        loadingEl.parentNode.removeChild(loadingEl);
                    }
                }
            }

            // 检查路由版本：如果在资源加载期间发生了新的导航，放弃当前处理
            if (routeVersion !== this._routeVersion) {
                Config.log(`路由已被覆盖，放弃处理: ${path}`);
                return;
            }

            // 执行处理函数
            await route.handler({ path, query, params });
        } else if (this.notFound) {
            this.notFound(path);
        } else {
            Config.error(`路由未找到: ${path}`);
        }
    },

    /**
     * 初始化
     */
    init() {
        // 兼容旧 hash 链接：首次加载时把 #/path 转成 history
        if (window.location.hash.startsWith('#/')) {
            const hashPath = window.location.hash.slice(1);
            window.history.replaceState({}, '', hashPath);
        }

        // 拦截站内链接（href 以 #/ 开头的旧写法）
        document.addEventListener('click', (e) => {
            const anchor = e.target.closest('a');
            if (!anchor) return;
            const href = anchor.getAttribute('href') || '';
            if (href.startsWith('#/')) {
                e.preventDefault();
                this.push(href.slice(1));
            }
        });

        // 监听浏览器前进/后退
        window.addEventListener('popstate', () => this.handleRoute());

        // 立即处理当前路由（不等待 load 事件）
        this.handleRoute();

        Config.log('路由初始化完成（History 模式）');
    }
};



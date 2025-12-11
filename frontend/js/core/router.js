/**
 * 路由管理
 * 基于Hash的SPA路由
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
    
    /**
     * 获取当前路由
     */
    current() {
        const hash = window.location.hash.slice(1) || '/';
        const [path, queryString] = hash.split('?');
        const query = queryString 
            ? Object.fromEntries(new URLSearchParams(queryString))
            : {};
        return { path, query };
    },
    
    /**
     * 跳转路由
     */
    push(path, query = {}) {
        const queryString = new URLSearchParams(query).toString();
        const hash = queryString ? `${path}?${queryString}` : path;
        window.location.hash = hash;
    },
    
    /**
     * 替换路由
     */
    replace(path, query = {}) {
        const queryString = new URLSearchParams(query).toString();
        const hash = queryString ? `${path}?${queryString}` : path;
        window.location.replace(`#${hash}`);
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
    
    /**
     * 处理路由变化
     */
    async handleRoute() {
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
        // 监听路由变化
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // 立即处理当前路由（不等待 load 事件）
        this.handleRoute();
        
        Config.log('路由初始化完成');
    }
};



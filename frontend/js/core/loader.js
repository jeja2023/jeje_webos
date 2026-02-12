/**
 * 资源加载器
 * 支持 CSS/JS 的懒加载和缓存管理
 */

const ResourceLoader = {
    // 已加载资源缓存
    loadedCSS: new Set(),
    loadedJS: new Set(),

    // 加载中的 Promise 缓存（防止重复请求）
    pendingCSS: {},
    pendingJS: {},

    // 约定：路由 /path 默认对应 /static/css/pages/{path}.css 与 /static/js/pages/{path}.js
    // 仅需为不符合约定的路由配置覆盖项（多文件、子目录、不同命名等）
    moduleResourceMapOverrides: {
        '/theme': {
            css: ['/static/css/pages/theme_editor.css'],
            js: ['/static/js/pages/theme_editor.js']
        },
        '/apps': {
            css: ['/static/css/pages/market.css'],
            js: ['/static/js/pages/market.js']
        },
        '/notifications': {
            css: ['/static/css/pages/messages.css'],
            js: ['/static/js/pages/messages.js']
        },
        '/filemanager': {
            css: [
                '/static/css/pages/filemanager.css',
                '/static/css/components/office_viewer.css',
                '/static/css/components/pdf_viewer.css'
            ],
            js: ['/static/js/pages/filemanager.js']
        },
        '/pdf': {
            css: [
                '/static/css/pages/pdf/pdf.css',
                '/static/css/components/pdf_viewer.css',
                '/static/css/components/office_viewer.css'
            ],
            js: [
                '/static/js/components/office_viewer.js',
                '/static/js/pages/pdf/pdf_utils.js',
                '/static/js/pages/pdf/pdf_reader.js',
                '/static/js/pages/pdf/pdf_toolbox.js',
                '/static/js/pages/pdf/pdf_history.js',
                '/static/js/pages/pdf/pdf_documents.js',
                '/static/js/pages/pdf/pdf.js'
            ]
        },
        '/markdown': {
            css: [
                '/static/css/pages/markdown/markdown.css',
                '/static/css/pages/markdown/markdown_wysiwyg.css'
            ],
            js: [
                '/static/js/pages/markdown/markdown_wysiwyg.js',
                '/static/js/pages/markdown/markdown.js'
            ]
        },
        '/im': {
            css: ['/static/css/pages/im/im.css'],
            js: [
                '/static/js/pages/im/im_components.js',
                '/static/js/pages/im/im.js'
            ]
        },
        '/analysis': {
            css: [
                '/static/css/pages/analysis/analysis.css',
                '/static/css/pages/analysis/analysis_import.css',
                '/static/css/pages/analysis/analysis_cleaning.css',
                '/static/css/pages/analysis/analysis_modeling.css',
                '/static/css/pages/analysis/analysis_chart.css',
                '/static/css/pages/analysis/analysis_sql.css',
                '/static/css/pages/analysis/analysis_compare.css',
                '/static/css/pages/analysis/analysis_bi.css',
                '/static/css/pages/analysis/analysis_smart_table.css'
            ],
            js: [
                '/static/js/pages/analysis/analysis.js',
                '/static/js/pages/analysis/analysis_import.js',
                '/static/js/pages/analysis/analysis_cleaning.js',
                '/static/js/pages/analysis/analysis_modeling.js',
                '/static/js/pages/analysis/analysis_chart.js',
                '/static/js/pages/analysis/analysis_sql.js',
                '/static/js/pages/analysis/analysis_compare.js',
                '/static/js/pages/analysis/analysis_bi.js',
                '/static/js/pages/analysis/analysis_smart_table.js'
            ]
        },
        '/lens': {
            css: [
                '/static/css/pages/datalens/datalens.css',
                '/static/css/pages/datalens/datalens_hub.css',
                '/static/css/pages/datalens/datalens_viewer.css',
                '/static/css/pages/datalens/datalens_editor.css'
            ],
            js: [
                '/static/js/pages/datalens/datalens.js',
                '/static/js/pages/datalens/datalens_hub.js',
                '/static/js/pages/datalens/datalens_viewer.js',
                '/static/js/pages/datalens/datalens_editor.js'
            ]
        }
    },

    // 动态注册的模块资源（来自应用市场等，由 registerDynamicModules 写入）
    moduleResourceMapDynamic: {},

    /**
     * 根据路由获取资源列表：优先覆盖表，再动态表，否则按约定生成（/path -> pages/path.js + pages/path.css）
     */
    getResourcesForPath(basePath) {
        if (this.moduleResourceMapOverrides[basePath]) return this.moduleResourceMapOverrides[basePath];
        if (this.moduleResourceMapDynamic[basePath]) return this.moduleResourceMapDynamic[basePath];
        const pathKey = basePath.replace(/^\//, '') || 'index';
        return {
            css: [`/static/css/pages/${pathKey}.css`],
            js: [`/static/js/pages/${pathKey}.js`]
        };
    },

    /**
     * 日志输出（安全检查 Config 是否存在）
     */
    log(message) {
        if (typeof Config !== 'undefined' && Config.log) {
            Config.log(message);
        }
    },

    /**
     * 加载 CSS 文件
     * @param {string} url - CSS 文件URL
     * @returns {Promise} 加载完成的 Promise
     */
    loadCSS(url) {
        // 已加载则直接返回
        if (this.loadedCSS.has(url)) {
            return Promise.resolve();
        }

        // 正在加载中则返回现有 Promise
        if (this.pendingCSS[url]) {
            return this.pendingCSS[url];
        }

        // 检查 DOM 中是否已存在
        if (document.querySelector(`link[href="${url}"]`)) {
            this.loadedCSS.add(url);
            return Promise.resolve();
        }

        // 创建加载 Promise
        this.pendingCSS[url] = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;

            link.onload = () => {
                this.loadedCSS.add(url);
                delete this.pendingCSS[url];
                resolve();
            };

            link.onerror = () => {
                delete this.pendingCSS[url];
                if (typeof Config !== 'undefined' && Config.warn) Config.warn(`CSS 加载失败: ${url}`);
                resolve(); // 不阻塞后续加载
            };

            document.head.appendChild(link);
        });

        return this.pendingCSS[url];
    },

    /**
     * 加载 JS 文件
     * @param {string} url - JS 文件URL
     * @returns {Promise} 加载完成的 Promise
     */
    loadJS(url) {
        // 已加载则直接返回
        if (this.loadedJS.has(url)) {
            return Promise.resolve();
        }

        // 正在加载中则返回现有 Promise
        if (this.pendingJS[url]) {
            return this.pendingJS[url];
        }

        // 检查 DOM 中是否已存在
        if (document.querySelector(`script[src="${url}"]`)) {
            this.loadedJS.add(url);
            return Promise.resolve();
        }

        // 创建加载 Promise
        this.pendingJS[url] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;

            script.onload = () => {
                this.loadedJS.add(url);
                delete this.pendingJS[url];
                resolve();
            };

            script.onerror = () => {
                delete this.pendingJS[url];
                if (typeof Config !== 'undefined' && Config.error) Config.error(`JS 加载失败: ${url}`);
                reject(new Error(`加载失败: ${url}`));
            };

            document.body.appendChild(script);
        });

        return this.pendingJS[url];
    },

    /**
     * 加载 ECharts 库
     * @returns {Promise}
     */
    async loadEcharts() {
        if (typeof echarts !== 'undefined') return Promise.resolve();
        this.log('正在动态加载 ECharts...');
        return this.loadJS('/static/libs/echarts/echarts.min.js');
    },

    /**
     * 加载 Leaflet 库
     * @returns {Promise}
     */
    async loadLeaflet() {
        if (typeof L !== 'undefined') return Promise.resolve();
        this.log('正在动态加载 Leaflet...');
        await this.loadCSS('/static/libs/leaflet/leaflet.css');
        return this.loadJS('/static/libs/leaflet/leaflet.js');
    },

    /**
     * 按顺序加载多个 JS 文件（某些文件有依赖关系）
     * @param {Array<string>} urls - JS 文件URL数组
     * @returns {Promise} 全部加载完成的 Promise
     */
    async loadJSSequential(urls) {
        for (const url of urls) {
            await this.loadJS(url);
        }
    },

    /**
     * 并行加载多个 CSS 文件
     * @param {Array<string>} urls - CSS 文件URL数组
     * @returns {Promise} 全部加载完成的 Promise
     */
    loadCSSParallel(urls) {
        return Promise.all(urls.map(url => this.loadCSS(url)));
    },

    /**
     * 根据路由路径加载对应模块资源
     * @param {string} path - 路由路径
     * @returns {Promise} 加载完成的 Promise
     */
    async loadModuleByPath(path) {
        // 提取基础路径（如 /users/list -> /users）
        const basePath = '/' + (path.split('/')[1] || '');

        const resources = this.getResourcesForPath(basePath);
        if (!resources || (!resources.css?.length && !resources.js?.length)) {
            return;
        }

        const startTime = Date.now();
        this.log(`开始加载模块资源: ${basePath}`);

        // 并行加载 CSS，顺序加载 JS（因为可能有依赖）
        const cssPromise = resources.css ? this.loadCSSParallel(resources.css) : Promise.resolve();
        const jsPromise = resources.js ? this.loadJSSequential(resources.js) : Promise.resolve();

        await Promise.all([cssPromise, jsPromise]);

        this.log(`模块资源加载完成: ${basePath}, 耗时: ${Date.now() - startTime}ms`);
    },

    /**
     * 预加载模块资源（空闲时预加载常用模块）
     * @param {Array<string>} paths - 要预加载的路由路径数组
     */
    preloadModules(paths) {
        // 使用 requestIdleCallback 在浏览器空闲时加载
        const preload = () => {
            for (const path of paths) {
                this.loadModuleByPath(path);
            }
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(preload, { timeout: 5000 });
        } else {
            setTimeout(preload, 2000);
        }
    },

    /**
     * 初始化 - 标记已加载的资源
     */
    init() {
        // 标记 HTML 中已有的 CSS
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            if (link.href) {
                const url = new URL(link.href);
                this.loadedCSS.add(url.pathname);
            }
        });

        // 标记 HTML 中已有的 JS
        document.querySelectorAll('script[src]').forEach(script => {
            if (script.src) {
                const url = new URL(script.src);
                this.loadedJS.add(url.pathname);
            }
        });

        this.log(`资源加载器初始化完成，已缓存 CSS: ${this.loadedCSS.size}, JS: ${this.loadedJS.size}`);
    },

    /**
     * 注册动态模块资源
     * @param {Array} modules - Store.get('modules')
     */
    registerDynamicModules(modules) {
        if (!modules || !Array.isArray(modules)) return;

        modules.forEach(m => {
            if (!m.id) return;
            // 假设模块ID对应路由前缀 (如 'myapp' -> '/myapp')
            const path = '/' + m.id;

            const base = this.moduleResourceMapDynamic[path] || this.getResourcesForPath(path) || { css: [], js: [] };
            const existing = { css: [...(base.css || [])], js: [...(base.js || [])] };
            if (m.assets) {
                if (m.assets.css && Array.isArray(m.assets.css)) {
                    const newCss = m.assets.css.filter(c => !existing.css.includes(c));
                    existing.css = [...existing.css, ...newCss];
                }
                if (m.assets.js && Array.isArray(m.assets.js)) {
                    const newJs = m.assets.js.filter(j => !existing.js.includes(j));
                    existing.js = [...existing.js, ...newJs];
                }
                this.moduleResourceMapDynamic[path] = existing;
            }
        });

        this.log(`动态模块资源注册完成: ${modules.length} 个模块`);
    }
};

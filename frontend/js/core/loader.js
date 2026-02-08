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

    // 模块资源映射表（路由路径 -> 资源列表）
    moduleResourceMap: {
        // 系统管理模块
        '/system': {
            css: ['/static/css/pages/system.css'],
            js: ['/static/js/pages/system.js']
        },
        '/users': {
            css: ['/static/css/pages/users.css'],
            js: ['/static/js/pages/users.js']
        },
        '/roles': {
            css: ['/static/css/pages/roles.css'],
            js: ['/static/js/pages/roles.js']
        },
        '/backup': {
            css: ['/static/css/pages/backup.css'],
            js: ['/static/js/pages/backup.js']
        },
        '/monitor': {
            css: ['/static/css/pages/monitor.css'],
            js: ['/static/js/pages/monitor.js']
        },
        '/import-export': {
            css: ['/static/css/pages/import-export.css'],
            js: ['/static/js/pages/import-export.js']
        },
        '/announcement': {
            css: ['/static/css/pages/announcement.css'],
            js: ['/static/js/pages/announcement.js']
        },
        '/feedback': {
            css: ['/static/css/pages/feedback.css'],
            js: ['/static/js/pages/feedback.js']
        },
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

        // 文件与内容模块
        '/filemanager': {
            css: ['/static/css/pages/filemanager.css'],
            js: ['/static/js/pages/filemanager.js']
        },
        '/transfer': {
            css: ['/static/css/pages/transfer.css'],
            js: ['/static/js/pages/transfer.js']
        },
        '/blog': {
            css: ['/static/css/pages/blog.css'],
            js: ['/static/js/pages/blog.js']
        },
        '/notes': {
            css: ['/static/css/pages/notes.css'],
            js: ['/static/js/pages/notes.js']
        },
        '/knowledge': {
            css: ['/static/css/pages/knowledge.css'],
            js: ['/static/js/pages/knowledge.js']
        },
        '/vault': {
            css: ['/static/css/pages/vault.css'],
            js: ['/static/js/pages/vault.js']
        },

        // 媒体工具模块
        '/album': {
            css: ['/static/css/pages/album.css'],
            js: ['/static/js/pages/album.js']
        },
        '/video': {
            css: ['/static/css/pages/video.css'],
            js: ['/static/js/pages/video.js']
        },
        '/ocr': {
            css: ['/static/css/pages/ocr.css'],
            js: ['/static/js/pages/ocr.js']
        },
        '/lm_cleaner': {
            css: ['/static/css/pages/lm_cleaner.css'],
            js: ['/static/js/pages/lm_cleaner.js']
        },
        '/pdf': {
            css: [
                '/static/css/pages/pdf/pdf.css'
            ],
            js: [
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

        // 学习与办公模块
        '/exam': {
            css: ['/static/css/pages/exam.css'],
            js: ['/static/js/pages/exam.js']
        },
        '/course': {
            css: ['/static/css/pages/course.css'],
            js: ['/static/js/pages/course.js']
        },
        '/schedule': {
            css: ['/static/css/pages/schedule.css'],
            js: ['/static/js/pages/schedule.js']
        },

        // 通讯与AI模块
        '/im': {
            css: ['/static/css/pages/im/im.css'],
            js: [
                '/static/js/pages/im/im_components.js',
                '/static/js/pages/im/im.js'
            ]
        },
        '/ai': {
            css: ['/static/css/pages/ai.css'],
            js: ['/static/js/pages/ai.js']
        },
        '/map': {
            css: ['/static/css/pages/map.css'],
            js: ['/static/js/pages/map.js']
        },

        // 数据分析模块
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

        // 数据透镜模块
        '/lens': {
            css: [
                '/static/css/pages/datalens/datalens.css',
                '/static/css/pages/datalens/datalens_hub.css',
                '/static/css/pages/datalens/datalens_viewer.css',
                '/static/css/pages/datalens/datalens_editor.css',
                '/static/css/pages/datalens/datalens_api.css'
            ],
            js: [
                '/static/js/pages/datalens/datalens_api.js',
                '/static/js/pages/datalens/datalens.js',
                '/static/js/pages/datalens/datalens_hub.js',
                '/static/js/pages/datalens/datalens_viewer.js',
                '/static/js/pages/datalens/datalens_editor.js'
            ]
        }
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
                console.warn(`CSS 加载失败: ${url}`);
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
                console.error(`JS 加载失败: ${url}`);
                reject(new Error(`加载失败: ${url}`));
            };

            document.body.appendChild(script);
        });

        return this.pendingJS[url];
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

        const resources = this.moduleResourceMap[basePath];
        if (!resources) {
            return; // 没有配置懒加载资源
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
    }
};

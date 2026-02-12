/**
 * JeJe WebOS - 应用入口
 */

const App = {
    // 组件实例
    header: null,
    sidebar: null,

    // 初始化应用
    async init() {
        Config.log('应用初始化...');

        // 初始化资源加载器
        if (typeof ResourceLoader !== 'undefined') {
            ResourceLoader.init();
        }

        // 获取系统初始化信息
        try {
            const token = localStorage.getItem(Config.storageKeys.token);
            const res = await SystemApi.init(token);
            Store.setSystemInfo(res.data);
            try {
                const setRes = await SystemApi.getSettings();
                Store.setSystemSettings(setRes.data);
            } catch (err) {
                if (typeof Config !== 'undefined' && Config.warn) Config.warn('获取系统设置失败', err);
            }

            if (res.data.app_name) {
                document.title = res.data.app_name;
            }
        } catch (error) {
            Config.error('系统初始化失败', error);
        }

        // 注册路由
        this.registerRoutes();

        // 启动路由
        Router.init();

        // 连接 WebSocket
        if (Store.get('isLoggedIn')) {
            try {
                WebSocketClient.connect();
                this.updateUnreadCount();
            } catch (e) {
                if (typeof Config !== 'undefined' && Config.error) Config.error('WebSocket 连接失败', e);
            }
        }

        // 初始化全局搜索
        if (typeof Spotlight !== 'undefined') {
            Spotlight.init();
        }

        // 初始化快捷键帮助面板
        if (typeof ShortcutsHelp !== 'undefined') {
            ShortcutsHelp.init();
        }

        // 动态加载已安装模块的资源
        await this.loadModuleAssets();

        // 预加载常用模块资源（浏览器空闲时）
        if (typeof ResourceLoader !== 'undefined') {
            ResourceLoader.preloadModules(['/filemanager', '/notes', '/ai']);
        }

        // 遵守浏览器安全规范：在用户首次点击时请求通知权限
        const requestPermissionOnce = () => {
            if (typeof WebSocketClient !== 'undefined') {
                WebSocketClient.requestNotificationPermission();
            }
            document.removeEventListener('click', requestPermissionOnce);
        };
        document.addEventListener('click', requestPermissionOnce);
    },

    /**
     * 动态加载业务模块资源 (仅 CSS 预加载，JS 由路由懒加载处理)
     * 
     * 优化说明：
     * - CSS 预加载：避免首次进入模块时的样式闪烁
     * - JS 懒加载：由 Router.handleRoute() 在导航时按需加载
     */
    async loadModuleAssets() {
        const modules = Store.get('modules') || [];

        // 注册动态模块资源配置到 ResourceLoader
        // 由 Router 在导航时按需加载
        if (typeof ResourceLoader !== 'undefined') {
            ResourceLoader.registerDynamicModules(modules);
        }

        Config.log('业务模块资源配置已注册');
    },

    async updateUnreadCount() {
        try {
            const res = await NotificationApi.unreadCount();
            const count = res.data?.count || res.count || 0;
            Store.set('unreadMessages', count);
            Store.set('unreadNotifications', count);
        } catch (e) {
            Config.log('获取未读通知失败', e);
        }
    },

    updateDesktopClock() {
        const timeEl = document.getElementById('widget-time');
        const dateEl = document.getElementById('widget-date');
        const greetingEl = document.getElementById('widget-greeting');

        if (!timeEl || !dateEl) return;

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeEl.innerText = `${hours}:${minutes}`;

        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]}`;
        dateEl.innerText = dateStr;

        if (greetingEl && (!greetingEl.innerText || now.getMinutes() === 0)) {
            const h = now.getHours();
            let greeting = '你好';
            const user = Store.get('user');
            const nickname = user ? (user.nickname || user.username) : '朋友';

            if (h >= 5 && h < 11) greeting = '早上好';
            else if (h >= 11 && h < 13) greeting = '中午好';
            else if (h >= 13 && h < 18) greeting = '下午好';
            else if (h >= 18 && h < 23) greeting = '晚上好';
            else greeting = '夜深了';

            greetingEl.innerText = `${greeting}, ${nickname}`;
        }
    },

    registerRoutes() {
        Router.beforeEach = async (path) => {
            const publicRoutes = ['/login', '/register'];
            if (publicRoutes.includes(path)) {
                if (Store.get('isLoggedIn')) return '/desktop';
                return true;
            }
            if (!Store.get('isLoggedIn')) return '/login';
            return true;
        };

        const wrap = (PageClassName, title, ...args) => {
            return ({ params, path, query }) => {
                this.ensureDesktopEnvironment();

                // 动态获取类（处理延迟加载）
                let PageClass = typeof PageClassName === 'string' ? window[PageClassName] : PageClassName;

                if (!PageClass) {
                    if (typeof Config !== 'undefined' && Config.error) Config.error(`页面组件未定义: ${PageClassName}`);
                    Toast.error('加载页面组件失败，请尝试刷新页面');
                    return;
                }

                // 构造组件参数
                const props = [params ? params.id : null, ...args];

                // 重构完整路径（含查询参数）
                const qs = new URLSearchParams(query).toString();
                const fullUrl = qs ? `${path}?${qs}` : path;

                // 核心修复：返回到原来的窗口
                let windowId = path;
                const pathParts = path.split('/');
                const coreWindowGroups = [
                    'markdown', 'blog', 'notes', 'feedback', 'users', 'system', 'announcement',
                    'knowledge', 'album', 'video', 'exam', 'vault', 'pdf', 'profile', 'help',
                    'analysis', 'ai', 'map', 'lens', 'ocr', 'course', 'schedule', 'transfer', 'lm_cleaner'
                ];
                const moduleList = (typeof Store !== 'undefined' && Store.get) ? (Store.get('modules') || []) : [];
                const moduleIds = new Set(moduleList.map(m => m.id));
                const windowGroupIds = new Set([...coreWindowGroups, ...moduleIds]);
                if (pathParts.length > 1 && windowGroupIds.has(pathParts[1])) {
                    windowId = '/' + pathParts[1];
                }

                WindowManager.open(PageClass, props, {
                    title: title,
                    id: windowId, // 同一模块共享 ID
                    url: fullUrl
                });
            };
        };

        Router.notFound = (path) => {
            // 404 使用 Toast 提示，不阻塞主线程
            if (typeof Toast !== 'undefined') {
                Toast.warning(`页面不存在: ${path.replace(/[<>&"']/g, '')}`);
            } else {
                if (typeof Config !== 'undefined' && Config.warn) Config.warn(`Page Not Found: ${path}`);
            }
        };

        Router.registerAll({
            '/': { handler: () => Router.replace('/desktop') },
            '/login': {
                handler: () => {
                    const app = document.getElementById('app');
                    app.innerHTML = '';
                    const page = new LoginPage(app);
                    page.mount();
                }
            },
            '/desktop': {
                auth: true,
                handler: () => {
                    this.ensureDesktopEnvironment();
                    // 桌面路由不做什么，只是确保环境存在
                    // 如果需要关闭所有窗口？不，桌面模式应该保留窗口
                    // 只是不聚焦任何特定 App
                }
            }
            ,
            // ========== 相册模块路由 (自动生成) ==========
            '/album': {
                auth: true,
                handler: () => {
                    Router.replace('/album/list');
                }
            },
            '/album/list': { auth: true, handler: wrap('AlbumPage', '相册') },
            // ========== NotebookLM水印清除模块路由 ==========
            '/lm_cleaner': { auth: true, handler: wrap('LmCleanerPage', 'LM 水印清除') },
            '/lm_cleaner/list': { auth: true, handler: wrap('LmCleanerPage', '历史记录') },

        });

        // 注册业务路由
        Router.registerAll({
            '/blog/list': { auth: true, handler: wrap('BlogListPage', '博客列表') },
            '/blog/edit': { auth: true, handler: wrap('BlogEditPage', '新建文章') },
            '/blog/edit/:id': { auth: true, handler: wrap('BlogEditPage', '编辑文章') },
            '/blog/view/:id': { auth: true, handler: wrap('BlogViewPage', '查看文章') },
            '/blog/category': { auth: true, handler: wrap('BlogCategoryPage', '分类管理') },

            '/notes/list': { auth: true, handler: wrap('NotesListPage', '笔记') },
            '/notes/list/:id': { auth: true, handler: wrap('NotesListPage', '笔记文件夹') },
            '/notes/starred': { auth: true, handler: wrap('NotesStarredPage', '我的收藏') },
            '/notes/tags': { auth: true, handler: wrap('NotesTagsPage', '标签管理') },
            '/notes/edit': {
                auth: true,
                handler: () => {
                    this.ensureDesktopEnvironment();
                    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
                    const folderId = urlParams.get('folder');
                    // 特殊处理无ID的新笔记得以支持多开？或者用路径 '/notes/edit' 单例
                    // 暂时维持路径单例
                    WindowManager.open(window.NotesEditPage, [null, folderId], {
                        title: '新建笔记',
                        id: '/notes/edit' + (folderId ? `?folder=${folderId}` : '')
                    });
                }
            },
            '/notes/edit/:id': { auth: true, handler: wrap('NotesEditPage', '编辑笔记') },
            '/notes/view/:id': { auth: true, handler: wrap('NotesViewPage', '查看笔记') },

            '/feedback/my': { auth: true, handler: wrap('FeedbackListPage', '我的反馈') },
            '/feedback/create': { auth: true, handler: wrap('FeedbackCreatePage', '提交反馈') },
            '/feedback/list': { auth: true, handler: wrap('FeedbackAdminPage', '反馈管理') },
            '/feedback/view/:id': { auth: true, handler: wrap('FeedbackDetailPage', '反馈详情') },

            '/users/list': { auth: true, handler: wrap('UserListPage', '用户管理') },
            '/users/pending': { auth: true, handler: wrap('PendingUsersPage', '待审核用户') },

            '/notifications': { auth: true, handler: wrap('NotificationsPage', '通知中心') },

            '/system/settings': { auth: true, handler: wrap('SystemSettingsPage', '系统设置') },
            '/system/audit': { auth: true, handler: wrap('AuditLogsPage', '系统日志') },
            '/system/monitor': { auth: true, handler: wrap('MonitorPage', '系统监控') },

            '/profile': { auth: true, handler: wrap('ProfilePage', '个人中心') },
            '/profile/password': { auth: true, handler: wrap('ChangePasswordPage', '修改密码') },
            '/help': { auth: true, handler: wrap('HelpPage', '帮助中心') },
            '/theme/editor': { auth: true, handler: wrap('ThemeEditorPage', '主题编辑器') },

            '/system/backup': { auth: true, handler: wrap('BackupPage', '数据备份') },
            '/system/roles': { auth: true, handler: wrap('RolesPage', '权限管理') },

            '/announcement/list': { auth: true, handler: wrap('AnnouncementListPage', '公告管理') },
            '/announcement/edit': { auth: true, handler: wrap('AnnouncementEditPage', '发布公告') },
            '/announcement/edit/:id': { auth: true, handler: wrap('AnnouncementEditPage', '编辑公告') },
            '/announcement/view/:id': { auth: true, handler: wrap('AnnouncementViewPage', '查看公告') },

            '/filemanager': { auth: true, handler: wrap('FileManagerPage', '文件管理') },
            '/transfer': { auth: true, handler: wrap('TransferPage', '快传') },

            '/knowledge': { auth: true, handler: wrap('KnowledgeListPage', '知识库') },
            '/knowledge/list': { auth: true, handler: wrap('KnowledgeListPage', '知识库') },
            '/knowledge/view/:id': { auth: true, handler: wrap('KnowledgeViewPage', '知识库详情') },

            '/apps': { auth: true, handler: wrap('AppCenterMarketPage', '应用中心') },
            '/analysis': { auth: true, handler: wrap('AnalysisPage', '数据分析') },
            '/ai': { auth: true, handler: wrap('AIPage', 'AI助手') },
            '/ai/chat': { auth: true, handler: wrap('AIPage', '聊天对话') },
            '/map': { auth: true, handler: wrap('MapPage', '智能地图') },

            // 即时通讯
            '/im': { auth: true, handler: wrap('IMPage', '即时通讯') },
            '/im/messages': { auth: true, handler: wrap('IMPage', '即时通讯') },
            '/im/contacts': { auth: true, handler: wrap('IMPage', '联系人') },

            // DataLens 数据透镜
            '/lens': { auth: true, handler: wrap('DataLensPage', '数据透镜') },
            '/lens/view/:id': { auth: true, handler: wrap('DataLensPage', '数据透镜') },



            // 相册（主路由在上方 registerAll 中定义，重定向到 /album/list）

            // 视频
            '/video': { auth: true, handler: wrap('VideoPage', '我的视频') },

            // 考试
            '/exam': { auth: true, handler: wrap('ExamPage', '在线考试') },
            '/exam/questions': { auth: true, handler: wrap('ExamPage', '题库管理') },
            '/exam/papers': { auth: true, handler: wrap('ExamPage', '试卷管理') },

            // 图文识别
            '/ocr': { auth: true, handler: wrap('OCRPage', '图文识别') },
            '/ocr/recognize': { auth: true, handler: wrap('OCRPage', '识别图片') },

            // 课程学习
            '/course': { auth: true, handler: wrap('CoursePage', '课程学习') },
            '/course/list': { auth: true, handler: wrap('CoursePage', '课程中心') },
            '/course/learning': { auth: true, handler: wrap('CoursePage', '我的学习') },
            '/course/manage': { auth: true, handler: wrap('CoursePage', '课程管理') },

            // 日程管理
            '/schedule': { auth: true, handler: wrap('SchedulePage', '日程管理') },
            '/schedule/calendar': { auth: true, handler: wrap('SchedulePage', '日历视图') },
            '/schedule/list': { auth: true, handler: wrap('SchedulePage', '我的日程') },
            '/schedule/reminders': { auth: true, handler: wrap('SchedulePage', '提醒中心') },

            // 密码保险箱
            '/vault': { auth: true, handler: wrap('VaultPage', '密码箱') },
            '/vault/list': { auth: true, handler: wrap('VaultPage', '我的密码') },
            '/vault/categories': { auth: true, handler: wrap('VaultPage', '分类管理') },

            // PDF 工具
            '/pdf': { auth: true, handler: wrap('PdfPage', 'PDF 工具') },
            '/pdf/list': { auth: true, handler: wrap('PdfPage', 'PDF 工具') },
            '/pdf/reader': { auth: true, handler: wrap('PdfPage', 'PDF 阅读器') },

            // Markdown 编辑器
            '/markdown': { auth: true, handler: wrap('MarkdownListPage', 'Markdown') },
            '/markdown/list': { auth: true, handler: wrap('MarkdownListPage', '文档列表') },
            '/markdown/edit': { auth: true, handler: wrap('MarkdownEditPage', '新建文档') },
            '/markdown/edit/:id': { auth: true, handler: wrap('MarkdownEditPage', '编辑文档') },
            '/markdown/view/:id': { auth: true, handler: wrap('MarkdownViewPage', '查看文档') },
        });

    },

    ensureDesktopEnvironment() {
        const app = document.getElementById('app');
        if (document.getElementById('desktop-content')) {
            return;
        }

        // 渲染桌面基础结构
        app.innerHTML = `
            <div class="desktop-layout">
                <div id="top-bar"></div>
                
                <div id="desktop-content">
                    <!-- 桌面小部件 -->
                    <div class="desktop-widgets" id="desktop-widgets">
                        <div class="widget-clock">
                            <h1 class="widget-clock-time" id="widget-time">...</h1>
                            <p class="widget-clock-date" id="widget-date">...</p>
                        </div>
                        <div class="widget-greeting" id="widget-greeting"></div>
                    </div>
                    
                    <!-- 窗口由 WindowManager 动态插入 -->
                </div>

                <div id="dock"></div>
            </div>
        `;

        // 初始化组件
        this.topbar = new TopBarComponent(app.querySelector('#top-bar'));
        this.topbar.mount();

        this.dock = new DockComponent(app.querySelector('#dock'));
        this.dock.mount();

        const startMenuContainer = document.createElement('div');
        startMenuContainer.className = 'start-menu-container';
        app.appendChild(startMenuContainer);
        this.startMenu = new StartMenuComponent(startMenuContainer);
        this.startMenu.mount();

        // 初始化窗口管理器
        const desktopContent = document.getElementById('desktop-content');
        WindowManager.init(desktopContent);

        // 启动时钟（每 15 秒更新一次，时钟只显示到分钟级别，无需每秒更新）
        // 先清理旧定时器，防止多次调用导致定时器叠加
        if (this._clockInterval) {
            clearInterval(this._clockInterval);
        }
        this.updateDesktopClock();
        this._clockInterval = setInterval(() => this.updateDesktopClock(), 15000);
    },

    // 移除手动 bindEvents，因为窗口事件由 Manager 接管
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(err => {
        if (typeof Config !== 'undefined' && Config.error) Config.error('应用初始化失败:', err);
    });
});



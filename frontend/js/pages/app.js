/**
 * JeJe WebOS - 应用入口
 */

const App = {
    // 组件实例
    header: null,
    sidebar: null,
    content: null,
    currentPage: null,  // 当前页面组件实例

    /**
     * 初始化应用
     */
    /**
     * 初始化应用
     */
    async init() {
        Config.log('应用初始化...');

        // 获取系统初始化信息
        try {
            const token = localStorage.getItem(Config.storageKeys.token);
            const res = await SystemApi.init(token);
            Store.setSystemInfo(res.data);
            try {
                const setRes = await SystemApi.getSettings();
                Store.setSystemSettings(setRes.data);
            } catch (err) {
                console.warn('获取系统设置失败', err);
            }

            // 设置标题
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
                console.error('WebSocket 连接失败', e);
            }
        }
    },

    /**
     * 更新未读通知数
     */
    async updateUnreadCount() {
        try {
            const res = await NotificationApi.unreadCount();
            const count = res.data?.count || res.count || 0;
            Store.set('unreadNotifications', count);
        } catch (e) {
            // Silently fail or log debug
            Config.log('获取未读通知失败', e);
        }
    },

    /**
     * 更新桌面时钟和小部件
     */
    updateDesktopClock() {
        const timeEl = document.getElementById('widget-time');
        const dateEl = document.getElementById('widget-date');
        const greetingEl = document.getElementById('widget-greeting');

        if (!timeEl || !dateEl) return;

        const now = new Date();

        // 更新时间
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeEl.innerText = `${hours}:${minutes}`;

        // 更新日期
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]}`;
        dateEl.innerText = dateStr;

        // 更新问候语 (仅当元素为空时，或者整点更新)
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

    /**
     * 注册路由
     */
    registerRoutes() {
        // 路由守卫保持不变
        Router.beforeEach = async (path) => {
            // 公开路由
            const publicRoutes = ['/login', '/register'];

            if (publicRoutes.includes(path)) {
                // 已登录则跳转到首页
                if (Store.get('isLoggedIn')) {
                    return '/dashboard';
                }
                return true;
            }

            // 需要登录的路由
            if (!Store.get('isLoggedIn')) {
                return '/login';
            }

            return true;
        };

        // 404处理
        Router.notFound = (path) => {
            this.renderLayout(`
                <div class="empty-state" style="text-align:center; padding-top:100px; color:#fff;">
                    <div style="font-size:48px; margin-bottom:16px;">🔍</div>
                    <h2>Page Not Found</h2>
                    <p>The path "${path}" does not exist.</p>
                </div>
            `);
        };

        // 注册所有路由
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
                    // 桌面视图（空内容，显示壁纸和组件）
                    this.renderLayout(null);
                    this.destroyCurrentPage();
                    this.setWindowTitle('');
                }
            },
            // ========== 商品模块路由 (自动生成) ==========
        });

        const wrap = (PageClass, title, ...args) => {
            return ({ params }) => {
                // 传递空对象以指示我们需要显示窗口
                this.renderLayout({});
                this.destroyCurrentPage();

                const id = params ? params.id : null;
                if (id) {
                    this.currentPage = new PageClass(this.content, id, ...args);
                } else {
                    this.currentPage = new PageClass(this.content, ...args);
                }

                this.currentPage.mount();
                this.setWindowTitle(title);
            };
        };

        // 重新注册简化的路由映射
        Router.registerAll({
            '/blog/list': { auth: true, handler: wrap(BlogListPage, '博客列表') },
            '/blog/edit': { auth: true, handler: wrap(BlogEditPage, '新建文章') },
            '/blog/edit/:id': { auth: true, handler: wrap(BlogEditPage, '编辑文章') },
            '/blog/view/:id': { auth: true, handler: wrap(BlogViewPage, '查看文章') },
            '/blog/category': { auth: true, handler: wrap(BlogCategoryPage, '分类管理') },

            '/notes/list': { auth: true, handler: wrap(NotesListPage, '随手记') },
            '/notes/list/:id': { auth: true, handler: wrap(NotesListPage, '笔记文件夹') },
            '/notes/starred': { auth: true, handler: wrap(NotesStarredPage, '我的收藏') },
            '/notes/tags': { auth: true, handler: wrap(NotesTagsPage, '标签管理') },
            '/notes/edit': {
                auth: true,
                handler: ({ }) => {
                    this.renderLayout({});
                    this.destroyCurrentPage();
                    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
                    const folderId = urlParams.get('folder');
                    this.currentPage = new NotesEditPage(this.content, null, folderId);
                    this.currentPage.mount();
                    this.setWindowTitle('新建笔记');
                }
            },
            '/notes/edit/:id': { auth: true, handler: wrap(NotesEditPage, '编辑笔记') },
            '/notes/view/:id': { auth: true, handler: wrap(NotesViewPage, '查看笔记') },

            '/feedback/my': { auth: true, handler: wrap(FeedbackListPage, '我的反馈') },
            '/feedback/create': { auth: true, handler: wrap(FeedbackCreatePage, '提交反馈') },
            '/feedback/list': { auth: true, handler: wrap(FeedbackAdminPage, '反馈管理') },
            '/feedback/view/:id': { auth: true, handler: wrap(FeedbackDetailPage, '反馈详情') },

            '/users/list': { auth: true, handler: wrap(UserListPage, '用户管理') },
            '/users/pending': { auth: true, handler: wrap(PendingUsersPage, '待审核用户') },

            '/message/list': { auth: true, handler: wrap(MessagesPage, '信息中心') },

            '/system/settings': { auth: true, handler: wrap(SystemSettingsPage, '系统设置') },
            '/system/audit': { auth: true, handler: wrap(AuditLogsPage, '系统日志') },
            '/system/monitor': { auth: true, handler: wrap(MonitorPage, '系统监控') },

            '/profile': { auth: true, handler: wrap(ProfilePage, '个人中心') },
            '/profile/password': { auth: true, handler: wrap(ChangePasswordPage, '修改密码') },
            '/help': { auth: true, handler: wrap(HelpPage, '帮助中心') },

            // 恢复智能仪表盘访问


            // 其他功能路由（存储、备份、角色、公告）
            '/storage/list': { auth: true, handler: wrap(StoragePage, '文件存储') },
            '/system/backup': { auth: true, handler: wrap(BackupPage, '数据备份') },
            '/system/roles': { auth: true, handler: wrap(RolesPage, '权限管理') },

            '/announcement/list': { auth: true, handler: wrap(AnnouncementListPage, '公告管理') },
            '/announcement/edit': { auth: true, handler: wrap(AnnouncementEditPage, '发布公告') },
            '/announcement/edit/:id': { auth: true, handler: wrap(AnnouncementEditPage, '编辑公告') },
            '/announcement/view/:id': { auth: true, handler: wrap(AnnouncementViewPage, '查看公告') },

            // 应用中心
            '/apps': { auth: true, handler: wrap(AppCenterMarketPage, '应用中心') },

            // ========== 数据管理模块路由 (自动生成) ==========
            // ========== 任务模块路由 (自动生成) ==========

            // 根据需要添加更多...
        });
    },

    destroyCurrentPage() {
        if (this.currentPage && typeof this.currentPage.destroy === 'function') {
            this.currentPage.destroy();
        }
        if (this.content) this.content.innerHTML = '';
        this.currentPage = null;
    },

    setWindowTitle(title) {
        const titleEl = document.getElementById('window-title-text');
        if (titleEl) titleEl.innerText = title;
    },

    renderLayout(content = null) {
        const app = document.getElementById('app');

        // 如果外壳不存在则渲染
        if (!document.getElementById('desktop-content')) {
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

                        <!-- 窗口默认隐藏 -->
                        <div class="window-container" id="main-window" style="display: none;">
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
                                <div class="window-title" id="window-title-text">应用</div>
                            </div>
                            <div class="window-body" id="content">
                            </div>
                        </div>
                    </div>

                    <div id="dock"></div>
                </div>
            `;

            // 初始化组件
            this.topbar = new TopBarComponent(app.querySelector('#top-bar'));
            this.topbar.mount();

            this.dock = new DockComponent(app.querySelector('#dock'));
            this.dock.mount();

            // 初始化开始菜单
            const startMenuContainer = document.createElement('div');
            startMenuContainer.className = 'start-menu-container';
            app.appendChild(startMenuContainer);
            this.startMenu = new StartMenuComponent(startMenuContainer);
            this.startMenu.mount();

            this.content = document.getElementById('content');
            this.mainWindow = document.getElementById('main-window');

            // 立即启动时钟
            this.updateDesktopClock();
            setInterval(() => this.updateDesktopClock(), 1000);

            // 重新绑定全局事件（如窗口大小调整）
            this.bindEvents && this.bindEvents();
        } else {
            // 确保引用存在（防止热重载或状态丢失）
            if (!this.content) this.content = document.getElementById('content');
            if (!this.mainWindow) this.mainWindow = document.getElementById('main-window');
        }

        // 处理内容
        if (content === null) {
            // 纯桌面模式
            if (this.mainWindow) {
                this.mainWindow.classList.remove('active', 'maximized');
                this.mainWindow.style.display = 'none';
            }
            // 恢复桌面状态
            const widgets = document.getElementById('desktop-widgets');
            if (widgets) widgets.classList.remove('blur-out');

            // 隐藏顶部时间
            if (this.topbar) this.topbar.setState({ hideTime: true });
        } else {
            // 显示窗口
            if (this.mainWindow) {
                this.mainWindow.style.display = 'flex';
                // 微小延迟以允许动画生效
                setTimeout(() => this.mainWindow.classList.add('active'), 10);
            }
            // 模糊小部件
            const widgets = document.getElementById('desktop-widgets');
            if (widgets) widgets.classList.add('blur-out');

            // 显示顶部时间
            if (this.topbar) this.topbar.setState({ hideTime: false });

            // 对于组件页面，内容稍后挂载
            // 对于字符串内容（如404），在此设置
            if (typeof content === 'string') {
                this.content.innerHTML = content;
            }
        }
    },

    bindEvents() {
        // 全局事件
        const app = document.getElementById('app');

        // 窗口控制事件（使用事件委托）
        app.addEventListener('click', (e) => {
            // 使用 closest() 处理子元素点击（如 SVG 图标）
            const closeBtn = e.target.closest('.window-btn.close');
            const minimizeBtn = e.target.closest('.window-btn.minimize');
            const maximizeBtn = e.target.closest('.window-btn.maximize');

            // 关闭
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();

                const currentQuery = Router.current().query;
                if (currentQuery && currentQuery.from === 'apps') {
                    // 如果是从应用中心打开的，返回应用中心
                    Router.push('/apps');
                } else {
                    // 默认回到桌面
                    Router.push('/desktop');
                }
            }

            // 最小化
            if (minimizeBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (this.mainWindow) {
                    this.mainWindow.classList.remove('active');
                    setTimeout(() => {
                        this.mainWindow.style.display = 'none';
                    }, 300);

                    // 恢复桌面状态
                    const widgets = document.getElementById('desktop-widgets');
                    if (widgets) widgets.classList.remove('blur-out');

                    if (this.topbar) this.topbar.setState({ hideTime: true });
                }
            }

            // 最大化
            if (maximizeBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (this.mainWindow) {
                    this.mainWindow.classList.toggle('maximized');
                }
            }
        });
    }
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});



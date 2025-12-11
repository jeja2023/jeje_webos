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
    async init() {
        Config.log('应用初始化...');

        // 获取系统初始化信息
        try {
            const token = localStorage.getItem(Config.storageKeys.token);
            const res = await SystemApi.init(token);
            Store.setSystemInfo(res.data);
            // 拉取系统设置（无需登录，应用默认主题）
            try {
                const setRes = await SystemApi.getSettings();
                Store.setSystemSettings(setRes.data);
            } catch (err) {
                Config.error('获取系统设置失败', err);
            }
            Config.log('系统信息加载完成', res.data);

            // 动态设置浏览器标签页标题
            if (res.data.app_name) {
                document.title = res.data.app_name;
            }

            // 如果侧边栏已存在，强制刷新以显示最新菜单
            if (this.sidebar) {
                this.sidebar.update();
            }
        } catch (error) {
            Config.error('系统初始化失败', error);
        }

        // 注册路由
        this.registerRoutes();

        // 启动路由
        Router.init();

        // 连接 WebSocket（如果已登录）
        if (Store.get('isLoggedIn')) {
            try {
                WebSocketClient.connect();
            } catch (e) {
                Config.error('WebSocket 连接失败', e);
            }
        }

        Config.log('应用启动完成');
    },

    /**
     * 注册路由
     */
    registerRoutes() {
        // 路由守卫
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

            // 模块启停校验：如果访问禁用模块的路由，跳转到仪表盘
            const modules = Store.get('modules') || [];
            const user = Store.get('user') || {};
            const perms = user.permissions || [];
            const isSuperAdmin = user.role === 'admin';
            const isManager = user.role === 'manager';
            const isAdmin = isSuperAdmin || isManager;
            const checkDisabled = (prefix) => {
                const mod = modules.find(m => m.router_prefix === prefix || path.startsWith(prefix.replace('/api', '')));
                if (mod && mod.enabled === false) return true;
                return false;
            };
            const hasModulePerm = (moduleId) => {
                if (isAdmin) return true;
                if (perms.includes('*')) return true;
                return perms.some(p => p.startsWith(moduleId + '.'));
            };
            if (checkDisabled('/api/v1/blog') && path.startsWith('/blog')) {
                Toast.error('博客模块已禁用');
                return '/dashboard';
            }
            if (checkDisabled('/api/v1/notes') && path.startsWith('/notes')) {
                Toast.error('笔记模块已禁用');
                return '/dashboard';
            }
            if (checkDisabled('/api/v1/feedback') && path.startsWith('/feedback')) {
                Toast.error('意见建议模块已禁用');
                return '/dashboard';
            }
            if (path.startsWith('/blog') && !hasModulePerm('blog')) {
                Toast.error('无权访问博客模块');
                return '/dashboard';
            }
            if (path.startsWith('/notes') && !hasModulePerm('notes')) {
                Toast.error('无权访问笔记模块');
                return '/dashboard';
            }
            if (path.startsWith('/feedback') && !hasModulePerm('feedback')) {
                Toast.error('无权访问意见建议模块');
                return '/dashboard';
            }

            // 系统功能权限校验
            const systemRoutePerms = [
                { match: (p) => p.startsWith('/users'), allowRoles: ['admin', 'manager'], msg: '无权访问用户管理' },
                { match: (p) => p.startsWith('/system/apps'), allowRoles: ['admin'], msg: '无权访问应用中心' },
                { match: (p) => p.startsWith('/system/settings'), allowRoles: ['admin'], msg: '无权访问系统设置' },
                { match: (p) => p.startsWith('/system/audit'), allowRoles: ['admin', 'manager'], msg: '无权访问系统日志' },
                { match: (p) => p.startsWith('/system/roles'), allowRoles: ['admin', 'manager'], msg: '无权访问用户组' },
                { match: (p) => p.startsWith('/system/monitor'), allowRoles: ['admin'], msg: '无权访问系统监控' },
                { match: (p) => p.startsWith('/system/storage'), allowRoles: ['admin'], msg: '无权访问文件存储' },
                { match: (p) => p.startsWith('/system/backup'), allowRoles: ['admin'], msg: '无权访问数据备份' },
                { match: (p) => p.startsWith('/system/report'), allowRoles: ['admin'], msg: '无权访问数据报表' },
                { match: (p) => p.startsWith('/system/import-export'), allowRoles: ['admin'], msg: '无权访问数据报表' },

            ];
            for (const item of systemRoutePerms) {
                if (item.match(path) && !item.allowRoles.includes(user.role)) {
                    Toast.error(item.msg || '无访问权限');
                    return '/dashboard';
                }
            }

            return true;
        };

        // 404处理
        Router.notFound = (path) => {
            this.renderLayout(`
                <div class="page fade-in">
                    <div class="empty-state" style="padding-top: 100px">
                        <div class="empty-icon">🔍</div>
                        <h2 style="margin-bottom: 8px">页面未找到</h2>
                        <p class="empty-text">路径 "${path}" 不存在</p>
                        <button class="btn btn-primary" onclick="Router.push('/dashboard')">返回首页</button>
                    </div>
                </div>
            `);
        };

        // 注册路由
        Router.registerAll({
            '/': {
                handler: () => Router.replace('/dashboard')
            },

            '/login': {
                handler: () => {
                    const app = document.getElementById('app');
                    const page = new LoginPage(app);
                    page.mount();
                }
            },

            '/dashboard': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    this.destroyCurrentPage();
                    this.currentPage = new DashboardPage(this.content);
                    this.currentPage.mount();
                    this.header.setBreadcrumb(['首页', '仪表盘']);
                }
            },

            '/blog/list': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new BlogListPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['博客', '文章列表']);
                }
            },

            '/blog/edit': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new BlogEditPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['博客', '发布文章']);
                }
            },

            '/blog/edit/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new BlogEditPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['博客', '编辑文章']);
                }
            },

            '/blog/view/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new BlogViewPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['博客', '文章详情']);
                }
            },

            '/blog/category': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new BlogCategoryPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['博客', '分类管理']);
                }
            },

            '/announcement/list': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new AnnouncementListPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['公告管理', '公告列表']);
                }
            },

            '/announcement/edit': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new AnnouncementEditPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['公告管理', '发布公告']);
                }
            },

            '/announcement/edit/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new AnnouncementEditPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['公告管理', '编辑公告']);
                }
            },

            '/announcement/view/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new AnnouncementViewPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['公告管理', '公告详情']);
                }
            },

            '/users/list': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new UserListPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '用户管理']);
                }
            },

            '/users/pending': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new PendingUsersPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '待审核用户']);
                }
            },

            // 系统管理
            '/system/apps': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new AppCenterPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '应用中心']);
                }
            },
            '/system/settings': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new SystemSettingsPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '系统设置']);
                }
            },
            '/system/audit': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new AuditLogsPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '系统日志']);
                }
            },
            '/system/roles': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new RolesPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '角色模板']);
                }
            },
            '/system/monitor': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new MonitorPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '系统监控']);
                }
            },
            '/system/report': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new DataReportPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '数据报表']);
                }
            },
            '/system/backup': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new BackupPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '数据备份']);
                }
            },
            '/system/storage': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new StoragePage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '文件存储']);
                }
            },


            '/notifications': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new NotificationsPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['系统', '通知管理']);
                }
            },

            '/profile': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new ProfilePage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['个人中心']);
                }
            },

            '/profile/password': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new ChangePasswordPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['个人中心', '修改密码']);
                }
            },

            '/help': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new HelpPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['使用帮助']);
                }
            },

            // 笔记模块路由
            '/notes/list': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new NotesListPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '所有笔记']);
                }
            },


            '/notes/list/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new NotesListPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '文件夹']);
                }
            },

            '/notes/edit': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
                    const folderId = urlParams.get('folder');
                    const page = new NotesEditPage(this.content, null, folderId);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '新建笔记']);
                }
            },

            '/notes/edit/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new NotesEditPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '编辑笔记']);
                }
            },

            '/notes/view/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new NotesViewPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '查看笔记']);
                }
            },

            '/notes/starred': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new NotesStarredPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '我的收藏']);
                }
            },

            '/notes/tags': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new NotesTagsPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['笔记', '标签管理']);
                }
            },

            // 意见建议模块
            '/feedback': {
                auth: true,
                handler: () => Router.replace('/feedback/my')
            },
            '/feedback/my': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new FeedbackListPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['意见建议', '我的反馈']);
                }
            },
            '/feedback/create': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new FeedbackCreatePage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['意见建议', '提交反馈']);
                }
            },
            '/feedback/admin': {
                auth: true,
                handler: () => {
                    this.renderLayout();
                    const page = new FeedbackAdminPage(this.content);
                    page.mount();
                    this.header.setBreadcrumb(['意见建议', '反馈管理']);
                }
            },
            '/feedback/view/:id': {
                auth: true,
                handler: ({ params }) => {
                    this.renderLayout();
                    const page = new FeedbackDetailPage(this.content, params.id);
                    page.mount();
                    this.header.setBreadcrumb(['意见建议', '反馈详情']);
                }
            }
        });
    },

    /**
     * 销毁当前页面组件
     */
    destroyCurrentPage() {
        if (this.currentPage && typeof this.currentPage.destroy === 'function') {
            this.currentPage.destroy();
        }
        this.currentPage = null;
    },

    /**
     * 刷新侧边栏菜单
     */
    refreshSidebar() {
        if (this.sidebar) {
            this.sidebar.update();
        }
    },

    /**
     * 渲染主布局
     */
    renderLayout(content = '') {
        const app = document.getElementById('app');
        const collapsed = Store.get('sidebarCollapsed');

        // 检查布局是否已存在
        if (!app.querySelector('.layout')) {
            app.innerHTML = `
                <div class="layout">
                    <div id="sidebar"></div>
                    <div class="main-wrapper">
                        <div id="header"></div>
                        <main class="main-content" id="content"></main>
                    </div>
                </div>
            `;

            // 初始化组件
            this.sidebar = new SidebarComponent('#sidebar');
            this.sidebar.mount();

            this.header = new HeaderComponent('#header');
            this.header.mount();

            this.content = document.getElementById('content');

            // 应用侧边栏状态
            if (collapsed) {
                document.querySelector('.sidebar')?.classList.add('collapsed');
            }
        }

        // 更新内容
        if (content) {
            this.content.innerHTML = content;
        }
    }
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});



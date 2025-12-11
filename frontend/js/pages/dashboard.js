/**
 * 仪表盘页面
 */

class DashboardPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            stats: null,
            announcements: [],
            loading: true
        };
    }

    async loadData() {
        try {
            const [statsRes, noticeRes] = await Promise.all([
                SystemApi.getStats(),
                AnnouncementApi.getPublished(5).catch(() => ({ data: [] }))
            ]);
            this.setState({
                stats: statsRes.data,
                announcements: noticeRes.data || [],
                loading: false
            });
        } catch (error) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    showAnnouncement(notice) {
        new Modal({
            title: `📢 ${notice.title}`,
            content: `
                <div class="announcement-detail">
                    <div class="meta" style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
                        <span>发布于 ${Utils.formatDate(notice.created_at)}</span>
                        <span style="margin:0 8px">|</span>
                        <span>发布人: ${Utils.escapeHtml(notice.created_by_name || '系统管理员')}</span>
                    </div>
                    <div class="content markdown-body" style="line-height:1.6;">
                        ${Utils.escapeHtml(notice.content).replace(/\n/g, '<br>')}
                    </div>
                </div>
            `,
            footer: '<button class="btn btn-primary" data-action="confirm">关闭</button>',
            width: '600px'
        }).show();

        // 记录阅读
        AnnouncementApi.view(notice.id).catch(() => { });
    }

    render() {
        const { stats, announcements, loading } = this.state;
        const user = Store.get('user');
        const isSuperAdmin = user?.role === 'admin';
        const isManager = user?.role === 'manager';
        const isAdmin = isSuperAdmin || isManager;
        const modules = Store.get('modules') || [];
        const visibleModules = isAdmin ? modules : modules.filter(m => m.visible !== false && m.enabled);

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">


                <div class="page-header">
                    <h1 class="page-title">欢迎回来，${Utils.escapeHtml(user?.nickname || user?.username || '用户')}</h1>
                    <p class="page-desc">这是您的个人工作台概览</p>
                </div>
                
                <div class="card-grid">
                    ${isAdmin ? `
                        <div class="card stat-card">
                            <div class="stat-icon primary">📦</div>
                            <div class="stat-value">${modules.length}</div>
                            <div class="stat-label">已安装模块</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon info">👥</div>
                            <div class="stat-value">${stats?.users || 0}</div>
                            <div class="stat-label">系统用户</div>
                        </div>
                        <div class="card stat-card ${(stats?.pending_users || 0) > 0 ? 'stat-card-warning' : ''}">
                            <div class="stat-icon ${(stats?.pending_users || 0) > 0 ? 'warning' : 'success'}">⏳</div>
                            <div class="stat-value">${stats?.pending_users || 0}</div>
                            <div class="stat-label">待审核用户</div>
                            ${(stats?.pending_users || 0) > 0 ? `<a href="#/users/pending" class="stat-link">去处理 →</a>` : ''}
                        </div>
                        <div class="card stat-card ${(stats?.pending_feedback || 0) > 0 ? 'stat-card-warning' : ''}">
                            <div class="stat-icon ${(stats?.pending_feedback || 0) > 0 ? 'warning' : 'success'}">💬</div>
                            <div class="stat-value">${stats?.pending_feedback || 0}</div>
                            <div class="stat-label">待处理反馈</div>
                            ${(stats?.pending_feedback || 0) > 0 ? `<a href="#/feedback/admin" class="stat-link">去处理 →</a>` : ''}
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon ${stats?.health?.database === 'ok' && stats?.health?.redis === 'ok' ? 'success' : stats?.health?.redis === 'error' ? 'danger' : 'info'}">🏥</div>
                            <div class="stat-value" style="font-size: 14px;">
                                <span title="数据库" style="margin-right:8px;">💾 ${stats?.health?.database === 'ok' ? '✅' : '❌'}</span>
                                <span title="Redis 缓存">🔴 ${stats?.health?.redis === 'ok' ? '✅' : stats?.health?.redis === 'disabled' ? '⚪' : '❌'}</span>
                            </div>
                            <div class="stat-label">系统状态</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon warning">⚡</div>
                            <div class="stat-value">${stats?.version || '1.0.0'}</div>
                            <div class="stat-label">系统版本</div>
                        </div>
                    ` : `
                        <div class="card stat-card">
                            <div class="stat-icon primary">📦</div>
                            <div class="stat-value">${visibleModules.length}</div>
                            <div class="stat-label">可用模块</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon info">📒</div>
                            <div class="stat-value">${stats?.user_stats?.notes_count || 0}</div>
                            <div class="stat-label">我的笔记</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon success">📝</div>
                            <div class="stat-value">${stats?.user_stats?.blogs_count || 0}</div>
                            <div class="stat-label">我的博客</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon warning">⭐</div>
                            <div class="stat-value">${stats?.user_stats?.recent_starred?.length || 0}</div>
                            <div class="stat-label">我的收藏</div>
                        </div>
                    `}
                </div>

                <div class="dashboard-grid">
                    <!-- 左侧：最新公告 -->
                    <div class="card" style="height: fit-content;">
                        <div class="card-header" style="justify-content: space-between;">
                            <h3 class="card-title">📢 最新公告</h3>
                            ${announcements.length > 0 ? `<a href="#/announcement/list" style="font-size:12px;color:var(--primary-color);">全部 ></a>` : ''}
                        </div>
                        <div class="card-body" style="padding: 0;">
                            ${announcements.length > 0 ? `
                                <div class="notice-list">
                                    ${announcements.map(notice => `
                                        <div class="notice-item" data-notice="${notice.id}">
                                            <div class="notice-icon ${notice.is_top ? 'top' : ''}">
                                                ${notice.is_top ? '🔥' : '📄'}
                                            </div>
                                            <div class="notice-content">
                                                <div class="notice-title" title="${Utils.escapeHtml(notice.title)}">
                                                    ${Utils.escapeHtml(notice.title)}
                                                </div>
                                                <div class="notice-preview">
                                                    ${Utils.escapeHtml(Utils.truncate(notice.content, 60))}
                                                </div>
                                                <div class="notice-meta">
                                                    <span>${Utils.formatDate(notice.created_at)}</span>
                                                    <span class="tag ${notice.type === 'error' ? 'tag-danger' : notice.type === 'warning' ? 'tag-warning' : 'tag-secondary'}" style="transform:scale(0.8);transform-origin:right center;">
                                                        ${notice.type === 'info' ? '信息' : notice.type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="empty-state" style="padding: 32px 0;">
                                    <div class="empty-text" style="color:var(--text-secondary)">暂无最新公告</div>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- 右侧：模块列表 -->
                    <div class="card" style="height: fit-content;">
                        <div class="card-header">
                            <h3 class="card-title">${isAdmin ? '已安装模块' : '可用模块'}</h3>
                        </div>
                        <div class="card-body" style="padding: 0;">
                            ${visibleModules.length > 0 ? `
                                <div class="table-wrapper" style="margin: 0;">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>模块</th>
                                                <th>版本</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${visibleModules.map(m => `
                                                <tr>
                                                    <td>
                                                        <div style="display:flex;align-items:center;gap:8px;">
                                                            <span style="font-size:18px;">${m.icon || '📦'}</span>
                                                            <div style="display:flex;flex-direction:column;">
                                                                <span style="font-weight:500;">${Utils.escapeHtml(m.name)}</span>
                                                                <span style="font-size:12px;color:var(--text-secondary);">${Utils.escapeHtml(m.description || '暂无描述')}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td><span class="tag">${m.version}</span></td>
                                                    <td>
                                                        <span class="tag ${m.enabled ? 'tag-primary' : 'tag-danger'}">
                                                            ${m.enabled ? '启用' : '禁用'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div class="empty-state">
                                    <div class="empty-icon">📭</div>
                                    <p class="empty-text">暂无更多模块</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                ${!isAdmin && stats?.user_stats ? `
                    <!-- 普通用户：最近内容 -->
                    <div class="dashboard-grid" style="margin-top: var(--spacing-xl);">
                        <!-- 最近收藏 -->
                        <div class="card" style="height: fit-content;">
                            <div class="card-header" style="justify-content: space-between;">
                                <h3 class="card-title">⭐ 我的收藏</h3>
                                <a href="#/notes/starred" style="font-size:12px;color:var(--primary-color);">查看全部 ></a>
                            </div>
                            <div class="card-body" style="padding: 0;">
                                ${(stats.user_stats.recent_starred?.length || 0) > 0 ? `
                                    <div class="notice-list">
                                        ${stats.user_stats.recent_starred.map(item => `
                                            <a class="notice-item" href="#/notes/edit/${item.id}" style="text-decoration:none;">
                                                <div class="notice-icon">⭐</div>
                                                <div class="notice-content">
                                                    <div class="notice-title">${Utils.escapeHtml(item.title || '未命名笔记')}</div>
                                                    <div class="notice-meta">
                                                        <span>${Utils.timeAgo(item.updated_at)}</span>
                                                    </div>
                                                </div>
                                            </a>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="empty-state" style="padding: 32px 0;">
                                        <div class="empty-text" style="color:var(--text-secondary)">暂无收藏的笔记</div>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 最近笔记 -->
                        <div class="card" style="height: fit-content;">
                            <div class="card-header" style="justify-content: space-between;">
                                <h3 class="card-title">📒 最近笔记</h3>
                                <a href="#/notes/list" style="font-size:12px;color:var(--primary-color);">查看全部 ></a>
                            </div>
                            <div class="card-body" style="padding: 0;">
                                ${(stats.user_stats.recent_notes?.length || 0) > 0 ? `
                                    <div class="notice-list">
                                        ${stats.user_stats.recent_notes.map(item => `
                                            <a class="notice-item" href="#/notes/edit/${item.id}" style="text-decoration:none;">
                                                <div class="notice-icon">📄</div>
                                                <div class="notice-content">
                                                    <div class="notice-title">${Utils.escapeHtml(item.title || '未命名笔记')}</div>
                                                    <div class="notice-meta">
                                                        <span>${Utils.timeAgo(item.updated_at)}</span>
                                                    </div>
                                                </div>
                                            </a>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="empty-state" style="padding: 32px 0;">
                                        <div class="empty-text" style="color:var(--text-secondary)">暂无笔记</div>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedDashboard) {
            this.container._bindedDashboard = true;
            this.delegate('click', '[data-notice]', (e, t) => {
                const id = parseInt(t.dataset.notice);
                const notice = this.state.announcements.find(n => n.id === id);
                if (notice) this.showAnnouncement(notice);
            });
        }
    }
}

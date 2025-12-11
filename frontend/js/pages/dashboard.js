/**
 * 仪表盘页面
 */

class DashboardPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            stats: null,
            loading: true
        };
    }
    
    async loadData() {
        try {
            const res = await SystemApi.getStats();
            this.setState({ stats: res.data, loading: false });
        } catch (error) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }
    
    render() {
        const { stats, loading } = this.state;
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
                    ` : `
                        <div class="card stat-card">
                            <div class="stat-icon primary">📦</div>
                            <div class="stat-value">${visibleModules.length}</div>
                            <div class="stat-label">可用模块</div>
                        </div>
                    `}
                    
                    ${isAdmin ? `
                        <div class="card stat-card">
                            <div class="stat-icon warning">⚡</div>
                            <div class="stat-value">${stats?.version || '1.0.0'}</div>
                            <div class="stat-label">系统版本</div>
                        </div>
                    ` : ''}
                </div>
                
                <div style="margin-top: var(--spacing-xl)">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${isAdmin ? '已安装模块' : '可用模块'}</h3>
                        </div>
                        <div class="card-body">
                            ${visibleModules.length > 0 ? `
                                <div class="table-wrapper">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>模块</th>
                                                <th>版本</th>
                                                <th>描述</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${visibleModules.map(m => `
                                                <tr>
                                                    <td>
                                                        <span style="margin-right: 8px">${m.icon || '📦'}</span>
                                                        ${Utils.escapeHtml(m.name)}
                                                    </td>
                                                    <td><span class="tag">${m.version}</span></td>
                                                    <td>${Utils.escapeHtml(m.description || '-')}</td>
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
                                    <p class="empty-text">暂无已安装模块</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    afterMount() {
        this.loadData();
    }
}



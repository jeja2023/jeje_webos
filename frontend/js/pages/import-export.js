/**
 * 数据报表页面
 * 导出系统数据为可读格式（CSV/JSON/Excel）用于分析和查看
 */

class DataReportPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            exporting: null  // 当前正在导出的类型
        };
    }

    async handleExport(type, format) {
        const token = localStorage.getItem(Config.storageKeys.token);
        let url;
        let typeName;

        switch (type) {
            case 'users':
                url = ExportApi.exportUsers(format);
                typeName = '用户数据';
                break;
            case 'notifications':
                url = ExportApi.exportNotifications(format);
                typeName = '通知数据';
                break;
            case 'files':
                url = ExportApi.exportFiles(format);
                typeName = '文件记录';
                break;
            default:
                Toast.error('未知导出类型');
                return;
        }

        // 添加 token 到 URL
        const separator = url.includes('?') ? '&' : '?';
        window.open(`${url}${separator}token=${token}`, '_blank');
        Toast.success(`正在导出${typeName}...`);
    }

    render() {
        return `
            <div class="page fade-in compact-page">
                <div class="page-header compact-header">
                    <h1 class="page-title">📊 数据报表</h1>
                    <p class="page-desc">导出系统数据用于分析和查看</p>
                </div>

                <div class="report-layout">
                    <!-- 用户数据 -->
                    <div class="card card-compact">
                        <div class="card-header">
                            <h3 class="card-title">👥 用户数据</h3>
                        </div>
                        <div class="card-body">
                            <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
                                导出所有用户的账号信息，包含用户名、手机号、角色、状态等。
                            </p>
                            <div class="export-btns" style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="btn btn-secondary" data-export="users" data-format="xlsx">
                                    📗 导出 Excel
                                </button>
                                <button class="btn btn-secondary" data-export="users" data-format="csv">
                                    📄 导出 CSV
                                </button>
                                <button class="btn btn-secondary" data-export="users" data-format="json">
                                    📋 导出 JSON
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 通知数据 -->
                    <div class="card card-compact">
                        <div class="card-header">
                            <h3 class="card-title">🔔 通知数据</h3>
                        </div>
                        <div class="card-body">
                            <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
                                导出系统通知记录，包含标题、内容、类型、已读状态等。
                            </p>
                            <div class="export-btns" style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="btn btn-secondary" data-export="notifications" data-format="xlsx">
                                    📗 导出 Excel
                                </button>
                                <button class="btn btn-secondary" data-export="notifications" data-format="csv">
                                    📄 导出 CSV
                                </button>
                                <button class="btn btn-secondary" data-export="notifications" data-format="json">
                                    📋 导出 JSON
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 文件记录 -->
                    <div class="card card-compact">
                        <div class="card-header">
                            <h3 class="card-title">📁 文件记录</h3>
                        </div>
                        <div class="card-body">
                            <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
                                导出所有上传文件的记录，包含文件名、大小、类型、上传时间等。
                            </p>
                            <div class="export-btns" style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="btn btn-secondary" data-export="files" data-format="xlsx">
                                    📗 导出 Excel
                                </button>
                                <button class="btn btn-secondary" data-export="files" data-format="csv">
                                    📄 导出 CSV
                                </button>
                                <button class="btn btn-secondary" data-export="files" data-format="json">
                                    📋 导出 JSON
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card" style="margin-top:var(--spacing-lg);">
                    <div class="card-body" style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:24px;">💡</span>
                        <div>
                            <div style="font-weight:500;">提示</div>
                            <div style="color:var(--text-secondary);font-size:14px;">
                                数据报表用于导出可读格式的数据，便于分析和查看。如需完整系统备份用于恢复，请使用 
                                <a href="#/system/backup" style="color:var(--color-primary);">数据备份</a> 功能。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedReport) {
            this.container._bindedReport = true;

            // 导出按钮
            this.delegate('click', '[data-export]', (e, t) => {
                const type = t.dataset.export;
                const format = t.dataset.format;
                this.handleExport(type, format);
            });
        }
    }
}

// 保持向后兼容
const ImportExportPage = DataReportPage;



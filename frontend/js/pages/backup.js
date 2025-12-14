/**
 * 数据备份与恢复页面
 */

class BackupPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            backups: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            creating: false
        };
        this.pollingTimer = null;
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size } = this.state;
        try {
            const res = await BackupApi.list({ page, size });
            this.setState({
                backups: res.data?.items || res.items || [],
                total: res.data?.total || res.total || 0,
                loading: false
            });
        } catch (e) {
            Toast.error('加载备份列表失败');
            this.setState({ loading: false });
        }
    }

    async handleCreate(type) {
        this.setState({ creating: true });
        try {
            await BackupApi.create(type);
            Toast.success('备份任务已创建，正在后台执行...');

            // 立即刷新一次
            await this.loadData();

            // 启动轮询检查备份状态（每3秒检查一次，最多检查20次）
            this.startPolling();
        } catch (e) {
            Toast.error(e.message || '创建备份失败');
        } finally {
            this.setState({ creating: false });
        }
    }

    startPolling() {
        // 清除之前的轮询
        this.stopPolling();

        let pollCount = 0;
        const maxPolls = 20; // 最多轮询20次（1分钟）

        this.pollingTimer = setInterval(async () => {
            pollCount++;

            // 检查是否有正在执行的备份
            const hasRunning = this.state.backups.some(b =>
                b.status === 'pending' || b.status === 'running'
            );

            if (!hasRunning || pollCount >= maxPolls) {
                // 没有正在执行的备份或达到最大轮询次数，停止轮询
                this.stopPolling();
                return;
            }

            // 刷新数据
            await this.loadData();
        }, 3000);
    }

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    async handleRestore(backupId) {
        Modal.confirm('确认恢复', '⚠️ 警告：恢复操作将覆盖现有数据！确定要继续吗？', async () => {
            try {
                const res = await BackupApi.restore(backupId);
                Toast.success(res.message || '恢复成功');
                // 恢复后刷新页面以确保数据一致性
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } catch (e) {
                Toast.error(e.message || '恢复失败');
            }
        });
    }

    async handleDelete(backupId) {
        Modal.confirm('确认删除', '确定要删除这个备份吗？', async () => {
            try {
                await BackupApi.delete(backupId);
                Toast.success('备份已删除');
                this.loadData();
            } catch (e) {
                Toast.error(e.message || '删除失败');
            }
        });
    }

    handleDownload(backupId) {
        const token = localStorage.getItem(Config.storageKeys.token);
        window.open(`${BackupApi.download(backupId)}?token=${token}`, '_blank');
    }

    formatSize(bytes) {
        if (!bytes) return '-';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }

    getStatusTag(status, errorMessage) {
        const map = {
            'pending': '<span class="tag tag-warning">等待中</span>',
            'running': '<span class="tag tag-info">执行中</span>',
            'success': '<span class="tag tag-primary">已完成</span>',
            'failed': `<span class="tag tag-danger" title="${Utils.escapeHtml(errorMessage || '未知错误')}">失败</span>`
        };
        return map[status] || `<span class="tag">${status}</span>`;
    }

    getTypeLabel(type) {
        const map = {
            'full': '全量备份',
            'database': '数据库',
            'files': '文件'
        };
        return map[type] || type;
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    render() {
        const { backups, total, page, size, loading, creating } = this.state;
        const pages = Math.ceil(total / size) || 1;

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">数据备份</h1>
                    <p class="page-desc">创建和管理系统备份</p>
                </div>

                <div class="card" style="margin-bottom: var(--spacing-lg);">
                    <div class="card-header">
                        <h3 class="card-title">创建备份</h3>
                    </div>
                    <div class="card-body">
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            <button class="btn btn-secondary" data-create="full" ${creating ? 'disabled' : ''}>
                                💾 全量备份
                            </button>
                            <button class="btn btn-secondary" data-create="database" ${creating ? 'disabled' : ''}>
                                🗄️ 仅数据库
                            </button>
                            <button class="btn btn-secondary" data-create="files" ${creating ? 'disabled' : ''}>
                                📁 仅文件
                            </button>
                        </div>
                        <p style="margin-top: 12px; color: var(--text-secondary); font-size: 14px;">
                            💡 提示：全量备份包含数据库和所有上传的文件
                        </p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">备份历史</h3>
                        <button class="btn btn-ghost btn-sm" id="refreshBackups">🔄 刷新</button>
                    </div>
                    ${loading ? '<div class="loading"></div>' : backups.length === 0 ? `
                        <div class="empty-state" style="padding: 60px 0;">
                            <div class="empty-icon">💾</div>
                            <p class="empty-text">暂无备份记录</p>
                            <p style="color: var(--text-secondary);">点击上方按钮创建第一个备份</p>
                        </div>
                    ` : `
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>备份名称</th>
                                        <th style="width: 100px;">类型</th>
                                        <th style="width: 80px;">大小</th>
                                        <th style="width: 100px;">状态</th>
                                        <th style="width: 150px;">创建时间</th>
                                        <th style="width: 160px; text-align: center;">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${backups.map(b => `
                                        <tr>
                                            <td>
                                                <div>${Utils.escapeHtml(b.filename || b.name || `备份 #${b.id}`)}</div>
                                                ${b.error_message ? `<small style="color:var(--color-error);font-size:12px;" title="${Utils.escapeHtml(b.error_message)}">❌ ${Utils.escapeHtml(b.error_message.substring(0, 30))}${b.error_message.length > 30 ? '...' : ''}</small>` : ''}
                                            </td>
                                            <td><span class="tag">${this.getTypeLabel(b.backup_type)}</span></td>
                                            <td>${this.formatSize(b.file_size)}</td>
                                            <td>${this.getStatusTag(b.status, b.error_message)}</td>
                                            <td>${Utils.formatDate(b.created_at)}</td>
                                            <td>
                                                <div class="backup-actions">
                                                    ${b.status === 'success' ? `
                                                        <button class="btn btn-ghost btn-sm" data-download="${b.id}" title="下载备份">📥</button>
                                                        <button class="btn btn-ghost btn-sm" data-restore="${b.id}" title="恢复数据">🔄</button>
                                                    ` : `
                                                        <span class="btn-placeholder"></span>
                                                        <span class="btn-placeholder"></span>
                                                    `}
                                                    <button class="btn btn-ghost btn-sm btn-danger-hover" data-delete="${b.id}" title="删除备份">🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${Utils.renderPagination(page, pages)}
                    `}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    destroy() {
        // 组件销毁时停止轮询
        this.stopPolling();
        super.destroy();
    }

    bindEvents() {
        if (this.container && !this.container._bindedBackup) {
            this.container._bindedBackup = true;

            // 创建备份
            this.delegate('click', '[data-create]', (e, t) => {
                this.handleCreate(t.dataset.create);
            });

            // 刷新
            this.delegate('click', '#refreshBackups', () => {
                this.loadData();
            });

            // 下载
            this.delegate('click', '[data-download]', (e, t) => {
                this.handleDownload(t.dataset.download);
            });

            // 恢复
            this.delegate('click', '[data-restore]', (e, t) => {
                this.handleRestore(t.dataset.restore);
            });

            // 删除
            this.delegate('click', '[data-delete]', (e, t) => {
                this.handleDelete(t.dataset.delete);
            });

            // 分页
            this.delegate('click', '[data-page]', (e, t) => {
                const p = parseInt(t.dataset.page);
                if (p > 0) this.changePage(p);
            });
        }
    }
}



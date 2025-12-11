/**
 * 文件存储管理页面
 */

class StoragePage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin';
        this.state = {
            files: [],
            total: 0,
            page: 1,
            size: 20,
            loading: true,
            uploading: false,
            search: ''
        };
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size, search } = this.state;
        try {
            const res = await StorageApi.list({ page, size, search: search || undefined });
            this.setState({
                files: res.data?.items || res.items || [],
                total: res.data?.total || res.total || 0,
                loading: false
            });
        } catch (e) {
            Toast.error('加载文件列表失败');
            this.setState({ loading: false });
        }
    }

    async handleUpload(file) {
        if (!file) return;
        this.setState({ uploading: true });
        try {
            await StorageApi.upload(file);
            Toast.success('文件上传成功');
            this.loadData();
        } catch (e) {
            Toast.error(e.message || '文件上传失败');
        } finally {
            this.setState({ uploading: false });
        }
    }

    async handleDelete(fileId) {
        Modal.confirm('确认删除', '确定要删除这个文件吗？此操作不可恢复。', async () => {
            try {
                await StorageApi.delete(fileId);
                Toast.success('文件已删除');
                this.loadData();
            } catch (e) {
                Toast.error(e.message || '删除失败');
            }
        });
    }

    handleExport() {
        const token = Store.get('token');
        window.open(`/api/v1/export/files?token=${token}&format=xlsx`, '_blank');
    }

    handleDownload(fileId) {
        const token = localStorage.getItem(Config.storageKeys.token);
        window.open(`${StorageApi.download(fileId)}?token=${token}`, '_blank');
    }

    formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }

    getFileIcon(mimeType) {
        if (!mimeType) return '📄';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compressed')) return '📦';
        return '📄';
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    render() {
        const { files, total, page, size, loading, uploading, search } = this.state;
        const pages = Math.ceil(total / size) || 1;

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">文件存储</h1>
                    <p class="page-desc">上传、下载和管理文件</p>
                </div>
                
                <div class="card" style="margin-bottom: var(--spacing-lg);">
                    <div class="card-body">
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                            <input type="file" id="fileInput" style="display: none;">
                            <button class="btn btn-primary" id="uploadBtn" ${uploading ? 'disabled' : ''}>
                                ${uploading ? '上传中...' : '📤 上传文件'}
                            </button>
                            ${this.isAdmin ? `
                                <button class="btn btn-secondary" id="exportFilesBtn">
                                    📤 导出列表
                                </button>
                            ` : ''}
                            <div style="flex: 1; display: flex; gap: 8px;">
                                <input type="text" class="form-input" id="searchInput" 
                                       placeholder="搜索文件名..." value="${Utils.escapeHtml(search)}"
                                       style="max-width: 300px;">
                                <button class="btn btn-secondary" id="searchBtn">搜索</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    ${loading ? '<div class="loading"></div>' : files.length === 0 ? `
                        <div class="empty-state" style="padding: 60px 0;">
                            <div class="empty-icon">📁</div>
                            <p class="empty-text">暂无文件</p>
                            <p style="color: var(--text-secondary);">点击上方按钮上传第一个文件</p>
                        </div>
                    ` : `
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>文件名</th>
                                        <th style="width: 100px;">大小</th>
                                        <th style="width: 120px;">类型</th>
                                        <th style="width: 160px;">上传时间</th>
                                        <th style="width: 140px; text-align: center;">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${files.map(f => `
                                        <tr>
                                            <td>
                                                <span style="margin-right: 8px;">${this.getFileIcon(f.mime_type)}</span>
                                                ${Utils.escapeHtml(f.original_name || f.filename)}
                                            </td>
                                            <td>${this.formatSize(f.file_size)}</td>
                                            <td><span class="tag">${f.mime_type?.split('/')[1] || '未知'}</span></td>
                                            <td>${Utils.formatDate(f.created_at)}</td>
                                            <td style="text-align: center;">
                                                <button class="btn btn-ghost btn-sm" data-download="${f.id}" title="下载">📥</button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${f.id}" title="删除">🗑️</button>
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

    bindEvents() {
        if (this.container && !this.container._bindedStorage) {
            this.container._bindedStorage = true;

            // 上传按钮
            this.delegate('click', '#uploadBtn', () => {
                this.$('#fileInput')?.click();
            });

            // 导出按钮
            if (this.isAdmin) {
                this.delegate('click', '#exportFilesBtn', () => {
                    this.handleExport();
                });
            }

            // 文件选择
            this.delegate('change', '#fileInput', (e) => {
                const file = e.target.files[0];
                if (file) this.handleUpload(file);
                e.target.value = '';
            });

            // 搜索
            this.delegate('click', '#searchBtn', () => {
                this.state.search = (this.$('#searchInput')?.value || '').trim();
                this.state.page = 1;
                this.loadData();
            });

            // 下载
            this.delegate('click', '[data-download]', (e, t) => {
                this.handleDownload(t.dataset.download);
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



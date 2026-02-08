/**
 * NotebookLM水印清除页面脚本
 * 实现水印清除的前端展示和交互逻辑
 */

class LmCleanerPage extends Component {
    constructor(container) {
        super();
        this.container = container;
        this.state = {
            items: [],
            loading: false,
            processing: false,
            uploadingFile: null,
            page: 1,
            pageSize: 10,
            total: 0
        };
    }

    async mount() {
        window._lm_cleanerPage = this;
        this.updateView();
        await this.loadData();
    }

    destroy() {
        window._lm_cleanerPage = null;
    }

    updateView() {
        if (this.container) {
            this.container.innerHTML = this.render();
        }
    }

    async loadData() {
        this.state.loading = true;
        this.updateView();

        try {
            const response = await Api.get(`/lm_cleaner?page=${this.state.page}&page_size=${this.state.pageSize}`);
            if (response.code === 0) {
                this.state.items = response.data.items || [];
                // 兼容不同版本的后端响应格式
                this.state.total = response.data.pagination?.total || response.data.total || 0;
            }
        } catch (error) {
            Toast.error('历史记录加载失败');
        } finally {
            this.state.loading = false;
            this.updateView();
        }
    }



    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 校验格式
        const allowedExts = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExts.includes(ext)) {
            Toast.error('不支持的文件格式，仅支持 PDF 和图片');
            return;
        }

        this.state.processing = true;
        this.state.uploadingFile = file.name;
        this.updateView();

        try {
            const formData = new FormData();
            formData.append('file', file);

            // 使用原始 fetch 因为 Api 类可能对 FormData 支持不一
            const response = await fetch('/api/v1/lm_cleaner/clean', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${Store.get('token')}`
                },
                body: formData
            });

            const result = await response.json();
            if (result.code === 0) {
                Toast.success('文件处理成功！可在下方历史记录中查看或下载。');
                await this.loadData();
                // 自动打开预览
                this.previewImage(result.data.id, 'cleaned', file.name);
            } else {
                Toast.error(result.message || '处理失败');
            }
        } catch (error) {
            Toast.error('上传处理出错');
            console.error(error);
        } finally {
            this.state.processing = false;
            this.state.uploadingFile = null;
            this.updateView();
        }
    }

    downloadFile(id, type = 'cleaned') {
        window.open(`/api/v1/lm_cleaner/download/${id}?type=${type}&token=${Store.get('token')}`, '_blank');
    }

    async deleteRecord(id) {
        if (!confirm('确定要删除此处理记录吗？')) return;
        try {
            const res = await Api.delete(`/lm_cleaner/${id}`);
            if (res.code === 0) {
                Toast.success('删除成功');
                await this.loadData();
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    previewImage(id, type = 'cleaned', title = null) {
        if (!title) {
            const item = this.state.items.find(i => i.id == id);
            title = item ? item.title : '未知文件';
        }

        const url = `/api/v1/lm_cleaner/download/${id}?type=${type}&preview=true&token=${Store.get('token')}`;
        const isPdf = title.toLowerCase().endsWith('.pdf');
        const typeLabel = type === 'source' ? '原件' : '处理后';

        if (isPdf) {
            window.open(url, '_blank');
            return;
        }

        if (window.Modal) {
            window.Modal.show({
                title: `预览 (${typeLabel}): ${Utils.escapeHtml(title)}`,
                content: `
                    <div class="text-center p-md">
                        <img src="${url}" style="max-width: 100%; max-height: 70vh; border-radius: var(--radius-md); box-shadow: var(--shadow-lg);">
                        <div class="mt-md display-flex gap-sm justify-center">
                            <button class="btn btn-primary" onclick="window._lm_cleanerPage.downloadFile(${id}, 'cleaned')">下载处理后图片</button>
                            <button class="btn btn-outline-secondary" onclick="window._lm_cleanerPage.downloadFile(${id}, 'source')">下载原图</button>
                        </div>
                    </div>
                `,
                width: 900
            });
        } else {
            window.open(url, '_blank');
        }
    }

    render() {
        const { items, loading, processing, uploadingFile } = this.state;

        // 获取全局帮助按钮 HTML
        const helpButton = window.ModuleHelp
            ? window.ModuleHelp.createHelpButton('lm_cleaner', 'NotebookLM 水印清除')
            : '';

        return `
            <div class="lm_cleaner-page fade-in">
                <!-- 顶部紧凑栏：标题 + 迷你上传 -->
                <div class="lm-header-bar">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="lm-title">
                            <h1>NotebookLM 水印清除</h1>
                            <p>支持 PDF/图片 自动去水印</p>
                        </div>
                        ${helpButton}
                    </div>

                    <div class="upload-compact" id="drop-zone">
                        ${processing ? `
                            <div class="processing-mini">
                                <div class="spinner-mini"></div>
                                <span>处理中: ${uploadingFile || '...'}</span>
                            </div>
                        ` : `
                            <div class="upload-text">
                                <span class="icon"><i class="ri-sparkling-fill"></i></span>
                                <span>上传/拖拽文件</span>
                            </div>
                            <span class="upload-hint">支持 PDF, PNG, JPG, WEBP</span>
                            <input type="file" onchange="window._lm_cleanerPage.handleUpload(event)" accept=".pdf,image/*">
                        `}
                    </div>
                </div>

                <!-- 历史记录区域：占据剩余空间 -->
                <div class="history-section">
                    <div class="history-header">
                        <h2><span class="icon"><i class="ri-history-line"></i></span> 历史记录</h2>
                        <span class="text-secondary">${this.state.total || items.length} 条记录</span>
                    </div>

                    <div class="history-content" style="padding: 0; display: flex; flex-direction: column;">
                        ${loading ? '<div class="text-center p-xl">加载记录中...</div>' : `
                            ${items.length === 0 ? `
                                <div class="text-center p-xl text-secondary">
                                    <div style="font-size: 3rem; margin-bottom: 1rem;"><i class="ri-inbox-line"></i></div>
                                    暂无处理记录，请在右上角上传文件
                                </div>
                            ` : `
                                <div class="history-list-container">
                                    <!-- 固定表头 -->
                                    <div class="history-grid-row history-list-header">
                                        <div>文件名</div>
                                        <div>处理时间</div>
                                        <div style="text-align: right;">操作</div>
                                    </div>
                                    
                                    <!-- 滚动列表 -->
                                    <div class="history-list-body">
                                        ${items.map(item => `
                                            <div class="history-grid-row history-item">
                                                <div class="col-name" title="${Utils.escapeHtml(item.title)}">
                                                    <span class="file-icon">
                                                        ${item.title.toLowerCase().endsWith('.pdf') ? '<i class="ri-file-pdf-line"></i>' : '<i class="ri-image-line"></i>'}
                                                    </span>
                                                    <span>${Utils.escapeHtml(item.title)}</span>
                                                </div>
                                                <div class="col-date">
                                                    ${new Date(item.created_at).toLocaleString()}
                                                </div>
                                                <div class="col-actions">
                                                    <button class="btn btn-sm btn-primary" onclick="window._lm_cleanerPage.previewImage(${item.id}, 'cleaned')">
                                                        <i class="ri-eye-line"></i> 查看
                                                    </button>
                                                    <button class="btn btn-sm btn-success" onclick="window._lm_cleanerPage.downloadFile(${item.id})">
                                                        <i class="ri-download-line"></i> 下载
                                                    </button>
                                                    ${item.source_file ? `
                                                        <button class="btn btn-sm btn-outline-secondary" onclick="window._lm_cleanerPage.previewImage(${item.id}, 'source')" title="预览原始文件">
                                                            原件
                                                        </button>
                                                    ` : ''}
                                                    <button class="btn btn-sm btn-ghost btn-outline-danger" onclick="window._lm_cleanerPage.deleteRecord(${item.id})">
                                                        <i class="ri-delete-bin-line"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `}
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}


window.LmCleanerPage = LmCleanerPage;
window._lm_cleanerPage = null;

/**
 * PDF 工具主入口
 */
class PdfPage extends Component {
    constructor(container) {
        super();
        this.container = container;
        this.state = {
            activeTab: 'files', // 默认显示我的文档
            history: [],
            recentFiles: [], // 最近上传的文件
            allFiles: [],    // 全量文件列表
            selectedFiles: [], // 工具箱选中的文件
            loading: false,
            reader: {
                fileId: null,
                filename: '',
                currentPage: 0,
                totalPages: 0,
                zoom: 1.5,
                source: 'filemanager'
            }
        };
    }

    async mount() {
        window._pdfPage = this;

        // 根据初始标签加载数据
        if (this.state.activeTab === 'files') {
            this.loadAllFiles();
        } else {
            this.loadRecentFiles();
        }

        this.renderAll();

        const { query } = Router.current();
        if (query.fileId) {
            this.openReader(query.fileId, query.filename || '未知文档', query.source || 'filemanager');
        }
    }

    destroy() {
        window._pdfPage = null;
    }

    renderAll() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="pdf-app-container">
                <div class="pdf-sidebar">
                    <div class="pdf-upload-btn-container">
                        <button class="pdf-upload-btn" onclick="window._pdfPage.handleUpload()">
                            <i class="ri-upload-cloud-2-line"></i> 上传文件
                        </button>
                    </div>
                    <div class="pdf-nav-item ${this.state.activeTab === 'files' ? 'active' : ''}" onclick="window._pdfPage.switchTab('files')">
                        <i class="ri-folder-open-line"></i> <span>我的文档</span>
                    </div>
                    <div class="pdf-nav-item ${this.state.activeTab === 'toolbox' ? 'active' : ''}" onclick="window._pdfPage.switchTab('toolbox')">
                        <i class="ri-apps-2-line"></i> <span>工具箱</span>
                    </div>
                    <div class="pdf-nav-item ${this.state.activeTab === 'history' ? 'active' : ''}" onclick="window._pdfPage.switchTab('history')">
                        <i class="ri-history-line"></i> <span>历史记录</span>
                    </div>
                    <div class="pdf-sidebar-spacer" style="flex: 1"></div>
                    <div class="pdf-nav-item" onclick="ModuleHelp.show('pdf', 'PDF工具')">
                        <i class="ri-question-line"></i> <span>帮助</span>
                    </div>
                </div>
                <div class="pdf-main">
                    <div class="pdf-header">
                        <div class="pdf-title">${this.getTabTitle()}</div>
                        <div class="pdf-header-actions" id="pdf-header-actions"></div>
                    </div>
                    <div class="pdf-content-area" id="pdf-content-area">
                        ${this.renderContent()}
                    </div>
                </div>
            </div>
        `;
        this.afterRender();
    }

    getTabTitle() {
        switch (this.state.activeTab) {
            case 'toolbox': return 'PDF 工具箱';
            case 'reader': return this.state.reader.filename || 'PDF 阅读器';
            case 'files': return '我的 PDF 文档';
            case 'history': return '操作历史';
            default: return 'PDF 工具';
        }
    }

    switchTab(tab) {
        // 如果点击阅读器但没有打开任何文件，跳转到文档库
        if (tab === 'reader' && !this.state.reader.fileId && !this.state.reader.filePath) {
            Toast.info('请先选择一个文档进行阅读');
            tab = 'files';
        }
        this.state.activeTab = tab;
        this.renderAll();
        if (tab === 'history') this.loadHistory();
        if (tab === 'files') this.loadAllFiles();
    }

    renderContent() {
        if (this.state.loading) return '<div class="loading">正在加载...</div>';
        switch (this.state.activeTab) {
            case 'toolbox': return PdfToolbox.render(this.state.selectedFiles);
            case 'reader': return PdfReader.render(this.state);
            case 'files': return PdfDocuments.render(this.state.allFiles);
            case 'history': return PdfHistory.render(this.state.history);
            default: return '';
        }
    }

    afterRender() {
        const actionsContainer = document.getElementById('pdf-header-actions');
        if (!actionsContainer) return;
        if (this.state.activeTab === 'reader' && (this.state.reader.fileId || this.state.reader.filePath)) {
            actionsContainer.innerHTML = `
                <button class="btn btn-ghost btn-sm" onclick="window._pdfPage.switchTab('files')">
                    <i class="ri-arrow-left-line"></i> 退出阅读
                </button>
            `;
        } else {
            actionsContainer.innerHTML = '';
        }
    }

    async loadHistory() {
        try {
            const res = await Api.get('/pdf/history');
            if (res.code === 0) {
                this.state.history = res.data.items || [];
                this.renderAll();
            }
        } catch (e) {
            Toast.error('加载历史失败');
        }
    }

    async loadRecentFiles() {
        try {
            const res = await Api.get('/pdf/files');
            if (res.code === 0 && res.data) {
                this.state.recentFiles = (res.data.files || []).slice(0, 5);
                this.renderAll();
            }
        } catch (e) {
            console.error('加载文件列表失败', e);
        }
    }

    async loadAllFiles() {
        this.state.loading = true;
        this.renderAll();
        try {
            const res = await Api.get('/pdf/files');
            if (res.code === 0 && res.data) {
                this.state.allFiles = res.data.files || [];
            }
        } catch (e) {
            console.error('加载全量文件失败', e);
        } finally {
            this.state.loading = false;
            this.renderAll();
        }
    }

    async openReader(file, filename, source = 'filemanager') {
        const fileId = typeof file === 'object' ? file.id : file;
        const filePath = typeof file === 'object' ? file.path : null;
        const finalFilename = filename || (typeof file === 'object' ? file.name : 'Unknown');

        this.state.loading = true;
        this.state.activeTab = 'reader';
        this.renderAll();
        try {
            // 支持通过 ID 或 Path 获取元数据
            let url = `/pdf/metadata?source=${source}`;
            if (fileId) url += `&file_id=${fileId}`;
            if (filePath) url += `&path=${encodeURIComponent(filePath)}`;

            const res = await Api.get(url);
            if (res.code === 0) {
                this.state.reader = { fileId, filename: finalFilename, filePath, currentPage: 0, totalPages: res.data.page_count, zoom: 1.5, source };
            } else {
                throw new Error(res.message || '后端解析返回空错误');
            }
        } catch (e) {
            console.error('PDF解析详情:', e);
            Toast.error(`文档打开失败: ${e.message}`);
            this.state.activeTab = 'files';
        } finally {
            this.state.loading = false;
            this.renderAll();
        }
    }

    changePage(delta) {
        const next = this.state.reader.currentPage + delta;
        if (next >= 0 && next < this.state.reader.totalPages) {
            this.state.reader.currentPage = next;
            this.renderAll();
        }
    }

    changeZoom(delta) {
        const next = this.state.reader.zoom + delta;
        if (next >= 0.5 && next <= 5.0) {
            this.state.reader.zoom = next;
            this.renderAll();
        }
    }

    selectFileForReader() {
        PdfUtils.pickFile((file) => this.openReader(file, file.name, file.source || 'filemanager'));
    }

    // 更新工具箱选中的文件
    updateToolboxSelection() {
        PdfUtils.pickFile((files) => {
            if (!Array.isArray(files)) files = [files];
            this.state.selectedFiles = files;
            this.renderAll();
        }, { multiple: true });
    }

    // 从工具箱移除选中文件
    removeSelectedFile(id, path) {
        this.state.selectedFiles = this.state.selectedFiles.filter(f => (f.id !== id && f.path !== path));
        this.renderAll();
    }

    // 辅助方法：确保有文件可处理
    _ensureFiles(callback, multiple = false, options = {}) {
        if (this.state.selectedFiles.length > 0) {
            if (multiple) {
                if (multiple && this.state.selectedFiles.length < 2 && options.min === 2) {
                    PdfUtils.pickFile(callback, { multiple, ...options });
                    return;
                }
                callback(this.state.selectedFiles);
            } else {
                callback(this.state.selectedFiles[0]);
            }
        } else {
            PdfUtils.pickFile(callback, { multiple, ...options });
        }
    }

    // ================== 工具处理函数 ==================

    async handleSplit() {
        this._ensureFiles(async (file) => {
            const ranges = prompt('请输入页码范围 (如: 1, 3-5):');
            if (!ranges) return;
            Toast.info('正在处理...');
            try {
                const payload = { page_ranges: ranges, output_name: `split_${file.name}` };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/split', payload);
                if (res.code === 0) { Toast.success('处理成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('处理过程出错'); }
        });
    }

    async handleMerge() {
        this._ensureFiles(async (files) => {
            const outputName = prompt('请输入合并后的文件名:', 'merged_document.pdf');
            if (!outputName) return;

            Toast.info('正在合并...');
            try {
                const res = await Api.post('/pdf/merge', {
                    file_ids: files.filter(f => f.id).map(f => f.id),
                    paths: files.filter(f => !f.id).map(f => f.path),
                    output_name: outputName
                });
                if (res.code === 0) { Toast.success('合并成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('合并失败'); }
        }, true, { min: 2, extensions: ['.pdf'] });
    }

    async handleCompress() {
        this._ensureFiles(async (file) => {
            const level = prompt('请输入压缩等级 (0-4，默认为2，越大压缩率越高):', '2');
            if (level === null) return;

            Toast.info('正在压缩...');
            try {
                const payload = { level: parseInt(level) || 2, output_name: `compressed_${file.name}` };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/compress', payload);
                if (res.code === 0) { Toast.success('压缩成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('压缩失败'); }
        });
    }

    async handleWatermark() {
        PdfUtils.pickFile(async (file) => {
            const text = prompt('请输入水印文字:');
            if (!text) return;

            Toast.info('正在添加水印...');
            try {
                const res = await Api.post('/pdf/watermark', {
                    file_id: file.id,
                    text: text,
                    output_name: `watermark_${file.name}`
                });
                if (res.code === 0) { Toast.success('处理成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('处理过程出错'); }
        });
    }

    async handleImagesToPdf() {
        Toast.info('请选择图片文件');
        PdfUtils.pickFile(async (files) => {
            if (!Array.isArray(files)) files = [files];
            const outputName = prompt('请输入生成的 PDF 文件名:', 'images_merged.pdf');
            if (!outputName) return;

            Toast.info('正在转换...');
            try {
                const res = await Api.post('/pdf/images-to-pdf', {
                    file_ids: files.map(f => f.id),
                    output_name: outputName
                });
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换失败'); }
        }, { multiple: true, extensions: ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] });
    }

    async handlePdfToImages() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在转换...');
            try {
                const res = await Api.post('/pdf/pdf-to-images', { file_id: file.id });
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handleExtractText() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在提取文本...');
            try {
                const res = await Api.get(`/pdf/extract-text?file_id=${file.id}`);
                if (res.code === 0) {
                    Modal.show({ title: '提取结果', content: `<textarea class="form-control" style="height: 400px; font-family: monospace;">${res.data.text}</textarea>`, width: '80%' });
                } else Toast.error(res.message);
            } catch (e) { Toast.error('提取失败'); }
        });
    }

    // ==================== 新增功能处理函数 ====================

    async handlePdfToWord() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在转换为 Word...');
            try {
                const res = await Api.post('/pdf/pdf-to-word', { file_id: file.id });
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handlePdfToExcel() {
        PdfUtils.pickFile(async (file) => {
            const ranges = prompt('请输入页码范围（可选，留空则转换全部）:');
            Toast.info('正在提取表格...');
            try {
                const res = await Api.post('/pdf/pdf-to-excel', {
                    file_id: file.id,
                    page_ranges: ranges || null
                });
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handleRemoveWatermark() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在处理...');
            try {
                const res = await Api.post('/pdf/remove-watermark', { file_id: file.id });
                if (res.code === 0) { Toast.success('处理成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('处理过程出错'); }
        });
    }

    async handleEncrypt() {
        PdfUtils.pickFile(async (file) => {
            const password = prompt('请输入密码:');
            if (!password) return;

            Toast.info('正在加密...');
            try {
                const res = await Api.post('/pdf/encrypt', {
                    file_id: file.id,
                    password: password
                });
                if (res.code === 0) { Toast.success('加密成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('加密过程出错'); }
        });
    }

    async handleDecrypt() {
        PdfUtils.pickFile(async (file) => {
            const password = prompt('请输入当前密码:');
            if (!password) return;

            Toast.info('正在解密...');
            try {
                const res = await Api.post('/pdf/decrypt', {
                    file_id: file.id,
                    password: password
                });
                if (res.code === 0) { Toast.success('解密成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('解密过程出错'); }
        });
    }

    async handleRotate() {
        PdfUtils.pickFile(async (file) => {
            const angle = prompt('请输入旋转角度 (90, 180, 270):', '90');
            if (!angle) return;

            const ranges = prompt('请输入页码范围（留空则旋转全部）:');

            Toast.info('正在旋转...');
            try {
                const res = await Api.post('/pdf/rotate', {
                    file_id: file.id,
                    angle: parseInt(angle) || 90,
                    page_ranges: ranges || null
                });
                if (res.code === 0) { Toast.success('旋转成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('旋转过程出错'); }
        });
    }

    async handleExtractPages() {
        PdfUtils.pickFile(async (file) => {
            const ranges = prompt('请输入要提取的页码范围 (如: 1, 3-5, 8):');
            if (!ranges) return;

            Toast.info('正在提取...');
            try {
                const res = await Api.post('/pdf/extract-pages', {
                    file_id: file.id,
                    page_ranges: ranges
                });
                if (res.code === 0) { Toast.success('提取成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('提取过程出错'); }
        });
    }

    async handleDeletePages() {
        PdfUtils.pickFile(async (file) => {
            const ranges = prompt('请输入要删除的页码范围 (如: 1, 3-5):');
            if (!ranges) return;

            Toast.info('正在删除...');
            try {
                const res = await Api.post(`/pdf/delete-pages?file_id=${file.id}&page_ranges=${encodeURIComponent(ranges)}`);
                if (res.code === 0) { Toast.success('删除成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('删除过程出错'); }
        });
    }

    async handleReversePdf() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在反转...');
            try {
                const res = await Api.post(`/pdf/reverse?file_id=${file.id}`);
                if (res.code === 0) { Toast.success('反转成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('反转过程出错'); }
        });
    }

    async handleAddPageNumbers() {
        PdfUtils.pickFile(async (file) => {
            const position = prompt('请选择页码位置 (bottom-center, bottom-left, bottom-right, top-center, top-left, top-right):', 'bottom-center');
            if (!position) return;

            const format = prompt('请输入页码格式 ({n} 为当前页，{total} 为总页数):', '{n} / {total}');

            Toast.info('正在添加页码...');
            try {
                const res = await Api.post('/pdf/add-page-numbers', {
                    file_id: file.id,
                    position: position,
                    format: format || '{n}'
                });
                if (res.code === 0) { Toast.success('添加页码成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('添加页码出错'); }
        });
    }

    async handleSign() {
        Toast.info('请先选择 PDF 文件');
        PdfUtils.pickFile(async (pdfFile) => {
            Toast.info('请选择签名/印章图片');
            PdfUtils.pickFile(async (imageFile) => {
                const page = prompt('请输入签名页码:', '1');
                if (!page) return;

                const x = prompt('请输入 X 位置 (0-100%):', '70');
                const y = prompt('请输入 Y 位置 (0-100%):', '85');
                const width = prompt('请输入签名宽度 (0-100%):', '20');

                Toast.info('正在添加签名...');
                try {
                    const res = await Api.post('/pdf/sign', {
                        file_id: pdfFile.id,
                        image_file_id: imageFile.id,
                        page: parseInt(page) || 1,
                        x: parseFloat(x) || 70,
                        y: parseFloat(y) || 85,
                        width: parseFloat(width) || 20
                    });
                    if (res.code === 0) { Toast.success('添加签名成功'); this.switchTab('history'); }
                    else Toast.error(res.message);
                } catch (e) { Toast.error('添加签名出错'); }
            }, { extensions: ['.jpg', '.jpeg', '.png', '.webp'] });
        });
    }

    async downloadResult(filename) {
        if (!filename) return;
        Toast.info('正在下载...');

        try {
            // 使用 fetch 获取 blob
            const res = await fetch(`${Api.baseUrl}/pdf/download-result?filename=${encodeURIComponent(filename)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem(Config.storageKeys.token)}`
                }
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                Toast.error('下载失败');
            }
        } catch (e) {
            console.error(e);
            Toast.error('下载出错');
        }
    }

    // 下载 PDF 模块中的文件
    async downloadPdfFile(filePath) {
        if (!filePath) return;
        Toast.info('正在下载...');

        try {
            const filename = filePath.split('/').pop();
            const res = await fetch(`${Api.baseUrl}/pdf/download-result?filename=${encodeURIComponent(filename)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem(Config.storageKeys.token)}`
                }
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                Toast.error('下载失败');
            }
        } catch (e) {
            console.error(e);
            Toast.error('下载出错');
        }
    }

    handleUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';  // PDF 模块只接受 PDF 文件
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            Toast.info('正在上传...');
            const formData = new FormData();
            formData.append('file', file);

            try {
                // 使用 PDF 模块自己的上传接口（模块独立，不依赖文件管理）
                const res = await fetch(`${Api.baseUrl}/pdf/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem(Config.storageKeys.token)}`
                    },
                    body: formData
                });

                const data = await res.json();
                if (data.code === 0) {
                    Toast.success('上传成功');
                    if (this.state.activeTab === 'files') {
                        this.loadAllFiles();
                    } else {
                        this.loadRecentFiles();
                    }
                } else {
                    Toast.error(data.message || '上传失败');
                }
            } catch (err) {
                console.error(err);
                Toast.error('上传出错');
            }
        };
        input.click();
    }

    async handleDelete(filename, category) {
        const confirmed = await Modal.confirm('确认删除', `确定要删除 "${filename}" 吗？`);
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/pdf/files/${encodeURIComponent(filename)}?category=${category}`);
            if (res.code === 0) {
                Toast.success('删除成功');
                if (this.state.activeTab === 'files') {
                    this.loadAllFiles();
                } else {
                    this.loadRecentFiles();
                }
            } else {
                Toast.error(res.message);
            }
        } catch (e) {
            Toast.error('删除操作失败');
        }
    }
}
window._pdfPage = null;

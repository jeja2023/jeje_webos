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
                    <div class="pdf-help-btn-container">
                        ${ModuleHelp.createHelpButton('pdf', 'PDF工具')}
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
                // 检查加密状态 (只要是加密的，PyMuPDF 渲染通常需要密码，除非是 Owner Password 且有权限，但这里为了简单起见，统一拦截)
                if (res.data.is_encrypted) {
                    Toast.warning('该文档已加密，无法直接预览。请先使用 [解密 PDF] 工具移除密码。');
                    this.state.activeTab = 'files';
                    return;
                }

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

    // 工具处理函数

    async handleSplit() {
        this._ensureFiles(async (file) => {
            const ranges = await Modal.prompt('拆分 PDF', '请输入页码范围 (如: 1, 3-5):', '例如：1, 3-5', '1');
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
            const outputName = await Modal.prompt('合并 PDF', '请输入合并后的文件名:', '例如：merged.pdf', 'merged_document.pdf');
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
            const level = await Modal.prompt('压缩 PDF', '请输入压缩等级 (0-4，默认为2，越大压缩率越高):', '0-4', '2');
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
            const text = await Modal.prompt('添加水印', '请输入水印文字:', '例如：内部资料', '内部资料');
            if (!text) return;

            Toast.info('正在添加水印...');
            try {
                const payload = {
                    text: text,
                    output_name: `watermark_${file.name}`
                };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/watermark', payload);
                if (res.code === 0) { Toast.success('处理成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('处理过程出错'); }
        });
    }

    async handleImagesToPdf() {
        Toast.info('请选择图片文件');
        PdfUtils.pickFile(async (files) => {
            if (!Array.isArray(files)) files = [files];
            const outputName = await Modal.prompt('图片转 PDF', '请输入生成的 PDF 文件名:', '例如：images.pdf', 'images_merged.pdf');
            if (!outputName) return;

            Toast.info('正在转换...');
            try {
                const res = await Api.post('/pdf/images-to-pdf', {
                    file_ids: files.filter(f => f.id).map(f => f.id),
                    paths: files.filter(f => !f.id).map(f => f.path),
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
                const payload = {};
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/pdf-to-images', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handleImagesToPdf() {
        PdfUtils.pickFile(async (files) => {
            // 处理多选（如果此时返回的是数组）和单选兼容
            const fileList = Array.isArray(files) ? files : [files];
            if (fileList.length === 0) return;

            Toast.info(`正在合并 ${fileList.length} 张图片...`);
            try {
                const payload = {
                    file_ids: [],
                    paths: [],
                    // 自动生成输出文件名
                    output_name: `images_merged_${new Date().getTime()}.pdf`
                };

                fileList.forEach(file => {
                    if (file.id) payload.file_ids.push(file.id);
                    else payload.path = payload.path ? [...payload.paths, file.path] : [file.path]; // 注意这里原本逻辑可能有误，最好统一下
                });

                // 修正 payload 构建逻辑
                payload.paths = []; // 重置
                fileList.forEach(file => {
                    if (file.id) payload.file_ids.push(file.id);
                    else payload.paths.push(file.path);
                });

                const res = await Api.post('/pdf/images-to-pdf', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        }, {
            multiple: true,
            extensions: ['.jpg', '.jpeg', '.png', '.webp', '.bmp'],
            title: '选择图片文件 (可多选，按住 Ctrl/Shift 选择)'
        });
    }

    async handleExtractText() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在提取文本...');
            try {
                let url = '/pdf/extract-text?';
                if (file.id) url += `file_id=${file.id}`;
                else url += `path=${encodeURIComponent(file.path)}`;

                const res = await Api.get(url);
                if (res.code === 0) {
                    const safeText = (res.data.text || '')
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;");

                    // 挂载临时操作函数
                    window._tempExtractText = res.data.text || '';
                    window._tempExtractFn = {
                        saveToCloud: async () => {
                            const fileName = `${file.name.replace('.pdf', '')}_extracted`;

                            Toast.info('正在保存...');
                            try {
                                const payload = {
                                    text: window._tempExtractText,
                                    filename: fileName,
                                    file_id: file.id || null
                                };

                                const res = await Api.post('/pdf/save-text', payload);

                                if (res.code === 0) {
                                    Toast.success('已保存到我的文档 (成果)');
                                    Modal.closeAll();
                                    // 刷新列表以便看到新文件
                                    if (window._pdfPage) window._pdfPage.switchTab('files');
                                } else {
                                    Toast.error(res.message || '保存失败');
                                }
                            } catch (e) {
                                console.error(e);
                                Toast.error('保存请求出错');
                            }
                        }
                    };

                    Modal.show({
                        title: '提取结果',
                        content: `
                            <textarea id="pdf-extract-result" class="form-control" style="height: 400px; font-family: monospace; margin-bottom: 15px;">${safeText}</textarea>
                            <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                                <button class="btn btn-text" onclick="Modal.closeAll()">关闭</button>
                                <button class="btn btn-primary" onclick="window._tempExtractFn.saveToCloud()"><i class="ri-save-line"></i> 保存到我的文档</button>
                            </div>
                        `,
                        width: '80%',
                        footer: false
                    });
                } else Toast.error(res.message);
            } catch (e) { console.error(e); Toast.error('提取失败'); }
        });
    }

    async handleWordToPdf() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在将 Word 转换为 PDF...');
            try {
                const payload = {};
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/word-to-pdf', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        }, { extensions: ['.docx', '.doc'], title: '请选择 Word 文档' });
    }

    async handleExcelToPdf() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在将 Excel 转换为 PDF...');
            try {
                const payload = {};
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/excel-to-pdf', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        }, { extensions: ['.xlsx', '.xls', '.csv'], title: '请选择 Excel 文档' });
    }

    // 新增功能处理函数

    async handlePdfToWord() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在转换为 Word...');
            try {
                const payload = {};
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/pdf-to-word', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handlePdfToExcel() {
        PdfUtils.pickFile(async (file) => {
            const ranges = await Modal.prompt('PDF 转 Excel', '请输入页码范围（可选，留空则转换全部）:', '例如：1, 3-5', '');
            Toast.info('正在提取表格...');
            try {
                const payload = { page_ranges: ranges || null };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/pdf-to-excel', payload);
                if (res.code === 0) { Toast.success('转换成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('转换过程出错'); }
        });
    }

    async handleRemoveWatermark() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在处理...');
            try {
                const payload = {};
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/remove-watermark', payload);
                if (res.code === 0) { Toast.success('处理成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('处理过程出错'); }
        });
    }

    async handleEncrypt() {
        PdfUtils.pickFile(async (file) => {
            const password = await Modal.prompt('加密 PDF', '请输入密码:', '密码', '');
            if (!password) return;

            Toast.info('正在加密...');
            try {
                const payload = { password: password };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/encrypt', payload);
                if (res.code === 0) { Toast.success('加密成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('加密过程出错'); }
        });
    }

    async handleDecrypt() {
        PdfUtils.pickFile(async (file) => {
            const password = await Modal.prompt('解密 PDF', '请输入当前密码:', '密码', '');
            if (!password) return;

            Toast.info('正在解密...');
            try {
                const payload = { password: password };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/decrypt', payload);
                if (res.code === 0) { Toast.success('解密成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('解密过程出错'); }
        });
    }

    async handleRotate() {
        PdfUtils.pickFile(async (file) => {
            Modal.form({
                title: '旋转页面',
                fields: [
                    {
                        name: 'angle', label: '旋转角度', type: 'select', value: '90',
                        options: [
                            { value: '90', text: '顺时针 90°' },
                            { value: '180', text: '180°' },
                            { value: '270', text: '逆时针 90°' }
                        ]
                    },
                    { name: 'ranges', label: '页码范围 (可选)', placeholder: '例如: 1, 3-5 (留空则旋转全部)', type: 'text' }
                ],
                onSubmit: async (data) => {
                    Toast.info('正在旋转...');
                    try {
                        const payload = {
                            angle: parseInt(data.angle) || 90,
                            page_ranges: data.ranges || null
                        };
                        if (file.id) payload.file_id = file.id;
                        else payload.path = file.path;

                        const res = await Api.post('/pdf/rotate', payload);
                        if (res.code === 0) { Toast.success('旋转成功'); this.switchTab('history'); }
                        else Toast.error(res.message);
                    } catch (e) { Toast.error('旋转过程出错'); }
                }
            });
        });
    }

    async handleExtractPages() {
        PdfUtils.pickFile(async (file) => {
            const ranges = await Modal.prompt('提取页面', '请输入要提取的页码范围 (如: 1, 3-5, 8):', '例如：1, 3-5', '');
            if (!ranges) return;

            Toast.info('正在提取...');
            try {
                const payload = { page_ranges: ranges };
                if (file.id) payload.file_id = file.id;
                else payload.path = file.path;

                const res = await Api.post('/pdf/extract-pages', payload);
                if (res.code === 0) { Toast.success('提取成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('提取过程出错'); }
        });
    }

    async handleDeletePages() {
        PdfUtils.pickFile(async (file) => {
            const ranges = await Modal.prompt('删除页面', '请输入要删除的页码范围 (如: 1, 3-5):', '例如：2', '');
            if (!ranges) return;

            Toast.info('正在删除...');
            try {
                let url = '/pdf/delete-pages?';
                if (file.id) url += `file_id=${file.id}`;
                else url += `path=${encodeURIComponent(file.path)}`;
                url += `&page_ranges=${encodeURIComponent(ranges)}`;

                const res = await Api.post(url);
                if (res.code === 0) { Toast.success('删除成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('删除过程出错'); }
        });
    }

    async handleReversePdf() {
        PdfUtils.pickFile(async (file) => {
            Toast.info('正在反转...');
            try {
                let url = '/pdf/reverse?';
                if (file.id) url += `file_id=${file.id}`;
                else url += `path=${encodeURIComponent(file.path)}`;

                const res = await Api.post(url);
                if (res.code === 0) { Toast.success('反转成功'); this.switchTab('history'); }
                else Toast.error(res.message);
            } catch (e) { Toast.error('反转过程出错'); }
        });
    }

    async handleAddPageNumbers() {
        PdfUtils.pickFile(async (file) => {
            Modal.form({
                title: '添加页码',
                fields: [
                    {
                        name: 'position', label: '页码位置', type: 'select', value: 'bottom-center',
                        options: [
                            { value: 'bottom-center', text: '底部居中' },
                            { value: 'bottom-left', text: '底部左侧' },
                            { value: 'bottom-right', text: '底部右侧' },
                            { value: 'top-center', text: '顶部居中' },
                            { value: 'top-left', text: '顶部左侧' },
                            { value: 'top-right', text: '顶部右侧' }
                        ]
                    },
                    { name: 'format', label: '页码格式', placeholder: '{n} 为当前页，{total} 为总页数', value: '{n} / {total}' }
                ],
                onSubmit: async (data) => {
                    Toast.info('正在添加页码...');
                    try {
                        const payload = {
                            position: data.position,
                            format: data.format || '{n}'
                        };
                        if (file.id) payload.file_id = file.id;
                        else payload.path = file.path;

                        const res = await Api.post('/pdf/add-page-numbers', payload);
                        if (res.code === 0) { Toast.success('添加页码成功'); this.switchTab('history'); }
                        else Toast.error(res.message);
                    } catch (e) { Toast.error('添加页码出错'); }
                }
            });
        });
    }

    async handleSign() {
        // 第一步：选择 PDF
        PdfUtils.pickFile(async (pdfFile) => {
            Toast.success(`已选择目标文件: ${pdfFile.name}`);

            // 稍作延迟，让用户意识到第一步完成了
            setTimeout(() => {
                // 第二步：选择图片
                PdfUtils.pickFile(async (imageFile) => {
                    Modal.form({
                        title: '设置签名位置',
                        fields: [
                            { name: 'page', label: '页码', type: 'number', value: '1', required: true },
                            { name: 'x', label: '横坐标 (X%)', type: 'number', value: '70', placeholder: '0-100', required: true },
                            { name: 'y', label: '纵坐标 (Y%)', type: 'number', value: '85', placeholder: '0-100', required: true },
                            { name: 'width', label: '宽度 (%)', type: 'number', value: '20', placeholder: '0-100', required: true }
                        ],
                        onSubmit: async (data) => {
                            Toast.info('正在添加签名...');
                            try {
                                const payload = {
                                    page: parseInt(data.page) || 1,
                                    x: parseFloat(data.x) || 70,
                                    y: parseFloat(data.y) || 85,
                                    width: parseFloat(data.width) || 20
                                };
                                if (pdfFile.id) payload.file_id = pdfFile.id;
                                else payload.path = pdfFile.path;

                                if (imageFile.id) payload.image_file_id = imageFile.id;
                                else payload.image_path = imageFile.path;

                                const res = await Api.post('/pdf/sign', payload);
                                if (res.code === 0) { Toast.success('添加签名成功'); this.switchTab('history'); }
                                else Toast.error(res.message);
                            } catch (e) { Toast.error('添加签名出错'); }
                        }
                    });
                }, {
                    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
                    title: '第二步：选择签名/印章图片'
                });
            }, 500);

        }, { title: '第一步：选择目标 PDF 文件' });
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
    async downloadPdfFile(fileArg) {
        if (!fileArg) return;
        Toast.info('正在下载...');

        try {
            // 兼容文件名或路径：统一分隔符并提取文件名
            const filename = fileArg.replace(/\\/g, '/').split('/').pop();
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
        input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.doc,.docx,.xls,.xlsx,.csv';  // 支持 PDF、图片及 Office 文档
        input.multiple = true; // 支持多选

        input.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            Toast.info(`准备上传 ${files.length} 个文件...`);
            let successCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch(`${Api.baseUrl}/pdf/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem(Config.storageKeys.token)}`
                        },
                        body: formData
                    });

                    const data = await res.json();
                    if (data.code === 0) {
                        successCount++;
                    } else {
                        Toast.error(`文件 ${file.name} 上传失败: ${data.message}`);
                    }
                } catch (err) {
                    console.error(err);
                    Toast.error(`文件 ${file.name} 上传出错`);
                }
            }

            if (successCount > 0) {
                Toast.success(`成功上传 ${successCount} 个文件`);
                // 刷新列表 (无论当前在哪个 tab)
                if (this.state.activeTab === 'files') {
                    this.loadAllFiles();
                } else {
                    this.loadRecentFiles(); // 刷新最近文件
                    // 如果在 history 或 toolbox，可能不需要刷新，但为了保险起见
                }
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

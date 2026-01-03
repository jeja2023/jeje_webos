/**
 * 图文识别页面组件
 * 基于 PaddleOCR 的离线文字识别
 */

class OCRPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            status: null,
            loading: false,
            result: null,
            dragActive: false,
            previewImage: null,
            language: 'ch',
            detectDirection: false,
            historyCollapsed: true
        };
    }

    async loadData() {
        try {
            const res = await Api.get('/ocr/status');
            this.setState({ status: res.data });
        } catch (e) {
            Toast.error('获取 OCR 状态失败');
        }
    }

    render() {
        const { status, loading, result, dragActive, previewImage, language, detectDirection, historyCollapsed } = this.state;

        return `
            <div class="ocr-page">
                <!-- 头部区域 -->
                <div class="ocr-header">
                    <div class="ocr-header-left">
                        <h1 class="ocr-title">
                            <i class="ri-scan-2-line"></i>
                            图文识别
                        </h1>
                        <span class="ocr-subtitle">离线 OCR · 支持中英文混合识别</span>
                    </div>
                    <div class="ocr-header-right">
                        <div class="ocr-status ${status?.available ? 'online' : 'offline'}">
                            <span class="status-dot"></span>
                            <span class="status-text">${status?.available ? '服务就绪' : '服务未安装'}</span>
                        </div>
                    </div>
                </div>

                <!-- 主体区域 -->
                <div class="ocr-main">
                    <!-- 左侧：上传区域 -->
                    <div class="ocr-upload-section">
                        <div class="ocr-upload-card">
                            <div class="ocr-upload-zone ${dragActive ? 'drag-active' : ''}" id="ocr-drop-zone">
                                ${previewImage ? `
                                    <div class="ocr-preview">
                                        <img src="${previewImage}" alt="预览" class="ocr-preview-image" />
                                        <button class="ocr-clear-btn" id="ocr-clear-btn">
                                            <i class="ri-close-line"></i>
                                        </button>
                                    </div>
                                ` : `
                                    <div class="ocr-upload-placeholder">
                                        <i class="ri-image-add-line"></i>
                                        <p class="upload-main-text">拖拽图片到此处</p>
                                        <p class="upload-sub-text">或点击选择文件</p>
                                        <div class="upload-formats">支持 JPG、PNG、BMP、WEBP</div>
                                    </div>
                                `}
                                <input type="file" id="ocr-file-input" accept="image/*" hidden />
                            </div>

                            <!-- 识别选项 -->
                            <div class="ocr-options">
                                <div class="ocr-option-group">
                                    <label class="ocr-option-label">识别语言</label>
                                    <select id="ocr-language" class="ocr-select">
                                        <option value="ch" ${language === 'ch' ? 'selected' : ''}>中英文混合</option>
                                        <option value="en" ${language === 'en' ? 'selected' : ''}>纯英文</option>
                                        <option value="japan" ${language === 'japan' ? 'selected' : ''}>日文</option>
                                        <option value="korean" ${language === 'korean' ? 'selected' : ''}>韩文</option>
                                    </select>
                                </div>
                                <div class="ocr-option-group">
                                    <label class="ocr-checkbox-label">
                                        <input type="checkbox" id="ocr-detect-direction" ${detectDirection ? 'checked' : ''} />
                                        <span class="checkbox-custom"></span>
                                        检测文字方向
                                    </label>
                                </div>
                            </div>

                            <!-- 识别按钮 -->
                            <button class="ocr-recognize-btn ${loading ? 'loading' : ''}" 
                                    id="ocr-recognize-btn" 
                                    ${!previewImage || loading ? 'disabled' : ''}>
                                ${loading ? `
                                    <span class="btn-spinner"></span>
                                    <span>正在识别...</span>
                                ` : `
                                    <i class="ri-scan-line"></i>
                                    <span>开始识别</span>
                                `}
                            </button>
                        </div>
                    </div>

                    <!-- 右侧：识别结果 -->
                    <div class="ocr-result-section">
                        <div class="ocr-result-card ${result ? 'has-result' : ''}">
                            ${result ? this.renderResult(result) : `
                                <div class="ocr-result-empty">
                                    <i class="ri-file-text-line"></i>
                                    <p>识别结果将显示在这里</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderResult(result) {
        const { text, confidence, processing_time, boxes, filename } = result;
        const charCount = text.length;
        const lineCount = text.split('\n').filter(l => l.trim()).length;

        return `
            <div class="ocr-result-header">
                <div class="result-title">
                    <i class="ri-file-text-line"></i>
                    <span>识别结果</span>
                </div>
                <div class="result-actions">
                    <button class="result-action-btn" id="ocr-copy-btn" title="复制文字">
                        <i class="ri-file-copy-line"></i>
                    </button>
                    <button class="result-action-btn" id="ocr-download-btn" title="下载为文本">
                        <i class="ri-download-line"></i>
                    </button>
                </div>
            </div>

            <div class="ocr-result-stats">
                <div class="stat-item">
                    <span class="stat-value">${charCount}</span>
                    <span class="stat-label">字符</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${lineCount}</span>
                    <span class="stat-label">行数</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${(confidence * 100).toFixed(1)}%</span>
                    <span class="stat-label">置信度</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${processing_time}s</span>
                    <span class="stat-label">耗时</span>
                </div>
            </div>

            <div class="ocr-result-content">
                <pre class="result-text" id="ocr-result-text">${this.escapeHtml(text) || '(未识别到文字)'}</pre>
            </div>

            ${boxes && boxes.length > 0 ? `
                <div class="ocr-result-details">
                    <button class="details-toggle" id="ocr-details-toggle">
                        <i class="ri-list-check"></i>
                        <span>查看详细检测结果 (${boxes.length} 个文本块)</span>
                        <i class="ri-arrow-down-s-line toggle-icon"></i>
                    </button>
                    <div class="details-list" id="ocr-details-list" style="display: none;">
                        ${boxes.map((box, idx) => `
                            <div class="detail-item">
                                <span class="detail-index">${idx + 1}</span>
                                <span class="detail-text">${this.escapeHtml(box.text)}</span>
                                <span class="detail-confidence">${(box.confidence * 100).toFixed(1)}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents() {
        const dropZone = this.container.querySelector('#ocr-drop-zone');
        const fileInput = this.container.querySelector('#ocr-file-input');
        const recognizeBtn = this.container.querySelector('#ocr-recognize-btn');

        // 点击上传区域触发文件选择
        dropZone?.addEventListener('click', (e) => {
            if (!e.target.closest('#ocr-clear-btn')) {
                fileInput?.click();
            }
        });

        // 文件选择
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFile(file);
        });

        // 拖拽事件
        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.setState({ dragActive: true });
        });

        dropZone?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.setState({ dragActive: false });
        });

        dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.setState({ dragActive: false });
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleFile(file);
            } else {
                Toast.error('请上传图片文件');
            }
        });

        // 清除按钮
        this.delegate('click', '#ocr-clear-btn', (e) => {
            e.stopPropagation();
            this.setState({ previewImage: null, result: null });
        });

        // 语言选择
        this.delegate('change', '#ocr-language', (e) => {
            this.setState({ language: e.target.value });
        });

        // 方向检测
        this.delegate('change', '#ocr-detect-direction', (e) => {
            this.setState({ detectDirection: e.target.checked });
        });

        // 识别按钮
        recognizeBtn?.addEventListener('click', () => this.handleRecognize());

        // 复制按钮
        this.delegate('click', '#ocr-copy-btn', () => this.handleCopy());

        // 下载按钮
        this.delegate('click', '#ocr-download-btn', () => this.handleDownload());

        // 详情展开
        this.delegate('click', '#ocr-details-toggle', () => {
            const list = this.container.querySelector('#ocr-details-list');
            const icon = this.container.querySelector('.toggle-icon');
            if (list) {
                const isHidden = list.style.display === 'none';
                list.style.display = isHidden ? 'block' : 'none';
                icon?.classList.toggle('rotated', isHidden);
            }
        });
    }

    handleFile(file) {
        // 验证文件大小
        if (file.size > 10 * 1024 * 1024) {
            Toast.error('文件大小不能超过 10MB');
            return;
        }

        // 读取并预览
        const reader = new FileReader();
        reader.onload = (e) => {
            this.setState({
                previewImage: e.target.result,
                result: null
            });
            this._currentFile = file;
        };
        reader.readAsDataURL(file);
    }

    async handleRecognize() {
        if (!this._currentFile) {
            Toast.error('请先选择图片');
            return;
        }

        const { language, detectDirection } = this.state;

        this.setState({ loading: true });

        try {
            const formData = new FormData();
            formData.append('file', this._currentFile);
            formData.append('language', language);
            formData.append('detect_direction', detectDirection);

            const res = await Api.upload('/ocr/recognize', formData);

            if (res.code === 200) {
                this.setState({ result: res.data, loading: false });
                Toast.success('识别完成');
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            this.setState({ loading: false });
            Toast.error(e.message || '识别失败');
        }
    }

    handleCopy() {
        const { result } = this.state;
        if (!result?.text) {
            Toast.warning('没有可复制的内容');
            return;
        }

        navigator.clipboard.writeText(result.text).then(() => {
            Toast.success('已复制到剪贴板');
        }).catch(() => {
            Toast.error('复制失败');
        });
    }

    handleDownload() {
        const { result } = this.state;
        if (!result?.text) {
            Toast.warning('没有可下载的内容');
            return;
        }

        const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ocr_result_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('已下载');
    }

    async afterMount() {
        await this.loadData();
    }
}

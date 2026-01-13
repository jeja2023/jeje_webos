/**
 * 图文识别页面组件
 * 基于 RapidOCR 的离线文字识别
 * 支持识别框可视化、历史记录、PDF 进度等功能
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
            showBoxes: false,            // 是否显示识别框
            history: [],                 // 识别历史记录
            showHistory: false,          // 是否显示历史面板
            pdfProgress: null            // PDF 识别进度 {current, total}
        };
        this._historyKey = 'ocr_history';
        this._maxHistory = 10;
    }

    async loadData() {
        try {
            const res = await Api.get('/ocr/status');
            // 加载历史记录
            const history = this.loadHistory();
            this.setState({ status: res.data, history });
        } catch (e) {
            Toast.error('获取 OCR 状态失败');
        }
    }

    // 历史记录管理
    loadHistory() {
        try {
            const data = localStorage.getItem(this._historyKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    saveHistory(item) {
        let history = this.loadHistory();
        // 添加到开头，限制数量
        history.unshift({
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            text: item.text?.substring(0, 100) + (item.text?.length > 100 ? '...' : ''),
            charCount: item.text?.length || 0,
            confidence: item.confidence,
            language: this.state.language
        });
        if (history.length > this._maxHistory) {
            history = history.slice(0, this._maxHistory);
        }
        localStorage.setItem(this._historyKey, JSON.stringify(history));
        this.setState({ history });
    }

    clearHistory() {
        localStorage.removeItem(this._historyKey);
        this.setState({ history: [] });
        Toast.success('历史记录已清空');
    }

    render() {
        const { status, loading, result, dragActive, previewImage, language, detectDirection, showBoxes, history, showHistory, pdfProgress } = this.state;

        return `
            <div class="ocr-page">
                <!-- 头部区域 -->
                <div class="ocr-header">
                    <div class="ocr-header-left">
                        <h1 class="ocr-title">
                            <i class="ri-scan-2-line"></i>
                            图文识别
                        </h1>
                        <span class="ocr-subtitle">离线 OCR · 支持图像与 PDF 识别</span>
                    </div>
                    <div class="ocr-header-right">
                        <button class="ocr-history-btn ${showHistory ? 'active' : ''}" id="ocr-toggle-history" title="识别历史">
                            <i class="ri-history-line"></i>
                            <span>历史</span>
                            ${history.length > 0 ? `<span class="history-badge">${history.length}</span>` : ''}
                        </button>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('ocr', '图文识别') : ''}
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
                                ${previewImage ? this.renderPreview() : `
                                    <div class="ocr-upload-placeholder">
                                        <i class="ri-image-add-line"></i>
                                        <p class="upload-main-text">拖拽图片或 PDF 到此处</p>
                                        <p class="upload-sub-text">或点击选择文件</p>
                                        <div class="upload-formats">支持 JPG, PNG, WEBP, PDF</div>
                                    </div>
                                `}
                                <input type="file" id="ocr-file-input" accept="image/*,.pdf" hidden />
                            </div>

                            <!-- 识别选项 -->
                            <div class="ocr-options">
                                <div class="ocr-option-group">
                                    <label class="ocr-option-label">识别语言</label>
                                    <select id="ocr-language" class="ocr-select">
                                        <option value="ch" ${language === 'ch' ? 'selected' : ''}>简体中文</option>
                                        <option value="mixed" ${language === 'mixed' ? 'selected' : ''}>中英混合</option>
                                        <option value="en" ${language === 'en' ? 'selected' : ''}>纯英文</option>
                                    </select>
                                </div>
                                <div class="ocr-option-group">
                                    <label class="ocr-checkbox-label">
                                        <input type="checkbox" id="ocr-show-boxes" ${showBoxes ? 'checked' : ''} />
                                        <span class="checkbox-custom"></span>
                                        显示识别框
                                    </label>
                                </div>
                            </div>

                            <!-- 识别按钮组 -->
                            <div class="ocr-btn-group">
                                <button class="ocr-recognize-btn ${loading ? 'loading' : ''}" 
                                        id="ocr-recognize-btn" 
                                        ${!previewImage || (loading) ? 'disabled' : ''}>
                                    ${loading ? `
                                        <span class="btn-spinner"></span>
                                        <span>${pdfProgress ? `识别中 ${pdfProgress.current}/${pdfProgress.total} 页` : '正在识别...'}</span>
                                    ` : `
                                        <i class="ri-scan-line"></i>
                                        <span>开始识别</span>
                                    `}
                                </button>
                                ${loading ? `
                                    <button class="ocr-stop-btn" id="ocr-stop-btn" title="终止识别">
                                        <i class="ri-stop-circle-line"></i>
                                        <span>停止</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：识别结果 -->
                    <div class="ocr-result-section">
                        ${showHistory ? this.renderHistoryPanel() : `
                            <div class="ocr-result-card ${result ? 'has-result' : ''}">
                                ${result ? this.renderResult(result) : `
                                    <div class="ocr-result-empty">
                                        <i class="ri-file-text-line"></i>
                                        <p>识别结果将显示在这里</p>
                                    </div>
                                `}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    renderPreview() {
        const { previewImage, result, showBoxes } = this.state;
        const isPdf = previewImage.startsWith('data:application/pdf');

        if (isPdf) {
            return `
                <div class="ocr-preview pdf-preview">
                    <i class="ri-file-pdf-2-line"></i>
                    <span class="pdf-name">${this._currentFile?.name || 'PDF 文档'}</span>
                    <button class="ocr-clear-btn" id="ocr-clear-btn">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
            `;
        }

        return `
            <div class="ocr-preview ${showBoxes && result?.boxes ? 'with-boxes' : ''}">
                <div class="ocr-preview-wrapper" id="ocr-preview-wrapper">
                    <img src="${previewImage}" alt="预览" class="ocr-preview-image" id="ocr-preview-img" />
                    ${showBoxes && result?.boxes ? this.renderBoxOverlay(result.boxes) : ''}
                </div>
                <button class="ocr-clear-btn" id="ocr-clear-btn">
                    <i class="ri-close-line"></i>
                </button>
            </div>
        `;
    }

    renderBoxOverlay(boxes) {
        if (!boxes || boxes.length === 0) return '';
        return `
            <svg class="ocr-box-overlay" id="ocr-box-overlay">
                ${boxes.map((box, idx) => {
            if (!box.box || box.box.length < 4) return '';
            const points = box.box.map(p => p.join(',')).join(' ');
            return `
                        <polygon 
                            points="${points}" 
                            class="ocr-box" 
                            data-index="${idx}"
                            data-text="${this.escapeHtml(box.text)}"
                        />
                    `;
        }).join('')}
            </svg>
        `;
    }

    renderHistoryPanel() {
        const { history } = this.state;
        return `
            <div class="ocr-history-panel">
                <div class="history-header">
                    <div class="history-title">
                        <i class="ri-history-line"></i>
                        <span>识别历史</span>
                    </div>
                    <button class="history-clear-btn" id="ocr-clear-history" ${history.length === 0 ? 'disabled' : ''}>
                        <i class="ri-delete-bin-line"></i>
                        清空
                    </button>
                </div>
                <div class="history-list">
                    ${history.length === 0 ? `
                        <div class="history-empty">
                            <i class="ri-inbox-line"></i>
                            <p>暂无识别记录</p>
                        </div>
                    ` : history.map(item => `
                        <div class="history-item" data-id="${item.id}">
                            <div class="history-item-header">
                                <span class="history-time">${item.timestamp}</span>
                                <span class="history-lang">${this.getLangName(item.language)}</span>
                            </div>
                            <div class="history-item-text">${this.escapeHtml(item.text)}</div>
                            <div class="history-item-stats">
                                <span>${item.charCount} 字符</span>
                                <span>${(item.confidence * 100).toFixed(1)}% 置信度</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getLangName(code) {
        const map = { ch: '中文', mixed: '中英混合', en: '英文', es: '西班牙语' };
        return map[code] || code;
    }

    renderResult(result) {
        const { text, confidence, processing_time, boxes, pages } = result;
        const charCount = text?.length || 0;
        const lineCount = text?.split('\n').filter(l => l.trim()).length || 0;

        return `
            <div class="ocr-result-header">
                <div class="result-title">
                    <i class="ri-file-text-line"></i>
                    <span>识别结果</span>
                    ${pages ? `<span class="result-pages">(${pages} 页)</span>` : ''}
                </div>
                <div class="result-actions">
                    <button class="result-action-btn" id="ocr-clear-result-btn" title="清空结果">
                        <i class="ri-delete-bin-line"></i>
                    </button>
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
                            <div class="detail-item" data-index="${idx}">
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
        if (this.container._eventsBound) return;

        // 文件输入框点击阻止冒泡
        this.delegate('click', '#ocr-file-input', (e) => {
            e.stopPropagation();
        });

        // 点击上传区域触发文件选择
        this.delegate('click', '#ocr-drop-zone', (e) => {
            if (e.target.closest('#ocr-clear-btn') || e.target.id === 'ocr-file-input') return;
            this.container.querySelector('#ocr-file-input')?.click();
        });

        // 文件选择
        this.container.addEventListener('change', (e) => {
            if (e.target.id === 'ocr-file-input') {
                const file = e.target.files[0];
                if (file) {
                    this.handleFile(file);
                    e.target.value = '';
                }
            }
        });

        // 拖拽事件
        this.delegate('dragover', '#ocr-drop-zone', (e) => {
            e.preventDefault();
            if (!this.state.dragActive) this.setState({ dragActive: true });
        });

        this.delegate('dragleave', '#ocr-drop-zone', (e) => {
            e.preventDefault();
            this.setState({ dragActive: false });
        });

        this.delegate('drop', '#ocr-drop-zone', (e) => {
            e.preventDefault();
            this.setState({ dragActive: false });
            const file = e.dataTransfer.files[0];
            if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
                this.handleFile(file);
            } else {
                Toast.error('请上传图片或 PDF 文件');
            }
        });

        // 清除按钮
        this.delegate('click', '#ocr-clear-btn', (e) => {
            e.stopPropagation();
            this.setState({ previewImage: null, result: null });
            this._currentFile = null;
        });

        // 清空结果按钮
        this.delegate('click', '#ocr-clear-result-btn', () => {
            this.setState({ result: null });
        });

        // 语言选择
        this.delegate('change', '#ocr-language', (e) => {
            this.setState({ language: e.target.value });
        });

        // 显示识别框
        this.delegate('change', '#ocr-show-boxes', (e) => {
            this.setState({ showBoxes: e.target.checked });
        });

        // 识别按钮
        this.delegate('click', '#ocr-recognize-btn', () => {
            if (!this.state.loading && this.state.previewImage) {
                this.handleRecognize();
            }
        });

        // 停止按钮
        this.delegate('click', '#ocr-stop-btn', () => {
            this.handleStop();
        });

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

        // 历史记录切换
        this.delegate('click', '#ocr-toggle-history', () => {
            this.setState({ showHistory: !this.state.showHistory });
        });

        // 清空历史
        this.delegate('click', '#ocr-clear-history', () => {
            this.clearHistory();
        });

        // 键盘粘贴图片支持
        if (!this._handlePaste) {
            this._handlePaste = (e) => {
                if (!this.container || !document.body.contains(this.container)) return;
                if (this.container.offsetWidth === 0 && this.container.offsetHeight === 0) return;

                const items = e.clipboardData?.items;
                if (!items) return;

                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (file) {
                            this.handleFile(file);
                            Toast.info('已粘贴图片');
                        }
                        break;
                    }
                }
            };
            document.addEventListener('paste', this._handlePaste);
        }

        this.container._eventsBound = true;
    }

    handleFile(file) {
        if (file.size > 20 * 1024 * 1024) {
            Toast.error('文件大小不能超过 20MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.setState({
                previewImage: e.target.result,
                result: null,
                showHistory: false
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

        const { language } = this.state;
        this.setState({ loading: true, pdfProgress: null });

        // 创建用于取消请求的控制器
        this._abortController = new AbortController();

        try {
            const formData = new FormData();
            formData.append('file', this._currentFile);
            formData.append('language', language);
            formData.append('detect_direction', this.state.detectDirection);

            const res = await Api.upload('/ocr/recognize', formData, 'file', {
                signal: this._abortController.signal
            });

            if (res.code === 200) {
                this.setState({ result: res.data, loading: false, pdfProgress: null });
                this._abortController = null;
                // 保存到历史记录
                this.saveHistory(res.data);
                Toast.success('识别完成');
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                return; // 已被 handleStop 处理
            }
            this.setState({ loading: false, pdfProgress: null });
            this._abortController = null;
            Toast.error(e.message || '识别失败');
        }
    }

    handleStop() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
            this.setState({ loading: false, pdfProgress: null });
            Toast.info('识别已停止');
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
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
        // 更新识别框尺寸
        this.updateBoxOverlay();
    }

    updateBoxOverlay() {
        const img = this.container.querySelector('#ocr-preview-img');
        const svg = this.container.querySelector('#ocr-box-overlay');
        if (img && svg) {
            svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
        }
    }

    beforeUnmount() {
        if (this._handlePaste) {
            document.removeEventListener('paste', this._handlePaste);
            this._handlePaste = null;
        }
    }
}

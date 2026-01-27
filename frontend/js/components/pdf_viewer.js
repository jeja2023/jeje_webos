/**
 * PDF 预览器 (独立版)
 * 用于文件管理器等模块中预览 PDF 文件
 * 使用后端渲染 API 将 PDF 页面转为图片展示
 */
const PdfViewer = {
    // 当前状态
    _state: {
        fileId: null,
        filePath: null,
        filename: '',
        currentPage: 0,
        totalPages: 0,
        zoom: 1.5,
        source: 'filemanager'  // filemanager | pdf
    },

    /**
     * 打开 PDF 预览弹窗
     * @param {Object} options - { fileId, filePath, filename, source }
     */
    async open(options) {
        const { fileId, filePath, filename = 'PDF 文档', source = 'filemanager' } = options;

        if (!fileId && !filePath) {
            Toast.error('未提供文件信息');
            return;
        }

        // 重置状态
        this._state = {
            fileId,
            filePath,
            filename,
            currentPage: 0,
            totalPages: 0,
            zoom: 1.5,
            source
        };

        try {
            Toast.info('正在加载文档...');

            // 获取 PDF 元数据
            let metaUrl = `/pdf/metadata?source=${source}`;
            if (fileId) metaUrl += `&file_id=${fileId}`;
            if (filePath) metaUrl += `&path=${encodeURIComponent(filePath)}`;

            const res = await Api.get(metaUrl);

            if (res.code === 0) {
                // 检查加密状态
                if (res.data.is_encrypted) {
                    Toast.warning('该文档已加密，无法直接预览');
                    return;
                }

                this._state.totalPages = res.data.page_count || 1;
                this._showModal();
            } else {
                throw new Error(res.message || '获取文档信息失败');
            }
        } catch (e) {
            console.error('PDF 预览失败:', e);
            Toast.error('文档预览失败: ' + e.message);
        }
    },

    /**
     * 显示预览弹窗
     */
    _showModal() {
        const content = this._renderContent();

        Modal.show({
            title: `📕 ${this._state.filename}`,
            content: content,
            width: '95%',
            footer: false,
            onClose: () => {
                this._state = { fileId: null, filePath: null, filename: '', currentPage: 0, totalPages: 0, zoom: 1.5, source: 'filemanager' };
            }
        });
    },

    /**
     * 渲染预览内容
     */
    _renderContent() {
        const { fileId, filePath, currentPage, totalPages, zoom, source } = this._state;
        const token = localStorage.getItem(Config.storageKeys.token);

        let renderUrl = `${Api.baseUrl}/pdf/render?page=${currentPage}&zoom=${zoom}&source=${source}&token=${token}`;
        if (fileId) renderUrl += `&file_id=${fileId}`;
        if (filePath) renderUrl += `&path=${encodeURIComponent(filePath)}`;

        return `
            <div class="pdf-viewer-standalone">
                <div class="pdf-viewer-page-wrapper">
                    <img src="${renderUrl}" 
                         class="pdf-viewer-page-image" 
                         id="pdf-standalone-img"
                         onload="this.style.opacity=1"
                         onerror="this.src=''; this.alt='加载失败'"
                         style="opacity: 0; transition: opacity 0.3s">
                </div>
                
                <div class="pdf-viewer-toolbar">
                    <button class="btn btn-icon" onclick="PdfViewer.changePage(-1)" ${currentPage <= 0 ? 'disabled' : ''} title="上一页">
                        <i class="ri-arrow-left-s-line"></i>
                    </button>
                    <span class="pdf-viewer-page-info">第 ${currentPage + 1} / ${totalPages} 页</span>
                    <button class="btn btn-icon" onclick="PdfViewer.changePage(1)" ${currentPage >= totalPages - 1 ? 'disabled' : ''} title="下一页">
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                    <div class="pdf-viewer-divider"></div>
                    <button class="btn btn-icon" onclick="PdfViewer.changeZoom(0.25)" title="放大">
                        <i class="ri-zoom-in-line"></i>
                    </button>
                    <span class="pdf-viewer-zoom-info">${Math.round(zoom * 100)}%</span>
                    <button class="btn btn-icon" onclick="PdfViewer.changeZoom(-0.25)" title="缩小">
                        <i class="ri-zoom-out-line"></i>
                    </button>
                    <div class="pdf-viewer-divider"></div>
                    <button class="btn btn-icon" onclick="Modal.closeAll()" title="关闭">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * 切换页面
     */
    changePage(delta) {
        const next = this._state.currentPage + delta;
        if (next >= 0 && next < this._state.totalPages) {
            this._state.currentPage = next;
            this._refreshPage();
        }
    },

    /**
     * 调整缩放
     */
    changeZoom(delta) {
        const next = this._state.zoom + delta;
        if (next >= 0.5 && next <= 5.0) {
            this._state.zoom = next;
            this._refreshPage();
        }
    },

    /**
     * 刷新页面显示
     */
    _refreshPage() {
        const container = document.querySelector('.pdf-viewer-standalone');
        if (container) {
            container.innerHTML = this._renderContent().replace('<div class="pdf-viewer-standalone">', '').replace('</div>\n        ', '');
            // 重新获取容器并更新
            const wrapper = document.querySelector('.pdf-viewer-standalone');
            if (wrapper) {
                wrapper.innerHTML = this._renderContent().match(/<div class="pdf-viewer-standalone">([\s\S]*)<\/div>\s*$/)[1];
            }
        }

        // 更简单的方式：直接更新图片和控件
        const { fileId, filePath, currentPage, totalPages, zoom, source } = this._state;
        const token = localStorage.getItem(Config.storageKeys.token);

        let renderUrl = `${Api.baseUrl}/pdf/render?page=${currentPage}&zoom=${zoom}&source=${source}&token=${token}`;
        if (fileId) renderUrl += `&file_id=${fileId}`;
        if (filePath) renderUrl += `&path=${encodeURIComponent(filePath)}`;

        const img = document.getElementById('pdf-standalone-img');
        if (img) {
            img.style.opacity = '0';
            img.src = renderUrl;
        }

        const pageInfo = document.querySelector('.pdf-viewer-page-info');
        if (pageInfo) pageInfo.textContent = `第 ${currentPage + 1} / ${totalPages} 页`;

        const zoomInfo = document.querySelector('.pdf-viewer-zoom-info');
        if (zoomInfo) zoomInfo.textContent = `${Math.round(zoom * 100)}%`;

        // 更新按钮状态
        const prevBtn = document.querySelector('.pdf-viewer-toolbar button:first-child');
        const nextBtn = document.querySelectorAll('.pdf-viewer-toolbar button')[1];
        if (prevBtn) prevBtn.disabled = currentPage <= 0;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
    }
};

// 挂载到全局
window.PdfViewer = PdfViewer;

/**
 * PDF 阅读器组件
 */
const PdfReader = {
    render(state) {
        if (!state.reader.fileId && !state.reader.filePath) {
            return `
                <div class="empty-state">
                    <div class="empty-icon"><i class="ri-file-pdf-line"></i></div>
                    <p>尚未选择文件</p>
                    <button class="btn btn-primary" onclick="window._pdfPage.switchTab('files')">前往文档库</button>
                </div>
            `;
        }

        const { fileId, filePath, currentPage, totalPages, zoom, source } = state.reader;
        const token = localStorage.getItem(Config.storageKeys.token);
        let renderUrl = `${Api.baseUrl}/pdf/render?page=${currentPage}&zoom=${zoom}&source=${source}&token=${token}`;
        if (fileId) renderUrl += `&file_id=${fileId}`;
        if (filePath) renderUrl += `&path=${encodeURIComponent(filePath)}`;

        return `
            <div class="pdf-viewer-container">
                <div class="pdf-page-wrapper">
                    <img src="${renderUrl}" 
                         class="pdf-page-image" 
                         id="pdf-page-img"
                         onload="this.style.opacity=1"
                         style="opacity: 0; transition: opacity 0.3s">
                </div>
                
                <div class="pdf-viewer-controls">
                    <button class="btn btn-icon" onclick="window._pdfPage.changePage(-1)" ${currentPage <= 0 ? 'disabled' : ''}>
                        <i class="ri-arrow-left-s-line"></i>
                    </button>
                    <span class="pdf-page-indicator">第 ${currentPage + 1} / ${totalPages} 页</span>
                    <button class="btn btn-icon" onclick="window._pdfPage.changePage(1)" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                    <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.2)"></div>
                    <button class="btn btn-icon" onclick="window._pdfPage.changeZoom(0.25)" title="放大">
                        <i class="ri-zoom-in-line"></i>
                    </button>
                    <span class="zoom-text">${Math.round(zoom * 100)}%</span>
                    <button class="btn btn-icon" onclick="window._pdfPage.changeZoom(-0.25)" title="缩小">
                        <i class="ri-zoom-out-line"></i>
                    </button>
                </div>
            </div>
        `;
    }
};

/**
 * PDF 历史记录组件
 */
const PdfHistory = {
    render(history) {
        if (!history || history.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon"><i class="ri-history-line"></i></div>
                    <p>暂无操作历史记录</p>
                </div>
            `;
        }

        return `
            <div class="pdf-history-list">
                ${history.map(item => `
                    <div class="pdf-history-item fade-in">
                        <div class="pdf-history-info">
                            <span class="pdf-history-name">
                                <i class="${this.getOpIcon(item.operation)}"></i> ${item.title}
                            </span>
                            <span class="pdf-history-meta">
                                <i class="ri-time-line"></i> ${new Date(item.created_at).toLocaleString()}
                            </span>
                        </div>
                        <div class="pdf-history-actions">
                            ${item.filename ? `
                                <button class="btn btn-sm btn-primary" onclick="window._pdfPage.downloadResult('${item.filename}')">
                                    <i class="ri-download-2-line"></i> 下载
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    getOpIcon(op) {
        switch (op) {
            case 'merge': return 'ri-merge-cells-horizontal';
            case 'split': return 'ri-split-cells-horizontal';
            case 'compress': return 'ri-file-zip-line';
            case 'watermark': return 'ri-copyright-line';
            case 'img2pdf': return 'ri-file-pdf-fill';
            case 'pdf2img': return 'ri-image-2-line';
            case 'read': return 'ri-book-read-line';
            default: return 'ri-file-pdf-line';
        }
    }
};

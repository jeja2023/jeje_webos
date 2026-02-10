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
                                <i class="${Utils.escapeHtml(this.getOpIcon(item.operation))}"></i> ${Utils.escapeHtml(item.title)}
                            </span>
                            <span class="pdf-history-meta">
                                <i class="ri-time-line"></i> ${Utils.escapeHtml(new Date(item.created_at).toLocaleString())}
                            </span>
                        </div>
                        <div class="pdf-history-actions">
                            ${item.filename ? `
                                <button class="btn btn-sm btn-primary" data-action="download-result" data-filename="${encodeURIComponent(item.filename)}">
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
            case 'remove_watermark': return 'ri-eraser-line';
            case 'img2pdf': return 'ri-file-pdf-fill';
            case 'pdf2img': return 'ri-image-2-line';
            case 'pdf2word': return 'ri-file-word-line';
            case 'pdf2excel': return 'ri-file-excel-line';
            case 'rotate': return 'ri-rotate-lock-line';
            case 'encrypt': return 'ri-lock-password-line';
            case 'decrypt': return 'ri-lock-unlock-line';
            case 'sign': return 'ri-quill-pen-line';
            case 'extract_text': return 'ri-text';
            case 'word2pdf': return 'ri-file-word-2-line';
            case 'excel2pdf': return 'ri-file-excel-2-line';
            case 'extract_pages': return 'ri-scissors-cut-line';
            case 'delete_pages': return 'ri-delete-bin-line';
            case 'reverse': return 'ri-arrow-left-right-line';
            case 'page_numbers': return 'ri-sort-number-asc';
            default: return 'ri-file-pdf-line';
        }
    }
};

/**
 * PDF 模块 - 文档库组件
 */
const PdfDocuments = {
    render(files) {
        if (!files || files.length === 0) {
            return `
                <div class="pdf-empty-state">
                    <i class="ri-file-pdf-line"></i>
                    <p>暂无文档，请先上传</p>
                    <button class="btn btn-primary" data-action="upload">
                        <i class="ri-upload-line"></i> 立即上传
                    </button>
                </div>
            `;
        }

        const groups = {
            uploads: files.filter(f => f.category === 'uploads'),
            outputs: files.filter(f => f.category === 'outputs')
        };

        return `
            <div class="pdf-docs-container">
                <div class="pdf-docs-section">
                    <div class="pdf-section-header">
                        <h3><i class="ri-upload-cloud-line"></i> 我的上传</h3>
                        <span class="count">${groups.uploads.length}</span>
                    </div>
                    <div class="pdf-grid">
                        ${groups.uploads.map(f => this.renderFileItem(f)).join('')}
                    </div>
                </div>
                
                ${groups.outputs.length > 0 ? `
                <div class="pdf-docs-section">
                    <div class="pdf-section-header">
                        <h3><i class="ri-magic-line"></i> 处理成果</h3>
                        <span class="count">${groups.outputs.length}</span>
                    </div>
                    <div class="pdf-grid">
                        ${groups.outputs.map(f => this.renderFileItem(f)).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    },

    renderFileItem(file) {
        const sizeStr = Utils.formatBytes(file.size);
        const timeStr = Utils.formatDate(file.updated_at);
        const ext = file.name.split('.').pop().toLowerCase();

        let iconClass = 'ri-file-pdf-fill';
        let cardAction = 'open-pdf';

        if (['doc', 'docx'].includes(ext)) {
            iconClass = 'ri-file-word-2-fill style="color: #2b579a;"';
            cardAction = 'tip-word';
        } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
            iconClass = 'ri-file-excel-2-fill style="color: #217346;"';
            cardAction = 'tip-excel';
        } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
            iconClass = 'ri-image-2-fill style="color: #bfa15f;"';
            cardAction = 'tip-image';
        }

        return `
            <div class="pdf-item-card" data-card-action="${cardAction}" 
                 data-file-name="${encodeURIComponent(file.name)}" 
                 data-file-path="${encodeURIComponent(file.path || '')}"
                 data-file-category="${Utils.escapeHtml(file.category || '')}">
                <div class="pdf-item-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="pdf-item-info">
                    <div class="pdf-item-name" title="${Utils.escapeHtml(file.name)}">${Utils.escapeHtml(file.name)}</div>
                    <div class="pdf-item-meta">
                        <span>${sizeStr}</span>
                        <span class="dot">·</span>
                        <span>${timeStr}</span>
                    </div>
                </div>
                <div class="pdf-item-actions">
                    <button class="action-btn" title="下载" data-action="download-pdf" data-file-name="${encodeURIComponent(file.name)}">
                        <i class="ri-download-line"></i>
                    </button>
                    <button class="action-btn danger" title="删除" data-action="delete-pdf" data-file-name="${encodeURIComponent(file.name)}" data-file-category="${Utils.escapeHtml(file.category || '')}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `;
    }
};

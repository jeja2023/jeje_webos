/**
 * PDF 工具箱组件
 */
const PdfToolbox = {
    render(selectedFiles = []) {
        const renderSelectedCard = (file) => {
            const sizeStr = Utils.formatBytes(file.size || file.file_size || 0);
            return `
                <div class="pdf-bench-card">
                    <div class="pdf-bench-icon"><i class="ri-file-pdf-line"></i></div>
                    <div class="pdf-bench-info">
                        <div class="pdf-bench-name" title="${Utils.escapeHtml(file.name)}">${Utils.escapeHtml(file.name)}</div>
                        <div class="pdf-bench-meta">${sizeStr}</div>
                    </div>
                    <button class="pdf-bench-remove" data-action="remove-file" data-file-id="${Utils.escapeHtml(String(file.id || ''))}" data-file-path="${encodeURIComponent(file.path || '')}" title="移除">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
            `;
        };

        const benchContent = selectedFiles.length > 0
            ? `
                <div class="pdf-bench-container">
                    <div class="pdf-section-header">
                        <h3><i class="ri-briefcase-line"></i> 任务工作台</h3>
                        <div class="pdf-section-actions">
                            <span class="count">${selectedFiles.length} 个文件</span>
                            <button class="btn btn-text btn-sm" data-action="reselect">重选</button>
                        </div>
                    </div>
                    <div class="pdf-bench-content">
                        <div class="pdf-bench-list">
                            ${selectedFiles.map(f => renderSelectedCard(f)).join('')}
                        </div>
                    </div>
                </div>
            `
            : `
                <div class="pdf-bench-compact" data-action="reselect">
                    <div class="pdf-bench-compact-info">
                        <i class="ri-cursor-line"></i>
                        <span>尚未选择待处理文件，请先选择文件或直接点击下方工具</span>
                    </div>
                    <button class="btn btn-primary btn-sm">
                        <i class="ri-add-line"></i> 选择文件
                    </button>
                </div>
            `;

        return `
            <div class="pdf-toolbox">
                ${benchContent}

                <div class="pdf-tool-group-title">常用工具</div>
                <div class="pdf-tool-grid">
                    <div class="pdf-tool-card" data-action="handleMerge">
                        <div class="pdf-tool-icon"><i class="ri-merge-cells-horizontal"></i></div>
                        <div class="pdf-tool-title">合并 PDF</div>
                        <div class="pdf-tool-desc">将多个文件合并为一个</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleSplit">
                        <div class="pdf-tool-icon"><i class="ri-split-cells-horizontal"></i></div>
                        <div class="pdf-tool-title">拆分 PDF</div>
                        <div class="pdf-tool-desc">提取页面另存为新文件</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleCompress">
                        <div class="pdf-tool-icon"><i class="ri-file-zip-line"></i></div>
                        <div class="pdf-tool-title">压缩 PDF</div>
                        <div class="pdf-tool-desc">减小文件体积</div>
                    </div>
                </div>

                <div class="pdf-tool-group-title">页面编辑</div>
                <div class="pdf-tool-grid">
                    <div class="pdf-tool-card" data-action="handleRotate">
                        <div class="pdf-tool-icon"><i class="ri-rotate-lock-line"></i></div>
                        <div class="pdf-tool-title">旋转页面</div>
                        <div class="pdf-tool-desc">顺时针/逆时针旋转</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleExtractPages">
                        <div class="pdf-tool-icon"><i class="ri-scissors-cut-line"></i></div>
                        <div class="pdf-tool-title">提取页面</div>
                        <div class="pdf-tool-desc">提取指定页面</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleDeletePages">
                        <div class="pdf-tool-icon"><i class="ri-delete-bin-line"></i></div>
                        <div class="pdf-tool-title">删除页面</div>
                        <div class="pdf-tool-desc">删除不需要的页面</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleReversePdf">
                        <div class="pdf-tool-icon"><i class="ri-arrow-left-right-line"></i></div>
                        <div class="pdf-tool-title">反转页面</div>
                        <div class="pdf-tool-desc">倒序排列所有页面</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleAddPageNumbers">
                        <div class="pdf-tool-icon"><i class="ri-sort-number-asc"></i></div>
                        <div class="pdf-tool-title">添加页码</div>
                        <div class="pdf-tool-desc">自动添加页码</div>
                    </div>
                </div>

                <div class="pdf-tool-group-title">水印与安全</div>
                <div class="pdf-tool-grid">
                    <div class="pdf-tool-card" data-action="handleWatermark">
                        <div class="pdf-tool-icon"><i class="ri-copyright-line"></i></div>
                        <div class="pdf-tool-title">添加水印</div>
                        <div class="pdf-tool-desc">添加文字水印保护文档</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleRemoveWatermark">
                        <div class="pdf-tool-icon"><i class="ri-eraser-line"></i></div>
                        <div class="pdf-tool-title">去除水印</div>
                        <div class="pdf-tool-desc">尝试移除水印</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleEncrypt">
                        <div class="pdf-tool-icon"><i class="ri-lock-password-line"></i></div>
                        <div class="pdf-tool-title">加密 PDF</div>
                        <div class="pdf-tool-desc">添加密码保护</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleDecrypt">
                        <div class="pdf-tool-icon"><i class="ri-lock-unlock-line"></i></div>
                        <div class="pdf-tool-title">解密 PDF</div>
                        <div class="pdf-tool-desc">移除密码保护</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleSign">
                        <div class="pdf-tool-icon"><i class="ri-quill-pen-line"></i></div>
                        <div class="pdf-tool-title">添加签名</div>
                        <div class="pdf-tool-desc">添加签名或印章</div>
                    </div>
                </div>

                <div class="pdf-tool-group-title">格式转换</div>
                <div class="pdf-tool-grid">
                    <div class="pdf-tool-card" data-action="handlePdfToWord">
                        <div class="pdf-tool-icon"><i class="ri-file-word-line"></i></div>
                        <div class="pdf-tool-title">PDF 转 Word</div>
                        <div class="pdf-tool-desc">转换为可编辑文档</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handlePdfToExcel">
                        <div class="pdf-tool-icon"><i class="ri-file-excel-line"></i></div>
                        <div class="pdf-tool-title">PDF 转 Excel</div>
                        <div class="pdf-tool-desc">提取表格数据</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handlePdfToImages">
                        <div class="pdf-tool-icon"><i class="ri-image-2-line"></i></div>
                        <div class="pdf-tool-title">PDF 转图片</div>
                        <div class="pdf-tool-desc">将页面转换为图片包</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleImagesToPdf">
                        <div class="pdf-tool-icon"><i class="ri-file-pdf-fill"></i></div>
                        <div class="pdf-tool-title">图片转 PDF</div>
                        <div class="pdf-tool-desc">将多张图片合成 PDF</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleWordToPdf">
                        <div class="pdf-tool-icon"><i class="ri-file-word-2-line"></i></div>
                        <div class="pdf-tool-title">Word 转 PDF</div>
                        <div class="pdf-tool-desc">文档转 PDF</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleExcelToPdf">
                        <div class="pdf-tool-icon"><i class="ri-file-excel-2-line"></i></div>
                        <div class="pdf-tool-title">Excel 转 PDF</div>
                        <div class="pdf-tool-desc">表格转 PDF</div>
                    </div>
                    <div class="pdf-tool-card" data-action="handleExtractText">
                        <div class="pdf-tool-icon"><i class="ri-text"></i></div>
                        <div class="pdf-tool-title">提取文本</div>
                        <div class="pdf-tool-desc">提取纯文本内容</div>
                    </div>
                </div>
            </div>
        `;
    }
};

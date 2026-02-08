/**
 * PDF 模块通用工具类
 */
const PdfUtils = {
    _pickedCallback: null,
    _selectedFiles: [], // 用于多选

    /**
     * 选择文件
     * @param {Function} callback 回调函数 (file or files)
     * @param {Object} options { multiple: boolean, extensions: string[] }
     */
    async pickFile(callback, options = {}) {
        const { multiple = false, extensions = ['.pdf'] } = options;
        this._selectedFiles = [];

        try {
            // 优先从 PDF 模块的所有文件获取（包括原始文件和处理结果）
            let files = [];
            const pdfRes = await Api.get('/pdf/files');
            if (pdfRes.code === 0 && pdfRes.data && pdfRes.data.files) {
                files = pdfRes.data.files;
            }

            // 筛选扩展名
            if (extensions && extensions.length > 0) {
                files = files.filter(f => extensions.some(ext => f.name.toLowerCase().endsWith(ext.toLowerCase())));
            }

            // 如果 PDF 模块没有文件，回退到文件管理器
            if (files.length === 0) {
                const fmRes = await Api.get('/filemanager/browse');
                if (fmRes.code === 0 && fmRes.data && fmRes.data.files) {
                    let fmFiles = fmRes.data.files;
                    if (extensions && extensions.length > 0) {
                        fmFiles = fmFiles.filter(f => extensions.some(ext => f.name.toLowerCase().endsWith(ext.toLowerCase())));
                    }
                    // 转换数据格式
                    files = fmFiles.map(f => ({
                        id: f.id || null,  // 虚拟文件可能 id 为 null
                        name: f.name,
                        size: f.file_size || 0,
                        path: f.storage_path,
                        source: 'filemanager',
                        category: 'filemanager'
                    }));
                }
            } else {
                // 标记为 PDF 模块的文件，并保留原始 category (uploads/outputs)
                files = files.map(f => ({ ...f, source: 'pdf' }));
            }

            // 即使没有文件也显示弹窗，提供上传入口
            const listHtml = files.length > 0 ? files.map((f, idx) => {
                const fileSize = f.size || 0;
                const sizeStr = fileSize > 1024 * 1024
                    ? (fileSize / 1024 / 1024).toFixed(2) + ' MB'
                    : (fileSize / 1024).toFixed(0) + ' KB';
                const fileIdAttr = f.id || '';
                const fileIcon = this._getFileIcon(f.name);

                // 区分文件来源标记
                let badge = '';
                if (f.category === 'outputs') badge = '<span style="background:var(--success-bg); color:var(--success-text); font-size:10px; padding:1px 4px; border-radius:3px; margin-left:5px;">成果</span>';

                return `
                <div class="pdf-file-item" 
                     data-file='${JSON.stringify(f).replace(/'/g, "&apos;")}'
                     onclick="PdfUtils._toggleSelection('${Utils.escapeHtml(fileIdAttr)}', this, ${multiple})">
                    <input type="checkbox" class="pdf-file-checkbox" style="display: ${multiple ? 'block' : 'none'};" ${this._isSelected(fileIdAttr) ? 'checked' : ''}>
                    <div class="pdf-file-info">
                        <span class="pdf-file-name" title="${Utils.escapeHtml(f.name)}"><i class="${fileIcon}"></i> ${Utils.escapeHtml(f.name)}${badge}</span>
                    </div>
                    <span class="pdf-file-size">${sizeStr}</span>
                </div>
            `}).join('') : `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">暂无符合条件的文件<br>请点击下方按钮上传</div>`;

            // 统一的底部栏，包含上传按钮
            const footerHtml = `
                <div style="margin-top: 15px; display:flex; align-items:center; justify-content:space-between; border-top: 1px solid var(--border-color); padding-top: 10px;">
                <button class="btn btn-outline btn-sm" onclick="window._pdfPage.handleUpload(); Modal.closeAll();"><i class="ri-upload-2-line"></i> 上传新文件</button>
                    ${multiple ? `
                    <div style="display:flex; align-items:center;">
                        <span id="pdf-selected-count" style="margin-right: 10px; font-size: 12px;">已选 0 项</span>
                        <button class="btn btn-primary btn-sm" onclick="PdfUtils._confirmSelection()">确认选择</button>
                    </div>
                    ` : ''
                }
                </div >
    `;

            this._pickedCallback = callback;
            Modal.show({
                title: options.title || (multiple ? '选择多个文件' : '选择文件'),
                content: `< div class="pdf-file-list" style = "max-height: 400px; height: 400px; overflow-y: auto; padding: 10px;" > ${listHtml}</div > ${footerHtml} `,
                width: '600px',
                footer: false
            });
        } catch (e) {
            console.error(e);
            Toast.error('获取文件列表失败');
        }
    },

    _toggleSelection(id, element, multiple) {
        // 从 data-file 属性获取文件信息
        const fileData = JSON.parse(element.getAttribute('data-file').replace(/&apos;/g, "'"));

        if (!multiple) {
            // 单选直接返回完整的文件对象
            const callback = this._pickedCallback;
            this._pickedCallback = null;

            // 先关闭弹窗，再延迟执行回调，避免弹窗层叠问题
            Modal.closeAll();

            setTimeout(() => {
                if (callback) {
                    callback(fileData);
                }
            }, 350);
            return;
        }

        // 多选逻辑
        const fileId = fileData.id || fileData.name;
        const index = this._selectedFiles.findIndex(f => (f.id || f.name) === fileId);
        if (index >= 0) {
            this._selectedFiles.splice(index, 1);
            element.classList.remove('active');
            element.querySelector('input').checked = false;
        } else {
            this._selectedFiles.push(fileData);
            element.classList.add('active');
            element.querySelector('input').checked = true;
        }
        this._updateCount();
    },

    _isSelected(id) {
        return this._selectedFiles.some(f => f.id === id);
    },

    _updateCount() {
        const el = document.getElementById('pdf-selected-count');
        if (el) el.innerText = `已选 ${this._selectedFiles.length} 项`;
    },

    _confirmSelection() {
        if (this._selectedFiles.length === 0) {
            Toast.warning('请至少选择一个文件');
            return;
        }
        const callback = this._pickedCallback;
        const files = [...this._selectedFiles]; // 复制一份
        this._pickedCallback = null;

        // 先关闭弹窗，再延迟执行回调，避免弹窗层叠问题
        Modal.closeAll();

        // 等待弹窗关闭动画完成后再执行回调
        setTimeout(() => {
            if (callback) {
                callback(files);
            }
        }, 350);
    },

    /**
     * 根据文件名获取对应的图标类名
     * @param {string} filename 文件名
     * @returns {string} 图标类名
     */
    _getFileIcon(filename) {
        const ext = (filename || '').toLowerCase().split('.').pop();
        const iconMap = {
            'pdf': 'ri-file-pdf-line',
            'doc': 'ri-file-word-line',
            'docx': 'ri-file-word-line',
            'xls': 'ri-file-excel-line',
            'xlsx': 'ri-file-excel-line',
            'ppt': 'ri-file-ppt-line',
            'pptx': 'ri-file-ppt-line',
            'jpg': 'ri-image-line',
            'jpeg': 'ri-image-line',
            'png': 'ri-image-line',
            'gif': 'ri-image-line',
            'webp': 'ri-image-line',
            'bmp': 'ri-image-line',
            'svg': 'ri-image-line',
            'zip': 'ri-file-zip-line',
            'rar': 'ri-file-zip-line',
            '7z': 'ri-file-zip-line',
            'txt': 'ri-file-text-line',
            'md': 'ri-markdown-line'
        };
        return iconMap[ext] || 'ri-file-line';
    }
};

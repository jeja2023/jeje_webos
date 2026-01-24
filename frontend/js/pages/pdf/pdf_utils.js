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
            // 优先从 PDF 模块自己的 uploads 目录获取文件
            let files = [];
            const pdfRes = await Api.get('/pdf/files?category=uploads');
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
                        source: 'filemanager'
                    }));
                }
            } else {
                // 标记为 PDF 模块的文件
                files = files.map(f => ({ ...f, source: 'pdf' }));
            }

            if (files.length === 0) {
                Toast.warning('没有找到符合条件的文件，请先上传');
                return;
            }

            const listHtml = files.map((f, idx) => {
                const fileSize = f.size || 0;
                const sizeStr = fileSize > 1024 * 1024
                    ? (fileSize / 1024 / 1024).toFixed(2) + ' MB'
                    : (fileSize / 1024).toFixed(0) + ' KB';
                const fileIdAttr = f.id || '';
                return `
                <div class="pdf-file-item" 
                     data-file='${JSON.stringify(f).replace(/'/g, "&apos;")}'
                     onclick="PdfUtils._toggleSelection('${fileIdAttr}', this, ${multiple})">
                    <input type="checkbox" class="pdf-file-checkbox" style="display: ${multiple ? 'block' : 'none'};" ${this._isSelected(fileIdAttr) ? 'checked' : ''}>
                    <div class="pdf-file-info">
                        <span class="pdf-file-name"><i class="ri-file-pdf-line"></i> ${f.name}</span>
                    </div>
                    <span class="pdf-file-size">${sizeStr}</span>
                </div>
            `}).join('');

            const footerHtml = multiple ? `
                <div style="margin-top: 15px; text-align: right; border-top: 1px solid var(--border-color); padding-top: 10px;">
                    <span id="pdf-selected-count" style="margin-right: 10px; font-size: 12px;">已选 0 项</span>
                    <button class="btn btn-primary btn-sm" onclick="PdfUtils._confirmSelection()">确认选择</button>
                </div>
            ` : '';

            this._pickedCallback = callback;
            Modal.show({
                title: multiple ? '选择多个文件' : '选择文件',
                content: `<div class="pdf-file-list" style="max-height: 400px; overflow-y: auto; padding: 10px;">${listHtml}</div>${footerHtml}`,
                width: '600px'
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
            if (this._pickedCallback) {
                this._pickedCallback(fileData);
                this._pickedCallback = null;
                Modal.close();
            }
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
        if (this._pickedCallback) {
            this._pickedCallback(this._selectedFiles); // 返回数组
            this._pickedCallback = null;
            Modal.close();
        }
    }
};

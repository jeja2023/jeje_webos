/**
 * Office 文档预览器
 * 支持 Word (.docx) 和 Excel (.xlsx) 文件的在线预览
 * 使用 mammoth.js 渲染 Word，使用 SheetJS 渲染 Excel
 */
const OfficeViewer = {
    // 库加载状态
    _mammothLoaded: false,
    _xlsxLoaded: false,

    /**
     * 异步加载外部脚本
     */
    async _loadScript(url, checkVar) {
        if (window[checkVar]) return true;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error(`加载脚本失败: ${url}`));
            document.head.appendChild(script);
        });
    },

    /**
     * 加载 Mammoth.js (Word 解析库) - 本地离线版本
     */
    async _loadMammoth() {
        if (this._mammothLoaded) return;
        await this._loadScript('/static/libs/mammoth/mammoth.browser.min.js', 'mammoth');
        this._mammothLoaded = true;
    },

    /**
     * 加载 SheetJS (Excel 解析库) - 本地离线版本
     */
    async _loadXlsx() {
        if (this._xlsxLoaded) return;
        await this._loadScript('/static/libs/sheetjs/xlsx.full.min.js', 'XLSX');
        this._xlsxLoaded = true;
    },

    /**
     * 从 URL 或 ArrayBuffer 预览 Word 文档
     * @param {Object} options - { url, arrayBuffer, filename, onClose }
     */
    async previewWord(options) {
        const { url, arrayBuffer, filename = 'Word 文档', onClose } = options;

        try {
            Toast.info('正在加载文档...');
            await this._loadMammoth();

            let buffer = arrayBuffer;
            if (!buffer && url) {
                const response = await fetch(url, { credentials: 'include' });
                if (!response.ok) throw new Error('获取文件失败');
                buffer = await response.arrayBuffer();
            }

            if (!buffer) throw new Error('未提供文件数据');

            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            const html = result.value;
            const messages = result.messages;

            if (messages.length > 0) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('Word 转换警告:', messages);
            }

            this._showViewerModal({
                title: `📄 ${this._escapeHtml(filename)}`,
                content: `
                    <div class="office-viewer-container office-word-viewer">
                        <div class="office-word-content">${html}</div>
                    </div>
                `,
                onClose
            });

        } catch (error) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('Word 预览失败:', error);
            Toast.error('文档预览失败: ' + error.message);
        }
    },

    /**
     * 从 URL 或 ArrayBuffer 预览 Excel 文档
     * @param {Object} options - { url, arrayBuffer, filename, onClose }
     */
    async previewExcel(options) {
        const { url, arrayBuffer, filename = 'Excel 表格', onClose } = options;

        try {
            Toast.info('正在加载表格...');
            await this._loadXlsx();

            let buffer = arrayBuffer;
            if (!buffer && url) {
                const response = await fetch(url, { credentials: 'include' });
                if (!response.ok) throw new Error('获取文件失败');
                buffer = await response.arrayBuffer();
            }

            if (!buffer) throw new Error('未提供文件数据');

            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetsHtml = this._renderWorkbook(workbook);

            this._showViewerModal({
                title: `📊 ${this._escapeHtml(filename)}`,
                content: `
                    <div class="office-viewer-container office-excel-viewer">
                        ${sheetsHtml}
                    </div>
                `,
                width: '95%',
                onClose
            });

        } catch (error) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('Excel 预览失败:', error);
            Toast.error('表格预览失败: ' + error.message);
        }
    },

    /**
     * 渲染 Excel 工作簿为 HTML
     */
    _renderWorkbook(workbook) {
        const sheetNames = workbook.SheetNames;

        if (sheetNames.length === 0) {
            return '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">该文件没有数据</div>';
        }

        // 生成工作表标签
        const tabsHtml = sheetNames.map((name, index) => `
            <button class="office-excel-tab ${index === 0 ? 'active' : ''}" 
                    data-switch-sheet="${encodeURIComponent(name)}">
                ${this._escapeHtml(name)}
            </button>
        `).join('');

        // 生成各工作表内容
        const sheetsContentHtml = sheetNames.map((name, index) => {
            const sheet = workbook.Sheets[name];
            const tableHtml = this._sheetToTable(sheet);
            return `
                <div class="office-excel-sheet ${index === 0 ? 'active' : ''}" data-sheet="${this._escapeHtml(name)}">
                    ${tableHtml}
                </div>
            `;
        }).join('');

        return `
            <div class="office-excel-tabs">${tabsHtml}</div>
            <div class="office-excel-sheets">${sheetsContentHtml}</div>
        `;
    },

    /**
     * 将工作表转换为 HTML 表格
     */
    _sheetToTable(sheet) {
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const rows = [];

        // 限制最大渲染行列数，防止超大文件卡死
        const maxRows = Math.min(range.e.r + 1, 1000);
        const maxCols = Math.min(range.e.c + 1, 100);

        for (let r = range.s.r; r < maxRows; r++) {
            const cells = [];
            for (let c = range.s.c; c < maxCols; c++) {
                const cellRef = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[cellRef];
                const value = cell ? (cell.w !== undefined ? cell.w : cell.v) : '';
                cells.push(`<td>${this._escapeHtml(String(value))}</td>`);
            }
            rows.push(`<tr>${cells.join('')}</tr>`);
        }

        if (rows.length === 0) {
            return '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">空工作表</div>';
        }

        // 如果超过限制，显示提示
        let notice = '';
        if (range.e.r + 1 > maxRows || range.e.c + 1 > maxCols) {
            notice = `<div class="office-excel-notice">数据量较大，仅显示前 ${maxRows} 行 × ${maxCols} 列</div>`;
        }

        return `
            ${notice}
            <div class="office-excel-table-wrapper">
                <table class="office-excel-table">
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
        `;
    },

    /**
     * 切换工作表
     */
    _switchSheet(tabEl, sheetName) {
        // 更新标签激活状态
        const tabs = tabEl.parentElement.querySelectorAll('.office-excel-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');

        // 更新工作表显示
        const container = tabEl.closest('.office-excel-viewer');
        const sheets = container.querySelectorAll('.office-excel-sheet');
        sheets.forEach(s => {
            s.classList.toggle('active', s.dataset.sheet === sheetName);
        });
    },

    /**
     * 显示预览模态框
     */
    _showViewerModal(options) {
        const { title, content, width = '900px', onClose } = options;

        const modal = Modal.show({
            title: title,
            content: content,
            width: width,
            footer: `
                <button class="btn btn-text" data-action="close-modal">关闭</button>
            `,
            onClose: onClose
        });

        if (modal?.overlay) {
            modal.overlay.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="close-modal"]')) {
                    Modal.closeAll();
                    return;
                }
                const tab = e.target.closest('[data-switch-sheet]');
                if (tab) {
                    const sheetName = decodeURIComponent(tab.dataset.switchSheet);
                    OfficeViewer._switchSheet(tab, sheetName);
                }
            });
        }
    },

    /**
     * 转义 HTML 特殊字符
     */
    _escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * 判断文件是否为 Word 文档
     */
    isWordFile(filename) {
        return /\.(docx)$/i.test(filename);
    },

    /**
     * 判断文件是否为 Excel 表格
     */
    isExcelFile(filename) {
        return /\.(xlsx|xls)$/i.test(filename);
    },

    /**
     * 判断文件是否为支持的 Office 文件
     */
    isOfficeFile(filename) {
        return this.isWordFile(filename) || this.isExcelFile(filename);
    },

    /**
     * 根据文件类型自动选择预览方式
     */
    async preview(options) {
        const { filename } = options;

        if (this.isWordFile(filename)) {
            return this.previewWord(options);
        } else if (this.isExcelFile(filename)) {
            return this.previewExcel(options);
        } else {
            Toast.warning('不支持的文件格式');
        }
    }
};

// 挂载到全局
window.OfficeViewer = OfficeViewer;

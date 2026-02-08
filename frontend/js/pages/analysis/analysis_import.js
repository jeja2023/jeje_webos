/**
 * 数据分析模块 - 数据导入功能
 */

const AnalysisImportMixin = {
    /**
     * 渲染导入页面
     */
    renderImport() {
        const isDbMode = this.state.importType === 'database';

        return `
            <div class="p-20" style="height: calc(100vh - 120px); overflow: auto;">
                <div class="flex-between mb-20">
                    <h2 class="m-0">数据导入中心</h2>
                    <div class="tab-pill-group">
                        <button class="tab-pill ${this.state.importType === 'file' ? 'active' : ''}" data-import-type="file">文件导入</button>
                        <button class="tab-pill ${this.state.importType === 'database' ? 'active' : ''}" data-import-type="database">数据库导入</button>
                    </div>
                </div>
                
                <div class="import-card-modern">
                    ${isDbMode ? this.renderDbImport() : this.renderFileImport()}
                </div>
            </div>
        `;
    },

    /**
     * 渲染文件导入部分
     */
    renderFileImport() {
        const { fileSource, fileManagerFiles, loadingFiles, selectedFiles = [] } = this.state;

        return `
            <div class="import-section">
                <div class="tabs mb-20">
                    <button class="btn btn-sm ${fileSource === 'upload' ? 'btn-primary' : 'btn-ghost'}" data-file-source="upload">本地文件</button>
                    <button class="btn btn-sm ${fileSource === 'manager' ? 'btn-primary' : 'btn-ghost'}" data-file-source="manager">云端资产</button>
                </div>
                
                ${fileSource === 'manager' ? `
                    <div class="form-group">
                        <!-- 面包屑导航 -->
                        <div class="fm-breadcrumb mb-10">
                            <span class="breadcrumb-item" data-id="">根目录</span>
                            ${this.state.folderPath ? this.state.folderPath.map(p => `
                                <i class="ri-arrow-right-s-line"></i>
                                <span class="breadcrumb-item" data-id="${p.id}">${Utils.escapeHtml(p.name)}</span>
                            `).join('') : ''}
                        </div>

                        <div class="search-wrapper mb-10">
                            <i class="ri-search-line"></i>
                            <input type="text" class="form-control" placeholder="搜索当前目录..." id="fm-file-search">
                        </div>
                        ${loadingFiles ? '<div class="text-center p-30"><div class="loader"></div><p class="mt-10">读取中...</p></div>' : `
                            <div class="fm-list-container">
                                ${fileManagerFiles && (fileManagerFiles.folders?.length || fileManagerFiles.files?.length) ? `
                                    <!-- 文件夹列表 -->
                                    ${fileManagerFiles.folders ? fileManagerFiles.folders.map(f => `
                                        <div class="fm-file-item-modern fm-folder-item" data-id="${f.id}">
                                            <div class="file-icon-box" style="background: rgba(255, 193, 7, 0.1); color: #ffc107;"><i class="ri-folder-fill"></i></div>
                                            <div class="file-details">
                                                <span class="file-name">${Utils.escapeHtml(f.name)}</span>
                                                <span class="file-meta">文件夹 | ${f.file_count || 0} 文件</span>
                                            </div>
                                        </div>
                                    `).join('') : ''}
                                    <!-- 文件列表 -->
                                    ${fileManagerFiles.files ? fileManagerFiles.files.map(f => {
            const isChecked = (this.state.cloudSelections || []).includes(f.id.toString());
            const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
            const isSupported = ['.csv', '.xlsx', '.xls'].includes(ext);

            return `
                                        <label class="fm-file-item-modern ${isChecked ? 'active' : ''} ${!isSupported ? 'opacity-75' : ''}">
                                            <input type="checkbox" class="fm-file-checkbox" value="${f.id}" data-filename="${Utils.escapeHtml(f.name)}" ${isChecked ? 'checked' : ''} ${!isSupported ? 'disabled' : ''}>
                                            <div class="file-icon-box">${isSupported ? '<i class="ri-bar-chart-2-line"></i>' : '<i class="ri-file-3-line"></i>'}</div>
                                            <div class="file-details">
                                                <span class="file-name">${Utils.escapeHtml(f.name)}</span>
                                                <span class="file-meta">
                                                    ${!isSupported ? '<span class="text-warning"><i class="ri-alert-line"></i> 格式不支持</span> | ' : ''} 
                                                    ${Utils.formatBytes(f.file_size)} | ${Utils.formatDate(f.updated_at)}
                                                </span>
                                            </div>
                                            <div class="flex gap-5">
                                                ${isSupported ?
                    `<button class="btn btn-xs btn-ghost btn-preview-file" data-id="${f.id}" data-source="filemanager" title="预览数据"><i class="ri-eye-line"></i></button>` :
                    `<span class="text-xs text-secondary p-5">不可预览</span>`
                }
                                            </div>
                                        </label>
                                    `;
        }).join('') : ''}
                                ` : '<div class="p-40 text-center text-secondary"><i class="ri-inbox-line"></i> 目录为空</div>'}
                            </div>
                        `}
                    </div>
                    <button class="btn btn-primary w-100 mt-20" id="btn-import-batch" ${(this.state.cloudSelections || []).length === 0 ? 'disabled' : ''}>
                        <i class="ri-download-line"></i> 批量导入选中的文件 (${(this.state.cloudSelections || []).length})
                    </button>
                ` : `
                    <div class="file-upload-area" id="file-upload-area">
                        <input type="file" id="import-file-input" accept=".csv,.xlsx,.xls" multiple style="display:none">
                        <div class="file-upload-placeholder">
                            <span class="upload-icon"><i class="ri-folder-upload-line"></i></span>
                            <h3>点击或拖拽文件到这里</h3>
                            <p class="text-secondary">支持批量选择 CSV、Excel (.xlsx, .xls) 格式</p>
                        </div>
                    </div>

                    ${selectedFiles.length > 0 ? `
                        <div class="batch-file-list" id="batch-file-list">
                            ${selectedFiles.map((f, index) => `
                                <div class="batch-file-item" data-index="${index}">
                                    <div class="file-icon"><i class="ri-file-3-line"></i></div>
                                    <div class="file-info">
                                        <div class="file-name">${Utils.escapeHtml(f.name)}</div>
                                        <div class="file-size">${(f.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                    <div class="flex gap-10">
                                        <button class="btn btn-icon btn-sm btn-preview-local" data-index="${index}" title="预览内容"><i class="ri-search-line"></i></button>
                                        <button class="btn btn-icon btn-sm btn-remove-local" data-index="${index}" title="从列表移除"><i class="ri-delete-bin-line"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-primary w-100 mt-20" id="btn-do-upload-batch"><i class="ri-rocket-line"></i> 开始批量导入 (${selectedFiles.length}个文件)</button>
                    ` : ''}
                `}
            </div>
        `;
    },

    /**
     * 渲染数据库导入部分
     */
    renderDbImport() {
        const { dbTables, dbConnected, dbLoading, dbConfig, dbTableSearch = '' } = this.state;
        const type = dbConfig.type || 'mysql';
        const isSqlite = type === 'sqlite';
        const isOracle = type === 'oracle';

        const filteredTables = dbTables ? dbTables.filter(t => t.toLowerCase().includes(dbTableSearch.toLowerCase())) : [];

        // 动态标签和占位符
        let nameLabel = '数据库名';
        let namePlaceholder = 'Database Name';
        if (isOracle) {
            nameLabel = '服务名 (Service Name)';
            namePlaceholder = '例如: ORCLPDB1';
        } else if (isSqlite) {
            nameLabel = '数据库文件绝对路径';
            namePlaceholder = '例如: D:/data/mydb.db';
        }

        // 动态显示样式
        const hideStyle = 'display: none !important;';

        return `
            <div class="db-import-layout">
                <!-- 左侧：连接面板 -->
            <div class="db-sidebar">
                <div class="db-config-header">
                    <h4>数据库连接</h4>
                    <span class="status-indicator ${dbConnected ? 'online' : ''}">${dbConnected ? '已连接' : '待连接'}</span>
                </div>

                <div class="db-config-body">
                    <div class="form-group">
                        <label>数据库类型</label>
                        <div class="db-type-selector">
                            ${[
                { id: 'mysql', icon: 'ri-database-2-line' },
                { id: 'postgresql', icon: 'ri-database-fill' },
                { id: 'sqlite', icon: 'ri-file-list-3-line' },
                { id: 'oracle', icon: 'ri-shield-user-line' },
                { id: 'sqlserver', icon: 'ri-server-line' }
            ].map(t => `
                                    <div class="db-type-option ${dbConfig.type === t.id ? 'active' : ''}" data-type="${t.id}">
                                        <i class="${t.icon} db-type-icon"></i>
                                        <span>${t.id.toUpperCase()}</span>
                                    </div>
                                `).join('')}
                        </div>
                    </div>

                    <div class="db-grid-inputs" style="${isSqlite ? hideStyle : ''}">
                        <div class="form-group">
                            <label>主机</label>
                            <input type="text" id="db-host" class="form-control" value="${dbConfig.host || ''}" placeholder="localhost">
                        </div>
                        <div class="form-group">
                            <label>端口</label>
                            <input type="number" id="db-port" class="form-control" value="${dbConfig.port || ''}" placeholder="3306">
                        </div>
                    </div>

                    <div class="form-group" style="${isSqlite ? hideStyle : ''}">
                        <label>用户名 / 密码</label>
                        <div class="flex gap-10">
                            <input type="text" id="db-user" class="form-control" value="${dbConfig.user || ''}" placeholder="User">
                                <input type="password" id="db-pass" class="form-control" value="${dbConfig.pass || ''}" placeholder="Password">
                                </div>
                        </div>

                        <div class="form-group">
                            <label id="db-name-label">${nameLabel}</label>
                            <input type="text" id="db-name" class="form-control" value="${dbConfig.dbName || ''}" placeholder="${namePlaceholder}">
                        </div>

                        <div class="btn-group-full">
                            <button class="btn btn-ghost" id="btn-test-db" ${dbLoading ? 'disabled' : ''}><i class="ri-plug-line"></i> 测试</button>
                            <button class="btn btn-primary" id="btn-connect-db" ${dbLoading ? 'disabled' : ''}>
                                ${dbLoading ? '<i class="ri-loader-4-line ri-spin"></i> 连接中...' : (dbConnected ? '<i class="ri-refresh-line"></i> 刷新列表' : '<i class="ri-table-line"></i> 连接数据库')}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 右侧：数据表区域 -->
                <div class="db-main-area">
                    ${!dbConnected ? `
                        <div class="db-empty-state">
                            <div class="illustration"><i class="ri-broadcast-line"></i></div>
                            <h3>等待建立通信</h3>
                            <p>连接成功后，这里将展示数据库中所有可导入的数据表</p>
                        </div>
                    ` : `
                        <div class="db-table-explorer">
                            <div class="explorer-header">
                                <div class="search-wrapper" style="flex:1">
                                    <i class="ri-search-line"></i>
                                    <input type="text" class="form-control" placeholder="在库中搜索表..." id="db-table-search" value="${dbTableSearch}">
                                </div>
                                <div class="selection-tools ml-20">
                                    <button class="btn btn-xs btn-ghost" id="btn-select-all">全选</button>
                                    <button class="btn btn-xs btn-ghost" id="btn-deselect-all">取消</button>
                                </div>
                            </div>
                            
                            <div class="table-grid">
                                ${filteredTables.length > 0 ? filteredTables.map(table => `
                                    <label class="table-card-item">
                                        <input type="checkbox" class="db-table-checkbox" value="${Utils.escapeHtml(table)}">
                                        <div class="table-icon"><i class="ri-table-line"></i></div>
                                        <div class="table-info">
                                            <span class="table-name" title="${Utils.escapeHtml(table)}">${Utils.escapeHtml(table)}</span>
                                        </div>
                                    </label>
                                `).join('') : `
                                    <div class="no-results">
                                        <p>没有匹配的表名</p>
                                    </div>
                                `}
                            </div>
                            
                            <div class="explorer-footer">
                                <button class="btn btn-primary w-100" id="btn-do-import-tables">
                                    导入选中的数据表 (<span id="selected-count">0</span>)
                                </button>
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    /**
     * 弹出预览框
     */
    async showPreviewModal(fileId, source = 'upload', localFile = null) {
        let data = null;
        try {
            if (localFile) {
                // 对于本地尚未上传的文件，逻辑较复杂
                Toast.info('本地文件需要先上传预览，我们直接读取前几行');
                // 使用 FileReader 模拟预览逻辑 (仅限文本类)
                return this.showLocalFilePreview(localFile);
            } else {
                Toast.info('正在获取数据预览...');
                const res = await AnalysisApi.previewImport({ file_id: fileId, source });
                data = res.data;
            }
        } catch (e) {
            return Toast.error('获取预览失败');
        }

        const html = `
            <style>
                /* 强制覆盖模态框默认样式以适应大屏预览 */
                .modal-body {
                    max-height: 85vh !important;
                    display: flex;
                    flex-direction: column;
                }
                .preview-container {
                    /* 强制高度，确保视觉体验 */
                    height: 65vh !important;
                    min-height: 500px !important;
                    max-height: none !important;
                }
            </style>
            <div class="preview-modal-content">
                <div class="mb-15 p-10 bg-tertiary rounded">
                    <strong>文件名:</strong> ${Utils.escapeHtml(data.filename)}
                </div>
                <div class="preview-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                ${data.columns.map(c => `<th>${Utils.escapeHtml(c)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.preview.map(row => `
                                <tr>
                                    ${data.columns.map(c => `<td>${Utils.escapeHtml(String(row[c] !== null ? row[c] : ''))}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p class="text-secondary mt-10 text-sm">* 仅展示前 10 条数据作为样例</p>
            </div>
    `;

        Modal.show({
            title: '数据效果预览',
            content: html,
            width: '90%'
        });
    },

    showLocalFilePreview(file) {
        const isCsv = file.name.toLowerCase().endsWith('.csv');

        // 模态框通用样式覆盖
        const style = `
            <style>
                .modal-body { max-height: 85vh !important; display: flex; flex-direction: column; }
                .preview-container { height: 60vh !important; min-height: 400px !important; overflow: auto; }
            </style>
        `;

        if (!isCsv) {
            // Excel 或其他格式，本地无法直接解析预览
            const html = `
                ${style}
                <div class="preview-modal-content">
                    <div class="mb-15 p-15 bg-tertiary rounded flex-center flex-col text-center" style="height: 100%; min-height: 300px;">
                        <div style="font-size: 48px; margin-bottom: 20px;"><i class="ri-bar-chart-2-line"></i></div>
                        <h3 class="mb-10">本地预览暂不支持 Excel/二进制文件</h3>
                        <p class="text-secondary mb-20">为了查看完整数据内容，请先点击"开始批量导入"将文件上传至服务器。</p>
                        
                        <div class="p-15 bg-secondary rounded text-left" style="width: 100%; max-width: 400px;">
                            <div class="mb-5"><strong>文件名:</strong> ${Utils.escapeHtml(file.name)}</div>
                            <div class="mb-5"><strong>大小:</strong> ${Utils.formatBytes(file.size)}</div>
                            <div><strong>类型:</strong> ${Utils.escapeHtml(file.type || '未识别')}</div>
                        </div>
                    </div>
                </div>
            `;

            Modal.show({
                title: '本地文件概览',
                content: html,
                width: '600px'
            });
            return;
        }

        // CSV 文件解析预览
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            // 简单CSV解析 (取前20行)
            const lines = content.split(/\r\n|\n/).filter(line => line.trim()).slice(0, 20);

            if (lines.length === 0) {
                Toast.info('文件内容为空');
                return;
            }

            // 尝试检测分隔符 (逗号或分号)
            const firstLine = lines[0];
            const separator = firstLine.includes(',') ? ',' : (firstLine.includes(';') ? ';' : ',');

            const columns = firstLine.split(separator).map(c => c.replace(/^['"]|['"]$/g, '').trim());
            const dataRows = lines.slice(1).map(line => {
                return line.split(separator).map(c => c.replace(/^['"]|['"]$/g, '').trim());
            });

            const html = `
                ${style}
                <div class="preview-modal-content">
                    <div class="mb-15 p-10 bg-tertiary rounded">
                        <strong>文件名:</strong> ${Utils.escapeHtml(file.name)} <span class="ml-10 text-secondary">(${Utils.formatBytes(file.size)})</span>
                    </div>
                    <div class="preview-container">
                        <table class="preview-table">
                            <thead>
                                <tr>
                                    ${columns.map(c => `<th>${Utils.escapeHtml(c)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${dataRows.map(row => `
                                    <tr>
                                        ${columns.map((_, i) => `<td>${Utils.escapeHtml(row[i] || '')}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <p class="text-secondary mt-10 text-sm">* 本地预览仅展示前 20 行，实际导入后可查看全部</p>
                </div>
            `;

            Modal.show({
                title: '本地 CSV 预览',
                content: html,
                width: '90%'
            });
        };
        reader.readAsText(file.slice(0, 50000)); // 读取前50KB足够预览
    },

    /**
     * 绑定导入相关事件
     */
    bindImportEvents() {
        if (this._importEventsBound) return;
        this._importEventsBound = true;

        // --- 文件源与导入方式切换 ---
        this.delegate('click', '[data-import-type]', (e, el) => {
            this.setState({ importType: el.dataset.importType });
        });

        this.delegate('click', '[data-file-source]', (e, el) => {
            const source = el.dataset.fileSource;
            this.setState({ fileSource: source });
            if (source === 'manager' && !this.state.fileManagerFiles) {
                this.loadFileManagerFiles(null);
            }
        });

        // --- 本地多文件处理 ---
        this.delegate('click', '#file-upload-area', () => {
            document.getElementById('import-file-input')?.click();
        });

        this.delegate('change', '#import-file-input', (e) => {
            const files = Array.from(e.target.files);
            const current = this.state.selectedFiles || [];
            this.setState({ selectedFiles: [...current, ...files] });
        });

        // 拖拽支持
        this.delegate('dragover', '#file-upload-area', (e, el) => {
            e.preventDefault();
            el.classList.add('dragover');
        });
        this.delegate('dragleave', '#file-upload-area', (e, el) => {
            el.classList.remove('dragover');
        });
        this.delegate('drop', '#file-upload-area', (e, el) => {
            e.preventDefault();
            el.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files);
            const current = this.state.selectedFiles || [];
            this.setState({ selectedFiles: [...current, ...files] });
        });

        this.delegate('click', '.btn-remove-local', (e, el) => {
            const index = parseInt(el.dataset.index);
            const files = [...(this.state.selectedFiles || [])];
            files.splice(index, 1);
            this.setState({ selectedFiles: files });
        });

        this.delegate('click', '.btn-preview-local', (e, el) => {
            const index = parseInt(el.dataset.index);
            const file = (this.state.selectedFiles || [])[index];
            this.showLocalFilePreview(file);
        });

        // 批量上传执行
        this.delegate('click', '#btn-do-upload-batch', async () => {
            const files = this.state.selectedFiles || [];
            if (!files.length) return;

            Toast.info(`开始准备上传 ${files.length} 个文件...`);
            let successCount = 0;

            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const uploadRes = await AnalysisApi.uploadFile(formData);
                    const fileId = uploadRes.data?.id || uploadRes.id;
                    await AnalysisApi.importFile({
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        file_id: fileId,
                        options: {}
                    });
                    successCount++;
                } catch (err) {
                    Toast.error(`文件 ${file.name} 导入失败: ${err.message} `);
                }
            }

            Toast.success(`成功导入 ${successCount} 个数据集`);
            this.setState({ selectedFiles: [], activeTab: 'datasets' });
            this.fetchDatasets();
        });

        // --- 云端文件相关 ---
        this.delegate('click', '.btn-preview-file', (e, el) => {
            e.preventDefault();
            const id = el.dataset.id;
            const source = el.dataset.source;
            this.showPreviewModal(id, source);
        });

        this.delegate('change', '.fm-file-checkbox', () => {
            const checked = Array.from(document.querySelectorAll('.fm-file-checkbox:checked')).map(cb => cb.value);
            this.setState({ cloudSelections: checked });
        });

        // 文件夹导航
        this.delegate('click', '.fm-folder-item', (e, el) => {
            const folderId = el.dataset.id;
            this.loadFileManagerFiles(folderId);
        });

        // 面包屑导航
        this.delegate('click', '.breadcrumb-item', (e, el) => {
            const folderId = el.dataset.id || null;
            this.loadFileManagerFiles(folderId);
        });

        this.delegate('input', '#fm-file-search', (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.fm-file-item-modern');
            items.forEach(item => {
                const name = item.querySelector('.file-name').textContent.toLowerCase();
                item.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });

        this.delegate('click', '#btn-import-batch', async () => {
            const selections = this.state.cloudSelections || [];
            if (!selections.length) return;

            const items = selections.map(id => {
                const file = this.state.fileManagerFiles.files.find(f => f.id.toString() === id);
                return {
                    name: file ? file.name.replace(/\.[^/.]+$/, '') : `file_${id}`,
                    file_id: parseInt(id),
                    source: 'filemanager',
                    options: {}
                };
            });

            try {
                Toast.info(`正在从个人网盘导入 ${items.length} 个文件...`);
                const res = await AnalysisApi.importBatchFiles({ items });
                Toast.success(`成功导入 ${res.data.count} 个文件`);
                this.setState({ cloudSelections: [], activeTab: 'datasets' });
                this.fetchDatasets();
            } catch (e) {
                Toast.error('批量导入失败: ' + e.message);
            }
        });

        // --- 数据库相关 ---
        this.delegate('click', '.db-type-option', (e, el) => {
            const type = el.dataset.type;
            const config = { ...this.state.dbConfig, type };
            this.setState({ dbConfig: config }, () => {
                this.updateDbTypeHints();
            });
        });

        this.delegate('input', '#db-table-search', (e) => {
            this.setState({ dbTableSearch: e.target.value });
        });

        this.delegate('change', '.db-table-checkbox', () => {
            const count = document.querySelectorAll('.db-table-checkbox:checked').length;
            const el = document.getElementById('selected-count');
            if (el) el.textContent = count;
        });

        // 代理通用逻辑: 复用原有的 buildDbConnectionUrl, updateDbTypeHints 等
        ['#db-host', '#db-port', '#db-user', '#db-pass', '#db-name'].forEach(selector => {
            this.delegate('input', selector, () => this.buildDbConnectionUrl());
        });

        // 保持兼容性的逻辑
        this.delegate('click', '#btn-test-db', () => this._original_testDbConn());
        this.delegate('click', '#btn-connect-db', () => this._original_connectDb());
        this.delegate('click', '#btn-do-import-tables', () => this._original_executeTableImport());
    },

    // 内部方法包装，保持逻辑清晰
    async _original_testDbConn() {
        const url = this.buildDbConnectionUrl();
        if (!url) return Toast.error('配置不全');
        try {
            Toast.info('测试中...');
            await AnalysisApi.importDatabase({ name: '_test_', connection_url: url, query: 'SELECT 1', test_only: true });
            Toast.success('<i class="ri-checkbox-circle-line"></i> 连接成功');
        } catch (e) { Toast.error('失败: ' + e.message); }
    },

    async _original_connectDb() {
        const url = this.buildDbConnectionUrl();
        try {
            this.setState({ dbLoading: true });
            const res = await AnalysisApi.getDbTables({ connection_url: url });
            this.setState({ dbTables: res.data.tables || [], dbConnected: true, dbLoading: false });
            Toast.success('已同步表结构');
        } catch (e) {
            this.setState({ dbLoading: false, dbConnected: false });
            Toast.error('同步失败');
        }
    },

    async _original_executeTableImport() {
        const checkboxes = document.querySelectorAll('.db-table-checkbox:checked');
        if (!checkboxes.length) return Toast.error('未勾选任何表');
        const url = document.getElementById('import-url')?.value || this.state.dbConfig?.url;
        const tables = Array.from(checkboxes).map(cb => cb.value);
        try {
            Toast.info(`正在队列导入 ${tables.length} 个项目...`);
            for (const table of tables) {
                await AnalysisApi.importDatabase({ name: table, connection_url: url, query: `SELECT * FROM ${table} ` });
            }
            Toast.success('<i class="ri-sparkling-fill"></i> 批量入库完成');
            this.setState({ activeTab: 'datasets' });
            this.fetchDatasets();
        } catch (e) { Toast.error('处理中断'); }
    },

    /**
     * 更新数据库类型相关提示
     */
    updateDbTypeHints() {
        const type = this.state.dbConfig?.type || 'mysql';

        // 获取所有配置相关DOM元素
        const fields = {
            host: document.getElementById('db-host')?.closest('.form-group'),
            port: document.getElementById('db-port')?.closest('.form-group'),
            user: document.getElementById('db-user')?.closest('.form-group'),
            pass: document.getElementById('db-pass')?.closest('.form-group'), // 用户名/密码 可能在一行
            name: document.getElementById('db-name')?.closest('.form-group')
        };

        // 单独获取输入框用于设置默认值
        const inputs = {
            host: document.getElementById('db-host'),
            port: document.getElementById('db-port'),
            name: document.getElementById('db-name'),
            nameLabel: document.getElementById('db-name-label')
        };

        // 1. 重置所有字段的可见性和启用状态
        Object.values(fields).forEach(el => {
            if (el) {
                el.style.display = 'block';
                el.style.opacity = '1';
                const input = el.querySelector('input');
                if (input) input.disabled = false;
            }
        });

        // 2. 根据类型应用特定规则
        if (type === 'sqlite') {
            // SQLite: 隐藏 Host, Port, User, Password
            if (fields.host) fields.host.style.display = 'none';
            if (fields.port) fields.port.style.display = 'none';
            // User/Pass 在同一行，需要特殊处理
            const userGroup = document.getElementById('db-user')?.closest('.form-group');
            if (userGroup) userGroup.style.display = 'none';

            if (inputs.nameLabel) inputs.nameLabel.textContent = '数据库文件绝对路径';
            if (inputs.name) inputs.name.placeholder = '例如: D:/data/mydb.db';

        } else if (type === 'oracle') {
            // Oracle：更改 Name 标签为 Service Name
            if (inputs.nameLabel) inputs.nameLabel.textContent = '服务名 (Service Name)';
            if (inputs.name) inputs.name.placeholder = '例如: ORCLPDB1';
            if (inputs.port && !inputs.port.value) inputs.port.value = '1521';

        } else {
            // MySQL, PG, SQLServer: 标准配置
            if (inputs.nameLabel) inputs.nameLabel.textContent = '数据库名称';
            if (inputs.name) inputs.name.placeholder = 'Database Name';

            // 设置默认端口
            const defaultPorts = { mysql: 3306, postgresql: 5432, sqlserver: 1433 };
            if (inputs.port && (!inputs.port.value || inputs.port.value == '1521')) { // 仅当为空或为Oracle默认时重置
                inputs.port.value = defaultPorts[type] || '';
            }
        }

        this.buildDbConnectionUrl();
    },

    // 覆盖 buildDbConnectionUrl 增加对 state 的同步
    buildDbConnectionUrl() {
        const type = this.state.dbConfig?.type || 'mysql';
        const host = document.getElementById('db-host')?.value || '';
        const port = document.getElementById('db-port')?.value || '';
        const user = document.getElementById('db-user')?.value || '';
        const pass = document.getElementById('db-pass')?.value || '';
        const dbName = document.getElementById('db-name')?.value || '';

        let url = '';
        const userPass = user ? (pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`) : '';

        switch (type) {
            case 'mysql': url = `mysql+pymysql://${userPass}${host}:${port || 3306}/${dbName}`; break;
            case 'postgresql': url = `postgresql+psycopg2://${userPass}${host}:${port || 5432}/${dbName}`; break;
            case 'sqlite': url = `sqlite:///${dbName}`; break;
            case 'oracle': url = `oracle+oracledb://${userPass}${host}:${port || 1521}/?service_name=${dbName}`; break;
            case 'sqlserver': url = `mssql+pyodbc://${userPass}${host}:${port || 1433}/${dbName}?driver=ODBC+Driver+17+for+SQL+Server`; break;
        }

        this.state.dbConfig = { type, host, port, user, pass, dbName, url };
        return url;
    },

    /**
     * 加载云端文件列表
     */
    async loadFileManagerFiles(folderId = null) {
        try {
            this.setState({ loadingFiles: true });

            const params = {};
            if (folderId && folderId !== 'null' && folderId !== '') {
                params.folder_id = folderId;
            }

            const res = await AnalysisApi.browseFileManager(params);

            this.setState({
                fileManagerFiles: res.data,
                currentFolderId: folderId,
                folderPath: res.data.breadcrumbs || [],
                loadingFiles: false
            });
        } catch (e) {
            this.setState({ loadingFiles: false });
            Toast.error('浏览文件夹失败: ' + e.message);
        }
    }
};

// 混合到 AnalysisPage
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisImportMixin);
}

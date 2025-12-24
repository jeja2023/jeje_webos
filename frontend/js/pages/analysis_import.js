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
                    <h2>数据导入</h2>
                </div>
                <div class="tabs mb-20">
                    <button class="btn ${this.state.importType === 'file' ? 'btn-primary' : ''}" data-import-type="file">文件导入</button>
                    <button class="btn ${this.state.importType === 'database' ? 'btn-primary' : ''}" data-import-type="database">数据库导入</button>
                </div>
                
                ${isDbMode ? this.renderDbImport() : `<div class="import-form">${this.renderFileImport()}</div>`}
            </div>
        `;
    },

    /**
     * 渲染文件导入部分
     */
    renderFileImport() {
        const { fileManagerFiles, loadingFiles } = this.state;

        return `
            <div class="tabs mb-15" style="border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
                <button class="btn btn-sm ${this.state.fileSource === 'upload' ? 'btn-primary' : 'btn-ghost'}" data-file-source="upload">上传新文件</button>
                <button class="btn btn-sm ${this.state.fileSource === 'manager' ? 'btn-primary' : 'btn-ghost'}" data-file-source="manager">从文件管理选择</button>
            </div>
            
            ${this.state.fileSource === 'manager' ? `
                <div class="form-group">
                    <label>选择已上传的数据文件</label>
                    ${loadingFiles ? '<div class="text-center p-20">加载中...</div>' : `
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px;">
                            ${fileManagerFiles && fileManagerFiles.length > 0 ? fileManagerFiles.map(f => `
                                <label class="fm-file-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid var(--color-border); cursor: pointer;">
                                    <input type="radio" name="fm-file" class="fm-file-radio" value="${f.id}" data-filename="${f.name}" style="margin-right: 10px;">
                                    <span style="flex: 1;">📊 ${f.name}</span>
                                    <span class="text-secondary text-sm">${(f.file_size / 1024).toFixed(1)} KB</span>
                                </label>
                            `).join('') : '<div class="p-20 text-center text-secondary">没有找到数据文件（CSV/Excel）</div>'}
                        </div>
                    `}
                </div>
                <button class="btn btn-primary w-100 mt-20" id="btn-import-from-fm">📥 导入选中的文件</button>
            ` : `
                <div class="form-group">
                    <label>选择数据文件</label>
                    <div class="file-upload-area" id="file-upload-area">
                        <input type="file" id="import-file-input" accept=".csv,.xlsx,.xls" style="display:none">
                        <div class="file-upload-placeholder" id="file-upload-placeholder">
                            <span class="upload-icon">📄</span>
                            <p>点击选择文件或将文件拖拽到此处</p>
                            <p class="text-secondary text-sm">支持 CSV、Excel (.xlsx, .xls) 格式</p>
                        </div>
                        <div class="file-upload-preview" id="file-upload-preview" style="display:none">
                            <span class="file-icon">📊</span>
                            <span class="file-name" id="selected-file-name"></span>
                            <button class="btn btn-ghost btn-sm" id="btn-clear-file">✕</button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary w-100 mt-20" id="btn-do-import">📤 上传并导入</button>
            `}
        `;
    },

    /**
     * 渲染数据库导入部分
     */
    renderDbImport() {
        const { dbTables, dbConnected, dbLoading, dbConfig } = this.state;

        return `
            <div style="display: grid; grid-template-columns: 400px 1fr; gap: 24px; min-height: 500px;">
                <!-- 左侧：数据库连接配置 -->
                <div style="display: flex; flex-direction: column;">
                    <h3 style="margin-bottom: 15px; font-size: 15px; font-weight: 600;">数据库连接配置</h3>
                    
                    <div class="db-config-grid">
                        <div class="form-group">
                            <label>数据库类型</label>
                            <select id="db-type" class="form-control">
                                <option value="mysql" ${dbConfig.type === 'mysql' ? 'selected' : ''}>MySQL</option>
                                <option value="postgresql" ${dbConfig.type === 'postgresql' ? 'selected' : ''}>PostgreSQL</option>
                                <option value="oracle" ${dbConfig.type === 'oracle' ? 'selected' : ''}>Oracle</option>
                                <option value="sqlserver" ${dbConfig.type === 'sqlserver' ? 'selected' : ''}>SQL Server</option>
                                <option value="sqlite" ${dbConfig.type === 'sqlite' ? 'selected' : ''}>SQLite</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>主机地址</label>
                            <input type="text" id="db-host" class="form-control" placeholder="localhost 或 IP地址" value="${dbConfig.host || ''}">
                        </div>
                        <div class="form-group">
                            <label>端口</label>
                            <input type="number" id="db-port" class="form-control" placeholder="3306" value="${dbConfig.port || ''}">
                        </div>
                        <div class="form-group">
                            <label>用户名</label>
                            <input type="text" id="db-user" class="form-control" placeholder="root" value="${dbConfig.user || ''}">
                        </div>
                        <div class="form-group">
                            <label>密码</label>
                            <input type="password" id="db-pass" class="form-control" placeholder="密码" value="${dbConfig.pass || ''}">
                        </div>
                        <div class="form-group">
                            <label id="db-name-label">数据库名</label>
                            <input type="text" id="db-name" class="form-control" placeholder="数据库名称" value="${dbConfig.dbName || ''}">
                            <p id="db-name-hint" class="text-secondary text-sm mt-5" style="display:none">Oracle请填写服务名(Service Name)</p>
                        </div>
                    </div>
                    
                    <div class="form-group mt-10">
                        <label>连接 URL <span class="text-secondary">(自动生成)</span></label>
                        <input type="text" id="import-url" class="form-control bg-tertiary" readonly value="${dbConfig.url || ''}">
                    </div>
                    
                    <div class="flex gap-10 mt-15">
                        <button class="btn btn-ghost" id="btn-test-db" type="button" ${dbLoading ? 'disabled' : ''}>
                            🔌 测试连接
                        </button>
                        <button class="btn ${dbConnected ? 'btn-secondary' : 'btn-primary'} flex-1" id="btn-connect-db" type="button" ${dbLoading ? 'disabled' : ''}>
                            ${dbLoading ? '⏳ 连接中...' : (dbConnected ? '🔄 重新获取表' : '📋 获取表列表')}
                        </button>
                    </div>
                </div>
                
                <!-- 右侧：表列表选择区 -->
                <div style="display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); overflow: hidden;">
                    ${!dbConnected ? `
                        <div style="flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 40px; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 20px;">🗄️</div>
                            <h3 style="margin-bottom: 10px; color: var(--color-text-secondary);">请先连接数据库</h3>
                            <p style="color: var(--color-text-tertiary); font-size: 14px;">填写左侧连接信息后，点击"连接数据库"按钮</p>
                        </div>
                    ` : `
                        <div style="padding: 15px 20px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-primary);">
                            <div class="flex-between">
                                <div>
                                    <h3 style="margin: 0; font-size: 16px;">选择要导入的表</h3>
                                    <p style="margin: 5px 0 0; font-size: 13px; color: var(--color-text-secondary);">
                                        共 ${dbTables?.length || 0} 个表，已选 <span id="selected-count">0</span> 个
                                    </p>
                                </div>
                                <div>
                                    <button class="btn btn-ghost btn-sm" id="btn-select-all" type="button">全选</button>
                                    <button class="btn btn-ghost btn-sm ml-5" id="btn-deselect-all" type="button">取消全选</button>
                                </div>
                            </div>
                        </div>
                        
                        <div style="flex: 1; overflow-y: auto; padding: 10px; max-height: 400px;">
                            ${dbTables && dbTables.length > 0 ? `
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px;">
                                    ${dbTables.map(table => `
                                        <label class="db-table-item" style="display: flex; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; background: var(--color-bg-primary); transition: all 0.15s;">
                                            <input type="checkbox" class="db-table-checkbox" value="${table}" style="margin-right: 10px; cursor: pointer; flex-shrink: 0;">
                                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${table}">📋 ${table}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            ` : '<div class="p-30 text-center text-secondary">该数据库没有可用的表</div>'}
                        </div>
                        
                        <div style="padding: 15px 20px; border-top: 1px solid var(--color-border); background: var(--color-bg-primary);">
                            <button class="btn btn-primary w-100" id="btn-do-import-tables" type="button">
                                📥 导入选中的表
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    /**
     * 构建数据库连接URL
     */
    buildDbConnectionUrl() {
        const type = document.getElementById('db-type')?.value || 'mysql';
        const host = document.getElementById('db-host')?.value || 'localhost';
        const port = document.getElementById('db-port')?.value || '';
        const user = document.getElementById('db-user')?.value || '';
        const pass = document.getElementById('db-pass')?.value || '';
        const dbName = document.getElementById('db-name')?.value || '';

        let url = '';
        const encodedUser = encodeURIComponent(user);
        const encodedPass = encodeURIComponent(pass);
        const userPass = encodedUser ? (encodedPass ? `${encodedUser}:${encodedPass}@` : `${encodedUser}@`) : '';

        switch (type) {
            case 'mysql':
                url = `mysql+pymysql://${userPass}${host}:${port || 3306}/${dbName}`;
                break;
            case 'postgresql':
                url = `postgresql+psycopg2://${userPass}${host}:${port || 5432}/${dbName}`;
                break;
            case 'oracle':
                url = `oracle+oracledb://${userPass}${host}:${port || 1521}/?service_name=${dbName}`;
                break;
            case 'sqlserver':
                url = `mssql+pyodbc://${userPass}${host}:${port || 1433}/${dbName}?driver=ODBC+Driver+17+for+SQL+Server`;
                break;
            case 'sqlite':
                url = `sqlite:///${dbName}`;
                break;
        }

        this.state.dbConfig = { type, host, port, user, pass, dbName, url };

        const urlInput = document.getElementById('import-url');
        if (urlInput) urlInput.value = url;
        return url;
    },

    /**
     * 更新数据库类型相关提示
     */
    updateDbTypeHints() {
        const type = document.getElementById('db-type')?.value;
        const nameLabel = document.getElementById('db-name-label');
        const nameHint = document.getElementById('db-name-hint');
        const portInput = document.getElementById('db-port');

        if (type === 'oracle') {
            if (nameLabel) nameLabel.textContent = '服务名 (Service Name)';
            if (nameHint) nameHint.style.display = 'block';
            if (portInput && !portInput.value) portInput.value = '1521';
        } else if (type === 'sqlite') {
            if (nameLabel) nameLabel.textContent = '数据库文件路径';
            if (nameHint) nameHint.style.display = 'none';
        } else {
            if (nameLabel) nameLabel.textContent = '数据库名';
            if (nameHint) nameHint.style.display = 'none';
            if (portInput && !portInput.value) {
                const defaultPorts = { mysql: 3306, postgresql: 5432, sqlserver: 1433 };
                portInput.value = defaultPorts[type] || '';
            }
        }
        this.buildDbConnectionUrl();
    },

    /**
     * 更新已选表的数量
     */
    updateSelectedCount() {
        const count = document.querySelectorAll('.db-table-checkbox:checked').length;
        const countEl = document.getElementById('selected-count');
        if (countEl) countEl.textContent = count;
    },

    /**
     * 加载文件管理中的数据文件列表
     */
    async loadFileManagerFiles() {
        try {
            this.setState({ loadingFiles: true });
            const res = await Api.get('/filemanager/browse');
            const allFiles = res.data?.files || [];
            const dataFiles = allFiles.filter(f => {
                const ext = f.name?.toLowerCase().split('.').pop();
                return ['csv', 'xlsx', 'xls'].includes(ext);
            });

            this.setState({
                fileManagerFiles: dataFiles,
                loadingFiles: false
            });
        } catch (err) {
            console.error('加载文件列表失败:', err);
            this.setState({ loadingFiles: false, fileManagerFiles: [] });
            Toast.error('加载文件列表失败');
        }
    },

    handleFileSelected(file) {
        this._selectedFile = file;
        const placeholder = document.getElementById('file-upload-placeholder');
        const preview = document.getElementById('file-upload-preview');
        const fileName = document.getElementById('selected-file-name');

        if (placeholder) placeholder.style.display = 'none';
        if (preview) preview.style.display = 'flex';
        if (fileName) fileName.textContent = file.name;

        const nameInput = document.getElementById('import-name');
        if (nameInput && !nameInput.value) {
            nameInput.value = file.name.replace(/\.[^/.]+$/, '');
        }
    },

    clearSelectedFile() {
        this._selectedFile = null;
        const placeholder = document.getElementById('file-upload-placeholder');
        const preview = document.getElementById('file-upload-preview');
        const fileInput = document.getElementById('import-file-input');

        if (placeholder) placeholder.style.display = 'flex';
        if (preview) preview.style.display = 'none';
        if (fileInput) fileInput.value = '';
    },

    /**
     * 绑定导入相关事件
     */
    bindImportEvents() {
        if (this._importEventsBound) return;
        this._importEventsBound = true;

        // 导入 - 文件上传执行
        this.delegate('click', '#btn-do-import', async () => {
            const file = this._selectedFile;
            if (!file) return Toast.error('请选择要导入的文件');

            const formData = new FormData();
            formData.append('file', file);
            try {
                Toast.info('正在上传文件...');
                const uploadRes = await AnalysisApi.uploadFile(formData);
                const fileId = uploadRes.data?.id || uploadRes.id;
                if (!fileId) throw new Error('文件上传成功但未获取到文件ID');

                const datasetName = file.name.replace(/\.[^/.]+$/, '');
                await AnalysisApi.importFile({
                    name: datasetName,
                    file_id: fileId,
                    options: {}
                });

                Toast.success('数据集导入成功');
                this.clearSelectedFile();
                this.setState({ activeTab: 'datasets' });
                this.fetchDatasets();
            } catch (err) {
                Toast.error(err.message || '导入失败');
            }
        });

        // 导入 - 切换文件源
        this.delegate('click', '[data-file-source]', (e, el) => {
            const source = el.dataset.fileSource;
            this.setState({ fileSource: source });
            if (source === 'manager' && !this.state.fileManagerFiles) {
                this.loadFileManagerFiles();
            }
        });

        // 导入 - 从文件管理导入
        this.delegate('click', '#btn-import-from-fm', async () => {
            const selected = document.querySelector('.fm-file-radio:checked');
            if (!selected) return Toast.error('请选择要导入的文件');

            const fileId = parseInt(selected.value);
            const filename = selected.dataset.filename;
            const datasetName = filename.replace(/\.[^/.]+$/, '');

            try {
                Toast.info('正在导入...');
                await AnalysisApi.importFile({
                    name: datasetName,
                    file_id: fileId,
                    source: 'filemanager',
                    options: {}
                });
                Toast.success('数据集导入成功');
                this.setState({ activeTab: 'datasets' });
                this.fetchDatasets();
            } catch (err) {
                Toast.error(err.message || '导入失败');
            }
        });

        // 导入 - 测试连通性
        this.delegate('click', '#btn-test-db', async () => {
            this.buildDbConnectionUrl();
            const url = document.getElementById('import-url').value;
            if (!url) return Toast.error('请先填写数据库连接信息');

            try {
                Toast.info('正在测试连接...');
                await AnalysisApi.importDatabase({
                    name: '_test_',
                    connection_url: url,
                    query: 'SELECT 1',
                    test_only: true
                });
                Toast.success('✅ 连接成功！数据库可正常访问');
            } catch (err) {
                Toast.error('连接失败: ' + (err.message || '请检查连接信息'));
            }
        });

        // 导入 - 连接数据库获取表
        this.delegate('click', '#btn-connect-db', async () => {
            this.buildDbConnectionUrl();
            const url = document.getElementById('import-url').value;
            if (!url) return Toast.error('请先填写数据库连接信息');

            try {
                this.setState({ dbLoading: true });
                Toast.info('正在连接数据库...');
                const res = await AnalysisApi.getDbTables({ connection_url: url });
                this.setState({
                    dbTables: res.data.tables || [],
                    dbConnected: true,
                    dbLoading: false
                });
                Toast.success(`✅ 连接成功，发现 ${res.data.tables?.length || 0} 个表`);
            } catch (err) {
                this.setState({ dbLoading: false, dbConnected: false, dbTables: null });
                Toast.error('连接失败: ' + (err.message || '请检查连接信息'));
            }
        });

        // 导入 - 全选/取消全选 (表)
        this.delegate('click', '#btn-select-all', () => {
            document.querySelectorAll('.db-table-checkbox').forEach(cb => cb.checked = true);
            this.updateSelectedCount();
        });
        this.delegate('click', '#btn-deselect-all', () => {
            document.querySelectorAll('.db-table-checkbox').forEach(cb => cb.checked = false);
            this.updateSelectedCount();
        });

        // 监听复选框变化
        this.delegate('change', '.db-table-checkbox', () => this.updateSelectedCount());

        // 导入 - 执行表导入
        this.delegate('click', '#btn-do-import-tables', async () => {
            const checkboxes = document.querySelectorAll('.db-table-checkbox:checked');
            if (checkboxes.length === 0) return Toast.error('请选择至少一个表');

            const url = document.getElementById('import-url').value;
            const tables = Array.from(checkboxes).map(cb => cb.value);

            try {
                Toast.info(`正在导入 ${tables.length} 个表...`);
                for (const tableName of tables) {
                    await AnalysisApi.importDatabase({
                        name: tableName,
                        connection_url: url,
                        query: `SELECT * FROM ${tableName}`
                    });
                }
                Toast.success(`✅ 成功导入 ${tables.length} 个表`);
                this.setState({ activeTab: 'datasets', dbTables: null, dbConnected: false });
                this.fetchDatasets();
            } catch (err) {
                Toast.error(err.message || '导入失败');
            }
        });

        // 导入类型切换
        this.delegate('click', '[data-import-type]', (e, el) => {
            this.setState({ importType: el.dataset.importType });
        });

        // 数据库类型切换
        this.delegate('change', '#db-type', () => {
            this.updateDbTypeHints();
        });

        // 数据库配置字段变化
        ['#db-host', '#db-port', '#db-user', '#db-pass', '#db-name'].forEach(selector => {
            this.delegate('input', selector, () => {
                this.buildDbConnectionUrl();
            });
        });

        // ==================== 文件上传事件 ====================

        // 点击上传区域触发文件选择
        this.delegate('click', '#file-upload-area', () => {
            const input = document.getElementById('import-file-input');
            if (input) input.click();
        });

        // 文件选择改变
        this.delegate('change', '#import-file-input', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileSelected(file);
        });

        // 清除选择的文件
        this.delegate('click', '#btn-clear-file', (e) => {
            e.stopPropagation();
            this.clearSelectedFile();
        });
    }
};

// 导出混入
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisImportMixin);
}

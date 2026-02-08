/**
 * 数据分析模块 - AnalysisPage
 * 支持数据展示、清洗、比对、建模、图表可视化
 */

const AnalysisApi = {
    getDatasets: () => Api.get('/analysis/datasets'),
    importFile: (data) => Api.post('/analysis/import/file', data),
    previewImport: (data) => Api.post('/analysis/import/preview', data),
    importBatchFiles: (data) => Api.post('/analysis/import/batch-files', data),
    uploadFile: (formData) => Api.upload('/storage/upload?category=analysis', formData),
    importDatabase: (data) => Api.post('/analysis/import/database', data),
    getDatasetData: (id, params) => Api.get(`/analysis/datasets/${id}/data`, params),
    compare: (data) => Api.post('/analysis/compare', data),
    deleteDataset: (id) => Api.delete(`/analysis/datasets/${id}`),
    updateDataset: (id, data) => Api.put(`/analysis/datasets/${id}`, data),
    // 数据库导入
    getDbTables: (data) => Api.post('/analysis/import/db-tables', data),
    // 清洗与建模
    clean: (data) => Api.post('/analysis/clean', data),
    exportCleaned: (data, format = 'csv') => Api.post(`/analysis/clean/export?format=${format}`, data, { responseType: 'blob' }),
    getSummary: (data) => Api.post('/analysis/model/summary', data),
    getCorrelation: (data) => Api.post('/analysis/model/correlation', data),
    getAggregate: (data) => Api.post('/analysis/model/aggregate', data),
    // SQL 建模
    executeSql: (data) => Api.post('/analysis/model/sql', data),
    getTables: () => Api.get('/analysis/tables'),
    getStorageFiles: (params) => Api.get('/storage/list', params),
    browseFileManager: (params) => Api.get('/filemanager/browse', params),

    // 模型管理 (ETL)
    getModels: () => Api.get('/analysis/models'),
    createModel: (data) => Api.post('/analysis/models', data),
    getModel: (id) => Api.get(`/analysis/models/${id}`),
    updateModel: (id, data) => Api.put(`/analysis/models/${id}`, data),
    deleteModel: (id) => Api.delete(`/analysis/models/${id}`),
    saveModelGraph: (id, data) => Api.post(`/analysis/models/${id}/graph`, data),

    // ETL 节点执行
    executeETLNode: (data) => Api.post('/analysis/etl/execute', data),
    previewETLNode: (data) => Api.post('/analysis/etl/preview', data),
    clearETLCache: (modelId) => Api.post('/analysis/etl/clear-cache', { model_id: modelId }),

    // BI 仪表盘
    getDashboards: () => Api.get('/analysis/dashboards'),
    createDashboard: (data) => Api.post('/analysis/dashboards', data),
    getDashboard: (id) => Api.get(`/analysis/dashboards/${id}`),
    updateDashboard: (id, data) => Api.put(`/analysis/dashboards/${id}`, data),
    deleteDashboard: (id) => Api.delete(`/analysis/dashboards/${id}`),

    // 图表管理
    getCharts: () => Api.get('/analysis/charts'),
    createChart: (data) => Api.post('/analysis/charts', data),
    getChart: (id) => Api.get(`/analysis/charts/${id}`),
    updateChart: (id, data) => Api.put(`/analysis/charts/${id}`, data),
    deleteChart: (id) => Api.delete(`/analysis/charts/${id}`),

    // 智能表格
    getSmartTables: () => Api.get('/analysis/smart-tables'),
    createSmartTable: (data) => Api.post('/analysis/smart-tables', data),
    updateSmartTable: (id, data) => Api.put(`/analysis/smart-tables/${id}`, data),
    deleteSmartTable: (id) => Api.delete(`/analysis/smart-tables/${id}`),
    getSmartTableData: (id) => Api.get(`/analysis/smart-tables/${id}/data`),
    addSmartTableRow: (id, data) => Api.post(`/analysis/smart-tables/${id}/data`, data),
    updateSmartTableRow: (rowId, data) => Api.put(`/analysis/smart-tables/data/${rowId}`, data),
    deleteSmartTableRow: (rowId) => Api.delete(`/analysis/smart-tables/data/${rowId}`),
    syncSmartTable: (id) => Api.post(`/analysis/smart-tables/${id}/sync`),



};

class AnalysisPage extends Component {
    constructor(container, props) {
        super(container);
        this.state = {
            activeTab: 'bi', // 数据集, 导入, 对比, 清洗, 建模, 图表, 仪表盘
            datasets: [],
            datasetSearch: '', // 数据集搜索
            datasetSelectedIds: [], // 数据集多选
            currentDataset: null,
            data: [],
            columns: [],
            total: 0,
            filteredTotal: undefined,
            page: 1,
            size: 20,
            sort: '',
            search: '',
            loading: false,
            // 数据工具 - 多字段筛选排序
            filters: {},
            sorts: [],
            showFilterPanel: false,
            showSortPanel: false,
            compareResult: null,
            importType: 'file', // 文件, 数据库
            fileSource: 'upload', // 上传, 文件管理
            fileManagerFiles: null,
            currentFolderId: null,
            folderPath: [], // 存储面包屑 [{id, name}]
            loadingFiles: false,
            selectedFiles: [],
            cloudSelections: [],
            // 数据库导入专用
            dbTables: null,
            dbConnected: false,
            dbLoading: false,
            dbConfig: {
                type: 'mysql',
                host: '',
                port: '',
                user: '',
                pass: '',
                dbName: '',
                url: ''
            },
            // 清洗建模专用
            cleaningOp: 'drop_missing',
            summaryData: null,
            corrData: null,
            aggData: null,
            // 图表专用
            chartType: 'bar', // 柱状图, 饼图, 折线图, 散点图
            chartDatasetId: '', // 保存已选数据集
            chartConfig: {
                xField: '',
                yField: '',
                groupField: '',
                aggregationType: 'none' // 无, 计数, 求和, 平均, 最大, 最小
            },
            hasGeneratedChart: false, // 是否已经生成了图表
            cleaningTasks: [], // 多步骤清洗任务
            // 比对专用
            compareSourceId: '',
            compareTargetId: '',
            compareSourceColumns: [],
            compareTargetColumns: [],
            compareSelectedKeys: [],
            compareSourcePreview: null,
            compareTargetPreview: null,
            activeCompareTab: 'same',
            // SQL 专用
            sqlMode: 'editor', // 编辑器, 可视化
            sqlQuery: '',
            sqlResult: null,
            sqlTables: [],
            sqlExecuting: false,
            builderTable: '',
            builderColumns: [],
            builderSelectedFields: [],
            builderFilterField: '',
            builderFilterOp: '=',
            builderFilterVal: '',
            builderFilters: [], // [{ field, op, val, join: 'AND' }]
            builderFieldAliases: {}, // { fieldName: alias }
            builderSortField: '',
            builderSortDir: 'ASC',
            builderAggregate: '',
            builderLimit: 1000,
            builderDistinct: false
        };
        this.chartInstance = null;

        // 初始化数据工具 Mixin
        this._initDataToolsMixin();
    }

    // 初始化数据工具混入
    _initDataToolsMixin() {
        const self = this;
        const mixin = DataTools.createMixin({
            prefix: 'dt',
            onApply: (filters, sorts) => {
                // 将sorts数组转换为sort字符串格式以兼容现有API
                const sortStr = DataTools.sortsToString(sorts);
                self.setState({
                    filters,
                    sorts,
                    sort: sortStr,
                    page: 1
                });
                self.fetchDatasetData();
            },
            getColumns: () => self.state.columns.map(c => ({ field: c, title: c })),
            getState: () => ({
                filters: self.state.filters,
                sorts: self.state.sorts,
                showFilterPanel: self.state.showFilterPanel,
                showSortPanel: self.state.showSortPanel
            }),
            setState: (newState) => self.setState(newState)
        });
        // 将mixin方法混入到当前实例
        Object.assign(this, mixin);
    }

    afterMount() {
        // 添加全局错误处理
        this._setupErrorHandling();

        this.fetchDatasets();
        this.bindEvents();
        // 绑定数据工具事件
        if (this.bindDataToolsEvents) this.bindDataToolsEvents();
    }

    /**
     * 设置全局错误处理
     */
    _setupErrorHandling() {
        // 捕获未处理的 Promise 错误
        this.addWindowEvent('unhandledrejection', (event) => {
            // 只在分析页面时处理
            if (this.state && this.state.activeTab) {
                // 显示错误信息
                if (event.reason && event.reason.message) {
                    Toast.error('操作失败: ' + event.reason.message);
                } else {
                    Toast.error('操作失败，请稍后重试');
                }
                event.preventDefault(); // 阻止默认的错误输出
            }
        });
    }

    afterUpdate() {
        // 当切换到 modeling Tab 时，初始化画布拖放
        if (this.state.activeTab === 'modeling') {
            if (this.bindModelingEvents) this.bindModelingEvents();
            // 必须每次更新都尝试初始化，因为 DOM 可能已被重绘
            this.initETLCanvasDrop();
        }

        if (this.state.activeTab === 'charts') {
            // 绑定图表事件（如果还未绑定）
            if (this.bindChartEvents && !this._chartEventsBound) {
                this.bindChartEvents();
            }

            // 每次更新后都初始化图表配置交互（因为 DOM 可能已重新渲染）
            this.setTimeout(() => {
                const configPanel = document.querySelector('.chart-config-panel');
                if (configPanel) {
                    ChartConfigUI.initInteractions(configPanel);
                }
            }, 0);

            // 如果显示 ChartHub，确保列表已更新
            if (this.state.showChartHub) {
                const container = document.getElementById('saved-charts-list');
                if (container) {
                    // 检查是否还在显示加载状态
                    const loadingText = container.textContent || '';
                    if (loadingText.includes('正在获取同步云端资产') || loadingText.includes('正在获取')) {
                        // 如果还在显示加载状态，触发更新
                        this.setTimeout(() => {
                            if (this.updateSavedChartsList) {
                                this.updateSavedChartsList();
                            }
                        }, 50);
                    }
                } else {
                    this.setTimeout(() => {
                        const container = document.getElementById('saved-charts-list');
                        if (container && this.updateSavedChartsList) {
                            this.updateSavedChartsList();
                        }
                    }, 200);
                }
            }

            if (this.state.chartDatasetId) {
                // 如果切换了图表类型或初始进入，确保字段列表被填充
                const xSelect = document.getElementById('chart-x-field');
                if (xSelect && xSelect.options.length <= 1) {
                    this.updateFieldOptions(this.state.chartDatasetId);
                }
            }
        }
        // 绑定导入和清洗事件
        if (this.state.activeTab === 'import') {
            if (this.bindImportEvents) this.bindImportEvents();
        }
        if (this.state.activeTab === 'cleaning') {
            if (this.bindCleaningEvents) this.bindCleaningEvents();
        }
        if (this.state.activeTab === 'smart-table') {
            if (!this.state.smartTables) this.fetchSmartTables();
        }
    }

    destroy() {
        // 销毁子组件
        const biContainer = document.getElementById('bi-container');
        if (biContainer && biContainer._biInstance) {
            biContainer._biInstance.destroy();
            biContainer._biInstance = null;
        }

        // 销毁图表实例
        if (this.chartInstance) {
            if (typeof ChartHelper !== 'undefined') {
                ChartHelper.disposeChart(this.chartInstance);
            } else if (this.chartInstance.dispose) {
                this.chartInstance.dispose();
            }
            this.chartInstance = null;
        }

        if (this.viewerChartInstance) {
            if (typeof ChartHelper !== 'undefined') {
                ChartHelper.disposeChart(this.viewerChartInstance);
            } else if (this.viewerChartInstance.dispose) {
                this.viewerChartInstance.dispose();
            }
            this.viewerChartInstance = null;
        }

        super.destroy();
    }

    async fetchDatasets() {
        if (this.state.loadingDatasets) return;
        this.state.loadingDatasets = true;
        try {
            const res = await AnalysisApi.getDatasets();
            this.setState({
                datasets: res.data || [],
                loadingDatasets: false
            });
        } catch (e) {
            this.state.loadingDatasets = false;
            // 如果是401错误，API层已经处理了跳转，不需要显示错误
            if (e.message && !e.message.includes('登录')) {
                Toast.error('获取数据集失败');
            }
        }
    }

    async fetchDatasetData(id = this.state.currentDataset?.id) {
        if (!id) return;
        this.setState({ loading: true });
        try {
            // 构建请求参数
            const params = {
                page: this.state.page,
                size: this.state.size,
                sort: this.state.sort,
                search: this.state.search || ''
            };

            // 添加多字段排序参数
            if (this.state.sorts && this.state.sorts.length > 0) {
                params.sorts = JSON.stringify(this.state.sorts);
            }

            // 添加筛选参数（过滤无效条件）
            if (this.state.filters && Object.keys(this.state.filters).length > 0) {
                const validFilters = {};
                for (const [field, cond] of Object.entries(this.state.filters)) {
                    if (!field || field.startsWith('_new_')) continue;
                    validFilters[field] = cond;
                }
                if (Object.keys(validFilters).length > 0) {
                    params.filters = JSON.stringify(validFilters);
                }
            }

            const res = await AnalysisApi.getDatasetData(id, params);
            this.setState({
                data: res.data.items,
                columns: res.data.columns,
                total: res.data.total,
                filteredTotal: res.data.filtered_total,
                loading: false
            });
        } catch (e) {
            this.setState({ loading: false });
            Toast.error('获取数据详情失败');
        }
    }

    // 获取用于图表的全部数据（最多1000条）
    async fetchChartData(datasetId) {
        if (!datasetId) return [];
        try {
            const res = await AnalysisApi.getDatasetData(datasetId, {
                page: 1,
                size: 1000
            });
            return res.data?.items || [];
        } catch (e) {
            Toast.error('获取图表数据失败');
            return [];
        }
    }

    bindEvents() {
        // Tab 切换
        this.delegate('click', '.analysis-menu-item', (e, el) => {
            const tab = el.dataset.tab;
            this.setState({ activeTab: tab, currentDataset: null });

            if (tab === 'modeling' && this.fetchModels) {
                this.fetchModels();
            }
        });

        //选择数据集查看
        this.delegate('click', '.btn-view-dataset', (e, el) => {
            const id = parseInt(el.dataset.id);
            const ds = this.state.datasets.find(d => d.id === id);
            this.setState({ activeTab: 'viewer', currentDataset: ds, page: 1 });
            this.fetchDatasetData(id);
        });

        // 排序点击（支持多字段排序）
        this.delegate('click', '.sortable-th', (e, el) => {
            const field = el.dataset.field;
            let currentSort = this.state.sort || '';

            // 解析当前排序状态
            const sortMap = {};
            if (currentSort) {
                currentSort.split(',').forEach(part => {
                    const [f, o] = part.split(':');
                    sortMap[f] = o;
                });
            }

            // Shift 键：多字段排序
            if (e.shiftKey) {
                if (sortMap[field]) {
                    // 已存在则切换方向
                    sortMap[field] = sortMap[field] === 'asc' ? 'desc' : 'asc';
                } else {
                    // 添加排序字段
                    sortMap[field] = 'asc';
                }
            } else {
                // 普通点击：单字段排序
                const currentOrder = sortMap[field];
                Object.keys(sortMap).forEach(k => delete sortMap[k]);
                sortMap[field] = currentOrder === 'asc' ? 'desc' : 'asc';
            }

            // 构建排序字符串
            const newSort = Object.entries(sortMap).map(([f, o]) => `${f}:${o}`).join(',');

            this.setState({ sort: newSort, page: 1 });
            this.fetchDatasetData();
        });

        // 分页
        this.delegate('click', '.pagination-btn', (e, el) => {
            if (el.disabled) return;
            const newPage = parseInt(el.dataset.page);
            this.setState({ page: newPage });
            this.fetchDatasetData();
        });

        // 搜索按钮
        this.delegate('click', '#btn-viewer-search', () => {
            const searchVal = document.getElementById('viewer-search')?.value || '';
            this.setState({ search: searchVal, page: 1 });
            this.fetchDatasetData();
        });

        // 搜索框回车
        this.delegate('keypress', '#viewer-search', (e) => {
            if (e.key === 'Enter') {
                const searchVal = e.target.value || '';
                this.setState({ search: searchVal, page: 1 });
                this.fetchDatasetData();
            }
        });

        // 清除搜索
        this.delegate('click', '#btn-viewer-clear-search', () => {
            this.setState({ search: '', page: 1 });
            this.fetchDatasetData();
        });

        // 清除排序
        this.delegate('click', '#btn-clear-sort', () => {
            this.setState({ sort: '', page: 1 });
            this.fetchDatasetData();
        });

        // 每页条数变更
        this.delegate('change', '#viewer-page-size', (e) => {
            const newSize = parseInt(e.target.value);
            this.setState({ size: newSize, page: 1 });
            this.fetchDatasetData();
        });

        // 刷新数据集列表
        this.delegate('click', '#btn-refresh-datasets', async () => {
            Toast.info('正在刷新...');
            await this.fetchDatasets();
            Toast.success('刷新完成');
        });

        // 删除数据集
        this.delegate('click', '.btn-delete-dataset', async (e, el) => {
            if (!confirm('确定要删除这个数据集吗？')) return;
            const id = el.dataset.id;
            try {
                await AnalysisApi.deleteDataset(id);
                Toast.success('删除成功');
                this.fetchDatasets();
            } catch (e) {
                Toast.error('删除失败');
            }
        });



        // 返回列表
        this.delegate('click', '.btn-back-to-list', () => {
            this.setState({ activeTab: 'datasets', currentDataset: null });
        });

        // 建模功能未上线
        this.delegate('click', '.btn-start-modeling', () => {
            Toast.info('建模暂未上线');
        });

        // 图片预览
        this.delegate('click', '.cell-image', (e, el) => {
            window.open(el.src);
        });

        // --- 数据集管理事件增强 ---

        // 搜索框 (按钮触发)
        this.delegate('click', '#btn-dataset-search', (e) => {
            e.preventDefault();
            const val = this.$('#dataset-list-search')?.value.trim() || '';
            this.setState({ datasetSearch: val });
        });

        // 搜索框 (回车触发)
        this.delegate('keydown', '#dataset-list-search', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim();
                this.setState({ datasetSearch: val });
            }
        });

        // 全选/取消全选
        this.delegate('change', '#check-all-datasets', (e) => {
            const checked = e.target.checked;
            const { datasets, datasetSearch } = this.state;
            const list = datasets.filter(d => !datasetSearch || d.name.toLowerCase().includes(datasetSearch.toLowerCase()));
            this.setState({
                datasetSelectedIds: checked ? list.map(d => d.id) : []
            });
        });

        // 单选
        this.delegate('change', '.check-dataset-item', (e, el) => {
            const id = parseInt(el.value);
            const { datasetSelectedIds } = this.state;
            if (el.checked) {
                this.setState({ datasetSelectedIds: [...datasetSelectedIds, id] });
            } else {
                this.setState({ datasetSelectedIds: datasetSelectedIds.filter(idx => idx !== id) });
            }
        });

        // 批量删除
        this.delegate('click', '#btn-batch-delete-datasets', async () => {
            const { datasetSelectedIds } = this.state;
            if (datasetSelectedIds.length === 0) return;
            if (!confirm(`确定要删除选中的 ${datasetSelectedIds.length} 个数据集吗？\n此操作不可恢复。`)) return;

            try {
                Toast.info('正在删除...');
                for (const id of datasetSelectedIds) {
                    await AnalysisApi.deleteDataset(id);
                }
                Toast.success('批量删除成功');
                this.setState({ datasetSelectedIds: [] });
                this.fetchDatasets();
            } catch (e) {
                Toast.error('部分删除失败: ' + e.message);
                this.fetchDatasets();
            }
        });

        // 编辑数据集
        this.delegate('click', '.btn-edit-dataset', (e, el) => {
            const id = parseInt(el.dataset.id);
            const ds = this.state.datasets.find(d => d.id === id);
            if (!ds) return;

            const content = `
                <div class="form-group mb-15">
                    <label class="required">数据集名称</label>
                    <input type="text" class="form-control" id="edit-ds-name" value="${Utils.escapeHtml(ds.name)}">
                </div>
                <div class="form-group mb-15">
                    <label>描述 / 备注</label>
                    <textarea class="form-control" id="edit-ds-desc" rows="3" placeholder="添加备注...">${Utils.escapeHtml(ds.config?.description || '')}</textarea>
                </div>
            `;

            new Modal({
                title: '编辑数据集信息',
                content: content,
                onConfirm: async () => {
                    const name = document.getElementById('edit-ds-name').value.trim();
                    const desc = document.getElementById('edit-ds-desc').value.trim();
                    if (!name) {
                        Toast.error('名称不能为空');
                        return false;
                    }

                    try {
                        await AnalysisApi.updateDataset(id, { name, description: desc });
                        Toast.success('更新成功');
                        this.fetchDatasets();
                        return true;
                    } catch (e) {
                        Toast.error('更新失败: ' + e.message);
                        return false;
                    }
                }
            }).show();
        });

        // 调用各模块的事件绑定
        if (this.bindModelingEvents) this.bindModelingEvents();
        if (this.bindChartEvents) this.bindChartEvents();
        if (this.bindSqlEvents) this.bindSqlEvents();
        if (this.bindCompareEvents) this.bindCompareEvents();
        if (this.bindSmartTableEvents) this.bindSmartTableEvents();


        // ==================== 建模事件 (部分补充) ====================
        this.delegate('dragstart', '.etl-operator', (e, el) => {
            e.dataTransfer.setData('operator_type', el.dataset.type);
            e.dataTransfer.setData('operator_label', el.dataset.label);
        });
    }



    render() {
        // 确保为图表和建模加载数据集
        if (['charts', 'modeling'].includes(this.state.activeTab) && this.state.datasets.length === 0 && !this.state.loadingDatasets) {
            this.fetchDatasets();
        }
        return `
            <div class="analysis-container">
                <div class="analysis-sidebar">
                    <div class="analysis-menu">
                        <div class="analysis-menu-header" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; font-size: 14px;">数据分析</span>
                            ${window.ModuleHelp ? ModuleHelp.createHelpButton('analysis', '数据分析') : ''}
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'bi' ? 'active' : ''}" data-tab="bi">
                            <span><i class="ri-dashboard-line"></i></span> 数据大屏
                        </div>
                        <div class="analysis-menu-divider"></div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'smart-table' ? 'active' : ''}" data-tab="smart-table">
                            <span><i class="ri-table-line"></i></span> 智能表格
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'datasets' ? 'active' : ''}" data-tab="datasets">
                            <span><i class="ri-database-2-line"></i></span> 数据管理
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'import' ? 'active' : ''}" data-tab="import">
                            <span><i class="ri-import-line"></i></span> 数据导入
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'cleaning' ? 'active' : ''}" data-tab="cleaning">
                            <span><i class="ri-magic-line"></i></span> 数据清洗
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
                            <span><i class="ri-bar-chart-2-line"></i></span> 图表分析
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'compare' ? 'active' : ''}" data-tab="compare">
                            <span><i class="ri-file-search-line"></i></span> 数据比对
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'sql' ? 'active' : ''}" data-tab="sql">
                            <span><i class="ri-terminal-window-line"></i></span> SQL查询
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'modeling' ? 'active' : ''}" data-tab="modeling">
                            <span><i class="ri-flow-chart"></i></span> 数据建模
                        </div>

                    </div>
                </div>
                <div class="analysis-content">
                    ${this.renderContent()}
                </div>
            </div>
        `;
    }

    renderContent() {
        switch (this.state.activeTab) {
            case 'datasets': return this.renderDatasets();
            case 'import': return this.renderImport();
            case 'viewer': return this.renderViewer();
            case 'compare': return this.renderCompare();
            case 'cleaning': return this.renderCleaning();
            case 'modeling': return this.renderModeling();
            case 'charts': return this.renderCharts();
            case 'sql': return this.renderSqlQuery();
            case 'bi': return this.renderBI();
            case 'smart-table': return this.renderSmartTable();

            default: return `<div class="p-20">功能开发中...</div>`;
        }
    }

    // BI 仪表盘渲染（使用独立组件）
    renderBI() {
        // 使用容器方式渲染 BI 组件
        this.setTimeout(() => {
            const container = document.getElementById('bi-container');
            if (container && !container._biInstance) {
                container._biInstance = new AnalysisBIPage(container);
                container._biInstance.mount();
            }
        }, 0);

        return `<div id="bi-container" class="bi-wrapper"></div>`;
    }

    renderDatasets() {
        const { datasets, datasetSearch, datasetSelectedIds } = this.state;

        // 过滤
        const list = datasets.filter(d => {
            if (!datasetSearch) return true;
            const term = datasetSearch.toLowerCase();
            return d.name.toLowerCase().includes(term) ||
                (d.config?.description || '').toLowerCase().includes(term);
        });

        // 全选状态
        const isAllSelected = list.length > 0 && list.every(d => datasetSelectedIds.includes(d.id));
        const isIndeterminate = list.some(d => datasetSelectedIds.includes(d.id)) && !isAllSelected;

        return `
            <div class="p-20" style="height: calc(100vh - 120px); overflow: auto;">
                <div class="flex-between mb-20 gap-15">
                    <div class="flex align-center gap-15" style="flex: 1;">
                        <h2 class="m-0">数据管理</h2>
                        <div class="search-group" style="width: 360px;">
                            <div class="search-box">
                                <i class="ri-search-line"></i>
                                <input type="text" id="dataset-list-search" placeholder="搜索名称或描述..." value="${Utils.escapeHtml(datasetSearch || '')}">
                            </div>
                            <button class="btn btn-primary" id="btn-dataset-search">
                                <i class="ri-search-line"></i> 查找
                            </button>
                        </div>
                    </div>
                    <div class="flex gap-10">
                        ${datasetSelectedIds.length > 0 ? `
                            <button class="btn btn-danger btn-sm" id="btn-batch-delete-datasets">
                                <i class="ri-delete-bin-line"></i> 删除选中 (${datasetSelectedIds.length})
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-primary btn-sm" id="btn-refresh-datasets">
                            <i class="ri-refresh-line"></i> 刷新
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=import]').click()">
                            <i class="ri-add-line"></i> 新建导入
                        </button>
                    </div>
                </div>

                <div class="premium-table-container">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th width="40" class="text-center">
                                    <input type="checkbox" id="check-all-datasets" 
                                        ${isAllSelected ? 'checked' : ''} 
                                        ${list.length === 0 ? 'disabled' : ''}>
                                </th>
                                <th>名称 / 描述</th>
                                <th>来源</th>
                                <th>数据量</th>
                                <th>创建时间</th>
                                <th width="180">操作</th>
                            </tr>
                        </thead>
                        <tbody id="dataset-list-body">
                            ${this.renderDatasetRows(list)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderDatasetRows(list) {
        const { datasetSelectedIds, datasetSearch } = this.state;
        if (list.length === 0) {
            return `
                <tr>
                    <td colspan="6" class="text-center py-50">
                        <div class="text-secondary">
                            <div style="font-size: 32px; margin-bottom: 10px;"><i class="ri-inbox-line"></i></div>
                            ${datasetSearch ? '未找到匹配的数据集' : '暂无数据集，请先导入'}
                        </div>
                    </td>
                </tr>
            `;
        }

        return list.map(d => `
            <tr class="${datasetSelectedIds.includes(d.id) ? 'active' : ''}">
                <td class="text-center">
                    <input type="checkbox" class="check-dataset-item" 
                        value="${d.id}" ${datasetSelectedIds.includes(d.id) ? 'checked' : ''}>
                </td>
                <td>
                    <div class="flex-column">
                        <div class="font-600 text-truncate" style="max-width: 300px;" title="${Utils.escapeHtml(d.name)}">${Utils.escapeHtml(d.name)}</div>
                        ${d.config?.description ? `
                            <div class="text-secondary text-xs text-truncate" style="max-width: 300px;" title="${Utils.escapeHtml(d.config.description)}">
                                ${Utils.escapeHtml(d.config.description)}
                            </div>
                        ` : '<div class="text-tertiary text-xs">暂无描述</div>'}
                    </div>
                </td>
                <td>
                    <span class="badge ${d.source_type === 'file' ? 'bg-secondary' : 'bg-info'}">
                        ${d.source_type === 'file' ? '<i class="ri-folder-open-line"></i> 文件' : '<i class="ri-database-2-line"></i> 数据库'}
                    </span>
                </td>
                <td>
                    <span class="font-mono text-sm">${Utils.formatNumber(d.row_count)}</span> 行
                </td>
                <td class="text-secondary text-sm">
                    ${Utils.formatDate(d.created_at)}
                </td>
                <td>
                    <div class="flex gap-10">
                        <button class="btn btn-sm btn-ghost btn-view-dataset" data-id="${d.id}" title="查看数据">
                            <i class="ri-eye-line"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost btn-edit-dataset" data-id="${d.id}" title="编辑信息">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost text-danger btn-delete-dataset" data-id="${d.id}" title="删除">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderViewer() {
        const { currentDataset, data, columns, total, filteredTotal, page, size, loading, search, sort,
            filters, sorts, showFilterPanel, showSortPanel } = this.state;
        const displayTotal = filteredTotal !== undefined ? filteredTotal : total;
        const totalPages = Math.ceil(displayTotal / size);

        // 计算筛选和排序数量
        const filterCount = filters ? Object.keys(filters).filter(k => !k.startsWith('_new_')).length : 0;
        const sortCount = sorts ? sorts.filter(s => s.field).length : 0;

        // 解析当前排序状态（兼容旧逻辑）
        const sortFields = {};
        if (sort) {
            sort.split(',').forEach((part, idx) => {
                const [field, order] = part.split(':');
                if (field) sortFields[field] = { order, priority: idx + 1 };
            });
        }

        // 准备列信息供筛选排序面板使用
        const columnsForPanel = columns.map(c => ({ field: c, title: c }));

        return `
            <div class="flex-column h-100">
                <div class="p-20 border-bottom bg-primary">
                    <div class="flex-between mb-15">
                        <div class="flex-center">
                            <button class="btn-icon mr-10 btn-back-to-list"><i class="ri-arrow-left-line"></i></button>
                            <strong style="font-size: 16px;">${Utils.escapeHtml(currentDataset?.name || '')}</strong>
                            <span class="text-secondary ml-15" style="font-size: 13px;">
                                ${search || filterCount > 0 ? `筛选结果: ${displayTotal} / ${total} 条` : `共 ${total} 条数据`}
                            </span>
                        </div>
                    </div>
                    
                    <!-- 搜索和工具栏 -->
                    <div class="flex-between gap-15">
                        <div class="flex-center gap-10" style="flex: 1;">
                            <div style="position: relative; flex: 1; max-width: 400px;">
                                <input type="text" id="viewer-search" class="form-control" 
                                    placeholder="搜索关键词..." 
                                    value="${Utils.escapeHtml(search || '')}"
                                    style="padding-left: 35px; height: 36px;">
                                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-secondary);"><i class="ri-search-line"></i></span>
                            </div>
                            <button class="btn btn-secondary btn-sm" id="btn-viewer-search" style="height: 36px;">搜索</button>
                            ${search ? '<button class="btn btn-ghost btn-sm" id="btn-viewer-clear-search" style="height: 36px;">清除</button>' : ''}
                        </div>
                        <div class="flex-center gap-10">
                            <!-- 筛选和排序按钮 -->
                            ${DataTools.renderToolbarButtons({ filterCount, sortCount, prefix: 'dt' })}
                            <span class="text-secondary" style="font-size: 12px;">每页</span>
                            <select id="viewer-page-size" class="form-control form-control-sm" style="width: 70px; height: 32px;">
                                <option value="20" ${size === 20 ? 'selected' : ''}>20</option>
                                <option value="50" ${size === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${size === 100 ? 'selected' : ''}>100</option>
                            </select>
                            <span class="text-secondary" style="font-size: 12px;">条</span>
                        </div>
                    </div>
                    
                    ${Object.keys(sortFields).length > 0 ? `
                        <div class="mt-10" style="font-size: 12px; color: var(--color-text-secondary);">
                            排序: ${Object.entries(sortFields).map(([field, info]) =>
            `<span class="badge bg-secondary mr-5">${Utils.escapeHtml(field)} ${info.order === 'asc' ? '↑' : '↓'}</span>`
        ).join('')}
                            <button class="btn btn-ghost btn-xs ml-10" id="btn-clear-sort">清除排序</button>
                        </div>
                    ` : ''}
                </div>
                
                <!-- 筛选面板 -->
                ${DataTools.renderFilterPanel({
            show: showFilterPanel,
            columns: columnsForPanel,
            filters: filters || {},
            prefix: 'dt'
        })}
                
                <!-- 排序面板 -->
                ${DataTools.renderSortPanel({
            show: showSortPanel,
            columns: columnsForPanel,
            sorts: sorts || [],
            prefix: 'dt'
        })}
                
                <div class="data-table-container" style="flex: 1; overflow: auto;">
                    ${loading ? '<div class="text-center p-20">数据加载中...</div>' : `
                        <table class="premium-table">
                            <thead>
                                <tr>
                                    ${columns.map(c => {
            const sortInfo = sortFields[c];
            const sortIndicator = sortInfo ? (sortInfo.order === 'asc' ? '▲' : '▼') : '';
            const priorityBadge = sortInfo && Object.keys(sortFields).length > 1 ? `<sup>${sortInfo.priority}</sup>` : '';
            return `
                                            <th class="sortable-th" data-field="${Utils.escapeHtml(c)}" title="点击排序，Shift+点击多字段排序">
                                                ${Utils.escapeHtml(c)} ${sortIndicator}${priorityBadge}
                                            </th>
                                        `;
        }).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map(row => `
                                    <tr>
                                        ${columns.map(c => {
            const val = row[c];
            // 增强图片检测逻辑
            if (typeof val === 'string') {
                const isImageUrl = (val.startsWith('http') || val.startsWith('/api/') || val.startsWith('data:image'))
                    && (val.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i) || val.startsWith('data:image'));
                if (isImageUrl) {
                    const escapedVal = Utils.escapeHtml(val);
                    const safeValForJs = encodeURIComponent(val);
                    return `<td><img src="${escapedVal}" class="cell-image" style="max-width: 80px; max-height: 60px; border-radius: 4px; cursor: pointer;" onclick="window.open(decodeURIComponent('${safeValForJs.replace(/'/g, '%27')}'), '_blank')"></td>`;
                }
            }
            const displayVal = val !== null && val !== undefined ? val : '';
            return `<td>${Utils.escapeHtml(String(displayVal))}</td>`;
        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
                
                <div class="p-15 border-top bg-primary flex-between">
                    <div class="dt-data-info">
                        <span class="text-secondary" style="font-size: 13px;">
                            ${displayTotal > 0 ? `第 ${(page - 1) * size + 1} - ${Math.min(page * size, displayTotal)} 条，共 ${displayTotal} 条` : '暂无数据'}
                        </span>
                        ${filterCount > 0 ? '<span class="dt-filter-badge">已筛选</span>' : ''}
                    </div>
                    ${totalPages > 1 ? `
                    <div class="flex-center gap-5">
                        <button class="btn btn-ghost btn-sm pagination-btn" data-page="1" ${page <= 1 ? 'disabled' : ''}>首页</button>
                        <button class="btn btn-ghost btn-sm pagination-btn" data-page="${parseInt(page) - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
                        <span class="mx-10" style="font-size: 13px;">第 ${page} / ${totalPages} 页</span>
                        <button class="btn btn-ghost btn-sm pagination-btn" data-page="${parseInt(page) + 1}" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
                        <button class="btn btn-ghost btn-sm pagination-btn" data-page="${totalPages}" ${page >= totalPages ? 'disabled' : ''}>末页</button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // 比对相关方法在 analysis_compare.js 中定义（通过 Mixin 混入）
}

window.AnalysisPage = AnalysisPage;




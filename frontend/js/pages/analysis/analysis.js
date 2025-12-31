/**
 * 数据分析模块 - AnalysisPage
 * 支持数据展示、清洗、比对、建模、图表可视化
 */

const AnalysisApi = {
    getDatasets: () => Api.get('/analysis/datasets'),
    importFile: (data) => Api.post('/analysis/import/file', data),
    uploadFile: (formData) => Api.upload('/storage/upload?category=analysis', formData),
    importDatabase: (data) => Api.post('/analysis/import/database', data),
    getDatasetData: (id, params) => Api.get(`/analysis/datasets/${id}/data`, params),
    compare: (data) => Api.post('/analysis/compare', data),
    deleteDataset: (id) => Api.delete(`/analysis/datasets/${id}`),
    // 数据库导入
    getDbTables: (data) => Api.post('/analysis/import/db-tables', data),
    // 清洗与建模
    clean: (data) => Api.post('/analysis/clean', data),
    exportCleaned: (data) => Api.post('/analysis/clean/export', data, { responseType: 'blob' }),
    getSummary: (data) => Api.post('/analysis/model/summary', data),
    getCorrelation: (data) => Api.post('/analysis/model/correlation', data),
    getAggregate: (data) => Api.post('/analysis/model/aggregate', data),
    // SQL 建模
    executeSql: (data) => Api.post('/analysis/model/sql', data),
    getTables: () => Api.get('/analysis/tables'),

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

    // 智能报告
    getSmartReports: () => Api.get('/analysis/smart-reports'),
    createSmartReport: (data) => Api.post('/analysis/smart-reports', data),
    updateSmartReport: (id, data) => Api.put(`/analysis/smart-reports/${id}`, data),
    deleteSmartReport: (id) => Api.delete(`/analysis/smart-reports/${id}`),
    generateSmartReport: (id) => Api.get(`/analysis/smart-reports/${id}/generate`),
    getSmartReportRecords: (reportId) => Api.get(`/analysis/smart-reports/${reportId}/records`),
    saveSmartReportRecord: (reportId, data) => Api.post(`/analysis/smart-reports/${reportId}/records`, data),
    deleteSmartReportRecord: (recordId) => Api.delete(`/analysis/smart-reports/records/${recordId}`)

};

class AnalysisPage extends Component {
    constructor(container, props) {
        super(container);
        this.state = {
            activeTab: 'bi', // datasets, import, compare, cleaning, modeling, charts, bi
            datasets: [],
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
            importType: 'file', // file, database
            fileSource: 'upload', // upload, manager
            fileManagerFiles: null,
            loadingFiles: false,
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
            chartType: 'bar', // bar, pie, line, scatter
            chartDatasetId: '', // 保存已选数据集
            chartConfig: {
                xField: '',
                yField: '',
                groupField: '',
                aggregateType: 'count' // count, sum, avg, max, min
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
            sqlMode: 'editor', // editor, visual
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
        this.fetchDatasets();
        this.bindEvents();
        // 绑定数据工具事件
        if (this.bindDataToolsEvents) this.bindDataToolsEvents();
    }

    afterUpdate() {
        // 当切换到 modeling Tab 时，初始化画布拖放
        if (this.state.activeTab === 'modeling') {
            if (this.bindModelingEvents) this.bindModelingEvents();
            // 必须每次更新都尝试初始化，因为 DOM 可能已被重绘
            this.initETLCanvasDrop();
        }
        if (this.state.activeTab === 'sql') {
            if (!this.state.sqlTablesLoaded) {
                this.initSqlQueryPage();
                this.setState({ sqlTablesLoaded: true });
            }
        }
        if (this.state.activeTab === 'compare') {
            // Compare events are bound once in bindEvents
        }
        if (this.state.activeTab === 'charts') {
            // 绑定图表事件（如果还未绑定）
            if (this.bindChartEvents && !this._chartEventsBound) {
                this.bindChartEvents();
            }
            
            // 如果显示 ChartHub，确保列表已更新
            if (this.state.showChartHub) {
                const container = document.getElementById('saved-charts-list');
                if (container) {
                    // 检查是否还在显示加载状态
                    const loadingText = container.textContent || '';
                    if (loadingText.includes('正在获取同步云端资产') || loadingText.includes('正在获取')) {
                        // 如果还在显示加载状态，触发更新
                        setTimeout(() => {
                            if (this.updateSavedChartsList) {
                                this.updateSavedChartsList();
                            }
                        }, 50);
                    }
                } else {
                    // 容器不存在，等待一下再尝试
                    setTimeout(() => {
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
        if (this.state.activeTab === 'smart-report') {
            if (!this.state.smartReports) this.fetchSmartReports();
        }
    }

    async fetchDatasets() {
        try {
            const res = await AnalysisApi.getDatasets();
            this.setState({ datasets: res.data || [] });
        } catch (e) {
            Toast.error('获取数据集失败');
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
                    // 新增排序字段
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

        // 提示建模未上线
        this.delegate('click', '.btn-start-modeling', () => {
            Toast.info('建模暂未上线');
        });

        // 图片预览
        this.delegate('click', '.cell-image', (e, el) => {
            window.open(el.src);
        });

        // 调用各模块的事件绑定
        if (this.bindModelingEvents) this.bindModelingEvents();
        if (this.bindChartEvents) this.bindChartEvents();
        if (this.bindSqlEvents) this.bindSqlEvents();
        if (this.bindCompareEvents) this.bindCompareEvents();
        if (this.bindSmartTableEvents) this.bindSmartTableEvents();
        if (this.bindSmartReportEvents) this.bindSmartReportEvents();

        // ==================== 建模事件 (部分补充) ====================
        this.delegate('dragstart', '.etl-operator', (e, el) => {
            e.dataTransfer.setData('operator_type', el.dataset.type);
            e.dataTransfer.setData('operator_label', el.dataset.label);
        });
    }



    render() {
        // Ensure datasets are loaded for reports and charts
        if (['smart-report', 'charts', 'modeling'].includes(this.state.activeTab) && this.state.datasets.length === 0 && !this.state.loadingDatasets) {
            this.fetchDatasets();
        }
        return `
            <div class="analysis-container">
                <div class="analysis-sidebar">
                    <div class="analysis-menu">
                        <div class="analysis-menu-item ${this.state.activeTab === 'bi' ? 'active' : ''}" data-tab="bi">
                            <span>🎯</span> 数据大屏
                        </div>
                        <div class="analysis-menu-divider"></div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'smart-table' ? 'active' : ''}" data-tab="smart-table">
                            <span>📋</span> 智能表格
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'datasets' ? 'active' : ''}" data-tab="datasets">
                            <span>📦</span> 数据管理
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'import' ? 'active' : ''}" data-tab="import">
                            <span>📥</span> 数据导入
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'cleaning' ? 'active' : ''}" data-tab="cleaning">
                            <span>🧼</span> 数据清洗
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
                            <span>📊</span> 图表分析
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'compare' ? 'active' : ''}" data-tab="compare">
                            <span>🔍</span> 数据比对
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'sql' ? 'active' : ''}" data-tab="sql">
                            <span>💾</span> SQL查询
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'modeling' ? 'active' : ''}" data-tab="modeling">
                            <span>📈</span> 数据建模
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'smart-report' ? 'active' : ''}" data-tab="smart-report">
                            <span>📝</span> 智能报告
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
            case 'smart-report': return this.renderSmartReport();
            default: return `<div class="p-20">功能开发中...</div>`;
        }
    }

    // BI 仪表盘渲染（使用独立组件）
    renderBI() {
        // 使用容器方式渲染 BI 组件
        setTimeout(() => {
            const container = document.getElementById('bi-container');
            if (container && !container._biInstance) {
                container._biInstance = new AnalysisBIPage(container);
                container._biInstance.mount();
            }
        }, 0);

        return `<div id="bi-container" class="bi-wrapper"></div>`;
    }

    renderDatasets() {
        const list = this.state.datasets;
        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <h2>数据集列表</h2>
                    <button class="btn btn-outline-primary btn-sm" id="btn-refresh-datasets">
                        🔄 刷新列表
                    </button>
                </div>
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>来源</th>
                            <th>行数</th>
                            <th>创建时间</th>
                            <th width="150">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(d => `
                            <tr>
                                <td>${d.name}</td>
                                <td>${d.source_type === 'file' ? '文件' : '数据库'}</td>
                                <td>${d.row_count}</td>
                                <td>${Utils.formatDate(d.created_at)}</td>
                                <td>
                                    <div class="flex gap-10">
                                        <button class="btn btn-sm btn-secondary btn-view-dataset" data-id="${d.id}" style="padding: 4px 10px;">
                                            👁️ 查看
                                        </button>
                                        <button class="btn btn-sm btn-danger btn-delete-dataset" data-id="${d.id}" style="padding: 4px 10px;">
                                            🗑️ 删除
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                        ${list.length === 0 ? '<tr><td colspan="5" class="text-center">暂无数据</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
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
                            <button class="btn-icon mr-10 btn-back-to-list">⬅️</button>
                            <strong style="font-size: 16px;">${currentDataset?.name}</strong>
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
                                    value="${search || ''}"
                                    style="padding-left: 35px; height: 36px;">
                                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-secondary);">🔍</span>
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
            `<span class="badge bg-secondary mr-5">${field} ${info.order === 'asc' ? '↑' : '↓'}</span>`
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
                                            <th class="sortable-th" data-field="${c}" title="点击排序，Shift+点击多字段排序">
                                                ${c} ${sortIndicator}${priorityBadge}
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
                    return `<td><img src="${val}" class="cell-image" style="max-width: 80px; max-height: 60px; border-radius: 4px; cursor: pointer;" onclick="window.open('${val}', '_blank')"></td>`;
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




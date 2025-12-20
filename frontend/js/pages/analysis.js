/**
 * 数据分析模块 - AnalysisPage
 * 支持数据展示、清洗、比对、建模、图表可视化
 */

const AnalysisApi = {
    getDatasets: () => Api.get('/analysis/datasets'),
    importFile: (data) => Api.post('/analysis/import/file', data),
    importDatabase: (data) => Api.post('/analysis/import/database', data),
    getDatasetData: (id, params) => Api.get(`/analysis/datasets/${id}/data`, params),
    compare: (data) => Api.post('/analysis/compare', data),
    deleteDataset: (id) => Api.delete(`/analysis/datasets/${id}`),
    // 清洗与建模
    clean: (data) => Api.post('/analysis/clean', data),
    getSummary: (data) => Api.post('/analysis/model/summary', data),
    getCorrelation: (data) => Api.post('/analysis/model/correlation', data),
    getAggregate: (data) => Api.post('/analysis/model/aggregate', data)
};

class AnalysisPage extends Component {
    constructor(container, props) {
        super(container);
        this.state = {
            activeTab: 'datasets', // datasets, import, compare, cleaning, modeling, charts
            datasets: [],
            currentDataset: null,
            data: [],
            columns: [],
            total: 0,
            page: 1,
            size: 20,
            sort: '',
            loading: false,
            compareResult: null,
            importType: 'file', // file, database
            // 清洗建模专用
            cleaningOp: 'drop_missing',
            summaryData: null,
            corrData: null,
            aggData: null,
            // 图表专用
            chartType: 'bar', // bar, pie, line, scatter
            chartConfig: {
                xField: '',
                yField: '',
                groupField: '',
                aggregateType: 'count' // count, sum, avg, max, min
            }
        };
        this.chartInstance = null;
    }

    afterMount() {
        this.fetchDatasets();
        this.bindEvents();
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
            const res = await AnalysisApi.getDatasetData(id, {
                page: this.state.page,
                size: this.state.size,
                sort: this.state.sort
            });
            this.setState({
                data: res.data.items,
                columns: res.data.columns,
                total: res.data.total,
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
        });

        //选择数据集查看
        this.delegate('click', '.btn-view-dataset', (e, el) => {
            const id = parseInt(el.dataset.id);
            const ds = this.state.datasets.find(d => d.id === id);
            this.setState({ activeTab: 'viewer', currentDataset: ds, page: 1 });
            this.fetchDatasetData(id);
        });

        // 排序点击
        this.delegate('click', '.sortable-th', (e, el) => {
            const field = el.dataset.field;
            let currentSort = this.state.sort;
            let newSort = '';

            // 简单单字段排序逻辑，后期可扩展为多字段
            if (currentSort.startsWith(field + ':asc')) {
                newSort = field + ':desc';
            } else {
                newSort = field + ':asc';
            }

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

        // 导入类型切换
        this.delegate('click', '[data-import-type]', (e, el) => {
            this.setState({ importType: el.dataset.importType });
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

        // 图表类型切换
        this.delegate('click', '.chart-type-btn', (e, el) => {
            this.setState({ chartType: el.dataset.chartType });
        });
    }

    render() {
        return `
            <div class="analysis-container">
                <div class="analysis-sidebar">
                    <div class="analysis-menu">
                        <div class="analysis-menu-item ${this.state.activeTab === 'datasets' ? 'active' : ''}" data-tab="datasets">
                            <span>📦</span> 数据集管理
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'import' ? 'active' : ''}" data-tab="import">
                            <span>📥</span> 数据导入
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
                            <span>📊</span> 图表分析
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'cleaning' ? 'active' : ''}" data-tab="cleaning">
                            <span>🧼</span> 数据清洗
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'compare' ? 'active' : ''}" data-tab="compare">
                            <span>🔍</span> 数据比对
                        </div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'modeling' ? 'active' : ''}" data-tab="modeling">
                            <span>📈</span> 数据建模
                        </div>
                        <div class="analysis-menu-divider"></div>
                        <div class="analysis-menu-item ${this.state.activeTab === 'bi' ? 'active' : ''}" data-tab="bi">
                            <span>🎯</span> BI 仪表盘
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
            case 'bi': return this.renderBI();
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
                                    <button class="btn-view-dataset btn-text" data-id="${d.id}">查看</button>
                                    <button class="btn-delete-dataset btn-text text-danger" data-id="${d.id}">删除</button>
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
        const { currentDataset, data, columns, total, page, size, loading } = this.state;
        return `
            <div class="flex-column h-100">
                <div class="p-20 border-bottom bg-primary flex-between">
                    <div>
                        <button class="btn-icon mr-10 btn-back-to-list">⬅️</button>
                        <strong>${currentDataset?.name}</strong>
                        <span class="text-secondary ml-10">共 ${total} 条数据</span>
                    </div>
                    <div class="flex-center">
                        <button class="btn btn-primary btn-sm btn-start-modeling">开始建模</button>
                    </div>
                </div>
                <div class="data-table-container">
                    ${loading ? '<div class="text-center p-20">数据加载中...</div>' : `
                        <table class="premium-table">
                            <thead>
                                <tr>
                                    ${columns.map(c => `
                                        <th class="sortable-th" data-field="${c}">
                                            ${c} ${this.state.sort.startsWith(c) ? (this.state.sort.endsWith('asc') ? '▲' : '▼') : ''}
                                        </th>
                                    `).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map(row => `
                                    <tr>
                                        ${columns.map(c => {
            const val = row[c];
            // 图片检测逻辑
            if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/api/v1/storage/download')) && (val.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
                return `<td><img src="${val}" class="cell-image"></td>`;
            }
            return `<td>${Utils.escapeHtml(String(val !== null ? val : ''))}</td>`;
        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
                <div class="p-10 border-top bg-primary flex-center">
                    ${Utils.renderPagination(page, Math.ceil(total / size))}
                </div>
            </div>
        `;
    }

    renderImport() {
        return `
            <div class="p-20">
                <div class="import-form">
                    <h2 class="mb-20">接入外部数据</h2>
                    <div class="tabs mb-20">
                        <button class="btn ${this.state.importType === 'file' ? 'btn-primary' : ''}" data-import-type="file">文件导入</button>
                        <button class="btn ${this.state.importType === 'database' ? 'btn-primary' : ''}" data-import-type="database">数据库导入</button>
                    </div>
                    
                    ${this.state.importType === 'file' ? this.renderFileImport() : this.renderDbImport()}
                </div>
            </div>
        `;
    }

    renderFileImport() {
        return `
            <div class="form-group">
                <label>数据集名称</label>
                <input type="text" id="import-name" class="form-control" placeholder="输入识别名称">
            </div>
            <div class="form-group">
                <label>选择文件 ID (来自文件管理)</label>
                <input type="number" id="import-file-id" class="form-control" placeholder="点击选择或输入ID">
                <p class="text-secondary text-sm mt-5">请先在【文件管理】上传 Excel/CSV 文件并获取 ID</p>
            </div>
            <button class="btn btn-primary w-100 mt-20" id="btn-do-import">开始导入</button>
        `;
    }

    renderDbImport() {
        return `
            <div class="form-group">
                <label>数据集名称</label>
                <input type="text" id="import-name" class="form-control" placeholder="输入识别名称">
            </div>
            <div class="form-group">
                <label>连接 URL (支持 MySQL, PgSQL, SQLite, Oracle)</label>
                <input type="text" id="import-url" class="form-control" placeholder="mysql+pymysql://user:pass@host:port/db">
                <div class="text-secondary text-sm mt-5">
                    <strong>常见格式:</strong><br>
                    - MySQL: <code>mysql+pymysql://user:pass@host:3306/db</code><br>
                    - PostgreSQL: <code>postgresql+psycopg2://user:pass@host:5432/db</code><br>
                    - SQLite: <code>sqlite:///path/to/db.sqlite</code><br>
                    - Oracle: <code>oracle+oracledb://user:pass@host:1521/?service_name=ORCL</code>
                </div>
            </div>
            <div class="form-group">
                <label>SQL 查询语句</label>
                <textarea id="import-sql" class="form-control" rows="4">SELECT * FROM your_table LIMIT 10000</textarea>
            </div>
            <button class="btn btn-primary w-100 mt-20" id="btn-do-import-db">连接并导入</button>
        `;
    }

    // ==================== 图表分析 ====================
    renderCharts() {
        const { datasets, chartType, chartConfig } = this.state;
        return `
            <div class="p-20 charts-page">
                <div class="flex-between mb-20">
                    <h2>📊 图表分析</h2>
                </div>
                
                <div class="charts-layout">
                    <!-- 配置面板 -->
                    <div class="chart-config-panel">
                        <div class="config-section">
                            <h3>数据源</h3>
                            <div class="form-group">
                                <label>选择数据集</label>
                                <select id="chart-dataset" class="form-control">
                                    <option value="">请选择数据集...</option>
                                    ${datasets.map(d => `<option value="${d.id}">${d.name} (${d.row_count}行)</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="config-section">
                            <h3>图表类型</h3>
                            <div class="chart-type-grid">
                                <button class="chart-type-btn ${chartType === 'bar' ? 'active' : ''}" data-chart-type="bar">
                                    <span class="chart-icon">📊</span>
                                    <span>柱状图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'pie' ? 'active' : ''}" data-chart-type="pie">
                                    <span class="chart-icon">🥧</span>
                                    <span>饼图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'line' ? 'active' : ''}" data-chart-type="line">
                                    <span class="chart-icon">📈</span>
                                    <span>折线图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'scatter' ? 'active' : ''}" data-chart-type="scatter">
                                    <span class="chart-icon">⚬</span>
                                    <span>散点图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'histogram' ? 'active' : ''}" data-chart-type="histogram">
                                    <span class="chart-icon">📶</span>
                                    <span>直方图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'boxplot' ? 'active' : ''}" data-chart-type="boxplot">
                                    <span class="chart-icon">📦</span>
                                    <span>箱线图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'heatmap' ? 'active' : ''}" data-chart-type="heatmap">
                                    <span class="chart-icon">🔥</span>
                                    <span>热力图</span>
                                </button>
                                <button class="chart-type-btn ${chartType === 'forecast' ? 'active' : ''}" data-chart-type="forecast">
                                    <span class="chart-icon">🔮</span>
                                    <span>趋势预测</span>
                                </button>
                            </div>
                        </div>
                        
                        <div class="config-section">
                            <h3>数据映射</h3>
                            ${['histogram', 'boxplot'].includes(chartType) ? `
                                <div class="form-group">
                                    <label>数值字段</label>
                                    <select id="chart-x-field" class="form-control">
                                        <option value="">选择数值字段...</option>
                                    </select>
                                    <p class="text-muted text-sm mt-5">选择要分析分布的数值列</p>
                                </div>
                            ` : chartType === 'heatmap' ? `
                                <div class="form-group">
                                    <label>数值字段（多选）</label>
                                    <select id="chart-x-field" class="form-control" multiple size="5">
                                    </select>
                                    <p class="text-muted text-sm mt-5">按住 Ctrl 选择多个数值列计算相关性</p>
                                </div>
                            ` : chartType === 'forecast' ? `
                                <div class="form-group">
                                    <label>时间/顺序字段</label>
                                    <select id="chart-x-field" class="form-control">
                                        <option value="">选择字段...</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>数值字段</label>
                                    <select id="chart-y-field" class="form-control">
                                        <option value="">选择字段...</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>预测步数</label>
                                    <input type="number" id="forecast-steps" class="form-control" value="5" min="1" max="20">
                                </div>
                            ` : `
                                <div class="form-group">
                                    <label>${chartType === 'pie' ? '分类字段' : 'X轴字段'}</label>
                                    <select id="chart-x-field" class="form-control">
                                        <option value="">选择字段...</option>
                                    </select>
                                </div>
                                <div class="form-group" ${chartType === 'pie' ? 'style="display:none"' : ''}>
                                    <label>Y轴字段</label>
                                    <select id="chart-y-field" class="form-control">
                                        <option value="">选择字段...</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>聚合方式</label>
                                    <select id="chart-aggregate" class="form-control">
                                        <option value="count">计数 (Count)</option>
                                        <option value="sum">求和 (Sum)</option>
                                        <option value="avg">平均值 (Avg)</option>
                                        <option value="max">最大值 (Max)</option>
                                        <option value="min">最小值 (Min)</option>
                                    </select>
                                </div>
                            `}
                        </div>
                        
                        <button class="btn btn-primary w-100" id="btn-generate-chart">
                            🎨 生成图表
                        </button>
                    </div>
                    
                    <!-- 图表展示区 -->
                    <div class="chart-display-area">
                        <div id="chart-container" class="chart-container">
                            <div class="chart-placeholder">
                                <div class="placeholder-icon">📊</div>
                                <p>选择数据集和字段后点击"生成图表"</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 生成图表
    async generateChart() {
        const datasetId = document.getElementById('chart-dataset')?.value;
        const xFieldEl = document.getElementById('chart-x-field');
        const yField = document.getElementById('chart-y-field')?.value;
        const aggregate = document.getElementById('chart-aggregate')?.value;
        const { chartType } = this.state;

        if (!datasetId) {
            Toast.error('请选择数据集');
            return;
        }

        // 获取字段值（支持多选）
        let xField = '';
        let selectedFields = [];
        if (xFieldEl) {
            if (xFieldEl.multiple) {
                selectedFields = Array.from(xFieldEl.selectedOptions).map(o => o.value);
                xField = selectedFields[0] || '';
            } else {
                xField = xFieldEl.value;
            }
        }

        // 验证字段选择
        if (chartType === 'heatmap') {
            if (selectedFields.length < 2) {
                Toast.error('热力图需要选择至少2个数值字段');
                return;
            }
        } else if (!xField) {
            Toast.error('请选择字段');
            return;
        }

        Toast.info('正在生成图表...');

        // 获取数据
        const data = await this.fetchChartData(parseInt(datasetId));
        if (!data || data.length === 0) {
            Toast.error('数据集为空');
            return;
        }

        // 根据图表类型处理数据
        switch (chartType) {
            case 'histogram':
                this.renderHistogram(data, xField);
                break;
            case 'boxplot':
                this.renderBoxplot(data, xField);
                break;
            case 'heatmap':
                this.renderHeatmap(data, selectedFields);
                break;
            case 'forecast':
                const steps = parseInt(document.getElementById('forecast-steps')?.value) || 5;
                this.renderForecast(data, xField, yField, steps);
                break;
            default:
                // 基础图表（柱状图、饼图、折线图、散点图）
                const aggregatedData = this.aggregateData(data, xField, yField, aggregate);
                this.renderEChart(chartType, aggregatedData, xField, yField || '数量');
        }
    }

    // 数据聚合
    aggregateData(data, xField, yField, aggregateType) {
        const groups = {};

        data.forEach(row => {
            const key = String(row[xField] ?? '空值');
            if (!groups[key]) {
                groups[key] = { values: [], count: 0 };
            }
            groups[key].count++;
            if (yField && row[yField] !== null && row[yField] !== undefined) {
                const num = parseFloat(row[yField]);
                if (!isNaN(num)) {
                    groups[key].values.push(num);
                }
            }
        });

        // 计算聚合值
        const result = [];
        for (const [name, group] of Object.entries(groups)) {
            let value = 0;
            switch (aggregateType) {
                case 'count':
                    value = group.count;
                    break;
                case 'sum':
                    value = group.values.reduce((a, b) => a + b, 0);
                    break;
                case 'avg':
                    value = group.values.length > 0 ?
                        group.values.reduce((a, b) => a + b, 0) / group.values.length : 0;
                    break;
                case 'max':
                    value = group.values.length > 0 ? Math.max(...group.values) : 0;
                    break;
                case 'min':
                    value = group.values.length > 0 ? Math.min(...group.values) : 0;
                    break;
            }
            result.push({ name, value: Math.round(value * 100) / 100 });
        }

        // 排序（按值降序）
        result.sort((a, b) => b.value - a.value);

        // 限制最多显示20个分类
        return result.slice(0, 20);
    }

    // 渲染 ECharts 图表
    renderEChart(chartType, data, xLabel, yLabel) {
        const container = document.getElementById('chart-container');
        if (!container) return;

        // 清除占位符
        container.innerHTML = '';
        container.style.minHeight = '400px';

        // 销毁旧图表
        if (this.chartInstance) {
            this.chartInstance.dispose();
        }

        // 创建新图表
        this.chartInstance = echarts.init(container, 'dark');

        const names = data.map(d => d.name);
        const values = data.map(d => d.value);

        let option = {};

        // 通用配色
        const colors = [
            '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
            '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#4992ff'
        ];

        switch (chartType) {
            case 'bar':
                option = {
                    title: { text: `${xLabel} 分布统计`, left: 'center', textStyle: { color: '#fff' } },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        data: names,
                        axisLabel: { rotate: names.length > 8 ? 45 : 0, color: '#aaa' }
                    },
                    yAxis: { type: 'value', name: yLabel, axisLabel: { color: '#aaa' } },
                    series: [{
                        name: yLabel,
                        type: 'bar',
                        data: values,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: '#5470c6' },
                                { offset: 1, color: '#91cc75' }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        },
                        emphasis: { itemStyle: { color: '#fac858' } }
                    }]
                };
                break;

            case 'pie':
                option = {
                    title: { text: `${xLabel} 占比分析`, left: 'center', textStyle: { color: '#fff' } },
                    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                    legend: { orient: 'vertical', left: 'left', textStyle: { color: '#aaa' } },
                    series: [{
                        name: xLabel,
                        type: 'pie',
                        radius: ['40%', '70%'],
                        center: ['55%', '55%'],
                        avoidLabelOverlap: true,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: '#1a1a2e',
                            borderWidth: 2
                        },
                        label: { show: true, formatter: '{b}: {d}%', color: '#fff' },
                        emphasis: {
                            label: { show: true, fontSize: 16, fontWeight: 'bold' }
                        },
                        data: data.map((d, i) => ({
                            name: d.name,
                            value: d.value,
                            itemStyle: { color: colors[i % colors.length] }
                        }))
                    }]
                };
                break;

            case 'line':
                option = {
                    title: { text: `${xLabel} 趋势分析`, left: 'center', textStyle: { color: '#fff' } },
                    tooltip: { trigger: 'axis' },
                    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        data: names,
                        axisLabel: { rotate: names.length > 8 ? 45 : 0, color: '#aaa' }
                    },
                    yAxis: { type: 'value', name: yLabel, axisLabel: { color: '#aaa' } },
                    series: [{
                        name: yLabel,
                        type: 'line',
                        data: values,
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: { width: 3 },
                        itemStyle: { color: '#5470c6' },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(84, 112, 198, 0.5)' },
                                { offset: 1, color: 'rgba(84, 112, 198, 0.1)' }
                            ])
                        }
                    }]
                };
                break;

            case 'scatter':
                option = {
                    title: { text: `${xLabel} vs ${yLabel}`, left: 'center', textStyle: { color: '#fff' } },
                    tooltip: { trigger: 'item', formatter: (p) => `${p.data[0]}: ${p.data[1]}` },
                    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
                    xAxis: { type: 'category', data: names, axisLabel: { rotate: 45, color: '#aaa' } },
                    yAxis: { type: 'value', name: yLabel, axisLabel: { color: '#aaa' } },
                    series: [{
                        type: 'scatter',
                        data: data.map(d => [d.name, d.value]),
                        symbolSize: (val) => Math.min(30, Math.max(10, val[1] / 10)),
                        itemStyle: {
                            color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.5, [
                                { offset: 0, color: '#fac858' },
                                { offset: 1, color: '#ee6666' }
                            ])
                        }
                    }]
                };
                break;
        }

        this.chartInstance.setOption(option);

        // 响应式调整
        window.addEventListener('resize', () => {
            this.chartInstance?.resize();
        });

        Toast.success('图表生成成功');
    }

    // 更新字段选项
    async updateFieldOptions(datasetId) {
        if (!datasetId) return;

        try {
            const res = await AnalysisApi.getDatasetData(datasetId, { page: 1, size: 1 });
            const columns = res.data?.columns || [];

            const xSelect = document.getElementById('chart-x-field');
            const ySelect = document.getElementById('chart-y-field');

            const optionsHtml = columns.map(c => `<option value="${c}">${c}</option>`).join('');

            if (xSelect) {
                // 检查是否为多选（热力图）
                if (xSelect.multiple) {
                    xSelect.innerHTML = optionsHtml;
                } else {
                    xSelect.innerHTML = '<option value="">选择字段...</option>' + optionsHtml;
                }
            }
            if (ySelect) {
                ySelect.innerHTML = '<option value="">选择字段...</option>' + optionsHtml;
            }
        } catch (e) {
            console.error('获取字段失败', e);
        }
    }

    // ==================== 高级图表渲染方法 ====================

    // 直方图（数据分布分析）
    renderHistogram(data, field) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

        // 提取数值
        const values = data
            .map(row => parseFloat(row[field]))
            .filter(v => !isNaN(v));

        if (values.length === 0) {
            Toast.error('所选字段没有有效的数值数据');
            return;
        }

        // 分箱
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
        const binWidth = (max - min) / binCount || 1;

        const bins = Array(binCount).fill(0);
        const binLabels = [];

        for (let i = 0; i < binCount; i++) {
            const start = min + i * binWidth;
            const end = start + binWidth;
            binLabels.push(`${start.toFixed(1)}-${end.toFixed(1)}`);
        }

        values.forEach(v => {
            const binIndex = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
            bins[binIndex]++;
        });

        const option = {
            title: { text: `${field} 分布直方图`, left: 'center', textStyle: { color: '#fff' } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: binLabels,
                axisLabel: { rotate: 45, color: '#aaa', fontSize: 10 },
                name: field
            },
            yAxis: { type: 'value', name: '频数', axisLabel: { color: '#aaa' } },
            series: [{
                name: '频数',
                type: 'bar',
                data: bins,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#667eea' },
                        { offset: 1, color: '#764ba2' }
                    ])
                },
                barWidth: '90%'
            }]
        };

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('直方图生成成功');
    }

    // 箱线图（离散度分析）
    renderBoxplot(data, field) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

        // 提取数值并排序
        const values = data
            .map(row => parseFloat(row[field]))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);

        if (values.length < 5) {
            Toast.error('数据量不足，无法生成箱线图（至少需要5条数据）');
            return;
        }

        // 计算五数概括
        const n = values.length;
        const q1 = values[Math.floor(n * 0.25)];
        const q2 = values[Math.floor(n * 0.5)]; // 中位数
        const q3 = values[Math.floor(n * 0.75)];
        const min = values[0];
        const max = values[n - 1];
        const iqr = q3 - q1;
        const lowerWhisker = Math.max(min, q1 - 1.5 * iqr);
        const upperWhisker = Math.min(max, q3 + 1.5 * iqr);

        // 异常值
        const outliers = values.filter(v => v < lowerWhisker || v > upperWhisker);

        const option = {
            title: { text: `${field} 箱线图分析`, left: 'center', textStyle: { color: '#fff' } },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    if (params.seriesType === 'boxplot') {
                        return `
                            <strong>${field}</strong><br/>
                            最大值: ${upperWhisker.toFixed(2)}<br/>
                            Q3: ${q3.toFixed(2)}<br/>
                            中位数: ${q2.toFixed(2)}<br/>
                            Q1: ${q1.toFixed(2)}<br/>
                            最小值: ${lowerWhisker.toFixed(2)}
                        `;
                    }
                    return `异常值: ${params.data[1]}`;
                }
            },
            grid: { left: '10%', right: '10%', bottom: '15%', top: '15%' },
            xAxis: { type: 'category', data: [field], axisLabel: { color: '#aaa' } },
            yAxis: { type: 'value', name: '数值', axisLabel: { color: '#aaa' } },
            series: [
                {
                    name: '箱线图',
                    type: 'boxplot',
                    data: [[lowerWhisker, q1, q2, q3, upperWhisker]],
                    itemStyle: {
                        color: '#91cc75',
                        borderColor: '#5470c6'
                    }
                },
                {
                    name: '异常值',
                    type: 'scatter',
                    data: outliers.map(v => [field, v]),
                    itemStyle: { color: '#ee6666' },
                    symbolSize: 10
                }
            ]
        };

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('箱线图生成成功');
    }

    // 热力图（相关性矩阵）
    renderHeatmap(data, fields) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '500px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

        // 计算相关性矩阵
        const matrix = [];
        const n = data.length;

        // 提取各字段数值
        const fieldData = {};
        fields.forEach(f => {
            fieldData[f] = data.map(row => parseFloat(row[f])).filter(v => !isNaN(v));
        });

        // 计算皮尔逊相关系数
        const calcCorrelation = (x, y) => {
            const n = Math.min(x.length, y.length);
            if (n < 2) return 0;

            const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
            const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

            let numerator = 0, denomX = 0, denomY = 0;
            for (let i = 0; i < n; i++) {
                const dx = x[i] - meanX;
                const dy = y[i] - meanY;
                numerator += dx * dy;
                denomX += dx * dx;
                denomY += dy * dy;
            }

            const denom = Math.sqrt(denomX * denomY);
            return denom === 0 ? 0 : numerator / denom;
        };

        // 生成矩阵数据
        fields.forEach((f1, i) => {
            fields.forEach((f2, j) => {
                const corr = calcCorrelation(fieldData[f1], fieldData[f2]);
                matrix.push([i, j, Math.round(corr * 100) / 100]);
            });
        });

        const option = {
            title: { text: '相关性热力图', left: 'center', textStyle: { color: '#fff' } },
            tooltip: {
                position: 'top',
                formatter: (params) => `${fields[params.data[0]]} ↔ ${fields[params.data[1]]}<br/>相关系数: ${params.data[2]}`
            },
            grid: { left: '15%', right: '10%', bottom: '15%', top: '10%' },
            xAxis: {
                type: 'category',
                data: fields,
                splitArea: { show: true },
                axisLabel: { rotate: 45, color: '#aaa', fontSize: 11 }
            },
            yAxis: {
                type: 'category',
                data: fields,
                splitArea: { show: true },
                axisLabel: { color: '#aaa', fontSize: 11 }
            },
            visualMap: {
                min: -1,
                max: 1,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: '0%',
                inRange: {
                    color: ['#3b82f6', '#1e293b', '#ef4444']
                },
                textStyle: { color: '#aaa' }
            },
            series: [{
                name: '相关系数',
                type: 'heatmap',
                data: matrix,
                label: {
                    show: true,
                    formatter: (p) => p.data[2].toFixed(2),
                    color: '#fff',
                    fontSize: 11
                },
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
                }
            }]
        };

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('热力图生成成功');
    }

    // 趋势预测图
    renderForecast(data, xField, yField, forecastSteps = 5) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

        // 提取时间/顺序数据
        const xValues = data.map(row => String(row[xField]));
        const yValues = data.map(row => parseFloat(row[yField])).filter(v => !isNaN(v));

        if (yValues.length < 3) {
            Toast.error('数据量不足，无法进行预测（至少需要3条数据）');
            return;
        }

        // 简单移动平均预测
        const windowSize = Math.min(3, Math.floor(yValues.length / 2));
        const lastValues = yValues.slice(-windowSize);
        const avgDiff = [];

        for (let i = 1; i < yValues.length; i++) {
            avgDiff.push(yValues[i] - yValues[i - 1]);
        }
        const trend = avgDiff.length > 0 ? avgDiff.reduce((a, b) => a + b, 0) / avgDiff.length : 0;

        // 生成预测值
        const forecastX = [];
        const forecastY = [];
        let lastY = yValues[yValues.length - 1];

        for (let i = 1; i <= forecastSteps; i++) {
            forecastX.push(`预测${i}`);
            lastY = lastY + trend;
            forecastY.push(Math.round(lastY * 100) / 100);
        }

        const option = {
            title: { text: `${yField} 趋势预测`, left: 'center', textStyle: { color: '#fff' } },
            tooltip: { trigger: 'axis' },
            legend: { data: ['历史数据', '预测数据'], bottom: 0, textStyle: { color: '#aaa' } },
            grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: [...xValues, ...forecastX],
                axisLabel: { rotate: xValues.length > 10 ? 45 : 0, color: '#aaa' }
            },
            yAxis: { type: 'value', name: yField, axisLabel: { color: '#aaa' } },
            series: [
                {
                    name: '历史数据',
                    type: 'line',
                    data: [...yValues, ...Array(forecastSteps).fill(null)],
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    itemStyle: { color: '#5470c6' },
                    lineStyle: { width: 3 }
                },
                {
                    name: '预测数据',
                    type: 'line',
                    data: [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastY],
                    smooth: true,
                    symbol: 'diamond',
                    symbolSize: 8,
                    itemStyle: { color: '#91cc75' },
                    lineStyle: { width: 3, type: 'dashed' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(145, 204, 117, 0.3)' },
                            { offset: 1, color: 'rgba(145, 204, 117, 0.05)' }
                        ])
                    }
                }
            ],
            // 标记预测区域
            markArea: {
                silent: true,
                data: [[
                    { xAxis: xValues[xValues.length - 1] },
                    { xAxis: forecastX[forecastX.length - 1] }
                ]]
            }
        };

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success(`趋势预测完成，预测了未来 ${forecastSteps} 步`);
    }


    renderCleaning() {
        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <h2>数据清洗</h2>
                </div>
                <div class="cleaning-panel bg-primary p-20 border-radius-10 mb-20">
                    <div class="form-group">
                        <label>选择数据集</label>
                        <select id="clean-dataset" class="form-control">
                            <option value="">选择数据集...</option>
                            ${this.state.datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>清洗操作</label>
                        <select id="clean-op" class="form-control">
                            <option value="drop_missing">删除空值</option>
                            <option value="fill_missing">填充空值</option>
                            <option value="drop_duplicates">删除重复项</option>
                            <option value="convert_type">类型转换</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>目标列 (逗号分隔，为空则处理全部)</label>
                        <input type="text" id="clean-cols" class="form-control" placeholder="col1, col2">
                    </div>
                    <button class="btn btn-primary w-100 mt-20" id="btn-run-clean">立即清洗</button>
                </div>
                <div id="clean-log" class="text-secondary"></div>
            </div>
        `;
    }

    renderModeling() {
        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <h2>数据建模与分析</h2>
                </div>
                <div class="modeling-grid">
                    <div class="modeling-card p-20 bg-primary border-radius-10">
                        <h3>描述性统计</h3>
                        <div class="form-group">
                            <select id="model-summary-ds" class="form-control">
                                <option value="">选择数据集...</option>
                                ${this.state.datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                            </select>
                        </div>
                        <button class="btn btn-primary btn-sm" id="btn-model-summary">运行分析</button>
                    </div>
                    
                    <div class="modeling-card p-20 bg-primary border-radius-10">
                        <h3>相关性分析</h3>
                        <div class="form-group">
                            <select id="model-corr-ds" class="form-control">
                                <option value="">选择数据集...</option>
                                ${this.state.datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                            </select>
                        </div>
                        <button class="btn btn-primary btn-sm" id="btn-model-corr">计算矩阵</button>
                    </div>
                </div>
                
                <div id="modeling-result" class="mt-20">
                    ${this.state.summaryData ? this.renderSummaryResult() : ''}
                    ${this.state.corrData ? this.renderCorrResult() : ''}
                </div>
            </div>
        `;
    }

    renderSummaryResult() {
        const { stats, missing } = this.state.summaryData;
        const columns = Object.keys(stats);
        return `
            <div class="result-card p-20 border-radius-10 mt-20" style="background:#1a1a1a">
                <h4>分析结果 - 描述性统计</h4>
                <div class="overflow-auto mt-10">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>指标</th>
                                ${columns.map(c => `<th>${c}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.keys(stats[columns[0]]).map(metric => `
                                <tr>
                                    <td>${metric}</td>
                                    ${columns.map(c => `<td>${stats[c][metric] ?? '-'}</td>`).join('')}
                                </tr>
                            `).join('')}
                            <tr class="bg-dark">
                                <td>缺失数</td>
                                ${columns.map(c => `<td>${missing[c] ?? 0}</td>`).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderCorrResult() {
        const { matrix } = this.state.corrData;
        const cols = Object.keys(matrix);
        return `
             <div class="result-card p-20 border-radius-10 mt-20" style="background:#1a1a1a">
                <h4>分析结果 - 相关性矩阵</h4>
                <div class="overflow-auto mt-10">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th></th>
                                ${cols.map(c => `<th>${c}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${cols.map(row => `
                                <tr>
                                    <td>${row}</td>
                                    ${cols.map(col => {
            const val = matrix[row][col];
            const color = val > 0.7 ? '#4caf50' : (val < -0.7 ? '#f44336' : 'inherit');
            return `<td style="color:${color}">${val?.toFixed(4) ?? '-'}</td>`;
        }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderCompare() {
        return `
            <div class="compare-panel">
                <div class="compare-selector bg-primary p-20 border-radius-10">
                    <div class="form-group mb-0">
                        <label>源数据集 (Source)</label>
                        <select id="compare-source" class="form-control">
                            <option value="">选择数据集...</option>
                            ${this.state.datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group mb-0">
                        <label>目标数据集 (Target)</label>
                        <select id="compare-target" class="form-control">
                            <option value="">选择数据集...</option>
                            ${this.state.datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group mb-0">
                        <label>关联主键 (逗号分隔)</label>
                        <input type="text" id="compare-keys" class="form-control" placeholder="id,code">
                    </div>
                    <div class="form-group mb-0">
                    <label>&nbsp;</label>
                    <button class="btn btn-primary" id="btn-run-compare" style="width: 100%;">执行比对</button>
                </div>
                </div>
                
                <div id="compare-result-container" class="flex-1 overflow-auto">
                    ${this.state.compareResult ? this.renderCompareResult() : '<div class="text-center p-40 text-secondary">请选择数据集并点击"执行比对"</div>'}
                </div>
            </div>
        `;
    }

    renderCompareResult() {
        const { added, deleted, changed, summary } = this.state.compareResult;
        return `
            <div class="p-20">
                <div class="diff-header mb-20 flex-center gap-10">
                    <span class="badge badge-success">新增: ${summary.added_count}</span>
                    <span class="badge badge-danger">删除: ${summary.deleted_count}</span>
                    <span class="badge badge-warning">变更: ${summary.changed_count}</span>
                </div>
                
                <div class="diff-grid">
                    <div class="diff-card bg-primary p-20 border-radius-10">
                        <h4 class="mb-10 text-success">新增行示例</h4>
                        <pre class="text-sm overflow-auto" style="max-height:300px; color: #4caf50">${JSON.stringify(added.slice(0, 5), null, 2)}</pre>
                    </div>
                    <div class="diff-card bg-primary p-20 border-radius-10 mt-20">
                        <h4 class="mb-10 text-warning">变更项示例 (基于 Source)</h4>
                        <pre class="text-sm overflow-auto" style="max-height:300px; color: #ff9800">${JSON.stringify(changed.slice(0, 5), null, 2)}</pre>
                    </div>
                </div>
            </div>
        `;
    }
}

// 注册全局事件处理
document.addEventListener('click', async (e) => {
    const el = e.target;
    const page = WindowManager.getActiveWindow()?.component;
    if (!page || !(page instanceof AnalysisPage)) return;

    // 导入 - 文件
    if (el.id === 'btn-do-import') {
        const name = document.getElementById('import-name').value;
        const fileId = document.getElementById('import-file-id').value;
        if (!name || !fileId) return Toast.error('请填写完整');
        try {
            await AnalysisApi.importFile({ name, file_id: parseInt(fileId) });
            Toast.success('导入任务已提交');
            page.setState({ activeTab: 'datasets' });
            page.fetchDatasets();
        } catch (err) { Toast.error(err.message); }
    }

    // 导入 - 数据库
    if (el.id === 'btn-do-import-db') {
        const name = document.getElementById('import-name').value;
        const url = document.getElementById('import-url').value;
        const sql = document.getElementById('import-sql').value;
        if (!name || !url || !sql) return Toast.error('请填写完整连接信息');
        try {
            await AnalysisApi.importDatabase({ name, connection_url: url, query: sql });
            Toast.success('数据库导入成功');
            page.setState({ activeTab: 'datasets' });
            page.fetchDatasets();
        } catch (err) { Toast.error(err.message); }
    }

    // 比对
    if (el.id === 'btn-run-compare') {
        const sId = document.getElementById('compare-source').value;
        const tId = document.getElementById('compare-target').value;
        const keys = document.getElementById('compare-keys').value;
        if (!sId || !tId || !keys) return Toast.error('请填写完整比对参数');

        try {
            const res = await AnalysisApi.compare({
                source_id: parseInt(sId),
                target_id: parseInt(tId),
                join_keys: keys.split(',').map(k => k.trim())
            });
            page.setState({ compareResult: res.data });
        } catch (err) { Toast.error(err.message); }
    }

    // 清洗
    if (el.id === 'btn-run-clean') {
        const dsId = document.getElementById('clean-dataset').value;
        const op = document.getElementById('clean-op').value;
        const cols = document.getElementById('clean-cols').value;
        if (!dsId) return Toast.error('请选择数据集');

        try {
            const res = await AnalysisApi.clean({
                dataset_id: parseInt(dsId),
                operation: op,
                columns: cols ? cols.split(',').map(c => c.trim()) : null
            });
            Toast.success(res.message);
            page.fetchDatasets();
        } catch (err) { Toast.error(err.message); }
    }

    // 建模 - 统计
    if (el.id === 'btn-model-summary') {
        const dsId = document.getElementById('model-summary-ds').value;
        if (!dsId) return Toast.error('请选择数据集');
        try {
            const res = await AnalysisApi.getSummary({ dataset_id: parseInt(dsId) });
            page.setState({ summaryData: res.data, corrData: null });
        } catch (err) { Toast.error(err.message); }
    }

    // 建模 - 相关性
    if (el.id === 'btn-model-corr') {
        const dsId = document.getElementById('model-corr-ds').value;
        if (!dsId) return Toast.error('请选择数据集');
        try {
            const res = await AnalysisApi.getCorrelation({ dataset_id: parseInt(dsId) });
            page.setState({ corrData: res.data, summaryData: null });
        } catch (err) { Toast.error(err.message); }
    }

    // 生成图表
    if (el.id === 'btn-generate-chart') {
        page.generateChart();
    }
});

// 数据集选择变化时更新字段
document.addEventListener('change', async (e) => {
    const el = e.target;
    const page = WindowManager.getActiveWindow()?.component;
    if (!page || !(page instanceof AnalysisPage)) return;

    if (el.id === 'chart-dataset') {
        page.updateFieldOptions(el.value);
    }
});

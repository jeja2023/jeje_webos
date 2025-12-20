/**
 * BI 数据建模模块 - AnalysisBIPage
 * 支持仪表盘设计、图表布局、报表生成
 */

// BI 仪表盘组件类
class AnalysisBIPage extends Component {
    constructor(container, props) {
        super(container);
        this.state = {
            datasets: [],
            dashboards: [], // 仪表盘列表
            currentDashboard: null,
            widgets: [], // 当前仪表盘的图表组件
            editMode: false, // 编辑模式
            selectedWidget: null, // 选中的组件
            loading: false
        };
        this.chartInstances = {}; // 存储所有图表实例
    }

    afterMount() {
        this.fetchDatasets();
        this.loadDashboards();
        this.bindEvents();
    }

    async fetchDatasets() {
        try {
            const res = await Api.get('/analysis/datasets');
            this.setState({ datasets: res.data || [] });
        } catch (e) {
            Toast.error('获取数据集失败');
        }
    }

    // 从本地存储加载仪表盘
    loadDashboards() {
        try {
            const saved = localStorage.getItem('bi_dashboards');
            if (saved) {
                const dashboards = JSON.parse(saved);
                this.setState({ dashboards });
            }
        } catch (e) {
            console.error('加载仪表盘失败', e);
        }
    }

    // 保存仪表盘到本地存储
    saveDashboards() {
        try {
            localStorage.setItem('bi_dashboards', JSON.stringify(this.state.dashboards));
        } catch (e) {
            console.error('保存仪表盘失败', e);
        }
    }

    bindEvents() {
        // 创建仪表盘
        this.delegate('click', '#btn-create-dashboard', () => {
            this.showCreateDashboardModal();
        });

        // 选择仪表盘
        this.delegate('click', '.dashboard-card', (e, el) => {
            const id = el.dataset.id;
            const dashboard = this.state.dashboards.find(d => d.id === id);
            if (dashboard) {
                this.setState({
                    currentDashboard: dashboard,
                    widgets: dashboard.widgets || [],
                    editMode: false
                });
                // 延迟渲染图表
                setTimeout(() => this.renderAllCharts(), 100);
            }
        });

        // 切换编辑模式
        this.delegate('click', '#btn-toggle-edit', () => {
            this.setState({ editMode: !this.state.editMode });
        });

        // 添加组件
        this.delegate('click', '#btn-add-widget', () => {
            this.showAddWidgetModal();
        });

        // 返回列表
        this.delegate('click', '#btn-back-list', () => {
            this.setState({ currentDashboard: null, widgets: [], editMode: false });
            this.disposeAllCharts();
        });

        // 保存仪表盘
        this.delegate('click', '#btn-save-dashboard', () => {
            this.saveCurrentDashboard();
        });

        // 删除仪表盘
        this.delegate('click', '.btn-delete-dashboard', (e, el) => {
            e.stopPropagation();
            const id = el.dataset.id;
            if (confirm('确定要删除这个仪表盘吗？')) {
                this.deleteDashboard(id);
            }
        });

        // 选中组件
        this.delegate('click', '.bi-widget', (e, el) => {
            if (!this.state.editMode) return;
            const widgetId = el.dataset.widgetId;
            this.setState({ selectedWidget: widgetId });
        });

        // 删除组件
        this.delegate('click', '.widget-delete', (e, el) => {
            e.stopPropagation();
            const widgetId = el.closest('.bi-widget').dataset.widgetId;
            this.deleteWidget(widgetId);
        });

        // 配置组件
        this.delegate('click', '.widget-config', (e, el) => {
            e.stopPropagation();
            const widgetId = el.closest('.bi-widget').dataset.widgetId;
            this.showWidgetConfigModal(widgetId);
        });
    }

    render() {
        const { currentDashboard, dashboards, editMode, loading } = this.state;

        if (currentDashboard) {
            return this.renderDashboardView();
        }

        return `
            <div class="bi-page">
                <div class="bi-header">
                    <div class="bi-title">
                        <h2>📊 BI 仪表盘</h2>
                        <p class="text-secondary">创建和管理数据可视化仪表盘</p>
                    </div>
                    <button class="btn btn-primary" id="btn-create-dashboard">
                        ➕ 新建仪表盘
                    </button>
                </div>

                <div class="dashboard-grid">
                    ${dashboards.length === 0 ? `
                        <div class="empty-state">
                            <div class="empty-icon">📈</div>
                            <h3>暂无仪表盘</h3>
                            <p>点击上方按钮创建您的第一个仪表盘</p>
                        </div>
                    ` : dashboards.map(d => `
                        <div class="dashboard-card" data-id="${d.id}">
                            <div class="dashboard-preview">
                                <span class="preview-icon">📊</span>
                                <span class="widget-count">${d.widgets?.length || 0} 个组件</span>
                            </div>
                            <div class="dashboard-info">
                                <h4>${Utils.escapeHtml(d.name)}</h4>
                                <p class="text-secondary text-sm">${Utils.formatDate(d.createdAt)}</p>
                            </div>
                            <button class="btn-delete-dashboard" data-id="${d.id}" title="删除">🗑️</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderDashboardView() {
        const { currentDashboard, widgets, editMode, selectedWidget, datasets } = this.state;

        return `
            <div class="bi-dashboard-view ${editMode ? 'edit-mode' : ''}">
                <div class="dashboard-toolbar">
                    <div class="toolbar-left">
                        <button class="btn btn-ghost" id="btn-back-list">⬅️ 返回</button>
                        <h3>${Utils.escapeHtml(currentDashboard.name)}</h3>
                    </div>
                    <div class="toolbar-right">
                        ${editMode ? `
                            <button class="btn btn-secondary" id="btn-add-widget">➕ 添加组件</button>
                            <button class="btn btn-primary" id="btn-save-dashboard">💾 保存</button>
                        ` : ''}
                        <button class="btn ${editMode ? 'btn-warning' : 'btn-ghost'}" id="btn-toggle-edit">
                            ${editMode ? '✓ 完成编辑' : '✏️ 编辑'}
                        </button>
                    </div>
                </div>

                <div class="widget-canvas" id="widgetCanvas">
                    ${widgets.length === 0 ? `
                        <div class="empty-canvas">
                            <div class="empty-icon">📊</div>
                            <p>点击"编辑"并添加组件来构建您的仪表盘</p>
                        </div>
                    ` : widgets.map(w => this.renderWidget(w, selectedWidget === w.id)).join('')}
                </div>
            </div>
        `;
    }

    renderWidget(widget, isSelected) {
        const { editMode } = this.state;
        const sizeClass = `widget-${widget.size || 'medium'}`;

        return `
            <div class="bi-widget ${sizeClass} ${isSelected ? 'selected' : ''}" 
                 data-widget-id="${widget.id}"
                 style="grid-column: span ${widget.colSpan || 1}; grid-row: span ${widget.rowSpan || 1};">
                <div class="widget-header">
                    <span class="widget-title">${Utils.escapeHtml(widget.title)}</span>
                    ${editMode ? `
                        <div class="widget-actions">
                            <button class="widget-config" title="配置">⚙️</button>
                            <button class="widget-delete" title="删除">🗑️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="widget-body" id="widget-chart-${widget.id}">
                    <div class="chart-loading">加载中...</div>
                </div>
            </div>
        `;
    }

    // 渲染所有图表
    renderAllCharts() {
        const { widgets, datasets } = this.state;

        widgets.forEach(async (widget) => {
            await this.renderWidgetChart(widget);
        });
    }

    // 渲染单个图表
    async renderWidgetChart(widget) {
        const container = document.getElementById(`widget-chart-${widget.id}`);
        if (!container) return;

        // 销毁旧实例
        if (this.chartInstances[widget.id]) {
            this.chartInstances[widget.id].dispose();
        }

        try {
            // 获取数据
            const res = await Api.get(`/analysis/datasets/${widget.datasetId}/data`, {
                page: 1,
                size: 500
            });
            const data = res.data?.items || [];

            if (data.length === 0) {
                container.innerHTML = '<div class="no-data">暂无数据</div>';
                return;
            }

            container.innerHTML = '';

            // 创建图表
            const chart = echarts.init(container, 'dark');
            this.chartInstances[widget.id] = chart;

            // 根据配置生成图表
            const option = this.buildChartOption(widget, data);
            chart.setOption(option);

            // 响应式
            window.addEventListener('resize', () => chart.resize());

        } catch (e) {
            container.innerHTML = '<div class="chart-error">图表加载失败</div>';
            console.error('渲染图表失败', e);
        }
    }

    // 构建图表配置
    buildChartOption(widget, data) {
        const { chartType, xField, yField, aggregateType } = widget.config || {};

        // 聚合数据
        const aggregated = this.aggregateData(data, xField, yField, aggregateType || 'count');
        const names = aggregated.map(d => d.name);
        const values = aggregated.map(d => d.value);

        const baseOption = {
            tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis' },
            grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true }
        };

        switch (chartType) {
            case 'bar':
                return {
                    ...baseOption,
                    xAxis: { type: 'category', data: names, axisLabel: { color: '#aaa', rotate: names.length > 6 ? 45 : 0 } },
                    yAxis: { type: 'value', axisLabel: { color: '#aaa' } },
                    series: [{
                        type: 'bar',
                        data: values,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: '#5470c6' },
                                { offset: 1, color: '#91cc75' }
                            ])
                        }
                    }]
                };

            case 'line':
                return {
                    ...baseOption,
                    xAxis: { type: 'category', data: names, axisLabel: { color: '#aaa' } },
                    yAxis: { type: 'value', axisLabel: { color: '#aaa' } },
                    series: [{
                        type: 'line',
                        data: values,
                        smooth: true,
                        areaStyle: { opacity: 0.3 }
                    }]
                };

            case 'pie':
                return {
                    ...baseOption,
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        data: aggregated.map((d, i) => ({
                            name: d.name,
                            value: d.value
                        })),
                        label: { formatter: '{b}: {d}%', color: '#fff' }
                    }]
                };

            case 'gauge':
                const total = values.reduce((a, b) => a + b, 0);
                const avg = total / values.length;
                return {
                    series: [{
                        type: 'gauge',
                        progress: { show: true, width: 18 },
                        axisLine: { lineStyle: { width: 18 } },
                        axisTick: { show: false },
                        splitLine: { length: 15, lineStyle: { width: 2, color: '#999' } },
                        axisLabel: { distance: 25, color: '#999', fontSize: 12 },
                        anchor: { show: true, showAbove: true, size: 25, itemStyle: { borderWidth: 10 } },
                        title: { show: false },
                        detail: {
                            valueAnimation: true,
                            fontSize: 24,
                            offsetCenter: [0, '70%'],
                            color: '#fff'
                        },
                        data: [{ value: Math.round(avg * 10) / 10, name: widget.title }]
                    }]
                };

            case 'number':
                // 数字卡片类型 - 返回特殊标记
                return { _type: 'number', value: values.reduce((a, b) => a + b, 0) };

            default:
                return {
                    ...baseOption,
                    xAxis: { type: 'category', data: names },
                    yAxis: { type: 'value' },
                    series: [{ type: 'bar', data: values }]
                };
        }
    }

    // 数据聚合（复用自 AnalysisPage）
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

        const result = [];
        for (const [name, group] of Object.entries(groups)) {
            let value = 0;
            switch (aggregateType) {
                case 'count': value = group.count; break;
                case 'sum': value = group.values.reduce((a, b) => a + b, 0); break;
                case 'avg': value = group.values.length > 0 ? group.values.reduce((a, b) => a + b, 0) / group.values.length : 0; break;
                case 'max': value = group.values.length > 0 ? Math.max(...group.values) : 0; break;
                case 'min': value = group.values.length > 0 ? Math.min(...group.values) : 0; break;
            }
            result.push({ name, value: Math.round(value * 100) / 100 });
        }

        result.sort((a, b) => b.value - a.value);
        return result.slice(0, 15);
    }

    // 销毁所有图表实例
    disposeAllCharts() {
        Object.values(this.chartInstances).forEach(chart => {
            if (chart && chart.dispose) {
                chart.dispose();
            }
        });
        this.chartInstances = {};
    }

    // 创建仪表盘弹窗
    showCreateDashboardModal() {
        Modal.show({
            title: '新建仪表盘',
            content: `
                <div class="form-group">
                    <label>仪表盘名称</label>
                    <input type="text" id="dashboard-name" class="form-control" placeholder="输入名称">
                </div>
            `,
            onConfirm: () => {
                const name = document.getElementById('dashboard-name')?.value?.trim();
                if (!name) {
                    Toast.error('请输入名称');
                    return false;
                }
                this.createDashboard(name);
                return true;
            }
        });
    }

    createDashboard(name) {
        const dashboard = {
            id: 'db_' + Date.now(),
            name,
            widgets: [],
            createdAt: new Date().toISOString()
        };

        const dashboards = [...this.state.dashboards, dashboard];
        this.setState({ dashboards });
        this.saveDashboards();
        Toast.success('仪表盘创建成功');
    }

    deleteDashboard(id) {
        const dashboards = this.state.dashboards.filter(d => d.id !== id);
        this.setState({ dashboards });
        this.saveDashboards();
        Toast.success('仪表盘已删除');
    }

    // 添加组件弹窗
    showAddWidgetModal() {
        const { datasets } = this.state;

        Modal.show({
            title: '添加图表组件',
            width: 500,
            content: `
                <div class="form-group">
                    <label>组件标题</label>
                    <input type="text" id="widget-title" class="form-control" placeholder="输入标题">
                </div>
                <div class="form-group">
                    <label>数据集</label>
                    <select id="widget-dataset" class="form-control">
                        <option value="">请选择...</option>
                        ${datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>图表类型</label>
                    <select id="widget-chart-type" class="form-control">
                        <option value="bar">柱状图</option>
                        <option value="line">折线图</option>
                        <option value="pie">饼图</option>
                        <option value="gauge">仪表盘</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>X轴/分类字段</label>
                    <select id="widget-x-field" class="form-control">
                        <option value="">请先选择数据集...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Y轴/数值字段</label>
                    <select id="widget-y-field" class="form-control">
                        <option value="">请先选择数据集...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>聚合方式</label>
                    <select id="widget-aggregate" class="form-control">
                        <option value="count">计数</option>
                        <option value="sum">求和</option>
                        <option value="avg">平均值</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>组件大小</label>
                    <select id="widget-size" class="form-control">
                        <option value="small">小 (1x1)</option>
                        <option value="medium" selected>中 (2x1)</option>
                        <option value="large">大 (2x2)</option>
                        <option value="wide">宽 (3x1)</option>
                    </select>
                </div>
            `,
            onConfirm: async () => {
                const title = document.getElementById('widget-title')?.value?.trim();
                const datasetId = document.getElementById('widget-dataset')?.value;
                const chartType = document.getElementById('widget-chart-type')?.value;
                const xField = document.getElementById('widget-x-field')?.value;
                const yField = document.getElementById('widget-y-field')?.value;
                const aggregate = document.getElementById('widget-aggregate')?.value;
                const size = document.getElementById('widget-size')?.value;

                if (!title || !datasetId || !xField) {
                    Toast.error('请填写必要信息');
                    return false;
                }

                this.addWidget({
                    title,
                    datasetId: parseInt(datasetId),
                    size,
                    config: { chartType, xField, yField, aggregateType: aggregate }
                });
                return true;
            }
        });

        // 绑定数据集变化事件
        setTimeout(() => {
            const dsSelect = document.getElementById('widget-dataset');
            if (dsSelect) {
                dsSelect.addEventListener('change', async (e) => {
                    const dsId = e.target.value;
                    if (!dsId) return;

                    try {
                        const res = await Api.get(`/analysis/datasets/${dsId}/data`, { page: 1, size: 1 });
                        const columns = res.data?.columns || [];
                        const options = columns.map(c => `<option value="${c}">${c}</option>`).join('');

                        document.getElementById('widget-x-field').innerHTML = '<option value="">选择字段...</option>' + options;
                        document.getElementById('widget-y-field').innerHTML = '<option value="">选择字段...</option>' + options;
                    } catch (e) {
                        console.error('获取字段失败', e);
                    }
                });
            }
        }, 100);
    }

    addWidget(widgetConfig) {
        const widget = {
            id: 'w_' + Date.now(),
            ...widgetConfig,
            colSpan: widgetConfig.size === 'small' ? 1 : widgetConfig.size === 'large' || widgetConfig.size === 'wide' ? 3 : 2,
            rowSpan: widgetConfig.size === 'large' ? 2 : 1
        };

        const widgets = [...this.state.widgets, widget];
        this.setState({ widgets });

        // 延迟渲染新图表
        setTimeout(() => this.renderWidgetChart(widget), 100);
        Toast.success('组件已添加');
    }

    deleteWidget(widgetId) {
        // 销毁图表实例
        if (this.chartInstances[widgetId]) {
            this.chartInstances[widgetId].dispose();
            delete this.chartInstances[widgetId];
        }

        const widgets = this.state.widgets.filter(w => w.id !== widgetId);
        this.setState({ widgets, selectedWidget: null });
        Toast.success('组件已删除');
    }

    saveCurrentDashboard() {
        const { currentDashboard, widgets, dashboards } = this.state;

        const updated = dashboards.map(d => {
            if (d.id === currentDashboard.id) {
                return { ...d, widgets, updatedAt: new Date().toISOString() };
            }
            return d;
        });

        this.setState({
            dashboards: updated,
            currentDashboard: { ...currentDashboard, widgets }
        });
        this.saveDashboards();
        Toast.success('仪表盘已保存');
    }

    showWidgetConfigModal(widgetId) {
        const widget = this.state.widgets.find(w => w.id === widgetId);
        if (!widget) return;

        Modal.show({
            title: '组件配置',
            content: `
                <div class="form-group">
                    <label>组件标题</label>
                    <input type="text" id="config-title" class="form-control" value="${Utils.escapeHtml(widget.title)}">
                </div>
                <div class="form-group">
                    <label>组件大小</label>
                    <select id="config-size" class="form-control">
                        <option value="small" ${widget.size === 'small' ? 'selected' : ''}>小 (1x1)</option>
                        <option value="medium" ${widget.size === 'medium' ? 'selected' : ''}>中 (2x1)</option>
                        <option value="large" ${widget.size === 'large' ? 'selected' : ''}>大 (2x2)</option>
                        <option value="wide" ${widget.size === 'wide' ? 'selected' : ''}>宽 (3x1)</option>
                    </select>
                </div>
            `,
            onConfirm: () => {
                const title = document.getElementById('config-title')?.value?.trim();
                const size = document.getElementById('config-size')?.value;

                if (!title) {
                    Toast.error('请输入标题');
                    return false;
                }

                this.updateWidget(widgetId, {
                    title,
                    size,
                    colSpan: size === 'small' ? 1 : size === 'large' || size === 'wide' ? 3 : 2,
                    rowSpan: size === 'large' ? 2 : 1
                });
                return true;
            }
        });
    }

    updateWidget(widgetId, updates) {
        const widgets = this.state.widgets.map(w => {
            if (w.id === widgetId) {
                return { ...w, ...updates };
            }
            return w;
        });
        this.setState({ widgets });

        // 如果大小改变，需要重新渲染图表
        setTimeout(() => {
            const widget = widgets.find(w => w.id === widgetId);
            if (widget && this.chartInstances[widgetId]) {
                this.chartInstances[widgetId].resize();
            }
        }, 100);
    }
}

// 导出供外部使用
window.AnalysisBIPage = AnalysisBIPage;

/**
 * BI 仪表盘模块 - AnalysisBIPage
 * 支持仪表盘设计、图表布局、报表生成 - 接入后端正式 API
 */

class AnalysisBIPage extends Component {
    constructor(container, props) {
        super(container);
        this.state = {
            dashboards: [],
            currentDashboard: null,
            widgets: [],
            editMode: false,
            datasets: [],
            loading: false
        };
        this.chartInstances = {};
    }

    async afterMount() {
        this.bindEvents();
        await this.fetchDatasets();
        await this.loadDashboards();
    }

    async fetchDatasets() {
        try {
            const res = await AnalysisApi.getDatasets();
            this.setState({ datasets: res.data || [] });
        } catch (e) {
            console.error('获取数据集失败', e);
        }
    }

    async loadDashboards() {
        this.setState({ loading: true });
        try {
            const res = await AnalysisApi.getDashboards();
            if (res.code === 200) {
                this.setState({ dashboards: res.data || [], loading: false });
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            console.error('加载仪表盘失败', e);
            this.setState({ loading: false });
            Toast.error('加载列表失败: ' + e.message);
        }
    }

    bindEvents() {
        // 创建仪表盘
        this.delegate('click', '#btn-create-dashboard', () => {
            this.showCreateDashboardModal();
        });

        // 选择仪表盘
        this.delegate('click', '.dashboard-card', async (e, el) => {
            const id = el.dataset.id;
            try {
                const res = await AnalysisApi.getDashboard(id);
                if (res.code === 200) {
                    const dashboard = res.data;
                    this.setState({
                        currentDashboard: dashboard,
                        widgets: dashboard.widgets || [],
                        editMode: false
                    });
                    setTimeout(() => this.renderAllCharts(), 100);
                }
            } catch (e) {
                Toast.error('无法打开仪表盘: ' + e.message);
            }
        });

        // 切换编辑模式
        this.delegate('click', '#btn-toggle-edit', () => {
            this.setState({ editMode: !this.state.editMode });
            setTimeout(() => this.renderAllCharts(), 50);
        });

        // 添加组件
        this.delegate('click', '#btn-add-widget', () => {
            this.showAddWidgetModal();
        });

        // 返回列表
        this.delegate('click', '#btn-back-list', () => {
            this.setState({ currentDashboard: null, widgets: [], editMode: false });
            this.disposeAllCharts();
            this.loadDashboards(); // 刷新列表
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

        // 配置组件
        this.delegate('click', '.widget-config', (e, el) => {
            e.stopPropagation();
            const widgetId = el.closest('.bi-widget').dataset.widgetId;
            this.showWidgetConfigModal(widgetId);
        });

        // 删除组件
        this.delegate('click', '.widget-delete', (e, el) => {
            e.stopPropagation();
            const widgetId = el.closest('.bi-widget').dataset.widgetId;
            this.deleteWidget(widgetId);
        });
    }

    render() {
        const { currentDashboard, dashboards, loading } = this.state;

        if (currentDashboard) {
            return this.renderDashboardView();
        }

        const gradClasses = ['bg-gradient-1', 'bg-gradient-2', 'bg-gradient-3', 'bg-gradient-4', 'bg-gradient-5', 'bg-gradient-6'];

        return `
            <div class="bi-page">
                <div class="bi-header flex-between mb-20">
                    <div class="bi-title">
                        <h2>📊 BI 仪表盘</h2>
                        <p class="text-secondary">创建和管理数据可视化仪表盘 (正式版)</p>
                    </div>
                </div>

                ${loading ? `
                    <div class="flex-center p-50">
                        <div class="loading-spinner"></div>
                    </div>
                ` : `
                    <div class="dashboard-grid">
                        <!-- 新建卡片 -->
                        <div class="new-dashboard-card animate-in" id="btn-create-dashboard">
                            <div class="new-card-icon">➕</div>
                            <span style="font-weight: 600; font-size: 15px;">新建仪表盘</span>
                        </div>

                        ${dashboards.map((d, index) => {
            const gradClass = gradClasses[(d.id % gradClasses.length) || 0];
            // 随机图标
            const icons = ['📊', '📈', '📉', '🍩', '🎯', '💹'];
            const icon = icons[(d.id % icons.length) || 0];

            return `
                            <div class="dashboard-card animate-in" data-id="${d.id}" style="animation-delay: ${index * 50}ms">
                                <button class="btn-delete-dashboard" data-id="${d.id}" title="删除">🗑️</button>
                                
                                <div class="dashboard-cover ${gradClass}">
                                    <span class="dashboard-icon">${icon}</span>
                                </div>
                                <div class="dashboard-info">
                                    <div>
                                        <h4 title="${Utils.escapeHtml(d.name)}">${Utils.escapeHtml(d.name)}</h4>
                                        <p style="font-size: 12px; color: var(--color-text-tertiary); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5;">
                                            ${Utils.escapeHtml(d.description || '暂无描述信息')}
                                        </p>
                                    </div>
                                    <div class="dashboard-meta">
                                        <span>🧩 ${d.widgets?.length || 0} 组件</span>
                                        <span>🕒 ${Utils.formatDate(d.updated_at)}</span>
                                    </div>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                `}
            </div>
        `;
    }

    renderDashboardView() {
        const { currentDashboard, widgets, editMode } = this.state;

        return `
            <div class="bi-dashboard-view ${editMode ? 'edit-mode' : ''}" style="height: 100%; display: flex; flex-direction: column;">
                <div class="dashboard-toolbar flex-between p-15 bg-primary border-bottom shadow-sm">
                    <div class="toolbar-left flex align-center gap-15">
                        <button class="btn btn-ghost" id="btn-back-list">⬅️</button>
                        <div>
                            <h3 class="m-0">${Utils.escapeHtml(currentDashboard.name)}</h3>
                            <span class="text-xs text-tertiary">编辑模式: ${editMode ? '已开启' : '关闭'}</span>
                        </div>
                    </div>
                    <div class="toolbar-right flex gap-10">
                        ${editMode ? `
                            <button class="btn btn-secondary btn-sm" id="btn-add-widget">➕ 添加组件</button>
                            <button class="btn btn-primary btn-sm" id="btn-save-dashboard">💾 保存修改</button>
                        ` : ''}
                        <button class="btn btn-sm ${editMode ? 'btn-warning' : 'btn-ghost'}" id="btn-toggle-edit">
                            ${editMode ? '✓ 预览' : '✏️ 设计'}
                        </button>
                    </div>
                </div>

                <div class="widget-canvas p-20 flex-1 overflow-auto" id="widgetCanvas" 
                     style="display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 200px; gap: 20px;">
                    ${widgets.length === 0 ? `
                        <div class="empty-canvas flex-center flex-col p-50" style="grid-column: span 6;">
                            <div class="text-4xl mb-20 opacity-30">📊</div>
                            <p class="text-secondary text-lg">画布空空如也。点击右上方“设计”按钮开始添加图表组件。</p>
                        </div>
                    ` : widgets.map(w => this.renderWidget(w)).join('')}
                </div>
            </div>
        `;
    }

    renderWidget(widget) {
        const { editMode } = this.state;
        const colSpan = widget.colSpan || 2;
        const rowSpan = widget.rowSpan || 1;

        return `
            <div class="bi-widget card shadow-sm flex flex-col animate-in" 
                 data-widget-id="${widget.id}"
                 style="grid-column: span ${colSpan}; grid-row: span ${rowSpan}; background: var(--color-bg-primary); border-radius: 10px; overflow: hidden; border: 1px solid var(--color-border-light);">
                <div class="widget-header p-10 flex-between bg-secondary border-bottom">
                    <span class="widget-title font-bold text-sm">${Utils.escapeHtml(widget.title)}</span>
                    ${editMode ? `
                        <div class="widget-actions flex gap-5">
                            <button class="widget-config btn-icon btn-ghost btn-xs p-2" title="配置">⚙️</button>
                            <button class="widget-delete btn-icon btn-ghost btn-xs p-2" title="删除">🗑️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="widget-body flex-1 p-10" id="widget-chart-${widget.id}" style="min-height: 0;">
                    <div class="flex-center h-100 text-tertiary">
                        <div class="loading-spinner-xs"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderAllCharts() {
        // 顺序渲染，避免同时发起大量请求
        const widgets = this.state.widgets;
        let index = 0;

        const renderNext = () => {
            if (index < widgets.length) {
                this.renderWidgetChart(widgets[index]).finally(() => {
                    index++;
                    // 使用 requestAnimationFrame 优化渲染性能
                    requestAnimationFrame(renderNext);
                });
            }
        };

        renderNext();
    }

    async renderWidgetChart(widget) {
        const container = document.getElementById(`widget-chart-${widget.id}`);
        if (!container) return;

        // 销毁旧实例
        if (this.chartInstances[widget.id]) {
            this.chartInstances[widget.id].dispose();
            delete this.chartInstances[widget.id];
        }

        try {
            // 使用数据缓存，避免同一数据集重复请求
            const cacheKey = `dataset_${widget.datasetId}`;
            let data;

            if (!this._dataCache) this._dataCache = {};
            if (this._dataCache[cacheKey]) {
                data = this._dataCache[cacheKey];
            } else {
                const res = await AnalysisApi.getDatasetData(widget.datasetId, {
                    page: 1,
                    size: 500
                });
                data = res.data?.items || [];
                // 缓存 30 秒
                this._dataCache[cacheKey] = data;
                setTimeout(() => { delete this._dataCache[cacheKey]; }, 30000);
            }

            if (data.length === 0) {
                container.innerHTML = '<div class="flex-center h-100 text-tertiary text-xs">暂无数据内容</div>';
                return;
            }

            container.innerHTML = '';
            const chart = echarts.init(container, document.body.classList.contains('dark') ? 'dark' : 'light');
            this.chartInstances[widget.id] = chart;

            const option = this.buildChartOption(widget, data);
            chart.setOption(option);

            // 使用防抖的 resize 监听器（全局共享）
            if (!this._resizeHandler) {
                this._resizeHandler = Utils.debounce(() => {
                    Object.values(this.chartInstances).forEach(c => c && c.resize());
                }, 200);
                window.addEventListener('resize', this._resizeHandler);
            }
        } catch (e) {
            container.innerHTML = `<div class="flex-center h-100 text-error text-xs">加载失败: ${e.message}</div>`;
        }
    }

    buildChartOption(widget, data) {
        const { chartType, xField, yField, aggregateType, theme = 'blue' } = widget.config || {};
        const aggregated = this.aggregateData(data, xField, yField, aggregateType || 'count');
        const names = aggregated.map(d => d.name);
        const values = aggregated.map(d => d.value);

        const isDark = document.body.classList.contains('dark');
        const textColor = isDark ? '#aaa' : '#666';

        // 颜色主题定义
        const colors = {
            blue: ['#3b82f6', '#60a5fa'],
            green: ['#10b981', '#34d399'],
            orange: ['#f59e0b', '#fbbf24'],
            purple: ['#8b5cf6', '#a78bfa'],
            red: ['#ef4444', '#f87171'],
            multi: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6']
        };
        const activeColor = colors[theme] || colors.blue;
        const mainColor = activeColor[0];

        // 渐变色生成 (仅单色主题)
        let itemStyleColor = mainColor;
        if (theme !== 'multi') {
            itemStyleColor = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: activeColor[0] },
                { offset: 1, color: activeColor[1] || activeColor[0] }
            ]);
        }

        const baseOption = {
            backgroundColor: 'transparent',
            tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis' },
            grid: { left: '5%', right: '5%', bottom: '10%', top: '15%', containLabel: true },
            color: theme === 'multi' ? activeColor : [mainColor]
        };

        const seriesItemStyle = {
            borderRadius: [4, 4, 0, 0],
            color: itemStyleColor
        };

        switch (chartType) {
            case 'bar':
                return {
                    ...baseOption,
                    xAxis: { type: 'category', data: names, axisLabel: { color: textColor, rotate: names.length > 5 ? 30 : 0 } },
                    yAxis: { type: 'value', axisLabel: { color: textColor }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.1 } } },
                    series: [{ type: 'bar', data: values, itemStyle: seriesItemStyle }]
                };
            case 'line':
                return {
                    ...baseOption,
                    xAxis: { type: 'category', data: names, axisLabel: { color: textColor } },
                    yAxis: { type: 'value', axisLabel: { color: textColor }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.1 } } },
                    series: [{ type: 'line', data: values, smooth: true, areaStyle: { opacity: 0.2 }, itemStyle: { color: mainColor } }]
                };
            case 'pie':
                return {
                    ...baseOption,
                    series: [{
                        type: 'pie',
                        radius: ['45%', '75%'],
                        avoidLabelOverlap: false,
                        itemStyle: { borderRadius: 10, borderColor: isDark ? '#111' : '#fff', borderWidth: 2 },
                        label: { show: false, position: 'center' },
                        emphasis: { label: { show: true, fontSize: '14', fontWeight: 'bold' } },
                        data: aggregated.map(d => ({ name: d.name, value: d.value }))
                    }]
                };
            case 'gauge':
                const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
                return {
                    series: [{
                        type: 'gauge',
                        progress: { show: true, width: 10 },
                        axisLine: { lineStyle: { width: 10 } },
                        axisTick: { show: false },
                        splitLine: { length: 8, lineStyle: { width: 2, color: '#999' } },
                        axisLabel: { distance: 15, color: '#999', fontSize: 10 },
                        detail: { valueAnimation: true, fontSize: 20, offsetCenter: [0, '60%'], color: isDark ? '#fff' : '#000' },
                        data: [{ value: Math.round(avg * 10) / 10 }]
                    }]
                };
            default:
                return baseOption;
        }
    }

    aggregateData(data, xField, yField, aggregateType) {
        // 委托给 Utils.aggregateData，BI 仪表盘默认显示 15 项
        return Utils.aggregateData(data, xField, yField, aggregateType, { maxItems: 15, nullLabel: 'N/A' });
    }

    disposeAllCharts() {
        Object.values(this.chartInstances).forEach(chart => {
            if (chart) chart.dispose();
        });
        this.chartInstances = {};
    }

    showCreateDashboardModal() {
        Modal.show({
            title: '新建仪表盘',
            content: `
                <div class="form-group mb-15">
                    <label class="block mb-5 text-sm">仪表盘名称</label>
                    <input type="text" id="dashboard-name" class="form-control" placeholder="输入名称 (如: 销售情况汇总)">
                </div>
                <div class="form-group">
                    <label class="block mb-5 text-sm">备注描述 (可选)</label>
                    <textarea id="dashboard-desc" class="form-control" rows="3" placeholder="简要描述仪表盘用途"></textarea>
                </div>
            `,
            onConfirm: async () => {
                const name = document.getElementById('dashboard-name')?.value?.trim();
                const description = document.getElementById('dashboard-desc')?.value?.trim();
                if (!name) {
                    Toast.error('请输入名称');
                    return false;
                }

                try {
                    const res = await AnalysisApi.createDashboard({ name, description, widgets: [] });
                    if (res.code === 200) {
                        Toast.success('仪表盘已创建');
                        await this.loadDashboards();
                        return true;
                    } else {
                        throw new Error(res.message);
                    }
                } catch (e) {
                    Toast.error('创建失败: ' + e.message);
                    return false;
                }
            }
        });
    }

    async deleteDashboard(id) {
        try {
            const res = await AnalysisApi.deleteDashboard(id);
            if (res.code === 200) {
                Toast.success('仪表盘已删除');
                await this.loadDashboards();
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            Toast.error('删除失败: ' + e.message);
        }
    }

    showAddWidgetModal() {
        const { datasets } = this.state;
        Modal.show({
            title: '添加组件',
            width: 500,
            content: `
                <div class="form-group mb-10">
                    <label class="text-xs">标题</label>
                    <input type="text" id="w-title" class="form-control" placeholder="图表标题">
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">数据集</label>
                    <select id="w-dataset" class="form-control">
                        <option value="">请选择...</option>
                        ${datasets.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">图表类型</label>
                    <select id="w-type" class="form-control">
                        <option value="bar">柱状图</option>
                        <option value="line">折线图</option>
                        <option value="pie">饼图</option>
                        <option value="gauge">仪表盘</option>
                    </select>
                </div>
                <div class="flex gap-10 mb-10">
                    <div class="flex-1">
                        <label class="text-xs">X轴 (分类)</label>
                        <select id="w-x" class="form-control"><option value="">请先选数据集</option></select>
                    </div>
                    <div class="flex-1">
                        <label class="text-xs">Y轴 (数值)</label>
                        <select id="w-y" class="form-control"><option value="">请先选数据集</option></select>
                    </div>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">聚合</label>
                    <select id="w-agg" class="form-control">
                        <option value="none">不聚合</option>
                        <option value="count">计数 (Count)</option>
                        <option value="sum">求和 (Sum)</option>
                        <option value="avg">平均 (Avg)</option>
                        <option value="max">最大 (Max)</option>
                        <option value="min">最小 (Min)</option>
                    </select>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">颜色主题</label>
                    <select id="w-theme" class="form-control">
                        <option value="blue">🔵 商务蓝</option>
                        <option value="green">🟢 清新绿</option>
                        <option value="orange">🟠 活力橙</option>
                        <option value="purple">🟣 优雅紫</option>
                        <option value="red">🔴 警示红</option>
                        <option value="multi">🌈 多彩混合</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="text-xs">布局大小</label>
                    <select id="w-size" class="form-control">
                        <option value="small">小 (1x2)</option>
                        <option value="medium" selected>中 (2x2)</option>
                        <option value="large">大 (3x2)</option>
                        <option value="wide">最宽 (6x1)</option>
                    </select>
                </div>
            `,
            onConfirm: () => {
                const title = document.getElementById('w-title').value.trim();
                const datasetId = document.getElementById('w-dataset').value;
                const chartType = document.getElementById('w-type').value;
                const xField = document.getElementById('w-x').value;
                const yField = document.getElementById('w-y').value;
                const agg = document.getElementById('w-agg').value;
                const theme = document.getElementById('w-theme').value;
                const size = document.getElementById('w-size').value;

                if (!title || !datasetId || !xField) {
                    Toast.error('缺少必填配置');
                    return false;
                }

                const widget = {
                    id: 'w_' + Date.now(),
                    title,
                    datasetId: parseInt(datasetId),
                    size,
                    colSpan: size === 'small' ? 2 : size === 'medium' ? 2 : size === 'large' ? 3 : 6,
                    rowSpan: size === 'wide' ? 1 : 2,
                    config: { chartType, xField, yField, aggregateType: agg, theme }
                };

                const widgets = [...this.state.widgets, widget];
                this.setState({ widgets });
                setTimeout(() => this.renderAllCharts(), 50);
                return true;
            }
        });

        // 绑定数据集联动机
        setTimeout(() => {
            const dsSelect = document.getElementById('w-dataset');
            if (dsSelect) {
                dsSelect.addEventListener('change', async (e) => {
                    const dsId = e.target.value;
                    if (!dsId) return;
                    try {
                        const res = await AnalysisApi.getDatasetData(dsId, { page: 1, size: 1 });
                        const options = (res.data?.columns || []).map(c => `<option value="${c}">${c}</option>`).join('');
                        document.getElementById('w-x').innerHTML = options;
                        document.getElementById('w-y').innerHTML = options;
                    } catch (err) { }
                });
            }
        }, 50);
    }

    deleteWidget(id) {
        if (this.chartInstances[id]) {
            this.chartInstances[id].dispose();
            delete this.chartInstances[id];
        }
        this.setState({ widgets: this.state.widgets.filter(w => w.id !== id) });
    }

    async saveCurrentDashboard() {
        const { currentDashboard, widgets } = this.state;
        try {
            const res = await AnalysisApi.updateDashboard(currentDashboard.id, {
                widgets: widgets
            });
            if (res.code === 200) {
                Toast.success('仪表盘已持久化到服务器');
                this.setState({ currentDashboard: res.data });
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            Toast.error('保存失败: ' + e.message);
        }
    }

    async showWidgetConfigModal(id) {
        const widget = this.state.widgets.find(w => w.id === id);
        if (!widget) return;

        // 确保数据集列表已加载
        if (this.state.datasets.length === 0) {
            await this.fetchDatasets();
        }

        const { datasets } = this.state;
        const config = widget.config || {};

        // 预先获取当前数据集的字段列，用于填充下拉框
        let fieldOptions = '<option value="">请先选数据集</option>';
        if (widget.datasetId) {
            try {
                const res = await AnalysisApi.getDatasetData(widget.datasetId, { page: 1, size: 1 });
                if (res.data?.columns) {
                    fieldOptions = res.data.columns.map(c => `<option value="${c}">${c}</option>`).join('');
                }
            } catch (e) { console.error(e); }
        }

        // 辅助函数：生成选中状态
        const sel = (val, target) => val === target ? 'selected' : '';

        Modal.show({
            title: '编辑组件配置',
            width: 500,
            content: `
                 <div class="form-group mb-10">
                    <label class="text-xs">标题</label>
                    <input type="text" id="cfg-w-title" class="form-control" value="${Utils.escapeHtml(widget.title)}">
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">数据集</label>
                    <select id="cfg-w-dataset" class="form-control">
                        <option value="">请选择...</option>
                        ${datasets.map(d => `<option value="${d.id}" ${sel(d.id, widget.datasetId)}>${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">图表类型</label>
                    <select id="cfg-w-type" class="form-control">
                        <option value="bar" ${sel('bar', config.chartType)}>柱状图</option>
                        <option value="line" ${sel('line', config.chartType)}>折线图</option>
                        <option value="pie" ${sel('pie', config.chartType)}>饼图</option>
                        <option value="gauge" ${sel('gauge', config.chartType)}>仪表盘</option>
                    </select>
                </div>
                <div class="flex gap-10 mb-10">
                    <div class="flex-1">
                        <label class="text-xs">X轴 (分类)</label>
                        <select id="cfg-w-x" class="form-control">
                            ${fieldOptions}
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="text-xs">Y轴 (数值)</label>
                        <select id="cfg-w-y" class="form-control">
                            ${fieldOptions}
                        </select>
                    </div>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">聚合</label>
                    <select id="cfg-w-agg" class="form-control">
                        <option value="none" ${sel('none', config.aggregateType)}>不聚合</option>
                        <option value="count" ${sel('count', config.aggregateType)}>计数 (Count)</option>
                        <option value="sum" ${sel('sum', config.aggregateType)}>求和 (Sum)</option>
                        <option value="avg" ${sel('avg', config.aggregateType)}>平均 (Avg)</option>
                         <option value="max" ${sel('max', config.aggregateType)}>最大 (Max)</option>
                        <option value="min" ${sel('min', config.aggregateType)}>最小 (Min)</option>
                    </select>
                </div>
                 <div class="form-group mb-10">
                    <label class="text-xs">颜色主题</label>
                    <select id="cfg-w-theme" class="form-control">
                        <option value="blue" ${sel('blue', config.theme)}>🔵 商务蓝</option>
                        <option value="green" ${sel('green', config.theme)}>🟢 清新绿</option>
                        <option value="orange" ${sel('orange', config.theme)}>🟠 活力橙</option>
                        <option value="purple" ${sel('purple', config.theme)}>🟣 优雅紫</option>
                        <option value="red" ${sel('red', config.theme)}>🔴 警示红</option>
                        <option value="multi" ${sel('multi', config.theme)}>🌈 多彩混合</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="text-xs">布局大小</label>
                    <select id="cfg-w-size" class="form-control">
                        <option value="small" ${sel('small', widget.size)}>小 (1x2)</option>
                        <option value="medium" ${sel('medium', widget.size)}>中 (2x2)</option>
                        <option value="large" ${sel('large', widget.size)}>大 (3x2)</option>
                        <option value="wide" ${sel('wide', widget.size)}>最宽 (6x1)</option>
                    </select>
                </div>
            `,
            onConfirm: () => {
                const title = document.getElementById('cfg-w-title').value.trim();
                const datasetId = document.getElementById('cfg-w-dataset').value;
                const chartType = document.getElementById('cfg-w-type').value;
                const xField = document.getElementById('cfg-w-x').value;
                const yField = document.getElementById('cfg-w-y').value;
                const agg = document.getElementById('cfg-w-agg').value;
                const theme = document.getElementById('cfg-w-theme').value;
                const size = document.getElementById('cfg-w-size').value;

                if (!title || !datasetId || !xField) {
                    Toast.error('缺少必填配置');
                    return false;
                }

                const colSpan = size === 'small' ? 2 : size === 'medium' ? 2 : size === 'large' ? 3 : 6;
                const rowSpan = size === 'wide' ? 1 : 2;

                const updated = this.state.widgets.map(w => w.id === id ? {
                    ...w,
                    title,
                    datasetId: parseInt(datasetId),
                    size,
                    colSpan,
                    rowSpan,
                    config: { chartType, xField, yField, aggregateType: agg, theme }
                } : w);

                this.setState({ widgets: updated });
                setTimeout(() => this.renderAllCharts(), 50);
                return true;
            }
        });

        // 绑定后处理：设置字段的回显值
        setTimeout(() => {
            const elX = document.getElementById('cfg-w-x');
            const elY = document.getElementById('cfg-w-y');
            if (elX) elX.value = config.xField || '';
            if (elY) elY.value = config.yField || '';

            // 监听数据集变化
            const dsSelect = document.getElementById('cfg-w-dataset');
            if (dsSelect) {
                dsSelect.addEventListener('change', async (e) => {
                    const dsId = e.target.value;
                    if (!dsId) return;
                    try {
                        const res = await AnalysisApi.getDatasetData(dsId, { page: 1, size: 1 });
                        const options = (res.data?.columns || []).map(c => `<option value="${c}">${c}</option>`).join('');
                        document.getElementById('cfg-w-x').innerHTML = options;
                        document.getElementById('cfg-w-y').innerHTML = options;
                    } catch (err) { }
                });
            }
        }, 50);
    }
}

window.AnalysisBIPage = AnalysisBIPage;

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
            // 如果是401错误，API层已经处理了跳转，这里静默处理
            if (e.message && e.message.includes('登录')) {
                return; // 已跳转登录页，不需要显示错误
            }
            // 其他错误静默处理
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
            this.setState({ loading: false });
            // 如果是401错误，API层已经处理了跳转，不需要显示错误
            if (e.message && !e.message.includes('登录')) {
                Toast.error('加载列表失败: ' + e.message);
            }
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

        // 大屏模式切换
        this.delegate('click', '#btn-fullscreen', () => this.toggleFullScreen(true));
        this.delegate('click', '#fullscreen-exit-btn button', () => this.toggleFullScreen(false));
    }

    // 切换大屏模式
    toggleFullScreen(enable) {
        const view = document.querySelector('.bi-dashboard-view');
        if (!view) return;

        if (enable) {
            // 进入全屏
            if (view.requestFullscreen) {
                view.requestFullscreen();
            } else if (view.webkitRequestFullscreen) {
                view.webkitRequestFullscreen();
            }
            view.classList.add('data-screen-mode');
            document.getElementById('fullscreen-exit-btn').classList.remove('display-none');

            // 自动强制重绘所有图表以适应尺寸
            setTimeout(() => this.renderAllCharts(), 500);
        } else {
            // 退出全屏
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            view.classList.remove('data-screen-mode');
            document.getElementById('fullscreen-exit-btn').classList.add('display-none');

            setTimeout(() => this.renderAllCharts(), 500);
        }
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
                        <p class="text-secondary">创建和管理数据可视化仪表盘</p>
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
                        <button class="btn btn-sm btn-ghost" id="btn-fullscreen" title="进入全屏演示">🖥️ 大屏演示</button>
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

                <!-- 大屏模式退出按钮 (默认隐藏) -->
                <div id="fullscreen-exit-btn" class="fixed top-20 right-20 z-50 display-none">
                    <button class="btn btn-secondary btn-sm shadow-lg opacity-80 hover:opacity-100">❌ 退出大屏</button>
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
            if (!this._dataCacheTimestamps) this._dataCacheTimestamps = {};
            
            const cacheEntry = this._dataCache[cacheKey];
            const cacheTimestamp = this._dataCacheTimestamps[cacheKey];
            const cacheTTL = 30000; // 30秒缓存时间
            
            // 检查缓存是否有效（存在且未过期）
            if (cacheEntry && cacheTimestamp && (Date.now() - cacheTimestamp < cacheTTL)) {
                data = cacheEntry;
            } else {
                const res = await AnalysisApi.getDatasetData(widget.datasetId, {
                    page: 1,
                    size: 500
                });
                data = res.data?.items || [];
                // 缓存数据和时间戳
                this._dataCache[cacheKey] = data;
                this._dataCacheTimestamps[cacheKey] = Date.now();
            }

            if (data.length === 0) {
                container.innerHTML = '<div class="flex-center h-100 text-tertiary text-xs">暂无数据内容</div>';
                return;
            }

            container.innerHTML = '';
            container.innerHTML = '';
            // 检测大屏模式，强制使用 dark 主题
            const isDataScreen = document.querySelector('.data-screen-mode') !== null;
            const themeMode = (document.body.classList.contains('dark') || isDataScreen) ? 'dark' : 'light';

            const chart = echarts.init(container, themeMode);
            // 如果是大屏模式，手动覆盖背景透明
            if (isDataScreen) {
                chart.setOption({ backgroundColor: 'transparent' });
            }
            this.chartInstances[widget.id] = chart;

            chart.setOption({ backgroundColor: 'transparent' });
            this.chartInstances[widget.id] = chart;

            // 1. 数据筛选与聚合
            const { chartType, xField, yField, y2Field, stacked, showLabel, aggregateType, theme = 'blue' } = widget.config || {};

            // 使用 ChartFactory 进行数据预处理（筛选/排除）
            const filteredData = ChartFactory.filterData(data, widget.config || {});
            const aggregated = this.aggregateData(filteredData, xField, yField, aggregateType || 'count');

            // 2. 颜色映射 (BI 主题色 -> ChartFactory 颜色数组)
            const biColors = {
                blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
                green: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
                orange: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
                purple: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
                red: ['#ef4444', '#f87171', '#fca5a5', '#fecaca'],
                multi: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6']
            };
            const colorScheme = biColors[theme] || biColors.blue;

            // 3. 使用 ChartFactory 生成 Option
            const option = ChartFactory.generateOption(chartType, aggregated, {
                xField: 'name', // 聚合后的字段名固定为 name
                yField: 'value', // 聚合后的字段名固定为 value
                y2Field: y2Field, // 次要 Y 轴字段 (如果存在)
                dualAxis: !!y2Field, // 是否启用双轴
                stacked: stacked, // 是否堆叠
                showLabel: showLabel, // 是否显示标签
                colorScheme: colorScheme, // 传入数组
                customTitle: ' ' // 隐藏 ChartFactory 的内部标题，因为 Widget 外部有标题
            }, filteredData); // 关键：传入筛选后的 filteredData 作为 rawData

            // 4. 应用 Option
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

    // buildChartOption 已移除，逻辑迁移至 ChartFactory

    aggregateData(data, xField, yField, aggregateType) {
        // 委托给 Utils.aggregateData，BI 仪表盘默认显示 15 项
        return Utils.aggregateData(data, xField, yField, aggregateType, { maxItems: 15, nullLabel: 'N/A' });
    }

    disposeAllCharts() {
        // 清理所有图表实例
        Object.values(this.chartInstances).forEach(chart => {
            if (chart) chart.dispose();
        });
        this.chartInstances = {};
        
        // 清理 resize 监听器
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        
        // 清理数据缓存
        if (this._dataCache) {
            this._dataCache = {};
        }
        if (this._dataCacheTimestamps) {
            this._dataCacheTimestamps = {};
        }
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
                // 【核心修复】保存触发重绘后，必须重新初始化图表实例
                setTimeout(() => this.renderAllCharts(), 100);
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
            } catch (e) {
                // 获取字段失败，静默处理
            }
        }

        // 准备初始值
        const initialValues = {
            title: widget.title,
            datasetId: widget.datasetId,
            size: widget.size,
            ...(widget.config || {})
        };

        // 生成表单 HTML
        const contentHtml = ChartConfigUI.getFormHtml({
            values: initialValues,
            datasets: datasets,
            fieldOptions: fieldOptions,
            showLayoutConfig: true // BI 模块需要布局配置
        });

        Modal.show({
            title: '编辑组件配置',
            width: 500,
            content: contentHtml,
            onConfirm: () => {
                // 使用 ChartConfigUI 统一获取值
                const values = ChartConfigUI.getFormValues();

                if (!values.title || !values.datasetId || !values.xField) {
                    Toast.error('缺少必填配置');
                    return false;
                }

                const size = values.size;
                const colSpan = size === 'small' ? 2 : size === 'medium' ? 2 : size === 'large' ? 3 : 6;
                const rowSpan = size === 'wide' ? 1 : 2;

                const updated = this.state.widgets.map(w => w.id === id ? {
                    ...w,
                    title: values.title,
                    datasetId: parseInt(values.datasetId),
                    size: values.size,
                    colSpan,
                    rowSpan,
                    // 将其余配置存入 config
                    config: values
                } : w);

                this.setState({ widgets: updated });
                setTimeout(() => this.renderAllCharts(), 50);
                return true;
            }
        });

        // 绑定后处理：监听数据集变化
        setTimeout(() => {
            const dsSelect = document.getElementById('cfg-w-dataset');
            if (dsSelect) {
                dsSelect.addEventListener('change', async (e) => {
                    const dsId = e.target.value;
                    if (!dsId) return;
                    try {
                        const res = await AnalysisApi.getDatasetData(dsId, { page: 1, size: 1 });
                        const options = (res.data?.columns || []).map(c => `<option value="${c}">${c}</option>`).join('');
                        // 使用 ChartConfigUI 统一更新所有字段下拉框
                        ChartConfigUI.updateFieldOptions(options);
                    } catch (err) { }
                });
            }
        }, 50);
    }
}

window.AnalysisBIPage = AnalysisBIPage;

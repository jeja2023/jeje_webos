/**
 * 数据分析模块 - 图表分析功能
 */

const AnalysisChartMixin = {

    /**
     * 渲染图表分析页面
     */
    renderCharts() {
        // 1. 详细查看模式
        if (this.state.viewingChartId) {
            return this.renderChartViewer();
        }

        // 2. 图表库模式
        if (this.state.showChartHub) {
            return this.renderChartHub();
        }

        // 3. 默认：图表生成工作区
        return this.renderChartWorkspace();
    },

    /**
     * 渲染图表生成工作区
     */
    renderChartWorkspace() {
        const { datasets, chartType } = this.state;
        return `
            <div class="p-20 charts-page anim-fade-in">
                <div class="flex-between mb-25">
                    <div>
                        <h2 class="m-0">📊 图表分析</h2>
                        <p class="text-secondary text-sm mt-5">多维数据探索与可视化建模</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-open-chart-hub">
                        🗃️ 查看图表库
                    </button>
                </div>
                
                <div class="charts-layout" style="display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start;">
                    <!-- 左侧：配置面板 -->
                    <div class="chart-config-panel bg-card rounded-xl border p-20 shadow-sm">
                        <div class="config-section mb-20">
                            <h4 class="mt-0 mb-12 text-sm">数据源</h4>
                            <div class="form-group">
                                <select id="chart-dataset" class="form-control">
                                    <option value="">请选择数据集...</option>
                                    ${datasets.map(d => `<option value="${d.id}" ${this.state.chartDatasetId == d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="config-section mb-20">
                            <h4 class="mt-0 mb-12 text-sm">图表类型</h4>
                            <div class="chart-type-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                                ${this._renderChartTypeButtons()}
                            </div>
                        </div>
                        
                        <div class="config-section mb-20">
                            <h4 class="mt-0 mb-12 text-sm">数据映射</h4>
                            <div id="chart-mapping-fields">
                                ${this._renderMappingFields()}
                            </div>
                        </div>
                        
                        <div class="flex-column gap-10 mt-25">
                            <button class="btn btn-primary w-100" id="btn-generate-chart" style="transition: all 0.1s ease;">🎨 生成图表</button>
                            <button class="btn btn-outline-primary w-100" id="btn-save-chart" 
                                    ${!this.state.hasGeneratedChart ? 'disabled' : ''}
                                    style="transition: all 0.1s ease; ${!this.state.hasGeneratedChart ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                💾 保存图表
                            </button>
                        </div>
                    </div>
                    
                    <!-- 右侧：图表展示区 -->
                    <div class="chart-main-area bg-card rounded-xl border shadow-sm p-30" style="min-height: 600px; display: flex; flex-direction: column;">
                        <div id="chart-container" style="flex: 1; min-height: 500px;">
                            <div class="h-100 flex-center text-secondary italic">
                                <div>
                                    <div style="font-size: 40px; margin-bottom: 15px;">📊</div>
                                    <p>请在左侧配置参数并点击生成</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染图表库
     */
    renderChartHub() {
        return `
            <div class="p-25 charts-page anim-fade-in">
                <div class="flex-between mb-30">
                    <div class="flex-center gap-15">
                        <button class="btn-icon" id="btn-close-chart-hub">⬅️</button>
                        <div>
                            <h2 class="m-0">🗃️ 图表库</h2>
                            <p class="text-secondary text-sm mt-5">管理和调用已保存的业务图表组件</p>
                        </div>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-secondary btn-sm" id="btn-refresh-charts">
                            🔄 刷新列表
                        </button>
                        <button class="btn btn-primary btn-sm" id="btn-goto-generator">
                            ➕ 新建图表分析
                        </button>
                    </div>
                </div>

                <div id="saved-charts-list" class="flex flex-wrap gap-20">
                    <div class="text-center p-50 w-100 text-secondary bg-tertiary rounded-xl border-dashed">
                        <span class="anim-pulse">正在获取同步云端资产...</span>
                    </div>
                </div>
            </div>
        `;
    },

    _renderChartTypeButtons() {
        const types = [
            { id: 'bar', icon: '📊', name: '柱状图' },
            { id: 'pie', icon: '🥧', name: '饼图' },
            { id: 'line', icon: '📈', name: '折线图' },
            { id: 'scatter', icon: '⚬', name: '散点图' },
            { id: 'histogram', icon: '📶', name: '直方图' },
            { id: 'boxplot', icon: '📦', name: '箱线图' },
            { id: 'heatmap', icon: '🔥', name: '热力图' },
            { id: 'forecast', icon: '🔮', name: '预测' }
        ];
        return types.map(t => `
            <button class="chart-type-btn ${this.state.chartType === t.id ? 'active' : ''}" 
                    data-chart-type="${t.id}" 
                    title="${t.name}"
                    style="padding: 8px; font-size: 18px;">
                ${t.icon}
            </button>
        `).join('');
    },

    _renderMappingFields() {
        const { chartType } = this.state;
        if (['histogram', 'boxplot'].includes(chartType)) {
            return `
                <div class="form-group">
                    <label class="text-xs text-secondary mb-5">数值字段</label>
                    <select id="chart-x-field" class="form-control"></select>
                </div>
            `;
        }
        if (chartType === 'heatmap') {
            return `
                <div class="form-group">
                    <label class="text-xs text-secondary mb-5">数值字段 (多选)</label>
                    <select id="chart-x-field" class="form-control" multiple size="5"></select>
                </div>
            `;
        }
        if (chartType === 'forecast') {
            return `
                <div class="form-group mb-10">
                    <label class="text-xs text-secondary mb-5">时间/顺序字段</label>
                    <select id="chart-x-field" class="form-control"></select>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs text-secondary mb-5">目标数值</label>
                    <select id="chart-y-field" class="form-control"></select>
                </div>
                <div class="form-group">
                    <label class="text-xs text-secondary mb-5">预测步数</label>
                    <input type="number" id="forecast-steps" class="form-control" value="5" min="1">
                </div>
            `;
        }
        return `
            <div class="form-group mb-10">
                <label class="text-xs text-secondary mb-5">${chartType === 'pie' ? '分类维度' : 'X轴维度'}</label>
                <select id="chart-x-field" class="form-control"></select>
            </div>
            <div class="form-group mb-10" ${chartType === 'pie' ? 'style="display:none"' : ''}>
                <label class="text-xs text-secondary mb-5">Y轴指标</label>
                <select id="chart-y-field" class="form-control"></select>
            </div>
            <div class="form-group">
                <label class="text-xs text-secondary mb-5">聚合计算</label>
                <select id="chart-aggregate" class="form-control">
                    <option value="value">不聚合</option>
                    <option value="avg">平均值</option>
                    <option value="sum">求和</option>
                    <option value="count">计数</option>
                </select>
            </div>
        `;
    },

    /**
     * 渲染单个图表的详情查看页面
     */
    renderChartViewer() {
        const chartId = this.state.viewingChartId;
        const chart = this.state.savedCharts?.find(c => c.id === chartId);
        if (!chart) return `<div class="p-40 text-center">图表已失效</div>`;

        const dsName = this.state.datasets?.find(d => d.id === chart.dataset_id)?.name || '未知数据集';

        return `
            <div class="flex-column h-100 anim-fade-in" style="background: var(--color-bg-secondary);">
                <!-- 顶部导航 -->
                <div class="flex-between px-20 py-12 border-bottom bg-primary shadow-sm">
                    <div class="flex-center gap-15">
                        <button class="btn btn-ghost btn-sm" id="btn-close-chart-viewer">
                            <span style="font-size: 18px;">⬅️</span> 返回列表
                        </button>
                        <div class="flex-column">
                            <h3 class="m-0 text-md">${chart.name}</h3>
                            <span class="text-xs text-secondary">资源类型: 可视化图表 / 数据源: ${dsName}</span>
                        </div>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-primary btn-sm" id="btn-export-viewer-chart">🖨️ 导出图片</button>
                    </div>
                </div>

                <!-- 内容区 -->
                <div class="flex-1 p-25 overflow-y-auto">
                    <div class="max-w-1000 mx-auto">
                        <!-- 图表主展示卡片 -->
                        <div class="bg-card rounded-xl shadow-lg border p-25 mb-25" style="min-height: 500px;">
                            <div id="viewer-chart-container" style="width: 100%; height: 500px;"></div>
                        </div>

                        <!-- 详情信息网格 -->
                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                            <div class="bg-card rounded-xl border p-20 shadow-sm">
                                <h4 class="mt-0 mb-15 text-sm text-secondary">📝 图表描述</h4>
                                <p class="m-0 text-sm line-height-relaxed">
                                    ${chart.description || '<span class="text-tertiary italic">暂无详细描述...</span>'}
                                </p>
                            </div>
                            <div class="bg-card rounded-xl border p-20 shadow-sm">
                                <h4 class="mt-0 mb-15 text-sm text-secondary">📊 元数据</h4>
                                <div class="flex-column gap-10">
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">图表类型</span>
                                        <span class="badge badge-info">${this.getChartTypeName(chart.chart_type)}</span>
                                    </div>
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">维度 (X轴)</span>
                                        <span class="font-bold">${chart.config.xField || '-'}</span>
                                    </div>
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">指标 (Y轴)</span>
                                        <span class="font-bold">${chart.config.yField || '-'}</span>
                                    </div>
                                    <div class="flex-between text-xs border-top pt-10 mt-5">
                                        <span class="text-secondary">收录时间</span>
                                        <span>${Utils.formatDate(chart.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 生成图表逻辑
     */
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

        // 保存当前选择的配置到 state（用于后续保存图表）
        const forecastSteps = parseInt(document.getElementById('forecast-steps')?.value) || 5;
        this.state.chartConfig = {
            datasetId,
            xField,
            yField,
            aggregate,
            xFields: selectedFields.length > 0 ? selectedFields : undefined,
            forecastSteps
        };

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
                this.renderForecast(data, xField, yField, forecastSteps);
                break;
            default:
                // 基础图表（柱状图、饼图、折线图、散点图）
                const aggregatedData = this.aggregateData(data, xField, yField, aggregate);
                this.renderEChart(chartType, aggregatedData, xField, yField || '数量');
        }

        // 生成成功后启用保存按钮（不触发完整重新渲染）
        this.state.hasGeneratedChart = true;
        // 只更新保存按钮的状态
        const saveBtn = document.getElementById('btn-save-chart');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }
    },

    /**
     * 数据聚合处理 (委托给 Utils.aggregateData)
     */
    aggregateData(data, xField, yField, aggregateType) {
        return Utils.aggregateData(data, xField, yField, aggregateType, { maxItems: 20 });
    },

    /**
     * 渲染 ECharts 基础图表 (柱状、饼图、折线、散点)
     * 使用统一的容器初始化方法，简化逻辑
     */
    renderEChart(chartType, data, xLabel, yLabel) {
        // 使用统一的容器初始化方法
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        
        const { container, instance } = result;
        
        // 立即渲染图表配置
        this._renderChartOption(instance, chartType, data, xLabel, yLabel);
        
        // 使用 setTimeout 确保 resize 在渲染后执行
        setTimeout(() => {
            if (instance) {
                try {
                    const rect = container.getBoundingClientRect();
                    
                    // 如果尺寸为0，尝试修复
                    if (rect.width === 0 || rect.height === 0) {
                        const parent = container.parentElement;
                        const parentWidth = parent ? (parent.offsetWidth - 60) : 800;
                        container.style.width = `${Math.max(parentWidth, 600)}px`;
                        container.style.height = '500px';
                    }
                    
                    instance.resize();
                } catch (e) {
                    // 静默处理 resize 错误
                }
            }
        }, 100);
    },
    
    _renderChartOption(instance, chartType, data, xLabel, yLabel) {
        if (!instance) {
            Toast.error('图表初始化失败，请刷新页面重试');
            return;
        }

        if (!data || data.length === 0) {
            Toast.error('图表数据为空，无法生成图表');
            return;
        }
        
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

        // 设置图表配置
        try {
            instance.setOption(option, true);
            Toast.success('图表生成成功');
        } catch (e) {
            Toast.error(`图表配置失败: ${e.message}`);
            return;
        }
        
        // 响应式调整（避免重复添加监听器）
        this._ensureResizeHandler('chartInstance', '_chartResizeHandler');
    },
    
    /**
     * 确保 resize 监听器已添加（避免重复添加）
     * @param {string} instanceKey - 实例键名
     * @param {string} handlerKey - 处理器键名
     */
    _ensureResizeHandler(instanceKey, handlerKey) {
        if (!this[handlerKey]) {
            this[handlerKey] = () => {
                if (this[instanceKey]) {
                    this[instanceKey].resize();
                }
            };
            window.addEventListener('resize', this[handlerKey]);
        }
    },

    /**
     * 统一的容器初始化和图表实例管理
     * @param {string} containerId - 容器ID
     * @param {string} instanceKey - 实例键名 ('chartInstance' 或 'viewerChartInstance')
     * @returns {Object|null} - {container, instance} 或 null
     */
    _initChartContainer(containerId, instanceKey = 'chartInstance') {
        const container = document.getElementById(containerId);
        if (!container) {
            return null;
        }

        // 清除容器内容
        container.innerHTML = '';
        
        // 统一设置容器样式
        container.style.position = 'relative';
        container.style.width = '100%';
        container.style.height = '500px';
        container.style.minHeight = '500px';
        container.style.display = 'block';
        container.style.visibility = 'visible';
        container.style.opacity = '1';
        container.style.overflow = 'visible';

        // 销毁旧实例
        const oldInstance = this[instanceKey];
        if (oldInstance) {
            try {
                oldInstance.dispose();
            } catch (e) {
                // 静默处理销毁错误
            }
            this[instanceKey] = null;
        }

        // 检查 ECharts 是否已加载
        if (!window.echarts) {
            Toast.error('图表库未加载，请刷新页面');
            return null;
        }

        // 初始化新实例
        try {
            const instance = echarts.init(container, 'dark');
            if (!instance) {
                Toast.error('图表初始化失败');
                return null;
            }
            this[instanceKey] = instance;
            return { container, instance };
        } catch (e) {
            Toast.error(`图表初始化失败: ${e.message}`);
            return null;
        }
    },

    /**
     * 统一的图表渲染后处理（resize 和成功提示）
     * @param {Object} instance - ECharts 实例
     * @param {string} successMessage - 成功消息
     */
    _finalizeChartRender(instance, successMessage) {
        if (!instance) return;

        // 延迟 resize 确保容器尺寸已稳定
        setTimeout(() => {
            try {
                instance.resize();
            } catch (e) {
                // 静默处理 resize 错误
            }
        }, 100);

        // 显示成功消息
        if (successMessage) {
            Toast.success(successMessage);
        }
    },

    /**
     * 当数据集切换时，更新可选字段列表
     */
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
            // 静默处理获取字段失败
        }
    },

    /**
     * 渲染直方图
     */
    renderHistogram(data, field) {
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        
        const { instance } = result;
        // 立即渲染，不使用延迟
        this._renderHistogramData(instance, data, field);
    },
    
    _renderHistogramData(instance, data, field) {
        if (!instance) return;

        const values = data
            .map(row => parseFloat(row[field]))
            .filter(v => !isNaN(v));

        if (values.length === 0) {
            Toast.error('所选字段没有有效的数值数据');
            return;
        }

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
                axisLabel: { rotate: 45, color: '#aaa', fontSize: 10 }
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

        instance.setOption(option, true);
        
        // resize 和成功提示
        setTimeout(() => {
            if (instance) instance.resize();
        }, 100);
        Toast.success('直方图生成成功');
        
        // 响应式调整
        this._ensureResizeHandler('chartInstance', '_chartResizeHandler');
    },

    /**
     * 渲染箱线图
     */
    renderBoxplot(data, field) {
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        
        const { instance } = result;
        // 立即渲染，不使用延迟
        this._renderBoxplotData(instance, data, field);
    },
    
    _renderBoxplotData(instance, data, field) {
        if (!instance) return;

        const values = data
            .map(row => parseFloat(row[field]))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);

        if (values.length < 5) {
            Toast.error('数据量不足，无法生成箱线图（至少需要5条数据）');
            return;
        }

        const n = values.length;
        const q1 = values[Math.floor(n * 0.25)];
        const q2 = values[Math.floor(n * 0.5)];
        const q3 = values[Math.floor(n * 0.75)];
        const min = values[0];
        const max = values[n - 1];
        const iqr = q3 - q1;
        const lowerWhisker = Math.max(min, q1 - 1.5 * iqr);
        const upperWhisker = Math.min(max, q3 + 1.5 * iqr);

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
                            中值: ${q2.toFixed(2)}<br/>
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
                    itemStyle: { color: '#91cc75', borderColor: '#5470c6' }
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

        instance.setOption(option, true);
        
        // resize 和成功提示
        setTimeout(() => {
            if (instance) instance.resize();
        }, 100);
        Toast.success('箱线图生成成功');
        
        // 响应式调整
        this._ensureResizeHandler('chartInstance', '_chartResizeHandler');
    },

    /**
     * 渲染热力图
     */
    renderHeatmap(data, fields) {
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        
        const { instance } = result;
        // 立即渲染，不使用延迟
        this._renderHeatmapData(instance, data, fields);
    },
    
    _renderHeatmapData(instance, data, fields) {
        if (!instance) return;

        const matrix = [];
        const fieldData = {};
        fields.forEach(f => {
            fieldData[f] = data.map(row => parseFloat(row[f])).filter(v => !isNaN(v));
        });

        const calcCorrelation = (x, y) => {
            const length = Math.min(x.length, y.length);
            if (length < 2) return 0;
            const meanX = x.slice(0, length).reduce((a, b) => a + b, 0) / length;
            const meanY = y.slice(0, length).reduce((a, b) => a + b, 0) / length;
            let num = 0, denX = 0, denY = 0;
            for (let i = 0; i < length; i++) {
                const dx = x[i] - meanX, dy = y[i] - meanY;
                num += dx * dy; denX += dx * dx; denY += dy * dy;
            }
            const den = Math.sqrt(denX * denY);
            return den === 0 ? 0 : num / den;
        };

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
                formatter: (p) => `${fields[p.data[0]]} ↔ ${fields[p.data[1]]}<br/>相关系数: ${p.data[2]}`
            },
            grid: { left: '15%', right: '10%', bottom: '15%', top: '10%' },
            xAxis: { type: 'category', data: fields, axisLabel: { rotate: 45, color: '#aaa', fontSize: 11 } },
            yAxis: { type: 'category', data: fields, axisLabel: { color: '#aaa', fontSize: 11 } },
            visualMap: {
                min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%',
                inRange: { color: ['#3b82f6', '#1e293b', '#ef4444'] },
                textStyle: { color: '#aaa' }
            },
            series: [{
                name: '相关系数', type: 'heatmap', data: matrix,
                label: { show: true, formatter: (p) => p.data[2].toFixed(2), color: '#fff', fontSize: 11 }
            }]
        };

        instance.setOption(option, true);
        
        // resize 和成功提示
        setTimeout(() => {
            if (instance) instance.resize();
        }, 100);
        Toast.success('热力图生成成功');
        
        // 响应式调整
        this._ensureResizeHandler('chartInstance', '_chartResizeHandler');
    },

    /**
     * 渲染趋势预测图
     */
    renderForecast(data, xField, yField, forecastSteps = 5) {
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        
        const { instance } = result;
        // 立即渲染，不使用延迟
        this._renderForecastData(instance, data, xField, yField, forecastSteps);
    },
    
    _renderForecastData(instance, data, xField, yField, forecastSteps) {
        if (!instance) return;

        const xValues = data.map(row => String(row[xField]));
        const yValues = data.map(row => parseFloat(row[yField])).filter(v => !isNaN(v));

        if (yValues.length < 3) {
            Toast.error('数据量不足，无法进行预测（至少需要3条数据）');
            return;
        }

        const avgDiff = [];
        for (let i = 1; i < yValues.length; i++) {
            avgDiff.push(yValues[i] - yValues[i - 1]);
        }
        const trend = avgDiff.length > 0 ? avgDiff.reduce((a, b) => a + b, 0) / avgDiff.length : 0;

        const forecastX = [], forecastY = [];
        let curY = yValues[yValues.length - 1];
        for (let i = 1; i <= forecastSteps; i++) {
            forecastX.push(`预${i}`);
            curY += trend;
            forecastY.push(Math.round(curY * 100) / 100);
        }

        const option = {
            title: { text: `${yField} 趋势预测`, left: 'center', textStyle: { color: '#fff' } },
            tooltip: { trigger: 'axis' },
            legend: { data: ['历史数据', '预测数据'], bottom: 0, textStyle: { color: '#aaa' } },
            xAxis: { type: 'category', data: [...xValues, ...forecastX], axisLabel: { rotate: 45, color: '#aaa' } },
            yAxis: { type: 'value', name: yField, axisLabel: { color: '#aaa' } },
            series: [
                { name: '历史数据', type: 'line', data: [...yValues, ...Array(forecastSteps).fill(null)], smooth: true, itemStyle: { color: '#5470c6' } },
                { name: '预测数据', type: 'line', data: [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastY], smooth: true, itemStyle: { color: '#91cc75' }, lineStyle: { type: 'dashed' } }
            ]
        };

        instance.setOption(option, true);
        
        // resize 和成功提示
        setTimeout(() => {
            if (instance) instance.resize();
        }, 100);
        Toast.success(`预测完成，预测了未来 ${forecastSteps} 步`);
        
        // 响应式调整
        this._ensureResizeHandler('chartInstance', '_chartResizeHandler');
    },

    /**
     * 保存当前图表配置
     */
    async saveJsonChart() {
        const { chartType, chartConfig } = this.state;
        
        // 从 state 中读取配置（在 generateChart 时已保存）
        if (!chartConfig || !chartConfig.datasetId) {
            return Toast.error('请先生成图表');
        }

        const { datasetId, xField, yField, aggregate, xFields, forecastSteps } = chartConfig;

        const config = {
            xField,
            yField,
            aggregate,
            forecastSteps,
            xFields
        };

        Modal.show({
            title: '保存图表',
            content: `
                <div class="form-group">
                    <label>图表名称</label>
                    <input type="text" id="save-chart-name" class="form-control" placeholder="请输入图表名称">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="save-chart-desc" class="form-control" rows="3"></textarea>
                </div>
            `,
            onConfirm: async () => {
                const name = document.getElementById('save-chart-name').value;
                const description = document.getElementById('save-chart-desc').value;
                if (!name) return Toast.error('请输入名称');

                try {
                    const res = await AnalysisApi.createChart({
                        name,
                        dataset_id: parseInt(datasetId),
                        chart_type: chartType,
                        config,
                        description
                    });
                    Toast.success('图表保存成功');
                    
                    // 保存成功后刷新图表列表
                    if (this.state.showChartHub) {
                        setTimeout(() => {
                            this.updateSavedChartsList();
                        }, 300);
                    }
                    
                    return true;
                } catch (e) {
                    Toast.error('保存失败: ' + e.message);
                }
            }
        });
    },

    /**
     * 获取图表类型名称
     */
    getChartTypeName(type) {
        const maps = {
            'bar': '柱状图',
            'pie': '饼图',
            'line': '折线图',
            'scatter': '散点图',
            'histogram': '直方图',
            'boxplot': '箱线图',
            'heatmap': '热力图',
            'forecast': '趋势预测'
        };
        return maps[type] || type;
    },

    /**
     * 更新已保存图表列表
     */
    async updateSavedChartsList() {
        const container = document.getElementById('saved-charts-list');
        if (!container) {
            // 容器不存在时静默返回，避免在非图表页面产生警告
            // 这是正常情况（ChartHub 未打开时）
            return;
        }

        try {
            const res = await AnalysisApi.getCharts();
            
            // 检查响应格式
            if (!res || !res.data) {
                container.innerHTML = '<div class="text-danger p-20">图表库同步失败：响应格式错误</div>';
                return;
            }
            
            const charts = Array.isArray(res.data) ? res.data : [];
            this.state.savedCharts = charts;

            if (charts.length === 0) {
                container.innerHTML = `
                    <div class="p-40 text-center w-100 bg-tertiary rounded-xl" style="border: 2px dashed var(--color-border);">
                        <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📊</div>
                        <p class="text-secondary m-0" style="font-size: 16px; font-weight: 500;">暂无保存的图表配置</p>
                        <p class="text-tertiary text-sm mt-10 mb-15">请先在图表生成器中创建并保存图表</p>
                        <button class="btn btn-primary btn-sm" id="btn-goto-generator-from-empty">
                            ➕ 去创建图表
                        </button>
                    </div>`;
                
                // 绑定"去创建图表"按钮
                setTimeout(() => {
                    const btn = document.getElementById('btn-goto-generator-from-empty');
                    if (btn) {
                        btn.onclick = () => {
                            this.setState({ showChartHub: false });
                        };
                    }
                }, 50);
                return;
            }

            const html = charts.map(c => {
                const dsName = this.state.datasets?.find(d => d.id === c.dataset_id)?.name || '未知数据集';
                const typeInfo = this.getChartTypeName(c.chart_type);
                return `
                    <div class="saved-chart-card p-0 border rounded-xl bg-card shadow-sm hover-shadow-lg transition-all anim-scale-in" style="width: 260px; overflow: hidden;">
                        <div class="p-15 border-bottom flex-between bg-tertiary">
                             <div class="flex-center gap-8">
                                <span class="text-lg">${this.getChartIcon(c.chart_type)}</span>
                                <strong class="text-sm truncate" title="${c.name || '未命名图表'}" style="max-width: 150px;">${c.name || '未命名图表'}</strong>
                             </div>
                             <button class="btn-icon text-danger hover-bg-danger-light btn-delete-saved-chart" data-id="${c.id}" title="彻底删除">🗑️</button>
                        </div>
                        <div class="p-15">
                            <div class="flex-between mb-8 text-xs">
                                <span class="text-secondary">类型</span>
                                <span class="text-primary font-bold">${typeInfo}</span>
                            </div>
                            <div class="flex-between mb-8 text-xs">
                                <span class="text-secondary">数据源</span>
                                <span class="truncate text-right" style="max-width: 120px;">${dsName}</span>
                            </div>
                            <div class="flex-between mb-15 text-xs">
                                <span class="text-secondary">创建时间</span>
                                <span class="text-tertiary" style="font-size: 10px;">${c.created_at ? Utils.formatDate(c.created_at) : '未知'}</span>
                            </div>
                            <div class="flex gap-8">
                                <button class="btn btn-primary btn-xs flex-1 btn-view-saved-chart" data-id="${c.id}">🔍 查看图表</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // 更新容器内容
            container.innerHTML = html;
            
            // 重新绑定事件（因为 innerHTML 会清除事件监听器）
            this._rebindChartCardEvents();
        } catch (e) {
            container.innerHTML = `<div class="text-danger p-20">
                <p>图表库同步失败</p>
                <p class="text-xs mt-5">${e.message || '请检查网络连接'}</p>
            </div>`;
        }
    },
    
    _rebindChartCardEvents() {
        // 重新绑定图表卡片的事件（因为 innerHTML 会清除事件监听器）
        // 这些事件已经在 bindChartEvents 中通过 delegate 绑定
    },

    /**
     * 获取图表图标
     */
    getChartIcon(type) {
        const icons = {
            'bar': '📊', 'pie': '🥧', 'line': '📈', 'scatter': '⚬',
            'histogram': '📶', 'boxplot': '📦', 'heatmap': '🔥', 'forecast': '🔮'
        };
        return icons[type] || '📈';
    },

    /**
     * 绑定图表相关事件
     */
    bindChartEvents() {
        if (this._chartEventsBound) return;
        this._chartEventsBound = true;

        // 注意：不在初始化时加载图表库，因为容器可能还不存在
        // 只有在打开 ChartHub 时才加载

        // 切换到图表库
        this.delegate('click', '#btn-open-chart-hub', () => {
            this.setState({ showChartHub: true });
            // 等待 DOM 更新后再加载图表列表
            setTimeout(() => {
                this._triggerHubUpdate();
            }, 100);
        });

        // 刷新按钮
        this.delegate('click', '#btn-refresh-charts', () => {
            this.updateSavedChartsList();
        });

        // 返回生成器
        this.delegate('click', '#btn-close-chart-hub, #btn-goto-generator', () => {
            this.setState({ showChartHub: false });
        });

        // 详细查看图表
        this.delegate('click', '.btn-view-saved-chart', (e, el) => {
            const id = parseInt(el.dataset.id);
            this.setState({ viewingChartId: id });

            // 延时渲染图表，确保容器已就绪
            setTimeout(() => {
                const chart = this.state.savedCharts?.find(c => c.id === id);
                if (chart) {
                    this.renderChartByConfig('viewer-chart-container', chart);
                }
            }, 100);
        });

        // 关闭查看器
        this.delegate('click', '#btn-close-chart-viewer', () => {
            this.setState({ viewingChartId: null });
            if (this.viewerChartInstance) {
                this.viewerChartInstance.dispose();
                this.viewerChartInstance = null;
            }
            // 如果仍然在资产库模式，确保列表内容被刷新
            if (this.state.showChartHub) {
                this._triggerHubUpdate();
            }
        });

        // 导出查看器图表为图片
        this.delegate('click', '#btn-export-viewer-chart', () => {
            if (this.viewerChartInstance) {
                try {
                    const url = this.viewerChartInstance.getDataURL({
                        type: 'png',
                        pixelRatio: 2,
                        backgroundColor: '#1a1a1c'
                    });
                    const link = document.createElement('a');
                    link.download = `图表导出_${new Date().getTime()}.png`;
                    link.href = url;
                    link.click();
                    Toast.success('图片已生成并开始下载');
                } catch (e) {
                    Toast.error('导出失败: ' + e.message);
                }
            } else {
                Toast.error('图表渲染中，请稍后...');
            }
        });

        // 图表类型切换 (保留已选数据集)
        this.delegate('click', '.chart-type-btn', (e, el) => {
            // 先保存当前选中的数据集
            const currentDatasetId = document.getElementById('chart-dataset')?.value || this.state.chartDatasetId;
            this.setState({
                chartType: el.dataset.chartType,
                chartDatasetId: currentDatasetId,
                hasGeneratedChart: false // 切换类型后需重新生成
            });
        });

        // 生成图表按钮
        this.delegate('click', '#btn-generate-chart', () => {
            this.generateChart();
        });

        // 保存图表按钮
        this.delegate('click', '#btn-save-chart', async () => {
            await this.saveJsonChart();
            this.updateSavedChartsList(); // 保存后刷新列表
        });

        // 数据集选择变化时更新字段
        this.delegate('change', '#chart-dataset', (e, el) => {
            this.state.chartDatasetId = el.value;
            this.state.hasGeneratedChart = false;
            this.state.chartConfig = null; // 清除之前的配置
            this.updateFieldOptions(el.value);
            // 只更新保存按钮状态，不触发完整重新渲染
            const saveBtn = document.getElementById('btn-save-chart');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
            }
        });

        // 删除已保存图表
        this.delegate('click', '.btn-delete-saved-chart', async (e, el) => {
            if (!confirm('确定要删除该图表配置吗？')) return;
            try {
                await AnalysisApi.deleteChart(el.dataset.id);
                Toast.success('删除成功');
                this.updateSavedChartsList();
            } catch (e) {
                Toast.error('删除失败');
            }
        });
    },

    /**
     * 根据保存的配置渲染图表 (通用方法)
     */
    async renderChartByConfig(containerId, chart) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 获取数据
        const data = await this.fetchChartData(chart.dataset_id);
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="flex-center h-100 text-secondary">数据集为空或无法加载</div>';
            return;
        }

        // 使用统一的容器初始化方法
        const result = this._initChartContainer(containerId, 'viewerChartInstance');
        if (!result) return;
        
        const { instance: chartInstance } = result;
        const config = chart.config || {};

        switch (chart.chart_type) {
            case 'histogram':
                if (config.xField) {
                    this._renderStaticHistogram(chartInstance, data, config.xField);
                } else {
                    chartInstance.setOption({ title: { text: '配置不完整：缺少字段', left: 'center', textStyle: { color: '#888' } } });
                }
                break;
            case 'boxplot':
                if (config.xField) {
                    this._renderStaticBoxplot(chartInstance, data, config.xField);
                } else {
                    chartInstance.setOption({ title: { text: '配置不完整：缺少字段', left: 'center', textStyle: { color: '#888' } } });
                }
                break;
            case 'heatmap':
                const fields = config.xFields || (config.xField ? [config.xField] : []);
                if (fields.length >= 2) {
                    this._renderStaticHeatmap(chartInstance, data, fields);
                } else {
                    chartInstance.setOption({ title: { text: '配置不完整：热力图需要至少2个字段', left: 'center', textStyle: { color: '#888' } } });
                }
                break;
            case 'forecast':
                if (config.xField && config.yField) {
                    this._renderStaticForecast(chartInstance, data, config.xField, config.yField, config.forecastSteps || 5);
                } else {
                    chartInstance.setOption({ title: { text: '配置不完整：缺少字段', left: 'center', textStyle: { color: '#888' } } });
                }
                break;
            default:
                // 基础图表需要 xField
                if (config.xField) {
                    const aggregatedData = Utils.aggregateData(data, config.xField, config.yField, config.aggregate, { maxItems: 20 });
                    this._renderStaticBaseChart(chartInstance, chart.chart_type, aggregatedData, config.xField, config.yField || '数量');
                } else {
                    chartInstance.setOption({ title: { text: '配置不完整：缺少维度字段', left: 'center', textStyle: { color: '#888' } } });
                }
        }

        // 使用统一的 resize 处理
        this._finalizeChartRender(chartInstance, null);
        
        // 添加 resize 监听器（避免重复添加）
        this._ensureResizeHandler('viewerChartInstance', '_viewerResizeHandler');
    },

    _renderStaticBaseChart(instance, type, data, xLabel, yLabel) {
        const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: type === 'pie' ? 'item' : 'axis' },
            legend: { top: 10, textStyle: { color: '#aaa' } },
            grid: { top: 70, bottom: 40, left: 60, right: 30 },
            xAxis: type === 'pie' ? undefined : {
                type: 'category',
                data: data.map(d => d.name),
                axisLabel: { color: '#888' }
            },
            yAxis: type === 'pie' ? undefined : {
                type: 'value',
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [{
                name: yLabel,
                type: type,
                data: type === 'pie' ? data.map(d => ({ name: d.name, value: d.value })) : data.map(d => d.value),
                radius: type === 'pie' ? '65%' : undefined,
                center: type === 'pie' ? ['50%', '55%'] : undefined,
                smooth: true,
                itemStyle: {
                    borderRadius: type === 'bar' ? [6, 6, 0, 0] : 0,
                    color: type === 'line' ? '#5470c6' : undefined
                },
                areaStyle: type === 'line' ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(84, 112, 198, 0.4)' },
                        { offset: 1, color: 'rgba(84, 112, 198, 0)' }
                    ])
                } : undefined
            }]
        };
        instance.setOption(option);
    },

    _renderStaticHistogram(instance, data, field) {
        // histogram 等高级图表逻辑较复杂，建议后续统一抽取渲染类，此处先支持基础预览
        const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
        const option = {
            backgroundColor: 'transparent',
            xAxis: { scale: true },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: values.slice(0, 50) }] // 简易预览
        };
        instance.setOption(option);
    },

    _renderStaticBoxplot(instance, data, field) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '箱线图预览', left: 'center', textStyle: { color: '#888' } } });
    },

    _renderStaticHeatmap(instance, data, fields) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '热力图预览', left: 'center', textStyle: { color: '#888' } } });
    },

    _renderStaticForecast(instance, data, x, y, steps) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '趋势预测预览', left: 'center', textStyle: { color: '#888' } } });
    },

    /**
     * 辅助方法：触发资产库更新
     */
    _triggerHubUpdate(attempts = 0) {
        if (attempts > 10) {
            return;
        }

        const container = document.getElementById('saved-charts-list');
        if (container) {
            this.updateSavedChartsList();
        } else {
            setTimeout(() => this._triggerHubUpdate(attempts + 1), 100);
        }
    }
};

// 将方法混入到 AnalysisPage.prototype
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisChartMixin);
}

/**
 * 数据分析模块 - 图表分析功能
 */

const AnalysisChartMixin = {

    /**
     * 渲染图表分析页面
     */
    renderCharts() {
        const { datasets, chartType, chartConfig } = this.state;
        return `
            <div class="p-20 charts-page">
                <div class="flex-between mb-20">
                    <h2>图表分析</h2>
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
                                    ${datasets.map(d => `<option value="${d.id}" ${this.state.chartDatasetId == d.id ? 'selected' : ''}>${d.name} (${d.row_count}行)</option>`).join('')}
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
                                        <option value="value" selected>不聚合</option>
                                        <option value="avg">平均值 (Avg)</option>
                                        <option value="sum">求和 (Sum)</option>
                                        <option value="count">计数 (Count)</option>
                                        <option value="max">最大值 (Max)</option>
                                        <option value="min">最小值 (Min)</option>
                                    </select>
                                </div>
                            `}
                        </div>
                        
                        <button class="btn btn-primary w-100" id="btn-generate-chart">
                            🎨 生成图表
                        </button>
                        <button class="btn btn-outline-primary w-100 mt-10" id="btn-save-chart">
                            💾 保存图表
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
    },

    /**
     * 数据聚合处理 (委托给 Utils.aggregateData)
     */
    aggregateData(data, xField, yField, aggregateType) {
        return Utils.aggregateData(data, xField, yField, aggregateType, { maxItems: 20 });
    },

    /**
     * 渲染 ECharts 基础图表 (柱状、饼图、折线、散点)
     */
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
            if (this.chartInstance) this.chartInstance.resize();
        });

        Toast.success('图表生成成功');
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
            console.error('获取字段失败', e);
        }
    },

    /**
     * 渲染直方图
     */
    renderHistogram(data, field) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

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

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('直方图生成成功');
    },

    /**
     * 渲染箱线图
     */
    renderBoxplot(data, field) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

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

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('箱线图生成成功');
    },

    /**
     * 渲染热力图
     */
    renderHeatmap(data, fields) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '500px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

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

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success('热力图生成成功');
    },

    /**
     * 渲染趋势预测图
     */
    renderForecast(data, xField, yField, forecastSteps = 5) {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.minHeight = '400px';

        if (this.chartInstance) this.chartInstance.dispose();
        this.chartInstance = echarts.init(container, 'dark');

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

        this.chartInstance.setOption(option);
        window.addEventListener('resize', () => this.chartInstance?.resize());
        Toast.success(`预测完成，预测了未来 ${forecastSteps} 步`);
    },

    /**
     * 保存当前图表配置
     */
    async saveJsonChart() {
        const datasetId = document.getElementById('chart-dataset')?.value;
        const xField = document.getElementById('chart-x-field')?.value;
        const yField = document.getElementById('chart-y-field')?.value;
        const aggregate = document.getElementById('chart-aggregate')?.value;
        const { chartType } = this.state;
        const forecastSteps = document.getElementById('forecast-steps')?.value;

        if (!datasetId) return Toast.error('请先生成图表');

        const config = {
            xField,
            yField,
            aggregate,
            forecastSteps,
            // 如果是多选字段（热力图）特殊处理
            xFields: xField && document.getElementById('chart-x-field').multiple ?
                Array.from(document.getElementById('chart-x-field').selectedOptions).map(o => o.value) : undefined
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
                    await AnalysisApi.createChart({
                        name,
                        dataset_id: parseInt(datasetId),
                        chart_type: chartType,
                        config,
                        description
                    });
                    Toast.success('图表保存成功');
                    return true;
                } catch (e) {
                    Toast.error('保存失败: ' + e.message);
                }
            }
        });
    },

    /**
     * 绑定图表相关事件
     */
    bindChartEvents() {
        if (this._chartEventsBound) return;
        this._chartEventsBound = true;

        // 图表类型切换 (保留已选数据集)
        this.delegate('click', '.chart-type-btn', (e, el) => {
            // 先保存当前选中的数据集
            const currentDatasetId = document.getElementById('chart-dataset')?.value || this.state.chartDatasetId;
            this.setState({
                chartType: el.dataset.chartType,
                chartDatasetId: currentDatasetId
            });
        });

        // 生成图表按钮
        this.delegate('click', '#btn-generate-chart', () => {
            this.generateChart();
        });

        // 保存图表按钮
        this.delegate('click', '#btn-save-chart', () => {
            this.saveJsonChart();
        });

        // 数据集选择变化时更新字段
        // 注意：由于 chart-dataset 是动态渲染的，使用 global listener 或 delegate
        this.delegate('change', '#chart-dataset', (e, el) => {
            this.state.chartDatasetId = el.value;
            this.updateFieldOptions(el.value);
        });
    }
};

// 将方法混入到 AnalysisPage.prototype
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisChartMixin);
}

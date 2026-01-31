/**
 * 图表工厂类 - 负责生成统一标准的 ECharts 配置对象
 * 用于：图表分析、保存图表查看、智能报告、数据透镜等
 */
class ChartFactory {

    /**
     * 支持的图表类型
     */
    static CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'histogram', 'boxplot', 'heatmap', 'forecast', 'gauge', 'sankey'];

    /**
     * 支持的聚合类型
     */
    static AGGREGATION_TYPES = ['none', 'count', 'sum', 'avg', 'max', 'min', 'value'];

    /**
     * 验证图表配置
     * @param {Object} config - 配置对象
     * @param {Object} options - 验证选项
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    static validateConfig(config, options = {}) {
        const { requireFields = false, strictMode = false } = options;
        const errors = [];

        // 1. 图表类型验证
        if (!config.chartType) {
            if (strictMode) {
                errors.push('缺少图表类型 (chartType)');
            }
        } else if (!this.CHART_TYPES.includes(config.chartType)) {
            errors.push(`无效的图表类型: ${config.chartType}，支持: ${this.CHART_TYPES.join(', ')}`);
        }

        // 2. 字段验证（对于基础图表）
        const basicTypes = ['bar', 'line', 'pie', 'scatter'];
        if (requireFields && basicTypes.includes(config.chartType)) {
            if (!config.xField) {
                errors.push('缺少 X 轴字段 (xField)');
            }
            if (!config.yField && config.chartType !== 'pie') {
                errors.push('缺少 Y 轴字段 (yField)');
            }
        }

        // 3. 聚合类型验证
        if (config.aggregationType && !this.AGGREGATION_TYPES.includes(config.aggregationType)) {
            errors.push(`无效的聚合类型: ${config.aggregationType}，支持: ${this.AGGREGATION_TYPES.join(', ')}`);
        }

        // 4. 排序方式验证
        if (config.sortOrder && !['asc', 'desc'].includes(config.sortOrder)) {
            errors.push(`无效的排序方式: ${config.sortOrder}，支持 'asc' 或 'desc'`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 获取数据过滤后的结果
     * @param {Array} data 原始数据
     * @param {Object} config 配置对象
     */
    static filterData(data, config) {
        if (!data || data.length === 0) return [];
        let filtered = [...data];
        const { excludeValues, filterField, filterOp, filterValue, xField, sortField, sortOrder } = config;

        // 归一化函数：去除所有空格并转小写
        const normalize = (str) => String(str || '').replace(/\s+/g, '').toLowerCase();

        // 辅助函数：查找匹配的字段名
        const findMatchingField = (row, targetField) => {
            if (!targetField) return null;
            if (row.hasOwnProperty(targetField)) return targetField;
            const targetNormalized = targetField.replace(/\s+/g, '');
            for (const key of Object.keys(row)) {
                if (key.replace(/\s+/g, '') === targetNormalized) {
                    return key;
                }
            }
            return null;
        };

        // 1. 应用排除项
        if (excludeValues) {
            const evList = String(excludeValues).split(',').map(v => v.trim().toLowerCase()).filter(v => v);
            if (evList.length > 0) {
                filtered = filtered.filter(row => {
                    // 优先检查X轴字段
                    const actualXField = findMatchingField(row, xField);
                    if (actualXField) {
                        const xVal = normalize(row[actualXField]);
                        if (evList.some(ev => {
                            const evNorm = ev.replace(/\s+/g, '');
                            return xVal === evNorm || xVal.includes(evNorm);
                        })) {
                            return false;
                        }
                    }
                    // 然后检查所有字段的值
                    for (const key of Object.keys(row)) {
                        const val = normalize(row[key]);
                        if (evList.some(ev => val === ev.replace(/\s+/g, ''))) {
                            return false;
                        }
                    }
                    return true;
                });
            }
        }

        // 2. 应用高级数据筛选
        if (filterField && filterValue) {
            filtered = filtered.filter(row => {
                const actualField = findMatchingField(row, filterField);
                if (!actualField) return true;

                const val = row[actualField];
                const strVal = normalize(val);
                const filterValNorm = normalize(filterValue);
                const numVal = parseFloat(String(val).replace(/\s+/g, ''));
                const numFilterVal = parseFloat(String(filterValue).replace(/\s+/g, ''));

                switch (filterOp) {
                    case 'eq': return strVal === filterValNorm;
                    case 'ne': return strVal !== filterValNorm;
                    case 'gt': return !isNaN(numVal) && !isNaN(numFilterVal) && numVal > numFilterVal;
                    case 'lt': return !isNaN(numVal) && !isNaN(numFilterVal) && numVal < numFilterVal;
                    case 'contains': return strVal.includes(filterValNorm);
                    case 'notcontains': return !strVal.includes(filterValNorm);
                    default: return true;
                }
            });
        }

        // 3. 应用数据排序
        if (sortField && filtered.length > 0) {
            const actualSortField = findMatchingField(filtered[0], sortField);
            if (actualSortField) {
                const order = sortOrder === 'desc' ? -1 : 1;
                filtered.sort((a, b) => {
                    const valA = a[actualSortField];
                    const valB = b[actualSortField];

                    // 处理 null/undefined
                    if (valA == null && valB == null) return 0;
                    if (valA == null) return order;
                    if (valB == null) return -order;

                    // 尝试数值比较
                    const numA = parseFloat(valA);
                    const numB = parseFloat(valB);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return (numA - numB) * order;
                    }

                    // 字符串比较
                    return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * order;
                });
            }
        }

        return filtered;
    }

    /**
     * 获取配色方案（使用统一的样式配置）
     */
    static getColorScheme(scheme) {
        // 使用统一的 ChartStyleConfig 获取颜色主题
        return ChartStyleConfig.getColorScheme(scheme);
    }

    /**
     * 生成图表 Option (主入口)
     * @param {string} type 图表类型
     * @param {Array} data 数据
     * @param {Object} config 配置项
     * @param {Array} rawData 原始数据 (用于多系列聚合)
     */
    static generateOption(type, data, config, rawData = []) {
        // 解构配置
        const { xField, yField, customTitle, colorScheme, showLabel, stacked, dualAxis, y2Field, y3Field, xFields, forecastSteps, xLabel, yLabel } = config;

        // 准备通用参数
        // 支持传入自定义颜色数组或预定义方案名
        const colors = Array.isArray(colorScheme) ? colorScheme : this.getColorScheme(colorScheme);
        const options = { customTitle, colors, showLabel, stacked, dualAxis, y2Field, y3Field, forecastSteps };

        // 确定轴标签：优先使用 xLabel/yLabel，否则使用 xField/yField
        const finalXLabel = xLabel || xField || '';
        const finalYLabel = yLabel || yField || '';

        let option = {};

        switch (type) {
            case 'histogram':
                option = this._getHistogramOption(data, xField, options);
                break;
            case 'boxplot':
                option = this._getBoxplotOption(data, xField, options);
                break;
            case 'heatmap':
                option = this._getHeatmapOption(data, xFields || (xField ? [xField] : []), options);
                break;
            case 'forecast':
                option = this._getForecastOption(data, xField, yField, options);
                break;
            case 'bar':
            case 'line':
            case 'pie':
            case 'scatter':
                option = this._getBasicChartOption(type, data, rawData, finalXLabel, finalYLabel, options);
                break;
            case 'gauge':
                option = this._getGaugeOption(data, yField, options);
                break;
            case 'sankey':
                option = this._getSankeyOption(data, config, options);
                break;
            default:
                console.warn('未知图表类型:', type);
        }

        return option;
    }

    // --- 内部 Option 生成方法 ---

    static _generateDefaultTitle(chartType, xLabel, yLabel) {
        const typeNames = {
            'bar': '柱状图', 'line': '趋势图', 'pie': '饼图', 'scatter': '散点图',
            'histogram': '分布直方图', 'boxplot': '箱线图', 'heatmap': '热力图', 'forecast': '预测图',
            'sankey': '桑基图'
        };
        const typeName = typeNames[chartType] || '图表';
        return `${xLabel || ''} ${typeName}分析`;
    }

    static _getSankeyOption(data, config, options) {
        const { customTitle, colors } = options;
        const { sourceField, targetField, valueField } = config; // Sankey 需要源、目标和值字段

        if (!sourceField || !targetField || !valueField) return {};

        // 构造节点和连线数据
        const nodes = new Set();
        const links = [];

        data.forEach(row => {
            const source = String(row[sourceField]);
            const target = String(row[targetField]);
            const value = parseFloat(row[valueField]) || 0;

            if (source && target && value > 0) {
                nodes.add(source);
                nodes.add(target);
                links.push({ source, target, value });
            }
        });

        const dataNodes = Array.from(nodes).map(name => ({ name }));
        const title = customTitle || '桑基流向图';

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            tooltip: {
                trigger: 'item',
                triggerOn: 'mousemove'
            },
            series: [
                {
                    type: 'sankey',
                    data: dataNodes,
                    links: links,
                    emphasis: {
                        focus: 'adjacency'
                    },
                    lineStyle: {
                        color: 'gradient',
                        curveness: 0.5
                    },
                    label: {
                        color: style.textColor,
                        fontFamily: 'Arial',
                        fontSize: 10
                    },
                    itemStyle: {
                        borderColor: style.axisLineColor,
                        borderWidth: 1
                    },
                    levels: [
                        {
                            depth: 0,
                            itemStyle: { color: colors ? colors[0] : '#fbb4ae' },
                            lineStyle: { color: 'source', opacity: 0.6 }
                        },
                        {
                            depth: 1,
                            itemStyle: { color: colors ? colors[1] : '#b3cde3' },
                            lineStyle: { color: 'source', opacity: 0.6 }
                        },
                        {
                            depth: 2,
                            itemStyle: { color: colors ? colors[2] : '#ccebc5' },
                            lineStyle: { color: 'source', opacity: 0.6 }
                        },
                        {
                            depth: 3,
                            itemStyle: { color: colors ? colors[3] : '#decbe4' },
                            lineStyle: { color: 'source', opacity: 0.6 }
                        }
                    ]
                }
            ]
        };
    }

    static _getBasicChartOption(chartType, aggregatedData, rawData, xLabel, yLabel, options) {
        const { customTitle, colors, showLabel, stacked, dualAxis, y2Field, y3Field } = options;

        const names = aggregatedData.map(d => d.name);
        const values = aggregatedData.map(d => d.value);

        const title = customTitle || this._generateDefaultTitle(chartType, xLabel, yLabel);

        const style = ChartStyleConfig.getDefaultStyle();
        let option = {
            backgroundColor: 'transparent',
            color: colors,
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            tooltip: {
                trigger: chartType === 'pie' ? 'item' : 'axis',
                backgroundColor: style.tooltipBackground,
                borderColor: style.tooltipBorder,
                textStyle: { color: style.textColor }
            },
            legend: { top: 35, textStyle: { color: style.textColorSecondary } },
            // 增加左边距以容纳 Y 轴标签
            grid: { left: '8%', right: dualAxis ? '10%' : '5%', bottom: '15%', top: 80, containLabel: true }
        };

        const series = [];
        const yAxisList = [];

        if (chartType === 'pie') {
            series.push({
                name: xLabel,
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '55%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 10, borderColor: '#1a1a2e', borderWidth: 2 },
                label: {
                    show: showLabel,
                    formatter: showLabel ? '{b}: {c} ({d}%)' : '{b}: {d}%',
                    color: style.textColor
                },
                emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
                data: aggregatedData.map((d, i) => ({
                    name: d.name,
                    value: d.value,
                    itemStyle: { color: colors[i % colors.length] }
                }))
            });
            option.legend = { orient: 'vertical', left: 'left', textStyle: { color: style.textColorSecondary } };
        } else {
            // 根据数据量和标签长度动态计算间距
            const needsRotation = names.length > 8;
            const maxLabelLength = Math.max(...names.map(n => String(n).length));
            // 标签旋转时需要更大的间距，同时考虑标签长度
            const xAxisNameGap = needsRotation ?
                Math.max(40, Math.min(60, maxLabelLength * 4 + 20)) :
                35;

            option.xAxis = {
                type: 'category',
                name: xLabel || '分类',
                nameLocation: 'center',
                nameGap: xAxisNameGap,
                nameTextStyle: {
                    color: style.textColorSecondary, // 使用动态颜色
                    fontSize: 13,
                    fontWeight: 500
                },
                data: names,
                axisLabel: {
                    rotate: needsRotation ? 45 : 0,
                    color: style.textColorSecondary, // 轴标签颜色
                    show: true
                },
                axisLine: {
                    show: true,
                    lineStyle: { color: style.axisLineColor }
                },
                axisTick: {
                    show: true
                }
            };

            yAxisList.push({
                type: 'value',
                name: yLabel || '数值',
                nameLocation: 'end', // 顶部显示
                nameTextStyle: {
                    color: style.textColorSecondary, // 使用动态颜色
                    fontSize: 13,
                    fontWeight: 500,
                    padding: [0, 0, 0, 40] // 增加左侧 padding
                },
                position: 'left',
                axisLabel: {
                    color: style.textColorSecondary, // 轴标签颜色
                    show: true,
                    formatter: '{value}'
                },
                splitLine: {
                    show: true,
                    lineStyle: { color: style.splitLineColor }
                },
                axisLine: {
                    show: true,
                    lineStyle: { color: style.axisLineColor }
                },
                axisTick: {
                    show: true
                }
            });

            const hasMultiSeries = !!(y2Field || y3Field);
            series.push({
                name: yLabel,
                type: chartType === 'scatter' ? 'scatter' : chartType,
                data: chartType === 'scatter' ? aggregatedData.map(d => [d.name, d.value]) : values.map((v, i) => {
                    const itemColor = (chartType === 'bar' && hasMultiSeries) ? colors[0] : colors[i % colors.length];
                    return { value: v, itemStyle: { color: itemColor } };
                }),
                smooth: chartType === 'line',
                stack: stacked ? 'total' : undefined,
                label: { show: showLabel, position: 'top', color: style.textColor, fontSize: 11 },
                itemStyle: {
                    borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0,
                    color: (chartType === 'line' && !hasMultiSeries) ? colors[0] : undefined
                },
                areaStyle: chartType === 'line' && stacked ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: colors[0] + '80' },
                        { offset: 1, color: colors[0] + '10' }
                    ])
                } : undefined
            });

            const addExtraSeries = (field, colorIndex) => {
                // 警告：这里使用 rawData 需要确保其被传入
                const vals = names.map(name => {
                    const match = rawData.filter(r => String(r[Object.keys(r)[0]]) === name); // 简单的匹配逻辑
                    // 更好的匹配需要明确的 xLabel 键，但 rawData 可能是对象数组
                    // analysis_chart.js 的逻辑: xLabel.split(' ')[0] || names[0] ...
                    // 实际上 analysis_chart 对 y2Data 的匹配逻辑是:
                    // const match = rawData.filter(r => String(r[Object.keys(r)[0]]) === name);
                    // 这假设第一个键是 X 轴。我们尽量保持一致。
                    if (match.length === 0) return 0;
                    return match.reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0) / (match.length || 1);
                });

                series.push({
                    name: field,
                    type: chartType,
                    yAxisIndex: dualAxis && colorIndex === 1 ? 1 : 0, // 双轴仅用于 y2
                    data: vals.map((v, i) => ({ value: v, itemStyle: { color: colors[colorIndex] } })),
                    smooth: chartType === 'line',
                    stack: stacked ? 'total' : undefined,
                    label: { show: showLabel, position: 'top', color: style.textColor, fontSize: 11 },
                    itemStyle: {
                        borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0,
                        color: chartType === 'line' ? colors[colorIndex] : undefined
                    }
                });
            };

            if (y2Field && ['bar', 'line'].includes(chartType)) {
                if (dualAxis) {
                    yAxisList.push({
                        type: 'value', name: y2Field, position: 'right',
                        axisLabel: { color: colors[1] }, splitLine: { show: false },
                        axisLine: { show: true, lineStyle: { color: colors[1] } }
                    });
                }
                addExtraSeries(y2Field, 1);
            }

            if (y3Field && ['bar', 'line'].includes(chartType)) {
                addExtraSeries(y3Field, 2);
            }

            option.yAxis = yAxisList;
        }

        option.series = series;
        return option;
    }

    static _getHistogramOption(data, field, options) {
        const { customTitle, colors, showLabel } = options;
        const values = data.map(row => parseFloat(row[field])).filter(v => !isNaN(v));

        if (values.length === 0) return {};

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

        const title = customTitle || `${field} 分布直方图`;

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                name: field,
                nameLocation: 'center',
                nameGap: 35,
                nameTextStyle: { color: style.textColorSecondary, fontSize: 13 },
                data: binLabels,
                axisLabel: { rotate: 45, color: style.textColorSecondary, fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                name: '频数',
                nameTextStyle: { color: style.textColorSecondary, fontSize: 13 },
                axisLabel: { color: style.textColorSecondary },
                splitLine: { lineStyle: { color: style.splitLineColor } }
            },
            series: [{
                name: '频数',
                type: 'bar',
                data: bins,
                label: { show: showLabel, position: 'top', color: style.textColor, fontSize: 10 },
                itemStyle: {
                    color: colors ? colors[0] : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#667eea' },
                        { offset: 1, color: '#764ba2' }
                    ])
                },
                barWidth: '90%'
            }]
        };
    }

    static _getBoxplotOption(data, field, options) {
        const { customTitle, colors, showLabel } = options;
        const values = data
            .map(row => parseFloat(row[field]))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);

        if (values.length < 5) return {};

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

        const title = customTitle || `${field} 箱线图分析`;

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
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
            grid: { left: '10%', right: '10%', bottom: '15%', top: '15%', containLabel: true },
            xAxis: { type: 'category', data: [field], axisLabel: { color: style.textColorSecondary } },
            yAxis: { type: 'value', name: '数值', axisLabel: { color: style.textColorSecondary }, splitLine: { lineStyle: { color: style.splitLineColor } } },
            series: [
                {
                    name: '箱线图',
                    type: 'boxplot',
                    data: [[lowerWhisker, q1, q2, q3, upperWhisker]],
                    itemStyle: {
                        color: colors ? colors[0] : '#91cc75',
                        borderColor: colors ? colors[1] : '#5470c6',
                        borderWidth: 2
                    },
                    label: { show: showLabel, position: 'top', color: style.textColor }
                },
                {
                    name: '异常值',
                    type: 'scatter',
                    data: outliers.map(v => [field, v]),
                    itemStyle: { color: colors ? colors[2] || '#ee6666' : '#ee6666' },
                    symbolSize: 8,
                    label: { show: showLabel, position: 'right', color: style.textColor, fontSize: 10 }
                }
            ]
        };
    }

    static _getHeatmapOption(data, fields, options) {
        const { customTitle, showLabel } = options;
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

        const title = customTitle || '相关性热力图';

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            tooltip: {
                position: 'top',
                formatter: (p) => `${fields[p.data[0]]} ↔ ${fields[p.data[1]]}<br/>相关系数: ${p.data[2]}`
            },
            grid: { left: '10%', right: '10%', bottom: '15%', top: '10%', containLabel: true },
            xAxis: { type: 'category', data: fields, axisLabel: { rotate: 45, color: style.textColorSecondary, fontSize: 11 } },
            yAxis: { type: 'category', data: fields, axisLabel: { color: style.textColorSecondary, fontSize: 11 } },
            visualMap: {
                min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%',
                inRange: {
                    color: [
                        '#3b82f6',
                        style.isDark ? '#1e293b' : '#f9fafb',
                        '#ef4444'
                    ]
                },
                textStyle: { color: style.textColorSecondary }
            },
            series: [{
                name: '相关系数', type: 'heatmap', data: matrix,
                label: { show: showLabel, formatter: (p) => p.data[2].toFixed(2), color: style.textColor, fontSize: 11 }
            }]
        };
    }

    static _getForecastOption(data, xField, yField, options) {
        const { customTitle, colors, showLabel, forecastSteps = 5 } = options;
        const xValues = data.map(row => String(row[xField]));
        const yValues = data.map(row => parseFloat(row[yField])).filter(v => !isNaN(v));

        if (yValues.length < 3) return {};

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

        const title = customTitle || `${yField} 趋势预测`;

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            tooltip: { trigger: 'axis' },
            grid: { left: '3%', right: '4%', bottom: '12%', containLabel: true },
            legend: { data: ['历史数据', '预测数据'], bottom: 0, textStyle: { color: style.textColorSecondary } },
            xAxis: {
                type: 'category',
                name: xField,
                nameLocation: 'center',
                nameGap: 35,
                nameTextStyle: { color: style.textColorSecondary, fontSize: 13 },
                data: [...xValues, ...forecastX],
                axisLabel: { rotate: 45, color: style.textColorSecondary }
            },
            yAxis: {
                type: 'value',
                name: yField,
                nameTextStyle: { color: style.textColorSecondary, fontSize: 13 },
                axisLabel: { color: style.textColorSecondary },
                splitLine: { lineStyle: { color: style.splitLineColor } }
            },
            series: [
                {
                    name: '历史数据', type: 'line', data: [...yValues, ...Array(forecastSteps).fill(null)],
                    smooth: true, itemStyle: { color: colors ? colors[0] : '#5470c6' },
                    label: { show: showLabel, position: 'top', color: style.textColor }
                },
                {
                    name: '预测数据', type: 'line', data: [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastY],
                    smooth: true, itemStyle: { color: colors ? colors[1] : '#91cc75' }, lineStyle: { type: 'dashed' },
                    label: { show: showLabel, position: 'top', color: '#91cc75' }
                }
            ]
        };
    }

    static _getGaugeOption(data, field, options) {
        const { customTitle, colors } = options;
        // Gauge 数据通常取平均值或最新值
        const values = data.map(d => d.value || 0);
        const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
        const val = Math.round(avg * 10) / 10;

        const mainColor = (colors && colors[0]) ? colors[0] : '#60a5fa';

        const title = customTitle || '仪表盘';

        const style = ChartStyleConfig.getDefaultStyle();
        return {
            backgroundColor: 'transparent',
            title: { text: title, left: 'center', top: 'bottom', textStyle: { color: style.textColor, fontSize: style.titleFontSize } },
            series: [{
                type: 'gauge',
                center: ['50%', '55%'],
                radius: '80%',
                progress: { show: true, width: 12, itemStyle: { color: mainColor } },
                axisLine: { lineStyle: { width: 12, color: [[1, style.splitLineColor]] } },
                axisTick: { show: false },
                splitLine: { length: 8, lineStyle: { width: 2, color: style.textColorSecondary } },
                axisLabel: { distance: 16, color: style.textColorSecondary, fontSize: 10 },
                pointer: { show: true, length: '60%', itemStyle: { color: 'auto' } },
                detail: {
                    valueAnimation: true,
                    fontSize: 24,
                    offsetCenter: [0, '70%'],
                    color: style.textColor,
                    formatter: '{value}'
                },
                data: [{ value: val }]
            }]
        };
    }
}

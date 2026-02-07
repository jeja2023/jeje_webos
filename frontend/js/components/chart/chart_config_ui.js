/**
 * 图表配置 UI 生成器 - ChartConfigUI
 * 用于生成统一的图表配置表单 HTML，提供给 BI、智能报告等模块复用
 */
class ChartConfigUI {

    /**
     * 生成标准图表配置表单 HTML
     * @param {Object} options 选项
     * @returns {string} HTML 字符串
     */
    static getFormHtml(options = {}) {
        const { values = {}, datasets = [], fields = [], fieldOptions = '', showLayoutConfig = false } = options;

        const sel = (val, target) => String(val || '') === String(target || '') ? 'selected' : '';
        const chk = (val) => val ? 'checked' : '';
        const esc = (str) => Utils.escapeHtml(str || '');

        const renderFieldOptions = (selectedValue, defaultLabel = null) => {
            let html = defaultLabel ? `<option value="">${defaultLabel}</option>` : '';
            if (fields && fields.length > 0) {
                html += fields.map(f => `<option value="${f}" ${sel(f, selectedValue)}>${f}</option>`).join('');
            } else {
                html += fieldOptions;
            }
            return html;
        };

        // 渲染主题选项的辅助函数
        const renderThemeOptions = (selectedTheme) => {
            // 如果 ChartStyleConfig 可用，使用统一配置
            if (typeof ChartStyleConfig !== 'undefined' && ChartStyleConfig.getAvailableThemes) {
                const themes = ChartStyleConfig.getAvailableThemes();
                return themes.map(t => {
                    const displayName = ChartStyleConfig.getThemeDisplayName(t);
                    return `<option value="${t}" ${sel(t, selectedTheme)}>${displayName}</option>`;
                }).join('');
            }

            // 降级方案：直接列出所有主题
            const themeMap = {
                default: '默认配色',
                blue: '蓝色系',
                green: '绿色系',
                orange: '橙色系',
                purple: '紫色系',
                red: '红色系',
                warm: '暖色调',
                cool: '冷色调',
                rainbow: '彩虹色',
                business: '商务风格',
                multi: '多彩配色'
            };

            return Object.entries(themeMap).map(([value, label]) =>
                `<option value="${value}" ${sel(value, selectedTheme)}>${label}</option>`
            ).join('');
        };

        const chartType = values.chartType || 'bar';
        const aggregationType = values.aggregationType || 'none';
        const isForecast = chartType === 'forecast';
        const isMultiSeries = ['bar', 'line'].includes(chartType);

        // 根据图表类型计算初始显示状态
        const needsXYAxis = ['bar', 'line', 'scatter', 'forecast'].includes(chartType);
        const needsCategoryValue = chartType === 'pie';
        const needsOnlyValue = ['gauge', 'histogram', 'boxplot'].includes(chartType);
        const needsMultiValue = chartType === 'heatmap';
        const needsAggregation = !needsMultiValue && !needsOnlyValue;

        // 计算初始标签文本
        let xLabelText = 'X轴 (维度)';
        let yLabelText = 'Y轴 (数值)';
        if (needsCategoryValue) {
            xLabelText = '分类字段';
            yLabelText = '数值字段';
        } else if (chartType === 'gauge') {
            xLabelText = '数值字段';
        } else if (chartType === 'histogram') {
            xLabelText = '分布字段';
        } else if (chartType === 'boxplot') {
            xLabelText = '分析字段';
        } else if (needsMultiValue) {
            xLabelText = '数值字段 (多选)';
        }

        // 1. 基础信息配置 - 始终渲染所有字段容器，通过样式控制显隐
        let html = `
            <div class="form-group mb-10">
                <label class="text-xs">标题</label>
                <input type="text" id="cfg-w-title" class="form-control" value="${esc(values.title || values.customTitle)}" placeholder="图表标题">
            </div>
            ${datasets.length > 0 ? `
            <div class="form-group mb-10">
                <label class="text-xs">数据集</label>
                <select id="cfg-w-dataset" class="form-control">
                    <option value="">请选择...</option>
                    ${datasets.map(d => `<option value="${d.id}" ${sel(d.id, values.datasetId)}>${d.name}</option>`).join('')}
                </select>
            </div>` : ''}
            
            <div class="flex gap-10 mb-10">
                <div style="flex: 1">
                    <label class="text-xs">图表类型</label>
                    <select id="cfg-w-type" class="form-control">
                        <option value="bar" ${sel('bar', chartType)}>📊 柱状图</option>
                        <option value="line" ${sel('line', chartType)}>📈 折线图</option>
                        <option value="pie" ${sel('pie', chartType)}>🥧 饼图</option>
                        <option value="scatter" ${sel('scatter', chartType)}>⚬ 散点图</option>
                        <option value="gauge" ${sel('gauge', chartType)}>⏱️ 仪表盘</option>
                        <option value="histogram" ${sel('histogram', chartType)}>📶 直方图</option>
                        <option value="boxplot" ${sel('boxplot', chartType)}>📦 箱线图</option>
                        <option value="heatmap" ${sel('heatmap', chartType)}>🔥 热力图</option>
                        <option value="forecast" ${sel('forecast', chartType)}>🔮 预测图</option>
                        <option value="sankey" ${sel('sankey', chartType)}>🔄 桑基图</option>
                    </select>
                </div>
                <div style="flex: 1">
                     <label class="text-xs">颜色主题</label>
                    <select id="cfg-w-theme" class="form-control">
                        ${renderThemeOptions(values.theme || values.colorScheme)}
                    </select>
                </div>
            </div>

            <!-- 字段配置区域：始终渲染，通过 ID 和样式控制显隐 -->
            <div id="group-xy-fields" class="flex gap-10 mb-10" style="${(needsXYAxis || needsCategoryValue) ? '' : 'display:none'}">
                <div class="flex-1">
                    <label class="text-xs" id="lbl-x-field">${xLabelText}</label>
                    <select id="cfg-w-x" class="form-control" ${needsMultiValue ? 'multiple size="3"' : ''}>
                        ${renderFieldOptions(values.xField || values.xFields)}
                    </select>
                </div>
                <div class="flex-1" id="group-y-field" style="${(needsXYAxis || needsCategoryValue) ? '' : 'display:none'}">
                    <label class="text-xs" id="lbl-y-field">${yLabelText}</label>
                    <select id="cfg-w-y" class="form-control">
                        ${renderFieldOptions(values.yField)}
                    </select>
                </div>
            </div>
            
            <!-- 单字段配置区域（仪表盘、直方图、箱线图、热力图） -->
            <div id="group-single-field" class="form-group mb-10" style="${needsOnlyValue || needsMultiValue ? '' : 'display:none'}">
                <label class="text-xs" id="lbl-single-field">${xLabelText}</label>
                <select id="cfg-w-single" class="form-control" ${needsMultiValue ? 'multiple size="3"' : ''}>
                    ${renderFieldOptions(values.xField || values.xFields)}
                </select>
            </div>

            <!-- 桑基图专用配置区域 -->
            <div id="group-sankey-fields" class="flex gap-10 mb-10" style="${chartType === 'sankey' ? '' : 'display:none'}">
                <div style="flex: 1">
                    <label class="text-xs">源节点 (Source)</label>
                    <select id="cfg-w-sankey-source" class="form-control">
                         ${renderFieldOptions(values.sourceField)}
                    </select>
                </div>
                <div style="flex: 1">
                    <label class="text-xs">目标节点 (Target)</label>
                    <select id="cfg-w-sankey-target" class="form-control">
                         ${renderFieldOptions(values.targetField)}
                    </select>
                </div>
                <div style="flex: 1">
                     <label class="text-xs">数值 (Value)</label>
                     <select id="cfg-w-sankey-value" class="form-control">
                          ${renderFieldOptions(values.valueField)}
                     </select>
                </div>
            </div>
            
            <div class="form-group mb-10" id="group-agg" style="${needsAggregation ? '' : 'display:none'}">
                <label class="text-xs">聚合方式</label>
                <select id="cfg-w-agg" class="form-control">
                    <option value="none" ${sel('none', aggregationType)}>不聚合 (原始数据)</option>
                    <option value="count" ${sel('count', aggregationType)}>计数 (Count)</option>
                    <option value="sum" ${sel('sum', aggregationType)}>求和 (Sum)</option>
                    <option value="avg" ${sel('avg', aggregationType)}>平均 (Avg)</option>
                    <option value="max" ${sel('max', aggregationType)}>最大 (Max)</option>
                    <option value="min" ${sel('min', aggregationType)}>最小 (Min)</option>
                </select>
            </div>

            <div class="form-group mb-10" id="group-forecast" style="${isForecast ? '' : 'display:none'}">
                <label class="text-xs">预测步数</label>
                <input type="number" id="cfg-w-forecast-steps" class="form-control" value="${values.forecastSteps || 5}" min="1">
            </div>
        `;

        if (showLayoutConfig) {
            html += `
                <div class="form-group mb-10">
                    <label class="text-xs">布局大小</label>
                    <select id="cfg-w-size" class="form-control">
                        <option value="small" ${sel('small', values.size)}>小 (1x2)</option>
                        <option value="medium" ${sel('medium', values.size)}>中 (2x2)</option>
                        <option value="large" ${sel('large', values.size)}>大 (3x2)</option>
                        <option value="wide" ${sel('wide', values.size)}>最宽 (6x1)</option>
                    </select>
                </div>
            `;
        }

        html += `
            <div class="form-section-title mt-10 mb-10 pb-5 border-bottom text-xs font-bold text-secondary">数据筛选</div>
            <div class="form-group mb-10">
                <label class="text-xs">排除项</label>
                <input type="text" id="cfg-w-exclude" class="form-control" placeholder="逗号分隔，如: 未知, 其他" value="${esc(values.excludeValues)}">
            </div>
            <div class="flex gap-10 mb-10">
                <div style="flex: 2">
                    <label class="text-xs">筛选字段</label>
                    <select id="cfg-w-filter-field" class="form-control">
                        ${renderFieldOptions(values.filterField, '(不筛选)')}
                    </select>
                </div>
                <div style="flex: 1">
                    <label class="text-xs">条件</label>
                    <select id="cfg-w-filter-op" class="form-control">
                        <option value="eq" ${sel('eq', values.filterOp)}>=</option>
                        <option value="ne" ${sel('ne', values.filterOp)}>≠</option>
                        <option value="gt" ${sel('gt', values.filterOp)}>&gt;</option>
                        <option value="lt" ${sel('lt', values.filterOp)}>&lt;</option>
                        <option value="contains" ${sel('contains', values.filterOp)}>包含</option>
                    </select>
                </div>
                <div style="flex: 2">
                    <label class="text-xs">值</label>
                    <input type="text" id="cfg-w-filter-val" class="form-control" value="${esc(values.filterValue)}">
                </div>
            </div>
            
            <div class="form-section-title mt-10 mb-10 pb-5 border-bottom text-xs font-bold text-secondary">数据排序</div>
            <div class="flex gap-10 mb-10">
                <div style="flex: 2">
                    <label class="text-xs">排序字段</label>
                    <select id="cfg-w-sort-field" class="form-control">
                        ${renderFieldOptions(values.sortField, '(不排序)')}
                    </select>
                </div>
                <div style="flex: 1">
                    <label class="text-xs">排序方向</label>
                    <select id="cfg-w-sort-order" class="form-control">
                        <option value="asc" ${sel('asc', values.sortOrder)}>升序 ↑</option>
                        <option value="desc" ${sel('desc', values.sortOrder)}>降序 ↓</option>
                    </select>
                </div>
            </div>
        `;

        html += `
            <div class="form-section-title mt-10 mb-10 pb-5 border-bottom text-xs font-bold text-secondary">高级配置</div>
            <div class="flex gap-20 mb-10 flex-wrap">
                <label class="flex align-center gap-5 text-xs cursor-pointer select-none">
                    <input type="checkbox" id="cfg-w-label" ${chk(values.showLabel)}> 显示标签
                </label>
                <label class="flex align-center gap-5 text-xs cursor-pointer select-none" id="group-stacked" style="${isMultiSeries ? '' : 'display:none'}">
                    <input type="checkbox" id="cfg-w-stacked" ${chk(values.stacked)}> 堆叠
                </label>
                <label class="flex align-center gap-5 text-xs cursor-pointer select-none" id="group-dual" style="${isMultiSeries ? '' : 'display:none'}">
                    <input type="checkbox" id="cfg-w-dual" ${chk(values.dualAxis)}> 双Y轴
                </label>
            </div>
            
            <div id="group-series" style="${isMultiSeries ? '' : 'display:none'}">
                <div class="form-group mb-10">
                    <label class="text-xs">次要Y轴字段 (右轴/对比)</label>
                    <select id="cfg-w-y2" class="form-control">
                        ${renderFieldOptions(values.y2Field, '请选择...')}
                    </select>
                </div>
                <div class="form-group mb-10">
                    <label class="text-xs">第三Y轴字段 (可选)</label>
                    <select id="cfg-w-y3" class="form-control">
                        ${renderFieldOptions(values.y3Field, '请选择...')}
                    </select>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * 初始化交互逻辑 (绑定类型切换事件)
     * @param {HTMLElement} container 包含表单的容器元素
     */
    static initInteractions(container) {
        if (!container) return;

        const typeSelect = container.querySelector('#cfg-w-type');
        if (!typeSelect) return;

        // 检查是否已经绑定过事件（通过检查是否有自定义属性）
        if (typeSelect.dataset.chartConfigInitialized === 'true') {
            // 如果已初始化，只更新 UI 状态，不重复绑定事件
            this._updateUIForChartType(container, typeSelect.value);
            return;
        }

        // 标记为已初始化
        typeSelect.dataset.chartConfigInitialized = 'true';

        // 绑定 change 事件
        typeSelect.addEventListener('change', (e) => {
            this._updateUIForChartType(container, e.target.value);
        });

        // 立即执行一次以确保初始状态正确
        this._updateUIForChartType(container, typeSelect.value);
    }

    /**
     * 更新图表类型对应的 UI 显示
     * @param {HTMLElement} container 容器元素
     * @param {string} type 图表类型
     */
    static _updateUIForChartType(container, type) {
        // 获取所有需要控制的元素
        const xyFieldsGroup = container.querySelector('#group-xy-fields');
        const yFieldGroup = container.querySelector('#group-y-field');
        const singleFieldGroup = container.querySelector('#group-single-field');
        const xLabel = container.querySelector('#lbl-x-field');
        const yLabel = container.querySelector('#lbl-y-field');
        const singleLabel = container.querySelector('#lbl-single-field');
        const singleSelect = container.querySelector('#cfg-w-single');
        const forecastGroup = container.querySelector('#group-forecast');
        const stackedGroup = container.querySelector('#group-stacked');
        const dualGroup = container.querySelector('#group-dual');
        const seriesGroup = container.querySelector('#group-series');
        const sankeyGroup = container.querySelector('#group-sankey-fields');
        const aggGroup = container.querySelector('#group-agg');

        const isForecast = type === 'forecast';
        const isMulti = ['bar', 'line'].includes(type);
        const isSankey = type === 'sankey';

        // 根据图表类型判断需要显示的配置
        const needsXYAxis = ['bar', 'line', 'scatter', 'forecast'].includes(type);
        const needsCategoryValue = type === 'pie';
        const needsOnlyValue = ['gauge', 'histogram', 'boxplot'].includes(type);
        const needsMultiValue = type === 'heatmap';
        const needsAggregation = !needsMultiValue && !needsOnlyValue && !isSankey;

        // 1. 控制 XY 字段组的显示
        if (xyFieldsGroup) {
            xyFieldsGroup.style.display = (needsXYAxis || needsCategoryValue) ? 'flex' : 'none';
        }

        // 2. 控制 Y 字段的显示
        if (yFieldGroup) {
            yFieldGroup.style.display = (needsXYAxis || needsCategoryValue) ? 'block' : 'none';
        }

        // 3. 控制单字段组的显示
        if (singleFieldGroup) {
            singleFieldGroup.style.display = (needsOnlyValue || needsMultiValue) ? 'block' : 'none';

            // 更新单字段选择器的多选状态
            if (singleSelect) {
                if (needsMultiValue) {
                    singleSelect.setAttribute('multiple', 'multiple');
                    singleSelect.setAttribute('size', '3');
                } else {
                    singleSelect.removeAttribute('multiple');
                    singleSelect.removeAttribute('size');
                }
            }
        }

        // 3.5 控制桑基图字段组显示
        if (sankeyGroup) {
            sankeyGroup.style.display = isSankey ? 'flex' : 'none';
        }

        // 4. 更新标签文本
        if (xLabel) {
            if (needsXYAxis) {
                xLabel.textContent = 'X轴 (维度)';
            } else if (needsCategoryValue) {
                xLabel.textContent = '分类字段';
            }
        }

        if (yLabel) {
            if (needsXYAxis) {
                yLabel.textContent = 'Y轴 (数值)';
            } else if (needsCategoryValue) {
                yLabel.textContent = '数值字段';
            }
        }

        if (singleLabel) {
            if (type === 'gauge') {
                singleLabel.textContent = '数值字段';
            } else if (type === 'histogram') {
                singleLabel.textContent = '分布字段';
            } else if (type === 'boxplot') {
                singleLabel.textContent = '分析字段';
            } else if (needsMultiValue) {
                singleLabel.textContent = '数值字段 (多选)';
            }
        }

        // 5. 控制其他组的显示
        if (forecastGroup) forecastGroup.style.display = isForecast ? 'block' : 'none';
        if (stackedGroup) stackedGroup.style.display = isMulti ? 'inline-flex' : 'none';
        if (dualGroup) dualGroup.style.display = isMulti ? 'inline-flex' : 'none';
        if (seriesGroup) seriesGroup.style.display = isMulti ? 'block' : 'none';
        if (aggGroup) aggGroup.style.display = needsAggregation ? 'block' : 'none';
    }

    /**
     * 从表单获取配置值
     * @param {HTMLElement|Document} ctx 上下文 (默认 document)
     */
    static getFormValues(ctx = document) {
        const getVal = (id) => { const el = ctx.getElementById ? ctx.getElementById(id) : ctx.querySelector('#' + id); return el ? el.value.trim() : null; };
        const getChk = (id) => { const el = ctx.getElementById ? ctx.getElementById(id) : ctx.querySelector('#' + id); return el ? el.checked : false; };

        // 处理多选
        const getMultiVal = (id) => {
            const el = ctx.getElementById ? ctx.getElementById(id) : ctx.querySelector('#' + id);
            if (!el) return null;
            if (el.multiple) return Array.from(el.selectedOptions).map(o => o.value);
            return el.value;
        };

        // 获取 X 字段值：优先从 cfg-w-x 获取，如果不可见则从 cfg-w-single 获取
        let xVal = getMultiVal('cfg-w-x');
        const singleVal = getMultiVal('cfg-w-single');
        const chartType = getVal('cfg-w-type');

        // 根据图表类型决定使用哪个字段
        const needsOnlyValue = ['gauge', 'histogram', 'boxplot'].includes(chartType);
        const needsMultiValue = chartType === 'heatmap';

        if (needsOnlyValue || needsMultiValue) {
            xVal = singleVal;
        }

        return {
            title: getVal('cfg-w-title'),
            datasetId: getVal('cfg-w-dataset'),
            chartType: chartType,
            xField: Array.isArray(xVal) ? xVal[0] : xVal,
            xFields: Array.isArray(xVal) ? xVal : undefined,
            yField: getVal('cfg-w-y'),

            // 桑基图字段
            sourceField: getVal('cfg-w-sankey-source'),
            targetField: getVal('cfg-w-sankey-target'),
            valueField: getVal('cfg-w-sankey-value'),

            aggregationType: getVal('cfg-w-agg'),
            colorScheme: getVal('cfg-w-theme'),
            size: getVal('cfg-w-size'),

            excludeValues: getVal('cfg-w-exclude'),
            filterField: getVal('cfg-w-filter-field'),
            filterOp: getVal('cfg-w-filter-op'),
            filterValue: getVal('cfg-w-filter-val'),

            sortField: getVal('cfg-w-sort-field'),
            sortOrder: getVal('cfg-w-sort-order'),

            showLabel: getChk('cfg-w-label'),
            stacked: getChk('cfg-w-stacked'),
            dualAxis: getChk('cfg-w-dual'),
            y2Field: getVal('cfg-w-y2'),
            y3Field: getVal('cfg-w-y3'),
            forecastSteps: parseInt(getVal('cfg-w-forecast-steps')) || 5
        };
    }

    static updateFieldOptions(optionsHtml) {
        const ids = ['cfg-w-x', 'cfg-w-y', 'cfg-w-single', 'cfg-w-y2', 'cfg-w-y3', 'cfg-w-filter-field', 'cfg-w-sort-field',
            'cfg-w-sankey-source', 'cfg-w-sankey-target', 'cfg-w-sankey-value'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const currentVal = el.value;
                // 为不同字段设置不同的默认选项
                let prefix = '';
                if (id === 'cfg-w-filter-field') {
                    prefix = '(不筛选)';
                } else if (id === 'cfg-w-sort-field') {
                    prefix = '(不排序)';
                } else if (['cfg-w-y2', 'cfg-w-y3'].includes(id)) {
                    prefix = '请选择...';
                } else if (['cfg-w-x', 'cfg-w-y', 'cfg-w-single', 'cfg-w-sankey-source', 'cfg-w-sankey-target', 'cfg-w-sankey-value'].includes(id)) {
                    prefix = '选择字段...';
                }
                el.innerHTML = (prefix ? `<option value="">${prefix}</option>` : '') + optionsHtml;
                try { el.value = currentVal; } catch (e) { }
            }
        });
    }

}

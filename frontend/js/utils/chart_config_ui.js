/**
 * 图表配置 UI 生成器 - ChartConfigUI
 * 用于生成统一的图表配置表单 HTML，提供给 BI、智能报告等模块复用
 */
class ChartConfigUI {

    /**
     * 生成标准图表配置表单 HTML
     * @param {Object} options 选项
     * @param {Object} options.values 当前配置值 { title, datasetId, chartType, xField, yField, ... }
     * @param {Array} options.datasets 数据集列表 [{id, name}, ...]
     * @param {string} options.fieldOptions 字段下拉选项 HTML 字符串
     * @param {boolean} options.showLayoutConfig 是否显示大屏布局配置 (BI 专用)
     * @returns {string} HTML 字符串
     */
    static getFormHtml(options = {}) {
        const { values = {}, datasets = [], fieldOptions = '', showLayoutConfig = false } = options;

        // 辅助函数：生成选中状态
        const sel = (val, target) => val === target ? 'selected' : '';
        const chk = (val) => val ? 'checked' : '';
        const esc = (str) => Utils.escapeHtml(str || '');

        // 1. 基础信息配置
        let html = `
            <div class="form-group mb-10">
                <label class="text-xs">标题</label>
                <input type="text" id="cfg-w-title" class="form-control" value="${esc(values.title)}" placeholder="图表标题">
            </div>
            <div class="form-group mb-10">
                <label class="text-xs">数据集</label>
                <select id="cfg-w-dataset" class="form-control">
                    <option value="">请选择...</option>
                    ${datasets.map(d => `<option value="${d.id}" ${sel(d.id, values.datasetId)}>${d.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="flex gap-10 mb-10">
                <div style="flex: 1">
                    <label class="text-xs">图表类型</label>
                    <select id="cfg-w-type" class="form-control">
                        <option value="bar" ${sel('bar', values.chartType)}>柱状图</option>
                        <option value="line" ${sel('line', values.chartType)}>折线图</option>
                        <option value="pie" ${sel('pie', values.chartType)}>饼图</option>
                        <option value="scatter" ${sel('scatter', values.chartType)}>散点图</option>
                        <option value="gauge" ${sel('gauge', values.chartType)}>仪表盘</option>
                        <option value="histogram" ${sel('histogram', values.chartType)}>直方图</option>
                        <option value="boxplot" ${sel('boxplot', values.chartType)}>箱线图</option>
                    </select>
                </div>
                <div style="flex: 1">
                     <label class="text-xs">颜色主题</label>
                    <select id="cfg-w-theme" class="form-control">
                        <option value="blue" ${sel('blue', values.theme)}>🔵 商务蓝</option>
                        <option value="green" ${sel('green', values.theme)}>🟢 清新绿</option>
                        <option value="orange" ${sel('orange', values.theme)}>🟠 活力橙</option>
                        <option value="purple" ${sel('purple', values.theme)}>🟣 优雅紫</option>
                        <option value="red" ${sel('red', values.theme)}>🔴 警示红</option>
                        <option value="multi" ${sel('multi', values.theme)}>🌈 多彩混合</option>
                    </select>
                </div>
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
                <label class="text-xs">聚合方式</label>
                <select id="cfg-w-agg" class="form-control">
                    <option value="count" ${sel('count', values.aggregateType)}>计数 (Count)</option>
                    <option value="sum" ${sel('sum', values.aggregateType)}>求和 (Sum)</option>
                    <option value="avg" ${sel('avg', values.aggregateType)}>平均 (Avg)</option>
                    <option value="max" ${sel('max', values.aggregateType)}>最大 (Max)</option>
                    <option value="min" ${sel('min', values.aggregateType)}>最小 (Min)</option>
                    <option value="none" ${sel('none', values.aggregateType)}>不聚合 (原始数据)</option>
                </select>
            </div>
        `;

        // 2. 布局配置 (BI 专用)
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

        // 3. 数据筛选配置
        html += `
            <div class="form-section-title mt-10 mb-10 pb-5 border-bottom text-xs font-bold text-secondary">数据筛选</div>
            
            <div class="form-group mb-10">
                <label class="text-xs">排除项 (剔除X轴特定值, 逗号分隔)</label>
                <input type="text" id="cfg-w-exclude" class="form-control" placeholder="例如: 未知, 其他" value="${esc(values.excludeValues)}">
            </div>
            
            <div class="flex gap-10 mb-10">
                <div style="flex: 2">
                    <label class="text-xs">筛选字段</label>
                    <select id="cfg-w-filter-field" class="form-control">
                        <option value="">(不筛选)</option>
                        ${fieldOptions}
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
        `;

        // 4. 高级配置
        html += `
            <div class="form-section-title mt-10 mb-10 pb-5 border-bottom text-xs font-bold text-secondary">高级配置</div>
            
            <div class="flex gap-20 mb-10">
                <label class="flex align-center gap-5 text-xs cursor-pointer select-none">
                    <input type="checkbox" id="cfg-w-label" ${chk(values.showLabel)}> 显示数值标签
                </label>
                <label class="flex align-center gap-5 text-xs cursor-pointer select-none">
                    <input type="checkbox" id="cfg-w-stacked" ${chk(values.stacked)}> 堆叠显示
                </label>
            </div>
            
            <div class="form-group mb-10">
                <label class="text-xs">次要数值轴 (右Y轴, 可选)</label>
                <select id="cfg-w-y2" class="form-control">
                    ${fieldOptions}
                </select>
            </div>
        `;

        return html;
    }

    /**
     * 从表单获取当前配置值
     */
    static getFormValues() {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
        const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

        return {
            title: getVal('cfg-w-title'),
            datasetId: getVal('cfg-w-dataset'),
            chartType: getVal('cfg-w-type'),
            xField: getVal('cfg-w-x'),
            yField: getVal('cfg-w-y'),
            aggregateType: getVal('cfg-w-agg'),
            theme: getVal('cfg-w-theme'),
            size: getVal('cfg-w-size'), // BI专属

            // 筛选
            excludeValues: getVal('cfg-w-exclude'),
            filterField: getVal('cfg-w-filter-field'),
            filterOp: getVal('cfg-w-filter-op'),
            filterValue: getVal('cfg-w-filter-val'),

            // 高级
            showLabel: getChk('cfg-w-label'),
            stacked: getChk('cfg-w-stacked'),
            y2Field: getVal('cfg-w-y2')
        };
    }

    /**
     * 回显更新字段选项
     * @param {string} optionsHtml 生成的 option HTML
     */
    static updateFieldOptions(optionsHtml) {
        // 更新所有涉及字段选择的下拉框
        const ids = ['cfg-w-x', 'cfg-w-y', 'cfg-w-y2', 'cfg-w-filter-field'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const currentVal = el.value;
                // 对于 y2, filter-field 需要保留首选项
                const prefix = (id === 'cfg-w-y2') ? '<option value="">请选择...</option>' :
                    (id === 'cfg-w-filter-field') ? '<option value="">(不筛选)</option>' : '';
                el.innerHTML = prefix + optionsHtml;
                el.value = currentVal; // 尝试恢复选中
            }
        });
    }
}

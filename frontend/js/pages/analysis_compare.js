/**
 * 数据比对模块
 * 从 analysis.js 拆分出来的比对功能
 */

/**
 * 数据比对相关方法混入
 */
const AnalysisCompareMixin = {

    /**
     * 渲染数据比对页面
     */
    renderCompare() {
        const { compareSourceId, compareTargetId, compareSourceColumns, compareTargetColumns, compareSelectedKeys, compareResult } = this.state;
        const commonColumns = compareSourceColumns.filter(c => compareTargetColumns.includes(c));
        const hasCommonColumns = commonColumns.length > 0;

        return `
            <div class="compare-page" style="display: flex; flex-direction: column; height: 100%; gap: 10px; padding: 10px; overflow: hidden;">
                <!-- 页面标题 -->
                <div class="flex-between mb-10" style="flex-shrink: 0;">
                    <h2>数据比对</h2>
                </div>
                
                <!-- 顶部：选择和预览区域 (高度收缩以腾出空间) -->
                <div class="compare-top" style="display: flex; gap: 8px; flex-shrink: 0;">
                    <!-- 数据集1 -->
                    <fieldset class="compare-fieldset" style="flex: 1; border: 1px solid #3b82f6; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; min-width: 0;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #3b82f6;">数据集1</legend>
                        <select id="compare-source" class="form-control form-control-sm" style="width: 100%; margin-bottom: 4px; height: 28px; font-size: 12px;">
                            <option value="">选择数据集...</option>
                            ${this.state.datasets.map(d => `<option value="${d.id}" ${compareSourceId == d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                        </select>
                        <div class="preview-area" style="height: 100px; overflow: auto; font-size: 11px; border: 1px solid var(--color-border-light); border-radius: 4px; background: rgba(0,0,0,0.02);">
                            ${this.renderDatasetPreview('source')}
                        </div>
                    </fieldset>
                    
                    <!-- 数据集2 -->
                    <fieldset class="compare-fieldset" style="flex: 1; border: 1px solid #f59e0b; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; min-width: 0;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #f59e0b;">数据集2</legend>
                        <select id="compare-target" class="form-control form-control-sm" style="width: 100%; margin-bottom: 4px; height: 28px; font-size: 12px;">
                            <option value="">选择数据集...</option>
                            ${this.state.datasets.map(d => `<option value="${d.id}" ${compareTargetId == d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                        </select>
                        <div class="preview-area" style="height: 100px; overflow: auto; font-size: 11px; border: 1px solid var(--color-border-light); border-radius: 4px; background: rgba(0,0,0,0.02);">
                            ${this.renderDatasetPreview('target')}
                        </div>
                    </fieldset>
                    
                    <!-- 关联主键 -->
                    <fieldset class="compare-fieldset" style="width: 160px; border: 1px solid var(--color-border); border-radius: 6px; padding: 6px; flex-shrink: 0;">
                        <legend style="padding: 0 8px; font-size: 11px; color: var(--color-primary);">关联主键</legend>
                        ${hasCommonColumns ? `
                            <div style="height: 70px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;">
                                ${commonColumns.map(col => `
                                    <label style="display: flex; align-items: center; font-size: 11px; cursor: pointer; white-space: nowrap;">
                                        <input type="checkbox" class="compare-key-checkbox" value="${col}" 
                                            ${compareSelectedKeys.includes(col) ? 'checked' : ''} style="margin-right: 4px;">
                                        ${col}
                                    </label>
                                `).join('')}
                            </div>
                            <div class="text-xs text-secondary mt-5" style="transform: scale(0.85); transform-origin: left;">全不选则比对全部字段</div>
                        ` : `<span class="text-secondary text-sm">请先选择数据集</span>`}
                    </fieldset>
                    
                    <div style="display: flex; align-items: center; flex-shrink: 0;">
                        <button class="btn btn-primary" id="btn-run-compare" ${!hasCommonColumns ? 'disabled' : ''}>执行比对</button>
                    </div>
                </div>
                
                <!-- 比对摘要 -->
                <div class="compare-summary-bar" style="display: flex; align-items: center; gap: 12px; padding: 4px 15px; background: var(--color-bg-primary); border-radius: 4px; font-size: 12px; flex-shrink: 0;">
                    <span style="color: var(--color-text-secondary);">比对结果：</span>
                    ${compareResult ? `
                        <span>相同: <b class="text-success">${compareResult.summary.same_count}</b></span>
                        <span>仅①: <b class="text-info">${compareResult.summary.source_only_count}</b></span>
                        <span>仅②: <b class="text-warning">${compareResult.summary.target_only_count}</b></span>
                        <span>差异: <b class="text-danger">${compareResult.summary.different_count}</b></span>
                        <div style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
                            <span style="font-size: 11px;">📥 导出:</span>
                            <select id="compare-export-select" class="form-control form-control-sm" style="width: auto; height: 26px; padding: 0 8px; font-size: 11px;">
                                <option value="">选择导出项...</option>
                                <option value="all">📦 全部数据</option>
                                <option value="same">✅ 相同记录 (${compareResult.summary.same_count})</option>
                                <option value="source_only">🔵 仅数据集1 (${compareResult.summary.source_only_count})</option>
                                <option value="target_only">🟠 仅数据集2 (${compareResult.summary.target_only_count})</option>
                                <option value="different">🔴 差异记录 (${compareResult.summary.different_count})</option>
                            </select>
                        </div>
                    ` : '<span class="text-secondary">等待比对结果...</span>'}
                </div>
                
                <!-- 底部比对结果 (最大限度占用高度) -->
                <div class="compare-results" style="flex: 1; display: flex; gap: 8px; min-height: 0; overflow: hidden;">
                    <fieldset class="result-panel" style="flex: 1; border: 1px solid #3b82f6; border-radius: 6px; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #3b82f6;">仅数据集1 ${compareResult ? `(${compareResult.summary.source_only_count})` : ''}</legend>
                        <div style="flex: 1; overflow: auto; padding: 4px; background: rgba(59, 130, 246, 0.02);">
                            ${this.renderComparePanel('source_only')}
                        </div>
                    </fieldset>
                    
                    <fieldset class="result-panel" style="flex: 1; border: 1px solid #f59e0b; border-radius: 6px; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #f59e0b;">仅数据集2 ${compareResult ? `(${compareResult.summary.target_only_count})` : ''}</legend>
                        <div style="flex: 1; overflow: auto; padding: 4px; background: rgba(245, 158, 11, 0.02);">
                            ${this.renderComparePanel('target_only')}
                        </div>
                    </fieldset>
                    
                    <fieldset class="result-panel" style="flex: 1; border: 1px solid #10b981; border-radius: 6px; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #10b981;">相同记录 ${compareResult ? `(${compareResult.summary.same_count})` : ''}</legend>
                        <div style="flex: 1; overflow: auto; padding: 4px; background: rgba(16, 185, 129, 0.02);">
                            ${this.renderComparePanel('same')}
                        </div>
                    </fieldset>
                    
                    <fieldset class="result-panel" style="flex: 1; border: 1px solid #ef4444; border-radius: 6px; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
                        <legend style="padding: 0 8px; font-size: 11px; color: #ef4444;">差异记录 ${compareResult ? `(${compareResult.summary.different_count})` : ''}</legend>
                        <div style="flex: 1; overflow: auto; padding: 4px; background: rgba(239, 68, 68, 0.02);">
                            ${this.renderComparePanel('different')}
                        </div>
                    </fieldset>
                </div>
            </div>
        `;
    },

    /**
     * 渲染单个比对结果面板
     */
    renderComparePanel(type) {
        const result = this.state.compareResult;
        if (!result) {
            return '<div class="text-center text-secondary text-sm p-10">等待比对...</div>';
        }

        let data = [];
        switch (type) {
            case 'same': data = result.same || []; break;
            case 'source_only': data = result.source_only || []; break;
            case 'target_only': data = result.target_only || []; break;
            case 'different': data = result.different || []; break;
        }

        if (data.length === 0) {
            return '<div class="text-center text-secondary text-sm p-10">无数据</div>';
        }

        const columns = Object.keys(data[0]).filter(k => !k.startsWith('_target_'));
        const targetCols = Object.keys(data[0]).filter(k => k.startsWith('_target_'));

        return `
            <div class="text-xs text-secondary mb-5">显示前 ${Math.min(data.length, 50)} 条</div>
            <table class="mini-table" style="width: 100%; font-size: 11px; border-collapse: collapse;">
                <thead>
                    <tr>
                        ${columns.map(c => `<th style="padding: 3px 5px; border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap;">${c}</th>`).join('')}
                        ${type === 'different' ? targetCols.map(c => `<th style="padding: 3px 5px; border-bottom: 1px solid var(--color-border); color: #f59e0b; text-align: left; white-space: nowrap;">${c.replace('_target_', '→')}</th>`).join('') : ''}
                    </tr>
                </thead>
                <tbody>
                    ${data.slice(0, 50).map(row => `
                        <tr>
                            ${columns.map(c => `<td style="padding: 2px 5px; border-bottom: 1px solid var(--color-border); white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">${row[c] ?? ''}</td>`).join('')}
                            ${type === 'different' ? targetCols.map(c => `<td style="padding: 2px 5px; border-bottom: 1px solid var(--color-border); color: #f59e0b; white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">${row[c] ?? ''}</td>`).join('') : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    /**
     * 渲染数据集预览
     */
    renderDatasetPreview(type) {
        const previewData = type === 'source' ? this.state.compareSourcePreview : this.state.compareTargetPreview;

        if (!previewData || !previewData.items || previewData.items.length === 0) {
            return '<div class="text-center text-secondary" style="padding: 20px;">选择数据集后显示预览</div>';
        }

        const columns = previewData.columns || [];
        const items = previewData.items || [];

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        ${columns.map(c => `<th style="padding: 3px 6px; border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; font-size: 11px; background: var(--color-bg-hover);">${c}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${items.slice(0, 5).map(row => `
                        <tr>
                            ${columns.map(c => `<td style="padding: 2px 6px; border-bottom: 1px solid var(--color-border); white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; font-size: 11px;">${row[c] ?? ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="text-xs text-secondary" style="padding: 4px 0;">共 ${previewData.total || items.length} 条记录</div>
        `;
    },


    /**
     * 导出比对数据
     */
    async exportCompareData(type) {
        const result = this.state.compareResult;
        if (!result) return;

        let data = [];
        let filename = '';

        switch (type) {
            case 'same':
                data = result.same || [];
                filename = '相同数据';
                break;
            case 'source_only':
                data = result.source_only || [];
                filename = '仅源数据集';
                break;
            case 'target_only':
                data = result.target_only || [];
                filename = '仅目标数据集';
                break;
            case 'different':
                data = result.different || [];
                filename = '差异数据';
                break;
            case 'all':
                // 导出所有数据
                this.exportAllCompareData();
                return;
        }

        if (data.length === 0) {
            Toast.warning('没有可导出的数据');
            return;
        }

        this.downloadAsCSV(data, filename);
    },

    /**
     * 导出所有比对数据
     */
    exportAllCompareData() {
        const result = this.state.compareResult;
        const allData = {
            '相同数据': result.same || [],
            '仅源数据集': result.source_only || [],
            '仅目标数据集': result.target_only || [],
            '差异数据': result.different || []
        };

        // 逐个导出
        Object.entries(allData).forEach(([name, data]) => {
            if (data.length > 0) {
                this.downloadAsCSV(data, name);
            }
        });

        Toast.success('已导出所有比对结果');
    },

    /**
     * 下载数据为CSV文件
     */
    downloadAsCSV(data, filename) {
        if (!data || data.length === 0) return;

        const columns = Object.keys(data[0]);
        const csvContent = [
            columns.join(','),
            ...data.map(row => columns.map(c => {
                let val = row[c];
                if (val === null || val === undefined) val = '';
                // 处理包含逗号或引号的值
                val = String(val).replace(/"/g, '""');
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = `"${val}"`;
                }
                return val;
            }).join(','))
        ].join('\n');

        // 添加 BOM 以支持中文
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    },

    /**
     * 绑定比对相关事件
     */
    bindCompareEvents() {
        if (this._compareEventsBound) return;
        this._compareEventsBound = true;

        // 比对 - 执行
        this.delegate('click', '#btn-run-compare', async () => {
            const sId = this.state.compareSourceId;
            const tId = this.state.compareTargetId;
            if (!sId || !tId) return Toast.error('请选择源数据集和目标数据集');

            // 获取公共字段
            const commonColumns = this.state.compareSourceColumns.filter(
                c => this.state.compareTargetColumns.includes(c)
            );
            if (commonColumns.length === 0) return Toast.error('两个数据集没有公共字段');

            // 使用选中的主键，如果没有选择则使用全部公共字段
            let keys = this.state.compareSelectedKeys;
            if (keys.length === 0) {
                keys = commonColumns;
            }

            try {
                Toast.info('正在执行比对...');
                const res = await AnalysisApi.compare({
                    source_id: parseInt(sId),
                    target_id: parseInt(tId),
                    join_keys: keys
                });
                this.setState({ compareResult: res.data });
                Toast.success('比对完成');
            } catch (err) { Toast.error(err.message); }
        });

        // 比对 - 数据集选择变化时加载字段 (使用 change 而非 click)
        this.delegate('change', '#compare-source', async (e, el) => {
            const sourceId = el.value;
            if (sourceId) {
                try {
                    const res = await AnalysisApi.getDatasetData(parseInt(sourceId), { page: 1, size: 5 });
                    this.setState({
                        compareSourceId: sourceId,
                        compareSourceColumns: res.data?.columns || [],
                        compareSourcePreview: res.data,
                        compareSelectedKeys: []
                    });
                } catch (err) {
                    this.setState({ compareSourceId: sourceId, compareSourceColumns: [], compareSourcePreview: null, compareSelectedKeys: [] });
                }
            } else {
                this.setState({ compareSourceId: '', compareSourceColumns: [], compareSourcePreview: null, compareSelectedKeys: [] });
            }
        });

        this.delegate('change', '#compare-target', async (e, el) => {
            const targetId = el.value;
            if (targetId) {
                try {
                    const res = await AnalysisApi.getDatasetData(parseInt(targetId), { page: 1, size: 5 });
                    this.setState({
                        compareTargetId: targetId,
                        compareTargetColumns: res.data?.columns || [],
                        compareTargetPreview: res.data,
                        compareSelectedKeys: []
                    });
                } catch (err) {
                    this.setState({ compareTargetId: targetId, compareTargetColumns: [], compareTargetPreview: null, compareSelectedKeys: [] });
                }
            } else {
                this.setState({ compareTargetId: '', compareTargetColumns: [], compareTargetPreview: null, compareSelectedKeys: [] });
            }
        });

        // 比对 - 主键复选框变化
        this.delegate('change', '.compare-key-checkbox', () => {
            const checkboxes = document.querySelectorAll('.compare-key-checkbox:checked');
            const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
            this.setState({ compareSelectedKeys: selectedKeys });
        });

        // 比对 - 导出选择变化
        this.delegate('change', '#compare-export-select', (e, el) => {
            const type = el.value;
            if (type) {
                this.exportCompareData(type);
                el.value = ''; // 重置为默认选项
            }
        });
    }
};

// 将方法混入到 AnalysisPage 原型（如果已定义）
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisCompareMixin);
}

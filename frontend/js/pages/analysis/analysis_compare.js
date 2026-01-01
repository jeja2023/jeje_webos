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
            <div class="compare-page">
                <!-- 顶部配置区域 -->
                <div class="compare-header-row">
                    <!-- 数据集1 -->
                    <div class="compare-card compare-source-card">
                        <div class="compare-card-title">
                            <span>🔵 数据集 1 (源)</span>
                            <select id="compare-source" class="form-control-sm" style="width: 150px; border: none; background: transparent; font-weight: bold;">
                                <option value="">选择数据集...</option>
                                ${this.state.datasets.map(d => `<option value="${d.id}" ${compareSourceId == d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="preview-container">
                            ${this.renderDatasetPreview('source')}
                        </div>
                    </div>
                    
                    <!-- 数据集2 -->
                    <div class="compare-card compare-target-card">
                        <div class="compare-card-title">
                            <span>🟠 数据集 2 (目标)</span>
                            <select id="compare-target" class="form-control-sm" style="width: 150px; border: none; background: transparent; font-weight: bold;">
                                <option value="">选择数据集...</option>
                                ${this.state.datasets.map(d => `<option value="${d.id}" ${compareTargetId == d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="preview-container">
                            ${this.renderDatasetPreview('target')}
                        </div>
                    </div>
                    
                    <!-- 关联配置 -->
                    <div class="compare-card compare-config-card">
                        <div class="compare-card-title">🔗 关联主键</div>
                        <div style="flex: 1; overflow-y: auto; padding-right: 5px;">
                            ${hasCommonColumns ? `
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    ${commonColumns.map(col => `
                                        <label style="display: flex; align-items: center; font-size: 11px; cursor: pointer; user-select: none;">
                                            <input type="checkbox" class="compare-key-checkbox" value="${col}" 
                                                ${compareSelectedKeys.includes(col) ? 'checked' : ''} style="margin-right: 6px;">
                                            ${col}
                                        </label>
                                    `).join('')}
                                </div>
                            ` : `<div class="text-secondary text-xs p-10 text-center">请先选择具有公共字段的数据集</div>`}
                        </div>
                        <button class="btn btn-primary btn-sm mt-10" id="btn-run-compare" ${!hasCommonColumns ? 'disabled' : ''} style="width: 100%;">
                            开始执行比对
                        </button>
                    </div>
                </div>
                
                <!-- 比对结果摘要 (只在有结果时显示详细) -->
                <div class="compare-summary-bar">
                    ${compareResult ? `
                        <div class="compare-stats-group">
                            <div class="compare-stat-item" title="完全一致的记录">
                                <i class="ri-checkbox-circle-line" style="color: #10b981;"></i>
                                <span class="compare-stat-label">相同:</span>
                                <span class="compare-stat-value" style="color: #10b981;">${compareResult.summary.same_count}</span>
                            </div>
                            <div class="compare-stat-item" title="仅在源数据集中存在的记录">
                                <i class="ri-arrow-left-circle-line" style="color: #3b82f6;"></i>
                                <span class="compare-stat-label">仅源1:</span>
                                <span class="compare-stat-value" style="color: #3b82f6;">${compareResult.summary.source_only_count}</span>
                            </div>
                            <div class="compare-stat-item" title="仅在目标数据集中存在的记录">
                                <i class="ri-arrow-right-circle-line" style="color: #f59e0b;"></i>
                                <span class="compare-stat-label">仅源2:</span>
                                <span class="compare-stat-value" style="color: #f59e0b;">${compareResult.summary.target_only_count}</span>
                            </div>
                            <div class="compare-stat-item" title="主键相同但内容有差异的记录">
                                <i class="ri-error-warning-line" style="color: #ef4444;"></i>
                                <span class="compare-stat-label">差异:</span>
                                <span class="compare-stat-value" style="color: #ef4444;">${compareResult.summary.different_count}</span>
                            </div>
                        </div>
                        
                        <div class="dropdown">
                            <button class="btn btn-outline-secondary btn-xs dropdown-toggle" type="button" style="border-radius: 15px; height: 30px; padding: 0 15px; font-size: 12px; display: flex; align-items: center; gap: 6px; border-color: var(--color-border);">
                                <i class="ri-download-2-line"></i> 导出结果 <i class="ri-arrow-down-s-line"></i>
                            </button>
                            <div class="dropdown-menu">
                                <div class="dropdown-item export-action" data-export-type="all"><i class="ri-archive-line mr-5"></i> 打包全部导出 (.csv)</div>
                                <div class="dropdown-divider"></div>
                                <div class="dropdown-item export-action" data-export-type="same"><i class="ri-checkbox-circle-fill text-success mr-5"></i> 相同记录 (${compareResult.summary.same_count})</div>
                                <div class="dropdown-item export-action" data-export-type="source_only"><i class="ri-arrow-left-circle-fill text-primary mr-5"></i> 仅源数据集 (${compareResult.summary.source_only_count})</div>
                                <div class="dropdown-item export-action" data-export-type="target_only"><i class="ri-arrow-right-circle-fill text-warning mr-5"></i> 仅目标数据集 (${compareResult.summary.target_only_count})</div>
                                <div class="dropdown-item export-action" data-export-type="different"><i class="ri-error-warning-fill text-danger mr-5"></i> 差异记录 (${compareResult.summary.different_count})</div>
                            </div>
                        </div>
                    ` : `
                        <div class="flex-center gap-10 text-secondary" style="font-size: 13px; opacity: 0.8;">
                            <i class="ri-information-line"></i>
                            <span>完成数据源选择和主键配置后，点击右上方“开始执行比对”即可查看详情</span>
                        </div>
                    `}
                </div>
                
                <!-- 结果明细面板 -->
                <div class="compare-results">
                    <!-- 仅源数据集 -->
                    <div class="result-panel-modern">
                        <div class="panel-header" style="color: #3b82f6;">
                            <span>🔵 仅数据源1 ${compareResult ? `(${compareResult.summary.source_only_count})` : ''}</span>
                            <span class="text-xs font-normal">目标数据集中不存在</span>
                        </div>
                        <div class="panel-body">
                            ${this.renderComparePanel('source_only')}
                        </div>
                    </div>
                    
                    <!-- 仅目标数据集 -->
                    <div class="result-panel-modern">
                        <div class="panel-header" style="color: #f59e0b;">
                            <span>🟠 仅数据源2 ${compareResult ? `(${compareResult.summary.target_only_count})` : ''}</span>
                            <span class="text-xs font-normal">源数据集中不存在</span>
                        </div>
                        <div class="panel-body">
                            ${this.renderComparePanel('target_only')}
                        </div>
                    </div>

                    <!-- 相同记录 -->
                    <div class="result-panel-modern">
                        <div class="panel-header" style="color: #10b981;">
                            <span>🟢 全量一致 ${compareResult ? `(${compareResult.summary.same_count})` : ''}</span>
                            <span class="text-xs font-normal">所有比对字段均完全吻合</span>
                        </div>
                        <div class="panel-body">
                            ${this.renderComparePanel('same')}
                        </div>
                    </div>

                    <!-- 差异记录 -->
                    <div class="result-panel-modern">
                        <div class="panel-header" style="color: #ef4444;">
                            <span>🔴 差异记录 ${compareResult ? `(${compareResult.summary.different_count})` : ''}</span>
                            <span class="text-xs font-normal">关键字段相同但内容不同</span>
                        </div>
                        <div class="panel-body">
                            ${this.renderComparePanel('different')}
                        </div>
                    </div>
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
            return '<div class="text-center text-secondary text-sm p-40">等待比对执行...</div>';
        }

        let data = [];
        switch (type) {
            case 'same': data = result.same || []; break;
            case 'source_only': data = result.source_only || []; break;
            case 'target_only': data = result.target_only || []; break;
            case 'different': data = result.different || []; break;
        }

        if (data.length === 0) {
            return '<div class="text-center text-secondary text-sm p-40"><i class="fas fa-ghost mb-10 d-block" style="font-size: 24px; opacity: 0.3;"></i>空空如也</div>';
        }

        const columns = Object.keys(data[0]).filter(k => !k.startsWith('_target_'));

        return `
            <table class="modern-table">
                <thead>
                    <tr>
                        ${columns.map(c => `<th>${c}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${data.slice(0, 50).map(row => `
                        <tr>
                            ${columns.map(c => {
            let val = row[c] ?? '';
            if (type === 'different') {
                const targetVal = row['_target_' + c];
                if (targetVal !== undefined && targetVal !== val) {
                    return `<td><span class="diff-highlight" title="目标值: ${targetVal}">${val}</span><span class="target-val">→ ${targetVal}</span></td>`;
                }
            }
            return `<td>${val}</td>`;
        }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${data.length > 50 ? `<div class="text-center p-10 text-xs text-secondary bg-light">仅显示前 50 条记录，完整数据请点击导出查看</div>` : ''}
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
            <table class="modern-table">
                <thead>
                    <tr>
                        ${columns.map(c => `<th>${c}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${items.slice(0, 5).map(row => `
                        <tr>
                            ${columns.map(c => `<td>${row[c] ?? ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="text-xs text-secondary" style="padding: 4px 8px;">共 ${previewData.total || items.length} 条记录</div>
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

        // 比对 - 数据集选择变化时加载字段
        this.delegate('change', '#compare-source', async (e, el) => {
            const sourceId = el.value;
            if (sourceId) {
                try {
                    const res = await AnalysisApi.getDatasetData(parseInt(sourceId), { page: 1, size: 5 });
                    this.setState({
                        compareSourceId: sourceId,
                        compareSourceColumns: res.data?.columns || [],
                        compareSourcePreview: res.data,
                        compareSelectedKeys: [],
                        compareResult: null // 选择变化时重置结果
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
                        compareSelectedKeys: [],
                        compareResult: null // 选择变化时重置结果
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

        // 比对 - 结果导出
        this.delegate('click', '.export-action', (e, el) => {
            e.preventDefault(); // 防止 href="#" 跳转
            const type = el.dataset.exportType;
            if (type) {
                this.exportCompareData(type);
            }
        });

        // 下拉菜单 Toggle
        this.delegate('click', '.dropdown-toggle', (e, el) => {
            e.stopPropagation();
            const menu = el.nextElementSibling;
            if (menu && menu.classList.contains('dropdown-menu')) {
                // 关闭其他已打开的菜单
                document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            }
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        });
    }

};

// 将方法混入到 AnalysisPage 原型（如果已定义）
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisCompareMixin);
}

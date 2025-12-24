/**
 * 数据分析模块 - 数据清洗功能
 */

const AnalysisCleaningMixin = {

    getOpLabel(op) {
        const labels = {
            'drop_missing': '删除空值行',
            'fill_missing': '填充空值',
            'drop_duplicates': '删除重复项',
            'drop_empty_columns': '删除全空列',
            'trim_whitespace': '去除两端空白',
            'replace_text': '文本批量替换',
            'format_datetime': '时间格式化',
            'round_numeric': '数值保留小数',
            'to_lowercase': '转为小写',
            'to_uppercase': '转为大写'
        };
        return labels[op] || op;
    },

    renderCleaning() {
        const { cleanPreviewData, cleanResult, cleaningDataset, cleaningTasks = [] } = this.state;

        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <h2>数据清洗</h2>
                </div>
                
                <div class="cleaning-layout" style="display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: start; height: calc(100vh - 160px);">
                    <!-- 左侧配置面板 -->
                    <div class="cleaning-config-container bg-primary p-20 border-radius-12" style="font-size: 13px; border: 1px solid var(--color-border); height: 100%; overflow-y: auto;">
                        <div class="form-group mb-12">
                            <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">选择数据集</label>
                            <select id="clean-dataset" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;">
                                <option value="">选择数据集...</option>
                                ${this.state.datasets.map(d => `<option value="${d.id}" ${cleaningDataset === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>
                        
                        <button class="btn btn-sm btn-secondary w-100 mb-15" id="btn-preview-clean-data" style="height: 32px;">
                            👁️ 预览原始数据
                        </button>
                        
                        <div style="height: 1px; background: var(--color-border); margin: 15px 0; opacity: 0.5;"></div>
                        
                        <!-- 清洗规则配置区 -->
                        <div style="background: var(--color-bg-secondary); padding: 12px; border-radius: 8px; border: 1px dashed var(--color-border);">
                            <div class="form-group mb-12">
                                <label class="mb-6" style="display: block; font-size: 11px; color: var(--color-text-secondary); font-weight: 500;">清洗操作</label>
                                <select id="clean-op" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;">
                                    <option value="drop_missing">❌ 删除空值行</option>
                                    <option value="fill_missing">🎨 填充空值</option>
                                    <option value="drop_duplicates">👯 删除重复项</option>
                                    <option value="drop_empty_columns">🧹 删除全空列</option>
                                    <option value="trim_whitespace">✂️ 去除两端空白</option>
                                    <option value="replace_text">🔍 文本批量替换</option>
                                    <option value="format_datetime">📅 时间格式化</option>
                                    <option value="round_numeric">🔢 数值保留小数</option>
                                    <option value="to_lowercase">abc 转为小写</option>
                                    <option value="to_uppercase">ABC 转为大写</option>
                                </select>
                            </div>
                        
                            <!-- 动态参数区域 -->
                            <div id="clean-params-container">
                                <div class="form-group mb-12" id="fill-value-group" style="display: none;">
                                    <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">填充值</label>
                                    <input type="text" id="clean-fill-value" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;" placeholder="空值替换为...">
                                </div>

                                <div id="replace-params-group" style="display: none;">
                                    <div class="form-group mb-12">
                                        <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">查找内容</label>
                                        <input type="text" id="clean-old-value" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;" placeholder="要被替换的文字">
                                    </div>
                                    <div class="form-group mb-12">
                                        <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">替换为</label>
                                        <input type="text" id="clean-new-value" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;" placeholder="新文字">
                                    </div>
                                </div>

                                <div class="form-group mb-12" id="time-format-group" style="display: none;">
                                    <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">时间格式</label>
                                    <input type="text" id="clean-time-format" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;" value="%Y-%m-%d %H:%M:%S" placeholder="%Y-%m-%d">
                                    <div style="font-size: 11px; color: var(--color-text-secondary); mt-4;">*常用: %Y-%m-%d, %H:%M</div>
                                </div>

                                <div class="form-group mb-12" id="round-params-group" style="display: none;">
                                    <label class="mb-6" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">保留位数</label>
                                    <input type="number" id="clean-decimals" class="form-control form-control-sm" style="width: 100%; height: 32px; font-size: 13px;" value="2" min="0" max="10">
                                </div>
                            </div>
                            <div class="form-group mb-12">
                                <label class="mb-6" style="display: block; font-size: 11px; color: var(--color-text-secondary);">适用列 (可选)</label>
                                <input type="text" id="clean-cols" class="form-control form-control-sm" placeholder="列1, 列2 (留空全选)">
                            </div>
                            
                            <button class="btn btn-sm btn-outline-primary w-100" id="btn-add-clean-task" style="height: 30px; font-size: 12px;">
                                ➕ 添加到任务清单
                            </button>
                        </div>

                        <!-- 任务清单展示 -->
                        <div class="mt-15">
                            <label class="mb-8" style="display: block; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">任务清单 (${cleaningTasks.length})</label>
                            <div style="max-height: 150px; overflow-y: auto; background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: 6px; padding: 4px;">
                                ${cleaningTasks.length > 0 ? cleaningTasks.map((t, idx) => `
                                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--color-border); font-size: 11px;">
                                        <span title="${t.operation}">${this.getOpLabel(t.operation)}</span>
                                        <button class="btn-clean-task-remove text-danger" data-index="${idx}" style="background: none; border: none; padding: 0 4px; cursor: pointer; font-size: 14px;">×</button>
                                    </div>
                                `).join('') : '<div class="p-10 text-center text-secondary" style="font-size: 11px;">暂无任务，请从上方添加</div>'}
                            </div>
                        </div>
                        
                        <button class="btn btn-sm btn-primary w-100 mt-15" id="btn-run-clean" style="height: 38px; font-weight: 600;" ${cleaningTasks.length === 0 ? 'disabled' : ''}>
                            🚀 执行清洗
                        </button>
                        
                        ${cleanResult ? `
                            <div class="clean-result mt-15 p-12 bg-secondary border-radius-8" style="font-size: 12px; border-left: 3px solid var(--color-info);">
                                <div class="text-info mb-8 font-600">✨ ${cleanResult.saved ? '已正式入库' : '任务已执行，见预览'}</div>
                                <div class="text-sm">
                                    ${cleanResult.name ? `<div class="mb-4">数据集：<strong>${cleanResult.name}</strong></div>` : ''}
                                    <div>结论：<strong>${cleanResult.row_count}</strong> 行</div>
                                </div>
                                <div class="mt-12" style="display: flex; flex-direction: column; gap: 8px;">
                                    ${!cleanResult.saved ? `
                                        <button class="btn btn-sm btn-primary" id="btn-save-cleaned" style="width: 100%; height: 34px;">
                                            💾 保存到数据库
                                        </button>
                                        <button class="btn btn-sm btn-secondary" id="btn-export-cleaned" style="width: 100%; height: 34px;">
                                            📥 导出当前预览
                                        </button>
                                    ` : `
                                        <div class="text-center w-100 py-4 text-success" style="font-weight: 500; background: rgba(var(--color-success-rgb), 0.1); border-radius: 4px;">
                                            🎉 已保存至数据管理
                                        </div>
                                        <button class="btn btn-sm btn-primary" id="btn-export-cleaned" data-id="${cleanResult.id}" style="width: 100%; height: 34px; margin-top: 4px;">
                                            📥 导出正式文件
                                        </button>
                                    `}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- 右侧预览区域 -->
                    <div class="cleaning-preview bg-primary p-20 border-radius-12" style="border: 1px solid var(--color-border); height: 100%; display: flex; flex-direction: column; overflow: hidden;">
                        <div class="flex-between mb-12">
                            <h3 class="m-0" style="font-size: 15px; font-weight: 600;">数据预览</h3>
                            ${cleanPreviewData ? `<span class="text-secondary" style="font-size: 12px;">前 ${Math.min(cleanPreviewData.items?.length || 0, 100)} 行</span>` : ''}
                        </div>
                        
                        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                        ${cleanPreviewData ? `
                            <div class="table-container" style="flex: 1; overflow: auto; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary);">
                                <table class="table table-sm table-hover" style="font-size: 12px; margin: 0;">
                                    <thead>
                                        <tr>
                                            ${(cleanPreviewData.columns || []).map(col => `<th style="padding: 6px 8px;">${col}</th>`).join('')}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(cleanPreviewData.items || []).slice(0, 100).map(row => `
                                            <tr>
                                                ${(cleanPreviewData.columns || []).map(col => {
            const val = row[col];
            const isEmpty = val === null || val === undefined || val === '';
            return `<td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border); min-width: 60px;">${isEmpty ? '' : val}</td>`;
        }).join('')}
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="data-stats mt-10 p-10 bg-secondary border-radius-8" style="font-size: 12px;">
                                <span>总行数：<strong>${cleanPreviewData.total || 0}</strong></span>
                                <span style="margin-left: 15px;">总列数：<strong>${cleanPreviewData.columns?.length || 0}</strong></span>
                            </div>
                        ` : `
                            <div class="empty-state text-center text-secondary" style="padding: 60px 20px;">
                                <div style="font-size: 32px; margin-bottom: 10px;">📋</div>
                                <p style="font-size: 13px;">选择数据集后点击"预览数据"</p>
                            </div>
                        `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    getCleaningParams() {
        const dsId = document.getElementById('clean-dataset').value;
        if (!dsId) throw new Error('请选择数据集');

        // 使用任务清单
        const tasks = this.state.cleaningTasks || [];
        if (tasks.length === 0) throw new Error('任务清单为空，请先添加清洗步骤');

        return {
            dataset_id: parseInt(dsId),
            operations: tasks,
            params: {} // 兼容
        };
    },

    bindCleaningEvents() {
        if (this._cleaningEventsBound) return;
        this._cleaningEventsBound = true;

        // 预览数据
        this.delegate('click', '#btn-preview-clean-data', async () => {
            const dsId = document.getElementById('clean-dataset').value;
            if (!dsId) return Toast.error('请选择数据集');

            try {
                Toast.info('正在加载数据预览...');
                const res = await AnalysisApi.getDatasetData(parseInt(dsId), { page: 1, size: 100 });
                this.setState({
                    cleanPreviewData: res.data,
                    cleaningDataset: parseInt(dsId),
                    cleanResult: null
                });
            } catch (err) { Toast.error(err.message || '加载失败'); }
        });

        // 动态显示操作参数面板
        this.delegate('change', '#clean-op', (e, el) => {
            const op = el.value;
            const groups = {
                'fill_missing': 'fill-value-group',
                'replace_text': 'replace-params-group',
                'format_datetime': 'time-format-group',
                'round_numeric': 'round-params-group'
            };
            Object.values(groups).forEach(id => {
                const group = document.getElementById(id);
                if (group) group.style.display = 'none';
            });
            if (groups[op]) {
                const group = document.getElementById(groups[op]);
                if (group) group.style.display = 'block';
            }
        });

        // 添加任务
        this.delegate('click', '#btn-add-clean-task', () => {
            const op = document.getElementById('clean-op').value;
            const colsStr = document.getElementById('clean-cols').value;
            const task = {
                operation: op,
                columns: colsStr ? colsStr.split(',').map(c => c.trim()) : null,
                params: {}
            };

            // 提取参数
            if (op === 'fill_missing') {
                const val = document.getElementById('clean-fill-value').value;
                if (!val) return Toast.error('请输入填充值');
                task.fill_value = val;
            } else if (op === 'replace_text') {
                task.params.old_value = document.getElementById('clean-old-value').value;
                task.params.new_value = document.getElementById('clean-new-value').value;
            } else if (op === 'format_datetime') {
                task.params.format = document.getElementById('clean-time-format').value;
            } else if (op === 'round_numeric') {
                task.params.decimals = document.getElementById('clean-decimals').value;
            }

            const tasks = [...(this.state.cleaningTasks || []), task];
            this.setState({ cleaningTasks: tasks });
            Toast.success('已添加到清单');
        });

        // 移除任务
        this.delegate('click', '.btn-clean-task-remove', (e, el) => {
            const idx = parseInt(el.dataset.index);
            const tasks = [...this.state.cleaningTasks];
            tasks.splice(idx, 1);
            this.setState({ cleaningTasks: tasks });
        });

        // 执行清洗 (预览)
        this.delegate('click', '#btn-run-clean', async () => {
            try {
                const payload = this.getCleaningParams();
                payload.save_mode = 'preview';

                Toast.info('正在生成预览...');
                const res = await AnalysisApi.clean(payload);
                Toast.success('✅ 预览已更新，效果见右侧图表');

                this.setState({
                    cleanPreviewData: {
                        items: res.data.preview,
                        columns: res.data.columns,
                        total: res.data.row_count
                    },
                    cleanResult: { ...res.data, saved: false }
                });
            } catch (err) { Toast.error(err.message || '预览失败'); }
        });

        // 保存结果
        this.delegate('click', '#btn-save-cleaned', async () => {
            try {
                const payload = this.getCleaningParams();
                payload.save_mode = 'new';
                Toast.info('正在保存数据集...');
                const res = await AnalysisApi.clean(payload);
                Toast.success('✅ 任务执行成功，已入库');
                this.setState({
                    cleanResult: { ...res.data, saved: true }
                });
                this.fetchDatasets();
            } catch (err) { Toast.error(err.message || '保存失败'); }
        });

        // 导出结果
        this.delegate('click', '#btn-export-cleaned', async () => {
            try {
                const payload = this.getCleaningParams();
                Toast.info('正在准备导出文件...');
                const blob = await AnalysisApi.exportCleaned(payload);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cleaned_data_${new Date().getTime()}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                Toast.success('✅ 导出成功');
            } catch (err) { Toast.error(err.message || '导出失败'); }
        });
    }

};

if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisCleaningMixin);
}

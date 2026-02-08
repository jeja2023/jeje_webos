/**
 * 数据分析模块 - SQL 查询功能
 */

const AnalysisSqlMixin = {

    /**
     * 渲染 SQL 查询页面
     */
    renderSqlQuery() {
        const { sqlTables = [], sqlResult, sqlExecuting } = this.state;

        return `
            <div class="sql-query-page p-20">
                <div class="flex-between mb-20">
                    <h2>SQL查询</h2>
                    <button class="btn btn-ghost btn-sm" id="btn-refresh-tables">🔄 刷新表结构</button>
                </div>
                
                <div class="sql-query-layout">
                    <!-- 左侧: 表和字段树 -->
                    <div class="sql-tables-panel bg-primary border-radius-10 p-15">
                        <h4 class="mb-10 flex align-center gap-5">📂 数据字典</h4>
                        <div class="sql-table-list">
                            ${sqlTables.length > 0
                ? sqlTables.map(t => {
                    const ds = this.state.datasets.find(d => d.table_name === t);
                    const displayName = ds ? ds.name : t;
                    return `
                                    <div class="sql-tree-item" data-table="${Utils.escapeHtml(t)}">
                                        <div class="sql-table-header" data-table="${Utils.escapeHtml(t)}" title="物理表名: ${Utils.escapeHtml(t)}">
                                            <span class="tree-icon">▶</span>
                                            <span class="table-icon">📋</span>
                                            <span class="table-name">${Utils.escapeHtml(displayName)}</span>
                                        </div>
                                        <div class="sql-columns-list" id="cols-${t.replace(/\W/g, '_')}" style="display:none">
                                            <div class="text-center p-10"><span class="loading-icon"></span></div>
                                        </div>
                                    </div>
                                    `;
                }).join('')
                : '<p class="text-secondary text-sm">暂无数据表</p>'
            }
                        </div>
                    </div>
                    
                    <!-- 右侧: 合并后的编辑器区域 -->
                    <div class="sql-main-panel flex-column gap-10">
                        
                        <!-- 1. 可视化辅助构建区 -->
                        <div class="visual-helper-box bg-primary border-radius-10 p-12-20 border-accent">
                            <div class="flex-between align-center mb-10">
                                <div class="flex align-center gap-10">
                                    <span class="tag tag-primary">可视化助手</span>
                                    <span class="text-secondary text-xs">自动生成 SQL</span>
                                </div>
                                <div class="flex align-center gap-10" style="width: 300px;">
                                    <label class="m-0 text-xs text-secondary" style="white-space:nowrap">目标表:</label>
                                    <select id="builder-table" class="form-control form-control-sm">
                                        <option value="">-- 请选择数据表 --</option>
                                        ${sqlTables.map(t => {
                const ds = this.state.datasets.find(d => d.table_name === t);
                const displayName = ds ? ds.name : t;
                return `<option value="${Utils.escapeHtml(t)}" ${this.state.builderTable === t ? 'selected' : ''}>${Utils.escapeHtml(displayName)}</option>`;
            }).join('')}
                                    </select>
                                </div>
                            </div>
                            
                            <div id="builder-fields-container" style="${this.state.builderTable ? '' : 'display:none'}">
                                        <div class="builder-section mb-10">
                                            <label>2. 选择查询字段 (SELECT)</label>
                                            <div class="builder-fields-grid mt-5" id="builder-fields-selection">
                                                <!-- 动态加载字段按钮 -->
                                                ${(this.state.builderColumns || []).map(c => `
                                                    <div class="field-checkbox-item">
                                                        <input type="checkbox" id="field-${Utils.escapeHtml(c)}" class="builder-field-cb" value="${Utils.escapeHtml(c)}" ${this.state.builderSelectedFields?.includes(c) ? 'checked' : ''}>
                                                        <label for="field-${Utils.escapeHtml(c)}" class="text-nowrap">${Utils.escapeHtml(c)}</label>
                                                        ${this.state.builderSelectedFields?.includes(c) ? `
                                                            <input type="text" class="form-control form-control-xs builder-field-alias" 
                                                                style="width: 80px; margin-left: 5px;"
                                                                placeholder="别名" data-field="${Utils.escapeHtml(c)}"
                                                                value="${Utils.escapeHtml(this.state.builderFieldAliases[c] || '')}">
                                                        ` : ''}
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                
                                <div class="builder-layout-footer mt-15">
                                    <div class="builder-footer-left">
                                        <div class="flex-between align-center mb-8">
                                            <div class="flex align-center gap-2">
                                                <label class="m-0 text-sm font-bold">筛选条件 (WHERE)</label>
                                                <span class="text-xs text-secondary">(可选多条)</span>
                                            </div>
                                            <button id="btn-add-filter" class="btn btn-ghost btn-xs">➕ 添加条件</button>
                                        </div>
                                        <div id="builder-filters-list">
                                            <!-- 第一个条件（默认显示） -->
                                            <div class="flex gap-5 mb-5 align-center">
                                                <select class="form-control form-control-sm builder-filter-field" style="width:95px">
                                                    <option value="">选择字段...</option>
                                                    ${(this.state.builderColumns || []).map(c => `<option value="${Utils.escapeHtml(c)}" ${this.state.builderFilterField === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
                                                </select>
                                                <select class="form-control form-control-sm builder-filter-op" style="width:110px">
                                                    <optgroup label="数值/比较">
                                                        <option value="=" ${this.state.builderFilterOp === '=' ? 'selected' : ''}>等于 (=)</option>
                                                        <option value="!=" ${this.state.builderFilterOp === '!=' ? 'selected' : ''}>不等于 (!=)</option>
                                                        <option value=">" ${this.state.builderFilterOp === '>' ? 'selected' : ''}>大于 (&gt;)</option>
                                                        <option value=">=" ${this.state.builderFilterOp === '>=' ? 'selected' : ''}>大于等于 (&ge;)</option>
                                                        <option value="<" ${this.state.builderFilterOp === '<' ? 'selected' : ''}>小于 (&lt;)</option>
                                                        <option value="<=" ${this.state.builderFilterOp === '<=' ? 'selected' : ''}>小于等于 (&le;)</option>
                                                        <option value="IN" ${this.state.builderFilterOp === 'IN' ? 'selected' : ''}>IN (列表)</option>
                                                    </optgroup>
                                                    <optgroup label="文本匹配">
                                                        <option value="contains" ${this.state.builderFilterOp === 'contains' ? 'selected' : ''}>包含 (Like)</option>
                                                        <option value="not_contains" ${this.state.builderFilterOp === 'not_contains' ? 'selected' : ''}>不包含</option>
                                                        <option value="start_with" ${this.state.builderFilterOp === 'start_with' ? 'selected' : ''}>开始于</option>
                                                        <option value="end_with" ${this.state.builderFilterOp === 'end_with' ? 'selected' : ''}>结束于</option>
                                                    </optgroup>
                                                    <optgroup label="空值检查">
                                                        <option value="is_null" ${this.state.builderFilterOp === 'is_null' ? 'selected' : ''}>为空 (NULL)</option>
                                                        <option value="not_null" ${this.state.builderFilterOp === 'not_null' ? 'selected' : ''}>不为空</option>
                                                        <option value="is_empty" ${this.state.builderFilterOp === 'is_empty' ? 'selected' : ''}>为空字符</option>
                                                        <option value="not_empty" ${this.state.builderFilterOp === 'not_empty' ? 'selected' : ''}>不为空字符</option>
                                                    </optgroup>
                                                </select>
                                                <div class="flex align-center gap-2">
                                                    <input type="text" id="builder-filter-val" class="form-control form-control-sm builder-filter-val" style="width:200px"
                                                        placeholder="${['is_null', 'not_null', 'is_empty', 'not_empty'].includes(this.state.builderFilterOp) ? '无需输入' : '过滤值'}" 
                                                        ${['is_null', 'not_null', 'is_empty', 'not_empty'].includes(this.state.builderFilterOp) ? 'disabled' : ''}
                                                        value="${Utils.escapeHtml(this.state.builderFilterVal || '')}">
                                                    ${(this.state.builderFilterField || '').toLowerCase().match(/date|time|时间|日期|at$/) ? `
                                                        <select class="form-control form-control-sm builder-date-shortcut" style="width:80px">
                                                            <option value="">快捷查询</option>
                                                            <option value="today">今天</option>
                                                            <option value="yesterday">昨天</option>
                                                            <option value="7days">近7天</option>
                                                            <option value="30days">近30天</option>
                                                            <option value="month">本月</option>
                                                        </select>
                                                    ` : ''}
                                                </div>
                                            </div>
                                            <!-- 动态添加的其他条件 -->
                                            ${this.state.builderFilters.map((f, i) => `
                                                <div class="flex gap-5 mb-5 align-center animate-fade-in" data-filter-index="${i}">
                                                    <select class="form-control form-control-sm builder-filter-join" style="width:60px; color:var(--color-primary); font-weight:bold">
                                                        <option value="AND" ${f.join === 'AND' ? 'selected' : ''}>且</option>
                                                        <option value="OR" ${f.join === 'OR' ? 'selected' : ''}>或</option>
                                                    </select>
                                                    <select class="form-control form-control-sm builder-filter-field" style="width:95px">
                                                        <option value="">选择字段...</option>
                                                        ${(this.state.builderColumns || []).map(c => `<option value="${Utils.escapeHtml(c)}" ${f.field === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
                                                    </select>
                                                    <select class="form-control form-control-sm builder-filter-op" style="width:110px">
                                                        <optgroup label="数值/比较">
                                                            <option value="=" ${f.op === '=' ? 'selected' : ''}>等于 (=)</option>
                                                            <option value="!=" ${f.op === '!=' ? 'selected' : ''}>不等于 (!=)</option>
                                                            <option value=">" ${f.op === '>' ? 'selected' : ''}>大于 (&gt;)</option>
                                                            <option value=">=" ${f.op === '>=' ? 'selected' : ''}>大于等于 (&ge;)</option>
                                                            <option value="<" ${f.op === '<' ? 'selected' : ''}>小于 (&lt;)</option>
                                                            <option value="<=" ${f.op === '<=' ? 'selected' : ''}>小于等于 (&le;)</option>
                                                            <option value="IN" ${f.op === 'IN' ? 'selected' : ''}>IN (列表)</option>
                                                        </optgroup>
                                                        <optgroup label="文本匹配">
                                                            <option value="contains" ${f.op === 'contains' ? 'selected' : ''}>包含 (Like)</option>
                                                            <option value="not_contains" ${f.op === 'not_contains' ? 'selected' : ''}>不包含</option>
                                                            <option value="start_with" ${f.op === 'start_with' ? 'selected' : ''}>开始于</option>
                                                            <option value="end_with" ${f.op === 'end_with' ? 'selected' : ''}>结束于</option>
                                                        </optgroup>
                                                        <optgroup label="空值检查">
                                                            <option value="is_null" ${f.op === 'is_null' ? 'selected' : ''}>为空 (NULL)</option>
                                                            <option value="not_null" ${f.op === 'not_null' ? 'selected' : ''}>不为空</option>
                                                            <option value="is_empty" ${f.op === 'is_empty' ? 'selected' : ''}>为空字符</option>
                                                            <option value="not_empty" ${f.op === 'not_empty' ? 'selected' : ''}>不为空字符</option>
                                                        </optgroup>
                                                    </select>
                                                    <input type="text" class="form-control form-control-sm builder-filter-val" style="width:200px" 
                                                        placeholder="${['is_null', 'not_null', 'is_empty', 'not_empty'].includes(f.op) ? '无需输入' : '过滤值'}" 
                                                        ${['is_null', 'not_null', 'is_empty', 'not_empty'].includes(f.op) ? 'disabled' : ''}
                                                        value="${Utils.escapeHtml(f.val || '')}">
                                                    <button class="btn btn-ghost btn-xs btn-remove-filter" data-index="${i}">×</button>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                    
                                    <div class="builder-footer-divider"></div>

                                    <div class="builder-footer-right">
                                        <label class="mb-8 text-sm font-bold block">全局设置 (排序 / 聚合 / 记录)</label>
                                        <div class="flex gap-5 align-center">
                                            <div class="flex align-center gap-1 mr-2" title="去除重复结果">
                                                <input type="checkbox" id="builder-distinct" ${this.state.builderDistinct ? 'checked' : ''}>
                                                <label for="builder-distinct" class="m-0 text-xs" style="cursor:pointer; white-space:nowrap">去重</label>
                                            </div>
                                            <select id="builder-aggregate" class="form-control form-control-sm" style="width:130px">
                                                <option value="">无聚合函数</option>
                                                <option value="COUNT" ${this.state.builderAggregate === 'COUNT' ? 'selected' : ''}>计数 (COUNT)</option>
                                                <option value="SUM" ${this.state.builderAggregate === 'SUM' ? 'selected' : ''}>求和 (SUM)</option>
                                                <option value="AVG" ${this.state.builderAggregate === 'AVG' ? 'selected' : ''}>平均 (AVG)</option>
                                                <option value="MAX" ${this.state.builderAggregate === 'MAX' ? 'selected' : ''}>最大值 (MAX)</option>
                                                <option value="MIN" ${this.state.builderAggregate === 'MIN' ? 'selected' : ''}>最小值 (MIN)</option>
                                            </select>
                                            <select id="builder-sort-field" class="form-control form-control-sm" style="flex:1; min-width:120px" title="${Utils.escapeHtml(this.state.builderSortField || '选择排序字段')}">
                                                <option value="">排序字段...</option>
                                                ${(this.state.builderColumns || []).map(c => `<option value="${Utils.escapeHtml(c)}" ${this.state.builderSortField === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
                                            </select>
                                            <select id="builder-sort-dir" class="form-control form-control-sm" style="width:85px">
                                                <option value="ASC" ${this.state.builderSortDir === 'ASC' ? 'selected' : ''}>升序</option>
                                                <option value="DESC" ${this.state.builderSortDir === 'DESC' ? 'selected' : ''}>降序</option>
                                            </select>
                                            <div class="flex align-center gap-2 ml-2 mr-5">
                                                <span class="text-xs text-secondary" style="white-space:nowrap">限制:</span>
                                                <input type="number" id="builder-limit" class="form-control form-control-sm" style="width:100px" value="${this.state.builderLimit || 1000}">
                                            </div>
                                            
                                            <div class="builder-sync-action">
                                                <button id="btn-sync-to-editor" class="btn btn-secondary btn-sm btn-large-sync" title="生成并同步 SQL">⚡ 生成 SQL</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 2. SQL 编辑器区 -->
                        <div class="sql-editor-box bg-primary border-radius-10 p-12-20 p-relative">
                            <div class="flex-between mb-8">
                                <label class="text-xs font-600">SQL 编辑器</label>
                                <div class="flex gap-10">
                                    <button class="btn btn-ghost btn-xs" id="btn-beautify-sql">✨ 格式化</button>
                                    <button class="btn btn-ghost btn-xs" id="btn-clear-sql">🧹 清空</button>
                                </div>
                            </div>
                            <textarea id="sql-query-input" class="form-control sql-textarea-compact" rows="6" 
                                placeholder="编写或生成 SQL...">${Utils.escapeHtml(this.state.sqlQuery || '')}</textarea>
                            
                            <div class="flex gap-10 mt-10 border-top pt-10">
                                <div class="flex-1"></div>
                                <button id="btn-run-sql-query" class="btn btn-primary btn-sm ${sqlExecuting ? 'loading' : ''}" ${sqlExecuting ? 'disabled' : ''}>
                                    ${sqlExecuting ? '查询中...' : '▶ 运行查询'}
                                </button>
                                <button id="btn-export-sql-excel" class="btn btn-ghost btn-sm ${!sqlResult ? 'disabled' : ''}">📤 导出</button>
                                <button id="btn-save-sql-dataset" class="btn btn-secondary btn-sm ${!sqlResult ? 'disabled' : ''}">💾 保存为数据集</button>
                            </div>
                        </div>
                        
                        <!-- 3. 结果预览区 -->
                        <div class="sql-result-panel bg-primary border-radius-10 p-20">
                            <h4 class="m-0 mb-15">数据查询结果</h4>
                            <div id="sql-query-result">
                                ${sqlResult ? this.renderSqlResult() : `
                                    <div class="empty-state text-center p-30">
                                        <p class="text-secondary text-sm">暂无运行结果，构思好 SQL 后点击“运行查询”即可预览</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染 SQL 查询结果
     */
    renderSqlResult() {
        const { sqlResult } = this.state;
        if (!sqlResult || !sqlResult.columns) {
            return '<p class="text-secondary">无数据</p>';
        }

        const { columns, rows, row_count } = sqlResult;
        return `
            <div class="sql-result-info text-sm text-secondary mb-10">
                预览模式：显示前 ${row_count} 条记录 ${row_count >= 1000 ? '（结果集可能已被截断）' : ''}。如需完整结果请点击“保存为数据集”。
            </div>
            <div class="sql-result-table-wrapper">
                <table class="premium-table">
                    <thead>
                        <tr>${columns.map(c => `<th>${Utils.escapeHtml(c)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 200).map(row => `
                            <tr>${columns.map(c => `<td>${Utils.escapeHtml(row[c] ?? '')}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    /**
     * 初始化 SQL 查询页面，加载表列表
     */
    async initSqlQueryPage() {
        try {
            const res = await AnalysisApi.getTables();
            this.setState({ sqlTables: res.data || [] });
        } catch (err) {
            // 获取表名失败，静默处理
        }
    },

    /**
     * 执行 SQL 查询
     */
    async runSqlQuery() {
        const sqlInput = document.getElementById('sql-query-input');
        const sql = sqlInput ? sqlInput.value.trim() : (this.state.sqlQuery || '').trim();

        if (!sql) {
            Toast.error('请输入SQL语句');
            return;
        }

        this.setState({ sqlQuery: sql, sqlExecuting: true, sqlResult: null });

        try {
            const res = await AnalysisApi.executeSql({ sql, limit: 1000 });
            this.setState({
                sqlResult: res.data,
                sqlExecuting: false
            });
            Toast.success(`查询成功，已为您展示前 ${res.data?.row_count || 0} 条结果(预览)`);
        } catch (err) {
            this.setState({ sqlExecuting: false });
            Toast.error(err.message || '查询失败');
        }
    },

    /**
     * 保存 SQL 结果为数据集
     */
    async saveSqlAsDataset() {
        const sqlInput = document.getElementById('sql-query-input');
        const sql = sqlInput ? sqlInput.value.trim() : this.state.sqlQuery;

        if (!sql) {
            Toast.error('SQL语句不能为空');
            return;
        }

        const saveName = await Modal.prompt('保存为新数据集', '请为该查询结果起一个名字：', '例如：2023年销售统计');
        if (!saveName) return;

        try {
            const res = await AnalysisApi.executeSql({ sql, save_as: saveName });
            if (res.data?.saved_dataset) {
                Toast.success(`结果已保存为数据集: ${res.data.saved_dataset.name}`);
                this.fetchDatasets();
            }
        } catch (err) {
            Toast.error(err.message || '保存失败');
        }
    },

    /**
     * 绑定 SQL 相关事件
     */
    bindSqlEvents() {
        if (this._sqlEventsBound) return;
        this._sqlEventsBound = true;

        // 展开/收起表字段树
        this.delegate('click', '.sql-table-header', async (e, el) => {
            const tableName = el.dataset.table;
            const treeItem = el.closest('.sql-tree-item');
            const colsList = treeItem.querySelector('.sql-columns-list');
            const icon = el.querySelector('.tree-icon');

            if (colsList.style.display === 'none') {
                colsList.style.display = 'block';
                icon.textContent = '▼';

                // 加载字段
                try {
                    // 通过 table_name 查找数据集
                    const ds = this.state.datasets.find(d => d.table_name === tableName);
                    if (ds) {
                        const res = await AnalysisApi.getDatasetData(ds.id, { page: 1, size: 1 });
                        const columns = res.data?.columns || [];
                        colsList.innerHTML = columns.map(c => `
                            <div class="sql-col-item" data-table="${Utils.escapeHtml(tableName)}" data-col="${Utils.escapeHtml(c)}">
                                <span class="col-icon">🔹</span>
                                <span class="col-name">${Utils.escapeHtml(c)}</span>
                            </div>
                        `).join('');
                    } else {
                        colsList.innerHTML = '<div class="p-10 text-xs text-secondary">无法获取字段信息</div>';
                    }
                } catch (e) {
                    colsList.innerHTML = '<div class="p-10 text-xs text-secondary">加载失败</div>';
                }
            } else {
                colsList.style.display = 'none';
                icon.textContent = '▶';
            }
        });

        // 可视化构建器：选择表时加载字段
        this.delegate('change', '#builder-table', async (e, el) => {
            const tableName = el.value;
            if (!tableName) {
                this.setState({ builderTable: '', builderColumns: [], builderSelectedFields: [] });
                return;
            }

            const ds = this.state.datasets.find(d => d.table_name === tableName);
            if (ds) {
                try {
                    const res = await AnalysisApi.getDatasetData(ds.id, { page: 1, size: 1 });
                    this.setState({
                        builderTable: tableName,
                        builderColumns: res.data?.columns || [],
                        builderSelectedFields: res.data?.columns || [] // 默认全选
                    });
                } catch (e) { Toast.error('获取字段信息失败'); }
            }
        });

        // 任何辅助构建操作发生变化时同步到 state
        this.delegate('change', '.builder-field-cb', () => {
            const checked = Array.from(document.querySelectorAll('.builder-field-cb:checked')).map(cb => cb.value);
            this.state.builderSelectedFields = checked;
        });

        this.delegate('change', '#builder-filter-field', (e, el) => this.state.builderFilterField = el.value);
        this.delegate('change', '#builder-filter-op', (e, el) => {
            this.state.builderFilterOp = el.value;
            this.update(); // 为了切换 input 的禁用状态并更新 placeholder
        });
        this.delegate('input', '#builder-filter-val', (e, el) => this.state.builderFilterVal = el.value);
        this.delegate('input', '.builder-field-alias', (e, el) => {
            const field = el.dataset.field;
            this.state.builderFieldAliases[field] = el.value;
        });

        // 多筛选条件操作
        this.delegate('click', '#btn-add-filter', () => {
            const filters = this.state.builderFilters || [];
            filters.push({ field: '', op: '=', val: '', join: 'AND' });
            this.setState({ builderFilters: filters });
        });
        this.delegate('click', '.btn-remove-filter', (e, el) => {
            const index = parseInt(el.dataset.index);
            const filters = this.state.builderFilters || [];
            filters.splice(index, 1);
            this.setState({ builderFilters: filters });
        });
        this.delegate('change', '.builder-filter-join', (e, el) => {
            const index = parseInt(el.closest('[data-filter-index]').dataset.filterIndex);
            this.state.builderFilters[index].join = el.value;
        });
        this.delegate('change', '.builder-filter-field', (e, el) => {
            const row = el.closest('[data-filter-index]');
            if (row) {
                const index = parseInt(row.dataset.filterIndex);
                this.state.builderFilters[index].field = el.value;
            } else {
                this.state.builderFilterField = el.value;
                this.update(); // 更新快捷日期显示
            }
        });
        this.delegate('change', '.builder-filter-op', (e, el) => {
            const row = el.closest('[data-filter-index]');
            if (row) {
                const index = parseInt(row.dataset.filterIndex);
                this.state.builderFilters[index].op = el.value;
            } else {
                this.state.builderFilterOp = el.value;
                this.update();
            }
        });

        // 日期快捷筛选
        this.delegate('change', '.builder-date-shortcut', (e, el) => {
            const valInput = el.previousElementSibling;
            if (!valInput) return;
            const shortcut = el.value;
            let val = '';
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            switch (shortcut) {
                case 'today': val = today; break;
                case 'yesterday':
                    const yest = new Date(); yest.setDate(yest.getDate() - 1);
                    val = Utils.formatDate(yest, 'YYYY-MM-DD');
                    break;
                case '7days':
                    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
                    val = `>${Utils.formatDate(d7, 'YYYY-MM-DD')}`;
                    break;
                case '30days':
                    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
                    val = `>${Utils.formatDate(d30, 'YYYY-MM-DD')}`;
                    break;
                case 'month':
                    val = Utils.formatDate(new Date(), 'YYYY-MM') + '%';
                    break;
            }
            if (val) {
                valInput.value = val;
                this.state.builderFilterVal = val;
                if (val.startsWith('>')) {
                    const opSel = el.closest('.flex').previousElementSibling;
                    if (opSel && opSel.classList.contains('builder-filter-op')) {
                        opSel.value = '>';
                        this.state.builderFilterOp = '>';
                    }
                }
            }
        });

        this.delegate('change', '#builder-aggregate', (e, el) => this.state.builderAggregate = el.value);
        this.delegate('change', '#builder-distinct', (e, el) => this.state.builderDistinct = el.checked);
        this.delegate('change', '#builder-sort-field', (e, el) => this.state.builderSortField = el.value);
        this.delegate('change', '#builder-sort-dir', (e, el) => this.state.builderSortDir = el.value);
        this.delegate('input', '#builder-limit', (e, el) => this.state.builderLimit = parseInt(el.value) || 1000);

        // 手工同步按钮
        this.delegate('click', '#btn-sync-to-editor', () => {
            const sql = this.generateVisualSql();
            if (sql) {
                const input = document.getElementById('sql-query-input');
                if (input) {
                    input.value = sql;
                    this.setState({ sqlQuery: sql });
                    Toast.info('已同步生成的 SQL');
                }
            }
        });

        // 编辑器输入同步到 state
        this.delegate('input', '#sql-query-input', (e, el) => {
            this.state.sqlQuery = el.value;
        });

        this.delegate('click', '#btn-refresh-tables', () => {
            this.initSqlQueryPage();
        });

        this.delegate('click', '#btn-run-sql-query', () => {
            this.runSqlQuery();
        });

        this.delegate('click', '#btn-clear-sql', () => {
            const input = document.getElementById('sql-query-input');
            if (input) input.value = '';
            this.setState({ sqlQuery: '', sqlResult: null });
        });

        this.delegate('click', '#btn-save-sql-dataset', () => {
            this.saveSqlAsDataset();
        });

        this.delegate('click', '#btn-export-sql-excel', () => {
            const { sqlResult } = this.state;
            if (!sqlResult || !sqlResult.rows) {
                Toast.error('没有可导出的数据');
                return;
            }
            // 使用 .csv 后缀以确保 Excel 能够识别前端生成的文本流，同时保留 BOM 防止乱码
            Utils.exportToExcel(sqlResult.rows, `SQL查询结果_${Utils.formatDate(new Date(), 'YYYYMMDD_HHmmss')}.csv`);
        });

        // 格式化功能 (简单示例)
        this.delegate('click', '#btn-beautify-sql', () => {
            const input = document.getElementById('sql-query-input');
            if (!input) return;
            let sql = input.value.trim();
            if (!sql) return;

            // 简单格式化逻辑：将关键词大写并换行
            const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN'];
            let formatted = sql;
            keywords.forEach(kw => {
                const reg = new RegExp('\\b' + kw + '\\b', 'gi');
                formatted = formatted.replace(reg, '\n' + kw);
            });
            input.value = formatted.trim();
        });

        // 侧边栏表/字段名点击直接插入
        this.delegate('click', '.sql-table-header, .sql-col-item', (e, el) => {
            const val = el.dataset.table || el.dataset.col;
            const input = document.getElementById('sql-query-input');
            if (input) {
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const text = input.value;
                input.value = text.substring(0, start) + val + text.substring(end);
                input.focus();
            }
        });
    },

    /**
     * 根据可视化构建器生成 SQL 语句
     */
    generateVisualSql() {
        const table = this.state.builderTable;
        if (!table) {
            Toast.error('请先选择目标表');
            return null;
        }
        let fields = this.state.builderSelectedFields || [];
        const aggFunc = this.state.builderAggregate;
        const aliases = this.state.builderFieldAliases || {};

        if (fields.length === 0) fields = ['*'];

        // 处理别名和聚合
        let selectParts = fields.map(f => {
            let part = f;
            const alias = aliases[f];
            if (aggFunc && fields[0] === f) {
                part = `${aggFunc}(${f})`;
            }
            if (alias) {
                part += ` AS '${alias}'`;
            }
            return part;
        });

        if (aggFunc && fields[0] === '*' && fields.length === 1) {
            selectParts = [`${aggFunc}(*)`];
        }

        let sql = `SELECT ${this.state.builderDistinct ? 'DISTINCT ' : ''}${selectParts.join(', ')} FROM ${table}`;

        // WHERE 多条件拼接
        const mainFilter = { field: this.state.builderFilterField, op: this.state.builderFilterOp, val: this.state.builderFilterVal };
        const otherFilters = this.state.builderFilters || [];
        const allFilters = [mainFilter, ...otherFilters].filter(f => f.field);

        if (allFilters.length > 0) {
            sql += ' WHERE ';
            allFilters.forEach((f, i) => {
                if (i > 0) sql += ` ${f.join || 'AND'} `;

                const op = f.op;
                const field = f.field;
                let val = f.val;

                // 处理一元运算符 (无需值)
                if (op === 'is_null') {
                    sql += `${field} IS NULL`;
                } else if (op === 'not_null') {
                    sql += `${field} IS NOT NULL`;
                } else if (op === 'is_empty') {
                    sql += `(${field} IS NULL OR CAST(${field} AS VARCHAR) = '')`;
                } else if (op === 'not_empty') {
                    sql += `(${field} IS NOT NULL AND CAST(${field} AS VARCHAR) != '')`;
                }
                // 处理二元运算符
                else {
                    let sqlVal = val;
                    if (op === 'IN') {
                        // 处理 IN 列表
                        const vals = val.split(/[,，]/).map(v => isNaN(v.trim()) ? `'${v.trim()}'` : v.trim()); // 支持中英文逗号
                        sqlVal = `(${vals.join(', ')})`;
                        sql += `${field} IN ${sqlVal}`;
                    } else {
                        // 格式化标准值
                        if (isNaN(val)) {
                            sqlVal = `'${val}'`;
                        }

                        // 特定运算符映射
                        if (op === 'contains' || op === 'LIKE') {
                            sql += `${field} LIKE '%${val}%'`;
                        } else if (op === 'not_contains' || op === 'NOT LIKE') {
                            sql += `${field} NOT LIKE '%${val}%'`;
                        } else if (op === 'start_with') {
                            sql += `${field} LIKE '${val}%'`;
                        } else if (op === 'end_with') {
                            sql += `${field} LIKE '%${val}'`;
                        } else {
                            // 标准比较 (=, !=, >, <, >=, <=)
                            sql += `${field} ${op} ${sqlVal}`;
                        }
                    }
                }
            });
        }

        // 分组 (如果有聚合且选了多个字段)
        if (aggFunc && fields.length > 1 && fields[0] !== '*') {
            sql += ` GROUP BY ${fields.slice(1).join(', ')}`;
        }

        // 排序
        const sortField = this.state.builderSortField;
        const sortDir = this.state.builderSortDir;
        if (sortField) {
            sql += ` ORDER BY ${sortField} ${sortDir}`;
        }

        // 限制条数
        const limit = this.state.builderLimit || 1000;
        sql += ` LIMIT ${limit}`;

        return sql;
    }
};

// 将方法混入到 AnalysisPage.prototype
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisSqlMixin);
}

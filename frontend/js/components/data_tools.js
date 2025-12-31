/**
 * 数据工具组件 - 多字段排序与筛选
 * 可复用于数据透镜、数据分析等模块
 */

const DataTools = {
    // 筛选操作符定义
    FILTER_OPERATORS: [
        { value: 'eq', label: '等于' },
        { value: 'ne', label: '不等于' },
        { value: 'gt', label: '大于' },
        { value: 'gte', label: '大于等于' },
        { value: 'lt', label: '小于' },
        { value: 'lte', label: '小于等于' },
        { value: 'like', label: '包含' },
        { value: 'notlike', label: '不包含' },
        { value: 'isnull', label: '为空' },
        { value: 'notnull', label: '不为空' }
    ],

    /**
     * 渲染筛选面板
     * @param {Object} options - 配置选项
     * @param {boolean} options.show - 是否显示
     * @param {Array} options.columns - 可用列 [{field, title}] 或字符串数组
     * @param {Object} options.filters - 当前筛选条件 {field: {op, value}}
     * @param {string} options.prefix - 样式前缀，默认 'dt' (data-tools)
     * @returns {string} HTML字符串
     */
    renderFilterPanel(options = {}) {
        const { show = false, columns = [], filters = {}, prefix = 'dt' } = options;
        if (!show) return '';

        const operators = this.FILTER_OPERATORS;

        return `
            <div class="${prefix}-filter-panel animate-slide-down">
                <div class="${prefix}-panel-header">
                    <h4>🔽 数据筛选</h4>
                    <button class="${prefix}-btn-icon ${prefix}-filter-close" title="关闭">✕</button>
                </div>
                <div class="${prefix}-filter-list" id="${prefix}-filter-list">
                    ${Object.entries(filters).map(([field, cond], idx) => {
            const condValue = typeof cond === 'object' ? (cond?.value || '') : cond;
            const condOp = typeof cond === 'object' ? (cond?.op || 'eq') : 'eq';
            return `
                            <div class="${prefix}-filter-row" data-index="${idx}">
                                <select class="form-control ${prefix}-filter-field">
                                    <option value="">选择字段</option>
                                    ${columns.map(col => {
                const f = typeof col === 'object' ? col.field : col;
                const t = typeof col === 'object' ? (col.title || col.field) : col;
                return `<option value="${f}" ${f === field ? 'selected' : ''}>${t}</option>`;
            }).join('')}
                                </select>
                                <select class="form-control ${prefix}-filter-op">
                                    ${operators.map(op => `<option value="${op.value}" ${condOp === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
                                </select>
                                <input type="text" class="form-control ${prefix}-filter-value" placeholder="值" value="${Utils.escapeHtml(String(condValue))}">
                                <button class="${prefix}-btn-icon ${prefix}-filter-remove" title="删除">🗑️</button>
                            </div>
                        `;
        }).join('')}
                </div>
                <div class="${prefix}-panel-actions">
                    <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-filter-add">+ 添加条件</button>
                    <div class="${prefix}-panel-buttons">
                        <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-filter-clear">清空</button>
                        <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-btn-primary ${prefix}-filter-apply">应用筛选</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染排序面板
     * @param {Object} options - 配置选项
     * @param {boolean} options.show - 是否显示
     * @param {Array} options.columns - 可用列 [{field, title}] 或字符串数组
     * @param {Array} options.sorts - 当前排序条件 [{field, order}]
     * @param {string} options.prefix - 样式前缀，默认 'dt' (data-tools)
     * @returns {string} HTML字符串
     */
    renderSortPanel(options = {}) {
        const { show = false, columns = [], sorts = [], prefix = 'dt' } = options;
        if (!show) return '';

        return `
            <div class="${prefix}-sort-panel animate-slide-down">
                <div class="${prefix}-panel-header">
                    <h4>↕️ 多字段排序</h4>
                    <button class="${prefix}-btn-icon ${prefix}-sort-close" title="关闭">✕</button>
                </div>
                <div class="${prefix}-sort-list" id="${prefix}-sort-list">
                    ${sorts.map((sort, idx) => `
                        <div class="${prefix}-sort-row" data-index="${idx}">
                            <span class="${prefix}-sort-order">${idx + 1}</span>
                            <select class="form-control ${prefix}-sort-field">
                                <option value="">选择字段</option>
                                ${columns.map(col => {
            const f = typeof col === 'object' ? col.field : col;
            const t = typeof col === 'object' ? (col.title || col.field) : col;
            return `<option value="${f}" ${f === sort.field ? 'selected' : ''}>${t}</option>`;
        }).join('')}
                            </select>
                            <select class="form-control ${prefix}-sort-direction">
                                <option value="asc" ${sort.order === 'asc' ? 'selected' : ''}>升序 ↑</option>
                                <option value="desc" ${sort.order === 'desc' ? 'selected' : ''}>降序 ↓</option>
                            </select>
                            <button class="${prefix}-btn-icon ${prefix}-sort-remove" title="删除">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                <div class="${prefix}-panel-actions">
                    <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-sort-add">+ 添加排序</button>
                    <div class="${prefix}-panel-buttons">
                        <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-sort-clear">清空</button>
                        <button class="${prefix}-btn ${prefix}-btn-sm ${prefix}-btn-primary ${prefix}-sort-apply">应用排序</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染筛选和排序工具栏按钮
     * @param {Object} options - 配置选项
     * @param {number} options.filterCount - 当前筛选条件数量
     * @param {number} options.sortCount - 当前排序条件数量
     * @param {string} options.prefix - 样式前缀，默认 'dt' (data-tools)
     * @returns {string} HTML字符串
     */
    renderToolbarButtons(options = {}) {
        const { filterCount = 0, sortCount = 0, prefix = 'dt' } = options;

        return `
            <button class="btn btn-outline-secondary btn-sm ${prefix}-filter-btn ${filterCount > 0 ? 'has-filter' : ''}" title="数据筛选">
                🔽 筛选${filterCount > 0 ? ` (${filterCount})` : ''}
            </button>
            <button class="btn btn-outline-secondary btn-sm ${prefix}-sort-btn ${sortCount > 0 ? 'has-sort' : ''}" title="多字段排序">
                ↕️ 排序${sortCount > 0 ? ` (${sortCount})` : ''}
            </button>
        `;
    },

    /**
     * 从DOM收集筛选条件
     * @param {string} prefix - 样式前缀
     * @returns {Object} 筛选条件对象 {field: {op, value}}
     */
    collectFilters(prefix = 'dt') {
        const filters = {};
        const rows = document.querySelectorAll(`.${prefix}-filter-row`);
        rows.forEach(row => {
            const field = row.querySelector(`.${prefix}-filter-field`)?.value;
            const op = row.querySelector(`.${prefix}-filter-op`)?.value;
            const value = row.querySelector(`.${prefix}-filter-value`)?.value;

            if (field && (op === 'isnull' || op === 'notnull' || value)) {
                filters[field] = { op, value };
            }
        });
        return filters;
    },

    /**
     * 从DOM收集排序条件
     * @param {string} prefix - 样式前缀
     * @returns {Array} 排序条件数组 [{field, order}]
     */
    collectSorts(prefix = 'dt') {
        const sorts = [];
        const rows = document.querySelectorAll(`.${prefix}-sort-row`);
        rows.forEach(row => {
            const field = row.querySelector(`.${prefix}-sort-field`)?.value;
            const order = row.querySelector(`.${prefix}-sort-direction`)?.value || 'asc';

            if (field) {
                sorts.push({ field, order });
            }
        });
        return sorts;
    },

    /**
     * 将排序数组转换为字符串格式 (兼容旧API)
     * @param {Array} sorts - 排序条件数组 [{field, order}]
     * @returns {string} 排序字符串 "field1:asc,field2:desc"
     */
    sortsToString(sorts = []) {
        return sorts.map(s => `${s.field}:${s.order}`).join(',');
    },

    /**
     * 将排序字符串转换为数组格式
     * @param {string} sortStr - 排序字符串 "field1:asc,field2:desc"
     * @returns {Array} 排序条件数组 [{field, order}]
     */
    stringToSorts(sortStr = '') {
        if (!sortStr) return [];
        return sortStr.split(',').map(part => {
            const [field, order] = part.split(':');
            return { field, order: order || 'asc' };
        });
    },

    /**
     * 创建数据工具管理器 Mixin
     * 用于混入到 Component 类中，提供完整的筛选排序功能
     * @param {Object} options - 配置选项
     * @param {string} options.prefix - 样式前缀
     * @param {Function} options.onApply - 应用筛选/排序时的回调 (filters, sorts) => void
     * @param {Function} options.getColumns - 获取列信息的回调 () => Array
     * @param {Function} options.getState - 获取当前状态的回调 () => {filters, sorts, showFilterPanel, showSortPanel}
     * @param {Function} options.setState - 设置状态的回调 (newState) => void
     * @returns {Object} Mixin对象
     */
    createMixin(options = {}) {
        const { prefix = 'dt', onApply, getColumns, getState, setState } = options;

        return {
            // 切换筛选面板
            _toggleDataToolsFilterPanel() {
                const state = getState();
                if (!state.showFilterPanel) {
                    // 打开面板时，初始化一个空条件
                    if (!state.filters || Object.keys(state.filters).length === 0) {
                        setState({
                            filters: { '': { op: 'eq', value: '' } },
                            showFilterPanel: true,
                            showSortPanel: false
                        });
                    } else {
                        setState({ showFilterPanel: true, showSortPanel: false });
                    }
                } else {
                    // 关闭面板时清空筛选并刷新数据
                    setState({
                        filters: {},
                        showFilterPanel: false
                    });
                    if (onApply) onApply({}, state.sorts || []);
                }
            },

            // 切换排序面板
            _toggleDataToolsSortPanel() {
                const state = getState();
                if (!state.showSortPanel) {
                    // 打开面板时，初始化一行空排序
                    if (!state.sorts || state.sorts.length === 0) {
                        setState({
                            sorts: [{ field: '', order: 'asc' }],
                            showSortPanel: true,
                            showFilterPanel: false
                        });
                    } else {
                        setState({ showSortPanel: true, showFilterPanel: false });
                    }
                } else {
                    // 关闭面板时清空排序并刷新数据
                    setState({
                        sorts: [],
                        showSortPanel: false
                    });
                    if (onApply) onApply(state.filters || {}, []);
                }
            },

            // 应用筛选
            _applyDataToolsFilters() {
                const filters = DataTools.collectFilters(prefix);
                const state = getState();
                setState({ filters });
                if (onApply) onApply(filters, state.sorts || []);
            },

            // 应用排序
            _applyDataToolsSorts() {
                const sorts = DataTools.collectSorts(prefix);
                const state = getState();
                setState({ sorts });
                if (onApply) onApply(state.filters || {}, sorts);
            },

            // 添加筛选行
            _addDataToolsFilterRow() {
                const state = getState();
                const filters = { ...(state.filters || {}) };
                filters[`_new_${Date.now()}`] = { op: 'eq', value: '' };
                setState({ filters });
            },

            // 添加排序行
            _addDataToolsSortRow() {
                const state = getState();
                const sorts = [...(state.sorts || [])];
                sorts.push({ field: '', order: 'asc' });
                setState({ sorts });
            },

            // 清空筛选
            _clearDataToolsFilters() {
                const state = getState();
                setState({ filters: { [`_new_${Date.now()}`]: { op: 'eq', value: '' } } });
                if (onApply) onApply({}, state.sorts || []);
            },

            // 清空排序
            _clearDataToolsSorts() {
                const state = getState();
                setState({ sorts: [{ field: '', order: 'asc' }] });
                if (onApply) onApply(state.filters || {}, []);
            },

            // 绑定数据工具事件
            bindDataToolsEvents() {
                // 筛选按钮
                this.delegate('click', `.${prefix}-filter-btn`, () => {
                    this._toggleDataToolsFilterPanel();
                });

                // 排序按钮
                this.delegate('click', `.${prefix}-sort-btn`, () => {
                    this._toggleDataToolsSortPanel();
                });

                // 筛选面板关闭
                this.delegate('click', `.${prefix}-filter-close`, () => {
                    this._toggleDataToolsFilterPanel();
                });

                // 排序面板关闭
                this.delegate('click', `.${prefix}-sort-close`, () => {
                    this._toggleDataToolsSortPanel();
                });

                // 应用筛选
                this.delegate('click', `.${prefix}-filter-apply`, () => {
                    this._applyDataToolsFilters();
                });

                // 应用排序
                this.delegate('click', `.${prefix}-sort-apply`, () => {
                    this._applyDataToolsSorts();
                });

                // 添加筛选行
                this.delegate('click', `.${prefix}-filter-add`, () => {
                    this._addDataToolsFilterRow();
                });

                // 添加排序行
                this.delegate('click', `.${prefix}-sort-add`, () => {
                    this._addDataToolsSortRow();
                });

                // 清空筛选
                this.delegate('click', `.${prefix}-filter-clear`, () => {
                    this._clearDataToolsFilters();
                });

                // 清空排序
                this.delegate('click', `.${prefix}-sort-clear`, () => {
                    this._clearDataToolsSorts();
                });

                // 删除筛选行
                this.delegate('click', `.${prefix}-filter-remove`, (e, el) => {
                    const row = el.closest(`.${prefix}-filter-row`);
                    const field = row?.querySelector(`.${prefix}-filter-field`)?.value;
                    if (field !== undefined) {
                        const state = getState();
                        const filters = { ...(state.filters || {}) };
                        // 删除对应的筛选条件
                        const filterList = Object.entries(filters);
                        const idx = parseInt(row.dataset.index);
                        if (filterList[idx]) {
                            delete filters[filterList[idx][0]];
                        }
                        // 如果全部删除，添加一个空行
                        if (Object.keys(filters).length === 0) {
                            filters[`_new_${Date.now()}`] = { op: 'eq', value: '' };
                        }
                        setState({ filters });
                    }
                });

                // 删除排序行
                this.delegate('click', `.${prefix}-sort-remove`, (e, el) => {
                    const row = el.closest(`.${prefix}-sort-row`);
                    if (row) {
                        const state = getState();
                        const sorts = [...(state.sorts || [])];
                        const idx = parseInt(row.dataset.index);
                        if (!isNaN(idx) && idx < sorts.length) {
                            sorts.splice(idx, 1);
                        }
                        // 如果全部删除，添加一个空行
                        if (sorts.length === 0) {
                            sorts.push({ field: '', order: 'asc' });
                        }
                        setState({ sorts });
                    }
                });
            }
        };
    }
};

// 导出为全局对象
window.DataTools = DataTools;

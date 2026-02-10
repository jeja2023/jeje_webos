/**
 * 数据分析模块 - 智能表格功能
 */

// 调试模式标志
// 避免重复声明，如果已存在则使用已有的
if (typeof DEBUG_MODE === 'undefined') {
    var DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/**
 * 安全的数学表达式计算器（替代 eval / Function）
 * 只支持基本数学运算：+、-、*、/、%、括号、数字
 * 不支持函数调用、变量访问等危险操作
 */
function safeEvalMath(expression) {
    // 移除所有空白字符
    const expr = expression.replace(/\s/g, '');

    // 验证表达式只包含允许的字符：数字、小数点、运算符、括号
    if (!/^[0-9+\-*/().%]+$/.test(expr)) {
        throw new Error('表达式包含不允许的字符');
    }

    // Tokenize
    const tokens = [];
    let num = '';
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (/\d|\./.test(ch)) {
            num += ch;
            continue;
        }
        if (num) {
            tokens.push(num);
            num = '';
        }
        tokens.push(ch);
    }
    if (num) tokens.push(num);

    // Shunting-yard to RPN
    const output = [];
    const ops = [];
    const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
    const isOp = (t) => t in prec;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\d+(\.\d+)?$/.test(t)) {
            output.push(t);
            continue;
        }
        if (t === '(') {
            ops.push(t);
            continue;
        }
        if (t === ')') {
            while (ops.length && ops[ops.length - 1] !== '(') {
                output.push(ops.pop());
            }
            if (!ops.length) throw new Error('括号不匹配');
            ops.pop();
            continue;
        }
        if (isOp(t)) {
            // 处理一元负号（如 -1 或 ( -2 )）
            const prev = tokens[i - 1];
            if (t === '-' && (i === 0 || (prev && (isOp(prev) || prev === '(')))) {
                output.push('0');
            }
            while (ops.length && isOp(ops[ops.length - 1]) && prec[ops[ops.length - 1]] >= prec[t]) {
                output.push(ops.pop());
            }
            ops.push(t);
            continue;
        }
        throw new Error('表达式格式错误');
    }
    while (ops.length) {
        const op = ops.pop();
        if (op === '(' || op === ')') throw new Error('括号不匹配');
        output.push(op);
    }

    // Evaluate RPN
    const stack = [];
    for (const t of output) {
        if (/^\d+(\.\d+)?$/.test(t)) {
            stack.push(Number(t));
        } else if (isOp(t)) {
            const b = stack.pop();
            const a = stack.pop();
            if (a === undefined || b === undefined) throw new Error('表达式格式错误');
            let r;
            switch (t) {
                case '+': r = a + b; break;
                case '-': r = a - b; break;
                case '*': r = a * b; break;
                case '/': r = a / b; break;
                case '%': r = a % b; break;
                default: throw new Error('不支持的运算符');
            }
            stack.push(r);
        } else {
            throw new Error('表达式格式错误');
        }
    }
    if (stack.length !== 1) throw new Error('表达式格式错误');
    const result = stack[0];
    if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('计算结果不是有效数字');
    }
    return result;
}

const AnalysisSmartTableMixin = {
    /**
     * 渲染智能表格页面
     */
    renderSmartTable() {
        if (this.state.currentSmartTable) {
            return this.renderSmartTableDetail();
        }

        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <div>
                        <h2>智能表格</h2>
                        <p class="text-secondary">自定义字段，在线填报数据</p>
                    </div>
                    <button class="btn btn-primary" id="btn-create-smart-table">
                        <i class="ri-add-line"></i> 新建表格
                    </button>
                </div>
                
                <div class="smart-table-grid" id="smart-table-list">
                    ${this.state.smartTables ? this.state.smartTables.map(t => `
                        <div class="smart-table-card">
                            <div class="smart-table-card-header">
                                <div class="smart-table-card-icon"><i class="ri-table-line"></i></div>
                            </div>
                            <div class="smart-table-card-body">
                                <h4 class="m-0 mb-8 text-truncate font-bold" title="${Utils.escapeHtml(t.name)}">${Utils.escapeHtml(t.name)}</h4>
                                <div class="text-xs text-secondary mb-12 flex-between">
                                    <div>
                                        <div><i class="ri-settings-3-line"></i> ${t.fields.length} 个字段</div>
                                        <div><i class="ri-calendar-line"></i> ${Utils.formatDate(t.created_at)}</div>
                                    </div>
                                    ${t.dataset_id ? '<span class="badge badge-primary" title="已同步到数据集" style="font-size: 10px; padding: 2px 5px;"><i class="ri-package-line"></i> 已同步</span>' : ''}
                                </div>
                                <div class="flex gap-10">
                                    <button class="btn btn-primary btn-sm flex-1 btn-view-smart-table" data-id="${t.id}">查看</button>
                                    <button class="btn btn-ghost btn-sm btn-delete-smart-table" data-id="${t.id}"><i class="ri-delete-bin-line"></i></button>
                                </div>
                            </div>
                        </div>
                    `).join('') : '<div class="text-center p-40">加载中...</div>'}
                    ${this.state.smartTables && this.state.smartTables.length === 0 ? '<div class="text-center p-40 text-secondary border-radius-sm" style="grid-column: 1 / -1; background: var(--color-card); border: 1px dashed var(--color-border);">暂无智能表格，点击右上角新建</div>' : ''}
                </div>
            </div>
        `;
    },

    /**
     * 渲染智能表格详情（数据填报）
     */
    renderSmartTableDetail() {
        const table = this.state.currentSmartTable;
        const data = this.state.smartTableData || [];

        // 格式化单元格值的辅助函数
        const formatCellValue = (field, row) => {
            let value = row[field.name];

            // 如果是计算字段，需要重新计算并格式化
            if (field.type === 'calculated' && field.formula) {
                try {
                    // 建立 context
                    const context = {};
                    table.fields.forEach(f => {
                        if (f.type !== 'calculated' && f.label) {
                            const numVal = parseFloat(row[f.name]);
                            context[f.label] = isNaN(numVal) ? 0 : numVal;
                        }
                    });

                    // 替换公式中的字段名
                    let evalFormula = field.formula;
                    const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);
                    sortedKeys.forEach(key => {
                        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        evalFormula = evalFormula.replace(new RegExp(escapedKey, 'g'), String(context[key]));
                    });

                    // 执行计算（使用安全计算函数）
                    const result = safeEvalMath(evalFormula);

                    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                        const precision = field.precision !== undefined ? field.precision : 2;
                        value = result.toFixed(precision);
                        if (field.showPercent) {
                            value += '%';
                        }
                    } else {
                        value = '';
                    }
                } catch (e) {
                    value = value || '';
                    // 可选：在单元格上添加错误标记（如果需要）
                    // 这里保持简洁，只记录错误
                }
            }

            return value || '';
        };

        return `
            <div class="flex-column h-100">
                <div class="p-20 border-bottom bg-primary">
                    <div class="flex-between">
                        <div class="flex-center">
                            <button class="btn-icon mr-10" id="btn-back-to-smart-tables"><i class="ri-arrow-left-line"></i></button>
                            <h2 class="m-0">${Utils.escapeHtml(table.name)}</h2>
                        </div>
                        <div class="flex gap-10">
                            <div class="search-box-container mr-10">
                                <input type="text" id="smart-row-search" class="form-control form-control-sm" placeholder="搜索本表数据..." value="${this.state.smartRowSearch || ''}">
                            </div>
                            <button class="btn btn-primary btn-sm" id="btn-add-smart-table-row"><i class="ri-add-line"></i> 添加数据</button>
                            <button class="btn btn-outline-primary btn-sm" id="btn-edit-smart-table-fields"><i class="ri-settings-3-line"></i> 字段管理</button>
                            <button class="btn btn-outline-primary btn-sm" id="btn-export-smart-table" title="导出为 CSV"><i class="ri-download-line"></i> 导出 CSV</button>
                            <button class="btn btn-outline-primary btn-sm" id="btn-sync-smart-table" title="同步数据到数据集">${table.dataset_id ? '<i class="ri-refresh-line"></i> 同步数据集' : '<i class="ri-package-line"></i> 导入数据集'}</button>
                            <button class="btn btn-ghost btn-sm" id="btn-refresh-smart-table" title="刷新数据"><i class="ri-refresh-line"></i> 刷新</button>
                        </div>
                    </div>
                </div>
                
                <div class="data-table-container">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                ${table.fields.map(f => {
            const sortField = this.state.smartTableSort?.field;
            const sortOrder = this.state.smartTableSort?.order;
            const isSorted = sortField === f.name;
            const sortIcon = isSorted ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';
            return `<th class="sortable-smart-th" data-field="${f.name}" style="cursor: pointer;" title="点击排序">${Utils.escapeHtml(f.label || f.name)}${f.type === 'calculated' ? ' <i class="ri-flashlight-line"></i>' : ''}${sortIcon}${f.required ? ' <span style="color: var(--color-danger);">*</span>' : ''}</th>`;
        }).join('')}
                                <th width="100">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
                let filteredData = data;
                if (this.state.smartRowSearch) {
                    const search = this.state.smartRowSearch.toLowerCase();
                    filteredData = data.filter(row =>
                        table.fields.some(f => String(row[f.name] || '').toLowerCase().includes(search))
                    );
                }

                // 应用排序
                if (this.state.smartTableSort?.field) {
                    const sf = this.state.smartTableSort.field;
                    const so = this.state.smartTableSort.order;
                    filteredData = [...filteredData].sort((a, b) => {
                        const va = a[sf] ?? '';
                        const vb = b[sf] ?? '';
                        const numA = parseFloat(va), numB = parseFloat(vb);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return so === 'asc' ? numA - numB : numB - numA;
                        }
                        return so === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
                    });
                }

                // 计算合计（基于全部筛选后数据）
                const totals = {};
                table.fields.forEach(f => {
                    // 仅对非日期和非下拉字段尝试计算合计
                    if (f.type !== 'date' && f.type !== 'select') {
                        let sum = 0;
                        let hasNumeric = false;
                        filteredData.forEach(row => {
                            const val = formatCellValue(f, row);
                            if (val === null || val === undefined || val === '') return;

                            // 尝试清理非数字符号并转换为浮点数
                            const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
                            if (!isNaN(num)) {
                                sum += num;
                                hasNumeric = true;
                            }
                        });

                        // 如果该列确实含有有效数字，或者本来就是数字/计算类型，则记录合计值
                        if (hasNumeric || f.type === 'number' || f.type === 'calculated') {
                            totals[f.name] = sum;
                        }
                    }
                });

                const totalFiltered = filteredData.length;

                // 分页处理
                const pageSize = this.state.smartTablePageSize || 20;
                const currentPage = this.state.smartTablePage || 1;
                const totalPages = Math.ceil(totalFiltered / pageSize);
                const startIdx = (currentPage - 1) * pageSize;
                const pagedData = filteredData.slice(startIdx, startIdx + pageSize);

                // 条件格式辅助函数
                const getConditionalStyle = (field, value) => {
                    if (!field.conditionalFormat) return '';
                    const numVal = parseFloat(String(value).replace(/[^\d.-]/g, ''));
                    if (isNaN(numVal)) return '';

                    const cf = field.conditionalFormat;
                    if (cf.type === 'threshold') {
                        if (cf.high !== undefined && numVal >= cf.high) return 'background: rgba(34, 197, 94, 0.2); color: #16a34a;';
                        if (cf.low !== undefined && numVal <= cf.low) return 'background: rgba(239, 68, 68, 0.2); color: #dc2626;';
                    } else if (cf.type === 'gradient') {
                        // 简单渐变：根据数值范围计算颜色
                        const min = cf.min || 0, max = cf.max || 100;
                        const ratio = Math.max(0, Math.min(1, (numVal - min) / (max - min)));
                        const r = Math.round(239 - ratio * 205);
                        const g = Math.round(68 + ratio * 129);
                        const b = Math.round(68 + ratio * 26);
                        return `background: rgba(${r}, ${g}, ${b}, 0.2);`;
                    }
                    return '';
                };

                // 搜索高亮辅助函数
                const highlightSearch = (text, searchTerm) => {
                    if (!searchTerm || !text) return Utils.escapeHtml(String(text || ''));
                    const search = searchTerm.toLowerCase();
                    const escapedText = Utils.escapeHtml(String(text));
                    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    return escapedText.replace(regex, '<mark style="background: #ffeb3b; padding: 2px 4px; border-radius: 2px;">$1</mark>');
                };

                return pagedData.map(row => `
                                    <tr>
                                        ${table.fields.map(f => {
                    const cellVal = formatCellValue(f, row);
                    const style = getConditionalStyle(f, cellVal);
                    // 如果有搜索词，高亮显示
                    const displayVal = this.state.smartRowSearch ? highlightSearch(cellVal, this.state.smartRowSearch) : Utils.escapeHtml(String(cellVal || ''));
                    return `<td style="${style}">${displayVal}</td>`;
                }).join('')}
                                        <td>
                                            <div class="flex gap-5">
                                                <button class="btn btn-ghost btn-xs btn-edit-smart-row" data-id="${row.id}"><i class="ri-edit-line"></i></button>
                                                <button class="btn btn-ghost btn-xs btn-delete-smart-row" data-id="${row.id}"><i class="ri-delete-bin-line"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('') + (pagedData.length > 0 && table.config?.showSummary !== false ? `
                                    <tr class="table-summary-row" style="background: var(--color-bg-secondary); font-weight: bold;">
                                        ${table.fields.map((f, i) => {
                    if (i === 0) return `<td>合计 (${totalFiltered} 行)</td>`;
                    if (totals[f.name] !== undefined) {
                        const precision = f.precision !== undefined ? f.precision : 2;
                        return `<td>${totals[f.name].toFixed(precision)}${f.showPercent ? '%' : ''}</td>`;
                    }
                    return `<td>-</td>`;
                }).join('')}
                                        <td></td>
                                    </tr>
                                ` : pagedData.length === 0 ? `<tr><td colspan="${table.fields.length + 1}" class="text-center p-20">暂无数据</td></tr>` : '') + `
                                <!-- 分页信息存储 -->
                                <script type="text/template" id="smart-table-page-info" data-total="${totalFiltered}" data-pages="${totalPages}" data-current="${currentPage}" data-size="${pageSize}"></script>
                                `;
            })()}
                        </tbody>
                    </table>
                </div>
                
                <!-- 分页控件 -->
                ${(() => {
                const pageSize = this.state.smartTablePageSize || 20;
                const currentPage = this.state.smartTablePage || 1;
                const totalFiltered = data.length;
                const totalPages = Math.ceil(totalFiltered / pageSize);

                if (totalFiltered <= pageSize) return '';

                return `
                    <div class="p-15 border-top flex-between" style="background: var(--color-bg-secondary);">
                        <div class="flex-center gap-10">
                            <span class="text-secondary text-sm">每页</span>
                            <select id="smart-table-page-size" class="form-control form-control-sm" style="width: 70px;">
                                <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                                <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                                <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                            </select>
                            <span class="text-secondary text-sm">条，共 ${totalFiltered} 条</span>
                        </div>
                        <div class="flex-center gap-5">
                            <button class="btn btn-ghost btn-sm smart-table-page-btn" data-page="1" ${currentPage <= 1 ? 'disabled' : ''}>首页</button>
                            <button class="btn btn-ghost btn-sm smart-table-page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
                            <span class="mx-10 text-sm">第 ${currentPage} / ${totalPages} 页</span>
                            <button class="btn btn-ghost btn-sm smart-table-page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
                            <button class="btn btn-ghost btn-sm smart-table-page-btn" data-page="${totalPages}" ${currentPage >= totalPages ? 'disabled' : ''}>末页</button>
                        </div>
                    </div>
                    `;
            })()}
            </div>
        `;
    },

    /**
     * 弹出创建/编辑表格对话框
     */
    showSmartTableModal(table = null) {
        const isEdit = !!table;
        // 深度复制或初始化字段，确保每个字段都有 key
        let fields = table ? JSON.parse(JSON.stringify(table.fields)) : [{ name: 'col_1', label: '', type: 'text' }];

        // 渲染字段列表的函数
        const renderFields = () => {
            return fields.map((f, i) => {
                const isCalc = f.type === 'calculated';
                const isNumber = f.type === 'number' || f.type === 'calculated';
                // 如果没有 key，自动生成一个 (保持后台逻辑，但前端隐藏)
                if (!f.name) f.name = `col_${Math.random().toString(36).substr(2, 6)}`;

                return `
                <div class="field-setup-item p-12 mb-10 border-radius-sm bg-light relative ${isCalc && !f._collapsed ? 'wide' : 'half'}" data-index="${i}" draggable="true">
                    <div class="flex gap-10 align-items-center">
                        <div class="field-drag-handle" style="cursor: grab; padding: 5px; color: var(--color-text-secondary);" title="拖拽排序">⋮⋮</div>
                        <div class="flex-center font-bold text-primary" style="width: 28px; height: 28px; border-radius: 50%; background: var(--color-primary); color: white; font-size: 12px;">${i + 1}</div>
                        <div style="flex: 1.5;">
                            <input type="text" class="form-control form-control-sm field-label" placeholder="字段名称 (如: 语文)" value="${Utils.escapeHtml(f.label || '')}" data-field-action="update" data-field-key="label">
                        </div>
                        <div style="flex: 1;">
                            <select class="form-control form-control-sm field-type" data-field-action="update-type">
                                <option value="text" ${f.type === 'text' ? 'selected' : ''}>文本</option>
                                <option value="number" ${f.type === 'number' ? 'selected' : ''}>数字</option>
                                <option value="date" ${f.type === 'date' ? 'selected' : ''}>日期</option>
                                <option value="select" ${f.type === 'select' ? 'selected' : ''}>下拉选择</option>
                                <option value="calculated" ${f.type === 'calculated' ? 'selected' : ''}> 自动计算</option>
                            </select>
                        </div>
                        ${!isCalc ? `
                        <label class="flex-center gap-4 cursor-pointer text-xs" title="设为必填字段">
                            <input type="checkbox" ${f.required ? 'checked' : ''} data-field-action="update-check" data-field-key="required">
                            必填
                        </label>
                        ` : ''}
                        ${isNumber ? `
                        <button class="btn btn-ghost btn-xs" data-field-action="conditional-format" title="条件格式"><i class="ri-palette-line"></i></button>
                        ` : ''}
                        <button class="btn btn-ghost btn-xs text-danger" data-field-action="remove" title="移除字段">✕</button>
                    </div>

                    ${f.type === 'select' ? `
                        <div class="mt-8">
                            <input type="text" class="form-control form-control-sm" placeholder="选项配置，用英文逗号分隔 (如: 优秀,良好,及格)" value="${Utils.escapeHtml(f.options || '')}" data-field-action="update" data-field-key="options">
                        </div>
                    ` : ''}

                    ${isCalc ? `
                        <div class="calc-config mt-10 p-12 bg-white border-radius-sm" style="display: ${f._collapsed ? 'none' : 'block'};">
                            <div class="text-xs font-bold text-primary mb-10">计算公式配置</div>
                            
                            <div class="mb-10">
                                <div class="text-xs text-secondary mb-5">运算方式:</div>
                                <div class="flex flex-wrap gap-5 mb-10">
                                    <button class="btn btn-xs ${f.calcMode === 'sum' || !f.calcMode ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="sum"><i class="ri-add-line"></i> 求和</button>
                                    <button class="btn btn-xs ${f.calcMode === 'product' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="product"><i class="ri-close-line"></i> 乘积</button>
                                    <button class="btn btn-xs ${f.calcMode === 'diff' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="diff"><i class="ri-subtract-line"></i> 差值</button>
                                    <button class="btn btn-xs ${f.calcMode === 'divide' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="divide"><i class="ri-divide-line"></i> 除法</button>
                                    <button class="btn btn-xs ${f.calcMode === 'avg' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="avg"><i class="ri-bar-chart-line"></i> 平均值</button>
                                    <button class="btn btn-xs ${f.calcMode === 'percent' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="percent"><i class="ri-percent-line"></i> 百分比</button>
                                    <button class="btn btn-xs ${f.calcMode === 'custom' ? 'btn-primary' : 'btn-outline-secondary'}" data-field-action="calc-mode" data-mode="custom"><i class="ri-edit-2-line"></i> 自定义</button>
                                </div>
                                
                                ${f.calcMode === 'percent' ? `
                                    <div class="mb-10 p-10 bg-light border-radius-sm">
                                        <div class="text-xs text-secondary mb-5">百分比计算: 分子 ÷ 分母 × 100%</div>
                                        <div class="flex gap-10 align-items-center">
                                            <select class="form-control form-control-sm" style="flex:1;" data-field-action="percent-field" data-percent-key="numerator">
                                                <option value="">选择分子</option>
                                                 ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<option value="${Utils.escapeAttr(other.label)}" ${f.numerator === other.label ? 'selected' : ''}>${Utils.escapeHtml(other.label || '未命名')}</option>`
                ).join('')}
                                            </select>
                                            <span>÷</span>
                                            <select class="form-control form-control-sm" style="flex:1;" data-field-action="percent-field" data-percent-key="denominator">
                                                <option value="">选择分母</option>
                                                 ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<option value="${Utils.escapeAttr(other.label)}" ${f.denominator === other.label ? 'selected' : ''}>${Utils.escapeHtml(other.label || '未命名')}</option>`
                ).join('')}
                                            </select>
                                            <span>× 100%</span>
                                        </div>
                                    </div>
                                ` : f.calcMode === 'custom' ? `
                                    <div class="mb-10">
                                        <div class="text-xs text-secondary mb-5">输入公式（点击字段插入）:</div>
                                        <input type="text" class="form-control form-control-sm font-mono mb-5 formula-input" value="${Utils.escapeHtml(f.formula || '')}" data-field-action="formula-input" placeholder="例如: 语文 + 数学 * 2">
                                        <div class="flex flex-wrap gap-5">
                                            ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<button class="btn btn-outline-primary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(other.label || '')}">${Utils.escapeHtml(other.label || '未命名')}</button>`
                ).join('')}
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(' + ')}">+</button>
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(' - ')}">-</button>
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(' * ')}">×</button>
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(' / ')}">÷</button>
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent('(')}">(</button>
                                            <button class="btn btn-outline-secondary btn-xs" data-field-action="insert-formula" data-insert="${encodeURIComponent(')')}"}>)</button>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="text-xs text-secondary mb-5">选择参与计算的字段:</div>
                                    <div class="flex flex-wrap gap-5">
                                        ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other => {
                    const isChecked = f.sourceFields && f.sourceFields.includes(other.label);
                    return `<label class="flex-center gap-4 cursor-pointer px-10 py-5 border-radius-sm ${isChecked ? 'bg-primary text-white' : 'bg-light border'}" style="font-size: 12px;">
                                                <input type="checkbox" ${isChecked ? 'checked' : ''} data-field-action="toggle-check" data-check-label="${Utils.escapeAttr(other.label)}" style="display:none;">
                                                ${other.label || '未命名'}
                                            </label>`;
                }).join('')}
                                    </div>
                                `}
                            </div>
                            
                            <div class="flex gap-10 align-items-center mb-10">
                                <div class="text-xs text-secondary">小数精度:</div>
                                <select class="form-control form-control-sm" style="width: 80px;" data-field-action="update-precision">
                                    <option value="0" ${f.precision === 0 ? 'selected' : ''}>整数</option>
                                    <option value="1" ${f.precision === 1 ? 'selected' : ''}>1位</option>
                                    <option value="2" ${f.precision === 2 || f.precision === undefined ? 'selected' : ''}>2位</option>
                                    <option value="3" ${f.precision === 3 ? 'selected' : ''}>3位</option>
                                    <option value="4" ${f.precision === 4 ? 'selected' : ''}>4位</option>
                                </select>
                                <label class="flex-center gap-5 cursor-pointer text-xs">
                                    <input type="checkbox" ${f.showPercent ? 'checked' : ''} data-field-action="update-check" data-field-key="showPercent">
                                    显示%符号
                                </label>
                            </div>
                            
                            <div class="flex-between align-items-center border-top pt-10" style="border-color: var(--color-border);">
                                <div class="text-xs font-mono bg-light px-10 py-5 border-radius-sm" style="max-width: 70%; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="ri-file-edit-line"></i> ${Utils.escapeHtml(f.formula || '(请配置公式)')}
                                </div>
                                <button class="btn btn-primary btn-xs" data-field-action="toggle-panel" data-collapse="true">确定</button>
                            </div>
                        </div>
                        ${f._collapsed ? `<div class="text-xs text-primary cursor-pointer mt-8 px-10 py-5 bg-white border-radius-sm font-mono" style="border: 1px solid var(--color-primary);" data-field-action="toggle-panel" data-collapse="false"><i class="ri-file-edit-line"></i> ${Utils.escapeHtml(f.formula || '(未设置)')}${f.showPercent ? '%' : ''}</div>` : ''}
                    ` : ''}
                </div>
                `;
            }).join('');
        };

        // 挂载临时方法到原型链以便HTML中调用
        AnalysisPage.prototype.updateFieldState = (index, key, value) => {
            fields[index][key] = value;
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.setCalcMode = (index, mode) => {
            // 保留精度设置
            const currentPrecision = fields[index].precision;
            const currentShowPercent = fields[index].showPercent;

            fields[index].calcMode = mode;
            fields[index].sourceFields = [];
            fields[index].formula = '';
            fields[index].numerator = '';
            fields[index].denominator = '';

            // 恢复精度设置
            fields[index].precision = currentPrecision !== undefined ? currentPrecision : 2;
            fields[index].showPercent = currentShowPercent || false;

            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.setPercentField = (index, field, value) => {
            fields[index][field] = value;
            const f = fields[index];
            if (f.numerator && f.denominator) {
                f.formula = `${f.numerator} / ${f.denominator} * 100`;
            }
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.toggleFieldCheck = (index, label) => {
            const f = fields[index];
            if (!f.sourceFields) f.sourceFields = [];

            const idx = f.sourceFields.indexOf(label);
            if (idx > -1) f.sourceFields.splice(idx, 1);
            else f.sourceFields.push(label);

            // 根据模式自动生成公式
            if (f.calcMode === 'product') {
                f.formula = f.sourceFields.join(' * ');
            } else if (f.calcMode === 'diff') {
                f.formula = f.sourceFields.join(' - ');
            } else if (f.calcMode === 'divide') {
                f.formula = f.sourceFields.join(' / ');
            } else if (f.calcMode === 'avg') {
                f.formula = f.sourceFields.length > 0 ? `(${f.sourceFields.join(' + ')}) / ${f.sourceFields.length}` : '';
            } else {
                f.formula = f.sourceFields.join(' + ');
            }

            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.updateFormula = (index, value) => {
            fields[index].formula = value;
        };

        AnalysisPage.prototype.insertToFormula = (index, text) => {
            fields[index].formula = (fields[index].formula || '') + text;
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.toggleCalcPanel = (index, collapsed) => {
            fields[index]._collapsed = collapsed;
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.removeField = (index) => {
            fields.splice(index, 1);
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        AnalysisPage.prototype.insertVarToFormula = (index, varLabel) => {
            const currentFormula = fields[index].formula || '';
            fields[index].formula = currentFormula + (currentFormula ? ' ' : '') + varLabel;
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        // 拖拽排序相关
        let draggedFieldIndex = null;

        AnalysisPage.prototype.handleFieldDragStart = (event, index) => {
            draggedFieldIndex = index;
            event.dataTransfer.effectAllowed = 'move';
            event.target.style.opacity = '0.5';
        };

        AnalysisPage.prototype.handleFieldDragOver = (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        };

        AnalysisPage.prototype.handleFieldDrop = (event, targetIndex) => {
            event.preventDefault();
            event.target.style.opacity = '1';
            if (draggedFieldIndex === null || draggedFieldIndex === targetIndex) return;

            // 交换字段位置
            const draggedField = fields[draggedFieldIndex];
            fields.splice(draggedFieldIndex, 1);
            fields.splice(targetIndex, 0, draggedField);
            draggedFieldIndex = null;

            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        // 条件格式配置弹窗
        AnalysisPage.prototype.showConditionalFormatModal = (index) => {
            const field = fields[index];
            const cf = field.conditionalFormat || {};

            Modal.show({
                title: `条件格式 - ${field.label || field.name}`,
                width: '450px',
                content: `
                    <div class="form-group mb-15">
                        <label class="mb-5 font-bold">格式类型</label>
                        <select id="cf-type" class="form-control">
                            <option value="">无</option>
                            <option value="threshold" ${cf.type === 'threshold' ? 'selected' : ''}>阈值高亮</option>
                            <option value="gradient" ${cf.type === 'gradient' ? 'selected' : ''}>颜色渐变</option>
                        </select>
                    </div>
                    <div id="cf-threshold-config" style="display: ${cf.type === 'threshold' ? 'block' : 'none'};">
                        <div class="form-group mb-10">
                            <label class="mb-5">高值阈值 (≥ 此值显示绿色)</label>
                            <input type="number" id="cf-high" class="form-control" value="${cf.high || ''}" placeholder="如: 90">
                        </div>
                        <div class="form-group mb-10">
                            <label class="mb-5">低值阈值 (≤ 此值显示红色)</label>
                            <input type="number" id="cf-low" class="form-control" value="${cf.low || ''}" placeholder="如: 60">
                        </div>
                    </div>
                    <div id="cf-gradient-config" style="display: ${cf.type === 'gradient' ? 'block' : 'none'};">
                        <div class="form-group mb-10">
                            <label class="mb-5">最小值</label>
                            <input type="number" id="cf-min" class="form-control" value="${cf.min || 0}" placeholder="如: 0">
                        </div>
                        <div class="form-group mb-10">
                            <label class="mb-5">最大值</label>
                            <input type="number" id="cf-max" class="form-control" value="${cf.max || 100}" placeholder="如: 100">
                        </div>
                    </div>
                `,
                onConfirm: () => {
                    const type = document.getElementById('cf-type').value;
                    if (!type) {
                        delete fields[index].conditionalFormat;
                    } else if (type === 'threshold') {
                        const high = parseFloat(document.getElementById('cf-high').value);
                        const low = parseFloat(document.getElementById('cf-low').value);
                        fields[index].conditionalFormat = {
                            type: 'threshold',
                            high: isNaN(high) ? undefined : high,
                            low: isNaN(low) ? undefined : low
                        };
                    } else if (type === 'gradient') {
                        fields[index].conditionalFormat = {
                            type: 'gradient',
                            min: parseFloat(document.getElementById('cf-min').value) || 0,
                            max: parseFloat(document.getElementById('cf-max').value) || 100
                        };
                    }
                    document.getElementById('fields-setup-container').innerHTML = renderFields();
                    return true;
                }
            });

            // 绑定类型切换事件
            setTimeout(() => {
                const typeSelect = document.getElementById('cf-type');
                if (typeSelect) {
                    typeSelect.onchange = () => {
                        const type = typeSelect.value;
                        document.getElementById('cf-threshold-config').style.display = type === 'threshold' ? 'block' : 'none';
                        document.getElementById('cf-gradient-config').style.display = type === 'gradient' ? 'block' : 'none';
                    };
                }
            }, 100);
        };

        // 模态框逻辑
        Modal.show({
            title: isEdit ? '表格结构设计' : '新建智能表格',
            width: '850px',
            content: `
                <div class="form-group mb-20 p-20 bg-soft-primary border-radius-sm">
                    <div class="flex-between align-items-center">
                        <div style="flex: 1; margin-right: 20px;">
                            <label class="font-bold mb-8 block">表格名称</label>
                            <input type="text" id="smart-table-name" class="form-control form-control-lg" value="${Utils.escapeHtml(table?.name || '')}" placeholder="请输入表格名称，如：销售统计表">
                        </div>
                        <div style="width: 180px;">
                            <label class="font-bold mb-8 block">额外配置</label>
                            <label class="flex-center gap-8 cursor-pointer p-8 bg-white border border-radius-sm" style="font-size: 13px;">
                                <input type="checkbox" id="smart-table-show-summary" ${table?.config?.showSummary !== false ? 'checked' : ''}>
                                开启底部自动合计
                            </label>
                        </div>
                    </div>
                </div>
                <div class="form-group p-x-20">
                    <div class="flex-between align-items-center mb-15">
                        <label class="font-bold m-0">字段定义配置</label>
                        <button class="btn btn-outline-primary btn-sm" id="btn-add-setup-field"><i class="ri-add-line"></i> 添加新字段</button>
                    </div>
                    <div id="fields-setup-container" class="mt-10 flex flex-wrap gap-10" style="max-height: 480px; overflow-y: auto;">
                        ${renderFields()}
                    </div>
                </div>
            `,
            onConfirm: async () => {
                const name = document.getElementById('smart-table-name').value;
                if (!name) return Toast.error('请输入表格名称');
                if (fields.length === 0) return Toast.error('请至少添加一个字段');

                // 验证
                for (let f of fields) {
                    if (!f.label) return Toast.error('所有字段都必须有显示名称');
                    if (f.type === 'calculated' && !f.formula) return Toast.error(`字段 "${f.label}" 的公式不能为空`);
                }

                try {
                    const config = {
                        showSummary: document.getElementById('smart-table-show-summary').checked
                    };
                    const payload = { name, fields, config };
                    if (isEdit) {
                        await Api.put(`/analysis/smart-tables/${table.id}`, payload);
                        Toast.success('修改成功');
                    } else {
                        await Api.post('/analysis/smart-tables', payload);
                        Toast.success('创建成功');
                    }
                    this.fetchSmartTables();

                    // 清理临时方法
                    delete AnalysisPage.prototype.updateFieldState;
                    delete AnalysisPage.prototype.removeField;
                    delete AnalysisPage.prototype.insertVarToFormula;
                    delete AnalysisPage.prototype.updateFormula;
                    delete AnalysisPage.prototype.insertToFormula;
                    delete AnalysisPage.prototype.toggleCalcPanel;
                    delete AnalysisPage.prototype.toggleFieldCheck;
                    delete AnalysisPage.prototype.setCalcMode;

                    return true;
                } catch (e) {
                    Toast.error('操作失败: ' + e.message);
                }
            }
        });

        // 绑定添加按钮
        document.getElementById('btn-add-setup-field').onclick = () => {
            fields.push({
                name: `col_${Math.random().toString(36).substr(2, 6)}`,
                label: '',
                type: 'text'
            });
            document.getElementById('fields-setup-container').innerHTML = renderFields();
        };

        // 统一事件委托（替代所有 inline 事件）
        const container = document.getElementById('fields-setup-container');
        if (container && !container._fieldBound) {
            container._fieldBound = true;

            const getIndex = (el) => {
                const item = el.closest('.field-setup-item');
                return item ? parseInt(item.dataset.index) : -1;
            };

            container.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-field-action]');
                if (!btn) return;
                const act = btn.dataset.fieldAction;
                const idx = getIndex(btn);
                if (idx < 0 && act !== 'insert-formula') return;

                switch (act) {
                    case 'remove':
                        AnalysisPage.prototype.removeField(idx);
                        break;
                    case 'conditional-format':
                        AnalysisPage.prototype.showConditionalFormatModal(idx);
                        break;
                    case 'calc-mode':
                        AnalysisPage.prototype.setCalcMode(idx, btn.dataset.mode);
                        break;
                    case 'insert-formula':
                        AnalysisPage.prototype.insertToFormula(idx, decodeURIComponent(btn.dataset.insert || ''));
                        break;
                    case 'toggle-panel':
                        AnalysisPage.prototype.toggleCalcPanel(idx, btn.dataset.collapse === 'true');
                        break;
                    default:
                        break;
                }
            });

            container.addEventListener('change', (e) => {
                const el = e.target.closest('[data-field-action]');
                if (!el) return;
                const act = el.dataset.fieldAction;
                const idx = getIndex(el);
                if (idx < 0) return;

                switch (act) {
                    case 'update':
                        AnalysisPage.prototype.updateFieldState(idx, el.dataset.fieldKey, el.value);
                        break;
                    case 'update-type':
                        AnalysisPage.prototype.updateFieldState(idx, 'type', el.value);
                        if (el.value === 'calculated') {
                            AnalysisPage.prototype.updateFieldState(idx, 'precision', 2);
                        }
                        break;
                    case 'update-check':
                        AnalysisPage.prototype.updateFieldState(idx, el.dataset.fieldKey, el.checked);
                        break;
                    case 'update-precision':
                        AnalysisPage.prototype.updateFieldState(idx, 'precision', parseInt(el.value));
                        break;
                    case 'percent-field':
                        AnalysisPage.prototype.setPercentField(idx, el.dataset.percentKey, el.value);
                        break;
                    case 'toggle-check':
                        AnalysisPage.prototype.toggleFieldCheck(idx, el.dataset.checkLabel);
                        break;
                    default:
                        break;
                }
            });

            container.addEventListener('input', (e) => {
                const el = e.target.closest('[data-field-action="formula-input"]');
                if (el) {
                    const idx = getIndex(el);
                    if (idx >= 0) AnalysisPage.prototype.updateFormula(idx, el.value);
                }
            });

            // 拖拽排序
            container.addEventListener('dragstart', (e) => {
                const item = e.target.closest('.field-setup-item');
                if (item) {
                    const idx = parseInt(item.dataset.index);
                    AnalysisPage.prototype.handleFieldDragStart(e, idx);
                }
            });
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            container.addEventListener('drop', (e) => {
                const item = e.target.closest('.field-setup-item');
                if (item) {
                    const idx = parseInt(item.dataset.index);
                    AnalysisPage.prototype.handleFieldDrop(e, idx);
                }
            });
        }
    },

    /**
     * 弹出添加/编辑数据行对话框 (Grid Layout)
     */
    showSmartRowModal(rowData = null) {
        const table = this.state.currentSmartTable;
        const isEdit = !!rowData;

        // 建立字段名称到公式和设置的映射
        const fieldConfigMap = {};
        table.fields.forEach(f => {
            if (f.type === 'calculated' && f.formula) {
                fieldConfigMap[f.name] = {
                    formula: f.formula,
                    precision: f.precision !== undefined ? f.precision : 2,
                    showPercent: f.showPercent || false
                };
            }
        });

        // 定义计算函数
        const setupCalculation = () => {
            const form = document.querySelector('.smart-row-form');
            if (!form) {
                return;
            }

            const calcInputs = form.querySelectorAll('.row-calc-input');

            if (calcInputs.length === 0) return;

            const performCalculation = () => {
                // 1. 建立 Label -> Value 映射
                const context = {};
                form.querySelectorAll('.row-input:not(.row-calc-input)').forEach(input => {
                    const label = input.dataset.label;
                    if (label) {
                        const numVal = parseFloat(input.value);
                        context[label] = isNaN(numVal) ? 0 : numVal;
                    }
                });

                // 2. 遍历计算
                calcInputs.forEach(calc => {
                    const fieldName = calc.dataset.name;
                    const config = fieldConfigMap[fieldName];

                    if (!config || !config.formula) {
                        return;
                    }

                    try {
                        // 按长度排序字段名，避免部分匹配
                        const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

                        let evalFormula = config.formula;
                        sortedKeys.forEach(key => {
                            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            evalFormula = evalFormula.replace(new RegExp(escapedKey, 'g'), String(context[key]));
                        });

                        const result = safeEvalMath(evalFormula);

                        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                            // 根据精度设置格式化
                            const precision = config.precision;
                            let formattedResult = result.toFixed(precision);
                            // 如果显示百分号
                            if (config.showPercent) {
                                formattedResult += '%';
                            }
                            calc.value = formattedResult;
                        } else {
                            calc.value = '';
                        }
                    } catch (e) {
                        calc.value = '';
                    }
                });
            };

            // 绑定事件和初始化计算
            form.addEventListener('input', performCalculation);
            performCalculation();
        };

        const self = this;

        Modal.show({
            title: isEdit ? '编辑数据' : '添加数据',
            width: '900px',
            content: `
                ${!isEdit && self.state.smartTableData?.length > 0 ? `
                <div class="mb-15">
                    <button type="button" class="btn btn-outline-primary btn-sm" id="btn-copy-last-row">📋 复制上一行数据</button>
                </div>
                ` : ''}
                <div class="smart-row-form">
                    ${table.fields.map(f => {
                const isCalc = f.type === 'calculated';
                const requiredMark = f.required ? '<span style="color: var(--color-danger);"> *</span>' : '';
                return `
                        <div class="form-group mb-0">
                            <label class="text-sm text-secondary mb-5 block">${Utils.escapeHtml(f.label || f.name)}${requiredMark} ${isCalc ? '⚡' : ''}</label>
                            ${f.type === 'date' ? `
                                <input type="date" class="form-control row-input" data-name="${f.name}" data-label="${Utils.escapeAttr(f.label)}" data-type="${f.type}" data-required="${f.required || false}" value="${rowData ? Utils.escapeAttr(rowData[f.name] || '') : ''}">
                            ` : f.type === 'number' ? `
                                <input type="number" class="form-control row-input" data-name="${f.name}" data-label="${Utils.escapeAttr(f.label)}" data-type="${f.type}" data-required="${f.required || false}" value="${rowData ? Utils.escapeAttr(rowData[f.name] || '') : ''}">
                            ` : f.type === 'select' ? `
                                <select class="form-control row-input" data-name="${f.name}" data-label="${Utils.escapeAttr(f.label)}" data-type="${f.type}" data-required="${f.required || false}">
                                    <option value="">-- 请选择 --</option>
                                    ${(f.options || '').split(/[,，]/).filter(opt => opt.trim()).map(opt => {
                    const trimmed = opt.trim();
                    return `<option value="${Utils.escapeAttr(trimmed)}" ${rowData && rowData[f.name] === trimmed ? 'selected' : ''}>${Utils.escapeHtml(trimmed)}</option>`;
                }).join('')}
                                </select>
                            ` : isCalc ? `
                                <input type="text" class="form-control row-input row-calc-input" data-name="${f.name}" data-type="${f.type}" value="${rowData ? Utils.escapeAttr(rowData[f.name] || '') : ''}" readonly placeholder="自动计算" style="background: var(--color-bg-secondary);">
                            ` : `
                                <input type="text" class="form-control row-input" data-name="${f.name}" data-label="${Utils.escapeAttr(f.label)}" data-type="${f.type}" data-required="${f.required || false}" value="${rowData ? Utils.escapeAttr(rowData[f.name] || '') : ''}">
                            `}
                        </div>
                    `}).join('')}
                </div>
            `,
            onConfirm: async () => {
                const inputs = document.querySelectorAll('.row-input');
                const data = {};

                // 必填验证
                for (const input of inputs) {
                    const isRequired = input.dataset.required === 'true';
                    const value = input.value?.trim();
                    if (isRequired && !value) {
                        Toast.error(`请填写必填字段: ${input.dataset.label || input.dataset.name}`);
                        input.focus();
                        return false;
                    }
                    data[input.dataset.name] = input.value;
                }

                try {
                    if (isEdit) {
                        await Api.put(`/analysis/smart-tables/data/${rowData.id}`, data);
                        Toast.success('更新成功');
                    } else {
                        await Api.post(`/analysis/smart-tables/${table.id}/data`, data);
                        Toast.success('添加成功');
                    }
                    self.fetchSmartTableData(table.id);
                    return true;
                } catch (e) {
                    Toast.error('操作失败');
                }
            }
        });

        // Modal.show 之后设置计算和复制按钮
        setTimeout(() => {
            setupCalculation();

            // 绑定复制上一行按钮
            const copyBtn = document.getElementById('btn-copy-last-row');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    const lastRow = self.state.smartTableData?.[self.state.smartTableData.length - 1];
                    if (!lastRow) return Toast.info('没有可复制的数据');

                    document.querySelectorAll('.row-input:not(.row-calc-input)').forEach(input => {
                        const fieldName = input.dataset.name;
                        if (lastRow[fieldName] !== undefined) {
                            input.value = lastRow[fieldName];
                        }
                    });
                    // 触发计算字段更新
                    document.querySelector('.smart-row-form')?.dispatchEvent(new Event('input', { bubbles: true }));
                    Toast.success('已复制上一行数据');
                };
            }
        }, 150);
    },

    async fetchSmartTables() {
        try {
            const res = await Api.get('/analysis/smart-tables');
            this.setState({ smartTables: res.data });
        } catch (e) {
            Toast.error('获取智能表格列表失败');
        }
    },

    async fetchSmartTableData(tableId) {
        try {
            const res = await Api.get(`/analysis/smart-tables/${tableId}/data`);
            this.setState({ smartTableData: res.data });
        } catch (e) {
            Toast.error('获取表格数据失败');
        }
    },

    bindSmartTableEvents() {
        if (this._smartTableEventsBound) return;
        this._smartTableEventsBound = true;

        // 点击新建
        this.delegate('click', '#btn-create-smart-table', () => {
            this.showSmartTableModal();
        });

        // 查看数据
        this.delegate('click', '.btn-view-smart-table', async (e, el) => {
            const id = parseInt(el.dataset.id);
            const table = this.state.smartTables.find(t => t.id === id);
            this.setState({ currentSmartTable: table });
            this.fetchSmartTableData(id);
        });

        // 刷新数据
        this.delegate('click', '#btn-refresh-smart-table', async () => {
            const table = this.state.currentSmartTable;
            if (table) {
                Toast.info('正在刷新...');
                // 重新获取表格定义（可能字段有变化）
                try {
                    const tableRes = await Api.get(`/analysis/smart-tables/${table.id}`);
                    this.setState({ currentSmartTable: tableRes.data });
                } catch (e) {
                    // 如果获取单个表格失败，尝试从列表重新获取
                    await this.fetchSmartTables();
                    const updatedTable = this.state.smartTables.find(t => t.id === table.id);
                    if (updatedTable) {
                        this.setState({ currentSmartTable: updatedTable });
                    }
                }
                await this.fetchSmartTableData(table.id);
                Toast.success('刷新成功');
            }
        });

        // 同步到数据集
        this.delegate('click', '#btn-sync-smart-table', async () => {
            const table = this.state.currentSmartTable;
            if (!table) return;

            try {
                Toast.info('正在同步到数据集...');
                const res = await AnalysisApi.syncSmartTable(table.id);
                Toast.success(res.message || '同步完成');

                // 重新获取表格信息以更新 dataset_id
                const tableRes = await Api.get(`/analysis/smart-tables/${table.id}`);
                this.setState({ currentSmartTable: tableRes.data });
                // 刷新列表以显示同步状态
                this.fetchSmartTables();
            } catch (e) {
                Toast.error('同步失败: ' + e.message);
            }
        });

        // 删除表格
        this.delegate('click', '.btn-delete-smart-table', async (e, el) => {
            if (!confirm('确定要删除这个智能表格及其所有数据吗？')) return;
            const id = el.dataset.id;
            try {
                await Api.delete(`/analysis/smart-tables/${id}`);
                Toast.success('删除成功');
                this.fetchSmartTables();
            } catch (e) {
                Toast.error('删除失败');
            }
        });

        // 表头排序
        this.delegate('click', '.sortable-smart-th', (e, el) => {
            const field = el.dataset.field;
            const currentSort = this.state.smartTableSort;

            let newOrder = 'asc';
            if (currentSort?.field === field) {
                // 同一字段反转排序方向
                newOrder = currentSort.order === 'asc' ? 'desc' : 'asc';
            }

            this.setState({ smartTableSort: { field, order: newOrder } });
        });

        // 分页按钮
        this.delegate('click', '.smart-table-page-btn', (e, el) => {
            if (el.disabled) return;
            const page = parseInt(el.dataset.page);
            this.setState({ smartTablePage: page });
        });

        // 每页条数
        this.delegate('change', '#smart-table-page-size', (e) => {
            const size = parseInt(e.target.value);
            this.setState({ smartTablePageSize: size, smartTablePage: 1 });
        });

        // 返回列表
        this.delegate('click', '#btn-back-to-smart-tables', () => {
            this.setState({ currentSmartTable: null, smartTableData: [], smartTableSort: null, smartTablePage: 1, smartRowSearch: '' });
        });

        // 字段管理
        this.delegate('click', '#btn-edit-smart-table-fields', () => {
            this.showSmartTableModal(this.state.currentSmartTable);
        });

        // 添加数据行
        this.delegate('click', '#btn-add-smart-table-row', () => {
            this.showSmartRowModal();
        });

        // 编辑数据行
        this.delegate('click', '.btn-edit-smart-row', (e, el) => {
            const id = parseInt(el.dataset.id);
            const row = this.state.smartTableData.find(r => r.id === id);
            this.showSmartRowModal(row);
        });

        // 删除数据行
        this.delegate('click', '.btn-delete-smart-row', async (e, el) => {
            if (!confirm('确定删除该行数据吗？')) return;
            const id = el.dataset.id;
            try {
                await Api.delete(`/analysis/smart-tables/data/${id}`);
                Toast.success('删除成功');
                this.fetchSmartTableData(this.state.currentSmartTable.id);
            } catch (e) {
                Toast.error('删除失败');
            }
        });

        // 搜索行 (防抖优化)
        let _searchTimer;
        this.delegate('input', '#smart-row-search', (e) => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => {
                this.setState({ smartRowSearch: e.target.value });
            }, 500); // 停止输入 500ms 后再更新状态
        });

        // 导出 CSV
        this.delegate('click', '#btn-export-smart-table', () => {
            const table = this.state.currentSmartTable;
            const data = this.state.smartTableData || [];
            if (!table || data.length === 0) return Toast.info('没有数据可导出');

            // 格式化单元格辅助函数（复用逻辑）
            const formatVal = (field, row) => {
                let val = row[field.name];
                if (field.type === 'calculated' && field.formula) {
                    try {
                        const context = {};
                        table.fields.forEach(f => {
                            if (f.type !== 'calculated' && f.label) {
                                const numVal = parseFloat(row[f.name]);
                                context[f.label] = isNaN(numVal) ? 0 : numVal;
                            }
                        });
                        let evalFormula = field.formula;
                        const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);
                        sortedKeys.forEach(key => {
                            evalFormula = evalFormula.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(context[key]));
                        });
                        const result = safeEvalMath(evalFormula);
                        if (typeof result === 'number' && !isNaN(result)) {
                            val = result.toFixed(field.precision !== undefined ? field.precision : 2);
                            if (field.showPercent) val += '%';
                        }
                    } catch (e) { }
                }
                return `"${String(val || '').replace(/"/g, '""')}"`;
            };

            const headers = table.fields.map(f => `"${f.label || f.name}"`).join(',');
            const rows = data.map(row => {
                return table.fields.map(f => formatVal(f, row)).join(',');
            });
            const csvContent = "\ufeff" + [headers, ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `${table.name}_${new Date().getTime()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
};

// 混入到 AnalysisPage（延迟执行，确保 AnalysisPage 已定义）
(function () {
    function tryMixin() {
        if (typeof AnalysisPage !== 'undefined' && AnalysisPage.prototype) {
            Object.assign(AnalysisPage.prototype, AnalysisSmartTableMixin);
        } else {
            // 如果 AnalysisPage 还未定义，延迟重试
            setTimeout(tryMixin, 50);
        }
    }
    tryMixin();
})();

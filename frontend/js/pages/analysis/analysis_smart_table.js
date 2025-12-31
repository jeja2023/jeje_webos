/**
 * 数据分析模块 - 智能表格功能
 */

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
                        ➕ 新建表格
                    </button>
                </div>
                
                <div class="smart-table-grid" id="smart-table-list">
                    ${this.state.smartTables ? this.state.smartTables.map(t => `
                        <div class="smart-table-card">
                            <div class="smart-table-card-header">
                                <div class="smart-table-card-icon">📋</div>
                            </div>
                            <div class="smart-table-card-body">
                                <h4 class="m-0 mb-8 text-truncate font-bold" title="${t.name}">${t.name}</h4>
                                <div class="text-xs text-secondary mb-12 flex-between">
                                    <div>
                                        <div>⚙️ ${t.fields.length} 个字段</div>
                                        <div>📅 ${Utils.formatDate(t.created_at)}</div>
                                    </div>
                                    ${t.dataset_id ? '<span class="badge badge-primary" title="已同步到数据集" style="font-size: 10px; padding: 2px 5px;">📦 已同步</span>' : ''}
                                </div>
                                <div class="flex gap-10">
                                    <button class="btn btn-primary btn-sm flex-1 btn-view-smart-table" data-id="${t.id}">查看</button>
                                    <button class="btn btn-ghost btn-sm btn-delete-smart-table" data-id="${t.id}">🗑️</button>
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

                    // 执行计算
                    const result = eval(evalFormula);

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
                    console.warn('计算错误:', e);
                    value = value || '';
                }
            }

            return value || '';
        };

        return `
            <div class="flex-column h-100">
                <div class="p-20 border-bottom bg-primary">
                    <div class="flex-between">
                        <div class="flex-center">
                            <button class="btn-icon mr-10" id="btn-back-to-smart-tables">⬅️</button>
                            <h2 class="m-0">${table.name}</h2>
                        </div>
                        <div class="flex gap-10">
                            <button class="btn btn-outline-primary btn-sm" id="btn-sync-smart-table" title="同步数据到数据集">${table.dataset_id ? '🔄 同步数据集' : '📦 导入数据集'}</button>
                            <button class="btn btn-ghost btn-sm" id="btn-refresh-smart-table" title="刷新数据">🔄 刷新</button>
                            <button class="btn btn-outline-primary btn-sm" id="btn-edit-smart-table-fields">⚙️ 字段管理</button>
                            <button class="btn btn-primary btn-sm" id="btn-add-smart-table-row">➕ 添加数据</button>
                        </div>
                    </div>
                </div>
                
                <div class="data-table-container">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                ${table.fields.map(f => `<th>${f.label || f.name}${f.type === 'calculated' ? ' ⚡' : ''}</th>`).join('')}
                                <th width="100">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${table.fields.map(f => `<td>${formatCellValue(f, row)}</td>`).join('')}
                                    <td>
                                        <div class="flex gap-5">
                                            <button class="btn btn-ghost btn-xs btn-edit-smart-row" data-id="${row.id}">✏️</button>
                                            <button class="btn btn-ghost btn-xs btn-delete-smart-row" data-id="${row.id}">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                            ${data.length === 0 ? `<tr><td colspan="${table.fields.length + 1}" class="text-center p-20">暂无数据</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
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
                // 如果没有 key，自动生成一个 (保持后台逻辑，但前端隐藏)
                if (!f.name) f.name = `col_${Math.random().toString(36).substr(2, 6)}`;

                return `
                <div class="field-setup-item p-12 mb-10 border-radius-sm bg-light relative ${isCalc && !f._collapsed ? 'wide' : 'half'}" data-index="${i}">
                    <div class="flex gap-10 align-items-center">
                        <div class="flex-center font-bold text-primary" style="width: 28px; height: 28px; border-radius: 50%; background: var(--color-primary); color: white; font-size: 12px;">${i + 1}</div>
                        <div style="flex: 1.5;">
                            <input type="text" class="form-control form-control-sm field-label" placeholder="字段名称 (如: 语文)" value="${f.label || ''}" onchange="AnalysisPage.prototype.updateFieldState(${i}, 'label', this.value)">
                        </div>
                        <div style="flex: 1;">
                            <select class="form-control form-control-sm field-type" onchange="AnalysisPage.prototype.updateFieldState(${i}, 'type', this.value); if(this.value === 'calculated') { AnalysisPage.prototype.updateFieldState(${i}, 'precision', 2); }">
                                <option value="text" ${f.type === 'text' ? 'selected' : ''}>文本</option>
                                <option value="number" ${f.type === 'number' ? 'selected' : ''}>数字</option>
                                <option value="date" ${f.type === 'date' ? 'selected' : ''}>日期</option>
                                <option value="select" ${f.type === 'select' ? 'selected' : ''}>下拉选择</option>
                                <option value="calculated" ${f.type === 'calculated' ? 'selected' : ''}>⚡ 自动计算</option>
                            </select>
                        </div>
                        <button class="btn btn-ghost btn-xs text-danger" onclick="AnalysisPage.prototype.removeField(${i})" title="移除字段">✕</button>
                    </div>

                    ${isCalc ? `
                        <div class="calc-config mt-10 p-12 bg-white border-radius-sm" style="display: ${f._collapsed ? 'none' : 'block'};">
                            <div class="text-xs font-bold text-primary mb-10">计算公式配置</div>
                            
                            <div class="mb-10">
                                <div class="text-xs text-secondary mb-5">运算方式:</div>
                                <div class="flex flex-wrap gap-5 mb-10">
                                    <button class="btn btn-xs ${f.calcMode === 'sum' || !f.calcMode ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'sum')">➕ 求和</button>
                                    <button class="btn btn-xs ${f.calcMode === 'product' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'product')">✖ 乘积</button>
                                    <button class="btn btn-xs ${f.calcMode === 'diff' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'diff')">➖ 差值</button>
                                    <button class="btn btn-xs ${f.calcMode === 'divide' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'divide')">➗ 除法</button>
                                    <button class="btn btn-xs ${f.calcMode === 'avg' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'avg')">📊 平均值</button>
                                    <button class="btn btn-xs ${f.calcMode === 'percent' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'percent')">💹 百分比</button>
                                    <button class="btn btn-xs ${f.calcMode === 'custom' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="AnalysisPage.prototype.setCalcMode(${i}, 'custom')">✍️ 自定义</button>
                                </div>
                                
                                ${f.calcMode === 'percent' ? `
                                    <div class="mb-10 p-10 bg-light border-radius-sm">
                                        <div class="text-xs text-secondary mb-5">百分比计算: 分子 ÷ 分母 × 100%</div>
                                        <div class="flex gap-10 align-items-center">
                                            <select class="form-control form-control-sm" style="flex:1;" onchange="AnalysisPage.prototype.setPercentField(${i}, 'numerator', this.value)">
                                                <option value="">选择分子</option>
                                                ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<option value="${other.label}" ${f.numerator === other.label ? 'selected' : ''}>${other.label || '未命名'}</option>`
                ).join('')}
                                            </select>
                                            <span>÷</span>
                                            <select class="form-control form-control-sm" style="flex:1;" onchange="AnalysisPage.prototype.setPercentField(${i}, 'denominator', this.value)">
                                                <option value="">选择分母</option>
                                                ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<option value="${other.label}" ${f.denominator === other.label ? 'selected' : ''}>${other.label || '未命名'}</option>`
                ).join('')}
                                            </select>
                                            <span>× 100%</span>
                                        </div>
                                    </div>
                                ` : f.calcMode === 'custom' ? `
                                    <div class="mb-10">
                                        <div class="text-xs text-secondary mb-5">输入公式（点击字段插入）:</div>
                                        <input type="text" class="form-control form-control-sm font-mono mb-5" value="${f.formula || ''}" oninput="AnalysisPage.prototype.updateFormula(${i}, this.value)" placeholder="例如: 语文 + 数学 * 2">
                                        <div class="flex flex-wrap gap-5">
                                            ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other =>
                    `<button class="btn btn-outline-primary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, '${other.label}')">${other.label || '未命名'}</button>`
                ).join('')}
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, ' + ')">+</button>
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, ' - ')">-</button>
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, ' * ')">×</button>
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, ' / ')">÷</button>
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, '(')">(</button>
                                            <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertToFormula(${i}, ')')">)</button>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="text-xs text-secondary mb-5">选择参与计算的字段:</div>
                                    <div class="flex flex-wrap gap-5">
                                        ${fields.filter((_, idx) => idx !== i && fields[idx].type !== 'calculated').map(other => {
                    const isChecked = f.sourceFields && f.sourceFields.includes(other.label);
                    return `<label class="flex-center gap-4 cursor-pointer px-10 py-5 border-radius-sm ${isChecked ? 'bg-primary text-white' : 'bg-light border'}" style="font-size: 12px;">
                                                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="AnalysisPage.prototype.toggleFieldCheck(${i}, '${other.label}')" style="display:none;">
                                                ${other.label || '未命名'}
                                            </label>`;
                }).join('')}
                                    </div>
                                `}
                            </div>
                            
                            <div class="flex gap-10 align-items-center mb-10">
                                <div class="text-xs text-secondary">小数精度:</div>
                                <select class="form-control form-control-sm" style="width: 80px;" onchange="AnalysisPage.prototype.updateFieldState(${i}, 'precision', parseInt(this.value))">
                                    <option value="0" ${f.precision === 0 ? 'selected' : ''}>整数</option>
                                    <option value="1" ${f.precision === 1 ? 'selected' : ''}>1位</option>
                                    <option value="2" ${f.precision === 2 || f.precision === undefined ? 'selected' : ''}>2位</option>
                                    <option value="3" ${f.precision === 3 ? 'selected' : ''}>3位</option>
                                    <option value="4" ${f.precision === 4 ? 'selected' : ''}>4位</option>
                                </select>
                                <label class="flex-center gap-5 cursor-pointer text-xs">
                                    <input type="checkbox" ${f.showPercent ? 'checked' : ''} onchange="AnalysisPage.prototype.updateFieldState(${i}, 'showPercent', this.checked)">
                                    显示%符号
                                </label>
                            </div>
                            
                            <div class="flex-between align-items-center border-top pt-10" style="border-color: var(--color-border);">
                                <div class="text-xs font-mono bg-light px-10 py-5 border-radius-sm" style="max-width: 70%; overflow: hidden; text-overflow: ellipsis;">
                                    📝 ${f.formula || '(请配置公式)'}
                                </div>
                                <button class="btn btn-primary btn-xs" onclick="AnalysisPage.prototype.toggleCalcPanel(${i}, true)">确定</button>
                            </div>
                        </div>
                        ${f._collapsed ? `<div class="text-xs text-primary cursor-pointer mt-8 px-10 py-5 bg-white border-radius-sm font-mono" style="border: 1px solid var(--color-primary);" onclick="AnalysisPage.prototype.toggleCalcPanel(${i}, false)">📝 ${f.formula || '(未设置)'}${f.showPercent ? '%' : ''}</div>` : ''}
                    ` : ''}
                </div>
                `;
            }).join('');
        };

        // 挂载临时方法到原型链以便HTML中调用 (Hacky but effective for this architecture)
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

        // Modal Logic
        Modal.show({
            title: isEdit ? '表格结构设计' : '新建智能表格',
            width: '850px',
            content: `
                <div class="form-group mb-20 p-20 bg-soft-primary border-radius-sm">
                    <label class="font-bold mb-8 block">表格名称</label>
                    <input type="text" id="smart-table-name" class="form-control form-control-lg" value="${table?.name || ''}" placeholder="请输入表格名称，如：销售统计表">
                </div>
                <div class="form-group p-x-20">
                    <div class="flex-between align-items-center mb-15">
                        <label class="font-bold m-0">字段定义配置</label>
                        <button class="btn btn-outline-primary btn-sm" id="btn-add-setup-field">➕ 添加新字段</button>
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
                    const payload = { name, fields };
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

        console.log('Field config map:', fieldConfigMap);

        // 定义计算函数
        const setupCalculation = () => {
            const form = document.querySelector('.smart-row-form');
            if (!form) {
                console.error('Form not found!');
                return;
            }

            const calcInputs = form.querySelectorAll('.row-calc-input');
            console.log('Found calc inputs:', calcInputs.length);

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

                console.log('Context:', context);

                // 2. 遍历计算
                calcInputs.forEach(calc => {
                    const fieldName = calc.dataset.name;
                    const config = fieldConfigMap[fieldName];

                    console.log('Processing field:', fieldName, 'Config:', config);

                    if (!config || !config.formula) {
                        console.warn('No formula for field:', fieldName);
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

                        console.log('Eval formula:', evalFormula);

                        const result = eval(evalFormula);

                        console.log('Result:', result);

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
                        console.error('Calc error:', e);
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
                <div class="smart-row-form">
                    ${table.fields.map(f => {
                const isCalc = f.type === 'calculated';
                return `
                        <div class="form-group mb-0">
                            <label class="text-sm text-secondary mb-5 block">${f.label || f.name} ${isCalc ? '⚡' : ''}</label>
                            ${f.type === 'date' ? `
                                <input type="date" class="form-control row-input" data-name="${f.name}" data-label="${f.label}" data-type="${f.type}" value="${rowData ? rowData[f.name] || '' : ''}">
                            ` : f.type === 'number' ? `
                                <input type="number" class="form-control row-input" data-name="${f.name}" data-label="${f.label}" data-type="${f.type}" value="${rowData ? rowData[f.name] || '' : ''}">
                            ` : isCalc ? `
                                <input type="text" class="form-control row-input row-calc-input" data-name="${f.name}" data-type="${f.type}" value="${rowData ? rowData[f.name] || '' : ''}" readonly placeholder="自动计算" style="background: var(--color-bg-secondary);">
                            ` : `
                                <input type="text" class="form-control row-input" data-name="${f.name}" data-label="${f.label}" data-type="${f.type}" value="${rowData ? rowData[f.name] || '' : ''}">
                            `}
                        </div>
                    `}).join('')}
                </div>
            `,
            onConfirm: async () => {
                const inputs = document.querySelectorAll('.row-input');
                const data = {};
                inputs.forEach(input => {
                    data[input.dataset.name] = input.value;
                });

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

        // Modal.show 之后立即设置计算（使用 setTimeout 确保 DOM 渲染完成）
        setTimeout(setupCalculation, 150);
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

        // 返回列表
        this.delegate('click', '#btn-back-to-smart-tables', () => {
            this.setState({ currentSmartTable: null, smartTableData: [] });
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
    }
};

if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisSmartTableMixin);
}

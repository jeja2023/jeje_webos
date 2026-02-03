/**
 * DataLens Editor 模块 - 视图、数据源与分类编辑器
 * 支持简单模式（可视化配置）和高级模式（SQL 编辑）
 */

const DataLensEditorMixin = {
    _renderIconPicker(selectedIcon, inputId) {
        const icons = [
            '📊', '📈', '📉', '📅', '📋', '📂', '🔌', '🔗', '📁', '💻',
            '📱', '🏢', '👥', '💰', '⚡', '🔔', '🛠️', '⚙️', '📡', '📦',
            '🏷️', '🔍', '📝', '📍', '🚀', '🛠️', '🌍', '🏠', '🧩', '🎨'
        ];

        return `
            <div class="lens-icon-picker" id="${inputId}-picker">
                ${icons.map(icon => `
                    <div class="lens-icon-option ${icon === selectedIcon ? 'active' : ''}" data-icon="${icon}">
                        ${icon}
                    </div>
                `).join('')}
            </div>
            <input type="hidden" id="${inputId}" value="${selectedIcon}">
        `;
    },

    _initIconPicker(overlay, inputId) {
        const picker = overlay.querySelector(`#${inputId}-picker`);
        const hiddenInput = overlay.querySelector(`#${inputId}`);
        if (!picker || !hiddenInput) return;

        picker.addEventListener('click', (e) => {
            const option = e.target.closest('.lens-icon-option');
            if (!option) return;

            picker.querySelectorAll('.lens-icon-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            hiddenInput.value = option.dataset.icon;
        });
    },

    async _showVisualSettings(viewId) {
        try {
            const res = await LensApi.getViews();
            const view = res.data?.find(v => v.id === viewId);
            if (!view) throw new Error('视图不存在');

            // 尝试获取视图的列字段
            let columns = [];
            try {
                const dataRes = await LensApi.getViewData(viewId, { page: 1, page_size: 1 });
                if (dataRes.code === 200 && dataRes.data && dataRes.data.data.length > 0) {
                    columns = Object.keys(dataRes.data.data[0]).filter(k => k !== '__lens_id__');
                }
            } catch (e) {
                Config.warn('无法获取视图列信息', e);
            }

            const chartConfig = view.chart_config || {};
            const displayConfig = view.display_config || {};
            const statusConfig = view.status_config || {};
            const hiddenCols = displayConfig._hide || [];

            // 构建字段选项
            const buildFieldOptions = (selectedValue) => {
                if (columns.length > 0) {
                    return `<option value="">请选择字段</option>` +
                        columns.map(c => `<option value="${c}" ${selectedValue === c ? 'selected' : ''}>${c}</option>`).join('');
                }
                return `<option value="">无可用字段</option>`;
            };

            // 构建列别名与类型配置
            const buildColumnAliasRows = () => {
                if (columns.length === 0) return '<p class="text-muted">无可用字段</p>';
                return columns.map(col => {
                    // 获取当前配置
                    const colConf = (displayConfig.columns && displayConfig.columns[col]) || displayConfig[col] || {};
                    const alias = typeof colConf === 'object' ? (colConf.title || '') : colConf;
                    const type = colConf.type || 'default';
                    const isHidden = hiddenCols.includes(col);

                    return `
                        <div class="lens-col-alias-row" style="display: flex; align-items: center; margin-bottom: 12px; gap: 10px; flex-wrap: wrap;">
                            <span style="width: 120px; flex-shrink: 0; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis;" title="${col}">${col}</span>
                            <input type="text" class="form-control form-control-sm lens-alias-input" 
                                   data-col="${col}" value="${alias}" placeholder="显示名称" 
                                   style="width: 150px !important;">
                            <select class="form-control form-control-sm lens-col-type" data-col="${col}" style="width: 100px !important;">
                                <option value="default" ${type === 'default' ? 'selected' : ''}>默认</option>
                                <option value="image" ${type === 'image' ? 'selected' : ''}><i class="ri-image-line"></i> 图片</option>
                                <option value="link" ${type === 'link' ? 'selected' : ''}><i class="ri-link"></i> 链接</option>
                                <option value="date" ${type === 'date' ? 'selected' : ''}><i class="ri-calendar-line"></i> 日期</option>
                                <option value="bool" ${type === 'bool' ? 'selected' : ''}><i class="ri-checkbox-circle-line"></i> 布尔</option>
                            </select>
                            <label style="display: flex; align-items: center; font-size: 13px; cursor: pointer; user-select: none;">
                                <input type="checkbox" class="lens-hide-col" data-col="${col}" ${isHidden ? 'checked' : ''} style="margin-right: 4px;"> 隐藏
                            </label>
                        </div>
                    `;
                }).join('');
            };

            // 构建状态配置行 - 支持比较操作符
            const buildStatusRows = () => {
                // 新格式: status_config.rules = [{field, operator, value, color}]
                // 兼容旧格式: status_config = {field: {value: color}}
                let rules = statusConfig.rules || [];
                if (rules.length === 0 && Object.keys(statusConfig).length > 0 && !statusConfig.rules) {
                    // 转换旧格式
                    for (const field in statusConfig) {
                        if (field === 'rules') continue;
                        const mappings = statusConfig[field];
                        for (const value in mappings) {
                            rules.push({ field, operator: 'eq', value, color: mappings[value] });
                        }
                    }
                }
                if (rules.length === 0) {
                    return '';
                }
                return rules.map((r, i) => `
                    <div class="lens-status-row" data-index="${i}" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; justify-content: flex-start;">
                        <select class="form-control form-control-sm lens-status-field" style="width: 160px !important; flex-shrink: 0;">
                            ${columns.map(c => `<option value="${c}" ${c === r.field ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                        <select class="form-control form-control-sm lens-status-op" style="width: 160px !important; flex-shrink: 0;">
                            <option value="eq" ${r.operator === 'eq' ? 'selected' : ''}>等于 (=)</option>
                            <option value="ne" ${r.operator === 'ne' ? 'selected' : ''}>不等于 (≠)</option>
                            <option value="gt" ${r.operator === 'gt' ? 'selected' : ''}>大于 (>)</option>
                            <option value="gte" ${r.operator === 'gte' ? 'selected' : ''}>大于等于 (≥)</option>
                            <option value="lt" ${r.operator === 'lt' ? 'selected' : ''}>小于 (<)</option>
                            <option value="lte" ${r.operator === 'lte' ? 'selected' : ''}>小于等于 (≤)</option>
                        </select>
                        <input type="text" class="form-control form-control-sm lens-status-value" value="${r.value}" placeholder="值" style="width: 80px !important; flex-shrink: 0;">
                        <select class="form-control form-control-sm lens-status-color" style="width: 130px !important; flex-shrink: 0;">
                            <option value="success" ${r.color === 'success' ? 'selected' : ''}><i class="ri-checkbox-circle-line"></i> 成功</option>
                            <option value="warning" ${r.color === 'warning' ? 'selected' : ''}><i class="ri-alert-line"></i> 警告</option>
                            <option value="danger" ${r.color === 'danger' ? 'selected' : ''}><i class="ri-close-circle-line"></i> 危险</option>
                            <option value="info" ${r.color === 'info' ? 'selected' : ''}><i class="ri-information-line"></i> 信息</option>
                        </select>
                        <button class="lens-btn lens-btn-xs lens-btn-danger lens-remove-status" style="width: 28px; padding: 0; flex-shrink: 0;">×</button>
                    </div>
                `).join('');
            };

            // 准备 ChartConfigUI 需要的配置值
            const chartValues = {
                chartType: chartConfig.type || 'bar',
                xField: chartConfig.xAxis,
                yField: chartConfig.yAxis,
                aggregationType: chartConfig.aggregation,
                title: chartConfig.title,
                colorScheme: chartConfig.colorScheme,
                sortField: chartConfig.sortField,
                sortOrder: chartConfig.sortOrder || 'asc',
                // 高级字段映射 (如果已保存过)
                ...chartConfig
            };

            const chartFormHtml = ChartConfigUI.getFormHtml({
                values: chartValues,
                fields: columns,
                datasets: [], // 不显示数据集选择器
                showLayoutConfig: false
            });

            const modalContent = `
                <div class="lens-editor" style="display: flex; flex-direction: row; gap: 24px; flex-wrap: wrap;">
                    <div class="lens-editor-section" style="flex: 1; min-width: 280px;">
                        <h4><i class="ri-bar-chart-fill"></i> 图表配置</h4>
                        ${chartFormHtml}
                    </div>
                    <div class="lens-editor-section" style="flex: 2; min-width: 480px;">
                        <h4><i class="ri-file-text-line"></i> 表格配置</h4>
                        <div style="margin-bottom:16px;">
                            <div class="flex-between align-center mb-8">
                                <label style="font-weight:600;font-size:13px;">列显示名称</label>
                            </div>
                            <div id="lens-col-alias-list" style="max-height: 180px; overflow-y: auto;">
                                ${buildColumnAliasRows()}
                            </div>
                        </div>
                        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
                            <div class="flex-between align-center mb-8">
                                <label style="font-weight:600;font-size:13px;"><i class="ri-price-tag-3-line"></i> 单元格状态</label>
                                <button class="lens-btn lens-btn-xs" id="lens-add-status"><i class="ri-add-line"></i> 添加</button>
                            </div>
                            <div id="lens-status-list" style="max-height: 150px; overflow-y: auto;">
                                ${buildStatusRows()}
                            </div>
                            <small class="form-hint">根据条件为表格单元格设置颜色标签</small>
                        </div>
                    </div>
                </div>
            `;

            const modal = Modal.show({
                title: `显示配置 - ${view.name}`,
                content: modalContent,
                width: '1200px',
                confirmText: '保存配置',
                onConfirm: async () => {
                    const overlay = modal.overlay;
                    const $ = (s) => overlay.querySelector(s);
                    const $$ = (s) => overlay.querySelectorAll(s);

                    // 收集图表配置 (使用 ChartConfigUI)
                    const formValues = ChartConfigUI.getFormValues(overlay);

                    // 映射回 DataLens 格式
                    const chart_config = {
                        type: formValues.chartType,
                        xAxis: formValues.xField,
                        xFields: formValues.xFields, // 热力图多字段
                        yAxis: formValues.yField,
                        aggregation: formValues.aggregationType,

                        // 保存高级配置
                        colorScheme: formValues.colorScheme,
                        title: formValues.title,
                        showLabel: formValues.showLabel,
                        stacked: formValues.stacked,
                        dualAxis: formValues.dualAxis,
                        y2Field: formValues.y2Field,
                        y3Field: formValues.y3Field,
                        forecastSteps: formValues.forecastSteps,
                        excludeValues: formValues.excludeValues,
                        filterField: formValues.filterField,
                        filterOp: formValues.filterOp,
                        filterValue: formValues.filterValue,
                        sortField: formValues.sortField,
                        sortOrder: formValues.sortOrder
                    };

                    // 收集显示配置
                    const display_config = { columns: {} };
                    const hiddenCols = [];

                    $$('.lens-alias-input').forEach(input => {
                        const col = input.dataset.col;
                        const alias = input.value.trim();
                        const type = $(`.lens-col-type[data-col="${col}"]`)?.value || 'default';

                        display_config.columns[col] = {
                            title: alias,
                            type: type
                        };
                    });

                    $$('.lens-hide-col:checked').forEach(cb => {
                        hiddenCols.push(cb.dataset.col);
                    });
                    if (hiddenCols.length > 0) display_config._hide = hiddenCols;

                    // 收集状态配置
                    const rules = [];
                    $$('.lens-status-row').forEach(row => {
                        const field = row.querySelector('.lens-status-field')?.value;
                        const operator = row.querySelector('.lens-status-op')?.value || 'eq';
                        const value = row.querySelector('.lens-status-value')?.value;
                        const color = row.querySelector('.lens-status-color')?.value;
                        if (field && value !== undefined && value !== '') {
                            rules.push({ field, operator, value, color });
                        }
                    });
                    const status_config = rules.length > 0 ? { rules } : null;

                    try {
                        await LensApi.updateView(viewId, {
                            display_config: (display_config && Object.keys(display_config).length > 0) ? display_config : null,
                            status_config: (status_config && Object.keys(status_config).length > 0) ? status_config : null,
                            chart_config
                        });
                        Toast.success('视觉配置已更新');

                        const { openTabs } = this.state;
                        const tab = openTabs.find(t => t.id === viewId);
                        if (tab) {
                            tab.display_config = display_config;
                            tab.status_config = status_config;
                            tab.chart_config = chart_config;
                            this.setState({ openTabs: [...openTabs] });
                        }
                        // 刷新当前视图（图表或表格）
                        if (tab && tab.viewMode === 'chart') {
                            setTimeout(() => this._initChart(tab), 100);
                        }
                        return true;
                    } catch (e) {
                        Config.error('保存配置失败:', e);
                        if (e.message && e.message.includes('401')) {
                            Toast.error('登录已过期，请刷新页面重新登录');
                        } else {
                            Toast.error('保存失败: ' + (e.message || '未知错误'));
                        }
                        return false;
                    }
                }
            });

            // 初始化图表配置交互（必须在 overlay 可用后立即调用）
            const overlay = modal.overlay;
            if (overlay) {
                // 使用 requestAnimationFrame 确保 DOM 已完全渲染
                requestAnimationFrame(() => {
                    ChartConfigUI.initInteractions(overlay);
                });

                const $ = (s) => overlay.querySelector(s);
                const $$ = (s) => overlay.querySelectorAll(s);

                $('#lens-add-status')?.addEventListener('click', () => {
                    const statusList = $('#lens-status-list');
                    const newRow = document.createElement('div');
                    newRow.className = 'lens-status-row';
                    newRow.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px; justify-content: flex-start;';
                    newRow.innerHTML = `
                        <select class="form-control form-control-sm lens-status-field" style="width: 160px !important; flex-shrink: 0;">
                            ${columns.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <select class="form-control form-control-sm lens-status-op" style="width: 160px !important; flex-shrink: 0;">
                            <option value="eq">等于 (=)</option>
                            <option value="ne">不等于 (≠)</option>
                            <option value="gt">大于 (>)</option>
                            <option value="gte">大于等于 (≥)</option>
                            <option value="lt">小于 (<)</option>
                            <option value="lte">小于等于 (≤)</option>
                        </select>
                        <input type="text" class="form-control form-control-sm lens-status-value" placeholder="值" style="width: 80px !important; flex-shrink: 0;">
                        <select class="form-control form-control-sm lens-status-color" style="width: 130px !important; flex-shrink: 0;">
                            <option value="success"><i class="ri-checkbox-circle-line"></i> 成功</option>
                            <option value="warning"><i class="ri-alert-line"></i> 警告</option>
                            <option value="danger"><i class="ri-close-circle-line"></i> 危险</option>
                            <option value="info"><i class="ri-information-line"></i> 信息</option>
                        </select>
                        <button class="lens-btn lens-btn-xs lens-btn-danger lens-remove-status" style="width: 28px; padding: 0; flex-shrink: 0;">×</button>
                    `;
                    statusList.appendChild(newRow);
                    newRow.querySelector('.lens-remove-status').addEventListener('click', () => newRow.remove());
                });

                // 绑定删除状态按钮
                overlay.querySelectorAll('.lens-remove-status').forEach(btn => {
                    btn.addEventListener('click', (e) => e.target.closest('.lens-status-row').remove());
                });
            }
        } catch (e) {
            Config.error(e);
            Toast.error('获取视图信息失败');
        }
    },

    _safeJsonParse(str, fieldLabel = '配置') {
        if (!str || !str.trim()) return null;
        try {
            return JSON.parse(str);
        } catch (e) {
            let errorMsg = `JSON 格式错误`;
            if (e.message) {
                // 处理常见的语法错误，使其更易读
                const posMatch = e.message.match(/at position (\d+)/);
                if (posMatch) {
                    errorMsg += ` (位置 ${posMatch[1]})`;
                }
                errorMsg += `: ${e.message}`;
            }
            Toast.error(`${fieldLabel}${errorMsg}`);
            throw e;
        }
    },

    _showViewEditor(view = null) {
        const isEdit = !!view;
        const { categories } = this.state;
        // 判断是否为高级模式（如果已有 SQL 且没有 table 配置则默认为高级模式）
        const isAdvancedMode = view?.query_type === 'sql' && !view?.query_config?.table && !!view?.query_config?.sql;

        // 获取数据源列表
        LensApi.getSources().then(res => {
            const sources = res.data || [];

            const modalContent = `
                <div class="lens-editor" style="display: flex; flex-direction: row; gap: 24px; align-items: flex-start;">
                    <div class="lens-editor-side" style="width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 24px;">
                        <div class="lens-editor-section">
                            <h4>基本信息</h4>
                            <div class="form-group">
                                <label>视图名称 <span class="required">*</span></label>
                                <input type="text" id="lens-view-name" class="form-control" 
                                       value="${view?.name || ''}" placeholder="输入视图名称">
                            </div>
                            <div class="form-group">
                                <label>视图图标</label>
                                ${this._renderIconPicker(view?.icon || '📊', 'lens-view-icon')}
                            </div>
                            <div class="form-group">
                                <label>所属分类</label>
                                <select id="lens-view-category" class="form-control">
                                    <option value="">未分类</option>
                                    ${categories.map(c => `
                                        <option value="${c.id}" ${view?.category_id === c.id ? 'selected' : ''}>
                                            ${c.icon} ${c.name}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>描述</label>
                                <textarea id="lens-view-desc" class="form-control" rows="2" 
                                          placeholder="视图描述（可选）">${view?.description || ''}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="lens-editor-main" style="flex: 1; min-width: 600px; display: flex; flex-direction: column; gap: 24px;">
                        <div class="lens-editor-section">
                            <div class="flex-between mb-10">
                                <h4 class="m-0">数据查询配置</h4>
                                <div class="lens-mode-switch">
                                    <label class="lens-mode-label ${!isAdvancedMode ? 'active' : ''}" data-mode="simple">
                                        <input type="radio" name="lens-query-mode" value="simple" ${!isAdvancedMode ? 'checked' : ''}> 简单模式
                                    </label>
                                    <label class="lens-mode-label ${isAdvancedMode ? 'active' : ''}" data-mode="advanced">
                                        <input type="radio" name="lens-query-mode" value="advanced" ${isAdvancedMode ? 'checked' : ''}> 高级模式
                                    </label>
                                </div>
                            </div>
                        
                        <!-- 数据源选择（两种模式通用） -->
                        <div class="form-group">
                            <label>选择数据源 <span class="required">*</span></label>
                            <div class="flex gap-10 align-center">
                                <select id="lens-view-source" class="form-control" style="flex:1">
                                    <option value="">请选择数据源</option>
                                    ${sources.map(s => `
                                        <option value="${s.id}" ${view?.datasource_id === s.id ? 'selected' : ''}>
                                            ${this._getSourceTypeIcon(s.type)} ${s.name}
                                        </option>
                                    `).join('')}
                                </select>
                                <a href="javascript:void(0)" class="lens-manage-sources-btn text-sm">管理数据源</a>
                            </div>
                        </div>
                        <!-- 简单模式：可视化查询构建器 -->
                        <div id="lens-simple-mode" style="${isAdvancedMode ? 'display:none' : ''}">
                             <div class="form-group">
                                 <label>选择主表 <span class="required">*</span></label>
                                 <select id="lens-view-table-select" class="form-control">
                                     <option value="">请先选择数据源</option>
                                 </select>
                             </div>
                             
                             <!-- 表关联配置区 -->
                             <div class="form-group" id="lens-joins-section" style="display:none">
                                 <div class="flex-between align-center">
                                     <label class="m-0">关联其他表（可选）</label>
                                     <button class="lens-btn lens-btn-xs" id="lens-add-join"><i class="ri-add-line"></i> 添加关联</button>
                                 </div>
                                 <div id="lens-joins-list" class="mt-10">
                                     <!-- 动态添加的关联表配置 -->
                                 </div>
                             </div>
                            
                            <div class="form-group" id="lens-columns-section" style="display:none">
                                <label>选择要显示的字段</label>
                                <div class="lens-field-groups-container" id="lens-columns-list">
                                    <!-- 动态加载字段的分组列表 -->
                                </div>
                            </div>
                            
                            <div class="form-group" id="lens-filters-section" style="display:none">
                                <div class="flex-between align-center">
                                    <label class="m-0">筛选条件（可选）</label>
                                    <button class="lens-btn lens-btn-xs" id="lens-add-filter"><i class="ri-add-line"></i> 添加条件</button>
                                </div>
                                <div id="lens-filters-list" class="mt-10">
                                    <!-- 动态添加的筛选条件 -->
                                </div>
                            </div>
                            
                            <div class="form-group" id="lens-sort-section" style="display:none">
                                <label>排序设置（可选）</label>
                                <div class="flex gap-10">
                                    <select id="lens-sort-field" class="form-control" style="flex:1">
                                        <option value="">不排序</option>
                                    </select>
                                    <select id="lens-sort-dir" class="form-control" style="width:100px">
                                        <option value="ASC">升序</option>
                                        <option value="DESC">降序</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- 视图高级配置 -->
                        <div class="form-group mt-15">
                            <div class="lens-collapsible" id="lens-advanced-options-toggle">
                                <div class="flex align-center gap-5" style="cursor:pointer; color:var(--text-secondary); font-size:13px;">
                                    <span class="lens-collapsible-icon">▼</span>
                                    <span>高级配置</span>
                                </div>
                            </div>
                            <div class="lens-collapsible-content mt-10" id="lens-advanced-options-content">
                                <div class="form-group">
                                    <label>本地图片根目录 (可选)</label>
                                    <input type="text" id="lens-image-base-path" class="form-control" 
                                           placeholder="例如: D:\Project\images (当数据库存储相对路径时使用)" value="${Utils.escapeHtml(view?.display_config?.image_base_path || '')}">
                                    <small class="form-hint">如果数据库中的图片字段存储的是相对路径，必须在此配置对应的本地根目录，否则无法显示。</small>
                                </div>
                                <div class="form-group mt-10">
                                    <div class="checkbox-custom">
                                        <input type="checkbox" id="lens-view-public" ${view?.is_public ? 'checked' : ''}>
                                        <label for="lens-view-public" style="white-space: nowrap;">设为公开视图（所有用户可见）</label>
                                    </div>
                                    <small class="form-hint ml-25" style="margin-left: 24px;">勾选后，该视图将对系统中所有用户可见，否则仅自己可见。</small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 高级模式：SQL 编辑器 -->
                        <div id="lens-advanced-mode" style="${!isAdvancedMode ? 'display:none' : ''}">
                            <div class="form-group">
                                <label>SQL 语句 <span class="required">*</span></label>
                                <textarea id="lens-view-sql" class="form-control lens-sql-editor" rows="5" 
                                          placeholder="SELECT * FROM table_name WHERE condition">${view?.query_config?.sql || ''}</textarea>
                                <div class="flex-between mt-5">
                                    <small class="form-hint">支持多表关联 (JOIN) 查询。系统会自动处理分页。</small>
                                    <div class="flex gap-5">
                                        <button class="lens-btn lens-btn-xs" style="font-size:11px; padding:2px 8px;" onclick="document.getElementById('lens-view-sql').value += '\\nSELECT t1.*, t2.* \\nFROM table1 t1 \\nLEFT JOIN table2 t2 ON t1.id = t2.t1_id \\nWHERE t1.status = 1'">插入 JOIN 模板</button>
                                        <button class="lens-btn lens-btn-xs" style="font-size:11px; padding:2px 8px;" onclick="document.getElementById('lens-view-sql').value = 'SELECT * FROM (' + document.getElementById('lens-view-sql').value + ') AS sub_t'">包装子查询</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex-between mt-10">
                            <label>数据预览</label>
                            <button class="lens-btn lens-btn-sm lens-btn-primary" id="lens-preview-btn">
                                <i class="ri-play-fill"></i> 执行预览 (Top 10)
                            </button>
                        </div>
                        <div id="lens-preview-error" class="lens-preview-error" style="display:none;"></div>
                        <div id="lens-preview-container" class="lens-table-wrapper" style="display:none; max-height: 180px; margin-top: 10px;">
                            <table class="lens-table" id="lens-preview-table">
                                <thead></thead>
                                <tbody></tbody>
                            </table>
                        </div>
                        

                        </div>
                    </div>
                </div>
            `;

            const modal = Modal.show({
                title: isEdit ? '编辑视图' : '新建视图',
                content: modalContent,
                width: '1200px',
                confirmText: isEdit ? '保存' : '创建',
                onConfirm: () => this._saveView(view?.id),
                onCancel: () => { }
            });

            const overlay = modal.overlay;
            if (!overlay) return;

            // 局部辅助函数：缩短 DOM 查询代码并确保作用域在当前 Overlay
            const $ = (s) => overlay.querySelector(s);
            const $$ = (s) => overlay.querySelectorAll(s);

            // 初始化图表配置交互（使用 requestAnimationFrame 确保 DOM 已完全渲染）
            requestAnimationFrame(() => {
                ChartConfigUI.initInteractions(overlay);
            });

            // 初始化图标选择器
            this._initIconPicker(overlay, 'lens-view-icon');

            // 绑定高级选项折叠
            const advToggle = $('#lens-advanced-options-toggle');
            const advContent = $('#lens-advanced-options-content');
            if (advToggle && advContent) {
                if (view?.display_config?.image_base_path) {
                    advToggle.classList.add('expanded');
                    advContent.style.maxHeight = '500px';
                    advContent.style.opacity = '1';
                }

                advToggle.addEventListener('click', () => {
                    const isExpanded = advToggle.classList.contains('expanded');
                    if (isExpanded) {
                        advToggle.classList.remove('expanded');
                        advContent.style.maxHeight = '0';
                        advContent.style.opacity = '0';
                    } else {
                        advToggle.classList.add('expanded');
                        advContent.style.maxHeight = '500px';
                        advContent.style.opacity = '1';
                    }
                });
            }

            // 缓存核心元素引用
            const sourceEl = $('#lens-view-source');
            const tableSelectEl = $('#lens-view-table-select');
            const columnsListEl = $('#lens-columns-list');
            const columnsSectionEl = $('#lens-columns-section');
            const filtersSectionEl = $('#lens-filters-section');
            const filtersListEl = $('#lens-filters-list');
            const sortSectionEl = $('#lens-sort-section');
            const sortFieldEl = $('#lens-sort-field');
            const simpleModeEl = $('#lens-simple-mode');
            const advancedModeEl = $('#lens-advanced-mode');
            const previewBtn = $('#lens-preview-btn');
            const joinsSectionEl = $('#lens-joins-section');
            const joinsListEl = $('#lens-joins-list');
            const advancedToggle = $('#lens-advanced-toggle');

            // 存储所有可用表名
            let availableTables = [];

            // 存储当前加载的字段（用于筛选条件下拉）
            let currentColumns = [];

            // 模式切换
            overlay.querySelectorAll('input[name="lens-query-mode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const isSimple = e.target.value === 'simple';
                    simpleModeEl.style.display = isSimple ? '' : 'none';
                    advancedModeEl.style.display = isSimple ? 'none' : '';
                    overlay.querySelectorAll('.lens-mode-label').forEach(l => l.classList.remove('active'));
                    e.target.closest('.lens-mode-label').classList.add('active');
                });
            });

            // 数据源切换 -> 加载表列表
            sourceEl?.addEventListener('change', async (e) => {
                const sourceId = e.target.value;
                tableSelectEl.innerHTML = '<option value="">加载中...</option>';
                columnsSectionEl.style.display = 'none';
                filtersSectionEl.style.display = 'none';
                sortSectionEl.style.display = 'none';

                if (!sourceId) {
                    tableSelectEl.innerHTML = '<option value="">请先选择数据源</option>';
                    return;
                }

                try {
                    const res = await LensApi.getSourceTables(sourceId);
                    availableTables = res.data || [];
                    tableSelectEl.innerHTML = '<option value="">请选择主表</option>' +
                        availableTables.map(t => `<option value="${t}">${t}</option>`).join('');
                } catch (err) {
                    tableSelectEl.innerHTML = '<option value="">加载失败</option>';
                    Toast.error('获取表列表失败');
                }
            });

            // 表选择 -> 加载字段列表
            tableSelectEl?.addEventListener('change', async (e) => {
                const tableName = e.target.value;
                const sourceId = sourceEl.value;

                if (!tableName || !sourceId) {
                    columnsSectionEl.style.display = 'none';
                    filtersSectionEl.style.display = 'none';
                    sortSectionEl.style.display = 'none';
                    joinsSectionEl.style.display = 'none';
                    return;
                }

                joinsSectionEl.style.display = 'block';
                columnsListEl.innerHTML = '<span class="text-secondary">加载中...</span>';
                columnsSectionEl.style.display = 'block';

                try {
                    const res = await LensApi.getSourceColumns(sourceId, tableName);
                    currentColumns = res.data || [];
                    this._refreshFieldList(overlay);
                } catch (err) {
                    columnsListEl.innerHTML = '<span class="text-danger">加载失败</span>';
                    Toast.error('获取字段列表失败');
                }
            });

            this._createJoinRow = (joinsListEl, sourceId, mainTable, availableTables, overlay, data = null) => {
                const joinRow = document.createElement('div');
                joinRow.className = 'lens-join-row mt-5 p-10 bg-tertiary border-radius-8';
                joinRow.style.cssText = 'border: 1px solid var(--border-color); margin-bottom: 15px; position: relative;';
                joinRow.innerHTML = `
                    <div class="flex-between mb-8">
                        <span style="font-size:12px; font-weight:600; color:var(--text-primary);">表关联配置</span>
                        <button class="lens-btn lens-btn-xs lens-btn-danger lens-remove-join" style="padding:0; width:22px; height:22px;">×</button>
                    </div>
                    <div class="flex gap-10 mb-8 align-center">
                        <select class="form-control form-control-sm lens-join-type" style="width:165px;">
                            <option value="LEFT JOIN">左关联</option>
                            <option value="JOIN">内关联</option>
                            <option value="RIGHT JOIN">右关联</option>
                        </select>
                        <select class="form-control form-control-sm lens-join-table" style="flex:1;">
                            <option value="">选择关联表</option>
                            ${availableTables.filter(t => t !== mainTable).map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="lens-join-condition-box flex gap-5 align-center bg-secondary p-5 border-radius-4">
                        <select class="form-control form-control-sm lens-join-on-left" style="flex:1; font-size:12px;">
                            <option value="">左字段</option>
                        </select>
                        <span style="font-weight:bold; color:var(--text-secondary);">=</span>
                        <select class="form-control form-control-sm lens-join-on-right" style="flex:1; font-size:12px;">
                            <option value="">右字段</option>
                        </select>
                    </div>
                `;
                joinsListEl.appendChild(joinRow);

                const jTypeSelect = joinRow.querySelector('.lens-join-type');
                const jTableSelect = joinRow.querySelector('.lens-join-table');
                const leftSelect = joinRow.querySelector('.lens-join-on-left');
                const rightSelect = joinRow.querySelector('.lens-join-on-right');

                // 绑定删除
                joinRow.querySelector('.lens-remove-join').addEventListener('click', () => {
                    joinRow.remove();
                    this._refreshFieldList(overlay);
                });

                // 绑定关联表加载逻辑
                const loadTableColumns = async (joinedTable, prefillLeft = null, prefillRight = null) => {
                    if (!joinedTable) {
                        leftSelect.innerHTML = '<option value="">左字段</option>';
                        rightSelect.innerHTML = '<option value="">右字段</option>';
                        return;
                    }
                    try {
                        const [mainColsRes, subColsRes] = await Promise.all([
                            LensApi.getSourceColumns(sourceId, mainTable),
                            LensApi.getSourceColumns(sourceId, joinedTable)
                        ]);

                        leftSelect.innerHTML = '<option value="">左字段</option>' +
                            (mainColsRes.data || []).map(c => `<option value="${mainTable}.${c.name}">${mainTable}.${c.name}</option>`).join('');
                        rightSelect.innerHTML = '<option value="">右字段</option>' +
                            (subColsRes.data || []).map(c => `<option value="${joinedTable}.${c.name}">${joinedTable}.${c.name}</option>`).join('');

                        if (prefillLeft) leftSelect.value = prefillLeft;
                        if (prefillRight) rightSelect.value = prefillRight;

                        this._refreshFieldList(overlay);
                    } catch (err) {
                        Config.error('加载关联表字段失败:', err);
                        Toast.error('获取关联表字段失败');
                    }
                };

                jTableSelect.addEventListener('change', (e) => loadTableColumns(e.target.value));

                // 如果有初始数据，进行回填
                if (data) {
                    jTypeSelect.value = data.type || 'LEFT JOIN';
                    jTableSelect.value = data.table || '';
                    if (data.on && data.on.includes('=')) {
                        const parts = data.on.split('=');
                        loadTableColumns(data.table, parts[0].trim(), parts[1].trim());
                    }
                }
            };

            this._refreshFieldList = async (overlay) => {
                const sourceId = sourceEl.value;
                const mainTable = tableSelectEl.value;
                if (!mainTable) return;

                const joins = [];
                overlay.querySelectorAll('.lens-join-row').forEach(row => {
                    const table = row.querySelector('.lens-join-table').value;
                    if (table) joins.push(table);
                });

                const colsGrid = overlay.querySelector('#lens-columns-list');
                const sortSelect = overlay.querySelector('#lens-sort-field');
                const filterSelects = overlay.querySelectorAll('.lens-filter-field');

                colsGrid.innerHTML = '<span class="text-secondary">加载字段中...</span>';

                try {
                    // 获取主表字段
                    let allFields = [];
                    const mainRes = await LensApi.getSourceColumns(sourceId, mainTable);
                    allFields = (mainRes.data || []).map(c => ({ ...c, origin: mainTable, fullName: `${mainTable}.${c.name}` }));

                    const joinPromises = joins.map(jt => LensApi.getSourceColumns(sourceId, jt).catch(err => {
                        Config.error(`加载关联表 ${jt} 字段失败:`, err);
                    }));

                    const joinResults = await Promise.all(joinPromises);
                    joinResults.forEach((subRes, index) => {
                        const jt = joins[index];
                        const subFields = (subRes.data || []).map(c => ({ ...c, origin: jt, fullName: `${jt}.${c.name}` }));
                        allFields = [...allFields, ...subFields];
                    });

                    // 按来源表分组
                    const groups = {};
                    allFields.forEach(f => {
                        if (!groups[f.origin]) groups[f.origin] = [];
                        groups[f.origin].push(f);
                    });

                    // 渲染分组后的 UI
                    colsGrid.innerHTML = Object.entries(groups).map(([table, fields]) => `
                        <div class="lens-field-group" data-table="${table}">
                            <div class="lens-field-group-title">
                                <div>
                                    <span>📦 表: ${table}</span>
                                    <span style="opacity:0.6; font-weight:normal; font-size:11px; margin-left:4px;">(${fields.length})</span>
                                </div>
                                <div class="flex gap-10 align-center">
                                    <a href="javascript:;" class="lens-group-select-all" style="color:var(--color-primary); font-size:11px; text-decoration:none;">全选</a>
                                    <span style="width:1px; height:10px; background:var(--border-color); opacity:0.5;"></span>
                                    <a href="javascript:;" class="lens-group-deselect-all" style="color:var(--text-secondary); font-size:11px; text-decoration:none;">清空</a>
                                </div>
                            </div>
                            <div class="lens-field-group-list">
                                ${fields.map(f => `
                                    <label class="lens-column-item-compact" title="${f.fullName}">
                                        <input type="checkbox" class="lens-col-checkbox" value="${f.fullName}" checked>
                                        <span class="lens-col-name">${f.name}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('');


                    // 绑定分组全选/取消全选事件
                    colsGrid.querySelectorAll('.lens-field-group').forEach(group => {
                        group.querySelector('.lens-group-select-all').addEventListener('click', (e) => {
                            e.preventDefault();
                            group.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = true);
                        });
                        group.querySelector('.lens-group-deselect-all').addEventListener('click', (e) => {
                            e.preventDefault();
                            group.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = false);
                        });
                    });

                    // 更新排序/筛选下拉框（保持当前选中值）
                    const updateSelect = (select, fields) => {
                        const currentVal = select.value;
                        select.innerHTML = '<option value="">请选择字段</option>' +
                            fields.map(f => `<option value="${f.fullName}" ${f.fullName === currentVal ? 'selected' : ''}>${f.fullName}</option>`).join('');
                    };
                    updateSelect(sortSelect, allFields);
                    filterSelects.forEach(s => updateSelect(s, allFields));

                    // 同步到类成员以供筛选条件添加时使用
                    currentColumns = allFields.map(f => ({ name: f.fullName, type: f.type }));

                    overlay.querySelector('#lens-columns-section').style.display = 'block';
                    overlay.querySelector('#lens-filters-section').style.display = 'block';
                    overlay.querySelector('#lens-sort-section').style.display = 'block';
                } catch (e) {
                    Config.error(e);
                }
            };

            // 全选/取消全选
            overlay.querySelector('#lens-select-all-cols')?.addEventListener('click', () => {
                columnsListEl.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = true);
            });
            overlay.querySelector('#lens-deselect-all-cols')?.addEventListener('click', () => {
                columnsListEl.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = false);
            });

            // 添加表关联
            overlay.querySelector('#lens-add-join')?.addEventListener('click', () => {
                const mainTable = tableSelectEl.value;
                if (!mainTable) {
                    Toast.error('请先选择主表');
                    return;
                }
                this._createJoinRow(joinsListEl, sourceEl.value, mainTable, availableTables, overlay);
            });

            // 全选按钮
            overlay.querySelector('#lens-select-all-cols')?.addEventListener('click', () => {
                overlay.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = true);
            });

            // 取消全选按钮
            overlay.querySelector('#lens-deselect-all-cols')?.addEventListener('click', () => {
                overlay.querySelectorAll('.lens-col-checkbox').forEach(cb => cb.checked = false);
            });

            // 添加筛选条件
            overlay.querySelector('#lens-add-filter')?.addEventListener('click', () => {
                const filterRow = document.createElement('div');
                filterRow.className = 'lens-filter-row flex gap-5 align-center mb-5';
                filterRow.innerHTML = `
                    <select class="form-control form-control-sm lens-filter-field" style="width:120px">
                        <option value="">选择字段</option>
                        ${currentColumns.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                    </select>
                    <select class="form-control form-control-sm lens-filter-op" style="width:100px">
                        <option value="=">=</option>
                        <option value="!=">≠</option>
                        <option value=">">></option>
                        <option value=">=">≥</option>
                        <option value="<"><</option>
                        <option value="<=">≤</option>
                        <option value="LIKE">包含</option>
                        <option value="IS NULL">为空</option>
                        <option value="IS NOT NULL">不为空</option>
                    </select>
                    <input type="text" class="form-control form-control-sm lens-filter-val" style="flex:1" placeholder="值">
                    <button class="lens-btn lens-btn-xs lens-btn-danger lens-remove-filter">×</button>
                `;
                filtersListEl.appendChild(filterRow);

                filterRow.querySelector('.lens-remove-filter').addEventListener('click', () => {
                    filterRow.remove();
                });
            });

            // 预览按钮
            previewBtn?.addEventListener('click', () => this._previewViewQuery());

            // 高级配置折叠切换
            if (advancedToggle) {
                const section = advancedToggle.closest('.lens-collapsible');
                advancedToggle.addEventListener('click', () => {
                    section.classList.toggle('expanded');
                });
            }

            // 管理数据源链接
            overlay.querySelector('.lens-manage-sources-btn')?.addEventListener('click', () => {
                Modal.closeAll();
                setTimeout(() => this._showSourceManager(), 100);
            });

            // 如果是编辑模式且有表查询配置，预填充主表、字段和关联表
            if (view?.query_type === 'table' && view?.query_config?.table && view?.datasource_id) {
                // 触发数据源选择事件以加载表
                setTimeout(async () => {
                    const event = new Event('change');
                    sourceEl.dispatchEvent(event);

                    // 等待表加载完成后选择主表并加载字段
                    setTimeout(() => {
                        tableSelectEl.value = view.query_config.table;
                        tableSelectEl.dispatchEvent(new Event('change'));

                        // 回填关联表
                        const joins = view.query_config.joins || [];
                        joins.forEach(j => {
                            this._createJoinRow(joinsListEl, sourceEl.value, view.query_config.table, availableTables, overlay, j);
                        });

                        // 等待主表字段加载后，勾选中的字段（这部分原本就有逻辑，或者在 tableSelectEl change 中处理）
                        // 如果字段是带表名的，这里可能需要特殊处理
                    }, 500);
                }, 100);
            }

        }).catch(e => {
            Toast.error('获取数据源列表失败');
        });
    },

    async _previewViewQuery() {
        const sourceId = document.getElementById('lens-view-source')?.value;
        const isSimpleMode = document.querySelector('input[name="lens-query-mode"]:checked')?.value === 'simple';

        const resultContainer = document.getElementById('lens-preview-container');
        const errorContainer = document.getElementById('lens-preview-error');
        const tableEl = document.getElementById('lens-preview-table');

        // 重置 UI
        resultContainer.style.display = 'none';
        errorContainer.style.display = 'none';

        if (!sourceId) {
            Toast.error('请选择数据源');
            return;
        }

        let queryType, queryConfig;

        if (isSimpleMode) {
            // 简单模式：从可视化配置构建查询
            const tableName = document.getElementById('lens-view-table-select')?.value;
            if (!tableName) {
                Toast.error('请选择数据表');
                return;
            }

            // 获取选中的字段
            const selectedColumns = Array.from(
                document.querySelectorAll('.lens-col-checkbox:checked')
            ).map(cb => cb.value);

            if (selectedColumns.length === 0) {
                Toast.error('请至少选择一个字段');
                return;
            }

            // 构建 WHERE 条件
            const filters = [];
            document.querySelectorAll('.lens-filter-row').forEach(row => {
                const field = row.querySelector('.lens-filter-field')?.value;
                const op = row.querySelector('.lens-filter-op')?.value;
                const val = row.querySelector('.lens-filter-val')?.value;
                if (field && op) {
                    if (op === 'IS NULL' || op === 'IS NOT NULL') {
                        filters.push(`${field} ${op}`);
                    } else if (op === 'LIKE') {
                        filters.push(`${field} LIKE '%${val}%'`);
                    } else {
                        filters.push(`${field} ${op} '${val}'`);
                    }
                }
            });

            // 构建排序
            const sortField = document.getElementById('lens-sort-field')?.value;
            const sortDir = document.getElementById('lens-sort-dir')?.value || 'ASC';

            // 构建 SQL
            const joins = [];
            document.querySelectorAll('.lens-join-row').forEach(row => {
                const jType = row.querySelector('.lens-join-type')?.value;
                const jTable = row.querySelector('.lens-join-table')?.value;
                const onLeft = row.querySelector('.lens-join-on-left')?.value;
                const onRight = row.querySelector('.lens-join-on-right')?.value;
                if (jTable && onLeft && onRight) {
                    joins.push({ type: jType, table: jTable, on: `${onLeft} = ${onRight}` });
                }
            });

            // 如果有 JOIN，我们需要确保主表的字段带上表名前缀
            const mainTableName = tableName;
            const columnsWithTable = selectedColumns.map(col => {
                if (col.includes('.')) return col;
                return `${mainTableName}.${col}`;
            });

            let sql = `SELECT ${columnsWithTable.join(', ')} FROM ${mainTableName}`;
            joins.forEach(j => {
                sql += ` ${j.type} ${j.table} ON ${j.on}`;
            });

            if (filters.length > 0) {
                sql += ` WHERE ${filters.join(' AND ')}`;
            }
            if (sortField) {
                const sortFieldWithTable = sortField.includes('.') ? sortField : `${mainTableName}.${sortField}`;
                sql += ` ORDER BY ${sortFieldWithTable} ${sortDir}`;
            }

            queryType = 'table';
            queryConfig = {
                sql, // 预览依然需要构建好的 SQL
                table: mainTableName,
                columns: columnsWithTable,
                joins: joins
            };
        } else {
            // 高级模式：直接使用 SQL
            const sql = document.getElementById('lens-view-sql')?.value?.trim();
            if (!sql) {
                Toast.error('请输入 SQL 语句');
                return;
            }
            queryType = 'sql';
            queryConfig = { sql };
        }

        const btn = document.getElementById('lens-preview-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner"></span> 执行中...';
        btn.disabled = true;

        try {
            const res = await LensApi.executePreview({
                datasource_id: parseInt(sourceId),
                query_type: queryType,
                query_config: queryConfig
            });

            if (res.code === 200 && res.data) {
                const { columns, data } = res.data;

                // 渲染头部
                const thead = tableEl.querySelector('thead');
                thead.innerHTML = '<tr>' +
                    columns.map(col => '<th>' + (col.title || '') + '</th>').join('') +
                    '</tr>';

                // 渲染主体
                const tbody = tableEl.querySelector('tbody');
                tbody.innerHTML = data.map(row =>
                    '<tr>' +
                    columns.map(col => '<td>' + (row[col.field] !== null ? row[col.field] : '') + '</td>').join('') +
                    '</tr>'
                ).join('');

                resultContainer.style.display = 'block';
            } else {
                errorContainer.innerText = res.message || '预览执行失败';
                errorContainer.style.display = 'block';
            }
        } catch (e) {
            errorContainer.innerText = '执行出错: ' + (e.message || '未知错误');
            errorContainer.style.display = 'block';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async _saveView(viewId = null) {
        const nameEl = document.getElementById('lens-view-name');
        const sourceEl = document.getElementById('lens-view-source');
        const tableEl = document.getElementById('lens-view-table-select');
        const sqlEl = document.getElementById('lens-view-sql');

        const name = nameEl?.value?.trim();
        const icon = document.getElementById('lens-view-icon')?.value?.trim() || '📊';
        const categoryId = document.getElementById('lens-view-category')?.value;
        const description = document.getElementById('lens-view-desc')?.value?.trim();
        const datasourceId = sourceEl?.value;
        const isPublic = document.getElementById('lens-view-public')?.checked;
        const queryMode = document.querySelector('input[name="lens-query-mode"]:checked')?.value || 'simple';
        const imageBasePath = document.getElementById('lens-image-base-path')?.value?.trim();

        // 辅助方法：高亮错误字段
        const highlightError = (el) => {
            if (!el) return;
            el.style.borderColor = 'var(--color-danger)';
            el.focus();
            setTimeout(() => {
                el.style.borderColor = '';
            }, 3000);
        };

        // 验证基本字段
        if (!name) {
            Toast.error('请输入视图名称');
            highlightError(nameEl);
            return false;
        }
        if (!datasourceId) {
            Toast.error('请选择数据源');
            highlightError(sourceEl);
            return false;
        }

        let queryType, queryConfig;

        if (queryMode === 'simple') {
            // 简单模式：从可视化配置构建查询
            const tableName = tableEl?.value;
            if (!tableName) {
                Toast.error('请选择数据表');
                highlightError(tableEl);
                return false;
            }

            // 获取选中的字段
            const selectedColumns = Array.from(
                document.querySelectorAll('.lens-col-checkbox:checked')
            ).map(cb => cb.value);

            if (selectedColumns.length === 0) {
                Toast.error('请至少选择一个字段');
                const colSection = document.getElementById('lens-columns-list');
                if (colSection) colSection.style.border = '1px solid var(--color-danger)';
                setTimeout(() => { if (colSection) colSection.style.border = ''; }, 3000);
                return false;
            }

            // 构建 WHERE 条件
            const filters = [];
            document.querySelectorAll('.lens-filter-row').forEach(row => {
                const field = row.querySelector('.lens-filter-field')?.value;
                const op = row.querySelector('.lens-filter-op')?.value;
                const val = row.querySelector('.lens-filter-val')?.value;
                if (field && op) {
                    if (op === 'IS NULL' || op === 'IS NOT NULL') {
                        filters.push(`${field} ${op}`);
                    } else if (op === 'LIKE') {
                        filters.push(`${field} LIKE '%${val}%'`);
                    } else if (val !== '') {
                        filters.push(`${field} ${op} '${val}'`);
                    }
                }
            });

            // 构建排序
            const sortField = document.getElementById('lens-sort-field')?.value;
            const sortDir = document.getElementById('lens-sort-dir')?.value || 'ASC';

            // 构建关联
            const joins = [];
            document.querySelectorAll('.lens-join-row').forEach(row => {
                const jType = row.querySelector('.lens-join-type')?.value;
                const jTable = row.querySelector('.lens-join-table')?.value;
                const onLeft = row.querySelector('.lens-join-on-left')?.value;
                const onRight = row.querySelector('.lens-join-on-right')?.value;
                if (jTable && onLeft && onRight) {
                    joins.push({ type: jType, table: jTable, on: `${onLeft} = ${onRight}` });
                }
            });

            const mainTableName = tableName;
            const columnsWithTable = selectedColumns.map(col => {
                if (col.includes('.')) return col;
                return `${mainTableName}.${col}`;
            });

            let sql = `SELECT ${columnsWithTable.join(', ')} FROM ${mainTableName}`;
            joins.forEach(j => {
                sql += ` ${j.type} ${j.table} ON ${j.on}`;
            });

            if (filters.length > 0) {
                sql += ` WHERE ${filters.join(' AND ')}`;
            }
            if (sortField) {
                const sortFieldWithTable = sortField.includes('.') ? sortField : `${mainTableName}.${sortField}`;
                sql += ` ORDER BY ${sortFieldWithTable} ${sortDir}`;
            }

            queryType = 'table';
            queryConfig = {
                sql: sql,
                table: mainTableName,
                columns: columnsWithTable,
                joins: joins,
                filters: filters,
                where: filters.join(' AND '),
                sort_field: sortField,
                sort_dir: sortDir
            };

        } else {
            // 高级模式
            const sql = sqlEl?.value?.trim();
            if (!sql) {
                Toast.error('请输入 SQL 语句');
                highlightError(sqlEl);
                return false;
            }
            queryType = 'sql';
            queryConfig = { sql };
        }

        // 解析高级配置
        let displayConfig = null;
        let statusConfig = null;
        let chartConfig = null;

        try {
            const displayStr = document.getElementById('lens-view-display-config')?.value?.trim();
            displayConfig = this._safeJsonParse(displayStr, '显示配置');

            const statusStr = document.getElementById('lens-view-status-config')?.value?.trim();
            statusConfig = this._safeJsonParse(statusStr, '单元格状态配置');

            const chartStr = document.getElementById('lens-view-chart-config')?.value?.trim();
            chartConfig = this._safeJsonParse(chartStr, '图表配置');
        } catch (e) {
            // _safeJsonParse 已弹出 Toast 并抛出异常
            return false;
        }

        // 构造提交数据
        const data = {
            name: name,
            icon: icon,
            category_id: categoryId ? parseInt(categoryId) : null,
            description: description,
            datasource_id: parseInt(datasourceId),
            query_type: queryType,
            query_config: queryConfig,
            display_config: {
                ...(displayConfig || {}),
                image_base_path: imageBasePath // 存入 display_config 中
            },
            status_config: statusConfig,
            chart_config: chartConfig,
            is_public: isPublic
        };

        try {
            if (viewId) {
                await LensApi.updateView(viewId, data);
                Toast.success('视图更新成功');
            } else {
                await LensApi.createView(data);
                Toast.success('视图创建成功');
            }
            Modal.closeAll();
            this._loadHubData();
        } catch (e) {
            Toast.error(e.message || '操作失败');
        }
        return false;
    },

    async _editView(viewId) {
        try {
            const res = await LensApi.getView(viewId);
            if (res.code === 200) {
                this._showViewEditor(res.data);
            } else {
                Toast.error('获取视图信息失败');
            }
        } catch (e) {
            Toast.error(e.message || '获取视图信息失败');
        }
    },

    async _deleteView(viewId) {
        if (!confirm('确定要删除该视图吗？此操作不可恢复。')) {
            return;
        }

        try {
            await LensApi.deleteView(viewId);
            Toast.success('视图删除成功');
            this._loadHubData();
        } catch (e) {
            Toast.error(e.message || '删除失败');
        }
    },

    async _showSourceManager() {
        // 加载数据源列表并显示管理弹窗
        LensApi.getSources().then(res => {
            const sources = res.data || [];

            const modalContent = `
                <div class="lens-source-manager">
                    <div class="lens-source-toolbar" style="margin-bottom: 16px;">
                        <button class="lens-btn lens-btn-primary" id="lens-add-source-btn">
                            ➕ 添加数据源
                        </button>
                    </div>
                    <div class="lens-source-list" id="lens-source-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                        ${sources.length === 0 ? `
                            <div class="lens-empty" style="grid-column: 1 / -1; padding: 40px;">
                                <span class="lens-empty-icon" style="font-size: 48px;">🔌</span>
                                <span class="lens-empty-text">暂无数据源，点击上方按钮添加</span>
                            </div>
                        ` : sources.map(s => `
                            <div class="lens-source-item" data-id="${s.id}" style="
                                display: flex; 
                                align-items: center; 
                                padding: 16px; 
                                border: 1px solid var(--border-color); 
                                border-radius: 8px; 
                                background: var(--bg-secondary);
                            ">
                                <div class="lens-source-icon" style="
                                    width: 40px; 
                                    height: 40px; 
                                    border-radius: 8px; 
                                    background: rgba(var(--color-primary-rgb), 0.1); 
                                    display: flex; 
                                    align-items: center; 
                                    justify-content: center; 
                                    font-size: 20px; 
                                    margin-right: 12px;
                                ">${this._getSourceTypeIcon(s.type)}</div>
                                <div class="lens-source-info" style="flex: 1; min-width: 0;">
                                    <div class="lens-source-name" style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${s.name}</div>
                                    <div class="lens-source-type" style="font-size: 12px; color: var(--text-muted);">${this._getSourceTypeName(s.type)}</div>
                                </div>
                                <div class="lens-source-status ${s.is_active ? 'active' : 'inactive'}" style="font-size: 11px; margin-right: 12px;">
                                    ${s.is_active ? '🟢' : '🔴'}
                                </div>
                                <div class="lens-source-actions" style="display: flex; gap: 4px;">
                                    <button class="lens-btn lens-btn-xs lens-test-source-btn" data-id="${s.id}" title="测试连接">🔌</button>
                                    <button class="lens-btn lens-btn-xs lens-edit-source-btn" data-id="${s.id}" title="编辑">✏️</button>
                                    <button class="lens-btn lens-btn-xs lens-btn-danger lens-delete-source-btn" data-id="${s.id}" title="删除">🗑️</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            const modal = Modal.show({
                title: '数据源管理',
                content: modalContent,
                width: '1100px', // 进一步加宽弹窗
                footer: false
            });

            // 使用 modal.overlay 确保只绑定在当前弹窗内的元素上
            const overlay = modal.overlay;
            if (!overlay) return;

            overlay.querySelector('#lens-add-source-btn')?.addEventListener('click', () => {
                Modal.closeAll();
                setTimeout(() => this._showSourceEditor(), 100);
            });

            overlay.querySelectorAll('.lens-edit-source-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    Modal.closeAll();
                    setTimeout(() => this._showSourceEditor(id), 100);
                });
            });

            overlay.querySelectorAll('.lens-delete-source-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.target.dataset.id);
                    this._deleteSource(id);
                });
            });

            overlay.querySelectorAll('.lens-test-source-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id);
                    const source = sources.find(s => s.id === id);
                    if (source) {
                        const target = e.target;
                        target.disabled = true;
                        target.textContent = '测试中...';
                        try {
                            const res = await LensApi.getSource(id);
                            const config = {
                                type: res.data.type,
                                connection_config: res.data.connection_config,
                                file_config: res.data.file_config,
                                api_config: res.data.api_config
                            };
                            const testRes = await LensApi.testSource(config);
                            if (testRes.code === 200) {
                                Toast.success(testRes.message || '连接成功');
                            } else {
                                Toast.error(testRes.message || '连接失败');
                            }
                        } catch (error) {
                            Toast.error(error.message || '测试失败');
                        } finally {
                            target.disabled = false;
                            target.textContent = '测试';
                        }
                    }
                });
            });
        }).catch(e => {
            Toast.error('获取数据源列表失败');
        });
    },

    async _deleteSource(id) {
        if (!confirm('确定要删除该数据源吗？关联的视图将无法正常工作。')) {
            return;
        }

        try {
            await LensApi.deleteSource(id);
            Toast.success('数据源删除成功');
            Modal.close();
            setTimeout(() => this._showSourceManager(), 100);
        } catch (e) {
            Toast.error(e.message || '删除失败');
        }
    },

    _showSourceEditor(sourceId = null) {
        const isEdit = !!sourceId;

        const loadAndShow = async () => {
            let source = null;
            if (sourceId) {
                try {
                    const res = await LensApi.getSource(sourceId);
                    source = res.data;
                } catch (e) {
                    Toast.error('获取数据源信息失败');
                    return;
                }
            }

            const modalContent = `
    <div class="lens-editor">
                    <div class="lens-editor-section">
                        <h4>基本信息</h4>
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <div class="form-group" style="flex: 2;">
                                <label style="margin-bottom: 4px;">数据源名称 <span class="required">*</span></label>
                                <input type="text" id="lens-source-name" class="form-control" 
                                       value="${source?.name || ''}" placeholder="输入数据源名称">
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label style="margin-bottom: 4px;">类型 <span class="required">*</span></label>
                                <select id="lens-source-type" class="form-control" ${isEdit ? 'disabled' : ''}>
                                    <option value="">请选择</option>
                                    <option value="mysql" ${source?.type === 'mysql' ? 'selected' : ''}>🐬 MySQL</option>
                                    <option value="postgres" ${source?.type === 'postgres' ? 'selected' : ''}>🐘 PostgreSQL</option>
                                    <option value="sqlserver" ${source?.type === 'sqlserver' ? 'selected' : ''}>🏢 SQL Server</option>
                                    <option value="oracle" ${source?.type === 'oracle' ? 'selected' : ''}>🔶 Oracle</option>
                                    <option value="sqlite" ${source?.type === 'sqlite' ? 'selected' : ''}>📁 SQLite</option>
                                    <option value="csv" ${source?.type === 'csv' ? 'selected' : ''}>📄 CSV 文件</option>
                                    <option value="excel" ${source?.type === 'excel' ? 'selected' : ''}>📊 Excel 文件</option>
                                    <option value="api" ${source?.type === 'api' ? 'selected' : ''}>🌐 API 接口</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 4px;">描述</label>
                            <input type="text" id="lens-source-desc" class="form-control" 
                                   value="${source?.description || ''}" placeholder="数据源描述（可选）">
                        </div>
                    </div>

                    <!--数据库配置 -->
                    <div class="lens-editor-section lens-db-config" style="display:none;">
                        <h4>数据库连接</h4>
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <div class="form-group" style="flex: 3;">
                                <label style="margin-bottom: 4px;">主机地址</label>
                                <input type="text" id="lens-source-host" class="form-control" 
                                       value="${source?.connection_config?.host || 'localhost'}" placeholder="localhost">
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label style="margin-bottom: 4px;">端口</label>
                                <input type="number" id="lens-source-port" class="form-control" 
                                       value="${source?.connection_config?.port || ''}" placeholder="3306">
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 0;">
                            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                                <label style="margin-bottom: 4px;">用户名</label>
                                <input type="text" id="lens-source-user" class="form-control" 
                                       value="${source?.connection_config?.user || ''}" placeholder="root">
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                                <label style="margin-bottom: 4px;">密码</label>
                                <input type="password" id="lens-source-password" class="form-control" 
                                       placeholder="数据库密码">
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                                <label style="margin-bottom: 4px;">数据库名</label>
                                <input type="text" id="lens-source-database" class="form-control" 
                                       value="${source?.connection_config?.database || ''}" placeholder="database_name">
                            </div>
                        </div>
                    </div>

                    <!--Oracle 专用配置 -->
                    <div class="lens-editor-section lens-oracle-config" style="display:none;">
                        <h4>Oracle 连接</h4>
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <div class="form-group" style="flex: 3;">
                                <label style="margin-bottom: 4px;">主机地址</label>
                                <input type="text" id="lens-source-oracle-host" class="form-control" 
                                       value="${source?.connection_config?.host || 'localhost'}" placeholder="localhost">
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label style="margin-bottom: 4px;">端口</label>
                                <input type="number" id="lens-source-oracle-port" class="form-control" 
                                       value="${source?.connection_config?.port || '1521'}" placeholder="1521">
                            </div>
                            <div class="form-group" style="flex: 2;">
                                <label style="margin-bottom: 4px;">服务名</label>
                                <input type="text" id="lens-source-service-name" class="form-control" 
                                       value="${source?.connection_config?.service_name || ''}" placeholder="ORCL">
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 0;">
                            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                                <label style="margin-bottom: 4px;">用户名</label>
                                <input type="text" id="lens-source-oracle-user" class="form-control" 
                                       value="${source?.connection_config?.user || ''}" placeholder="用户名">
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                                <label style="margin-bottom: 4px;">密码</label>
                                <input type="password" id="lens-source-oracle-password" class="form-control" 
                                       placeholder="密码">
                            </div>
                        </div>
                    </div>

                    <!--文件配置 -->
                    <div class="lens-editor-section lens-file-config" style="display:none;">
                        <h4>文件设置</h4>
                        <div class="form-group">
                            <label>文件路径</label>
                            <input type="text" id="lens-source-filepath" class="form-control" 
                                   value="${source?.file_config?.file_path || ''}" placeholder="storage/lens/example.csv">
                            <small class="form-hint">支持 CSV、Excel 文件，可手动输入路径或上传文件</small>
                        </div>
                        <div class="form-group" id="lens-excel-sheet" style="display:none;">
                            <label>工作表名称</label>
                            <input type="text" id="lens-source-sheet" class="form-control" 
                                   value="${source?.file_config?.sheet_name || ''}" placeholder="Sheet1（留空使用第一个工作表）">
                        </div>
                        <div class="form-group">
                            <label>编码</label>
                            <select id="lens-source-encoding" class="form-control">
                                <option value="utf-8" ${source?.file_config?.encoding === 'utf-8' || !source?.file_config?.encoding ? 'selected' : ''}>UTF-8</option>
                                <option value="gbk" ${source?.file_config?.encoding === 'gbk' ? 'selected' : ''}>GBK (中文)</option>
                                <option value="gb2312" ${source?.file_config?.encoding === 'gb2312' ? 'selected' : ''}>GB2312</option>
                            </select>
                        </div>
                    </div>

                    <!-- API 配置 -->
                    <div class="lens-editor-section lens-api-config" style="display:none;">
                        <h4>API 设置</h4>
                        <div class="form-group">
                            <label>API URL <span class="required">*</span></label>
                            <input type="text" id="lens-source-api-url" class="form-control" 
                                   value="${source?.api_config?.url || ''}" placeholder="https://api.example.com/data">
                        </div>
                        <div class="form-group">
                            <label>请求方法</label>
                            <select id="lens-source-api-method" class="form-control">
                                <option value="GET" ${source?.api_config?.method === 'GET' || !source?.api_config?.method ? 'selected' : ''}>GET</option>
                                <option value="POST" ${source?.api_config?.method === 'POST' ? 'selected' : ''}>POST</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>请求头 (JSON 格式)</label>
                            <textarea id="lens-source-api-headers" class="form-control" rows="3" 
                                      placeholder='{"Authorization": "Bearer xxx"}'>${source?.api_config?.headers ? JSON.stringify(source.api_config.headers, null, 2) : ''}</textarea>
                        </div>
                    </div>

                    <!-- SQLite 配置 -->
    <div class="lens-editor-section lens-sqlite-config" style="display:none;">
        <h4>SQLite 文件</h4>
        <div class="form-group">
            <label>数据库文件路径</label>
            <input type="text" id="lens-source-sqlite-path" class="form-control"
                value="${source?.connection_config?.file_path || ''}" placeholder="storage/lens/database.db">
        </div>
    </div>
                </div>
    `;

            const modal = Modal.show({
                title: isEdit ? '编辑数据源' : '添加数据源',
                content: modalContent,
                width: '1000px',
                confirmText: isEdit ? '保存' : '创建',
                onConfirm: () => this._saveSource(sourceId),
                onCancel: () => { setTimeout(() => this._showSourceManager(), 100); }
            });

            const overlay = modal.overlay;
            if (!overlay) return;

            // 绑定类型切换
            const typeEl = overlay.querySelector('#lens-source-type');
            const showConfigForType = (type) => {
                overlay.querySelectorAll('.lens-db-config, .lens-oracle-config, .lens-file-config, .lens-api-config, .lens-sqlite-config')
                    .forEach(el => el.style.display = 'none');

                if (['mysql', 'postgres', 'sqlserver'].includes(type)) {
                    overlay.querySelector('.lens-db-config').style.display = 'block';
                    const portEl = overlay.querySelector('#lens-source-port');
                    if (portEl && !portEl.value) {
                        portEl.value = type === 'mysql' ? 3306 : type === 'postgres' ? 5432 : 1433;
                    }
                } else if (type === 'oracle') {
                    // 使用 setTimeout 确保 DOM 彻底加载渲染后再操作
                    setTimeout(() => {
                        const oracleBlock = overlay.querySelector('.lens-oracle-config');
                        if (oracleBlock) {
                            oracleBlock.style.display = 'block';
                            oracleBlock.classList.add('animate-block-in'); // 添加个简单的动画类
                            const oraclePortEl = overlay.querySelector('#lens-source-oracle-port');
                            if (oraclePortEl && !oraclePortEl.value) {
                                oraclePortEl.value = '1521';
                            }
                        }
                    }, 0);
                } else if (type === 'sqlite') {
                    overlay.querySelector('.lens-sqlite-config').style.display = 'block';
                } else if (['csv', 'excel'].includes(type)) {
                    overlay.querySelector('.lens-file-config').style.display = 'block';
                    if (type === 'excel') {
                        overlay.querySelector('#lens-excel-sheet').style.display = 'block';
                    } else {
                        overlay.querySelector('#lens-excel-sheet').style.display = 'none';
                    }
                } else if (type === 'api') {
                    overlay.querySelector('.lens-api-config').style.display = 'block';
                }
            };

            typeEl?.addEventListener('change', (e) => showConfigForType(e.target.value));

            // 初始化显示
            if (source?.type) {
                showConfigForType(source.type);
            }
        };

        loadAndShow();
    },

    async _testSourceConnection() {
        const type = document.getElementById('lens-source-type')?.value;
        if (!type) {
            Toast.error('请先选择数据源类型');
            return;
        }

        const config = this._buildSourceConfig(type);

        try {
            Toast.info('正在测试连接...');
            const res = await LensApi.testSource({
                type,
                ...config
            });

            if (res.code === 200) {
                Toast.success(res.message || '连接成功');
            } else {
                Toast.error(res.message || '连接失败');
            }
        } catch (e) {
            Toast.error(e.message || '测试失败');
        }
    },

    _buildSourceConfig(type) {
        const config = {};

        if (['mysql', 'postgres', 'sqlserver'].includes(type)) {
            config.connection_config = {
                host: document.getElementById('lens-source-host')?.value || 'localhost',
                port: parseInt(document.getElementById('lens-source-port')?.value) || 3306,
                user: document.getElementById('lens-source-user')?.value || '',
                password: document.getElementById('lens-source-password')?.value || '',
                database: document.getElementById('lens-source-database')?.value || ''
            };
        } else if (type === 'oracle') {
            config.connection_config = {
                host: document.getElementById('lens-source-oracle-host')?.value || 'localhost',
                port: parseInt(document.getElementById('lens-source-oracle-port')?.value) || 1521,
                service_name: document.getElementById('lens-source-service-name')?.value || '',
                user: document.getElementById('lens-source-oracle-user')?.value || '',
                password: document.getElementById('lens-source-oracle-password')?.value || ''
            };
        } else if (type === 'sqlite') {
            config.connection_config = {
                file_path: document.getElementById('lens-source-sqlite-path')?.value || ''
            };
        } else if (['csv', 'excel'].includes(type)) {
            config.file_config = {
                file_path: document.getElementById('lens-source-filepath')?.value || '',
                encoding: document.getElementById('lens-source-encoding')?.value || 'utf-8'
            };
            if (type === 'excel') {
                config.file_config.sheet_name = document.getElementById('lens-source-sheet')?.value || null;
            }
        } else if (type === 'api') {
            let headers = {};
            const headersStr = document.getElementById('lens-source-api-headers')?.value?.trim();
            if (headersStr) {
                try {
                    headers = this._safeJsonParse(headersStr, 'Headers 配置');
                } catch (e) {
                    // 如果解析失败，_safeJsonParse 会报错，这里可以选择是否中断
                    // 考虑到 Headers 可能很重要，一般建议中断或给出信息
                    return null;
                }
            }
            config.api_config = {
                url: document.getElementById('lens-source-api-url')?.value || '',
                method: document.getElementById('lens-source-api-method')?.value || 'GET',
                headers
            };
        }

        return config;
    },

    async _saveSource(sourceId = null) {
        const name = document.getElementById('lens-source-name')?.value?.trim();
        const type = document.getElementById('lens-source-type')?.value;
        const description = document.getElementById('lens-source-desc')?.value?.trim();

        if (!name) {
            Toast.error('请输入数据源名称');
            return;
        }
        if (!type) {
            Toast.error('请选择数据源类型');
            return;
        }

        const config = this._buildSourceConfig(type);
        const data = {
            name,
            type,
            description,
            ...config
        };

        try {
            if (sourceId) {
                await LensApi.updateSource(sourceId, data);
                Toast.success('数据源更新成功');
            } else {
                await LensApi.createSource(data);
                Toast.success('数据源创建成功');
            }
            Modal.closeAll();
            setTimeout(() => this._showSourceManager(), 100);
        } catch (e) {
            Toast.error(e.message || '操作失败');
        }
    },

    _getSourceTypeIcon(type) {
        const icons = {
            mysql: '🐬',
            postgres: '🐘',
            sqlserver: '🏢',
            oracle: '🔶',
            sqlite: '📁',
            csv: '📄',
            excel: '📊',
            api: '🌐'
        };
        return icons[type] || '🔌';
    },

    _getSourceTypeName(type) {
        const names = {
            mysql: 'MySQL',
            postgres: 'PostgreSQL',
            sqlserver: 'SQL Server',
            oracle: 'Oracle',
            sqlite: 'SQLite',
            csv: 'CSV 文件',
            excel: 'Excel 文件',
            api: 'API 接口'
        };
        return names[type] || type;
    },

    _showCategoryManager() {
        const { categories } = this.state;

        const modalContent = `
            <div class="lens-source-manager">
                <div class="lens-source-toolbar" style="margin-bottom: 20px;">
                    <button class="lens-btn lens-btn-primary" id="lens-add-category-btn">
                        ➕ 添加分类
                    </button>
                </div>
                <!-- 参考数据源管理的网格布局 -->
                <div class="lens-source-list" id="lens-category-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
                    ${categories.length === 0 ? `
                        <div class="lens-empty" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                            <span class="lens-empty-icon" style="font-size: 48px;">📂</span>
                            <span class="lens-empty-text">暂无分类数据</span>
                        </div>
                    ` : categories.map(cat => `
                        <div class="lens-category-item" data-id="${cat.id}" style="
                            display: flex; 
                            align-items: center; 
                            padding: 16px; 
                            border: 1px solid var(--border-color); 
                            border-radius: 10px; 
                            background: var(--bg-secondary);
                            transition: all 0.2s;
                        ">
                            <div class="lens-category-icon-box" style="
                                width: 44px; 
                                height: 44px; 
                                border-radius: 8px; 
                                background: rgba(var(--color-primary-rgb), 0.1); 
                                display: flex; 
                                align-items: center; 
                                justify-content: center; 
                                font-size: 24px; 
                                margin-right: 14px;
                                flex-shrink: 0;
                            ">${cat.icon}</div>
                            
                            <div class="lens-category-info" style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 15px; margin-bottom: 2px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cat.name}</div>
                                <div style="font-size: 12px; color: var(--text-muted);">${cat.view_count || 0} 个视图资源</div>
                            </div>

                            <div class="lens-category-actions" style="display: flex; gap: 6px; margin-left: 12px;">
                                <button class="lens-btn lens-btn-xs lens-edit-category-btn" data-id="${cat.id}" title="编辑" style="padding: 4px 8px;">✏️</button>
                                <button class="lens-btn lens-btn-xs lens-btn-danger lens-delete-category-btn" data-id="${cat.id}" title="删除" style="padding: 4px 8px;">🗑️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const modal = Modal.show({
            title: '分类管理',
            content: modalContent,
            width: '1100px', // 对齐数据源管理宽度
            footer: false
        });

        const overlay = modal.overlay;
        if (!overlay) return;

        overlay.querySelector('#lens-add-category-btn')?.addEventListener('click', () => {
            Modal.closeAll();
            setTimeout(() => this._showCategoryEditor(), 100);
        });

        overlay.querySelectorAll('.lens-edit-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const cat = categories.find(c => c.id === id);
                if (cat) {
                    Modal.closeAll();
                    setTimeout(() => this._showCategoryEditor(cat), 100);
                }
            });
        });

        overlay.querySelectorAll('.lens-delete-category-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                if (confirm('确定要删除该分类吗？分类下的视图将变为未分类。')) {
                    try {
                        await LensApi.deleteCategory(id);
                        Toast.success('分类删除成功');
                        Modal.close();
                        this._loadHubData();
                        setTimeout(() => this._showCategoryManager(), 100);
                    } catch (error) {
                        Toast.error(error.message || '删除失败');
                    }
                }
            });
        });
    },

    _showCategoryEditor(category = null) {
        const isEdit = !!category;

        const modalContent = `
            <div class="lens-editor">
                <div class="lens-editor-section">
                    <div class="form-group">
                        <label>分类图标</label>
                        ${this._renderIconPicker(category?.icon || '📂', 'lens-category-icon')}
                    </div>
                    <div class="form-group">
                        <label>分类名称 <span class="required">*</span></label>
                        <input type="text" id="lens-category-name" class="form-control" 
                            value="${category?.name || ''}" placeholder="输入分类名称">
                    </div>
                    <div class="form-group">
                        <label>排序权重</label>
                        <input type="number" id="lens-category-order" class="form-control" 
                            value="${category?.order || 0}" placeholder="数字越小越靠前" min="0">
                    </div>
                </div>
            </div>
        `;

        const modal = Modal.show({
            title: isEdit ? '编辑分类' : '添加分类',
            content: modalContent,
            width: '450px',
            confirmText: isEdit ? '保存' : '创建',
            onConfirm: () => this._saveCategory(category?.id),
            onCancel: () => { setTimeout(() => this._showCategoryManager(), 100); }
        });

        if (modal.overlay) {
            this._initIconPicker(modal.overlay, 'lens-category-icon');
        }
    },

    async _saveCategory(categoryId = null) {
        const name = document.getElementById('lens-category-name')?.value?.trim();
        const icon = document.getElementById('lens-category-icon')?.value?.trim() || '📂';
        const order = parseInt(document.getElementById('lens-category-order')?.value) || 0;

        if (!name) {
            Toast.error('请输入分类名称');
            return;
        }

        const data = { name, icon, order };

        try {
            if (categoryId) {
                await LensApi.updateCategory(categoryId, data);
                Toast.success('分类更新成功');
            } else {
                await LensApi.createCategory(data);
                Toast.success('分类创建成功');
            }
            Modal.closeAll();
            this._loadHubData();
            setTimeout(() => this._showCategoryManager(), 100);
        } catch (e) {
            Toast.error(e.message || '操作失败');
        }
        return false;
    }
};

// 混入到 DataLensPage
if (typeof DataLensPage !== 'undefined') {
    Object.assign(DataLensPage.prototype, DataLensEditorMixin);
}

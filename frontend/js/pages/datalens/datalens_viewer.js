/**
 * DataLens Viewer 模块 - 数据表格、图表与分页
 */

const DataLensViewerMixin = {
    /**
     * 加载视图数据
     * @param {number} viewId - 视图ID
     * @param {number} page - 页码
     * @param {number} pageSize - 每页数量
     * @param {string} search - 搜索关键词
     * @param {string|null} sortField - 排序字段（兼容单字段）
     * @param {string|null} sortOrder - 排序方式（兼容单字段）
     * @param {Array|null} sorts - 多字段排序 [{field, order}]
     * @param {Object|null} filters - 筛选条件
     */
    async _loadViewData(viewId, page = 1, pageSize = 20, search = '', sortField = null, sortOrder = null, sorts = null, filters = null) {
        const { openTabs } = this.state;
        const tabIndex = openTabs.findIndex(t => t.id === viewId);
        if (tabIndex === -1) return;

        // 设置加载状态
        openTabs[tabIndex].loading = true;
        openTabs[tabIndex].error = null;
        this.setState({ openTabs: [...openTabs] });

        try {
            // 构建请求参数
            const requestData = {
                page,
                page_size: pageSize,
                search
            };

            // 优先使用多字段排序
            if (sorts && sorts.length > 0) {
                requestData.sorts = sorts;
            } else if (sortField) {
                requestData.sort_field = sortField;
                requestData.sort_order = sortOrder;
            }

            // 添加筛选条件（过滤掉无效的空字段名或占位符字段）
            if (filters && Object.keys(filters).length > 0) {
                const validFilters = {};
                for (const [field, cond] of Object.entries(filters)) {
                    // 跳过空字段名或临时占位符
                    if (!field || field.startsWith('_new_')) continue;
                    validFilters[field] = cond;
                }
                if (Object.keys(validFilters).length > 0) {
                    requestData.filters = validFilters;
                }
            }

            const res = await LensApi.getViewData(viewId, requestData);

            if (res.code === 200) {
                openTabs[tabIndex].data = res.data;
                openTabs[tabIndex].page = page;
                openTabs[tabIndex].pageSize = pageSize;
                openTabs[tabIndex].search = search;
                openTabs[tabIndex].sortField = sortField;
                openTabs[tabIndex].sortOrder = sortOrder;
                openTabs[tabIndex].sorts = sorts || [];
                openTabs[tabIndex].filters = filters || {};
                openTabs[tabIndex].loading = false;
            } else {
                throw new Error(res.message || '获取数据失败');
            }
            this.setState({ openTabs: [...openTabs] });
        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('加载视图数据失败:', e);
            openTabs[tabIndex].loading = false;
            openTabs[tabIndex].error = e.message;
            this.setState({ openTabs: [...openTabs] });
            Toast.error('加载数据失败: ' + e.message);
        }
    },

    async _exportCurrentView() {
        const { activeTabId, openTabs } = this.state;
        const activeTab = openTabs.find(t => t.id === activeTabId);

        if (!activeTab) {
            Toast.error('没有打开的视图');
            return;
        }

        const btn = document.querySelector('.lens-export-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span>';
        }

        try {
            Toast.info('正在准备导出，请稍候...', 2000);
            const viewId = activeTab.id;

            // 直接调用后端流式导出接口
            const token = Utils.getToken();
            const url = `${Config.apiBase}/lens/views/${viewId}/export`;

            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || '导出失败');
            }

            // 获取文件名（由于浏览器 fetch 安全限制，直接获取内容）
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;

            // 构造文件名
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            link.download = `${activeTab.name}_${date}.csv`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            Toast.success('数据导出成功');
        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error(e);
            Toast.error('导出出错: ' + (e.message || '未知错误'));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ri-download-line"></i>';
            }
        }
    },

    _renderViewer() {
        const { activeTabId, openTabs } = this.state;
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return '';

        // 关键：更新当前视图引用，供子渲染函数使用
        this.currentView = activeTab;

        // 计算筛选数量
        const filterCount = activeTab.filters ? Object.keys(activeTab.filters).length : 0;
        const sortCount = activeTab.sorts ? activeTab.sorts.length : (activeTab.sortField ? 1 : 0);

        return `
            <div class="lens-viewer">
                <div class="lens-viewer-header">
                    ${this.state.isSingleView ? '' : `<div class="lens-viewer-title-group">
                        <div class="lens-breadcrumb">
                            <span class="lens-breadcrumb-item">数据透镜</span>
                            ${activeTab.category_name ? `
                                <span class="lens-breadcrumb-separator">/</span>
                                <span class="lens-breadcrumb-item">${Utils.escapeHtml(activeTab.category_name)}</span>
                            ` : ''}
                            <span class="lens-breadcrumb-separator">/</span>
                            <h2 class="lens-viewer-title">${Utils.escapeHtml(activeTab.name)}</h2>
                            ${activeTab.description ? `<span class="lens-viewer-desc" title="${Utils.escapeHtml(activeTab.description)}"><i class="ri-information-line"></i></span>` : ''}
                        </div>
                    </div>`}
                    <div class="lens-viewer-toolbar">
                        <div class="lens-mode-selector">
                            <button class="lens-mode-btn ${activeTab.viewMode === 'table' || !activeTab.viewMode ? 'active' : ''}" data-mode="table" title="表格视图"><i class="ri-table-line"></i> 表格</button>
                            <button class="lens-mode-btn ${activeTab.viewMode === 'chart' ? 'active' : ''}" data-mode="chart" title="图表视图"><i class="ri-bar-chart-2-line"></i> 图表</button>
                        </div>
                        <button class="lens-btn lens-btn-outline lens-filter-btn ${filterCount > 0 ? 'has-filter' : ''}" title="数据筛选">
                            <i class="ri-filter-3-line"></i> 筛选${filterCount > 0 ? ` (${filterCount})` : ''}
                        </button>
                        <button class="lens-btn lens-btn-outline lens-sort-btn ${sortCount > 0 ? 'has-sort' : ''}" title="多字段排序">
                            <i class="ri-arrow-up-down-line"></i> 排序${sortCount > 0 ? ` (${sortCount})` : ''}
                        </button>
                        <div class="lens-search-box search-group">
                            <input type="text" class="lens-viewer-search-input" placeholder="在结果中搜索..." value="${Utils.escapeHtml(activeTab.search || '')}">
                            <button class="btn btn-primary" id="lens-viewer-search-btn"><i class="ri-search-2-line"></i></button>
                        </div>
                        <button class="lens-btn lens-btn-outline lens-refresh-btn" title="刷新数据"><i class="ri-refresh-line"></i></button>
                        <button class="lens-btn lens-btn-outline lens-visual-settings-btn" title="显示与图表配置" data-id="${activeTab.id}"><i class="ri-settings-3-line"></i> 配置</button>
                        <button class="lens-btn lens-btn-outline lens-export-btn" title="导出数据"><i class="ri-download-line"></i></button>
                    </div>
                </div>
                
                ${this._renderFilterPanel(activeTab)}
                ${this._renderSortPanel(activeTab)}
                
                <div class="lens-viewer-content">
                    ${activeTab.loading ? this._renderLoading() : (
                activeTab.viewMode === 'chart' ? this._renderChartView(activeTab) : this._renderDataTable(activeTab)
            )}
                </div>
                
                <div class="lens-viewer-footer">
                    <div class="lens-data-info">
                        ${activeTab.data && activeTab.data.data ? `共 ${activeTab.data.total || 0} 条数据，当前显示 ${activeTab.data.data.length} 条` : ''}
                        ${filterCount > 0 ? `<span class="lens-filter-badge">已筛选</span>` : ''}
                    </div>
                    ${this._renderPagination(activeTab)}
                </div>
            </div>
        `;
    },

    _renderChartView(tab) {
        try {
            if (!tab.data || !tab.data.data || !tab.data.data.length) {
                return `
    <div class="lens-chart-container">
        <div class="lens-chart-loading">暂无数据，请尝试调整查询或搜索条件</div>
                    </div>
    `;
            }

            const chartConfig = tab.chart_config;
            if (!chartConfig) {
                return `
    <div class="lens-chart-container">
        <div class="lens-chart-loading">
            <p>该视图尚未配置图表展示</p>
            ${this._hasPermission('datalens.update') ? `<button class="lens-btn lens-btn-primary mt-10" data-action="show-visual-settings" data-tab-id="${tab.id}">去配置图表</button>` : ''}
        </div>
                    </div>
    `;
            }

            // 初始化图表需要等到 DOM 挂载后通过 setTimeout 调用 _initChart
            // 即使 ECharts 未加载，也先返回容器，在 _initChart 中处理加载
            setTimeout(() => this._initChart(tab), 100);

            return `
    <div class="lens-chart-container" id="lens-chart-${tab.id}">
        <div class="lens-chart-loading">${window.echarts ? '图表初始化中...' : '正在加载图表组件...'}</div>
                </div>
    `;
        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('渲染图表视图失败:', e);
            return `<div class="lens-error"> 图表视图渲染失败: ${Utils.escapeHtml(e.message || '未知错误')}</div> `;
        }
    },

    async _initChart(tab) {
        const container = document.getElementById(`lens-chart-${tab.id}`);
        if (!container) return;

        try {
            await ResourceLoader.loadEcharts();

            const chartConfig = tab.chart_config;
            const data = tab.data.data;

            // 使用统一的图表初始化工具
            const themeMode = ChartHelper.getThemeMode();
            const chartResult = ChartHelper.initChart(container, { theme: themeMode });
            if (!chartResult) {
                container.innerHTML = '<div class="lens-empty">图表初始化失败</div>';
                return;
            }
            const myChart = chartResult.instance;

            let options = {};

            // 如果用户提供了完整的 ECharts 配置
            if (chartConfig.baseOption) {
                options = chartConfig.baseOption;
            } else {
                // 统一使用 ChartFactory 生成 ECharts 配置
                const type = chartConfig.type || 'bar';

                // 1. 映射配置到 ChartFactory 格式
                const factoryConfig = {
                    ...chartConfig,
                    xField: chartConfig.xAxis,
                    yField: chartConfig.yAxis,
                    colorScheme: chartConfig.theme || 'default',
                    // DataLens 特有字段映射
                    y2Field: chartConfig.y2Field,
                    y3Field: chartConfig.y3Field,
                    stacked: chartConfig.stacked,
                    dualAxis: chartConfig.dualAxis,
                    title: chartConfig.customTitle,
                    showLabel: chartConfig.showLabel,
                    // 筛选配置
                    excludeValues: chartConfig.excludeValues,
                    filterField: chartConfig.filterField,
                    filterOp: chartConfig.filterOp,
                    filterValue: chartConfig.filterValue,
                    // 排序配置
                    sortField: chartConfig.sortField,
                    sortOrder: chartConfig.sortOrder,
                    forecastSteps: chartConfig.forecastSteps
                };

                // 2. 数据过滤
                const filteredData = ChartFactory.filterData(data, factoryConfig);

                if (!filteredData || filteredData.length === 0) {
                    // 即使无数据也继续，Factory 会处理空状态
                }

                // 3. 生成 Option
                // 基础图表 (Bar/Line/Pie/Scatter) 若有聚合配置需先聚合
                if (['bar', 'line', 'pie', 'scatter'].includes(type)) {
                    const aggregation = chartConfig.aggregation || 'none';

                    if (factoryConfig.xField && factoryConfig.yField) {
                        // 保存原始字段名用于轴标签显示
                        const originalXField = factoryConfig.xField;
                        const originalYField = factoryConfig.yField;

                        // 使用优化后的 Utils.aggregateData（内置排序功能）
                        const aggregatedData = Utils.aggregateData(filteredData, factoryConfig.xField, factoryConfig.yField, aggregation, {
                            sortField: factoryConfig.sortField,
                            sortOrder: factoryConfig.sortOrder,
                            originalYField: originalYField
                        });

                        options = ChartFactory.generateOption(type, aggregatedData, {
                            ...factoryConfig,
                            xField: 'name',  // 数据字段名
                            yField: 'value', // 数据字段名
                            // 保留原始字段名用于轴标签
                            xLabel: originalXField,
                            yLabel: originalYField
                        }, filteredData);
                    } else {
                        // 缺少必要字段
                        options = {
                            title: { text: '配置不完整：请设置X轴和Y轴字段', left: 'center', textStyle: { color: '#888' } }
                        };
                    }
                } else {
                    // 其他情况（特殊图表如直方图/预测图）直接使用过滤后的数据
                    options = ChartFactory.generateOption(type, filteredData, factoryConfig);
                }
            }

            if (options && Object.keys(options).length > 0) {
                myChart.setOption(options, true);
            } else {
                container.innerHTML = '<div class="lens-empty">无法生成图表 (配置无效或无数据)</div>';
                ChartHelper.disposeChart(myChart);
                return;
            }

            // 使用统一的 resize 处理
            const resizeHandler = ChartHelper.createResizeHandler({ [tab.id]: myChart }, 200);
            ChartHelper.registerGlobalResize(resizeHandler);

            // 存储实例和清理函数以便之后销毁
            tab._chartInstance = myChart;
            tab._chartResizeCleanup = resizeHandler;

        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('渲染图表失败:', e);
            container.innerHTML = `<div class="lens-error"> 图表渲染失败: ${Utils.escapeHtml(e.message)}</div> `;
        }
    },

    _renderDataTable(tab) {
        try {
            if (!tab.data) return '<div class="lens-empty">无数据</div>';
            const { data: items, columns: rawColumns } = tab.data;
            if (!items || !items.length) return '<div class="lens-empty">暂无数据</div>';
            if (!rawColumns || !rawColumns.length) return '<div class="lens-empty">无列信息</div>';

            // 处理列信息 - columns 可能是对象数组 [{field, title}] 或字符串数组
            const columns = rawColumns.map(col => typeof col === 'object' ? col.field : col);
            const columnTitles = {};
            rawColumns.forEach(col => {
                if (typeof col === 'object') {
                    columnTitles[col.field] = col.title || col.field;
                } else {
                    columnTitles[col] = col;
                }
            });

            // 获取列配置 - 兼容多种格式
            const displayConfig = tab.display_config || {};
            // 列别名：兼容 displayConfig.columns 和直接存储在 displayConfig 的格式
            const customNames = displayConfig.columns || displayConfig;
            // 兼容处理：优先使用 hidden，其次使用 _hide
            const hiddenColumns = displayConfig.hidden || displayConfig._hide || [];
            const statusConfig = tab.status_config || {};

            // 过滤可见列
            const visibleColumns = columns.filter(col => !hiddenColumns.includes(col));

            // 处理排序状态
            const sortField = tab.sortField;
            const sortOrder = tab.sortOrder;

            return `
                <div class="lens-table-wrapper">
                    <table class="lens-table">
                        <thead>
                            <tr>
                                ${visibleColumns.map(col => `
                                    <th class="lens-sortable-th ${sortField === col ? 'active' : ''}" data-field="${Utils.escapeHtml(col)}">
                                        ${Utils.escapeHtml(customNames[col] || columnTitles[col] || col)}
                                        ${sortField === col ? (sortOrder === 'asc' ? ' <i class="ri-arrow-up-line"></i>' : ' <i class="ri-arrow-down-line"></i>') : ''}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(row => `
                                <tr>
                                    ${visibleColumns.map(col => `
                                        <td>${this._formatCellValue(row[col], col, statusConfig, displayConfig)}</td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('渲染数据表格失败:', e);
            return `<div class="lens-error">渲染表格失败: ${Utils.escapeHtml(e.message || '未知错误')}</div>`;
        }
    },

    _formatCellValue(value, field = null, statusConfig = null, displayConfig = null) {
        try {
            if (value === null || value === undefined) return '<span class="lens-cell-null">-</span>';

            // 状态检查 - 支持新格式 {rules: [{field, operator, value, color}]}
            if (statusConfig && field) {
                let matchedColor = null;

                // 新格式：rules 数组
                if (statusConfig.rules && Array.isArray(statusConfig.rules)) {
                    // 确保 field 是字符串并去除空格
                    const currentField = String(field).trim();

                    for (const rule of statusConfig.rules) {
                        const ruleField = String(rule.field).trim();
                        if (ruleField !== currentField) continue;

                        const ruleValue = rule.value;
                        const op = rule.operator || 'eq';

                        // 鲁棒的数值转换
                        const rawValue = value === null ? '' : String(value).trim();
                        const numValue = parseFloat(rawValue);
                        const numRuleValue = parseFloat(String(ruleValue).trim());
                        let matched = false;

                        if (op === 'eq') matched = rawValue === String(ruleValue).trim();
                        else if (op === 'ne') matched = rawValue !== String(ruleValue).trim();
                        else if (op === 'gt' && !isNaN(numValue) && !isNaN(numRuleValue)) matched = numValue > numRuleValue;
                        else if (op === 'gte' && !isNaN(numValue) && !isNaN(numRuleValue)) matched = numValue >= numRuleValue;
                        else if (op === 'lt' && !isNaN(numValue) && !isNaN(numRuleValue)) matched = numValue < numRuleValue;
                        else if (op === 'lte' && !isNaN(numValue) && !isNaN(numRuleValue)) matched = numValue <= numRuleValue;

                        if (matched) {
                            matchedColor = rule.color;
                            break;
                        }
                    }
                }
                // 旧格式兼容：{field: {value: color}}
                else if (statusConfig[field]) {
                    const fieldMappings = statusConfig[field];
                    const strValue = String(value).trim();
                    matchedColor = fieldMappings[strValue] || fieldMappings[value];
                }

                if (matchedColor) {
                    return `<span class="lens-status-${matchedColor}">${Utils.escapeHtml(String(value))}</span>`;
                }
            }

            // 获取列配置类型
            const colConf = (displayConfig?.columns && displayConfig.columns[field]) || displayConfig?.[field] || {};
            const colType = typeof colConf === 'object' ? (colConf.type || 'default') : 'default';

            const strValue = String(value);

            // 1. 如果显式指定为图片，或者自动检出图片
            const isImageUrl = strValue.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i) || strValue.startsWith('data:image');
            const isLocalPath = strValue.match(/^[a-zA-Z]:\\/) || strValue.startsWith('/') || strValue.startsWith('./') || strValue.startsWith('../');

            if (colType === 'image' || isImageUrl || (colType === 'default' && isImageUrl)) {
                let imgSrc = strValue;
                // 如果是本地路径且不是 data URL，则使用代理
                if (isLocalPath && !strValue.startsWith('data:image')) {
                    let url = Utils.withToken(`${Config.apiBase}/lens/image?path=${encodeURIComponent(strValue)}`);
                    // 如果视图有配置图片根路径，则附加参数
                    if (this.currentView?.display_config?.image_base_path) {
                        url += `&base_path=${encodeURIComponent(this.currentView.display_config.image_base_path)}`;
                    }
                    imgSrc = url;
                } else if (!strValue.startsWith('http') && !strValue.startsWith('data:image')) {
                    // 可能是相对路径，也尝试走代理
                    let url = Utils.withToken(`${Config.apiBase}/lens/image?path=${encodeURIComponent(strValue)}`);
                    if (this.currentView?.display_config?.image_base_path) {
                        url += `&base_path=${encodeURIComponent(this.currentView.display_config.image_base_path)}`;
                    }
                    imgSrc = url;
                }


                const escapedImgSrc = Utils.escapeHtml(imgSrc);
                // encodeURIComponent does NOT escape single quotes, so we must do it manually to prevent breaking out of the JS string
                const safeUrlForJs = encodeURIComponent(imgSrc).replace(/'/g, '%27');
                return `<img src="${escapedImgSrc}" class="lens-cell-img" data-preview-url="${escapedImgSrc}">`;
            }

            // 2. 如果显式指定为链接，或者自动检出链接
            if (colType === 'link' || strValue.startsWith('http')) {
                const safeUrl = Utils.validateProtocol(strValue) ? strValue : '#';
                return `<a href="${Utils.escapeHtml(safeUrl)}" target="_blank" class="lens-cell-link">查看链接</a>`;
            }

            // 3. 布尔类型
            if (colType === 'bool' || typeof value === 'boolean') {
                const isTrue = value === true || value === 1 || String(value).toLowerCase() === 'true';
                return isTrue ? '<span class="lens-cell-bool true"><i class="ri-check-line"></i></span>' : '<span class="lens-cell-bool false"><i class="ri-close-line"></i></span>';
            }

            // 4. 日期类型 (简单处理)
            if (colType === 'date') {
                if (strValue.includes('T')) return strValue.replace('T', ' ').split('.')[0];
                return strValue;
            }

            // 长文本处理
            if (strValue.length > 50) {
                return `<span class="lens-cell-text" title="${Utils.escapeHtml(strValue)}">${Utils.escapeHtml(strValue.substring(0, 50))}...</span>`;
            }

            return Utils.escapeHtml(strValue);
        } catch (e) {
            (typeof Config !== 'undefined' && Config.error) && Config.error('格式化单元格失败:', e, { value, field });
            return '<span class="lens-cell-error">-</span>';
        }
    },

    _renderPagination(tab) {
        const pageSize = tab.pageSize || 20;
        const totalCount = tab.data?.total || 0;
        const totalPages = tab.data?.total_pages || Math.ceil(totalCount / pageSize) || 1;

        if (!tab.data || totalPages <= 1) return '';

        const current = tab.page || 1;
        const total = totalPages;
        let html = '<div class="pagination">';

        // 首页按钮
        html += `<button class="lens-page-btn" data-action="first" ${current === 1 ? 'disabled' : ''} title="首页"><i class="ri-skip-back-line"></i></button>`;
        html += `<button class="lens-page-btn" data-action="prev" ${current === 1 ? 'disabled' : ''}>上一页</button>`;

        const start = Math.max(1, current - 2);
        const end = Math.min(total, current + 2);

        if (start > 1) html += '<span class="page-ellipsis">...</span>';

        for (let i = start; i <= end; i++) {
            html += `<button class="lens-page-btn ${i === current ? 'active' : ''}" data-action="${i}">${i}</button>`;
        }

        if (end < total) html += '<span class="page-ellipsis">...</span>';

        html += `<button class="lens-page-btn" data-action="next" ${current === total ? 'disabled' : ''}>下一页</button>`;
        // 末页按钮
        html += `<button class="lens-page-btn" data-action="last" ${current === total ? 'disabled' : ''} title="末页"><i class="ri-skip-forward-line"></i></button>`;

        // 页码信息
        html += `<span class="page-info" style="margin-left:12px;color:#888;font-size:12px;">第 ${current} / ${total} 页</span>`;
        html += '</div>';

        return html;
    },

    _renderLoading() {
        return `
    <div class="lens-loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">数据加载中...</div>
            </div>
    `;
    },

    /**
     * 渲染筛选面板
     */
    _renderFilterPanel(tab) {
        if (!tab.showFilterPanel) return '';

        const columns = tab.data?.columns || [];
        const filters = tab.filters || {};

        // 操作符选项
        const operators = [
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
        ];

        return `
            <div class="lens-filter-panel animate-slide-down">
                <div class="lens-panel-header">
                    <h4><i class="ri-filter-3-line"></i> 筛选</h4>
                    <button class="lens-btn-icon lens-filter-close" title="关闭面板"><i class="ri-close-line"></i></button>
                </div>
                <div class="lens-filter-list" id="lens-filter-list">
                    ${Object.entries(filters).map(([field, cond], idx) => {
            // 正确提取值
            const condValue = typeof cond === 'object' ? (cond?.value || '') : cond;
            const condOp = typeof cond === 'object' ? (cond?.op || 'eq') : 'eq';
            return `
                        <div class="lens-filter-row" data-index="${idx}">
                            <select class="form-control lens-filter-field">
                                <option value="">选择字段</option>
                                ${columns.map(col => {
                const f = typeof col === 'object' ? col.field : col;
                const t = typeof col === 'object' ? (col.title || col.field) : col;
                return `<option value="${Utils.escapeHtml(f)}" ${f === field ? 'selected' : ''}>${Utils.escapeHtml(t)}</option>`;
            }).join('')}
                            </select>
                            <select class="form-control lens-filter-op">
                                ${operators.map(op => `<option value="${op.value}" ${condOp === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
                            </select>
                            <input type="text" class="form-control lens-filter-value" placeholder="值" value="${Utils.escapeHtml(String(condValue))}">
                            <button class="lens-btn-icon lens-filter-remove" title="删除"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `;
        }).join('')}
                </div>
                <div class="lens-panel-actions">
                    <button class="lens-btn lens-btn-sm lens-filter-add"><i class="ri-add-line"></i> 添加条件</button>
                    <div class="lens-panel-buttons">
                        <button class="lens-btn lens-btn-sm lens-filter-clear">清空</button>
                        <button class="lens-btn lens-btn-sm lens-btn-primary lens-filter-apply">应用筛选</button>
                    </div>
                </div>
            </div>
        `;
    },


    /**
     * 渲染排序面板
     */
    _renderSortPanel(tab) {
        if (!tab.showSortPanel) return '';

        const columns = tab.data?.columns || [];
        const sorts = tab.sorts || [];

        return `
            <div class="lens-sort-panel animate-slide-down">
                <div class="lens-panel-header">
                    <h4><i class="ri-arrow-up-down-line"></i> 多字段排序</h4>
                    <button class="lens-btn-icon lens-sort-close" title="关闭面板"><i class="ri-close-line"></i></button>
                </div>
                <div class="lens-sort-list" id="lens-sort-list">
                    ${sorts.map((sort, idx) => `
                        <div class="lens-sort-row" data-index="${idx}">
                            <span class="lens-sort-order">${idx + 1}</span>
                            <select class="form-control lens-sort-field">
                                <option value="">选择字段</option>
                                ${columns.map(col => {
            const f = typeof col === 'object' ? col.field : col;
            const t = typeof col === 'object' ? (col.title || col.field) : col;
            return `<option value="${Utils.escapeHtml(f)}" ${f === sort.field ? 'selected' : ''}>${Utils.escapeHtml(t)}</option>`;
        }).join('')}
                            </select>
                            <select class="form-control lens-sort-direction">
                                <option value="asc" ${sort.order === 'asc' ? 'selected' : ''}>升序 ↑</option>
                                <option value="desc" ${sort.order === 'desc' ? 'selected' : ''}>降序 ↓</option>
                            </select>
                            <button class="lens-btn-icon lens-sort-remove" title="删除"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `).join('')}
                </div>
                <div class="lens-panel-actions">
                    <button class="lens-btn lens-btn-sm lens-sort-add"><i class="ri-add-line"></i> 添加排序</button>
                    <div class="lens-panel-buttons">
                        <button class="lens-btn lens-btn-sm lens-sort-clear">清空</button>
                        <button class="lens-btn lens-btn-sm lens-btn-primary lens-sort-apply">应用排序</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 切换筛选面板显示
     */
    _toggleFilterPanel() {
        const { activeTabId, openTabs } = this.state;
        const tabIndex = openTabs.findIndex(t => t.id === activeTabId);
        if (tabIndex === -1) return;

        const tab = openTabs[tabIndex];

        // 如果是打开面板且当前没有筛选条件，默认添加一行空条件
        if (!tab.showFilterPanel) {
            if (!tab.filters || Object.keys(tab.filters).length === 0) {
                tab.filters = { '': { op: 'eq', value: '' } };
            }
        } else {
            // 关闭面板时，清空筛选条件并重新加载数据
            tab.filters = {};
            this._loadViewData(
                tab.id, 1, tab.pageSize || 20, tab.search || '',
                tab.sortField, tab.sortOrder, tab.sorts, {}
            );
        }

        // 切换显示状态（不再在关闭时自动清空，由用户点击“清空”按钮决定）
        tab.showFilterPanel = !tab.showFilterPanel;
        tab.showSortPanel = false; // 关闭排序面板
        this.setState({ openTabs: [...openTabs] });
    },

    /**
     * 切换排序面板显示
     */
    _toggleSortPanel() {
        const { activeTabId, openTabs } = this.state;
        const tabIndex = openTabs.findIndex(t => t.id === activeTabId);
        if (tabIndex === -1) return;

        const tab = openTabs[tabIndex];

        // 如果当前是开启状态，准备将其关闭时，清空排序并重置数据
        if (tab.showSortPanel) {
            tab.sorts = [];
            this._loadViewData(
                tab.id, 1, tab.pageSize || 20, tab.search || '',
                null, null, [], tab.filters
            );
        } else {
            // 如果是打开面板且当前没有排序条件，默认添加一行
            if (!tab.sorts || tab.sorts.length === 0) {
                tab.sorts = [{ field: '', order: 'asc' }];
            }
        }

        tab.showSortPanel = !tab.showSortPanel;
        tab.showFilterPanel = false; // 关闭筛选面板
        this.setState({ openTabs: [...openTabs] });
    },

    /**
     * 应用筛选条件
     */
    _applyFilters() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        const filters = {};
        const rows = document.querySelectorAll('.lens-filter-row');
        rows.forEach(row => {
            const field = row.querySelector('.lens-filter-field')?.value;
            const op = row.querySelector('.lens-filter-op')?.value;
            const value = row.querySelector('.lens-filter-value')?.value;

            if (field && (op === 'isnull' || op === 'notnull' || value)) {
                filters[field] = { op, value };
            }
        });

        // 更新筛选条件并重新加载
        tab.filters = filters;
        // 应用后不再自动关闭面板，保持开放以便继续调整
        this._loadViewData(
            tab.id, 1, tab.pageSize || 20, tab.search || '',
            tab.sortField, tab.sortOrder, tab.sorts, filters
        );
    },

    /**
     * 应用多字段排序
     */
    _applySorts() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        const sorts = [];
        const rows = document.querySelectorAll('.lens-sort-row');
        rows.forEach(row => {
            const field = row.querySelector('.lens-sort-field')?.value;
            const order = row.querySelector('.lens-sort-direction')?.value || 'asc';

            if (field) {
                sorts.push({ field, order });
            }
        });

        // 更新排序并重新加载
        tab.sorts = sorts;
        tab.sortField = null; // 清除单字段排序
        tab.sortOrder = null;
        // 应用后不再自动关闭面板，保持开放以便继续调整
        this._loadViewData(
            tab.id, 1, tab.pageSize || 20, tab.search || '',
            null, null, sorts, tab.filters
        );
    },

    /**
     * 添加筛选条件行
     */
    _addFilterRow() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        tab.filters = tab.filters || {};
        tab.filters[`_new_${Date.now()} `] = { op: 'eq', value: '' };
        this.setState({ openTabs: [...openTabs] });
    },

    /**
     * 添加排序行
     */
    _addSortRow() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        tab.sorts = tab.sorts || [];
        tab.sorts.push({ field: '', order: 'asc' });
        this.setState({ openTabs: [...openTabs] });
    },

    /**
     * 清空筛选条件
     */
    _clearFilters() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        // 清空并初始化一个空行
        tab.filters = { [`_new_${Date.now()} `]: { op: 'eq', value: '' } };
        this._loadViewData(
            tab.id, 1, tab.pageSize || 20, tab.search || '',
            tab.sortField, tab.sortOrder, [], {}
        );
    },

    /**
     * 清空排序
     */
    _clearSorts() {
        const { activeTabId, openTabs } = this.state;
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        // 清空并初始化一个空行
        tab.sorts = [{ field: '', order: 'asc' }];
        tab.sortField = null;
        tab.sortOrder = null;
        this._loadViewData(
            tab.id, 1, tab.pageSize || 20, tab.search || '',
            null, null, [], tab.filters
        );
    }
};

// 混入到 DataLensPage
if (typeof DataLensPage !== 'undefined') {
    Object.assign(DataLensPage.prototype, DataLensViewerMixin);
}

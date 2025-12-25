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

            // 添加筛选条件
            if (filters && Object.keys(filters).length > 0) {
                requestData.filters = filters;
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
            console.error('加载视图数据失败:', e);
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
            console.error(e);
            Toast.error('导出出错: ' + (e.message || '未知错误'));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '📥';
            }
        }
    },

    _renderViewer() {
        const { activeTabId, openTabs } = this.state;
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return '';

        // 计算筛选数量
        const filterCount = activeTab.filters ? Object.keys(activeTab.filters).length : 0;
        const sortCount = activeTab.sorts ? activeTab.sorts.length : (activeTab.sortField ? 1 : 0);

        return `
            <div class="lens-viewer animate-fade-in">
                <div class="lens-viewer-header">
                    <div class="lens-viewer-title-group">
                        ${this.state.isSingleView ? '' : '<button class="lens-btn-icon lens-tab-hub" title="返回首页">🏠</button>'}
                        <div class="lens-breadcrumb">
                            <span class="lens-breadcrumb-item">数据透镜</span>
                            ${activeTab.category_name ? `
                                <span class="lens-breadcrumb-separator">/</span>
                                <span class="lens-breadcrumb-item">${activeTab.category_name}</span>
                            ` : ''}
                            <span class="lens-breadcrumb-separator">/</span>
                            <h2 class="lens-viewer-title">${activeTab.name}</h2>
                            ${activeTab.description ? `<span class="lens-viewer-desc" title="${activeTab.description}">ℹ️</span>` : ''}
                        </div>
                    </div>
                    <div class="lens-viewer-toolbar">
                        <div class="lens-mode-selector">
                            <button class="lens-mode-btn ${activeTab.viewMode === 'table' || !activeTab.viewMode ? 'active' : ''}" data-mode="table" title="表格视图">📋 表格</button>
                            <button class="lens-mode-btn ${activeTab.viewMode === 'chart' ? 'active' : ''}" data-mode="chart" title="图表视图">📊 图表</button>
                        </div>
                        <button class="lens-btn lens-btn-outline lens-filter-btn ${filterCount > 0 ? 'has-filter' : ''}" title="数据筛选">
                            🔽 筛选${filterCount > 0 ? ` (${filterCount})` : ''}
                        </button>
                        <button class="lens-btn lens-btn-outline lens-sort-btn ${sortCount > 0 ? 'has-sort' : ''}" title="多字段排序">
                            ↕️ 排序${sortCount > 0 ? ` (${sortCount})` : ''}
                        </button>
                        <div class="lens-search-box">
                            <input type="text" class="lens-viewer-search-input" placeholder="在结果中搜索..." value="${activeTab.search || ''}">
                            <i class="lens-search-icon">🔍</i>
                            ${activeTab.search ? '<button class="lens-search-clear">✕</button>' : ''}
                        </div>
                        <button class="lens-btn lens-btn-outline lens-refresh-btn" title="刷新数据">🔄</button>
                        <button class="lens-btn lens-btn-outline lens-visual-settings-btn" title="显示与图表配置" data-id="${activeTab.id}">⚙️ 配置</button>
                        <button class="lens-btn lens-btn-outline lens-export-btn" title="导出数据">📥</button>
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

            // 检查 ECharts 是否已加载
            if (!window.echarts) {
                return `
                    <div class="lens-chart-container">
                        <div class="lens-chart-loading">
                            <p>图表库未加载</p>
                            <small>请确认 ECharts 已正确引入</small>
                        </div>
                    </div>
                `;
            }

            const chartConfig = tab.chart_config;
            if (!chartConfig) {
                return `
                    <div class="lens-chart-container">
                        <div class="lens-chart-loading">
                            <p>该视图尚未配置图表展示</p>
                            ${this._hasPermission('datalens:update') ? `<button class="lens-btn lens-btn-primary mt-10" onclick="window.DataLensPageInstance._showVisualSettings(${tab.id})">去配置图表</button>` : ''}
                        </div>
                    </div>
                `;
            }

            // 初始化图表需要等到 DOM 挂载后通过 setTimeout 调用 _initChart
            setTimeout(() => this._initChart(tab), 100);

            return `
                <div class="lens-chart-container" id="lens-chart-${tab.id}">
                    <div class="lens-chart-loading">图表初始化中...</div>
                </div>
            `;
        } catch (e) {
            console.error('渲染图表视图失败:', e);
            return `<div class="lens-error">图表视图渲染失败: ${e.message || '未知错误'}</div>`;
        }
    },

    _initChart(tab) {
        const container = document.getElementById(`lens-chart-${tab.id}`);
        if (!container || !window.echarts) return;

        try {
            const chartConfig = tab.chart_config;
            const data = tab.data.data;
            const myChart = echarts.init(container, Store.get('theme') === 'dark' ? 'dark' : null);

            let options = {};

            // 如果用户提供了完整的 ECharts 配置
            if (chartConfig.baseOption) {
                options = chartConfig.baseOption;
            } else {
                // 极简配置模式：支持常用的柱状、折线、饼图
                const type = chartConfig.type || 'bar';
                const xField = chartConfig.xAxis;
                const yFields = Array.isArray(chartConfig.yAxis) ? chartConfig.yAxis : [chartConfig.yAxis];
                const aggregation = chartConfig.aggregation;

                // 如果设置了聚合方式，先对数据进行分组聚合
                let processedData = data;
                if (aggregation && xField) {
                    const grouped = {};
                    data.forEach(item => {
                        const key = item[xField] || '未知';
                        if (!grouped[key]) {
                            grouped[key] = { _key: key, _values: [], _count: 0 };
                        }
                        yFields.forEach(yf => {
                            if (!grouped[key][yf]) grouped[key][yf] = [];
                            const val = parseFloat(item[yf]);
                            if (!isNaN(val)) grouped[key][yf].push(val);
                        });
                        grouped[key]._count++;
                    });

                    processedData = Object.values(grouped).map(g => {
                        const result = { [xField]: g._key };
                        yFields.forEach(yf => {
                            const vals = g[yf] || [];
                            if (aggregation === 'sum') result[yf] = vals.reduce((a, b) => a + b, 0);
                            else if (aggregation === 'avg') result[yf] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                            else if (aggregation === 'count') result[yf] = g._count;
                            else if (aggregation === 'max') result[yf] = vals.length ? Math.max(...vals) : 0;
                            else if (aggregation === 'min') result[yf] = vals.length ? Math.min(...vals) : 0;
                            else result[yf] = vals[0] || 0;
                        });
                        return result;
                    });
                }

                // 定义渐变色系（所有图表类型共用）
                const colors = [
                    ['#667eea', '#764ba2'],
                    ['#f093fb', '#f5576c'],
                    ['#4facfe', '#00f2fe'],
                    ['#43e97b', '#38f9d7'],
                    ['#fa709a', '#fee140']
                ];

                if (type === 'pie') {
                    options = {
                        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                        legend: { bottom: '5%', left: 'center', textStyle: { color: '#aaa' } },
                        series: [{
                            type: 'pie',
                            radius: ['40%', '70%'],
                            label: {
                                show: true,
                                formatter: '{b}: {c}',
                                color: '#aaa'
                            },
                            labelLine: { lineStyle: { color: 'rgba(255,255,255,0.3)' } },
                            data: processedData.map((item, idx) => {
                                const cp = colors[idx % colors.length];
                                return {
                                    name: item[xField],
                                    value: parseFloat(item[yFields[0]]) || 0,
                                    itemStyle: {
                                        color: {
                                            type: 'linear', x: 0, y: 0, x2: 1, y2: 1,
                                            colorStops: [
                                                { offset: 0, color: cp[0] },
                                                { offset: 1, color: cp[1] }
                                            ]
                                        }
                                    }
                                };
                            })
                        }]
                    };
                } else {
                    // 过滤无效的 Y 字段
                    const validYFields = yFields.filter(yf => yf && processedData.some(item => item[yf] !== undefined));

                    if (validYFields.length === 0) {
                        container.innerHTML = `<div class="lens-error" style="padding:40px; text-align:center;">
                            <p>⚠️ 图表配置不完整</p>
                            <p style="font-size:12px; opacity:0.7;">请在"配置"中设置有效的数值字段（Y轴）</p>
                        </div>`;
                        return;
                    }

                    options = {
                        tooltip: {
                            trigger: 'axis',
                            backgroundColor: 'rgba(0, 0, 0, 0.75)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            textStyle: { color: '#fff' }
                        },
                        legend: {
                            data: validYFields,
                            textStyle: { color: '#aaa' }
                        },
                        grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
                        xAxis: {
                            type: 'category',
                            data: processedData.map(item => item[xField] || ''),
                            axisLabel: {
                                interval: 0,
                                rotate: processedData.length > 10 ? 45 : 0,
                                color: '#888'
                            },
                            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                            splitLine: { show: false }
                        },
                        yAxis: {
                            type: 'value',
                            axisLabel: { color: '#888' },
                            axisLine: { show: false },
                            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                        },
                        series: validYFields.map((yf, idx) => {
                            const colorPair = colors[idx % colors.length];
                            const baseConfig = {
                                name: yf,
                                type: type,
                                data: processedData.map(item => parseFloat(item[yf]) || 0),
                                smooth: type === 'line',
                                animationDuration: 1000,
                                animationEasing: 'elasticOut'
                            };

                            if (type === 'bar') {
                                // 每个柱子使用不同颜色
                                baseConfig.data = processedData.map((item, dataIdx) => {
                                    const cp = colors[dataIdx % colors.length];
                                    return {
                                        value: parseFloat(item[yf]) || 0,
                                        itemStyle: {
                                            borderRadius: [4, 4, 0, 0],
                                            color: {
                                                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                                colorStops: [
                                                    { offset: 0, color: cp[0] },
                                                    { offset: 1, color: cp[1] }
                                                ]
                                            }
                                        }
                                    };
                                });
                                baseConfig.label = {
                                    show: true,
                                    position: 'top',
                                    color: '#aaa',
                                    fontSize: 11,
                                    formatter: '{c}'
                                };
                                baseConfig.emphasis = {
                                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' }
                                };
                            } else if (type === 'line') {
                                baseConfig.lineStyle = { width: 3, color: colorPair[0] };
                                baseConfig.itemStyle = { color: colorPair[0] };
                                baseConfig.label = {
                                    show: true,
                                    position: 'top',
                                    color: '#aaa',
                                    fontSize: 11,
                                    formatter: '{c}'
                                };
                                baseConfig.areaStyle = {
                                    color: {
                                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                        colorStops: [
                                            { offset: 0, color: colorPair[0] + '40' },
                                            { offset: 1, color: 'transparent' }
                                        ]
                                    }
                                };
                            } else if (type === 'scatter') {
                                baseConfig.itemStyle = { color: colorPair[0] };
                                baseConfig.label = {
                                    show: true,
                                    position: 'right',
                                    color: '#aaa',
                                    fontSize: 10,
                                    formatter: '{c}'
                                };
                            }
                            return baseConfig;
                        })
                    };
                }
            }

            myChart.setOption(options);

            // 响应式
            const resizeHandler = () => myChart.resize();
            window.addEventListener('resize', resizeHandler);

            // 存储实例以便之后销毁
            tab._chartInstance = myChart;
            tab._chartResizeHandler = resizeHandler;

        } catch (e) {
            console.error('渲染图表失败:', e);
            container.innerHTML = `<div class="lens-error">图表渲染失败: ${e.message}</div>`;
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
                                    <th class="lens-sortable-th ${sortField === col ? 'active' : ''}" data-field="${col}">
                                        ${customNames[col] || columnTitles[col] || col}
                                        ${sortField === col ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(row => `
                                <tr>
                                    ${visibleColumns.map(col => `
                                        <td>${this._formatCellValue(row[col], col, statusConfig)}</td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            console.error('渲染数据表格失败:', e);
            return `<div class="lens-error">渲染表格失败: ${e.message || '未知错误'}</div>`;
        }
    },

    _formatCellValue(value, field = null, statusConfig = null) {
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

            if (typeof value === 'boolean') {
                return value ? '<span class="lens-cell-bool true">√</span>' : '<span class="lens-cell-bool false">×</span>';
            }

            // 简单的图片检测
            const strValue = String(value);
            if (strValue.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i) || strValue.startsWith('data:image')) {
                // 对图片 URL 进行编码，防止特殊字符导致 JS 错误
                const safeUrl = strValue.replace(/'/g, "\\'");
                return `<img src="${Utils.escapeHtml(strValue)}" class="lens-cell-img" onclick="window.DataLensPageInstance._showImagePreview('${safeUrl}')">`;
            }

            if (strValue.startsWith('http')) {
                return `<a href="${Utils.escapeHtml(strValue)}" target="_blank" class="lens-cell-link">查看链接</a>`;
            }

            // 长文本处理
            if (strValue.length > 50) {
                return `<span class="lens-cell-text" title="${Utils.escapeHtml(strValue)}">${Utils.escapeHtml(strValue.substring(0, 50))}...</span>`;
            }

            return Utils.escapeHtml(strValue);
        } catch (e) {
            console.error('格式化单元格失败:', e, { value, field });
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
        html += `<button class="lens-page-btn" data-action="first" ${current === 1 ? 'disabled' : ''} title="首页">«</button>`;
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
        html += `<button class="lens-page-btn" data-action="last" ${current === total ? 'disabled' : ''} title="末页">»</button>`;

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
                    <h4>🔽 数据筛选</h4>
                    <button class="lens-btn-icon lens-filter-close">✕</button>
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
                return `<option value="${f}" ${f === field ? 'selected' : ''}>${t}</option>`;
            }).join('')}
                            </select>
                            <select class="form-control lens-filter-op">
                                ${operators.map(op => `<option value="${op.value}" ${condOp === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
                            </select>
                            <input type="text" class="form-control lens-filter-value" placeholder="值" value="${Utils.escapeHtml(String(condValue))}">
                            <button class="lens-btn-icon lens-filter-remove" title="删除">🗑️</button>
                        </div>
                    `;
        }).join('')}
                </div>
                <div class="lens-panel-actions">
                    <button class="lens-btn lens-btn-sm lens-filter-add">+ 添加条件</button>
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
                    <h4>↕️ 多字段排序</h4>
                    <button class="lens-btn-icon lens-sort-close">✕</button>
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
            return `<option value="${f}" ${f === sort.field ? 'selected' : ''}>${t}</option>`;
        }).join('')}
                            </select>
                            <select class="form-control lens-sort-direction">
                                <option value="asc" ${sort.order === 'asc' ? 'selected' : ''}>升序 ↑</option>
                                <option value="desc" ${sort.order === 'desc' ? 'selected' : ''}>降序 ↓</option>
                            </select>
                            <button class="lens-btn-icon lens-sort-remove" title="删除">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                <div class="lens-panel-actions">
                    <button class="lens-btn lens-btn-sm lens-sort-add">+ 添加排序</button>
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
        tab.filters[`_new_${Date.now()}`] = { op: 'eq', value: '' };
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
        tab.filters = { [`_new_${Date.now()}`]: { op: 'eq', value: '' } };
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

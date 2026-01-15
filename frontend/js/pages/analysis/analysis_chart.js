/**
 * 数据分析模块 - 图表分析功能
 */

const AnalysisChartMixin = {

    /**
     * 渲染图表分析页面
     */
    renderCharts() {
        // 1. 详细查看模式
        if (this.state.viewingChartId) {
            return this.renderChartViewer();
        }

        // 2. 图表库模式
        if (this.state.showChartHub) {
            return this.renderChartHub();
        }

        // 3. 默认：图表生成工作区
        return this.renderChartWorkspace();
    },

    /**
     * 渲染图表生成工作区
     */
    renderChartWorkspace() {
        const { datasets } = this.state;
        // 使用 state 中的 config 或者默认值
        const configValues = this.state.chartConfig || {
            datasetId: this.state.chartDatasetId,
            chartType: this.state.chartType || 'bar'
        };

        // 使用 ChartConfigUI 生成统一配置表单
        const formHtml = ChartConfigUI.getFormHtml({
            values: configValues,
            datasets: datasets,
            showLayoutConfig: false // 工作区不需要布局大小配置
        });

        return `
            <div class="p-20 charts-page anim-fade-in">
                <div class="flex-between mb-25">
                    <div>
                        <h2 class="m-0">📊 图表分析</h2>
                        <p class="text-secondary text-sm mt-5">多维数据探索与可视化建模</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-open-chart-hub">
                        🗃️ 查看图表库
                    </button>
                </div>
                
                <div class="charts-layout" style="display: grid; grid-template-columns: 350px 1fr; gap: 20px; align-items: start;">
                    <!-- 左侧：配置面板 -->
                    <div class="chart-config-panel bg-card rounded-xl border p-20 shadow-sm" style="max-height: calc(100vh - 180px); overflow-y: auto;">
                        <h4 class="mt-0 mb-15 text-sm font-bold">图表配置</h4>
                        
                        ${formHtml}
                        
                        <div class="flex-column gap-10 mt-20 pt-15 border-top">
                            <button class="btn btn-primary w-100" id="btn-generate-chart" style="transition: all 0.1s ease;">🎨 生成图表</button>
                            <button class="btn btn-outline-primary w-100" id="btn-save-chart" 
                                    ${!this.state.hasGeneratedChart ? 'disabled' : ''}
                                    style="transition: all 0.1s ease; ${!this.state.hasGeneratedChart ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                💾 保存图表
                            </button>
                        </div>
                    </div>
                    
                    <!-- 右侧：图表展示区 -->
                    <div class="chart-main-area bg-card rounded-xl border shadow-sm p-30" style="min-height: 600px; display: flex; flex-direction: column;">
                        <div id="chart-container" style="flex: 1; min-height: 500px;">
                            <div class="h-100 flex-center text-secondary italic">
                                <div>
                                    <div style="font-size: 40px; margin-bottom: 15px;">📊</div>
                                    <p>请在左侧配置参数并点击生成</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染图表库
     */
    renderChartHub() {
        return `
            <div class="p-25 charts-page anim-fade-in">
                <div class="flex-between mb-30">
                    <div class="flex-center gap-15">
                        <button class="btn-icon" id="btn-close-chart-hub">⬅️</button>
                        <div>
                            <h2 class="m-0">🗃️ 图表库</h2>
                            <p class="text-secondary text-sm mt-5">管理和调用已保存的业务图表组件</p>
                        </div>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-secondary btn-sm" id="btn-refresh-charts">
                            🔄 刷新列表
                        </button>
                        <button class="btn btn-primary btn-sm" id="btn-goto-generator">
                            ➕ 新建图表分析
                        </button>
                    </div>
                </div>

                <div id="saved-charts-list" class="flex flex-wrap gap-20">
                    <div class="text-center p-50 w-100 text-secondary bg-tertiary rounded-xl border-dashed">
                        <span class="anim-pulse">正在获取同步云端资产...</span>
                    </div>
                </div>
            </div>
        `;
    },



    /**
     * 渲染单个图表的详情查看页面
     */
    renderChartViewer() {
        const chartId = this.state.viewingChartId;
        const chart = this.state.savedCharts?.find(c => c.id === chartId);
        if (!chart) return `<div class="p-40 text-center">图表已失效</div>`;

        const dsName = this.state.datasets?.find(d => d.id === chart.dataset_id)?.name || '未知数据集';

        return `
            <div class="flex-column h-100 anim-fade-in" style="background: var(--color-bg-secondary);">
                <!-- 顶部导航 -->
                <div class="flex-between px-20 py-12 border-bottom bg-primary shadow-sm">
                    <div class="flex-center gap-15">
                        <button class="btn btn-ghost btn-sm" id="btn-close-chart-viewer">
                            <span style="font-size: 18px;">⬅️</span> 返回列表
                        </button>
                        <div class="flex-column">
                            <h3 class="m-0 text-md">${chart.name}</h3>
                            <span class="text-xs text-secondary">资源类型: 可视化图表 / 数据源: ${dsName}</span>
                        </div>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-primary btn-sm" id="btn-export-viewer-chart">🖨️ 导出图片</button>
                    </div>
                </div>

                <!-- 内容区 -->
                <div class="flex-1 p-25 overflow-y-auto">
                    <div class="max-w-1000 mx-auto">
                        <!-- 图表主展示卡片 -->
                        <div class="bg-card rounded-xl shadow-lg border p-25 mb-25" style="min-height: 500px;">
                            <div id="viewer-chart-container" style="width: 100%; height: 500px;"></div>
                        </div>

                        <!-- 详情信息网格 -->
                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                            <div class="bg-card rounded-xl border p-20 shadow-sm">
                                <h4 class="mt-0 mb-15 text-sm text-secondary">📝 图表描述</h4>
                                <p class="m-0 text-sm line-height-relaxed">
                                    ${chart.description || '<span class="text-tertiary italic">暂无详细描述...</span>'}
                                </p>
                            </div>
                            <div class="bg-card rounded-xl border p-20 shadow-sm">
                                <h4 class="mt-0 mb-15 text-sm text-secondary">📊 元数据</h4>
                                <div class="flex-column gap-10">
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">图表类型</span>
                                        <span class="badge badge-info">${this.getChartTypeName(chart.chart_type)}</span>
                                    </div>
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">维度 (X轴)</span>
                                        <span class="font-bold">${chart.config.xField || '-'}</span>
                                    </div>
                                    <div class="flex-between text-xs">
                                        <span class="text-secondary">指标 (Y轴)</span>
                                        <span class="font-bold">${chart.config.yField || '-'}</span>
                                    </div>
                                    <div class="flex-between text-xs border-top pt-10 mt-5">
                                        <span class="text-secondary">收录时间</span>
                                        <span>${Utils.formatDate(chart.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 生成图表逻辑
     */
    async generateChart() {
        // 使用 ChartConfigUI 统一获取并处理表单值
        const values = ChartConfigUI.getFormValues(document);

        if (!values.datasetId) {
            Toast.error('请选择数据集');
            return;
        }

        // 验证字段选择
        if (values.chartType === 'heatmap') {
            if (!values.xFields || values.xFields.length < 2) {
                Toast.error('热力图需要选择至少2个数值字段');
                return;
            }
        } else {
            if (!values.xField) {
                Toast.error('请选择X轴字段');
                return;
            }
            if (!values.yField) {
                Toast.error('请选择Y轴字段');
                return;
            }
        }

        Toast.info('正在生成图表...');

        // 获取数据
        let data = await this.fetchChartData(parseInt(values.datasetId));
        if (!data || data.length === 0) {
            Toast.error('数据集为空');
            return;
        }

        // 应用数据过滤 (委托给 ChartFactory)
        data = ChartFactory.filterData(data, values);

        if (data.length === 0) {
            Toast.error('过滤后数据为空');
            return;
        }

        // 保存当前配置到 state
        this.state.chartConfig = values;
        this.state.chartDatasetId = values.datasetId;
        this.state.chartType = values.chartType;

        // 初始化图表容器
        const result = this._initChartContainer('chart-container', 'chartInstance');
        if (!result) return;
        const { instance } = result;

        // 生成图表 Option
        let option = {};

        try {
            const chartType = values.chartType;
            // 基础图表统一使用 Utils.aggregateData 处理（包括不聚合的情况）
            if (['bar', 'line', 'pie', 'scatter'].includes(chartType) && values.xField && values.yField) {
                const aggregationType = values.aggregationType || 'none';

                // 聚合数据，使用内置排序（性能优化版）
                const aggregatedData = Utils.aggregateData(data, values.xField, values.yField, aggregationType, {
                    maxItems: 20,
                    sortField: values.sortField,
                    sortOrder: values.sortOrder,
                    originalYField: values.yField
                });

                // 检查聚合后的数据是否为空
                if (!aggregatedData || aggregatedData.length === 0) {
                    Toast.error('数据聚合后为空，请检查字段选择');
                    return;
                }

                option = ChartFactory.generateOption(chartType, aggregatedData, {
                    ...values,
                    xField: 'name',  // 数据字段名
                    yField: 'value', // 数据字段名
                    xLabel: values.xField, // 原始X轴字段名用于标签显示
                    yLabel: values.yField  // 原始Y轴字段名用于标签显示
                }, data);
            } else {
                // 其他情况直接使用
                option = ChartFactory.generateOption(chartType, data, values);
            }

            // 渲染图表
            if (option && Object.keys(option).length > 0) {
                instance.setOption(option, true);
                this._finalizeChartRender(instance, '图表生成成功');
            } else {
                Toast.error('图表生成失败：配置无效或数据不足');
            }
        } catch (e) {
            Toast.error(`生成出错: ${e.message}`);
        }

        // 生成成功后启用保存按钮
        this.state.hasGeneratedChart = true;
        const saveBtn = document.getElementById('btn-save-chart');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }
    },

    /**
     * 数据聚合处理 (委托给 Utils.aggregateData)
     */


    /**
     * 确保 resize 监听器已添加（避免重复添加）
     * @param {string} instanceKey - 实例键名
     * @param {string} handlerKey - 处理器键名
     */
    _ensureResizeHandler(instanceKey, handlerKey) {
        if (!this[handlerKey]) {
            this[handlerKey] = () => {
                if (this[instanceKey]) {
                    this[instanceKey].resize();
                }
            };
            window.addEventListener('resize', this[handlerKey]);
        }
    },

    /**
     * 统一的容器初始化和图表实例管理（使用 ChartHelper）
     * @param {string} containerId - 容器ID
     * @param {string} instanceKey - 实例键名 ('chartInstance' 或 'viewerChartInstance')
     * @returns {Object|null} - {container, instance} 或 null
     */
    _initChartContainer(containerId, instanceKey = 'chartInstance') {
        // 销毁旧实例
        const oldInstance = this[instanceKey];
        if (oldInstance) {
            ChartHelper.disposeChart(oldInstance);
            this[instanceKey] = null;
        }

        // 使用统一的图表初始化工具
        const result = ChartHelper.initChart(containerId, { theme: 'dark' });
        if (!result) {
            Toast.error('图表初始化失败');
            return null;
        }

        this[instanceKey] = result.instance;
        return result;
    },

    /**
     * 统一的图表渲染后处理（resize 和成功提示）
     * @param {Object} instance - ECharts 实例
     * @param {string} successMessage - 成功消息
     */
    _finalizeChartRender(instance, successMessage) {
        if (!instance) return;

        // resize 已在 ChartHelper.renderChart 中处理，这里只显示消息
        if (successMessage) {
            Toast.success(successMessage);
        }
    },

    /**
     * 当数据集切换时，更新可选字段列表
     */
    async updateFieldOptions(datasetId) {
        if (!datasetId) return;

        try {
            const res = await AnalysisApi.getDatasetData(datasetId, { page: 1, size: 1 });
            const columns = res.data?.columns || [];

            // 生成选项 HTML
            const optionsHtml = columns.map(c => `<option value="${c}">${c}</option>`).join('');

            // 使用 ChartConfigUI 的统一更新方法
            ChartConfigUI.updateFieldOptions(optionsHtml);

        } catch (e) {
            console.error('获取字段失败', e);
        }
    },



    /**
     * 保存当前图表配置
     */
    async saveJsonChart() {
        // 使用 ChartConfigUI 获取最新配置，而不是依赖 state
        const values = ChartConfigUI.getFormValues(document);

        if (!values || !values.datasetId) {
            return Toast.error('请先生成图表');
        }

        const datasetId = values.datasetId;
        // 移除 datasetId，只保存配置
        const config = { ...values };
        delete config.datasetId;

        // 默认标题
        const defaultName = values.title || '新建数据图表';

        Modal.show({
            title: '保存图表',
            content: `
                <div class="form-group">
                    <label>图表名称</label>
                    <input type="text" id="save-chart-name" class="form-control" value="${Utils.escapeHtml(defaultName)}" placeholder="请输入图表名称">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="save-chart-desc" class="form-control" rows="3"></textarea>
                </div>
            `,
            onConfirm: async () => {
                const name = document.getElementById('save-chart-name').value;
                const description = document.getElementById('save-chart-desc').value;
                if (!name) return Toast.error('请输入名称');

                try {
                    const res = await AnalysisApi.createChart({
                        name,
                        dataset_id: parseInt(datasetId),
                        chart_type: values.chartType,
                        config,
                        description
                    });
                    Toast.success('图表保存成功');

                    // 保存成功后刷新图表列表
                    if (this.state.showChartHub) {
                        setTimeout(() => {
                            this.updateSavedChartsList();
                        }, 300);
                    }

                    return true;
                } catch (e) {
                    Toast.error('保存失败: ' + e.message);
                }
            }
        });
    },

    /**
     * 获取图表类型名称
     */
    getChartTypeName(type) {
        const maps = {
            'bar': '柱状图',
            'pie': '饼图',
            'line': '折线图',
            'scatter': '散点图',
            'histogram': '直方图',
            'boxplot': '箱线图',
            'heatmap': '热力图',
            'forecast': '趋势预测'
        };
        return maps[type] || type;
    },

    /**
     * 更新已保存图表列表
     */
    async updateSavedChartsList() {
        const container = document.getElementById('saved-charts-list');
        if (!container) {
            // 容器不存在时静默返回，避免在非图表页面产生警告
            // 这是正常情况（ChartHub 未打开时）
            return;
        }

        try {
            const res = await AnalysisApi.getCharts();

            // 检查响应格式
            if (!res || !res.data) {
                container.innerHTML = '<div class="text-danger p-20">图表库同步失败：响应格式错误</div>';
                return;
            }

            const charts = Array.isArray(res.data) ? res.data : [];
            this.state.savedCharts = charts;

            if (charts.length === 0) {
                container.innerHTML = `
                    <div class="p-40 text-center w-100 bg-tertiary rounded-xl" style="border: 2px dashed var(--color-border);">
                        <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📊</div>
                        <p class="text-secondary m-0" style="font-size: 16px; font-weight: 500;">暂无保存的图表配置</p>
                        <p class="text-tertiary text-sm mt-10 mb-15">请先在图表生成器中创建并保存图表</p>
                        <button class="btn btn-primary btn-sm" id="btn-goto-generator-from-empty">
                            ➕ 去创建图表
                        </button>
                    </div>`;

                // 绑定"去创建图表"按钮
                setTimeout(() => {
                    const btn = document.getElementById('btn-goto-generator-from-empty');
                    if (btn) {
                        btn.onclick = () => {
                            this.setState({ showChartHub: false });
                        };
                    }
                }, 50);
                return;
            }

            const html = charts.map(c => {
                const dsName = this.state.datasets?.find(d => d.id === c.dataset_id)?.name || '未知数据集';
                const typeInfo = this.getChartTypeName(c.chart_type);
                return `
                    <div class="saved-chart-card p-0 border rounded-xl bg-card shadow-sm hover-shadow-lg transition-all anim-scale-in" style="width: 260px; overflow: hidden;">
                        <div class="p-15 border-bottom flex-between bg-tertiary">
                             <div class="flex-center gap-8">
                                <span class="text-lg">${this.getChartIcon(c.chart_type)}</span>
                                <strong class="text-sm truncate" title="${c.name || '未命名图表'}" style="max-width: 150px;">${c.name || '未命名图表'}</strong>
                             </div>
                             <button class="btn-icon text-danger hover-bg-danger-light btn-delete-saved-chart" data-id="${c.id}" title="彻底删除">🗑️</button>
                        </div>
                        <div class="p-15">
                            <div class="flex-between mb-8 text-xs">
                                <span class="text-secondary">类型</span>
                                <span class="text-primary font-bold">${typeInfo}</span>
                            </div>
                            <div class="flex-between mb-8 text-xs">
                                <span class="text-secondary">数据源</span>
                                <span class="truncate text-right" style="max-width: 120px;">${dsName}</span>
                            </div>
                            <div class="flex-between mb-15 text-xs">
                                <span class="text-secondary">创建时间</span>
                                <span class="text-tertiary" style="font-size: 10px;">${c.created_at ? Utils.formatDate(c.created_at) : '未知'}</span>
                            </div>
                            <div class="flex gap-8">
                                <button class="btn btn-primary btn-xs flex-1 btn-view-saved-chart" data-id="${c.id}">🔍 查看</button>
                                <button class="btn btn-secondary btn-xs btn-refresh-chart" data-id="${c.id}" title="使用最新数据刷新图表">🔄</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // 更新容器内容
            container.innerHTML = html;

            // 重新绑定事件（因为 innerHTML 会清除事件监听器）
            this._rebindChartCardEvents();
        } catch (e) {
            container.innerHTML = `<div class="text-danger p-20">
                <p>图表库同步失败</p>
                <p class="text-xs mt-5">${e.message || '请检查网络连接'}</p>
            </div>`;
        }
    },

    _rebindChartCardEvents() {
        // 重新绑定图表卡片的事件（因为 innerHTML 会清除事件监听器）
        // 这些事件已经在 bindChartEvents 中通过 delegate 绑定
    },

    /**
     * 获取图表图标
     */
    getChartIcon(type) {
        const icons = {
            'bar': '📊', 'pie': '🥧', 'line': '📈', 'scatter': '⚬',
            'histogram': '📶', 'boxplot': '📦', 'heatmap': '🔥', 'forecast': '🔮'
        };
        return icons[type] || '📈';
    },

    /**
     * 绑定图表相关事件
     */
    bindChartEvents() {
        if (this._chartEventsBound) return;
        this._chartEventsBound = true;

        // 切换到图表库
        this.delegate('click', '#btn-open-chart-hub', () => {
            this.setState({ showChartHub: true });
            setTimeout(() => {
                this._triggerHubUpdate();
            }, 100);
        });

        // 刷新按钮 (ChartHub)
        this.delegate('click', '#btn-refresh-charts', () => {
            this.updateSavedChartsList();
        });

        // 返回生成器
        this.delegate('click', '#btn-close-chart-hub, #btn-goto-generator', () => {
            this.setState({ showChartHub: false });
        });

        // 详细查看图表
        this.delegate('click', '.btn-view-saved-chart', (e, el) => {
            const id = parseInt(el.dataset.id);
            this.setState({ viewingChartId: id });
            setTimeout(() => {
                const chart = this.state.savedCharts?.find(c => c.id === id);
                if (chart) {
                    this.renderChartByConfig('viewer-chart-container', chart);
                }
            }, 100);
        });

        // 关闭查看器
        this.delegate('click', '#btn-close-chart-viewer', () => {
            this.setState({ viewingChartId: null });
            if (this.viewerChartInstance) {
                ChartHelper.disposeChart(this.viewerChartInstance);
                this.viewerChartInstance = null;
            }
            if (this.state.showChartHub) {
                this._triggerHubUpdate();
            }
        });

        // 导出查看器图表（使用统一工具）
        this.delegate('click', '#btn-export-viewer-chart', () => {
            if (this.viewerChartInstance) {
                ChartHelper.downloadChartImage(
                    this.viewerChartInstance,
                    `图表导出_${new Date().getTime()}.png`,
                    { type: 'png', pixelRatio: 2, backgroundColor: '#1a1a1c' }
                );
            } else {
                Toast.error('图表渲染中，请稍后...');
            }
        });

        // 生成图表按钮
        this.delegate('click', '#btn-generate-chart', () => {
            this.generateChart();
        });

        // 保存图表按钮
        this.delegate('click', '#btn-save-chart', async () => {
            await this.saveJsonChart();
            this.updateSavedChartsList();
        });

        // ChartConfigUI 交互逻辑委托
        // 1. 数据集选择变化
        this.delegate('change', '#cfg-w-dataset', (e, el) => {
            this.state.chartDatasetId = el.value;
            this.state.hasGeneratedChart = false;
            this.state.chartConfig = null;
            this.updateFieldOptions(el.value);

            // 更新保存按钮状态
            const saveBtn = document.getElementById('btn-save-chart');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
            }
        });

        // 2. 图表类型变化时重置生成状态
        this.delegate('change', '#cfg-w-type', () => {
            this.state.hasGeneratedChart = false;
        });

        // 3. 筛选字段变化
        this.delegate('change', '#cfg-w-filter-field', (e, el) => {
            const filterValueGroup = document.getElementById('chart-filter-value-group');
            if (filterValueGroup) {
                filterValueGroup.style.display = el.value ? 'block' : 'none';
            }
        });

        // 删除已保存图表
        this.delegate('click', '.btn-delete-saved-chart', async (e, el) => {
            if (!confirm('确定要删除该图表配置吗？')) return;
            try {
                await AnalysisApi.deleteChart(el.dataset.id);
                Toast.success('删除成功');
                this.updateSavedChartsList();
            } catch (e) {
                Toast.error('删除失败');
            }
        });

        // 刷新图表（重新获取最新数据渲染）
        this.delegate('click', '.btn-refresh-chart', async (e, el) => {
            const chartId = parseInt(el.dataset.id);
            const chart = this.state.savedCharts?.find(c => c.id === chartId);
            if (!chart) return;
            Toast.info('正在刷新图表数据...');
            this.setState({ viewingChartId: chartId });
            setTimeout(async () => {
                await this.renderChartByConfig('viewer-chart-container', chart);
                Toast.success('图表已使用最新数据刷新');
            }, 100);
        });
    },

    /**
     * 根据保存的配置渲染图表 (通用方法)
     */
    async renderChartByConfig(containerId, chart) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 获取数据
        let data = await this.fetchChartData(chart.dataset_id);
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="flex-center h-100 text-secondary">数据集为空或无法加载</div>';
            return;
        }

        const config = chart.config || {};

        // 应用数据过滤和排序 (确保查看保存的图表也支持排除项、筛选和排序)
        data = ChartFactory.filterData(data, config);

        if (data.length === 0) {
            container.innerHTML = '<div class="flex-center h-100 text-secondary">筛选后数据为空</div>';
            return;
        }

        // 使用统一的容器初始化方法
        const result = this._initChartContainer(containerId, 'viewerChartInstance');
        if (!result) return;

        const { instance: chartInstance } = result;

        // 生成图表 Option
        let option = {};
        const chartType = chart.chart_type;

        try {
            if (['bar', 'line', 'pie', 'scatter'].includes(chartType)) {
                if (config.xField) {
                    // 聚合数据，使用内置排序（性能优化版）
                    const aggregatedData = Utils.aggregateData(data, config.xField, config.yField, config.aggregationType || 'none', {
                        maxItems: 20,
                        sortField: config.sortField,
                        sortOrder: config.sortOrder,
                        originalYField: config.yField
                    });

                    option = ChartFactory.generateOption(chartType, aggregatedData, config, data);
                } else {
                    option = { title: { text: '配置不完整：缺少维度字段', left: 'center', textStyle: { color: '#888' } } };
                }
            } else {
                option = ChartFactory.generateOption(chartType, data, config);
            }

            if (option && Object.keys(option).length > 0) {
                chartInstance.setOption(option, true);
                this._finalizeChartRender(chartInstance);
            } else {
                chartInstance.setOption({
                    title: { text: '配置无效或数据不足', left: 'center', textStyle: { color: '#888' } },
                    backgroundColor: 'transparent'
                }, true);
            }
        } catch (e) {
            chartInstance.setOption({
                title: { text: '图表渲染出错', left: 'center', textStyle: { color: '#888' } }
            });
        }

        // 使用统一的 resize 处理
        this._finalizeChartRender(chartInstance, null);

        // 添加 resize 监听器（避免重复添加）
        this._ensureResizeHandler('viewerChartInstance', '_viewerResizeHandler');
    },

    _renderStaticBaseChart(instance, type, data, xLabel, yLabel) {
        const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: type === 'pie' ? 'item' : 'axis' },
            legend: { top: 10, textStyle: { color: '#aaa' } },
            grid: { top: 70, bottom: 40, left: 60, right: 30 },
            xAxis: type === 'pie' ? undefined : {
                type: 'category',
                data: data.map(d => d.name),
                axisLabel: { color: '#888' }
            },
            yAxis: type === 'pie' ? undefined : {
                type: 'value',
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [{
                name: yLabel,
                type: type,
                data: type === 'pie' ? data.map(d => ({ name: d.name, value: d.value })) : data.map(d => d.value),
                radius: type === 'pie' ? '65%' : undefined,
                center: type === 'pie' ? ['50%', '55%'] : undefined,
                smooth: true,
                itemStyle: {
                    borderRadius: type === 'bar' ? [6, 6, 0, 0] : 0,
                    color: type === 'line' ? '#5470c6' : undefined
                },
                areaStyle: type === 'line' ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(84, 112, 198, 0.4)' },
                        { offset: 1, color: 'rgba(84, 112, 198, 0)' }
                    ])
                } : undefined
            }]
        };
        instance.setOption(option);
    },

    _renderStaticHistogram(instance, data, field) {
        // histogram 等高级图表逻辑较复杂，建议后续统一抽取渲染类，此处先支持基础预览
        const values = data.map(d => parseFloat(d[field])).filter(v => !isNaN(v));
        const option = {
            backgroundColor: 'transparent',
            xAxis: { scale: true },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: values.slice(0, 50) }] // 简易预览
        };
        instance.setOption(option);
    },

    _renderStaticBoxplot(instance, data, field) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '箱线图预览', left: 'center', textStyle: { color: '#888' } } });
    },

    _renderStaticHeatmap(instance, data, fields) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '热力图预览', left: 'center', textStyle: { color: '#888' } } });
    },

    _renderStaticForecast(instance, data, x, y, steps) {
        instance.setOption({ backgroundColor: 'transparent', title: { text: '趋势预测预览', left: 'center', textStyle: { color: '#888' } } });
    },

    /**
     * 辅助方法：触发资产库更新
     */
    _triggerHubUpdate(attempts = 0) {
        if (attempts > 10) {
            return;
        }

        const container = document.getElementById('saved-charts-list');
        if (container) {
            this.updateSavedChartsList();
        } else {
            setTimeout(() => this._triggerHubUpdate(attempts + 1), 100);
        }
    }
};

// 将方法混入到 AnalysisPage.prototype
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisChartMixin);
}

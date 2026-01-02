/**
 * 数据分析模块 - 智能报告功能 (Toast UI Markdown 版)
 * 
 * 基于 Toast UI Editor 构建的智能报告系统
 * 后端使用 Markdown 解析和 WeasyPrint 生成高清 PDF
 */

const AnalysisSmartReportMixin = {

    // Toast UI 编辑器实例
    _tuiEditor: null,

    // ==================== 视图路由 ====================

    renderSmartReport() {
        // 根据状态决定显示哪个视图
        if (this.state.historyReportId) {
            return this.renderHistoryList();
        }
        if (this.state.editingReportId) {
            return this.renderReportEditor(this.state.editingReportId);
        }
        return this.renderTemplateList();
    },

    // ==================== 1. 模板列表视图 ====================

    renderTemplateList() {
        const reports = this.state.smartReports || [];
        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <div>
                        <h2>智能报告</h2>
                        <p class="text-secondary">使用 Markdown 编辑器创建高清专业报告</p>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-secondary" id="btn-import-report">
                            📥 导入模板
                        </button>
                        <button class="btn btn-primary" id="btn-create-report">
                            ➕ 新建模板
                        </button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                    ${reports.length > 0 ? reports.map(r => this._renderTemplateCard(r)).join('') : this._renderEmptyState()}
                </div>
            </div>
        `;
    },

    _renderTemplateCard(report) {
        const varsCount = (report.template_vars || []).length;
        const updatedAt = Utils.formatDate(report.updated_at);
        return `
            <div class="card p-0 overflow-hidden hover-shadow transition-all" style="border: 1px solid var(--color-border); border-radius: 12px;">
                <div class="p-12 bg-primary-light flex-between align-center" style="height: 48px;">
                    <div class="icon-box bg-white rounded-circle flex-center" style="width: 32px; height: 32px;">
                        <span style="font-size: 16px;">📄</span>
                    </div>
                    <button class="btn btn-ghost btn-sm text-secondary btn-delete-template" data-id="${report.id}">
                        🗑️ 删除
                    </button>
                </div>
                <div class="p-15">
                    <h3 class="text-md font-bold mb-5 truncate" title="${report.name}">${report.name}</h3>
                    <p class="text-secondary mb-10" style="font-size: 12px;">📅 ${updatedAt}</p>
                    <p class="text-secondary mb-15"><span class="badge badge-info">${varsCount} 个变量</span></p>
                    <div class="flex gap-8 mt-12">
                        <button class="btn btn-primary btn-sm flex-1 btn-edit-template" data-id="${report.id}">✏️ 编辑设计</button>
                        <button class="btn btn-secondary btn-sm flex-1 btn-view-history" data-id="${report.id}">📂 历史记录</button>
                    </div>
                    <div class="flex gap-8 mt-8">
                        <button class="btn btn-outline btn-sm flex-1 btn-export-template" data-id="${report.id}" title="导出模板">📤 导出</button>
                        <button class="btn btn-outline btn-sm flex-1 btn-duplicate-template" data-id="${report.id}" title="复制模板">📋 复制</button>
                    </div>
                </div>
            </div>
        `;
    },

    _renderEmptyState() {
        return `
            <div class="card p-40 text-center" style="grid-column: 1 / -1;">
                <div style="font-size: 64px; margin-bottom: 20px; opacity: 0.5;">📝</div>
                <h3 class="mb-10">暂无报告模板</h3>
                <p class="text-secondary mb-20">点击"新建模板"开始采用 Markdown 设计您的第一个智能报告</p>
                <button class="btn btn-primary" id="btn-create-report-empty">➕ 新建模板</button>
            </div>
        `;
    },

    // ==================== 2. 编辑器视图 ====================

    renderReportEditor(reportId) {
        const report = (this.state.smartReports || []).find(r => String(r.id) === String(reportId));
        if (!report) return '<div class="p-20">模板不存在或已删除</div>';

        const vars = report.template_vars || [];
        const datasets = this.state.datasets || [];
        const charts = this.state.analysisCharts || [];

        return `
            <div class="h-100 flex-column overflow-hidden">
                <!-- 顶部导航栏 -->
                <div class="p-10 border-bottom flex-between bg-card" style="background: var(--color-bg-primary); height: 50px;">
                    <div class="flex-center gap-15">
                        <button class="btn btn-ghost btn-back-list">⬅️ 返回</button>
                        <h3 class="m-0 text-md truncate" style="max-width: 300px;">${report.name}</h3>
                        <span class="badge badge-info">${vars.length} 个变量</span>
                    </div>
                    <div class="flex gap-10 align-center">
                        <div class="preview-mode-switcher">
                            <button class="mode-btn ${(!this.state.previewMode || this.state.previewMode === 'edit') ? 'active' : ''}" id="btn-edit-mode" title="编辑模式">
                                <span>✏️</span> 编辑
                            </button>
                            <button class="mode-btn ${this.state.previewMode === 'split' ? 'active' : ''}" id="btn-split-mode" title="分屏模式">
                                <span>📑</span> 分屏
                            </button>
                            <button class="mode-btn ${this.state.previewMode === 'preview' ? 'active' : ''}" id="btn-preview-mode" title="预览模式">
                                <span>👁️</span> 预览
                            </button>
                        </div>
                        <div style="width: 1px; height: 24px; background: var(--color-border);"></div>
                        <button class="btn btn-outline-primary btn-sm btn-save-template" data-id="${report.id}">💾 保存设计</button>
                        <button class="btn btn-primary btn-sm btn-generate-report" data-id="${report.id}">📥 高清 PDF 导出</button>
                    </div>
                </div>
                
                <div class="report-editor-layout">
                    <!-- 左侧：数据源配置 -->
                    <div class="report-sidebar-left">
                        ${this._renderDatasourcePanel(datasets)}
                    </div>
                    
                    <!-- 中间主区域：编辑器 + 预览 -->
                    <div class="report-center-area">

                        
                        <!-- 编辑器区域 -->
                        <div class="report-editor-section ${this.state.previewMode === 'preview' ? 'hidden' : ''}">
                            <div class="section-header">
                                <span class="header-icon">✏️</span>
                                <span class="header-title">Markdown 编辑</span>
                            </div>
                            <!-- 自定义工具栏 -->
                            <div class="custom-editor-toolbar" id="custom-toolbar">
                                <div class="toolbar-group">
                                    <button class="toolbar-btn" data-cmd="heading" title="标题">H</button>
                                    <button class="toolbar-btn" data-cmd="bold" title="粗体"><b>B</b></button>
                                    <button class="toolbar-btn" data-cmd="italic" title="斜体"><i>I</i></button>
                                    <button class="toolbar-btn" data-cmd="strike" title="删除线"><s>S</s></button>
                                </div>
                                <div class="toolbar-divider"></div>
                                <div class="toolbar-group">
                                    <select class="toolbar-select" id="toolbar-font-family" title="字体">
                                        <option value="">字体</option>
                                        <option value="Microsoft YaHei">微软雅黑</option>
                                        <option value="SimSun">宋体</option>
                                        <option value="SimHei">黑体</option>
                                        <option value="KaiTi">楷体</option>
                                        <option value="Arial">Arial</option>
                                    </select>
                                    <select class="toolbar-select" id="toolbar-font-size" title="字号">
                                        <option value="">字号</option>
                                        <option value="12px">12px</option>
                                        <option value="14px">14px</option>
                                        <option value="16px">16px</option>
                                        <option value="18px">18px</option>
                                        <option value="20px">20px</option>
                                        <option value="24px">24px</option>
                                        <option value="28px">28px</option>
                                    </select>
                                    <input type="color" class="toolbar-color" id="toolbar-font-color" value="#000000" title="字体颜色">
                                </div>
                                <div class="toolbar-divider"></div>
                                <div class="toolbar-group">
                                    <button class="toolbar-btn" data-cmd="ul" title="无序列表">•</button>
                                    <button class="toolbar-btn" data-cmd="ol" title="有序列表">1.</button>
                                    <button class="toolbar-btn" data-cmd="quote" title="引用">❝</button>
                                    <button class="toolbar-btn" data-cmd="hr" title="分隔线">─</button>
                                </div>
                                <div class="toolbar-divider"></div>
                                <div class="toolbar-group">
                                    <button class="toolbar-btn" data-cmd="table" title="表格">▦</button>
                                    <button class="toolbar-btn" data-cmd="link" title="链接">🔗</button>
                                    <button class="toolbar-btn" data-cmd="code" title="代码">&lt;/&gt;</button>
                                </div>
                            </div>
                            <div id="tui-editor-container" class="editor-body"></div>
                        </div>
                        
                        <!-- 预览区域 -->
                        <div class="report-preview-section ${this.state.previewMode === 'edit' ? 'hidden' : ''}">
                            <div class="section-header">
                                <span class="header-icon">👁️</span>
                                <span class="header-title">实时预览</span>
                                <div class="preview-actions">
                                    <button class="btn-preview-refresh btn-ghost btn-sm" id="btn-refresh-preview" title="刷新预览">
                                        🔄
                                    </button>
                                    <button class="btn-preview-zoom btn-ghost btn-sm" id="btn-zoom-preview" title="全屏预览">
                                        🔍
                                    </button>
                                </div>
                            </div>
                            <div id="report-preview-content" class="preview-body pdf-preview-style"></div>
                        </div>
                    </div>

                    <!-- 右侧：图表组件 -->
                    <div class="report-sidebar-right">
                        ${this._renderChartsPanel(charts)}
                    </div>
                </div>
            </div>
        `;
    },

    _renderDatasourcePanel(datasets) {
        const selectedDataset = this.state.reportDatasetId;
        const datasetColumns = this.state.reportDatasetColumns || [];

        return `
            <div class="section-title">
                <span>📊</span>
                <span>数据源配置</span>
            </div>
            <p class="text-secondary text-xs mb-15">选择数据集注入动态变量</p>
            
            <div class="form-group">
                <label>选择数据集</label>
                <select class="form-control form-control-sm w-100" id="report-dataset-select">
                    <option value="">-- 请选择 --</option>
                    ${datasets.map(d => `<option value="${d.id}" ${String(selectedDataset) === String(d.id) ? 'selected' : ''}>${d.name || '未命名'}</option>`).join('')}
                </select>
            </div>
            
            ${selectedDataset ? `
                <div class="form-group">
                    <label>取值模式</label>
                    <select class="form-control form-control-sm w-100" id="report-dataset-row">
                        <option value="first" ${this.state.reportDatasetRow === 'first' ? 'selected' : ''}>第一行数据</option>
                        <option value="last" ${this.state.reportDatasetRow === 'last' ? 'selected' : ''}>最后一行</option>
                        <option value="sum" ${this.state.reportDatasetRow === 'sum' ? 'selected' : ''}>求和汇总</option>
                        <option value="avg" ${this.state.reportDatasetRow === 'avg' ? 'selected' : ''}>平均值</option>
                    </select>
                </div>
                
                <div class="mt-15" id="dataset-columns-container">
                    <label class="text-xs text-secondary mb-8 block">点击插入变量：</label>
                    <div class="var-tags-wrapper">
                        ${datasetColumns.length > 0 ? datasetColumns.map(col => `
                            <span class="var-tag-btn btn-insert-dataset-var" data-field="${col}">{{${col}}}</span>
                        `).join('') : '<span class="text-tertiary text-xs">加载中...</span>'}
                    </div>
                </div>
            ` : `
                <div class="empty-state mt-20">
                    <div class="icon">📂</div>
                    <p>请先选择数据集</p>
                </div>
            `}
        `;
    },

    _renderChartsPanel(charts) {
        const datasets = this.state.datasets || [];
        const selectedChartSource = this.state.chartSourceDatasetId || '';

        // 根据来源筛选图表
        const filteredCharts = selectedChartSource
            ? charts.filter(c => String(c.dataset_id) === String(selectedChartSource))
            : charts;

        return `
            <div class="section-title">
                <span>📈</span>
                <span>图表组件</span>
            </div>
            <p class="text-secondary text-xs mb-10">选择图表插入到报告</p>
            
            <div class="form-group mb-10">
                <label class="text-xs">图表来源</label>
                <select class="form-control form-control-sm w-100" id="chart-source-select">
                    <option value="">全部图表</option>
                    ${datasets.map(d => `<option value="${d.id}" ${String(selectedChartSource) === String(d.id) ? 'selected' : ''}>${d.name || '未命名'}</option>`).join('')}
                </select>
            </div>
            
            <div class="chart-list" id="chart-list-container">
                ${filteredCharts.length > 0 ? filteredCharts.map(chart => `
                    <div class="chart-item btn-insert-chart" data-id="${chart.id}">
                        <div class="chart-info">
                            <div class="chart-name">${chart.name}</div>
                            <div class="chart-type">${chart.chart_type || 'chart'}</div>
                        </div>
                        <button class="insert-btn">插入</button>
                    </div>
                `).join('') : `
                    <div class="empty-state">
                        <div class="icon">📊</div>
                        <p>暂无图表</p>
                        <p class="mt-5" style="font-size: 11px;">${selectedChartSource ? '该数据集无图表' : '请先创建图表'}</p>
                    </div>
                `}
            </div>
            <div id="hidden-chart-render-container"></div>
        `;
    },

    // ==================== 3. 历史纪录视图 ====================

    renderHistoryList() {
        const records = this.state.historyRecords || [];
        const report = (this.state.smartReports || []).find(r => String(r.id) === String(this.state.historyReportId));
        const reportName = report ? report.name : '报告';

        return `
            <div class="h-100 flex-column">
                <div class="p-15 border-bottom flex-between bg-card" style="background: var(--color-bg-sidebar);">
                    <div class="flex-center gap-15">
                        <button class="btn btn-ghost btn-history-back">⬅️ 返回</button>
                        <h3 class="m-0">📂 ${reportName} - 历史记录</h3>
                    </div>
                </div>
                <div class="flex-1 p-20 scroll-y">
                    ${records.length > 0 ? `
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                            ${records.map(r => `
                                <div class="card p-15 hover-shadow">
                                    <div class="flex-between align-start mb-10">
                                        <div class="font-bold truncate" style="max-width:200px;">${r.name}</div>
                                        <button class="btn btn-ghost btn-xs btn-delete-record" data-id="${r.id}">🗑️</button>
                                    </div>
                                    <div class="text-secondary text-xs mb-10">📅 ${Utils.formatDate(r.created_at)}</div>
                                    <div class="flex gap-10">
                                        ${r.pdf_file_path ? `
                                            <button class="btn btn-sm btn-outline-danger btn-download-pdf" data-id="${r.id}">
                                                📥 下载高清 PDF
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-ghost btn-view-full-content" data-id="${r.id}">
                                            👁️ 内容摘要
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="text-center text-secondary p-40">
                            <p>暂无历史生成记录</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    // ==================== 事件绑定 ====================

    bindSmartReportEvents() {
        if (this._smartReportEventsBound) return;
        this._smartReportEventsBound = true;

        this.delegate('click', '#btn-create-report, #btn-create-report-empty', () => this._createNewReport());
        this.delegate('click', '#btn-import-report', () => this._importReport());
        this.delegate('click', '.btn-export-template', (e) => {
            const id = e.target.closest('.btn-export-template')?.dataset.id;
            if (id) this._exportReport(parseInt(id));
        });
        this.delegate('click', '.btn-duplicate-template', (e) => {
            const id = e.target.closest('.btn-duplicate-template')?.dataset.id;
            if (id) this._duplicateReport(parseInt(id));
        });
        this.delegate('click', '.btn-edit-template', (e, el) => this._openReportEditor(el.dataset.id));
        this.delegate('click', '.btn-view-history', (e, el) => this._viewReportHistory(el.dataset.id));
        this.delegate('click', '.btn-delete-template', (e, el) => this._deleteReport(el.dataset.id));
        this.delegate('click', '.btn-back-list', () => this._closeReportEditor());
        this.delegate('click', '.btn-save-template', (e, el) => this._saveTemplate(el.dataset.id));
        this.delegate('click', '.btn-generate-report', (e, el) => this._generateFinalReport(el.dataset.id));
        this.delegate('change', '#report-dataset-select', (e) => {
            this._onDatasetSelect(e.target.value);
            // 数据集变化时更新预览
            setTimeout(() => this._updatePreview(), 300);
        });
        this.delegate('change', '#report-dataset-row', () => {
            // 取值模式变化时更新预览
            setTimeout(() => this._updatePreview(), 300);
        });
        this.delegate('click', '.btn-insert-dataset-var', (e, el) => {
            this._insertDatasetVariable(el.dataset.field);
            // 插入变量后更新预览
            setTimeout(() => this._updatePreview(), 300);
        });
        this.delegate('click', '.btn-insert-chart', async (e, el) => {
            await this._insertChart(el.dataset.id);
            // 插入图表后更新预览
            setTimeout(() => this._updatePreview(), 500);
        });
        this.delegate('change', '#chart-source-select', (e) => {
            this._onChartSourceChange(e.target.value);
        });
        this.delegate('click', '.btn-history-back', () => this._closeHistory());
        this.delegate('click', '.btn-delete-record', (e, el) => this._deleteRecord(el.dataset.id));
        this.delegate('click', '.btn-download-pdf', (e, el) => this._downloadRecord(el.dataset.id, 'pdf'));
        this.delegate('click', '.btn-view-full-content', (e, el) => this._viewRecordContent(el.dataset.id));

        // 预览模式切换
        this.delegate('click', '#btn-edit-mode', () => this._switchPreviewMode('edit'));
        this.delegate('click', '#btn-split-mode', () => this._switchPreviewMode('split'));
        this.delegate('click', '#btn-preview-mode', () => this._switchPreviewMode('preview'));
        this.delegate('click', '#btn-refresh-preview', () => this._updatePreview());
        this.delegate('click', '#btn-zoom-preview', () => this._toggleFullscreenPreview());
    },

    // ==================== 编辑器核心逻辑 ====================

    async _openReportEditor(id) {
        const report = (this.state.smartReports || []).find(r => String(r.id) === String(id));

        // 使用 setState 触发完整重新渲染（因为要切换到编辑器视图）
        this.setState({
            editingReportId: id,
            reportDatasetId: report ? report.dataset_id : null,
            reportDatasetRow: report ? report.data_row : 'first',
            reportDatasetColumns: [], // 初始化为空，等待加载
            previewMode: this.state.previewMode || 'split' // 默认分屏模式
        });

        // 先加载图表数据和数据集
        this.fetchAnalysisCharts();

        // 确保数据集已加载（用于下拉框）
        if (this.state.datasets.length === 0 && this.fetchDatasets) {
            this.fetchDatasets();
        }

        // 重置当前编辑器内容缓存
        this._currentEditorContent = null;

        // 初始化编辑器
        setTimeout(async () => {
            this._initTuiEditor(id);
            // 如果报告有数据集，加载字段
            if (report && report.dataset_id) {
                await this._onDatasetSelect(report.dataset_id, true);
            }
            // 等待图表数据加载完成后再更新预览
            // 使用较长延迟确保所有数据就绪
            setTimeout(() => {
                this._updatePreview();
            }, 800);
        }, 100);
    },

    // 创建字体选择工具栏
    _createFontFamilyToolbar() {
        const fontFamilies = [
            { value: '', label: '默认字体' },
            { value: 'Microsoft YaHei', label: '微软雅黑' },
            { value: 'SimSun', label: '宋体' },
            { value: 'SimHei', label: '黑体' },
            { value: 'KaiTi', label: '楷体' },
            { value: 'FangSong', label: '仿宋' },
            { value: 'Arial', label: 'Arial' },
            { value: 'Times New Roman', label: 'Times New Roman' },
            { value: 'Courier New', label: 'Courier New' }
        ];

        const wrapper = document.createElement('div');
        wrapper.className = 'toastui-editor-toolbar-group';
        wrapper.style.cssText = 'display: inline-flex; align-items: center; margin: 0 4px;';

        const label = document.createElement('span');
        label.textContent = '字体:';
        label.style.cssText = 'font-size: 12px; margin-right: 4px; color: #666;';

        const select = document.createElement('select');
        select.className = 'toastui-editor-toolbar-icons';
        select.style.cssText = 'padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; min-width: 120px;';
        select.title = '选择字体';

        fontFamilies.forEach(font => {
            const option = document.createElement('option');
            option.value = font.value;
            option.textContent = font.label;
            option.style.fontFamily = font.value || 'inherit';
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            if (!this._tuiEditor) return;
            const selectedFont = e.target.value;
            if (!selectedFont) return;

            try {
                // 插入字体样式标签
                this._tuiEditor.insertText(`<span style="font-family: ${selectedFont}"></span>`);
            } catch (error) {
                // 字体样式应用失败，静默处理
            }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        return wrapper;
    },

    // 创建字号选择工具栏
    _createFontSizeToolbar() {
        const fontSizes = [
            { value: '', label: '默认字号' },
            { value: '12px', label: '12px' },
            { value: '14px', label: '14px' },
            { value: '16px', label: '16px' },
            { value: '18px', label: '18px' },
            { value: '20px', label: '20px' },
            { value: '24px', label: '24px' },
            { value: '28px', label: '28px' },
            { value: '32px', label: '32px' },
            { value: '36px', label: '36px' },
            { value: '48px', label: '48px' }
        ];

        const wrapper = document.createElement('div');
        wrapper.className = 'toastui-editor-toolbar-group';
        wrapper.style.cssText = 'display: inline-flex; align-items: center; margin: 0 4px;';

        const label = document.createElement('span');
        label.textContent = '字号:';
        label.style.cssText = 'font-size: 12px; margin-right: 4px; color: #666;';

        const select = document.createElement('select');
        select.className = 'toastui-editor-toolbar-icons';
        select.style.cssText = 'padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; min-width: 100px;';
        select.title = '选择字号';

        fontSizes.forEach(size => {
            const option = document.createElement('option');
            option.value = size.value;
            option.textContent = size.label;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            if (!this._tuiEditor) return;
            const selectedSize = e.target.value;
            if (!selectedSize) return;

            try {
                // 插入字号样式标签
                this._tuiEditor.insertText(`<span style="font-size: ${selectedSize}"></span>`);
            } catch (error) {
                // 字号样式应用失败，静默处理
            }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        return wrapper;
    },

    /**
     * 恢复编辑器（用于 DOM 更新后重建编辑器）
     */
    _restoreSmartReportEditor() {
        if (!this.state.editingReportId) return;

        const container = document.getElementById('tui-editor-container');
        if (!container) return;

        // 检查容器是否为空（说明需要重新初始化）
        if (container.innerHTML.trim() === '') {
            this._initTuiEditor(this.state.editingReportId);
        }
    },

    _initTuiEditor(reportId) {
        const container = document.getElementById('tui-editor-container');
        if (!container) return;

        // 如果编辑器实例存在且容器不再包含它（DOM被重置），清理旧实例
        if (this._tuiEditor && !document.body.contains(this._tuiEditor.layout)) {
            try { this._tuiEditor.destroy(); } catch (e) { }
            this._tuiEditor = null;
        }

        // 如果编辑器已经正确初始化在当前容器中，无需重建
        if (this._tuiEditor && container.contains(this._tuiEditor.layout)) {
            return;
        }

        const report = (this.state.smartReports || []).find(r => String(r.id) === String(reportId));

        // 优先使用缓存的编辑内容（防止重绘丢失进度），否则使用报告原始内容
        let initialContent = this._currentEditorContent !== null && this._currentEditorContent !== undefined
            ? this._currentEditorContent
            : (report?.content_md || '# ' + (report?.name || '报告') + '\n\n开始设计您的报告...');

        // 清理 base64 图片（避免编辑器显示超长乱码字符串）
        // 尝试将 base64 图片还原为图表占位符
        if (initialContent) {
            const base64ImagePattern = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g;
            initialContent = initialContent.replace(base64ImagePattern, (match, altText) => {
                const chartName = altText || '图表';
                // 尝试根据名称找到对应的图表
                const charts = this.state.analysisCharts || [];
                const matchedChart = charts.find(c => c.name === chartName);
                if (matchedChart) {
                    return `![${chartName}](chart:${matchedChart.id})`;
                }
                // 如果找不到对应图表，显示文本
                return `\n**[图表: ${chartName}]** _(请重新插入)_\n`;
            });

            // 清理旧的注释格式
            initialContent = initialContent.replace(/<!-- 图片已移除: ([^>]+) -->/g, (match, name) => {
                const charts = this.state.analysisCharts || [];
                const matchedChart = charts.find(c => c.name === name);
                if (matchedChart) {
                    return `![${name}](chart:${matchedChart.id})`;
                }
                return `\n**[图表: ${name}]** _(请重新插入)_\n`;
            });
        }

        // 保存 container 引用，用于后续更新预览
        this._editorContainer = container;

        this._tuiEditor = new toastui.Editor({
            el: container,
            height: '100%',
            initialEditType: 'markdown',
            previewStyle: 'tab',
            initialValue: initialContent,
            language: 'zh-CN',
            placeholder: '使用 Markdown 编写报告内容...',
            hideModeSwitch: true,
            usageStatistics: false,
            toolbarItems: [], // 隐藏默认工具栏
            events: {
                change: () => {
                    // 实时保存内容，防止重绘丢失
                    this._currentEditorContent = this._tuiEditor.getMarkdown();

                    // 实时检测变量
                    this._detectVariables();

                    // 更新预览（防抖）
                    if (this._previewUpdateTimer) {
                        clearTimeout(this._previewUpdateTimer);
                    }
                    this._previewUpdateTimer = setTimeout(() => {
                        this._updatePreview();
                    }, 400);
                },
                keydown: () => { // 补充 keydown/keyup 事件以增强实时性
                    // 实时保存内容
                    if (this._tuiEditor) {
                        this._currentEditorContent = this._tuiEditor.getMarkdown();
                    }

                    if (this._previewUpdateTimer) {
                        clearTimeout(this._previewUpdateTimer);
                    }
                    this._previewUpdateTimer = setTimeout(() => {
                        this._updatePreview();
                    }, 400);
                }
            }
        });

        // 隐藏编辑器默认 UI 元素
        setTimeout(() => {
            const defaultToolbar = container.querySelector('.toastui-editor-defaultUI-toolbar');
            if (defaultToolbar) defaultToolbar.style.display = 'none';
            const tabBar = container.querySelector('.toastui-editor-mode-switch');
            if (tabBar) tabBar.style.display = 'none';
        }, 50);

        // 绑定自定义工具栏事件
        this._bindCustomToolbar();

        // 初始预览由 _openReportEditor 统一触发

        // 初始变量检测
        setTimeout(() => this._detectVariables(), 500);
    },

    /**
     * 实时检测变量
     */
    _detectVariables() {
        if (!this._tuiEditor) return;

        const mdContent = this._tuiEditor.getMarkdown();
        if (!mdContent) return;

        // 检测所有 {{变量名}} 格式的变量
        const variablePattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const matches = [...mdContent.matchAll(variablePattern)];
        const detectedVars = [...new Set(matches.map(m => m[1]))];

        // 更新状态中的变量列表（如果变化）
        const reportId = this.state.editingReportId;
        if (reportId) {
            const report = (this.state.smartReports || []).find(r => String(r.id) === String(reportId));
            if (report) {
                const currentVars = report.template_vars || [];
                const currentVarNames = currentVars.map(v => typeof v === 'string' ? v : v.name || v);

                // 如果检测到的变量与当前不同，更新UI
                if (detectedVars.length !== currentVarNames.length ||
                    !detectedVars.every(v => currentVarNames.includes(v))) {
                    // 更新变量数量显示
                    const varsBadge = document.querySelector(`[data-report-id="${reportId}"] .badge-info, .badge-info`);
                    if (varsBadge) {
                        varsBadge.textContent = `${detectedVars.length} 个变量`;
                    }

                    // 在编辑器顶部显示信息（如果变量未在数据源中）
                    this._showVariableHint(detectedVars);
                }
            }
        }
    },

    /**
     * 显示变量信息
     */
    _showVariableHint(detectedVars) {
        // 移除旧的信息
        const oldHint = document.getElementById('variable-hint-panel');
        if (oldHint) oldHint.remove();

        if (detectedVars.length === 0) return;

        // 获取数据源列名
        const datasetColumns = this.state.reportDatasetColumns || [];
        const missingVars = detectedVars.filter(v => !datasetColumns.includes(v));

        if (missingVars.length === 0) return; // 所有变量都在数据源中

        // 创建信息面板
        const hintPanel = document.createElement('div');
        hintPanel.id = 'variable-hint-panel';
        hintPanel.className = 'variable-hint-panel';
        hintPanel.innerHTML = `
            <div class="hint-content">
                <span class="hint-icon">💡</span>
                <span class="hint-text">检测到 ${missingVars.length} 个未配置的变量：${missingVars.join(', ')}</span>
                <button class="hint-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // 插入到编辑器上方
        const editorContainer = document.getElementById('tui-editor-container');
        if (editorContainer && editorContainer.parentElement) {
            editorContainer.parentElement.insertBefore(hintPanel, editorContainer);
        }
    },

    _bindCustomToolbar() {
        const toolbar = document.getElementById('custom-toolbar');
        if (!toolbar) return;

        // 工具栏按钮点击
        toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                this._executeToolbarCommand(cmd);
            });
        });

        // 字体选择
        const fontFamily = document.getElementById('toolbar-font-family');
        if (fontFamily) {
            fontFamily.addEventListener('change', (e) => {
                if (e.target.value) {
                    this._insertStyledText('font-family', e.target.value);
                    e.target.value = '';
                }
            });
        }

        // 字号选择
        const fontSize = document.getElementById('toolbar-font-size');
        if (fontSize) {
            fontSize.addEventListener('change', (e) => {
                if (e.target.value) {
                    this._insertStyledText('font-size', e.target.value);
                    e.target.value = '';
                }
            });
        }

        // 颜色选择
        const fontColor = document.getElementById('toolbar-font-color');
        if (fontColor) {
            fontColor.addEventListener('change', (e) => {
                this._insertStyledText('color', e.target.value);
            });
        }
    },

    _executeToolbarCommand(cmd) {
        if (!this._tuiEditor) return;

        const commands = {
            'heading': () => this._tuiEditor.insertText('\n## '),
            'bold': () => this._tuiEditor.insertText('**粗体文字**'),
            'italic': () => this._tuiEditor.insertText('*斜体文字*'),
            'strike': () => this._tuiEditor.insertText('~~删除线~~'),
            'ul': () => this._tuiEditor.insertText('\n- 列表项\n'),
            'ol': () => this._tuiEditor.insertText('\n1. 列表项\n'),
            'quote': () => this._tuiEditor.insertText('\n> 引用文字\n'),
            'hr': () => this._tuiEditor.insertText('\n---\n'),
            'table': () => this._tuiEditor.insertText('\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 数据 | 数据 | 数据 |\n'),
            'link': () => this._tuiEditor.insertText('[链接文字](https://example.com)'),
            'code': () => this._tuiEditor.insertText('`代码`')
        };

        if (commands[cmd]) {
            commands[cmd]();
        }
    },

    _insertStyledText(property, value) {
        if (!this._tuiEditor) return;
        this._tuiEditor.insertText(`<span style="${property}: ${value}">文字</span>`);
    },

    // 添加自定义工具栏（字体和字号）
    _addCustomToolbar() {
        if (!this._tuiEditor) return;

        const toolbar = document.querySelector('.toastui-editor-defaultUI-toolbar');
        if (!toolbar) return;

        // 创建分隔线
        const divider = document.createElement('div');
        divider.className = 'toastui-editor-toolbar-divider';
        divider.style.cssText = 'width: 1px; height: 20px; background: #ddd; margin: 0 8px;';

        // 添加字体工具栏
        const fontFamilyToolbar = this._createFontFamilyToolbar();
        const fontSizeToolbar = this._createFontSizeToolbar();

        // 插入到工具栏末尾
        toolbar.appendChild(divider.cloneNode(true));
        toolbar.appendChild(fontFamilyToolbar);
        toolbar.appendChild(fontSizeToolbar);
    },

    // 更新预览：替换变量为实际值，显示图表
    async _updatePreview() {
        if (!this._tuiEditor) return;

        // 获取独立预览区域
        const previewEl = document.getElementById('report-preview-content');
        if (!previewEl) {
            return;
        }

        // 如果预览区域被隐藏，不更新（节省性能）
        const previewSection = document.querySelector('.report-preview-section');
        if (previewSection && previewSection.classList.contains('hidden')) {
            return;
        }

        // 使用版本号防止并发更新问题
        this._previewVersion = (this._previewVersion || 0) + 1;
        const currentVersion = this._previewVersion;

        // 显示加载状态
        previewEl.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">正在更新预览...</div>';

        try {
            const mdContent = this._tuiEditor.getMarkdown();

            // 获取数据集数据
            let dataContext = {};
            const datasetId = document.getElementById('report-dataset-select')?.value;
            const dataRowMode = document.getElementById('report-dataset-row')?.value || 'first';

            if (datasetId) {
                try {
                    const res = await AnalysisApi.getDatasetData(parseInt(datasetId), { page: 1, size: 1000 });

                    // API 返回格式: { data: { items: [...], columns: [...], total: ... } }
                    const data = res.data?.items || res.data?.data || [];
                    const columns = res.data?.columns || (data.length > 0 ? Object.keys(data[0]) : []);

                    if (data.length > 0) {
                        if (dataRowMode === 'first') {
                            dataContext = { ...data[0] };
                        } else if (dataRowMode === 'last') {
                            dataContext = { ...data[data.length - 1] };
                        } else if (dataRowMode === 'sum') {
                            columns.forEach(col => {
                                const sum = data.reduce((acc, row) => {
                                    const val = parseFloat(row[col]) || 0;
                                    return acc + val;
                                }, 0);
                                dataContext[col] = sum.toFixed(2);
                            });
                        } else if (dataRowMode === 'avg') {
                            columns.forEach(col => {
                                const sum = data.reduce((acc, row) => {
                                    const val = parseFloat(row[col]) || 0;
                                    return acc + val;
                                }, 0);
                                dataContext[col] = (sum / data.length).toFixed(2);
                            });
                        }
                    }
                } catch (e) {
                    // 获取数据集数据失败，静默处理
                }
            }

            // 替换变量 - 使用更简单直接的方法
            let previewContent = mdContent;
            Object.keys(dataContext).forEach(varName => {
                const placeholder = `{{${varName}}}`;
                const value = dataContext[varName] !== null && dataContext[varName] !== undefined
                    ? String(dataContext[varName])
                    : '';
                // 使用 split + join 方法替换，避免正则表达式的问题
                previewContent = previewContent.split(placeholder).join(value);
            });

            // 处理图表占位符：在预览中渲染实际的 ECharts 图表
            // 格式：![图表名](chart:ID)
            const chartPlaceholderPattern = /!\[([^\]]*)\]\(chart:(\d+)\)/g;
            const chartMatches = [...previewContent.matchAll(chartPlaceholderPattern)];

            // 使用简单占位符（不含特殊字符），Markdown 解析后再替换
            let tempContent = previewContent;
            const chartPlaceholders = [];
            const timestamp = Date.now();

            chartMatches.forEach((match, index) => {
                const chartId = parseInt(match[2]);
                const chartName = match[1] || '图表';
                const containerId = `previewchart${chartId}t${timestamp}i${index}`;
                const placeholder = `BINDCHARTPLACEHOLDER${index}BINDEND`;

                chartPlaceholders.push({
                    placeholder: placeholder,
                    containerId: containerId,
                    chartId: chartId,
                    chartName: chartName
                });

                tempContent = tempContent.replace(match[0], placeholder);
            });

            // 处理不完整的图片语法
            let autoIndex = 100;
            const incompleteImagePattern = /!\[([^\]]+)\](?!\()/g;
            tempContent = tempContent.replace(incompleteImagePattern, (match, altText) => {
                const charts = this.state.analysisCharts || [];
                const matchedChart = charts.find(c => c.name === altText);
                if (matchedChart) {
                    const containerId = `previewchartauto${matchedChart.id}t${timestamp}`;
                    const placeholder = `BINDCHARTPLACEHOLDER${autoIndex++}BINDEND`;
                    chartPlaceholders.push({
                        placeholder: placeholder,
                        containerId: containerId,
                        chartId: matchedChart.id,
                        chartName: altText
                    });
                    return placeholder;
                }
                return `CHARTMISSING${altText}ENDMISSING`;
            });

            // 清理旧注释格式
            tempContent = tempContent.replace(/<!-- 图片已移除: [^>]+ -->/g, '');
            tempContent = tempContent.replace(/\*\*\[图表: ([^\]]+)\]\*\* _\(请重新插入\)_/g, 'CHARTMISSING$1ENDMISSING');

            // 解析 Markdown 为 HTML
            let html = this._renderMarkdownPreview(tempContent);

            // 替换占位符为实际的图表容器
            for (const p of chartPlaceholders) {
                const containerHtml = `<div id="${p.containerId}" class="preview-chart-container"></div>`;
                html = html.split(p.placeholder).join(containerHtml);
            }

            // 替换缺失图表的占位符
            html = html.replace(/CHARTMISSING([^E]+)ENDMISSING/g, (match, name) => {
                return `<div class="chart-placeholder"><div class="icon">📊</div><p>"${name}" - 请从右侧插入图表</p></div>`;
            });

            // 清理之前的图表实例
            if (this._previewChartInstances) {
                Object.values(this._previewChartInstances).forEach(chart => {
                    if (chart && typeof chart.dispose === 'function') {
                        try { chart.dispose(); } catch (e) { }
                    }
                });
            }
            this._previewChartInstances = {};

            // 更新预览 HTML（全部包裹在一个 A4 纸张容器中）
            previewEl.innerHTML = `<div class="report-paper">${html}</div>`;

            // 检查是否有新的预览请求（版本号变化则跳过）
            if (this._previewVersion !== currentVersion) {
                return;
            }

            // 渲染图表（使用保存的容器 ID）

            for (const placeholder of chartPlaceholders) {
                if (!placeholder.containerId) continue;

                // 再次检查版本
                if (this._previewVersion !== currentVersion) {
                    return;
                }

                const chart = (this.state.analysisCharts || []).find(c => String(c.id) === String(placeholder.chartId));

                if (!chart) {
                    continue;
                }

                if (!window.echarts) {
                    continue;
                }

                const container = document.getElementById(placeholder.containerId);
                if (!container) {
                    continue;
                }

                try {
                    // 确保容器有正确的尺寸
                    container.style.cssText = 'width: 100%; height: 320px; min-height: 320px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;';

                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                    const myChart = echarts.init(container, null, {
                        devicePixelRatio: window.devicePixelRatio || 1,
                        renderer: 'canvas'
                    });

                    // 图表的 config 是参数配置，需要根据它生成 ECharts option
                    const config = chart.config || {};
                    const chartType = chart.chart_type || 'bar';

                    // 获取图表数据
                    let chartData = [];
                    if (chart.dataset_id) {
                        try {
                            const res = await AnalysisApi.getDatasetData(chart.dataset_id, { page: 1, size: 500 });
                            chartData = res.data?.items || res.data?.data || [];
                        } catch (e) {
                            // 获取图表数据失败，静默处理
                        }
                    }

                    // 根据配置生成 ECharts option
                    const option = this._generateChartOption(chartType, config, chartData, chart.name);

                    if (!option) {
                        container.innerHTML = `<div class="chart-placeholder"><div class="icon">⚠️</div><p>无法生成图表配置</p></div>`;
                        continue;
                    }

                    myChart.setOption(option, true);
                    this._previewChartInstances[container.id] = myChart;

                    setTimeout(() => {
                        try { myChart.resize(); } catch (e) { }
                    }, 100);
                } catch (e) {
                    container.innerHTML = `<div class="chart-placeholder"><div class="icon">⚠️</div><p>渲染失败: ${e.message}</p></div>`;
                }
            }

            // 监听窗口大小变化
            if (!this._previewResizeHandler && Object.keys(this._previewChartInstances).length > 0) {
                this._previewResizeHandler = Utils.debounce(() => {
                    Object.values(this._previewChartInstances).forEach(chart => {
                        if (chart && typeof chart.resize === 'function') {
                            try { chart.resize(); } catch (e) { }
                        }
                    });
                }, 200);
                window.addEventListener('resize', this._previewResizeHandler);
            }
        } catch (e) {
            previewEl.innerHTML = `<div style="padding:20px;color:#f56565;">预览加载失败: ${e.message}</div>`;
        }
    },

    // 根据图表类型和配置生成 ECharts option（与图表分析模块保持一致）
    // 根据图表类型和配置生成 ECharts option（与图表分析模块保持一致）
    _generateChartOption(chartType, config, data, chartName) {
        // 使用 ChartFactory 统一逻辑

        // 1. 数据过滤
        const filteredData = ChartFactory.filterData(data, config);

        const getEmptyOption = (msg) => ({
            backgroundColor: 'transparent',
            title: { text: chartName || '图表', left: 'center', top: '40%', textStyle: { color: '#888', fontSize: 14 } },
            graphic: {
                type: 'text', left: 'center', top: '55%',
                style: { text: msg, fontSize: 12, fill: '#aaa' }
            }
        });

        if (!filteredData || filteredData.length === 0) {
            return getEmptyOption('暂无数据');
        }

        // 2. 生成 Option
        let option = {};

        try {
            if (['bar', 'line', 'pie', 'scatter'].includes(chartType)) {
                const { xField, yField, aggregate } = config;
                if (xField) {
                    const aggregatedData = (window.Utils && Utils.aggregateData)
                        ? Utils.aggregateData(filteredData, xField, yField, aggregate || 'count', { maxItems: 20 })
                        : [];

                    option = ChartFactory.generateOption(chartType, aggregatedData, config, filteredData);
                }
            } else {
                option = ChartFactory.generateOption(chartType, filteredData, config);
            }
        } catch (e) {
            return getEmptyOption('生成出错: ' + e.message);
        }

        if (!option || Object.keys(option).length === 0) {
            return getEmptyOption('配置无效或无法生成');
        }

        return option;
    },

    // 渲染 Markdown 预览（使用增强的 Markdown 解析）
    _renderMarkdownPreview(mdContent) {
        if (!mdContent) return '';

        let html = mdContent;

        // 1. 代码块（需要在其他替换之前处理）
        html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || ''}">${this._escapeHtml(code)}</code></pre>`;
        });
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

        // 2. 表格处理
        html = html.replace(/\|(.+)\|\n\|[-\s|:]+\|\n((?:\|.+\|\n?)+)/g, (match, header, rows) => {
            const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
            const rowLines = rows.trim().split('\n');
            const body = rowLines.map(row => {
                const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            return `<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
        });

        // 3. 引用块
        html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');
        // 合并连续的引用块
        html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

        // 4. 水平线
        html = html.replace(/^---$/gim, '<hr>');
        html = html.replace(/^\*\*\*$/gim, '<hr>');

        // 5. 标题
        html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
        html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
        html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // 6. 粗体和斜体（需要在链接和图片之前处理）
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');
        html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

        // 7. 图片（包括 base64）
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 4px;">');

        // 8. 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 9. 有序列表和无序列表
        const lines = html.split('\n');
        let inList = false;
        let listType = null;
        let listItems = [];
        const processedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
            const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);

            if (orderedMatch) {
                if (!inList || listType !== 'ol') {
                    if (inList) {
                        processedLines.push(`</${listType}>`);
                    }
                    inList = true;
                    listType = 'ol';
                    listItems = [];
                }
                listItems.push(`<li>${orderedMatch[2]}</li>`);
            } else if (unorderedMatch) {
                if (!inList || listType !== 'ul') {
                    if (inList) {
                        processedLines.push(`</${listType}>`);
                    }
                    inList = true;
                    listType = 'ul';
                    listItems = [];
                }
                listItems.push(`<li>${unorderedMatch[1]}</li>`);
            } else {
                if (inList) {
                    processedLines.push(`<${listType}>${listItems.join('')}</${listType}>`);
                    inList = false;
                    listType = null;
                    listItems = [];
                }
                processedLines.push(line);
            }
        }

        if (inList) {
            processedLines.push(`<${listType}>${listItems.join('')}</${listType}>`);
        }

        html = processedLines.join('\n');

        // 10. 段落处理（将连续的非空行包装为段落）
        html = html.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            // 如果已经是HTML标签，直接返回
            if (line.match(/^<(h[1-6]|p|div|ul|ol|li|pre|code|blockquote|hr|table|img|a|strong|em|del)/)) {
                return line;
            }
            return `<p>${line}</p>`;
        }).filter(line => line).join('\n');

        return html;
    },

    /**
     * HTML转义
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    async _saveTemplate(reportId) {
        if (!this._tuiEditor) return;

        try {
            const mdContent = this._tuiEditor.getMarkdown();
            const datasetId = document.getElementById('report-dataset-select')?.value;
            const dataRow = document.getElementById('report-dataset-row')?.value;
            const vars = this._extractVariables(mdContent);

            await Api.post(`/analysis/smart-reports/${reportId}/update-content`, {
                content_md: mdContent,
                template_vars: vars,
                dataset_id: datasetId ? parseInt(datasetId) : null,
                data_row: dataRow || null
            });

            Toast.success('模板保存成功');

            // 只更新 state 中的报告数据，不触发重新渲染
            // 因为用户还在编辑器中，不需要刷新整个列表
            try {
                const res = await Api.get('/analysis/smart-reports');
                this.state.smartReports = res.data || [];
            } catch (e) {
                // 静默处理，不影响保存成功的消息
            }

            return true;
        } catch (e) {
            Toast.error('保存失败: ' + e.message);
            return false;
        }
    },

    _extractVariables(content) {
        const vars = new Set();
        const matches = content.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
            matches.forEach(m => {
                const varName = m.replace(/\{\{|\}\}/g, '').trim();
                if (varName) vars.add(varName);
            });
        }
        return Array.from(vars);
    },

    _closeReportEditor() {
        // 清理图表实例
        if (this._previewChartInstances) {
            Object.values(this._previewChartInstances).forEach(chart => {
                if (chart && typeof chart.dispose === 'function') {
                    chart.dispose();
                }
            });
            this._previewChartInstances = {};
        }

        // 清理 resize 监听器
        if (this._previewResizeHandler) {
            window.removeEventListener('resize', this._previewResizeHandler);
            this._previewResizeHandler = null;
        }

        // 清理预览更新定时器
        if (this._previewUpdateTimer) {
            clearTimeout(this._previewUpdateTimer);
            this._previewUpdateTimer = null;
        }

        this.setState({ editingReportId: null });
        this._tuiEditor = null;
    },

    // ==================== 高级插入逻辑 ====================

    _insertDatasetVariable(fieldName) {
        if (!this._tuiEditor) return;
        this._tuiEditor.insertText(`{{${fieldName}}}`);
    },

    async _insertChart(chartId) {
        if (!this._tuiEditor) return;

        const chart = (this.state.analysisCharts || []).find(c => String(c.id) === String(chartId));
        if (!chart) return;

        try {
            // 使用占位符而不是完整的 base64 编码，这样编辑器更易读
            // 格式：![图表名称](chart:chartId)
            const mdImage = `\n![${chart.name}](chart:${chartId})\n\n`;
            this._tuiEditor.insertText(mdImage);

            Toast.success('图表占位符已插入，预览时将显示实际图表');

            // 立即更新预览以显示图表
            setTimeout(() => this._updatePreview(), 300);
        } catch (e) {
            Toast.error('插入图表失败: ' + e.message);
        }
    },

    // ==================== 报告生成逻辑 ====================

    async _generateFinalReport(reportId) {
        const report = (this.state.smartReports || []).find(r => String(r.id) === String(reportId));
        let reportName = report ? report.name + '_' + Utils.formatDate(new Date()) : '分析报告';

        const userInput = prompt('请输入生成的报告名称：', reportName);
        if (userInput === null) return;
        reportName = (userInput || reportName).trim();

        await this._saveTemplate(reportId);

        try {
            Toast.info('正在生成高清 PDF...');

            // 获取当前 Markdown 内容
            const mdContent = this._tuiEditor ? this._tuiEditor.getMarkdown() : (report?.content_md || '');

            // 处理图表占位符：将 chart:chartId 替换为实际的 base64 图片（仅用于 PDF 生成）
            let finalMdContent = mdContent;
            const chartPlaceholderPattern = /!\[([^\]]*)\]\(chart:(\d+)\)/g;
            const chartMatches = [...finalMdContent.matchAll(chartPlaceholderPattern)];

            if (chartMatches.length > 0) {
                // 显示进度提示
                const progressToast = Toast.loading(`正在渲染 ${chartMatches.length} 个图表为高清图片...`, 0);

                try {
                    // 并行处理所有图表
                    const renderPromises = chartMatches.map(async (match, index) => {
                        const chartId = parseInt(match[2]);
                        const chartName = match[1] || '图表';

                        try {
                            const chart = (this.state.analysisCharts || []).find(c => String(c.id) === String(chartId));
                            if (!chart || !window.echarts) {
                                return { match, imageData: null, error: `图表 "${chartName}" 不存在或无法加载` };
                            }

                            // 获取图表关联的数据集数据
                            let chartData = [];
                            if (chart.dataset_id) {
                                try {
                                    const dataRes = await AnalysisApi.getDatasetData(chart.dataset_id, { page: 1, size: 1000 });
                                    chartData = dataRes.data?.items || dataRes.data?.data || [];
                                } catch (e) {
                                    return { match, imageData: null, error: `获取图表数据失败: ${e.message}` };
                                }
                            }

                            // 检查缓存
                            const cache = window.ChartRenderCache || null;
                            let imgData = null;

                            if (cache) {
                                imgData = cache.get(chartId, chartData);
                            }

                            // 如果缓存未命中，渲染图表
                            if (!imgData) {
                                // 创建独立的容器（每个图表使用独立容器，支持并行渲染）
                                const container = document.createElement('div');
                                container.id = `hidden-chart-render-${chartId}-${Date.now()}`;
                                container.style.cssText = `
                                    position: fixed;
                                    left: ${(index % 3) * 900}px;
                                    top: ${Math.floor(index / 3) * 700}px;
                                    width: 800px;
                                    height: 600px;
                                    opacity: 0;
                                    pointer-events: none;
                                    z-index: -9999;
                                    overflow: visible;
                                `;
                                document.body.appendChild(container);

                                try {
                                    // 使用与预览相同的方法生成 ECharts option
                                    const option = this._generateChartOption(
                                        chart.chart_type || 'bar',
                                        chart.config || {},
                                        chartData,
                                        chartName
                                    );

                                    // 初始化 ECharts 实例（使用固定宽高）
                                    const myChart = echarts.init(container, null, {
                                        width: 800,
                                        height: 600,
                                        devicePixelRatio: 2,
                                        renderer: 'canvas'
                                    });

                                    // 设置图表配置
                                    myChart.setOption(option, true);

                                    // 强制 resize 确保尺寸正确
                                    myChart.resize({ width: 800, height: 600 });

                                    // 等待渲染完成
                                    await new Promise(resolve => setTimeout(resolve, 300));

                                    // 导出高清图片
                                    imgData = myChart.getDataURL({
                                        type: 'png',
                                        pixelRatio: 2,
                                        backgroundColor: '#fff'
                                    });

                                    // 保存到缓存
                                    if (cache && imgData) {
                                        cache.set(chartId, chartData, imgData);
                                    }

                                    // 清理图表实例和容器
                                    myChart.dispose();
                                    document.body.removeChild(container);
                                } catch (renderError) {
                                    // 清理容器
                                    if (container.parentNode) {
                                        document.body.removeChild(container);
                                    }
                                    throw renderError;
                                }
                            }

                            return { match, imageData: imgData, error: null };
                        } catch (e) {
                            return { match, imageData: null, error: `图表 "${chartName}" 渲染失败：${e.message}` };
                        }
                    });

                    // 等待所有图表渲染完成
                    const results = await Promise.all(renderPromises);

                    // 更新进度
                    progressToast.update(`正在处理 ${results.length} 个图表结果...`);

                    // 替换占位符
                    for (const result of results) {
                        if (result.imageData) {
                            finalMdContent = finalMdContent.replace(result.match[0], `![${result.match[1] || '图表'}](${result.imageData})`);
                        } else if (result.error) {
                            Toast.warning(result.error);
                            // 保留占位符，让后端处理或显示错误
                        }
                    }

                    // 关闭进度
                    progressToast.close();
                } catch (e) {
                    progressToast.close();
                    Toast.error('图表渲染过程出错: ' + e.message);
                }
            }

            // 获取数据
            let variableValues = {};
            if (this.state.reportDatasetId) {
                const res = await AnalysisApi.getDatasetData(parseInt(this.state.reportDatasetId), {
                    page: 1,
                    size: 1000
                });
                // API 返回格式: { data: { items: [...], columns: [...] } }
                const rows = res.data?.items || res.data?.data || [];
                const columns = res.data?.columns || [];
                const mode = this.state.reportDatasetRow || 'first';

                if (rows.length > 0) {
                    if (mode === 'first') {
                        variableValues = rows[0];
                    } else if (mode === 'last') {
                        variableValues = rows[rows.length - 1];
                    } else if (mode === 'sum') {
                        columns.forEach(col => {
                            const sum = rows.reduce((acc, row) => {
                                const val = parseFloat(row[col]) || 0;
                                return acc + val;
                            }, 0);
                            variableValues[col] = sum.toFixed(2);
                        });
                    } else if (mode === 'avg') {
                        columns.forEach(col => {
                            const sum = rows.reduce((acc, row) => {
                                const val = parseFloat(row[col]) || 0;
                                return acc + val;
                            }, 0);
                            variableValues[col] = (sum / rows.length).toFixed(2);
                        });
                    }
                }
            }

            // 替换变量
            Object.keys(variableValues).forEach(varName => {
                const placeholder = `{{${varName}}}`;
                const value = variableValues[varName] !== null && variableValues[varName] !== undefined
                    ? String(variableValues[varName])
                    : '';
                finalMdContent = finalMdContent.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
            });

            // 发送处理后的内容到后端（包含变量替换和图表图片）
            // 需要特殊接口或修改现有接口支持传入内容
            // 暂时使用现有接口，但需要确保后端能正确处理图表

            const config = {
                data: variableValues,
                save_record: true,
                record_name: reportName,
                content_md: finalMdContent // 传入处理后的内容（包含图表图片）
            };

                // 显示生成进度
            const generateToast = Toast.loading('正在生成 PDF 文件，请稍候...', 0);

            try {
                const res = await Api.post(`/analysis/smart-reports/${reportId}/generate`, config);

                if (res.data && res.data.pdf_filename) {
                    generateToast.update('PDF 生成成功，正在准备下载...');
                    await new Promise(resolve => setTimeout(resolve, 300));
                    generateToast.close();
                    Toast.success('报告生成成功！');
                    // 使用 Api.download 方法下载文件，自动携带认证 token
                    try {
                        // 始终使用临时文件下载接口（后端现在总是在临时目录生成文件）
                        const url = `/analysis/smart-reports/download/temp/${res.data.pdf_filename}`;

                        const { blob, filename } = await Api.download(url);

                        // 验证 blob 类型和大小
                        if (!blob || blob.size === 0) {
                            throw new Error('下载的文件为空或损坏');
                        }

                        // 验证是否为 PDF 类型
                        if (blob.type && !blob.type.includes('pdf') && !blob.type.includes('octet-stream')) {
                            // 文件类型可能不正确，但继续下载
                        }

                        const downloadUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = filename || res.data.pdf_filename;
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();

                        // 延迟清理，确保下载开始
                        setTimeout(() => {
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(downloadUrl);
                        }, 100);
                    } catch (e) {
                        Toast.error('下载失败: ' + e.message);
                    }
                    // 刷新历史列表
                    if (this.state.historyReportId) {
                        this._viewReportHistory(this.state.historyReportId);
                    }
                } else {
                    generateToast.close();
                    Toast.error('报告生成失败：未返回 PDF 文件名');
                }
            } catch (e) {
                generateToast.close();
                // 报告生成异常，已在下方处理

                // 提供更详细的错误信息
                let errorMsg = '报告生成失败';
                if (e.response && e.response.data && e.response.data.message) {
                    errorMsg += ': ' + e.response.data.message;
                } else if (e.message) {
                    errorMsg += ': ' + e.message;
                }

                Toast.error(errorMsg);
            }
        } catch (e) {
            let errorMsg = '后端处理异常';
            if (e.message) {
                errorMsg += ': ' + e.message;
            }
            Toast.error(errorMsg);
        }
    },

    async _downloadRecord(recordId, type) {
        if (type === 'pdf') {
            try {
                const url = `/analysis/smart-reports/records/${recordId}/download-pdf`;
                const { blob, filename } = await Api.download(url);
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = filename || `report_${recordId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);
            } catch (e) {
                Toast.error('下载失败: ' + e.message);
            }
        }
    },

    async _deleteRecord(id) {
        if (!confirm('确定删除此条记录？')) return;
        try {
            await Api.delete(`/analysis/smart-reports/records/${id}`);
            Toast.success('记录已删除');
            if (this.state.historyReportId) {
                this._viewReportHistory(this.state.historyReportId);
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    },

    async _viewRecordContent(recordId) {
        const record = (this.state.historyRecords || []).find(r => String(r.id) === String(recordId));
        if (record && record.full_content) {
            Modal.show({
                title: '报告全文概要',
                content: `<div class="p-20"><pre style="white-space: pre-wrap; word-break: break-all;">${record.full_content}</pre></div>`,
                width: 800
            });
        } else {
            Toast.info('该记录未保存全文内容');
        }
    },

    /**
     * 导入报告模板
     */
    async _importReport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const loadingToast = Toast.loading('正在导入模板...', 0);
                const formData = new FormData();
                formData.append('file', file);

                const res = await Api.post('/analysis/smart-reports/import', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                loadingToast.close();
                if (res.data) {
                    Toast.success('模板导入成功！');
                    await this.fetchSmartReports();
                } else {
                    Toast.error('导入失败: ' + (res.message || '未知错误'));
                }
            } catch (e) {
                Toast.close();
                Toast.error('导入失败: ' + e.message);
            }
        };
        input.click();
    },

    /**
     * 导出报告模板
     */
    async _exportReport(reportId) {
        try {
            const loadingToast = Toast.loading('正在导出模板...', 0);
            const url = `/analysis/smart-reports/${reportId}/export`;
            const { blob, filename } = await Api.download(url);

            loadingToast.close();

            // 创建下载链接
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename || 'report_template.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            Toast.success('模板导出成功！');
        } catch (e) {
            Toast.close();
            Toast.error('导出失败: ' + e.message);
        }
    },

    /**
     * 复制报告模板
     */
    async _duplicateReport(reportId) {
        if (!confirm('确定要复制此模板吗？')) return;

        try {
            const loadingToast = Toast.loading('正在复制模板...', 0);
            const res = await Api.post(`/analysis/smart-reports/${reportId}/duplicate`);

            loadingToast.close();
            if (res.data) {
                Toast.success('模板复制成功！');
                await this.fetchSmartReports();
            } else {
                Toast.error('复制失败: ' + (res.message || '未知错误'));
            }
        } catch (e) {
            Toast.close();
            Toast.error('复制失败: ' + e.message);
        }
    },

    /**
     * 切换预览模式
     * @param {string} mode - 'edit' | 'split' | 'preview'
     */
    _switchPreviewMode(mode) {
        this.setState({ previewMode: mode });

        // 如果切换到预览模式，立即更新预览
        if (mode === 'preview') {
            setTimeout(() => this._updatePreview(), 100);
        }
    },

    /**
     * 全屏预览切换
     */
    _toggleFullscreenPreview() {
        const previewSection = document.querySelector('.report-preview-section');
        if (!previewSection) return;

        if (previewSection.classList.contains('fullscreen')) {
            // 退出全屏
            previewSection.classList.remove('fullscreen');
            document.exitFullscreen?.();
        } else {
            // 进入全屏
            previewSection.classList.add('fullscreen');
            previewSection.requestFullscreen?.();
        }
    },

    // ==================== 历史与项目管理 ====================

    async _viewReportHistory(reportId) {
        this.setState({ historyReportId: reportId, historyRecords: [] });
        try {
            const res = await AnalysisApi.getSmartReportRecords(reportId);
            this.setState({ historyRecords: res.data || [] });
        } catch (e) {
            Toast.error('获取历史记录失败');
        }
    },

    _closeHistory() {
        this.setState({ historyReportId: null, historyRecords: null });
    },

    async fetchAnalysisCharts() {
        try {
            const res = await AnalysisApi.getCharts();
            this.setState({ analysisCharts: res.data || [] });
        } catch (e) {
            // 获取分析图表失败，静默处理
        }
    },

    async _onDatasetSelect(id, silent = false) {
        if (!id) {
            this.state.reportDatasetId = null;
            this.state.reportDatasetColumns = [];
            this._updateDatasourcePanel();
            return;
        }

        this.state.reportDatasetId = id;
        this._updateDatasourcePanel();

        try {
            const res = await AnalysisApi.getDatasetData(id, { page: 1, size: 1 });
            if (res.data && res.data.columns) {
                this.state.reportDatasetColumns = res.data.columns;
                this._updateDatasourcePanel();
            } else {
                throw new Error('数据集字段信息为空');
            }
        } catch (e) {
            this.state.reportDatasetColumns = [];
            this._updateDatasourcePanel();
            if (!silent) {
                Toast.error(`获取数据集字段失败: ${e.message}`);
            }
        }
    },

    _onChartSourceChange(datasetId) {
        this.state.chartSourceDatasetId = datasetId || '';
        this._updateChartsPanel();
    },

    _updateChartsPanel() {
        const container = document.getElementById('chart-list-container');
        if (!container) return;

        const charts = this.state.analysisCharts || [];
        const selectedChartSource = this.state.chartSourceDatasetId || '';

        const filteredCharts = selectedChartSource
            ? charts.filter(c => String(c.dataset_id) === String(selectedChartSource))
            : charts;

        container.innerHTML = filteredCharts.length > 0 ? filteredCharts.map(chart => `
            <div class="chart-item btn-insert-chart" data-id="${chart.id}">
                <div class="chart-info">
                    <div class="chart-name">${chart.name}</div>
                    <div class="chart-type">${chart.chart_type || 'chart'}</div>
                </div>
                <button class="insert-btn">插入</button>
            </div>
        `).join('') : `
            <div class="empty-state">
                <div class="icon">📊</div>
                <p>暂无图表</p>
                <p class="mt-5" style="font-size: 11px;">${selectedChartSource ? '该数据集无图表' : '请先创建图表'}</p>
            </div>
        `;
    },

    /**
     * 只更新数据源面板的 DOM，不触发完整重新渲染
     */
    _updateDatasourcePanel() {
        const panel = document.querySelector('.report-sidebar-left');
        if (!panel) return;

        const datasets = this.state.datasets || [];
        const selectedDataset = this.state.reportDatasetId;
        const datasetColumns = this.state.reportDatasetColumns || [];

        // 更新变量标签容器
        const varTagsWrapper = panel.querySelector('.var-tags-wrapper');
        if (varTagsWrapper && selectedDataset) {
            varTagsWrapper.innerHTML = datasetColumns.length > 0
                ? datasetColumns.map(col => `
                    <span class="var-tag-btn btn-insert-dataset-var" data-field="${col}">{{${col}}}</span>
                `).join('')
                : '<span class="text-tertiary text-xs">暂无字段</span>';
        }

        // 如果没有选择数据集，重新渲染整个面板
        if (!selectedDataset) {
            panel.innerHTML = this._renderDatasourcePanel(datasets);
        }
    },

    // ==================== 辅助方法 ====================

    async fetchSmartReports(silent = false) {
        try {
            const res = await Api.get('/analysis/smart-reports');
            this.setState({ smartReports: res.data || [] }, silent);
        } catch (e) {
            if (!silent) Toast.error('获取报告列表失败');
        }
    },

    async _createNewReport() {
        const name = prompt('请输入报告模板名称：');
        if (!name || !name.trim()) return;

        try {
            const res = await Api.post('/analysis/smart-reports', { name: name.trim() });
            Toast.success('模板创建成功');
            await this.fetchSmartReports();
            this._openReportEditor(res.data.id);
        } catch (e) {
            Toast.error('创建失败');
        }
    },

    async _deleteReport(id) {
        if (!confirm('确定删除此模板及其所有历史吗？')) return;
        try {
            await Api.delete(`/analysis/smart-reports/${id}`);
            Toast.success('已删除');
            await this.fetchSmartReports();
        } catch (e) {
            Toast.error('删除失败');
        }
    }
};

// 混入到 AnalysisPage（延迟执行，确保 AnalysisPage 已定义）
(function() {
    function tryMixin() {
        if (typeof AnalysisPage !== 'undefined' && AnalysisPage.prototype) {
            Object.assign(AnalysisPage.prototype, AnalysisSmartReportMixin);
        } else {
            setTimeout(tryMixin, 50);
        }
    }
    tryMixin();
})();

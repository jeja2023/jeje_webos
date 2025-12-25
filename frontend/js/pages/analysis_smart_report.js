/**
 * 数据分析模块 - 智能报告功能
 * 支持可视化编辑、图表插入、数据源选择
 */

const AnalysisSmartReportMixin = {
    /**
     * 渲染智能报告页面
     */
    renderSmartReport() {
        // 如果正在预览报告
        if (this.state.previewReportContent) {
            return this.renderReportPreview();
        }

        // 如果正在编辑报告
        if (this.state.editingReport !== undefined) {
            return this.renderReportEditor();
        }

        const reports = this.state.smartReports || [];

        return `
            <div class="p-20">
                <div class="flex-between mb-20">
                    <div>
                        <h2>智能报告</h2>
                        <p class="text-secondary">可视化编辑报告模版，支持插入图表和数据</p>
                    </div>
                    <button class="btn btn-primary" id="btn-create-smart-report">
                        ➕ 新建报告模版
                    </button>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;" id="smart-report-list">
                    ${reports.length > 0 ? reports.map(r => {
            const dsName = this.state.datasets?.find(d => d.id === r.dataset_id)?.name || '未关联数据集';
            return `
                            <div class="smart-report-card" style="
                                background: var(--color-card);
                                border-radius: 12px;
                                overflow: hidden;
                                box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                                border: 1px solid var(--color-border);
                                cursor: pointer;
                                transition: all 0.3s ease;
                            " onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    padding: 20px;
                                    color: white;
                                ">
                                    <div style="font-size: 24px; margin-bottom: 8px;">📄</div>
                                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">${r.name}</h3>
                                </div>
                                <div style="padding: 15px;">
                                    <p class="text-secondary text-sm mb-5">
                                        📊 数据源: <span class="text-primary">${dsName}</span>
                                    </p>
                                    <p class="text-secondary text-sm mb-15">
                                        🕐 ${Utils.formatDate(r.updated_at)}
                                    </p>
                                    <div class="flex gap-8">
                                        <button class="btn btn-primary btn-sm flex-1 btn-preview-report" data-id="${r.id}">👀 预览</button>
                                        <button class="btn btn-outline-primary btn-sm btn-edit-smart-report" data-id="${r.id}">✏️ 编辑</button>
                                        <button class="btn btn-ghost btn-sm text-danger btn-delete-smart-report" data-id="${r.id}">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : ''}
                    ${reports.length === 0 ? `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--color-card); border-radius: 12px; border: 1px solid var(--color-border);">
                            <div style="font-size: 48px; margin-bottom: 15px;">📝</div>
                            <p class="text-secondary">暂无报告模版，点击右上角新建</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * 渲染可视化报告编辑器
     */
    renderReportEditor() {
        const report = this.state.editingReport;
        const isEdit = report && report.id;
        const datasets = this.state.datasets || [];
        const charts = this.state.savedCharts || [];

        return `
            <div class="flex-column h-100">
                <div class="p-15 border-bottom bg-primary flex-between">
                    <div class="flex-center gap-15">
                        <button class="btn btn-ghost btn-sm" id="btn-cancel-report-edit">⬅️ 返回</button>
                        <h3 class="m-0">${isEdit ? '编辑报告模版' : '新建报告模版'}</h3>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-outline-primary btn-sm" id="btn-preview-current-report">👀 预览效果</button>
                        <button class="btn btn-primary btn-sm" id="btn-save-report">💾 保存模版</button>
                    </div>
                </div>
                
                <div class="flex" style="flex: 1; overflow: hidden;">
                    <!-- 左侧工具栏 -->
                    <div style="width: 250px; border-right: 1px solid var(--color-border); overflow-y: auto; padding: 15px;">
                        <div class="form-group mb-15">
                            <label class="text-sm font-bold mb-5 block">报告名称</label>
                            <input type="text" id="report-name" class="form-control" value="${report?.name || ''}" placeholder="如：月度销售分析报告">
                        </div>
                        
                        <div class="form-group mb-15">
                            <label class="text-sm font-bold mb-5 block">数据源</label>
                            <select id="report-dataset" class="form-control">
                                <option value="">-- 选择数据集 --</option>
                                ${datasets.map(d => `<option value="${d.id}" ${report?.dataset_id === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="mb-15">
                            <label class="text-sm font-bold mb-10 block">📝 插入内容</label>
                            <div class="flex flex-wrap gap-5">
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('title')" title="二号方正小标宋">大标题</button>
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('h1')" title="三号方正黑体">一级标题</button>
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('h2')" title="三号方正楷体">二级标题</button>
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('paragraph')" title="三号方正仿宋">正文内容</button>
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('divider')">分割线</button>
                                <button class="btn btn-outline-secondary btn-xs" onclick="AnalysisPage.prototype.insertReportElement('table')">空表格</button>
                            </div>
                            <p class="text-xs text-secondary mt-8">提示：点击右侧白板区域可直接输入内容</p>
                        </div>

                        <div class="mb-15">
                            <label class="text-sm font-bold mb-10 block">📊 插入图表</label>
                            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px;">
                                ${charts.length > 0 ? charts.map(c => `
                                    <div class="p-8 border-bottom cursor-pointer hover-bg flex-between" onclick="AnalysisPage.prototype.insertChartToReport(${c.id}, '${c.name}')">
                                        <span class="text-sm">${c.name}</span>
                                        <span class="badge badge-secondary text-xs">${c.chart_type}</span>
                                    </div>
                                `).join('') : '<div class="p-10 text-center text-secondary text-sm">暂无保存的图表</div>'}
                            </div>
                        </div>

                        <div class="mb-15">
                            <label class="text-sm font-bold mb-10 block">📋 插入数据字段</label>
                            <div id="report-field-list" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px;">
                                <div class="p-10 text-center text-secondary text-sm">请先选择数据源</div>
                            </div>
                        </div>

                        <div class="mb-15">
                            <label class="text-sm font-bold mb-10 block">🎨 格式设置</label>
                            <div class="flex flex-wrap gap-5">
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('bold')"><b>B</b></button>
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('italic')"><i>I</i></button>
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('underline')"><u>U</u></button>
                                <select class="form-control form-control-sm" style="width: 110px;" onchange="AnalysisPage.prototype.applyReportStyle('fontSize', this.value)">
                                    <option value="16pt">三号(正文)</option>
                                    <option value="26pt">一号</option>
                                    <option value="22pt">二号</option>
                                    <option value="15pt">小三</option>
                                    <option value="14pt">四号</option>
                                    <option value="12pt">小四</option>
                                    <option value="10.5pt">五号</option>
                                </select>
                                <select class="form-control form-control-sm" style="width: 125px;" onchange="document.execCommand('fontName', false, this.value)">
                                    <option value="inherit">字体</option>
                                    <option value="'FZXiaoBiaoSong-B05S', '方正小标宋简体', '方正小标宋_GBK', 'SimSun', serif">方正小标宋</option>
                                    <option value="'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong', serif">方正仿宋</option>
                                    <option value="'FZKai-Z03S', '方正楷体简体', '方正楷体_GBK', 'KaiTi', serif">方正楷体</option>
                                    <option value="'FZHei-B01S', '方正黑体简体', '方正黑体_GBK', 'SimHei', sans-serif">方正黑体</option>
                                    <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                                    <option value="'SimSun', serif">宋体</option>
                                </select>
                            </div>
                            <div class="flex flex-wrap gap-5 mt-8">
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('justifyLeft')" title="左对齐">⬅️</button>
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('justifyCenter')" title="居中对齐">↔️</button>
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('justifyRight')" title="右对齐">➡️</button>
                                <div style="display: flex; align-items: center; border: 1px solid var(--color-border); border-radius: 4px; padding: 2px;">
                                    <span class="text-xs mr-5">🎨</span>
                                    <input type="color" style="width: 20px; height: 18px; padding: 0; border: none; cursor: pointer; background: none;" onchange="document.execCommand('foreColor', false, this.value)" title="文字颜色">
                                </div>
                                <button class="btn btn-ghost btn-xs" onclick="document.execCommand('removeFormat')" title="清除格式">🧹</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 中间编辑区域 -->
                    <div style="flex: 1; overflow-y: auto; background: #e8e8e8; padding: 30px;" class="report-editor-container">
                        <div id="report-editor" 
                             contenteditable="true" 
                             style="
                                 background: white; 
                                 min-height: 297mm; 
                                 width: 210mm; 
                                 margin: 0 auto; 
                                 padding: 37mm 26mm 35mm 28mm; 
                                 box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                                 font-family: 'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong', serif;
                                 font-size: 16pt;
                                 line-height: 1.56;
                                 color: #333;
                                 outline: none;
                                 word-break: break-all;
                             ">${report?.template || this.getDefaultReportTemplate()}</div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 获取默认报告模版
     */
    getDefaultReportTemplate() {
        return `
            <p style="text-align: center; font-family: 'FZXiaoBiaoSong-B05S', '方正小标宋简体', '方正小标宋_GBK', 'SimSun'; font-size: 22pt; line-height: 1.2; margin-bottom: 40px; margin-top: 20px;">
                关于数据分析工作的汇报
            </p>
            <p style="text-align: right; color: #333; margin-bottom: 30px; font-family: 'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong'; font-size: 16pt;">
                生成日期：{{generated_date}}
            </p>
            <p style="font-family: 'FZHei-B01S', '方正黑体简体', '方正黑体_GBK', 'SimHei'; font-size: 16pt; font-weight: bold; margin-top: 30px;">
                一、 总体情况
            </p>
            <p style="text-indent: 32pt; font-family: 'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong'; font-size: 16pt;">
                本报告旨在对当前业务数据进行全面梳理与分析。经过对数据集的深度挖掘，发现在过去的一段时间内，各项关键指标运行平稳。
            </p>
            <p style="font-family: 'FZKai-Z03S', '方正楷体简体', '方正楷体_GBK', 'KaiTi'; font-size: 16pt; margin-top: 20px;">
                （一） 数据规模与质量
            </p>
            <p style="text-indent: 32pt; font-family: 'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong'; font-size: 16pt;">
                目前系统接入数据总量庞大，覆盖了业务全流程，数据准确率保持在较高水平，为后续决策提供了坚实基础。
            </p>
            <p style="font-family: 'FZHei-B01S', '方正黑体简体', '方正黑体_GBK', 'SimHei'; font-size: 16pt; font-weight: bold; margin-top: 30px;">
                二、 结论与建议
            </p>
            <p style="text-indent: 32pt; font-family: 'FZFangSong-Z02S', '方正仿宋简体', '方正仿宋_GBK', 'FangSong'; font-size: 16pt;">
                综上所述，建议在下一阶段加强对异常波动数据的监控，并进一步优化数据链路。
            </p>
        `;
    },

    /**
     * 渲染报告预览
     */
    renderReportPreview() {
        return `
            <div class="flex-column h-100">
                <div class="p-20 border-bottom bg-primary flex-between">
                    <div class="flex-center">
                        <button class="btn-icon mr-10" id="btn-close-report-preview">⬅️</button>
                        <h2 class="m-0">报告预览</h2>
                    </div>
                    <div class="flex gap-10">
                        <button class="btn btn-outline-primary btn-sm" onclick="window.print()">🖨️ 打印</button>
                        <button class="btn btn-primary btn-sm" id="btn-export-report-pdf">📄 导出PDF</button>
                    </div>
                </div>
                <div class="report-content-wrapper p-40" style="flex: 1; overflow-y: auto; background: #f5f7f9;">
                    <div class="report-paper shadow-lg" style="
                        background: white; 
                        min-height: 297mm; 
                        width: 210mm; 
                        margin: 0 auto; 
                        padding: 37mm 26mm 35mm 28mm; 
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                        font-family: 'FangSong', 'STFangsong', serif;
                        font-size: 16pt;
                        line-height: 1.56;
                        color: #333;
                        word-break: break-all;
                    ">
                        ${this.state.previewReportContent}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 应用报告样式
     */
    applyReportStyle(type, value) {
        if (type === 'fontSize') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const span = document.createElement('span');
                span.style.fontSize = value;
                range.surroundContents(span);
            }
        } else {
            document.execCommand(type, false, value);
        }
    },

    /**
     * 打开报告编辑器
     */
    async openReportEditor(report = null) {
        // 加载保存的图表列表
        try {
            const res = await AnalysisApi.getCharts();
            this.state.savedCharts = res.data || [];
        } catch (e) {
            this.state.savedCharts = [];
        }

        this.setState({ editingReport: report || {} });
    },

    /**
     * 插入报告元素
     */
    insertReportElement(type) {
        const editor = document.getElementById('report-editor');
        if (!editor) return;

        let html = '';
        switch (type) {
            case 'title':
                html = '<p style="text-align: center; font-family: \'FZXiaoBiaoSong-B05S\', \'方正小标宋简体\', \'方正小标宋_GBK\'; font-size: 22pt; line-height: 1.2; margin-bottom: 40px; margin-top: 20px;">大标题内容</p>';
                break;
            case 'h1':
                html = '<p style="font-family: \'FZHei-B01S\', \'方正黑体简体\', \'方正黑体_GBK\'; font-size: 16pt; font-weight: bold; margin-top: 30px;">一、一级标题</p>';
                break;
            case 'h2':
                html = '<p style="font-family: \'FZKai-Z03S\', \'方正楷体简体\', \'方正楷体_GBK\'; font-size: 16pt; margin-top: 20px;">（一）二级标题</p>';
                break;
            case 'paragraph':
                html = '<p style="text-indent: 32pt; font-family: \'FZFangSong-Z02S\', \'方正仿宋简体\', \'方正仿宋_GBK\'; font-size: 16pt;">此处输入正文内容，自动应用三号仿宋和首行缩进...</p>';
                break;
            case 'divider':
                html = '<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">';
                break;
            case 'table':
                html = `
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-family: 'FZFangSong-Z02S', '方正仿宋简体'; font-size: 14pt;">
                        <tr>
                            <th style="border: 1px solid #333; padding: 8px; background: #f9f9f9;">列1</th>
                            <th style="border: 1px solid #333; padding: 8px; background: #f9f9f9;">列2</th>
                            <th style="border: 1px solid #333; padding: 8px; background: #f9f9f9;">列3</th>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #333; padding: 8px;">数据</td>
                            <td style="border: 1px solid #333; padding: 8px;">数据</td>
                            <td style="border: 1px solid #333; padding: 8px;">数据</td>
                        </tr>
                    </table>
                `;
                break;
        }

        document.execCommand('insertHTML', false, html);
    },

    /**
     * 插入图表到报告
     */
    insertChartToReport(chartId, chartName) {
        const editor = document.getElementById('report-editor');
        if (!editor) return;

        const html = `
            <div class="report-chart-container" data-chart-id="${chartId}" style="width: 100%; height: 350px; margin: 20px 0; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #f9f9f9;">
                <span style="color: #999;">📊 图表: ${chartName}</span>
            </div>
        `;

        document.execCommand('insertHTML', false, html);
    },

    /**
     * 更新数据字段列表
     */
    async updateReportFieldList(datasetId) {
        const container = document.getElementById('report-field-list');
        if (!container || !datasetId) return;

        try {
            const res = await AnalysisApi.getDatasetData(datasetId, { page: 1, size: 1 });
            const columns = res.data?.columns || [];

            container.innerHTML = columns.map(col => `
                <div class="p-8 border-bottom cursor-pointer hover-bg text-sm" onclick="AnalysisPage.prototype.insertFieldToReport('${col}')">
                    {{${col}}}
                </div>
            `).join('') || '<div class="p-10 text-center text-secondary text-sm">无可用字段</div>';
        } catch (e) {
            container.innerHTML = '<div class="p-10 text-center text-danger text-sm">加载失败</div>';
        }
    },

    /**
     * 插入数据字段到报告
     */
    insertFieldToReport(fieldName) {
        const editor = document.getElementById('report-editor');
        if (!editor) return;

        document.execCommand('insertText', false, `{{${fieldName}}}`);
    },

    /**
     * 保存报告模版
     */
    async saveReport() {
        const name = document.getElementById('report-name')?.value;
        const datasetId = document.getElementById('report-dataset')?.value;
        const template = document.getElementById('report-editor')?.innerHTML;

        if (!name) return Toast.error('请输入报告名称');
        if (!template) return Toast.error('报告内容不能为空');

        try {
            const data = {
                name,
                template,
                dataset_id: datasetId ? parseInt(datasetId) : null
            };

            if (this.state.editingReport?.id) {
                await Api.put(`/analysis/smart-reports/${this.state.editingReport.id}`, data);
                Toast.success('保存成功');
            } else {
                await Api.post('/analysis/smart-reports', data);
                Toast.success('创建成功');
            }

            this.setState({ editingReport: undefined });
            this.fetchSmartReports();
        } catch (e) {
            Toast.error('保存失败: ' + e.message);
        }
    },

    async fetchSmartReports() {
        try {
            const res = await Api.get('/analysis/smart-reports');
            this.setState({ smartReports: res.data });
        } catch (e) {
            Toast.error('获取报告列表失败');
        }
    },

    /**
     * 渲染报告中的图表
     */
    async renderReportCharts() {
        const containers = document.querySelectorAll('.report-chart-container');
        if (containers.length === 0) return;

        for (const container of containers) {
            const chartId = container.dataset.chartId;
            if (!chartId) continue;

            try {
                const resChart = await AnalysisApi.getChart(chartId);
                const chartConfig = resChart.data;

                if (this.fetchChartData) {
                    const data = await this.fetchChartData(chartConfig.dataset_id);
                    if (data && data.length > 0) {
                        const myChart = echarts.init(container, 'light');
                        const { chart_type, config } = chartConfig;

                        const xField = config.xField;
                        const yField = config.yField;

                        const aggregatedData = Utils.aggregateData(data, xField, yField, config.aggregate || 'value', { maxItems: 20 });
                        const names = aggregatedData.map(d => d.name);
                        const values = aggregatedData.map(d => d.value);

                        let option = { animation: false };

                        switch (chart_type) {
                            case 'bar':
                                option = { ...option, title: { text: chartConfig.name, left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: names }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: values }] };
                                break;
                            case 'line':
                                option = { ...option, title: { text: chartConfig.name, left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: names }, yAxis: { type: 'value' }, series: [{ type: 'line', data: values, smooth: true }] };
                                break;
                            case 'pie':
                                option = { ...option, title: { text: chartConfig.name, left: 'center' }, tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: '50%', data: aggregatedData }] };
                                break;
                        }
                        myChart.setOption(option);
                    }
                }
            } catch (e) {
                console.error('图表加载失败:', e);
                container.innerHTML = `<div class="text-center text-danger p-20">图表加载失败</div>`;
            }
        }
    },

    bindSmartReportEvents() {
        if (this._smartReportEventsBound) return;
        this._smartReportEventsBound = true;

        // 新建
        this.delegate('click', '#btn-create-smart-report', () => {
            this.openReportEditor();
        });

        // 编辑
        this.delegate('click', '.btn-edit-smart-report', (e, el) => {
            const id = parseInt(el.dataset.id);
            const report = this.state.smartReports.find(r => r.id === id);
            this.openReportEditor(report);
        });

        // 删除
        this.delegate('click', '.btn-delete-smart-report', async (e, el) => {
            if (!confirm('确定删除该模版吗？')) return;
            const id = el.dataset.id;
            try {
                await Api.delete(`/analysis/smart-reports/${id}`);
                Toast.success('删除成功');
                this.fetchSmartReports();
            } catch (e) {
                Toast.error('删除失败');
            }
        });

        // 预览报告
        this.delegate('click', '.btn-preview-report', async (e, el) => {
            const id = el.dataset.id;
            try {
                Toast.info('正在生成报告...');
                const res = await Api.get(`/analysis/smart-reports/${id}/generate`);
                this.setState({ previewReportContent: res.data.content });
                setTimeout(() => this.renderReportCharts(), 500);
            } catch (e) {
                Toast.error('生成失败: ' + e.message);
            }
        });

        // 预览当前编辑的报告
        this.delegate('click', '#btn-preview-current-report', async () => {
            const template = document.getElementById('report-editor')?.innerHTML;
            if (!template) return Toast.error('报告内容为空');

            // 简单替换变量进行预览
            let content = template;
            content = content.replace(/\{\{generated_date\}\}/g, new Date().toLocaleDateString('zh-CN'));

            this.setState({ previewReportContent: content });
            setTimeout(() => this.renderReportCharts(), 500);
        });

        // 关闭预览
        this.delegate('click', '#btn-close-report-preview', () => {
            this.setState({ previewReportContent: null });
        });

        // 取消编辑
        this.delegate('click', '#btn-cancel-report-edit', () => {
            if (confirm('确定放弃编辑吗？未保存的内容将丢失')) {
                this.setState({ editingReport: undefined });
            }
        });

        // 保存报告
        this.delegate('click', '#btn-save-report', () => {
            this.saveReport();
        });

        // 数据源变更时更新字段列表
        this.delegate('change', '#report-dataset', (e, el) => {
            this.updateReportFieldList(el.value);
        });

        // 挂载插入方法到原型
        AnalysisPage.prototype.insertReportElement = (type) => this.insertReportElement(type);
        AnalysisPage.prototype.insertChartToReport = (id, name) => this.insertChartToReport(id, name);
        AnalysisPage.prototype.insertFieldToReport = (field) => this.insertFieldToReport(field);
    }
};

if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisSmartReportMixin);
}

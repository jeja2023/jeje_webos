/**
 * 数据建模模块 - ETL功能
 */

/**
 * ETL建模相关方法混入
 */
const AnalysisModelingMixin = {

    /**
     * 渲染数据建模页面
     */
    renderModeling() {
        if (this.state.currentModel) {
            return this.renderETLWorkspace();
        }
        return this.renderModelList();
    },

    /**
     * 渲染模型列表
     */
    renderModelList() {
        const models = this.state.modelList || [];
        return `
            <div class="model-list-page p-20">
                <div class="flex-between mb-20">
                    <h2>📦 数据模型管理</h2>
                    <div>
                         <button class="btn btn-ghost" id="btn-refresh-models">🔄 刷新</button>
                    </div>
                </div>
                
                <div class="model-grid">
                    ${models.length === 0 ? '<div class="empty-state text-center p-20 text-secondary w-100" style="grid-column: 1/-1;">暂无模型，请点击新建</div>' : ''}
                    
                    <!-- 新建模型卡片 -->
                    <div class="new-model-card animate-in btn-create-model-global">
                        <div class="new-card-icon">➕</div>
                        <span style="font-weight: 600; font-size: 15px;">新建模型</span>
                    </div>

                    ${models.map((m, index) => `
                        <div class="model-card animate-in" data-id="${m.id}" style="animation-delay: ${index * 50}ms">
                            <div class="model-card-top btn-edit-model" data-id="${m.id}">
                                <div class="model-icon-wrapper">
                                    <span>🧩</span>
                                </div>
                                <div class="model-title" title="${Utils.escapeHtml(m.name)}">${Utils.escapeHtml(m.name)}</div>
                                <div class="model-desc">${Utils.escapeHtml(m.description || '暂无描述信息')}</div>
                            </div>
                            <div class="model-card-bottom">
                                <div class="model-status-badge ${m.status === 'published' ? 'published' : 'draft'}">
                                    ${m.status === 'published' ? '✅ 已发布' : '📝 设计中'}
                                </div>
                                <div class="flex align-center gap-5">
                                    <span style="margin-right: 5px;">${Utils.formatDate(m.updated_at)}</span>
                                    ${m.status === 'published' ?
                `<button class="btn-run-model btn-model-action" data-id="${m.id}" title="立即运行" style="color:var(--color-success)">▶️</button>` : ''}
                                    <button class="btn-delete-model btn-model-action" data-id="${m.id}" title="删除模型">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- 新建模型弹窗 -->
                ${this.state.showCreateModelModal ? this.renderCreateModelModal() : ''}
            </div>
        `;
    },

    renderCreateModelModal() {
        return `
            <div class="modal-overlay active" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                <div class="modal-content bg-primary p-20 border-radius-10 shadow-lg" style="width: 400px; border: 1px solid var(--color-border);">
                    <h3 class="mb-15">新建数据模型</h3>
                    <div class="form-group mb-15">
                        <label class="d-block mb-5">模型名称</label>
                        <input type="text" class="form-control w-100" id="new-model-name" placeholder="输入模型名称">
                    </div>
                    <div class="form-group mb-20">
                        <label class="d-block mb-5">描述</label>
                        <textarea class="form-control w-100" id="new-model-desc" rows="3" placeholder="输入模型描述"></textarea>
                    </div>
                    <div class="flex justify-end gap-10">
                        <button class="btn btn-ghost" id="btn-cancel-create-model">取消</button>
                        <button class="btn btn-primary" id="btn-confirm-create-model">创建</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 辅助方法：生成算子列表
     */
    _renderOperatorsList() {
        return `
            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">输入 / 输出</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="source" data-label="数据输入"><span class="op-icon">📥</span><span>输入</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="sink" data-label="数据输出"><span class="op-icon">📤</span><span>输出</span></div>
            
            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">筛选与过滤</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="filter" data-label="条件过滤"><span class="op-icon">🔍</span><span>过滤</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="select" data-label="字段选择"><span class="op-icon">📝</span><span>字段</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="distinct" data-label="去重"><span class="op-icon">🎯</span><span>去重</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="sample" data-label="采样"><span class="op-icon">🎲</span><span>采样</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="limit" data-label="限制行数"><span class="op-icon">📏</span><span>限制</span></div>

            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">数据转换</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="group" data-label="分组聚合"><span class="op-icon">Σ</span><span>聚合</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="sort" data-label="排序"><span class="op-icon">⚡</span><span>排序</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="calculate" data-label="计算列"><span class="op-icon">🧮</span><span>计算</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="rename" data-label="字段重命名"><span class="op-icon">✏️</span><span>更名</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="pivot" data-label="数据透视"><span class="op-icon">📊</span><span>透视</span></div>

            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">数据关联</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="join" data-label="关联"><span class="op-icon">🔗</span><span>关联</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="union" data-label="合并"><span class="op-icon">➕</span><span>合并</span></div>

            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">清理增强</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="clean" data-label="清洗"><span class="op-icon">🧹</span><span>清洗</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="fillna" data-label="空值填充"><span class="op-icon">🔧</span><span>填充</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="typecast" data-label="类型转换"><span class="op-icon">🔄</span><span>转换</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="split" data-label="字段拆分"><span class="op-icon">✂️</span><span>拆分</span></div>

            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">文本与数学</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="text_ops" data-label="文本处理"><span class="op-icon">🔤</span><span>文本</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="math_ops" data-label="数学运算"><span class="op-icon">✖️</span><span>数学</span></div>

            <div class="opt-group-label text-xs text-secondary mb-5 mt-10">高级分析</div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="window" data-label="窗口函数"><span class="op-icon">🪟</span><span>窗口</span></div>
            <div class="etl-operator btn btn-outline-secondary mb-5 flex align-center justify-start gap-5" draggable="true" data-type="sql" data-label="SQL脚本"><span class="op-icon">💻</span><span>SQL</span></div>
        `;
    },

    renderETLWorkspace() {
        const { modelNodes = [], modelConnections = [], selectedNodeId, etlLogs = [], isConsoleOpen, isExecuting, currentModel } = this.state;
        const selectedNode = modelNodes.find(n => n.id === selectedNodeId);

        return `
            <div class="etl-layout flex-col h-100">
                <!-- 顶部工具栏 -->
                <div class="etl-header flex-between p-10 border-bottom bg-primary align-center">
                    <div class="flex gap-10 align-center">
                        <button class="btn btn-ghost btn-sm" id="btn-back-models">⬅️ 返回列表</button>
                        <div class="border-left pl-10 flex align-center gap-10">
                            <span class="font-bold text-lg">${currentModel?.name || '未命名模型'}</span>
                            <span class="badge ${currentModel?.status === 'published' ? 'badge-success' : 'badge-secondary'} text-xs" title="当前模型状态">
                                ${currentModel?.status === 'published' ? '已发布' : '设计中'}
                            </span>
                        </div>
                    </div>
                    <div class="flex gap-10">
                         <button class="btn btn-outline-primary btn-sm" id="btn-save-model-graph">💾 保存设计</button>
                         <button class="btn btn-primary btn-sm" id="btn-publish-model">🚀 发布模型</button>
                    </div>
                </div>

                <!-- 原有的三栏布局 -->
                <div class="etl-main-content flex flex-1 overflow-hidden">
                    <!-- 1. 算子面板 -->
                    <div class="etl-operators" style="width: 260px; border-right: 1px solid var(--color-border);">
                <div class="etl-panel-header p-10 font-bold border-bottom flex-between align-center">
                    <span>数据算子库</span>
                </div>
                <!-- 搜索框 -->
                <div class="p-10 border-bottom">
                    <input type="text" class="form-control form-control-sm w-100" id="etl-op-search" placeholder="🔍 搜索算子...">
                </div>
                        <div class="etl-operator-list p-10 overflow-y-auto" style="height: calc(100% - 40px); display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-content: start;">
                                ${this._renderOperatorsList()} 
                        </div>
                    </div>

                    <!-- 2. 画布区域 -->
                    <div class="etl-canvas flex-1 relative bg-secondary" id="etlCanvas" style="background-color: var(--color-bg-hover); overflow: hidden; cursor: grab;">
                        <div class="etl-canvas-toolbar absolute top-10 right-10 flex gap-5 z-10">
                            <button class="btn btn-ghost btn-sm bg-primary shadow-sm" id="btn-reset-canvas" title="重置画布位置">🔄</button>
                            <button class="btn btn-ghost btn-sm bg-primary shadow-sm" id="btn-toggle-console">
                                ${isConsoleOpen ? '隐藏日志' : '显示日志'}
                            </button>
                            <button class="btn btn-primary btn-sm ${isExecuting ? 'loading' : ''} shadow-sm" 
                                    id="btn-run-etl" ${isExecuting ? 'disabled' : ''}>
                                ${isExecuting ? '运行中...' : '▶ 全部运行'}
                            </button>
                        </div>
                        
                        <!-- 可平移的画布内容容器 -->
                        <div class="etl-workspace-container" id="etlWorkspaceContainer" 
                             style="position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; 
                                    transform: translate(${this.state.canvasOffsetX || 0}px, ${this.state.canvasOffsetY || 0}px);">
                             <!-- 节点层 (先渲染，在底层) -->
                            ${modelNodes.map(node => this.renderETLNode(node, node.id === selectedNodeId)).join('')}
                            
                             <!-- 连线层 (后渲染，在节点之上，删除按钮可点击) -->
                            <svg class="etl-connections" id="etlConnectionLayer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; z-index: 100;">
                                ${this.renderETLConnections(modelConnections, modelNodes)}
                                ${this.state.tempConnection ? this.renderTempConnection(this.state.tempConnection) : ''}
                            </svg>
        
                            ${modelNodes.length === 0 ? `
                                <div class="etl-canvas-empty absolute center-translate text-center text-secondary" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                                    <div class="empty-icon text-3xl mb-10">🔧</div>
                                    <p>从左侧拖拽算子到此处开始构建 ETL 流程</p>
                                </div>
                            ` : ''}
                        </div>

                        <!-- 控制台 -->
                        <div class="etl-console ${isConsoleOpen ? 'open' : ''} absolute bottom-0 left-0 right-0 bg-primary border-top transition-all" 
                             style="height: ${isConsoleOpen ? '200px' : '0'}; overflow: hidden; position: absolute; bottom: 0; left: 0; right: 0;">
                            <div class="console-header flex-between p-5 border-bottom px-10 bg-secondary">
                                <span class="text-sm font-bold">执行日志</span>
                                <button class="btn-icon btn-ghost btn-xs" id="btn-clear-console">🗑️</button>
                            </div>
                            <div class="console-body p-10 overflow-y-auto text-sm font-mono" style="height: calc(100% - 30px);">
                                ${etlLogs.length === 0 ? '<div class="log-empty text-secondary">等待执行...</div>' :
                etlLogs.map(log => `
                                    <div class="log-line ${log.type} mb-5">
                                        <span class="log-time text-secondary mr-5">[${log.time}]</span>
                                        <span class="log-msg">${log.message}</span>
                                    </div>
                                  `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- 3. 配置面板 -->
                    <div class="etl-config" style="width: 300px; border-left: 1px solid var(--color-border); flex-shrink: 0;">
                        <div class="etl-panel-header p-10 font-bold border-bottom">配置面板</div>
                        <div class="etl-config-content p-10 overflow-y-auto" id="etl-config-panel-content" style="height: calc(100% - 40px);">
                            ${selectedNode ? (this.state.selectedNodeConfigHtml || '<div class="text-center p-20 text-secondary">正在同步元数据...</div>') : (
                this.state.selectedConnIndex !== null && modelConnections[this.state.selectedConnIndex] ? `
                                    <div class="conn-config text-center">
                                        <div class="mb-20 text-secondary">
                                            <div class="text-3xl mb-10">🔗</div>
                                            <div class="font-bold text-primary mb-5">当前选中连线</div>
                                            <div class="text-xs">源: ${modelNodes.find(n => n.id === modelConnections[this.state.selectedConnIndex].sourceId)?.label || '未知'}</div>
                                            <div class="text-xs text-secondary mb-15">⬇️</div>
                                            <div class="text-xs">目标: ${modelNodes.find(n => n.id === modelConnections[this.state.selectedConnIndex].targetId)?.label || '未知'}</div>
                                        </div>
                                        <button class="btn btn-outline-danger btn-block btn-sm" id="btn-delete-conn-panel">🗑️ 移除此连线</button>
                                    </div>
                                ` : '<div class="config-empty text-center p-20 text-secondary">选择节点或连线以配置</div>'
            )}
                        </div>
                    </div>
                </div>
                <!-- 数据预览弹窗 -->
                ${this.state.previewNodeId ? this.renderETLPreviewModal() : ''}
            </div>
        `;
    },

    /**
     * 获取模型列表
     */
    async fetchModels() {
        try {
            const res = await AnalysisApi.getModels();
            this.setState({ modelList: res.data || [] });
        } catch (e) {
            Toast.error('刷新模型失败');
        }
    },

    // 辅助方法：获取数据集字段
    async _fetchDatasetColumns(datasetName) {
        if (!datasetName) return [];
        // 如果缓存中已有，直接返回
        if (this._datasetColsCache && this._datasetColsCache[datasetName]) {
            return this._datasetColsCache[datasetName];
        }

        try {
            let datasets = this.state.datasets || [];

            // 如果 state 中没有 datasets，尝试获取一次
            if (datasets.length === 0) {
                const dsRes = await AnalysisApi.getDatasets();
                datasets = dsRes.data || [];
                this.setState({ datasets });
            }

            const ds = datasets.find(d => d.name === datasetName || d.table_name === datasetName);
            if (!ds) {
                console.warn(`未找到名为 ${datasetName} 的数据集`);
                return [];
            }

            const res = await AnalysisApi.getDatasetData(ds.id, { page: 1, size: 1 });
            const cols = res.data?.columns || [];
            if (!this._datasetColsCache) this._datasetColsCache = {};
            this._datasetColsCache[datasetName] = cols;
            return cols;
        } catch (e) {
            console.error('获取字段失败:', e);
            return [];
        }
    },

    // 辅助方法：计算某个节点的所有可用输入字段
    async _getAvailableColumnsForNode(nodeId) {
        const { modelNodes = [], modelConnections = [] } = this.state;
        const node = modelNodes.find(n => n.id === nodeId);

        // 找到连接到当前节点的所有上游连线
        const upConns = modelConnections.filter(c => c.targetId === nodeId);

        if (upConns.length === 0) {
            // 如果没有上游，且自己是 source 类型，从数据集取
            if (node?.type === 'source') {
                // 优先从 DOM 读取当前选中的表（用户可能刚刚选择但未保存）
                const selectEl = document.getElementById('cfg-source-table');
                const tableName = selectEl?.value || node.data?.table;
                if (tableName) {
                    return await this._fetchDatasetColumns(tableName);
                }
            }
            return [];
        }

        // 收集所有分支的字段
        let allFields = [];
        for (const conn of upConns) {
            // 改进：这里不直接找 root source，而是逐级向上，直到找到有字段的节点
            // 这样未来可以支持在中间节点进行 Select/Rename 后的字段过滤
            const branchFields = await this._findBranchSourceFields(conn.sourceId);
            allFields = allFields.concat(branchFields);
        }

        // 去重并标准化格式
        const uniqueFields = [];
        const seen = new Set();
        allFields.forEach(f => {
            const fObj = typeof f === 'string' ? { name: f } : f;
            if (fObj && fObj.name && !seen.has(fObj.name)) {
                uniqueFields.push(fObj);
                seen.add(fObj.name);
            }
        });

        return uniqueFields;
    },

    // 递归寻找分支的最上游数据源字段
    async _findBranchSourceFields(nodeId) {
        const { modelNodes = [], modelConnections = [] } = this.state;
        let currentId = nodeId;
        let visited = new Set();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const n = modelNodes.find(item => item.id === currentId);
            if (n?.type === 'source' && n.data?.table) {
                return await this._fetchDatasetColumns(n.data.table);
            }
            // 向上找一个连线（假设处理链是单线或合并点）
            const upConn = modelConnections.find(c => c.targetId === currentId);
            currentId = upConn ? upConn.sourceId : null;
        }
        return [];
    },

    /**
     * 进入模型编辑模式
     */
    async enterModelEdit(modelId) {
        try {
            // 确保 datasets 已加载（用于 source 节点的下拉选择）
            if (!this.state.datasets || this.state.datasets.length === 0) {
                const dsRes = await AnalysisApi.getDatasets();
                this.setState({ datasets: dsRes.data || [] });
            }

            const res = await AnalysisApi.getModel(modelId);
            const model = res.data;

            // 解析图配置
            let nodes = [], connections = [];
            if (model.graph_config) {
                nodes = model.graph_config.nodes || [];
                connections = model.graph_config.connections || [];
            }

            this.setState({
                currentModel: model,
                modelNodes: nodes,
                modelConnections: connections,
                selectedNodeId: null,
                selectedNodeConfigHtml: null,
                etlLogs: []
            });

            // 稍后初始化拖放
            setTimeout(() => this.initETLCanvasDrop(), 100);
        } catch (e) {
            Toast.error('加载模型失败: ' + e.message);
        }
    },

    /**
     * 绑定Modeling事件
     */
    bindModelingEvents() {
        if (this._modelingEventsBound) return;
        this._modelingEventsBound = true;

        // 绑定刷新按钮
        this.delegate('click', '#btn-refresh-models', () => this.fetchModels());

        // 新建模型弹窗
        this.delegate('click', '.btn-create-model-global', () => {
            this.setState({ showCreateModelModal: true });
        });

        // 取消新建
        this.delegate('click', '#btn-cancel-create-model', () => {
            this.setState({ showCreateModelModal: false });
        });

        // 确认新建
        this.delegate('click', '#btn-confirm-create-model', async () => {
            const name = document.getElementById('new-model-name').value;
            const desc = document.getElementById('new-model-desc').value;
            if (!name) return Toast.error('请输入模型名称');

            try {
                const res = await AnalysisApi.createModel({ name, description: desc });
                Toast.success('创建成功');
                this.setState({ showCreateModelModal: false });
                this.fetchModels();
                // 自动进入编辑
                this.enterModelEdit(res.data.id);
            } catch (e) {
                Toast.error('创建失败: ' + e.message);
            }
        });

        // 编辑模型
        this.delegate('click', '.btn-edit-model', (e, el) => {
            const id = el.dataset.id;
            this.enterModelEdit(id);
        });

        // 返回列表
        this.delegate('click', '#btn-back-models', () => {
            if (confirm('确定要返回吗？未保存的更改将丢失。')) {
                this.setState({ currentModel: null });
                this.fetchModels();
            }
        });

        // 保存模型设计
        this.delegate('click', '#btn-save-model-graph', async () => {
            const { currentModel, modelNodes, modelConnections } = this.state;
            if (!currentModel) return;

            let newStatus = null;
            // 如果当前是已发布状态，保存时提示并转回草稿
            if (currentModel.status === 'published') {
                if (!confirm('该模型已发布。保存修改将使模型状态变更为“设计中”，是否继续？')) {
                    return;
                }
                newStatus = 'draft';
            }

            try {
                const graphConfig = {
                    nodes: modelNodes,
                    connections: modelConnections
                };

                const payload = { graph_config: graphConfig };
                if (newStatus) payload.status = newStatus;

                await AnalysisApi.saveModelGraph(currentModel.id, payload);

                // 更新本地状态
                if (newStatus) {
                    this.setState({ currentModel: { ...currentModel, status: newStatus } });
                }

                Toast.success('保存成功' + (newStatus ? ' (状态已更新为设计中)' : ''));
            } catch (e) {
                Toast.error('保存失败');
            }
        });

        // 发布模型
        this.delegate('click', '#btn-publish-model', async () => {
            if (!confirm('确定要发布此模型吗？发布后状态将变为“已发布”。')) return;
            const { currentModel, modelNodes, modelConnections } = this.state;
            if (!currentModel) return;

            try {
                // 保存图并更新状态
                const graphConfig = {
                    nodes: modelNodes,
                    connections: modelConnections
                };
                // 假设 saveModelGraph 支持更新 status，或者后端会处理 extra data
                await AnalysisApi.saveModelGraph(currentModel.id, {
                    graph_config: graphConfig,
                    status: 'published'
                });

                // 更新本地状态
                this.setState({ currentModel: { ...currentModel, status: 'published' } });
                Toast.success('模型已发布！');
            } catch (e) {
                Toast.error('发布失败: ' + (e.message || '未知错误'));
            }
        });

        // 快速运行发布模型
        this.delegate('click', '.btn-run-model', async (e, el) => {
            const id = el.dataset.id;
            if (!confirm('确定要立即执行此模型的输出任务吗？')) return;

            try {
                el.disabled = true;
                el.innerHTML = '⏳';

                const token = Utils.getToken();
                const response = await fetch(`/api/v1/analysis/models/${id}/execute`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const res = await response.json();

                if (res.code === 200) {
                    Toast.success(res.message || '执行成功');
                } else {
                    Toast.error(res.message || '执行失败');
                }
            } catch (err) {
                console.error(err);
                Toast.error('请求失败: ' + err.message);
            } finally {
                el.disabled = false;
                el.innerHTML = '▶️';
            }
        });

        // 删除模型
        this.delegate('click', '.btn-delete-model', async (e, el) => {
            if (!confirm('确定要删除此模型吗？')) return;
            const id = el.dataset.id;
            try {
                await AnalysisApi.deleteModel(id);
                Toast.success('删除成功');
                this.fetchModels();
            } catch (e) {
                Toast.error('删除失败');
            }
        });

        /* ========== ETL 工作台操作 ========== */

        // 点击选中节点
        this.delegate('mousedown', '.etl-node', (e, el) => {
            // 防止拖拽干扰点击操作
            if (e.target.classList.contains('node-port')) return;
            // 防止点击操作按钮时触发拖拽
            if (e.target.closest('.btn-node-preview')) return;
            if (e.target.closest('.btn-node-run')) return;

            const id = el.dataset.nodeId;

            // 切换选中状态，并触发异步配置加载（不等待，立即响应交互）
            this._loadNodeConfig(id);

            // 开始拖拽节点逻辑
            this.startETLNodeDrag(e, id);
        });

        // 节点运行按钮点击 - 调用后端真实执行
        this.delegate('mousedown', '.btn-node-run', async (e, el) => {
            e.stopPropagation();
            e.preventDefault();
            const nodeId = el.closest('.etl-node').dataset.nodeId;

            await this._executeNode(nodeId);
        });

        // 节点预览按钮点击 - 只预览已执行节点
        this.delegate('mousedown', '.btn-node-preview', async (e, el) => {
            e.stopPropagation();
            e.preventDefault();
            const nodeId = el.closest('.etl-node').dataset.nodeId;

            // 检查节点是否已执行
            const node = this.state.modelNodes.find(n => n.id === nodeId);
            if (!node || (node.status !== 'success' && node.status !== 'executed')) {
                Toast.warning('请先运行此节点');
                return;
            }

            // 调用后端预览接口
            await this._previewNode(nodeId);
        });

        // 节点删除按钮点击
        this.delegate('mousedown', '.btn-node-delete', (e, el) => {
            e.stopPropagation();
            e.preventDefault();
            const nodeId = el.closest('.etl-node').dataset.nodeId;
            if (confirm('确定要删除此节点及其连接吗？')) {
                this.deleteETLNode(nodeId);
            }
        });

        // 切换控制台
        this.delegate('click', '#btn-toggle-console', () => {
            this.setState({ isConsoleOpen: !this.state.isConsoleOpen });
        });

        // 监听配置保存按钮 (现在增加静默保存逻辑)
        this.delegate('click', '#btn-save-node-cfg', async () => {
            await this._saveNodeConfig();
        });

        // 监听数据源变更，自动刷新字段（静默刷新）
        this.delegate('change', '#cfg-source-table, #cfg-join-table', async (e, el) => {
            const { selectedNodeId, modelNodes } = this.state;
            const node = modelNodes.find(n => n.id === selectedNodeId);
            if (!node) return;

            // 预存表名变更
            const updates = node.type === 'source' ? { table: el.value } : { joinTable: el.value };
            this.updateETLNodeData(node.id, updates);

            // 重新获取元数据，表变了需要强制 loading
            await this._loadNodeConfig(node.id, true);
        });

        // 清空日志
        this.delegate('click', '#btn-clear-console', () => {
            this.setState({ etlLogs: [] });
        });



        // 关闭预览弹窗
        this.delegate('click', '#btn-close-preview', () => {
            this.setState({ previewNodeId: null });
        });

        // 下载结果 - 导出 Sink 节点数据为 CSV
        this.delegate('click', '#btn-download-etl-result', async () => {
            const { selectedNodeId, modelNodes, currentModel } = this.state;
            const node = modelNodes.find(n => n.id === selectedNodeId);

            if (!node || node.type !== 'sink') {
                Toast.error('请先选择输出节点');
                return;
            }

            if (node.status !== 'success' && node.status !== 'executed') {
                Toast.error('请先运行此节点');
                return;
            }

            Toast.info('正在准备导出...');

            try {
                // 获取节点的预览数据
                const res = await AnalysisApi.previewETLNode({
                    model_id: currentModel.id,
                    node_id: node.id
                });

                if (res.code === 200 && res.data?.preview) {
                    const data = res.data.preview;
                    const columns = res.data.columns || Object.keys(data[0] || {});

                    // 转换为 CSV
                    let csv = columns.join(',') + '\n';
                    data.forEach(row => {
                        csv += columns.map(col => {
                            const val = row[col];
                            if (val === null || val === undefined) return '';
                            const str = String(val);
                            // 如果包含逗号、引号或换行，需要用引号包裹
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return '"' + str.replace(/"/g, '""') + '"';
                            }
                            return str;
                        }).join(',') + '\n';
                    });

                    // 下载文件
                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${node.data?.target || 'etl_result'}_${Date.now()}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);

                    Toast.success(`导出成功: ${data.length} 行`);
                } else {
                    throw new Error(res.message || '获取数据失败');
                }
            } catch (e) {
                Toast.error('导出失败: ' + e.message);
            }
        });

        // 运行 ETL
        this.delegate('click', '#btn-run-etl', () => {
            if (!this.state.isExecuting) {
                this.runETLJob();
            }
        });

        // 删除节点（配置面板中）
        this.delegate('click', '#btn-delete-node', () => {
            const { selectedNodeId } = this.state;
            if (selectedNodeId && confirm('确定要删除该节点吗？')) {
                this.deleteETLNode(selectedNodeId);
            }
        });

        // 节点配置中的字段点击切换 (全响应式同步)
        this.delegate('click', '.visual-field-chip', async (e, el) => {
            const col = el.dataset.col;
            const targetId = el.dataset.target;

            // 特殊处理：过滤条件的字段插入
            if (targetId === 'cfg-filter-chips') {
                const area = document.getElementById('cfg-filter-cond');
                if (area) {
                    const start = area.selectionStart;
                    const end = area.selectionEnd;
                    const text = area.value;
                    area.value = text.substring(0, start) + col + text.substring(end);
                    area.focus();
                    area.selectionStart = area.selectionEnd = start + col.length;
                    await this._saveNodeConfig(true);
                }
                return;
            }

            const single = el.dataset.single === 'true';
            const input = document.getElementById(targetId);
            if (!input) return;

            // 【即时反馈】点击后立即切换 Chip 样式，增强响应感，避免等待 reload
            if (single) {
                // 单选模式：移除同容器内其他 active
                const container = el.closest('.field-chips-container');
                container.querySelectorAll('.visual-field-chip').forEach(chip => chip.classList.remove('active'));
                el.classList.add('active');
            } else {
                // 多选模式：直接切换
                el.classList.toggle('active');
            }

            let vals = input.value.split(',').map(v => v.trim()).filter(v => v);
            if (single) {
                vals = [col];
            } else {
                if (vals.includes(col)) vals = vals.filter(v => v !== col);
                else vals.push(col);
            }

            input.value = vals.join(', ');
            const { selectedNodeId } = this.state;
            // 使用 skipReload 模式保存，避免全量 HTML 重绘导致跳动
            if (selectedNodeId) await this._saveNodeConfig(true, true);
        });

        // 通用表单输入实时同步 (防止重绘丢失)
        this.delegate('input', '.etl-config-content .form-control', (e, el) => {
            // 仅同步数据，不强制刷新 HTML，除非是保存
        });

        // 点击空白处取消选中
        this.delegate('mousedown', '#etlCanvas', (e) => {
            if (e.target.id === 'etlCanvas' || e.target.closest('.etl-workspace')) {
                // 如果点击的不是节点、连线、连线组、删除按钮，则清空选中状态
                if (!e.target.closest('.etl-node') &&
                    !e.target.closest('.etl-conn-line') &&
                    !e.target.closest('.etl-conn-group') &&
                    !e.target.closest('.etl-conn-remove') &&
                    !e.target.closest('.node-port')) {
                    this.setState({ selectedNodeId: null, selectedConnIndex: null });
                }
            }
        });

        // 右侧面板删除连线
        this.delegate('click', '#btn-delete-conn-panel', () => {
            const index = this.state.selectedConnIndex;
            if (index !== null && confirm('确定要移除这条连线吗？')) {
                const conns = [...(this.state.modelConnections || [])];
                conns.splice(index, 1);
                this.setState({ modelConnections: conns, selectedConnIndex: null });
                Toast.success('连线已移除');
            }
        });

        // 连线删除按钮点击 (使用全局事件确保不会因 DOM 重建而失效)
        if (!this._connDeleteBound) {
            this._connDeleteBound = true;
            const self = this;
            document.addEventListener('click', function (e) {
                const removeBtn = e.target.closest('.etl-conn-remove');
                if (removeBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    const index = parseInt(removeBtn.dataset.index);
                    const { modelConnections } = self.state;

                    if (modelConnections && modelConnections[index] !== undefined) {
                        if (confirm('确定要移除这条连线吗？')) {
                            const newConns = [...modelConnections];
                            newConns.splice(index, 1);
                            self.setState({ modelConnections: newConns, selectedConnIndex: null });

                        }
                    }
                    return;
                }

                // 检查是否点击了连线组
                const connGroup = e.target.closest('.etl-conn-group');
                if (connGroup && self.state.currentModel) {
                    e.stopPropagation();
                    const index = parseInt(connGroup.dataset.index);
                    self.setState({ selectedConnIndex: index, selectedNodeId: null });
                }
            }, true); // 使用捕获阶段
        }

        // 端口点击拖拽连线
        this.delegate('mousedown', '.node-port', (e, el) => {
            e.stopPropagation();
            const nodeId = el.closest('.etl-node').dataset.nodeId;
            const isOut = el.classList.contains('port-out');
            if (isOut) {
                this.startETLConnectionLine(e, nodeId);
            }
        });

        // 绑定算子列表拖拽开始 (核心修复：补全缺失的 dragstart 处理)
        this.delegate('dragstart', '.etl-operator', (e, el) => {
            const type = el.dataset.type;
            const label = el.dataset.label;

            this._draggedOp = { type, label };

            // 设置拖拽效果
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', type); // 部分浏览器需要设置数据才能触发 drop
            }

            el.style.opacity = '0.5';
        });

        this.delegate('dragend', '.etl-operator', (e, el) => {
            el.style.opacity = '1';
        });

        // ----------------------------------------------------
        // 优化功能：算子搜索
        // ----------------------------------------------------
        this.delegate('input', '#etl-op-search', (e) => {
            const val = e.target.value.trim().toLowerCase();
            const items = document.querySelectorAll('.etl-operator-list .etl-operator');
            const groups = document.querySelectorAll('.etl-operator-list .opt-group-label');

            items.forEach(item => {
                const label = item.dataset.label || '';
                const type = item.dataset.type || '';
                const text = item.textContent || '';

                if (!val || label.includes(val) || type.includes(val) || text.includes(val)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });

            // 如果整个分组都没了，是否隐藏分组标题？简单起见暂时保留，或后续优化
        });

        // ----------------------------------------------------
        // 优化功能：键盘快捷键支持 (Delete 删除)
        // ----------------------------------------------------
        if (!this._keyboardEventsBound) {
            this._keyboardEventsBound = true;
            document.addEventListener('keydown', (e) => {
                // 仅在 Modeling Tab 且焦点不在输入框时生效
                if (this.state.activeTab !== 'modeling' || !this.state.currentModel) return;

                const activeTag = document.activeElement.tagName.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement.contentEditable === 'true') {
                    return;
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const { selectedNodeId, selectedConnIndex } = this.state;

                    if (selectedNodeId) {
                        e.preventDefault();
                        if (confirm('确定要删除选中的节点吗？')) {
                            this.deleteETLNode(selectedNodeId);
                        }
                    } else if (selectedConnIndex !== null) {
                        e.preventDefault();
                        if (confirm('确定要移除选中的连线吗？')) {
                            const conns = [...(this.state.modelConnections || [])];
                            if (conns[selectedConnIndex]) {
                                conns.splice(selectedConnIndex, 1);
                                this.setState({ modelConnections: conns, selectedConnIndex: null });
                                Toast.success('连线已移除');
                            }
                        }
                    }
                }
            });
        }
    },

    /**
     * 加载节点配置详情（支持异步元数据）
     * @param {string} nodeId 节点ID
     * @param {boolean} showLoading 是否显示加载提示，默认显示
     */
    async _loadNodeConfig(nodeId, showLoading = true) {
        if (!nodeId) return;

        // 【优化】记录当前配置面板的滚动位置，防止重绘跳动
        const panel = document.getElementById('etl-config-panel-content');
        const scrollPos = panel ? panel.scrollTop : 0;

        // 如果需要显示加载状态或当前无 HTML，则清空
        if (showLoading || !this.state.selectedNodeConfigHtml) {
            this.setState({ selectedNodeId: nodeId, selectedNodeConfigHtml: null });
        } else {
            this.setState({ selectedNodeId: nodeId });
        }

        const node = (this.state.modelNodes || []).find(n => n.id === nodeId);
        if (node) {
            const html = await this.renderETLNodeConfig(node);

            // 使用异步更新确保 DOM 已渲染后恢复滚动条
            this.setState({ selectedNodeConfigHtml: html });

            if (panel) {
                setTimeout(() => {
                    const newPanel = document.getElementById('etl-config-panel-content');
                    if (newPanel) newPanel.scrollTop = scrollPos;
                }, 0);
            }
        }
    },

    /**
     * 保存当前选中节点的配置
     * @param {boolean} silentMode 静默模式，不弹出 Toast 提示
     */
    async _saveNodeConfig(silentMode = false, skipReload = false) {
        const { selectedNodeId, modelNodes } = this.state;
        const node = modelNodes.find(n => n.id === selectedNodeId);
        if (!node) return;

        let updates = {};
        const getValue = (id) => {
            const el = document.getElementById(id);
            // 改进：如果 DOM 不存在（可能刚删除或切走），优先从 node.data 取，防止清空数据
            if (!el) return (node.data ? node.data[id.replace('cfg-', '').replace('-', '')] : null);
            return el.value;
        };

        // ... 之前的 switch 逻辑保持不变 ...
        // (注：为节省 token，这里不重复展示 switch 内部)

        // 根据节点类型读取配置
        switch (node.type) {
            case 'source':
                updates.table = getValue('cfg-source-table');
                break;
            case 'sink':
                updates.target = getValue('cfg-sink-target');
                updates.mode = getValue('cfg-sink-mode');
                break;
            case 'filter':
                const filterRows = document.querySelectorAll('.etl-filter-row');
                if (filterRows.length > 0) {
                    updates.conditions = Array.from(filterRows).map((row, i) => ({
                        join: i > 0 ? (row.querySelector('.filter-join')?.value || 'AND') : 'AND',
                        field: row.querySelector('.filter-field').value,
                        operator: row.querySelector('.filter-op').value,
                        value: row.querySelector('.filter-val').value
                    }));
                    // 更新摘要用的首个条件
                    if (updates.conditions.length > 0) {
                        updates.field = updates.conditions[0].field;
                        updates.operator = updates.conditions[0].operator;
                        updates.value = updates.conditions[0].value;
                    }
                } else {
                    updates.field = getValue('cfg-filter-field');
                    updates.operator = getValue('cfg-filter-op');
                    updates.value = getValue('cfg-filter-value');
                }
                break;
            case 'select':
                updates.columns = getValue('cfg-select-cols');
                break;
            case 'distinct':
                updates.columns = getValue('cfg-distinct-cols');
                break;
            case 'sample':
                updates.rate = getValue('cfg-sample-rate');
                break;
            case 'limit':
                updates.count = getValue('cfg-limit-count');
                break;
            case 'group':
                updates.groupBy = getValue('cfg-group-by');
                updates.aggFunc = getValue('cfg-group-func');
                updates.aggCol = getValue('cfg-group-agg-col');
                break;
            case 'sort':
                updates.orderBy = getValue('cfg-sort-col');
                updates.direction = getValue('cfg-sort-dir');
                break;
            case 'calculate':
                updates.newColumn = getValue('cfg-calc-name');
                updates.fieldA = getValue('cfg-calc-field-a');
                updates.op = getValue('cfg-calc-op');
                updates.value = getValue('cfg-calc-value');
                updates.expression = `${updates.newColumn} = ${updates.fieldA} ${updates.op} ${updates.value}`;
                break;
            case 'rename':
                updates.oldCol = getValue('cfg-rename-old');
                updates.newCol = getValue('cfg-rename-new');
                updates.mapping = `${updates.oldCol}:${updates.newCol}`;
                break;
            case 'join':
                updates.joinType = getValue('cfg-join-type');
                updates.leftOn = getValue('cfg-join-left');
                updates.rightOn = getValue('cfg-join-right');
                updates.leftOutputCols = getValue('cfg-join-left-output');
                updates.rightOutputCols = getValue('cfg-join-right-output');
                break;
            case 'union':
                updates.unionMode = getValue('cfg-union-mode');
                break;
            case 'fillna':
                updates.targetCol = getValue('cfg-fillna-col');
                updates.fillValue = getValue('cfg-fillna-val');
                break;
            case 'typecast':
                updates.column = getValue('cfg-cast-col');
                updates.castType = getValue('cfg-cast-type');
                break;
            case 'split':
                updates.sourceCol = getValue('cfg-split-source');
                updates.separator = getValue('cfg-split-sep');
                updates.limit = getValue('cfg-split-limit');
                break;
            case 'sql':
                updates.query = getValue('cfg-sql-query');
                break;
            case 'clean':
                updates.mode = getValue('cfg-clean-mode');
                break;
            case 'pivot':
                updates.index = getValue('cfg-pivot-index');
                updates.columns = getValue('cfg-pivot-column');
                updates.values = getValue('cfg-pivot-values');
                updates.aggFunc = getValue('cfg-pivot-func');
                break;
            case 'text_ops':
                updates.targetCol = getValue('cfg-text-col');
                updates.func = getValue('cfg-text-func');
                updates.newCol = getValue('cfg-text-new-name');
                break;
            case 'math_ops':
                updates.fieldA = getValue('cfg-math-field-a');
                updates.op = getValue('cfg-math-op');
                updates.value = getValue('cfg-math-val');
                updates.newCol = getValue('cfg-math-new-name');
                break;
            case 'window':
                updates.func = getValue('cfg-window-func');
                updates.partitionBy = getValue('cfg-window-partition');
                updates.orderBy = getValue('cfg-window-order');
                updates.newCol = getValue('cfg-window-new-name');
                break;
        }

        // 通用：更新节点标签
        const label = getValue('cfg-node-label');
        if (label) updates.label = label;

        // 通用：输出字段选择（对于非 sink 节点）
        if (node.type !== 'sink') {
            updates.outputColumns = getValue('cfg-output-cols');
        }

        if (skipReload) {
            // 【核心修复】skipReload 模式下，我们要彻底避免 setState 触发的重绘
            // 1. 直接修改 state 中的数据对象引用 (绕过 React/Mixin 的 Diff 机制)
            const nodeIndex = this.state.modelNodes.findIndex(n => n.id === node.id);
            if (nodeIndex !== -1) {
                // 原地合并 data
                const originalData = this.state.modelNodes[nodeIndex].data || {};
                this.state.modelNodes[nodeIndex].data = { ...originalData, ...updates };
            }

            // 2. 将当前 DOM 的最新状态（Value, Active Class）反向同步到 HTML 缓存字符串
            // 这样即使未来因其他原因触发了重绘，也会使用这个包含最新状态的 HTML
            const panelContent = document.getElementById('etl-config-panel-content');
            if (panelContent) {
                // 同步 Input value 到 attribute (innerHTML 默认只包含 attribute)
                panelContent.querySelectorAll('input').forEach(inp => inp.setAttribute('value', inp.value));

                // 同步 Select selected
                panelContent.querySelectorAll('select').forEach(sel => {
                    const val = sel.value;
                    sel.querySelectorAll('option').forEach(opt => {
                        if (opt.value === val) opt.setAttribute('selected', 'selected');
                        else opt.removeAttribute('selected');
                    });
                });

                // 更新缓存
                this.state.selectedNodeConfigHtml = panelContent.innerHTML;
            }
        } else {
            // 正常模式：走标准更新流程 (会触发 setState -> render)
            this.updateETLNodeData(node.id, updates);
            await this._loadNodeConfig(node.id, false);
        }

        if (!silentMode) Toast.success('节点配置已保存');
    },

    /**
     * 渲染ETL节点
     */
    renderETLNode(node, isSelected) {
        const icons = {
            source: '📥', sink: '📤', filter: '🔍', select: '📝', group: 'Σ',
            join: '🔗', sort: '⚡', clean: '🧹', distinct: '🎯', sample: '🎲',
            limit: '📏', calculate: '🧮', rename: '✏️', pivot: '📊', union: '➕',
            fillna: '🔧', typecast: '🔄', split: '✂️', sql: '💾'
        };
        // 按类别定义颜色
        const colors = {
            // 输入/输出 - 蓝色系
            source: '#3b82f6', sink: '#1d4ed8',
            // 筛选过滤 - 绿色系
            filter: '#10b981', select: '#059669', distinct: '#047857', sample: '#34d399', limit: '#6ee7b7',
            // 数据转换 - 紫色系
            group: '#8b5cf6', sort: '#7c3aed', calculate: '#a855f7', rename: '#c084fc', pivot: '#d946ef',
            // 数据关联 - 橙色系
            join: '#f97316', union: '#fb923c',
            // 清理增强 - 青色系
            clean: '#06b6d4', fillna: '#22d3ee', typecast: '#67e8f9', split: '#0891b2',
            // 高级脚本 - 灰色系
            sql: '#64748b'
        };
        const nodeColor = colors[node.type] || '#6b7280';
        const isExecuted = node.status === 'success' || node.status === 'executed';
        const isRunning = node.status === 'running';
        const hasError = node.status === 'error';

        // 动态标签：如果是 source 且已选表，直接显示表名
        let displayLabel = node.data?.label || node.type;
        if (node.type === 'source' && node.data?.table) {
            displayLabel = node.data.table;
        }

        // 双输入端口支持 (Join / Union)
        const isMultiInput = node.type === 'join' || node.type === 'union';
        const portsHtml = isMultiInput
            ? '<div class="node-port port-in port-in-left"></div><div class="node-port port-in port-in-right"></div>'
            : '<div class="node-port port-in"></div>';

        return `
            <div class="etl-node ${node.status || ''} ${isSelected ? 'selected' : ''}" 
                 data-node-id="${node.id}"
                 style="left: ${node.x}px; top: ${node.y}px; border-left: 4px solid ${nodeColor};">
                ${portsHtml}
                <div class="node-head" style="background: linear-gradient(90deg, ${nodeColor}20, transparent);">
                    <span class="node-icon">${icons[node.type] || '📦'}</span>
                    <span class="node-label" style="max-width: 120px;" title="${Utils.escapeHtml(displayLabel)}">${displayLabel}</span>
                    <div class="node-actions-mini">
                         <span class="btn-node-run" title="运行此节点" style="color: #10b981;">▶️</span>
                         <span class="btn-node-preview" title="预览数据" style="color: var(--color-primary); ${isExecuted ? '' : 'display:none;'}">👁️</span>
                         <span class="btn-node-delete" title="删除节点" style="color: #ef4444;">🗑️</span>
                    </div>
                    ${isRunning ? '<div class="node-spinner"></div>' : ''}
                    ${isExecuted ? '<span class="node-status" title="已成功">✅</span>' : ''}
                    ${hasError ? '<span class="node-status" title="执行失败">❌</span>' : ''}
                </div>
                <div class="node-info">
                    ${isExecuted && node.data?._rowCount ? `📊 ${node.data._rowCount} 行数据` : this.getNodeSummary(node)}
                </div>
                <div class="node-port port-out" style="background: ${nodeColor}; border-color: ${nodeColor};"></div>
            </div>
        `;
    },

    /**
     * 获取节点摘要信息
     */
    getNodeSummary(node) {
        const d = node.data || {};
        switch (node.type) {
            case 'source': return d.table || '未配置来源';
            case 'sink': return d.target || '未配置目标';
            case 'filter': return (d.field && d.operator) ? `${d.field} ${d.operator} ${d.value || ''}` : '未设置条件';
            case 'select': return d.columns || '全部字段';
            case 'distinct': return d.columns || '全部列去重';
            case 'sample': return d.rate ? `${d.rate}%` : '未配置';
            case 'limit': return d.count ? `取前 ${d.count} 行` : '未配置';
            case 'group': return d.groupBy ? `按 ${d.groupBy} 分组` : '未配置分组';
            case 'sort': return d.orderBy ? `${d.orderBy} ${d.direction || 'ASC'}` : '未配置排序';
            case 'calculate': return (d.newColumn && d.fieldA) ? `${d.newColumn}=${d.fieldA}${d.op || '+'}${d.value || ''}` : '未配置公式';
            case 'rename': return d.oldCol ? `${d.oldCol}→${d.newCol}` : '未配置映射';
            case 'pivot': return d.index ? `索引: ${d.index}` : '未配置';
            case 'join': return d.joinType ? `${d.joinType.toUpperCase()} JOIN` : '未配置';
            case 'union': return d.tables ? `合并: ${d.tables}` : '未配置';
            case 'fillna': return d.fillValue !== undefined ? `填充: ${d.fillValue}` : '未配置';
            case 'typecast': return d.castType ? `转为 ${d.castType}` : '未配置';
            case 'split': return d.separator ? `分隔符: "${d.separator}"` : '未配置';
            case 'sql': return d.query ? '已配置 SQL' : '未配置 SQL';
            case 'clean': return d.mode ? (d.mode === 'drop_na' ? '删除空值行' : '删除重复行') : '未配置';
            default: return '';
        }
    },

    /**
     * 渲染ETL连接线 - 左右布局（从右侧输出到左侧输入）
     */
    renderETLConnections(connections, nodes) {
        const { selectedConnIndex } = this.state;

        // 用于跟踪每个节点已有多少个输入连线，以便分配上下端口
        const portOccupation = {};

        return connections.map((conn, index) => {
            const src = nodes.find(n => n.id === conn.sourceId);
            const tgt = nodes.find(n => n.id === conn.targetId);
            if (!src || !tgt) return '';

            // 使用实际的 CSS 尺寸
            const nodeWidth = 200;
            const nodeHeight = 86;

            // 出发点：右侧中心（输出端口）
            const x1 = src.x + nodeWidth;
            const y1 = src.y + nodeHeight / 2;

            // 到达点：左侧（输入端口）
            const x2 = tgt.x;
            let y2 = tgt.y + nodeHeight / 2; // 默认中心

            // JOIN/UNION 节点有两个输入端口（上下分布）
            if (tgt.type === 'join' || tgt.type === 'union') {
                const occupationIdx = portOccupation[tgt.id] || 0;
                if (occupationIdx === 0) {
                    y2 = tgt.y + nodeHeight * 0.3; // 30% 处（上端口）
                } else {
                    y2 = tgt.y + nodeHeight * 0.7; // 70% 处（下端口）
                }
                portOccupation[tgt.id] = occupationIdx + 1;
            }

            // 使用水平方向的三次贝塞尔曲线
            const ctrlOffset = Math.max(50, Math.abs(x2 - x1) * 0.3);
            const d = `M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`;
            const isSelected = selectedConnIndex === index;

            // 计算中点用于放置删除按钮
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return `
                <g class="etl-conn-group" data-index="${index}" style="pointer-events: auto; cursor: pointer;">
                    <!-- 极宽的透明感应层 (40px) -->
                    <path d="${d}" stroke="rgba(0,0,0,0)" stroke-width="40" fill="none" class="etl-conn-hit-area" data-index="${index}" style="pointer-events: stroke;" />
                    <!-- 可见连线 -->
                    <path class="etl-conn-line ${isSelected ? 'selected' : ''}" 
                          d="${d}" 
                          stroke="${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}"
                          stroke-width="${isSelected ? '3' : '2'}"
                          fill="none" 
                          style="pointer-events: none;" />
                    
                    <!-- 悬停即显的删除按钮 -->
                    <g class="etl-conn-remove" data-index="${index}" transform="translate(${midX}, ${midY})" style="pointer-events: all; cursor: pointer;">
                        <circle r="10" fill="#f43f5e" stroke="#fff" stroke-width="1.5" />
                        <text dy=".35em" text-anchor="middle" fill="#fff" style="font-size: 14px; font-family: Arial, sans-serif; font-weight: bold; pointer-events: none; user-select: none;">×</text>
                    </g>
                </g>
            `;
        }).join('');
    },

    /**
     * 渲染拖拽中的临时连线 - 水平方向
     */
    renderTempConnection(temp) {
        const { x1, y1, x2, y2 } = temp;
        const ctrlOffset = Math.max(40, Math.abs(x2 - x1) * 0.3);
        const d = `M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`;
        return `<path class="etl-temp-line" d="${d}" stroke="var(--color-primary)" stroke-width="2" stroke-dasharray="5,5" fill="none" />`;
    },

    // 辅助部件：渲染字段选择标签组
    _renderFieldChips(availableFields, selectedFields = [], targetId, single = false) {
        if (!availableFields || availableFields.length === 0) {
            return '<div class="text-secondary text-xs p-10 bg-hover border-radius-5">💡 请先正确配置上游数据源表</div>';
        }
        const selectedArr = typeof selectedFields === 'string' ? selectedFields.split(',').map(v => v.trim()).filter(v => v) : (selectedFields || []);
        return `
            <div class="field-chips-container mt-10" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 150px; overflow-y: auto; padding: 5px;">
                ${availableFields.map(f => {
            const fName = typeof f === 'object' ? f.name : f;
            const active = selectedArr.includes(fName);
            return `<span class="visual-field-chip ${active ? 'active' : ''}" 
                                  data-col="${fName}" 
                                  data-target="${targetId}"
                                  data-single="${single}"
                                  style="padding: 4px 10px; border-radius: 15px; border: 1px solid var(--color-border); cursor: pointer; font-size: 11px; transition: all 0.2s; ${active ? 'background: var(--color-primary); color: white; border-color: var(--color-primary);' : 'background: var(--color-bg-secondary);'}">
                                ${fName}
                            </span>`;
        }).join('')}
            </div>
            <input type="hidden" id="${targetId}" value="${selectedArr.join(', ')}">
        `;
    },

    async renderETLNodeConfig(node) {
        if (!node) return '';

        // 【企业级修复】标准化字段对象，杜绝 undefined
        let rawFields = await (this._getAvailableColumnsForNode ? this._getAvailableColumnsForNode(node.id) : Promise.resolve([]));
        if (!rawFields) rawFields = [];
        const availableFields = rawFields.map(f => {
            if (typeof f === 'string') return { name: f, type: 'string' };
            if (typeof f === 'object' && f.name) return f;
            return { name: String(f), type: 'unknown' };
        });

        // 通用渲染辅助函数：生成带 Label 的表单组
        const renderGroup = (label, content, helpText = '') => `
            <div class="form-group mb-15">
                <label class="block text-sm font-bold mb-5 text-secondary">${label}</label>
                ${content}
                ${helpText ? `<div class="text-xs text-tertiary mt-5">${helpText}</div>` : ''}
            </div>
        `;

        // 检查上游连接状态
        const hasUpstreamConnection = (this.state.modelConnections || []).some(c => c.targetId === node.id);

        // 渲染无可用字段时的提示
        const renderNoFieldsHint = (nodeTypeName = '此节点') => renderGroup(`${nodeTypeName}配置`, `
            <div class="text-secondary text-xs p-15 bg-hover border-radius-5 text-center">
                <div class="text-2xl mb-10">⚠️</div>
                <div class="font-bold mb-5">${hasUpstreamConnection ? '上游数据源未配置' : '未连接上游节点'}</div>
                <div>${hasUpstreamConnection ? '请先在上游的输入节点中选择数据集' : '请先将此节点连接到一个已配置的输入节点'}</div>
            </div>
        `);

        let fields = '';

        // 确保 datasets 可用
        const datasets = this.state.datasets || [];

        switch (node.type) {
            /* ========== 数据输入输出 ========== */
            case 'source':
                const sourceHasTable = node.data?.table && availableFields.length > 0;
                fields = renderGroup('数据来源表', `
                    <select class="form-control w-100" id="cfg-source-table">
                        <option value="">请选择数据集...</option>
                        ${datasets.length === 0 ? '<option value="" disabled>暂无可用数据集，请先导入数据</option>' : ''}
                        ${datasets.map(d => `<option value="${d.name}" ${node.data?.table === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
                    </select>
                `, '选择系统内已注册的数据集作为起始输入') + (sourceHasTable ? renderGroup('数据源字段预览', `
                    <div class="field-chips-container" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 5px; background: var(--color-bg-secondary); border-radius: 6px;">
                        ${availableFields.slice(0, 30).map(f => `<span style="padding: 3px 8px; border-radius: 12px; border: 1px solid var(--color-border); font-size: 10px; background: var(--color-bg-primary);">${f.name}</span>`).join('')}
                        ${availableFields.length > 30 ? `<span style="padding: 3px 8px; font-size: 10px; color: var(--color-text-secondary);">...及其他 ${availableFields.length - 30} 个字段</span>` : ''}
                    </div>
                `, `共 ${availableFields.length} 个字段`) : '');
                break;

            case 'sink':
                fields = renderGroup('输出目标表', `
                    <input type="text" class="form-control w-100" id="cfg-sink-target" 
                           placeholder="例如: result_table_v1" value="${node.data?.target || ''}">
                `) + renderGroup('写入模式', `
                    <select class="form-control w-100" id="cfg-sink-mode">
                        <option value="append" ${node.data?.mode === 'append' ? 'selected' : ''}>追加数据 (Append)</option>
                        <option value="overwrite" ${node.data?.mode === 'overwrite' ? 'selected' : ''}>覆盖数据 (Overwrite)</option>
                    </select>
                `, '决定当目标表已存在时的处理策略') + `
                    <div class="mt-20 border-top pt-15">
                        <button class="btn btn-outline-success btn-block" id="btn-download-etl-result">📥 导出结果</button>
                    </div>
                `;
                break;

            /* ========== 数据筛选与过滤 ========== */
            case 'filter':
                // 检查是否有可用字段，如果没有则显示提示
                if (availableFields.length === 0) {
                    fields = renderNoFieldsHint('过滤条件');
                    break;
                }
                let conditions = node.data?.conditions || [];
                // 兼容旧数据
                if (conditions.length === 0 && node.data?.field) {
                    conditions = [{
                        field: node.data.field,
                        operator: node.data.operator,
                        value: node.data.value,
                        join: 'AND'
                    }];
                }
                if (conditions.length === 0) conditions = [{ field: '', operator: '=', value: '', join: 'AND' }];

                const renderOpOptions = (selected) => `
                    <optgroup label="数值/比较">
                        <option value="=" ${selected === '=' ? 'selected' : ''}>等于 (=)</option>
                        <option value="!=" ${selected === '!=' ? 'selected' : ''}>不等于 (!=)</option>
                        <option value=">" ${selected === '>' ? 'selected' : ''}>大于 (&gt;)</option>
                        <option value=">=" ${selected === '>=' ? 'selected' : ''}>大于等于 (&ge;)</option>
                        <option value="<" ${selected === '<' ? 'selected' : ''}>小于 (&lt;)</option>
                        <option value="<=" ${selected === '<=' ? 'selected' : ''}>小于等于 (&le;)</option>
                        <option value="IN" ${selected === 'IN' ? 'selected' : ''}>IN (列表)</option>
                    </optgroup>
                    <optgroup label="文本匹配">
                        <option value="contains" ${selected === 'contains' ? 'selected' : ''}>包含 (Like)</option>
                        <option value="not_contains" ${selected === 'not_contains' ? 'selected' : ''}>不包含</option>
                        <option value="start_with" ${selected === 'start_with' ? 'selected' : ''}>开始于</option>
                        <option value="end_with" ${selected === 'end_with' ? 'selected' : ''}>结束于</option>
                    </optgroup>
                    <optgroup label="空值检查">
                        <option value="is_null" ${selected === 'is_null' ? 'selected' : ''}>为空 (NULL)</option>
                        <option value="not_null" ${selected === 'not_null' ? 'selected' : ''}>不为空</option>
                        <option value="is_empty" ${selected === 'is_empty' ? 'selected' : ''}>为空字符</option>
                        <option value="not_empty" ${selected === 'not_empty' ? 'selected' : ''}>不为空字符</option>
                    </optgroup>
                `;

                fields = renderGroup('过滤规则设置 (多条件)', `
                    <div id="cfg-filters-list">
                        ${conditions.map((cond, i) => `
                            <div class="etl-filter-row bg-secondary p-10 border-radius-sm mb-10 relative" style="border:1px solid var(--color-border)">
                                ${i > 0 ? `
                                    <div class="mb-5">
                                        <select class="form-control form-control-sm filter-join w-auto font-bold text-primary">
                                            <option value="AND" ${cond.join === 'AND' ? 'selected' : ''}>且 (AND)</option>
                                            <option value="OR" ${cond.join === 'OR' ? 'selected' : ''}>或 (OR)</option>
                                        </select>
                                    </div>
                                ` : ''}
                                <div class="flex gap-5 mb-5">
                                    <select class="form-control filter-field" style="flex: 2;">
                                        <option value="">选择字段</option>
                                        ${availableFields.map(f => `<option value="${f.name}" ${cond.field === f.name ? 'selected' : ''}>${f.name}</option>`).join('')}
                                    </select>
                                    ${i > 0 ? `<button class="btn btn-ghost btn-xs text-error btn-remove-filter-row" onclick="this.closest('.etl-filter-row').remove()">🗑️</button>` : ''}
                                </div>
                                <div class="mb-5">
                                    <select class="form-control w-100 filter-op" onchange="this.parentElement.nextElementSibling.style.display = ['is_null','not_null','is_empty','not_empty'].includes(this.value) ? 'none' : 'block'">
                                        ${renderOpOptions(cond.operator)}
                                    </select>
                                </div>
                                <input type="text" class="form-control w-100 filter-val" 
                                       placeholder="输入比较值" value="${cond.value || ''}" 
                                       style="display: ${['is_null', 'not_null', 'is_empty', 'not_empty'].includes(cond.operator) ? 'none' : 'block'};">
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-outline-primary btn-sm btn-block dashed-btn" id="btn-add-filter-row">➕ 添加条件</button>
                    
                    <!-- 隐藏模板 -->
                    <template id="tpl-filter-row">
                        <div class="etl-filter-row bg-secondary p-10 border-radius-sm mb-10 relative" style="border:1px solid var(--color-border)">
                            <div class="mb-5">
                                <select class="form-control form-control-sm filter-join w-auto font-bold text-primary">
                                    <option value="AND">且 (AND)</option>
                                    <option value="OR">或 (OR)</option>
                                </select>
                            </div>
                            <div class="flex gap-5 mb-5">
                                <select class="form-control filter-field" style="flex: 2;">
                                    <option value="">选择字段</option>
                                    ${availableFields.map(f => `<option value="${f.name}">${f.name}</option>`).join('')}
                                </select>
                                <button class="btn btn-ghost btn-xs text-error btn-remove-filter-row" onclick="this.closest('.etl-filter-row').remove()">🗑️</button>
                            </div>
                            <div class="mb-5">
                                <select class="form-control w-100 filter-op" onchange="this.parentElement.nextElementSibling.style.display = ['is_null','not_null','is_empty','not_empty'].includes(this.value) ? 'none' : 'block'">
                                    ${renderOpOptions('=')}
                                </select>
                            </div>
                            <input type="text" class="form-control w-100 filter-val" placeholder="输入比较值">
                        </div>
                    </template>
                `, '设置多个过滤条件，按顺序执行筛选');

                // 延迟绑定添加按钮事件 (Inline implementation via setTimeout to assume render completion)
                setTimeout(() => {
                    const btn = document.getElementById('btn-add-filter-row');
                    if (btn) {
                        btn.onclick = (e) => {
                            e.preventDefault();
                            const tpl = document.getElementById('tpl-filter-row');
                            const list = document.getElementById('cfg-filters-list');
                            if (tpl && list) {
                                list.insertAdjacentHTML('beforeend', tpl.innerHTML);
                            }
                        };
                    }
                }, 100);
                break;

            case 'distinct':
                fields = renderGroup('去重依据字段',
                    this._renderFieldChips(availableFields, node.data?.columns, 'cfg-distinct-cols'),
                    '依据选定字段进行去重，未选则默认全字段去重'
                );
                break;

            case 'sample':
                fields = renderGroup('采样比例 (%)', `
                    <div class="flex align-center gap-10">
                         <input type="range" class="flex-1" id="cfg-sample-range" min="1" max="100" value="${node.data?.rate || 20}" 
                                oninput="document.getElementById('cfg-sample-rate').value = this.value">
                         <input type="number" class="form-control" id="cfg-sample-rate" style="width: 60px;"
                                min="1" max="100" value="${node.data?.rate || 20}">
                    </div>
                `, '随机抽取数据的百分比');
                break;

            case 'limit':
                fields = renderGroup('限制输出行数', `
                    <input type="number" class="form-control w-100" id="cfg-limit-count" 
                           min="1" placeholder="例如: 1000" value="${node.data?.count || ''}">
                `, '仅保留前 N 条数据');
                break;

            /* ========== 字段处理 ========== */
            case 'select':
                fields = renderGroup('保留字段选择',
                    this._renderFieldChips(availableFields, node.data?.columns, 'cfg-select-cols'),
                    '未选中的字段将被丢弃'
                );
                break;

            case 'rename':
                fields = renderGroup('字段重命名', `
                     <div class="bg-secondary p-10 border-radius-sm">
                        <label class="text-xs mb-5 block">原字段:</label>
                        ${this._renderFieldChips(availableFields, node.data?.oldCol, 'cfg-rename-old', true)}
                        <label class="text-xs mt-10 mb-5 block">新名称:</label>
                        <input type="text" class="form-control w-100" id="cfg-rename-new" 
                               placeholder="输入新字段名" value="${node.data?.newCol || ''}">
                     </div>
                `);
                break;

            case 'split':
                fields = renderGroup('拆分源字段',
                    this._renderFieldChips(availableFields, node.data?.sourceCol, 'cfg-split-source', true)
                ) + renderGroup('拆分配置', `
                    <div class="flex gap-10 mb-10">
                        <input type="text" class="form-control flex-1" id="cfg-split-sep" placeholder="分隔符 (如: ,)" value="${node.data?.separator || ','}">
                        <input type="number" class="form-control" style="width: 80px;" id="cfg-split-limit" placeholder="列数" value="${node.data?.limit || 2}">
                    </div>
                `, '指定分隔符和最大拆分列数');
                break;

            /* ========== 数据转换 ========== */
            case 'calculate':
                fields = renderGroup('计算配置', `
                     <div class="config-card p-10 bg-secondary border-radius-sm">
                        <div class="mb-10">
                            <label class="text-xs text-tertiary">目标字段名</label>
                            <input type="text" class="form-control w-100 mt-5" id="cfg-calc-name" 
                                   placeholder="例如: total_price" value="${node.data?.newColumn || ''}">
                        </div>
                        <div class="mb-10">
                            <label class="text-xs text-tertiary">计算公式</label>
                            <div class="flex gap-5 mt-5 align-center">
                                ${this._renderFieldChips(availableFields, node.data?.fieldA, 'cfg-calc-field-a', true)}
                                <select class="form-control" id="cfg-calc-op" style="width: 60px;">
                                    <option value="+" ${node.data?.op === '+' ? 'selected' : ''}>+</option>
                                    <option value="-" ${node.data?.op === '-' ? 'selected' : ''}>-</option>
                                    <option value="*" ${node.data?.op === '*' ? 'selected' : ''}>*</option>
                                    <option value="/" ${node.data?.op === '/' ? 'selected' : ''}>/</option>
                                </select>
                                <input type="text" class="form-control flex-1" id="cfg-calc-value" placeholder="数值/字段" value="${node.data?.value || ''}">
                            </div>
                        </div>
                     </div>
                `);
                break;

            case 'group':
                fields = renderGroup('分组维度 (GroupBy)',
                    this._renderFieldChips(availableFields, node.data?.groupBy, 'cfg-group-by')
                ) + renderGroup('聚合配置', `
                    <div class="flex gap-5 align-center mb-5">
                        <select class="form-control" id="cfg-group-func" style="width: 100px;">
                            <option value="COUNT" ${node.data?.aggFunc === 'COUNT' ? 'selected' : ''}>计数</option>
                            <option value="SUM" ${node.data?.aggFunc === 'SUM' ? 'selected' : ''}>求和</option>
                            <option value="AVG" ${node.data?.aggFunc === 'AVG' ? 'selected' : ''}>平均</option>
                            <option value="MAX" ${node.data?.aggFunc === 'MAX' ? 'selected' : ''}>最大</option>
                            <option value="MIN" ${node.data?.aggFunc === 'MIN' ? 'selected' : ''}>最小</option>
                        </select>
                        <span class="text-xs">ON</span>
                    </div>
                    ${this._renderFieldChips(availableFields, node.data?.aggCol, 'cfg-group-agg-col', true)}
                `);
                break;

            case 'sort':
                fields = renderGroup('排序依据',
                    this._renderFieldChips(availableFields, node.data?.orderBy, 'cfg-sort-col', true)
                ) + renderGroup('排序方向', `
                     <div class="flex gap-10">
                        <label class="flex align-center gap-5 cursor-pointer">
                            <input type="radio" name="sort-dir" value="ASC" ${node.data?.direction !== 'DESC' ? 'checked' : ''}> 
                            <span>升序 (A-Z)</span>
                        </label>
                        <label class="flex align-center gap-5 cursor-pointer">
                            <input type="radio" name="sort-dir" value="DESC" ${node.data?.direction === 'DESC' ? 'checked' : ''}> 
                            <span>降序 (Z-A)</span>
                        </label>
                     </div>
                     <input type="hidden" id="cfg-sort-dir" value="${node.data?.direction || 'ASC'}">
                `);
                break;

            case 'join':
                const joinUpConns = this.state.modelConnections.filter(c => c.targetId === node.id);
                let leftFields = [], rightFields = [];
                let leftSourceName = '左侧源', rightSourceName = '右侧源';

                // 辅助函数：获取分支的真实数据源名称
                const getBranchSourceName = (startNodeId) => {
                    let currentId = startNodeId;
                    let visited = new Set();
                    while (currentId && !visited.has(currentId)) {
                        visited.add(currentId);
                        const n = this.state.modelNodes.find(item => item.id === currentId);
                        if (n?.type === 'source' && n.data?.table) {
                            return n.data.table;
                        }
                        const upConn = this.state.modelConnections.find(c => c.targetId === currentId);
                        currentId = upConn ? upConn.sourceId : null;
                    }
                    return null;
                };

                // 标准化字段格式
                const normalizeFields = (fields) => {
                    if (!fields) return [];
                    return fields.map(f => {
                        if (typeof f === 'string') return { name: f };
                        if (typeof f === 'object' && f.name) return f;
                        return { name: String(f) };
                    });
                };

                if (joinUpConns.length >= 2) {
                    const leftRealSource = getBranchSourceName(joinUpConns[0].sourceId);
                    const rightRealSource = getBranchSourceName(joinUpConns[1].sourceId);
                    leftSourceName = leftRealSource || '数据源A';
                    rightSourceName = rightRealSource || '数据源B';

                    try {
                        const rawLeftFields = await this._findBranchSourceFields(joinUpConns[0].sourceId);
                        const rawRightFields = await this._findBranchSourceFields(joinUpConns[1].sourceId);
                        leftFields = normalizeFields(rawLeftFields);
                        rightFields = normalizeFields(rawRightFields);
                    } catch (e) {
                        console.error('获取 JOIN 字段失败:', e);
                    }
                }

                // 渲染关联条件配置
                const renderJoinCondition = () => {
                    if (joinUpConns.length < 2) {
                        return `
                            <div class="config-card p-15 bg-secondary border-radius-sm text-center">
                                <div class="text-2xl mb-10">🔗</div>
                                <div class="text-error font-bold mb-5">未完成连接</div>
                                <div class="text-xs text-secondary">请将两个数据源节点连接到此关联节点</div>
                            </div>
                        `;
                    }

                    const leftOptions = leftFields.map(f =>
                        `<option value="${f.name}" ${node.data?.leftOn === f.name ? 'selected' : ''}>${f.name}</option>`
                    ).join('');
                    const rightOptions = rightFields.map(f =>
                        `<option value="${f.name}" ${node.data?.rightOn === f.name ? 'selected' : ''}>${f.name}</option>`
                    ).join('');

                    return `
                        <div class="config-card p-15 bg-secondary border-radius-sm">
                            <div class="text-xs text-tertiary mb-10">设置关联条件 (类似 SQL: ON 左表.字段 = 右表.字段)</div>
                            <div class="flex align-center gap-10 mb-10">
                                <div style="flex: 1;">
                                    <div class="text-xs text-secondary mb-5">⬅️ ${leftSourceName}</div>
                                    <select class="form-control w-100" id="cfg-join-left">
                                        <option value="">选择左侧关联字段...</option>
                                        ${leftOptions}
                                    </select>
                                </div>
                                <div class="text-xl font-bold text-primary" style="padding-top: 20px;">=</div>
                                <div style="flex: 1;">
                                    <div class="text-xs text-secondary mb-5">➡️ ${rightSourceName}</div>
                                    <select class="form-control w-100" id="cfg-join-right">
                                        <option value="">选择右侧关联字段...</option>
                                        ${rightOptions}
                                    </select>
                                </div>
                            </div>
                            ${node.data?.leftOn && node.data?.rightOn ? `
                                <div class="text-xs text-success mt-10 p-5 bg-hover border-radius-sm font-mono">
                                    ✅ ${leftSourceName}.${node.data.leftOn} = ${rightSourceName}.${node.data.rightOn}
                                </div>
                            ` : ''}
                        </div>
                    `;
                };

                // 渲染左右表输出字段选择
                const renderOutputFieldsSection = () => {
                    if (joinUpConns.length < 2) return '';

                    return `
                        <div class="join-output-fields mt-15">
                            <div class="text-sm font-bold text-secondary mb-10">📤 选择输出字段</div>
                            <div class="config-card p-10 bg-secondary border-radius-sm mb-10">
                                <div class="text-xs text-tertiary mb-5">⬅️ 左表字段 (${leftSourceName})</div>
                                ${this._renderFieldChips(leftFields, node.data?.leftOutputCols, 'cfg-join-left-output')}
                            </div>
                            <div class="config-card p-10 bg-secondary border-radius-sm">
                                <div class="text-xs text-tertiary mb-5">➡️ 右表字段 (${rightSourceName})</div>
                                ${this._renderFieldChips(rightFields, node.data?.rightOutputCols, 'cfg-join-right-output')}
                            </div>
                            <div class="text-xs text-tertiary mt-5">💡 不选择任何字段则输出该表全部字段</div>
                        </div>
                    `;
                };

                fields = renderGroup('关联类型', `
                    <select class="form-control w-100" id="cfg-join-type">
                        <option value="inner" ${node.data?.joinType === 'inner' ? 'selected' : ''}>内连接 (Inner Join) - 仅匹配行</option>
                        <option value="left" ${node.data?.joinType === 'left' ? 'selected' : ''}>左连接 (Left Join) - 保留左表所有行</option>
                        <option value="right" ${node.data?.joinType === 'right' ? 'selected' : ''}>右连接 (Right Join) - 保留右表所有行</option>
                        <option value="full" ${node.data?.joinType === 'full' ? 'selected' : ''}>全连接 (Full Outer) - 保留所有行</option>
                    </select>
                `) + renderGroup('关联条件', renderJoinCondition()) + renderOutputFieldsSection();
                break;

            case 'fillna':
                fields = renderGroup('填充目标字段',
                    this._renderFieldChips(availableFields, node.data?.targetCol, 'cfg-fillna-col', true)
                ) + renderGroup('填充值', `
                    <input type="text" class="form-control w-100" id="cfg-fillna-val" placeholder="例如: 0 或 Unknown" value="${node.data?.fillValue || ''}">
                `);
                break;

            case 'clean':
                fields = renderGroup('清洗模式', `
                    <select class="form-control w-100" id="cfg-clean-mode">
                        <option value="drop_na" ${node.data?.mode === 'drop_na' ? 'selected' : ''}>删除包含空值的行</option>
                        <option value="drop_duplicates" ${node.data?.mode === 'drop_duplicates' ? 'selected' : ''}>删除重复完全行</option>
                    </select>
                `);
                break;

            case 'sql':
                fields = renderGroup('SQL 查询脚本', `
                    <textarea class="form-control w-100 font-mono text-xs" id="cfg-sql-query" rows="6" 
                              placeholder="SELECT * FROM input WHERE ...">${node.data?.query || ''}</textarea>
                `, '可使用 "input" 代表上游输入表') + renderGroup('可用字段参考',
                    this._renderFieldChips(availableFields, null, 'cfg-sql-ref'),
                    '点击复制字段名'
                );
                break;

            case 'union':
                const unionUpConns = this.state.modelConnections.filter(c => c.targetId === node.id);

                let unionInfo = '';
                if (unionUpConns.length >= 2) {
                    unionInfo = renderGroup('合并状态', `
                        <div class="config-card p-10 bg-secondary border-radius-sm text-xs">
                             已检测到 <b>${unionUpConns.length}</b> 路分支输入
                        </div>
                    `);
                } else {
                    unionInfo = `
                        <div class="config-card p-10 bg-secondary border-radius-sm text-xs text-error">
                             ⚠️ 请至少连接两个及以上节点到合并算子
                        </div>
                    `;
                }

                fields = unionInfo + renderGroup('合并模式', `
                    <select class="form-control w-100" id="cfg-union-mode">
                        <option value="ALL" ${node.data?.unionMode === 'ALL' ? 'selected' : ''}>保留重复 (UNION ALL)</option>
                        <option value="DISTINCT" ${node.data?.unionMode === 'DISTINCT' ? 'selected' : ''}>去重合并 (UNION)</option>
                    </select>
                `);
                break;

            case 'typecast':
                fields = renderGroup('目标字段',
                    this._renderFieldChips(availableFields, node.data?.column, 'cfg-cast-col', true)
                ) + renderGroup('目标类型', `
                    <select class="form-control w-100" id="cfg-cast-type">
                        <option value="INTEGER" ${node.data?.castType === 'INTEGER' ? 'selected' : ''}>整数 INTEGER</option>
                        <option value="DOUBLE" ${node.data?.castType === 'DOUBLE' ? 'selected' : ''}>浮点数 DOUBLE</option>
                        <option value="VARCHAR" ${node.data?.castType === 'VARCHAR' ? 'selected' : ''}>字符串 VARCHAR</option>
                        <option value="DATE" ${node.data?.castType === 'DATE' ? 'selected' : ''}>日期 DATE</option>
                        <option value="TIMESTAMP" ${node.data?.castType === 'TIMESTAMP' ? 'selected' : ''}>时间戳 TIMESTAMP</option>
                        <option value="BOOLEAN" ${node.data?.castType === 'BOOLEAN' ? 'selected' : ''}>布尔 BOOLEAN</option>
                    </select>
                `);
                break;

            case 'pivot':
                fields = renderGroup('行索引 (Index)',
                    this._renderFieldChips(availableFields, node.data?.index, 'cfg-pivot-index', true)
                ) + renderGroup('列字段 (Column)',
                    this._renderFieldChips(availableFields, node.data?.columns, 'cfg-pivot-column', true)
                ) + renderGroup('值字段 (Value)',
                    this._renderFieldChips(availableFields, node.data?.values, 'cfg-pivot-values', true)
                ) + renderGroup('聚合函数', `
                    <select class="form-control w-100" id="cfg-pivot-func">
                         <option value="SUM" ${node.data?.aggFunc === 'SUM' ? 'selected' : ''}>求和 (SUM)</option>
                         <option value="AVG" ${node.data?.aggFunc === 'AVG' ? 'selected' : ''}>平均 (AVG)</option>
                         <option value="COUNT" ${node.data?.aggFunc === 'COUNT' ? 'selected' : ''}>计数 (COUNT)</option>
                         <option value="MAX" ${node.data?.aggFunc === 'MAX' ? 'selected' : ''}>最大 (MAX)</option>
                         <option value="MIN" ${node.data?.aggFunc === 'MIN' ? 'selected' : ''}>最小 (MIN)</option>
                    </select>
                `);
                break;

            /* ========== 新增算子配置 ========== */
            case 'text_ops':
                fields = renderGroup('目标字段',
                    this._renderFieldChips(availableFields, node.data?.targetCol, 'cfg-text-col', true)
                ) + renderGroup('文本操作', `
                    <select class="form-control w-100" id="cfg-text-func">
                        <option value="UPPER" ${node.data?.func === 'UPPER' ? 'selected' : ''}>转大写 (UPPER)</option>
                        <option value="LOWER" ${node.data?.func === 'LOWER' ? 'selected' : ''}>转小写 (LOWER)</option>
                        <option value="TRIM" ${node.data?.func === 'TRIM' ? 'selected' : ''}>去首尾空格 (TRIM)</option>
                        <option value="LENGTH" ${node.data?.func === 'LENGTH' ? 'selected' : ''}>计算长度 (LENGTH)</option>
                        <option value="REVERSE" ${node.data?.func === 'REVERSE' ? 'selected' : ''}>反转文本 (REVERSE)</option>
                    </select>
                `) + renderGroup('新字段名', `
                    <input type="text" class="form-control w-100" id="cfg-text-new-name" 
                           placeholder="留空则覆盖原字段" value="${node.data?.newCol || ''}">
                `);
                break;

            case 'math_ops':
                fields = renderGroup('应用数学公式', `
                     <div class="config-card p-10 bg-secondary border-radius-sm">
                        <div class="mb-10">目标字段 = </div>
                        <div class="flex gap-5 align-center mb-10">
                            ${this._renderFieldChips(availableFields, node.data?.fieldA, 'cfg-math-field-a', true)}
                            <select class="form-control" id="cfg-math-op" style="width: 70px;">
                                <option value="+" ${node.data?.op === '+' ? 'selected' : ''}>加 (+)</option>
                                <option value="-" ${node.data?.op === '-' ? 'selected' : ''}>减 (-)</option>
                                <option value="*" ${node.data?.op === '*' ? 'selected' : ''}>乘 (*)</option>
                                <option value="/" ${node.data?.op === '/' ? 'selected' : ''}>除 (/)</option>
                                <option value="%" ${node.data?.op === '%' ? 'selected' : ''}>取模 (%)</option>
                            </select>
                            <input type="text" class="form-control flex-1" id="cfg-math-val" 
                                   placeholder="数值" value="${node.data?.value || ''}">
                        </div>
                        <div class="text-xs text-secondary mt-5">* 仅支持简单二元运算</div>
                     </div>
                `) + renderGroup('结果存入新字段', `
                    <input type="text" class="form-control w-100" id="cfg-math-new-name" 
                           placeholder="例如: calc_result" value="${node.data?.newCol || ''}">
                `);
                break;

            case 'window':
                fields = renderGroup('窗口函数类型', `
                    <select class="form-control w-100" id="cfg-window-func">
                         <option value="ROW_NUMBER" ${node.data?.func === 'ROW_NUMBER' ? 'selected' : ''}>行号 (Row Number)</option>
                         <option value="RANK" ${node.data?.func === 'RANK' ? 'selected' : ''}>排名 (Rank)</option>
                         <option value="DENSE_RANK" ${node.data?.func === 'DENSE_RANK' ? 'selected' : ''}>密集排名 (Dense Rank)</option>
                         <option value="LEAD" ${node.data?.func === 'LEAD' ? 'selected' : ''}>下 N 行 (Lead)</option>
                         <option value="LAG" ${node.data?.func === 'LAG' ? 'selected' : ''}>上 N 行 (Lag)</option>
                    </select>
                `) + renderGroup('分组字段 (Partition By)',
                    this._renderFieldChips(availableFields, node.data?.partitionBy, 'cfg-window-partition')
                ) + renderGroup('排序字段 (Order By)',
                    this._renderFieldChips(availableFields, node.data?.orderBy, 'cfg-window-order')
                ) + renderGroup('目标新字段名', `
                    <input type="text" class="form-control w-100" id="cfg-window-new-name" 
                           placeholder="例如: rank_idx" value="${node.data?.newCol || ''}">
                `);
                break;

            default:
                fields = `<div class="text-secondary text-center p-20">高级配置功能正在开发中...</div>`;
        }

        // 对于非 sink/join 节点，添加输出字段选择器
        // JOIN 节点已经有专门的左右表输出字段选择器，不需要通用选择器
        if (node.type !== 'sink' && node.type !== 'join') {
            fields += `
                <div class="output-columns-section mt-15 pt-15 border-top">
                    ${renderGroup('输出字段 (可选)',
                this._renderFieldChips(availableFields, node.data?.outputColumns, 'cfg-output-cols'),
                '选择需要输出的字段，留空则输出全部'
            )}
                </div>
            `;
        }

        // 绑定 Sort 的 Radio 事件
        setTimeout(() => {
            const radios = document.querySelectorAll('input[name="sort-dir"]');
            radios.forEach(r => r.addEventListener('change', (e) => {
                const el = document.getElementById('cfg-sort-dir');
                if (el) el.value = e.target.value;
                // 触发自动保存
                this._saveNodeConfig(true);
            }));
        }, 0);

        return `
            <div class="node-config-wrapper" style="display: flex; flex-direction: column; height: 100%;">
                <div class="flex-between align-center mb-10" style="flex-shrink: 0;">
                    <input type="text" class="form-control font-bold" id="cfg-node-label" 
                           value="${node.data?.label || node.label}" 
                           placeholder="节点名称" style="border: none; background: transparent; padding-left: 0; font-size: 14px;">
                    <span class="badge badge-primary text-xs">${node.type.toUpperCase()}</span>
                </div>
                
                <div class="node-config-scroll" style="flex: 1; overflow-y: auto; padding-right: 5px; min-height: 0;">
                    ${fields}
                </div>

                <div class="node-config-actions" style="flex-shrink: 0; padding-top: 12px; border-top: 1px solid var(--color-border); margin-top: 10px;">
                    <button class="btn btn-primary w-100 mb-10" id="btn-save-node-cfg">✅ 应用并保存</button>
                    <button class="btn btn-outline-danger w-100" id="btn-delete-node">🗑️ 删除此节点</button>
                </div>
            </div>
        `;
    },

    /**
     * 渲染预览弹窗
     */
    /**
     * 渲染预览弹窗（真实数据版）
     */
    renderETLPreviewModal() {
        const { previewNodeId, modelNodes, previewData, previewLoading, previewError } = this.state;
        const node = modelNodes.find(n => n.id === previewNodeId);
        if (!node) return '';

        let content = '';

        if (previewLoading) {
            content = `
                <div class="flex-center flex-col p-30 text-secondary">
                    <div class="node-spinner mb-10" style="width: 30px; height: 30px; border-width: 3px;"></div>
                    <div>正在回溯并计算数据快照...</div>
                </div>
            `;
        } else if (previewError) {
            content = `
                <div class="flex-center flex-col p-30 text-error">
                    <div class="text-3xl mb-10">⚠️</div>
                    <div>${previewError}</div>
                    <div class="text-xs text-secondary mt-5">请检查上游节点配置或源数据是否可用</div>
                </div>
            `;
        } else if (!previewData || previewData.length === 0) {
            content = `
                <div class="flex-center flex-col p-30 text-secondary">
                    <div class="text-3xl mb-10">📭</div>
                    <div>暂无结果数据</div>
                    <div class="text-xs mt-5">该节点可能过滤了所有行，或源数据为空</div>
                </div>
            `;
        } else {
            // 动态生成表头
            const cols = Object.keys(previewData[0]);
            content = `
                <div class="text-xs text-secondary mb-10 flex-between flex-shrink-0">
                    <span>⚡ 实时计算结果 (Top ${previewData.length})</span>
                    <span>字段数: ${cols.length}</span>
                </div>
                <div class="etl-preview-body bg-secondary rounded p-10">
                    <table class="premium-table" style="width: 100%;">
                        <thead>
                            <tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${previewData.map(row => `
                                <tr>${cols.map(c => `<td>${row[c] !== undefined && row[c] !== null ? row[c] : '-'}</td>`).join('')}</tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        return `
            <div class="modal-overlay active">
                <style>
                    /* 局部样式覆盖，参考数据导入预览 */
                    .etl-preview-modal-content {
                        width: 90% !important;
                        max-width: none !important;
                        height: 85vh !important;
                        display: flex;
                        flex-direction: column;
                    }
                    .etl-preview-body {
                        flex: 1;
                        overflow: auto;
                        min-height: 0; /* 关键：用于 flex item 内部滚动 */
                        border-top: 1px solid var(--color-border);
                        margin-top: 10px;
                    }
                </style>
                <div class="modal-content modal-large bg-primary etl-preview-modal-content">
                    <div class="flex-between mb-15 flex-shrink-0">
                        <div class="flex align-center gap-10">
                            <h3>🔍 数据实时预览: ${node.data?.label || node.type}</h3>
                            <span class="badge badge-secondary text-xs">PREVIEW</span>
                        </div>
                        <button class="btn-icon btn-ghost" id="btn-close-preview">×</button>
                    </div>
                    ${content}
                    <div class="flex justify-end pt-10 border-top mt-auto flex-shrink-0">
                        <button class="btn btn-primary" id="btn-close-preview">关闭</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 执行单个节点 - 调用后端真实执行
     */
    async _executeNode(nodeId) {
        const { currentModel, modelNodes, modelConnections } = this.state;

        if (!currentModel) {
            Toast.error('请先保存模型');
            return;
        }

        const node = modelNodes.find(n => n.id === nodeId);
        if (!node) {
            Toast.error('节点不存在');
            return;
        }

        // 更新节点状态为运行中
        this._updateNodeStatus(nodeId, 'running');
        this._addLog('info', `正在执行节点: ${node.data?.label || node.type}...`);

        try {
            const res = await AnalysisApi.executeETLNode({
                model_id: currentModel.id,
                node_id: nodeId,
                graph_config: {
                    nodes: modelNodes,
                    connections: modelConnections
                }
            });

            if (res.code === 200 && res.data?.success) {
                // 执行成功，更新节点状态和行数
                this._updateNodeStatus(nodeId, 'success');
                this._updateNodeData(nodeId, { _rowCount: res.data.row_count });
                this._addLog('success', `节点执行成功: ${node.data?.label || node.type} (${res.data.row_count} 行)`);
                Toast.success(`执行成功: ${res.data.row_count} 行`);
            } else {
                throw new Error(res.message || res.data?.error || '执行失败');
            }
        } catch (e) {
            console.error('节点执行失败:', e);
            this._updateNodeStatus(nodeId, 'error');
            this._addLog('error', `节点执行失败: ${e.message}`);
            Toast.error(`执行失败: ${e.message}`);
        }
    },

    /**
     * 预览已执行节点的数据
     */
    async _previewNode(nodeId) {
        const { currentModel, modelNodes } = this.state;
        const node = modelNodes.find(n => n.id === nodeId);

        // 显示加载状态
        this.setState({
            previewNodeId: nodeId,
            previewData: null,
            previewLoading: true,
            previewError: null
        });

        try {
            const res = await AnalysisApi.previewETLNode({
                model_id: currentModel.id,
                node_id: nodeId
            });

            if (res.code === 200) {
                this.setState({
                    previewData: res.data.preview || [],
                    previewLoading: false
                });
            } else {
                throw new Error(res.message || '获取预览失败');
            }
        } catch (e) {
            console.error('预览失败:', e);
            this.setState({
                previewData: null,
                previewLoading: false,
                previewError: e.message || '获取预览失败'
            });
        }
    },

    /**
     * 更新节点状态
     */
    _updateNodeStatus(nodeId, status) {
        const updated = this.state.modelNodes.map(n => {
            if (n.id === nodeId) {
                return { ...n, status };
            }
            return n;
        });
        this.setState({ modelNodes: updated });
    },

    /**
     * 更新节点数据
     */
    _updateNodeData(nodeId, dataUpdates) {
        const updated = this.state.modelNodes.map(n => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, ...dataUpdates } };
            }
            return n;
        });
        this.setState({ modelNodes: updated });
    },

    /**
     * 添加日志
     */
    _addLog(type, message) {
        const time = new Date().toLocaleTimeString();
        const logs = [...(this.state.etlLogs || []), { type, message, time }];
        // 最多保留 100 条日志
        if (logs.length > 100) logs.shift();
        this.setState({ etlLogs: logs });
    },

    /**
     * 初始化ETL画布
     */
    initETLCanvas() {
        const canvas = document.getElementById('etlCanvas');
        if (!canvas || canvas.dataset.init) return;
        canvas.dataset.init = 'true';

        // 拖拽悬停
        canvas.addEventListener('dragover', e => e.preventDefault());

        // 放置算子
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            if (this._draggedOp) {
                const rect = canvas.getBoundingClientRect();
                // 考虑画布偏移
                const offsetX = this.state.canvasOffsetX || 0;
                const offsetY = this.state.canvasOffsetY || 0;
                const x = e.clientX - rect.left - 70 - offsetX;
                const y = e.clientY - rect.top - 25 - offsetY;
                this.addETLNode(this._draggedOp.type, this._draggedOp.label, x, y);
                this._draggedOp = null;
            }
        });

        // ========== 画布平移功能 ==========
        let isPanning = false;
        let startX = 0, startY = 0;
        let startOffsetX = 0, startOffsetY = 0;

        canvas.addEventListener('mousedown', (e) => {
            // 只在画布空白区域（直接点击 canvas 或 workspace-container）才触发平移
            if (e.target === canvas || e.target.classList.contains('etl-workspace-container') ||
                e.target.tagName === 'svg' || e.target.classList.contains('etl-connections')) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                startOffsetX = this.state.canvasOffsetX || 0;
                startOffsetY = this.state.canvasOffsetY || 0;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const container = document.getElementById('etlWorkspaceContainer');
            if (container) {
                const newX = startOffsetX + dx;
                const newY = startOffsetY + dy;
                container.style.transform = `translate(${newX}px, ${newY}px)`;
                // 临时存储，不触发 setState 避免重绘
                this._tempCanvasOffset = { x: newX, y: newY };
            }
        });

        document.addEventListener('mouseup', () => {
            if (isPanning && this._tempCanvasOffset) {
                // 保存偏移状态
                this.state.canvasOffsetX = this._tempCanvasOffset.x;
                this.state.canvasOffsetY = this._tempCanvasOffset.y;
                this._tempCanvasOffset = null;
            }
            isPanning = false;
            if (canvas) canvas.style.cursor = 'grab';
        });

        // 重置画布按钮
        const resetBtn = document.getElementById('btn-reset-canvas');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const container = document.getElementById('etlWorkspaceContainer');
                if (container) {
                    container.style.transform = 'translate(0px, 0px)';
                    this.state.canvasOffsetX = 0;
                    this.state.canvasOffsetY = 0;
                }
            });
        }
    },

    /**
     * 添加ETL节点
     */
    addETLNode(type, label, x, y) {
        const id = 'node_' + Date.now();
        const newNode = { id, type, x, y, data: { label }, status: 'idle' };

        // 自动连线：现在改为全开放连接
        let conns = [...(this.state.modelConnections || [])];
        if (this.state.selectedNodeId) {
            const prev = (this.state.modelNodes || []).find(n => n.id === this.state.selectedNodeId);
            if (prev && prev.id !== id) {
                conns.push({ sourceId: prev.id, targetId: id });
            }
        }

        this.setState({
            modelNodes: [...(this.state.modelNodes || []), newNode],
            modelConnections: conns,
            selectedNodeId: id
        });

        // 添加后自动加载配置面板
        this._loadNodeConfig(id);
    },

    /**
     * 删除ETL节点
     */
    deleteETLNode(id) {
        this.setState({
            modelNodes: (this.state.modelNodes || []).filter(n => n.id !== id),
            modelConnections: (this.state.modelConnections || []).filter(c => c.sourceId !== id && c.targetId !== id),
            selectedNodeId: null
        });
    },

    /**
     * 更新ETL节点数据
     */
    updateETLNodeData(id, updates) {
        const nodes = (this.state.modelNodes || []).map(n => {
            if (n.id === id) {
                return { ...n, data: { ...n.data, ...updates } };
            }
            return n;
        });
        this.setState({ modelNodes: nodes });
    },

    /**
     * 运行ETL作业
     */
    async runETLJob() {
        const nodes = this.state.modelNodes || [];
        const connections = this.state.modelConnections || [];
        const currentModel = this.state.currentModel;

        if (nodes.length === 0) {
            Toast.error('请先添加节点');
            return;
        }

        if (!currentModel) {
            Toast.error('请先保存模型');
            return;
        }

        this.setState({ isConsoleOpen: true, etlLogs: [], isExecuting: true });

        // 重置所有节点状态
        const resetNodes = nodes.map(n => ({ ...n, status: 'idle' }));
        this.setState({ modelNodes: resetNodes });

        this.addETLLog('info', '🚀 启动全部运行...');

        // 关键逻辑：在“全部运行”前先清除后端缓存，确保获取最新结果
        try {
            await AnalysisApi.clearETLCache(currentModel.id);
            this.addETLLog('info', '已清理执行缓存，准备开始新一轮计算');
        } catch (e) {
            console.warn('清理缓存失败:', e);
        }

        // 简单拓扑排序：找到所有 source 节点 -> 运行 -> 它们的下游 -> 运行
        // 这里采用层次运行策略，确保逻辑正确
        const sortedNodes = this._topologicalSort(nodes, connections);
        this.addETLLog('info', `任务分析完成，执行序列长度: ${sortedNodes.length}`);

        this.executeAllNodesSequentially(0, sortedNodes, connections, currentModel);
    },

    // 基础拓扑排序实现
    _topologicalSort(nodes, connections) {
        const sorted = [];
        const visited = new Set();
        const nodesMap = {};
        nodes.forEach(n => nodesMap[n.id] = n);

        const visit = (nodeId) => {
            if (visited.has(nodeId)) return;
            // 找到所有上游
            const upstreams = connections.filter(c => c.targetId === nodeId).map(c => c.sourceId);
            upstreams.forEach(upId => visit(upId));

            visited.add(nodeId);
            if (nodesMap[nodeId]) {
                sorted.push(nodesMap[nodeId]);
            }
        };

        nodes.forEach(n => visit(n.id));
        return sorted;
    },

    /**
     * 依次执行所有节点（调用真实后端API）
     */
    async executeAllNodesSequentially(idx, nodes, connections, currentModel) {
        if (idx >= nodes.length) {
            this.addETLLog('success', '✨ 全部运行完成！');
            this.setState({ isExecuting: false });
            Toast.success('全部运行完成');

            // 刷新数据集列表，以便看到 Sink 节点保存的新数据集
            try {
                const res = await AnalysisApi.getDatasets();
                if (res.data) {
                    this.setState({ datasets: res.data });
                }
            } catch (e) {
                console.warn('刷新数据集列表失败:', e);
            }
            return;
        }

        const node = nodes[idx];
        this.updateETLNodeStatus(node.id, 'running');
        this.addETLLog('info', `正在执行: ${node.data?.label || node.type}...`);

        try {
            const res = await AnalysisApi.executeETLNode({
                model_id: currentModel.id,
                node_id: node.id,
                graph_config: {
                    nodes: nodes,
                    connections: connections
                }
            });

            if (res.code === 200 && res.data?.success) {
                this.updateETLNodeStatus(node.id, 'success');
                // 存储行数
                this._updateNodeData(node.id, { _rowCount: res.data.row_count });
                this.addETLLog('success', `✅ ${node.data?.label || node.type} 完成 (${res.data.row_count} 行)`);

                // 继续执行下一个节点
                setTimeout(() => {
                    this.executeAllNodesSequentially(idx + 1, nodes, connections, currentModel);
                }, 100);
            } else {
                throw new Error(res.message || res.data?.error || '执行失败');
            }
        } catch (e) {
            this.updateETLNodeStatus(node.id, 'error');
            this.addETLLog('error', `❌ ${node.data?.label || node.type} 失败: ${e.message}`);
            this.setState({ isExecuting: false });
            Toast.error(`执行失败: ${e.message}`);
        }
    },

    /**
     * 更新节点状态
     */
    updateETLNodeStatus(id, status) {
        const nodes = (this.state.modelNodes || []).map(n => n.id === id ? { ...n, status } : n);
        this.setState({ modelNodes: nodes });
    },

    /**
     * 添加ETL日志
     */
    addETLLog(type, message) {
        const time = new Date().toLocaleTimeString();
        this.setState({ etlLogs: [...(this.state.etlLogs || []), { type, message, time }] });
        setTimeout(() => {
            const body = document.querySelector('.console-body');
            if (body) body.scrollTop = body.scrollHeight;
        }, 50);
    },

    /**
     * 开始建立连接线
     */
    startETLConnectionLine(e, sourceId) {
        const canvas = document.getElementById('etlCanvas');
        const srcNode = (this.state.modelNodes || []).find(n => n.id === sourceId);
        if (!srcNode || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const container = document.querySelector('.etl-canvas-container');
        if (container) container.classList.add('connecting-active');

        const startX = srcNode.x + 100; // 200/2
        const startY = srcNode.y + 86;  // bottom

        const move = (ev) => {
            const x2 = (ev.clientX - rect.left) / (this.state.canvasZoom || 1);
            const y2 = (ev.clientY - rect.top) / (this.state.canvasZoom || 1);
            this.setState({
                tempConnection: { x1: startX, y1: startY, x2, y2 }
            });
        };

        const up = (ev) => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);

            if (container) container.classList.remove('connecting-active');

            // 增强检测：优先检查是否落在端口上，其次检查是否落在整个节点框内
            const portEl = ev.target.closest('.node-port.port-in');
            const nodeEl = ev.target.closest('.etl-node');

            let targetNodeId = null;
            if (portEl) {
                targetNodeId = portEl.closest('.etl-node').dataset.nodeId;
            } else if (nodeEl) {
                // 如果落在节点上但没精准命中圆点，也视为连接成功（极大提升体验）
                targetNodeId = nodeEl.dataset.nodeId;
            }

            if (targetNodeId && targetNodeId !== sourceId) {
                this.addETLConnection(sourceId, targetNodeId);
                Toast.success('连接成功');
            }

            this.setState({ tempConnection: null });
        };

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },

    /**
     * 手动添加连接关系
     */
    addETLConnection(sourceId, targetId) {
        const conns = [...(this.state.modelConnections || [])];
        // 检查是否已存在
        const exists = conns.find(c => c.sourceId === sourceId && c.targetId === targetId);
        if (exists) return;

        conns.push({ sourceId, targetId });
        this.setState({ modelConnections: conns });
        this.addETLLog('info', `建立连接: 从节点[${sourceId}]到底部[${targetId}]`);
    },

    /**
     * ETL节点拖拽
     */
    startETLNodeDrag(e, nodeId) {
        const node = (this.state.modelNodes || []).find(n => n.id === nodeId);
        if (!node) return;

        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const initX = node.x;
        const initY = node.y;

        const move = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const updated = (this.state.modelNodes || []).map(n => {
                if (n.id === nodeId) {
                    return { ...n, x: initX + dx, y: initY + dy };
                }
                return n;
            });
            this.setState({ modelNodes: updated });
        };

        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },

    /**
     * 初始化ETL画布拖放
     */
    initETLCanvasDrop() {
        // 绑定画布放置事件
        this.initETLCanvas();
    }
};

// 将方法混入到 AnalysisPage.prototype
if (typeof AnalysisPage !== 'undefined') {
    Object.assign(AnalysisPage.prototype, AnalysisModelingMixin);
}

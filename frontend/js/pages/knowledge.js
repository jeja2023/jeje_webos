/**
 * 知识库功能模块
 */

const KnowledgeApi = {
    // 知识库管理
    getBases: () => Api.get('/knowledge/bases'),
    createBase: (data) => Api.post('/knowledge/bases', data),
    updateBase: (id, data) => Api.put(`/knowledge/bases/${id}`, data),
    deleteBase: (id) => Api.delete(`/knowledge/bases/${id}`),

    // 节点管理
    getNodes: (baseId) => Api.get(`/knowledge/bases/${baseId}/nodes`),
    getNode: (id) => Api.get(`/knowledge/nodes/${id}`),
    createNode: (data) => Api.post('/knowledge/nodes', data),
    updateNode: (id, data) => Api.put(`/knowledge/nodes/${id}`, data),
    deleteNode: (id) => Api.delete(`/knowledge/nodes/${id}`),

    // 批量更新节点排序
    batchSortNodes: (updates) => Api.post('/knowledge/nodes/sort', updates),

    // 文件上传
    uploadFile: (baseId, parentId, file) => {
        const formData = new FormData();
        formData.append('base_id', baseId);
        if (parentId) formData.append('parent_id', parentId);
        formData.append('file', file);
        return Api.upload('/knowledge/upload', formData);
    },

    // 混合搜索
    search(query, baseId, nodeType = null) {
        let url = `/knowledge/search?q=${encodeURIComponent(query)}`;
        if (baseId) url += `&base_id=${baseId}`;
        if (nodeType) url += `&node_type=${nodeType}`;
        return Api.get(url);
    },

    // 获取文件预览URL
    getPreviewUrl: (nodeId) => `/api/v1/knowledge/nodes/${nodeId}/preview?token=${localStorage.getItem('token')}`,

    // 获取知识图谱数据
    getGraph: (baseId) => Api.get(`/knowledge/bases/${baseId}/graph`)
};

// 知识库列表页（仪表盘）
class KnowledgeListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            bases: [],
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await KnowledgeApi.getBases();
            this.setState({ bases: res.data, loading: false });
        } catch (error) {
            Toast.error(error.message);
            this.setState({ loading: false });
        }
    }

    render() {
        const { bases, loading } = this.state;

        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page fade-in knowledge-dashboard">
                <header class="kb-dashboard-header">
                    <div class="kb-header-main">
                        <div class="kb-header-info">
                            <h1 class="kb-page-title">知识库</h1>
                            <p class="kb-page-subtitle">构建您的个人数字图书馆，沉淀智慧与经验</p>
                        </div>
                        <div class="kb-header-actions">
                            ${typeof ModuleHelp !== 'undefined' ? ModuleHelp.createHelpButton('knowledge', '知识库', 'btn-help-custom') : ''}
                            <button class="btn-primary-glow" id="btnCreateBase">
                                <span class="plus-icon">+</span>
                                <span>新建知识库</span>
                            </button>
                        </div>
                    </div>
                </header>
                
                ${bases.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="ri-book-3-line"></i></div>
                        <p class="empty-text">创建一个知识库开始整理文档</p>
                    </div>
                ` : `
                    <div class="kb-grid">
                        ${bases.map(base => `
                            <div class="kb-card" data-id="${base.id}">
                                <div class="kb-card-actions">
                                    <button class="btn-action edit" data-action="edit" title="编辑"><i class="ri-edit-line"></i></button>
                                    <button class="btn-action delete" data-action="delete" title="删除"><i class="ri-delete-bin-line"></i></button>
                                </div>
                                <div class="kb-card-icon">${base.cover && base.cover.startsWith('ri-') ? `<i class="${base.cover}"></i>` : (base.cover || '<i class="ri-book-fill"></i>')}</div>
                                <div class="kb-card-body">
                                    <h3 class="kb-title">${Utils.escapeHtml(base.name)}</h3>
                                    <p class="kb-desc">${Utils.escapeHtml(base.description || '无描述')}</p>
                                    <div class="kb-meta">
                                        <span class="meta-item"><i class="ri-time-line"></i> ${Utils.timeAgo(base.updated_at)}</span>
                                        ${base.is_public ? '<span class="tag tag-success">公开</span>' : '<span class="tag tag-secondary">私有</span>'}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    bindEvents() {
        this.delegate('click', '#btnCreateBase', () => this.showCreateModal());

        this.delegate('click', '.kb-card', (e, el) => {
            // 如果点击的是操作按钮，不触发卡片导航
            if (e.target.closest('.kb-card-actions')) return;
            const id = el.dataset.id;
            Router.push(`/knowledge/view/${id}`);
        });

        this.delegate('click', '[data-action="edit"]', (e, el) => {
            e.stopPropagation();
            const id = el.closest('.kb-card').dataset.id;
            const base = this.state.bases.find(b => b.id == id);
            if (base) this.showEditModal(base);
        });

        this.delegate('click', '[data-action="delete"]', (e, el) => {
            e.stopPropagation();
            const id = el.closest('.kb-card').dataset.id;
            Modal.confirm('删除知识库', '确定要删除此知识库吗？这将同时删除其中所有的文档，且无法恢复。', async () => {
                try {
                    await KnowledgeApi.deleteBase(id);
                    Toast.success('删除成功');
                    this.loadData();
                } catch (error) {
                    Toast.error('删除失败: ' + error.message);
                }
            });
        });
    }

    showCreateModal() {
        Modal.form({
            title: '新建知识库',
            fields: [
                { name: 'name', label: '名称', required: true, placeholder: '输入知识库名称' },
                { name: 'description', label: '描述', placeholder: '简单的描述一下吧' },
                { name: 'icon', label: '图标', placeholder: '支持 Emoji 或 Remix Icon 类名 (如 ri-book-fill)' },
                { name: 'is_public', label: '公开可见', type: 'checkbox' }
            ],
            onSubmit: async (data) => {
                data.cover = data.icon || 'ri-book-fill';
                delete data.icon;
                await KnowledgeApi.createBase(data);
                Toast.success('创建成功');
                this.loadData();
            }
        });
    }

    showEditModal(base) {
        Modal.form({
            title: '编辑知识库',
            fields: [
                { name: 'name', label: '名称', required: true, value: base.name },
                { name: 'description', label: '描述', value: base.description },
                { name: 'icon', label: '图标', placeholder: '支持 Emoji 或 Remix Icon 类名 (如 ri-book-fill)', value: base.cover },
                { name: 'is_public', label: '公开可见', type: 'checkbox', value: base.is_public }
            ],
            onSubmit: async (data) => {
                data.cover = data.icon || 'ri-book-fill';
                delete data.icon;
                await KnowledgeApi.updateBase(base.id, data);
                Toast.success('更新成功');
                this.loadData();
            }
        });
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        if (typeof ModuleHelp !== 'undefined') {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }
}

// 知识库详情页（文档树+编辑器）
class KnowledgeViewPage extends Component {
    constructor(container, baseId) {
        super(container);
        this.baseId = baseId;
        this.state = {
            base: null,
            nodes: [],       // 平铺列表
            tree: [],        // 嵌套结构
            activeNode: null, // 当前查看的节点
            activeContent: null,
            searchResults: null, // null 表示没有激活的搜索
            loading: true,
            editorMode: false,
            filters: { type: '' },
            showFilters: false,
            viewMode: 'tree', // 'tree' (树状) 或 'graph' (图谱)
            graphData: null
        };
        this.editor = null; // ToastUI 编辑器实例
    }

    async loadData() {
        try {
            const [baseRes, nodesRes] = await Promise.all([
                Api.get(`/knowledge/bases/${this.baseId}`),
                KnowledgeApi.getNodes(this.baseId)
            ]);

            const nodes = nodesRes.data || [];
            this.setState({
                base: baseRes.data,
                nodes: nodes,
                tree: this.buildTree(nodes),
                loading: false
            });
        } catch (e) {
            console.error('[Knowledge] 加载失败:', e);
            Toast.error(e.message || '加载失败');
            this.setState({ loading: false });
            // 如果是 404 或者无权访问，延迟后返回
            setTimeout(() => Router.back(), 1500);
        }
    }

    buildTree(nodes) {
        /**
         * O(n) 树构建算法
         * 使用两次遍历：第一次建立映射表，第二次建立父子关系
         */
        const map = {};
        const roots = [];

        // 第一次遍历：建立节点映射表
        nodes.forEach(n => {
            map[n.id] = { ...n, children: [] };
        });

        // 第二次遍历：建立父子关系
        nodes.forEach(n => {
            const node = map[n.id];
            if (n.parent_id && map[n.parent_id]) {
                map[n.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    }

    async selectNode(nodeId) {
        try {
            const res = await KnowledgeApi.getNode(nodeId);
            this.setState({
                activeNode: res.data,
                editorMode: false,
                searchResults: null
            });
            // 更新查看器
            this.updateViewer();
        } catch (e) {
            Toast.error('加载文档失败');
        }
    }

    async performSearch(query) {
        if (!query.trim()) {
            this.setState({ searchResults: null });
            return;
        }

        try {
            const res = await KnowledgeApi.search(query, this.baseId, this.state.filters.type);
            this.setState({ searchResults: res.data });
        } catch (e) {
            Toast.error('搜索失败');
        }
    }

    render() {
        const { base, tree, nodes, loading, activeNode, searchResults, viewMode, showFilters, filters } = this.state;
        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page kb-layout">
                <!-- 左侧侧边栏 -->
                <div class="kb-sidebar">
                    <div class="kb-sidebar-header">
                        <button class="btn-icon btn-back-home" id="btnBackHome" title="返回知识库列表"><i class="ri-arrow-left-line"></i></button>
                        <div class="kb-header-title" style="flex:1">
                            <span class="icon">${base.cover && base.cover.startsWith('ri-') ? `<i class="${base.cover}"></i>` : (base.cover || '<i class="ri-book-fill"></i>')}</span>
                            <span class="text-truncate">${Utils.escapeHtml(base.name)}</span>
                        </div>
                        <div class="kb-header-tools">
                            <div class="kb-view-toggles">
                                <button class="btn-icon ${viewMode === 'tree' ? 'active' : ''}" id="btnViewTree" title="树形列表"><i class="ri-list-check"></i></button>
                                <button class="btn-icon ${viewMode === 'graph' ? 'active' : ''}" id="btnViewGraph" title="知识图谱"><i class="ri-node-tree"></i></button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="kb-search-bar">
                        <input type="file" id="fileUploader" style="display:none" multiple>
                        <div class="kb-search-input-group search-group">
                            <input type="text" id="searchInput" placeholder="搜索知识库..." class="form-input">
                            <button class="btn btn-primary" id="btnSearch" title="搜索"><i class="ri-search-2-line"></i></button>
                             <button class="btn-filter ${showFilters ? 'active' : ''}" id="btnToggleFilter" title="筛选选项"><i class="ri-settings-3-line"></i></button>
                        </div>

                        ${showFilters ? `
                        <div class="kb-filter-panel" id="filterPanel">
                            <div class="filter-group">
                                <span class="filter-label">类型:</span>
                                <div class="filter-options">
                                    <span class="filter-chip ${!filters.type ? 'active' : ''}" data-type="">全部</span>
                                    <span class="filter-chip ${filters.type === 'document' ? 'active' : ''}" data-type="document">文档</span>
                                    <span class="filter-chip ${filters.type === 'file' ? 'active' : ''}" data-type="file">文件</span>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="kb-sidebar-actions">
                            <button class="btn btn-primary btn-sm" style="flex:1" id="btnAddRoot"><i class="ri-add-line"></i> 新建文档</button>
                            <button class="btn btn-ghost btn-sm" id="btnUploadRoot" title="上传文件"><i class="ri-upload-2-line"></i> 上传</button>
                        </div>
                    </div>
                    
                    <div class="kb-tree">
                        ${searchResults ? this.renderSearchResults(searchResults) : this.renderTree(tree)}
                    </div>
                    
                    <div class="kb-sidebar-footer" style="padding: 8px; border-top: 1px solid var(--border-color); font-size: 11px; color: var(--text-tertiary); text-align: center;">
                        共 ${nodes.length} 个项目
                    </div>
                </div>
                
                <!-- 右侧内容区 -->
                <div class="kb-content" ondragover="event.preventDefault()" ondrop="window.handleDropFile(event)">
                    ${viewMode === 'graph' ? `
                        <div class="kb-graph-container">
                            <div class="graph-header">
                                <h3>知识图谱可视化</h3>
                                <div class="graph-actions">
                                    <button class="btn btn-ghost btn-sm" id="btnRefreshGraph"><i class="ri-refresh-line"></i> 刷新</button>
                                </div>
                            </div>
                            <div id="echartsGraph" style="width: 100%; flex: 1; min-height: 400px;"></div>
                        </div>
                    ` : `
                        ${this.renderBreadcrumbs()}
                        
                        ${activeNode ? `
                            <div class="kb-doc-header">
                                <div class="doc-title-row">
                                    <span class="doc-icon">${this.getNodeIcon(activeNode)}</span>
                                    <h1>${Utils.escapeHtml(activeNode.title)}</h1>
                                </div>
                                <div class="kb-doc-meta">
                                    <span>${Utils.timeAgo(activeNode.updated_at)}</span>
                                    ${activeNode.node_type === 'document' ?
                    `<button class="btn btn-ghost btn-sm" id="btnEditDoc"><i class="ri-edit-line"></i> 编辑</button>` : ''
                }
                                    <button class="btn btn-ghost btn-sm text-danger" id="btnDeleteDoc"><i class="ri-delete-bin-line"></i> 删除</button>
                                    ${activeNode.node_type === 'file' ?
                    `<a href="${KnowledgeApi.getPreviewUrl(activeNode.id)}" target="_blank" class="btn btn-primary btn-sm"><i class="ri-download-line"></i> 下载</a>` : ''
                }
                                </div>
                            </div>
                            <div id="editorContainer" class="kb-editor-area"></div>
                        ` : `
                            <div class="empty-state">
                                <div class="empty-icon"><i class="ri-upload-cloud-2-line"></i></div>
                                <p>选择文档查看，或拖拽文件到此处上传</p>
                            </div>
                        `}
                    `}
                    
                    <!-- 上传遮罩 -->
                    <div id="uploadOverlay" class="upload-overlay">
                        <div class="upload-message">释放以上传文件到当前知识库</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderBreadcrumbs() {
        if (!this.state.activeNode) return '';

        const path = [];
        let current = this.state.activeNode;
        // 用于快速查找的映射表
        const nodeMap = {};
        this.state.nodes.forEach(n => nodeMap[n.id] = n);

        while (current) {
            path.unshift(current);
            if (current.parent_id && nodeMap[current.parent_id]) {
                current = nodeMap[current.parent_id];
            } else {
                current = null;
            }
        }

        return `
            <div class="kb-breadcrumbs">
                <span class="breadcrumb-item" data-id="root" title="回到概览"><i class="ri-home-line"></i> 概览</span>
                ${path.map((node, index) => `
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item ${index === path.length - 1 ? 'active' : ''}" 
                          data-id="${node.id}">
                          ${Utils.escapeHtml(node.title)}
                    </span>
                `).join('')}
            </div>
        `;
    }


    renderSearchResults(results) {
        if (!results || results.length === 0) return '<div class="empty-text" style="padding:20px;text-align:center">无搜索结果</div>';

        const query = this.$('#searchInput').value.trim();

        const highlightText = (text, q) => {
            if (!text) return '';
            if (!q) return Utils.escapeHtml(text);
            const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return Utils.escapeHtml(text).replace(regex, '<mark>$1</mark>');
        };

        return `
            <div class="search-results-header">搜索结果 (${results.length})</div>
            <ul class="tree-list search-list">
                ${results.map(r => {
            const isImage = (r.metadata.node_type === 'image' || r.metadata.type === 'image');
            const icon = isImage ? '<i class="ri-image-line"></i>' : '<i class="ri-file-text-line"></i>';
            const title = r.metadata.title || '无标题';

            return `
                    <li class="tree-item search-item">
                        <div class="tree-content search-content" data-id="${r.node_id}">
                            <div class="search-item-top">
                                <span class="tree-icon">${icon}</span>
                                <div class="tree-text search-title">${highlightText(title, query)}</div>
                                <div class="search-badges">
                                    ${r.sources && r.sources.includes('语义') ? '<span class="badge badge-primary">语义</span>' : ''}
                                    ${r.sources && r.sources.includes('关键词') ? '<span class="badge badge-info">关键词</span>' : ''}
                                    ${r.sources && r.sources.includes('视觉') ? '<span class="badge badge-warning">视觉</span>' : ''}
                                </div>
                            </div>
                            <div class="tree-snippet">${highlightText(r.content ? r.content.substring(0, 100) : '', query)}...</div>
                        </div>
                    </li>
                    `;
        }).join('')}
            </ul>
        `;
    }


    renderTree(nodes, level = 0) {
        if (!nodes || nodes.length === 0) return '';
        return `
            <ul class="tree-list" style="padding-left: ${level * 12}px">
                ${nodes.map(node => `
                    <li class="tree-item ${this.state.activeNode?.id === node.id ? 'active' : ''}">
                        <div class="tree-content ${node.status === 'processing' ? 'status-processing' : ''}" data-id="${node.id}">
                            <span class="tree-icon">${this.getNodeIcon(node)}</span>
                            <span class="tree-text">${Utils.escapeHtml(node.title)}</span>
                            ${node.node_type === 'folder' ? `
                                <div class="tree-actions-hover">
                                    <button class="btn-icon-tiny" data-action="add-sub" data-id="${node.id}" title="新建子项"><i class="ri-add-line"></i></button>
                                    <button class="btn-icon-tiny" data-action="upload-sub" data-id="${node.id}" title="上传文件"><i class="ri-upload-2-line"></i></button>
                                </div>
                            ` : ''}
                        </div>
                        ${this.renderTree(node.children, level + 1)}
                    </li>
                `).join('')}
            </ul>
        `;
    }

    getNodeIcon(node) {
        if (node.node_type === 'folder') return '<i class="ri-folder-line"></i>';
        if (node.node_type === 'file') {
            const ext = node.file_meta?.ext?.toLowerCase() || '';
            if (['pdf'].includes(ext)) return '<i class="ri-file-pdf-line"></i>';
            if (['doc', 'docx'].includes(ext)) return '<i class="ri-file-word-line"></i>';
            if (['xls', 'xlsx', 'csv'].includes(ext)) return '<i class="ri-file-excel-line"></i>';
            if (['ppt', 'pptx'].includes(ext)) return '<i class="ri-file-ppt-line"></i>';
            if (['jpg', 'png', 'jpeg', 'gif'].includes(ext)) return '<i class="ri-image-line"></i>';
            return '<i class="ri-attachment-line"></i>';
        }
        return '<i class="ri-file-text-line"></i>';
    }

    updateViewer() {
        const container = this.$('#editorContainer');
        if (!container || !this.state.activeNode) return;

        container.innerHTML = '';
        const node = this.state.activeNode;

        // 处理中状态
        if (node.status === 'processing') {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon" style="animation:spin 2s linear infinite"><i class="ri-settings-3-line"></i></div>
                    <p>文档正在后台解析中...</p>
                    <p class="text-secondary" style="font-size:12px">解析完成后将自动显示内容</p>
                </div>
            `;
            // 如果还没有启动轮询，则启动
            if (!this.pollingTimer) {
                this.pollingTimer = setInterval(() => this.checkNodeStatus(node.id), 2000);
            }
            return;
        } else {
            // 状态完成时停止轮询
            if (this.pollingTimer) {
                clearInterval(this.pollingTimer);
                this.pollingTimer = null;
            }
        }

        if (node.node_type === 'folder') {
            container.innerHTML = `
                 <div class="folder-view-placeholder">
                     <div class="empty-icon"><i class="ri-folder-line"></i></div>
                     <p>文件夹：${Utils.escapeHtml(node.title)}</p>
                     <p class="text-secondary">请在左侧选择子文档或上传文件</p>
                 </div>
             `;
            return;
        }

        if (this.state.editorMode) {
            // 编辑模式（仅适用于文档）
            this.editor = new toastui.Editor({
                el: container,
                height: '100%',
                initialEditType: 'markdown',
                previewStyle: 'vertical',
                initialValue: node.content || ''
            });

            // 添加保存按钮
            const btnSave = document.createElement('button');
            btnSave.className = 'btn btn-primary floating-save';
            btnSave.textContent = '保存';
            btnSave.onclick = () => this.saveDoc();
            container.appendChild(btnSave);

        } else {
            // 查看模式
            if (node.node_type === 'file') {
                const ext = node.file_meta?.ext?.toLowerCase();
                const previewUrl = KnowledgeApi.getPreviewUrl(node.id);

                if (ext === 'pdf') {
                    container.innerHTML = `<iframe src="${previewUrl}#toolbar=0" style="width:100%;height:100%;border:none;"></iframe>`;
                } else if (['jpg', 'png', 'jpeg', 'gif', 'svg'].includes(ext)) {
                    container.innerHTML = `<div style="display:flex;justify-content:center;padding:20px"><img src="${previewUrl}" style="max-width:100%;max-height:80vh;border-radius:8px;box-shadow:var(--shadow-md)"></div>`;
                } else {
                    // 对于 Word/Excel，显示提取的文本内容或下载链接
                    const extractedView = node.content ? `
                         <div class="extracted-text-view">
                             <div class="alert alert-info" style="margin-bottom:20px">这是从文件中提取的文本预览。部分格式可能丢失。</div>
                             <div class="markdown-body">${Utils.escapeHtml(node.content).replace(/\n/g, '<br>')}</div>
                         </div>
                     ` : `
                         <div class="empty-state">
                             <div class="empty-icon"><i class="ri-attachment-line"></i></div>
                             <p>此文件不支持在线预览</p>
                             <a href="${previewUrl}" class="btn btn-primary">下载文件</a>
                         </div>
                     `;
                    container.innerHTML = extractedView;
                }
            } else {
                // 普通文档
                this.viewer = toastui.Editor.factory({
                    el: container,
                    viewer: true,
                    height: '100%',
                    initialValue: node.content || '> 无内容'
                });
            }
        }
    }

    async checkNodeStatus(nodeId) {
        try {
            const res = await KnowledgeApi.getNode(nodeId);
            const newNode = res.data;
            if (newNode.status !== 'processing') {
                clearInterval(this.pollingTimer);
                this.pollingTimer = null;

                // 同步更新侧边栏列表中的节点状态
                const newNodes = this.state.nodes.map(n =>
                    n.id == nodeId ? { ...n, status: newNode.status, title: newNode.title } : n
                );

                this.setState({
                    activeNode: newNode,
                    nodes: newNodes,
                    tree: this.buildTree(newNodes)
                });

                this.updateViewer();
                Toast.success('文档解析完成');
            }
        } catch (e) {
            console.error('轮询检查错误', e);
        }
    }

    async saveDoc() {

        if (!this.editor || !this.state.activeNode) return;
        const content = this.editor.getMarkdown();

        try {
            await KnowledgeApi.updateNode(this.state.activeNode.id, { content });
            Toast.success('保存成功');
            this.state.activeNode.content = content;
            this.setState({ editorMode: false });
            this.updateViewer();
        } catch (e) {
            Toast.error('保存失败: ' + e.message);
        }
    }

    // 批量文件上传处理
    async handleBatchUpload(files, parentId = null) {
        if (!files || files.length === 0) return;

        const fileList = Array.from(files);
        const loader = Toast.loading(`准备上传 ${fileList.length} 个文件...`);
        let successCount = 0;
        let lastNode = null;

        try {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                loader.update(`正在上传: ${file.name} (${i + 1}/${fileList.length})`);

                try {
                    const res = await KnowledgeApi.uploadFile(this.baseId, parentId, file);
                    successCount++;
                    lastNode = res.data;
                } catch (e) {
                    Toast.error(`${file.name} 上传失败: ${e.message}`);
                }
            }

            if (successCount > 0) {
                Toast.success(`${successCount} 个文件上传成功，正在解析中...`);
                await this.loadData();

                // 自动选中最后一个上传的文件，展示解析状态
                if (lastNode && lastNode.id) {
                    this.selectNode(lastNode.id);
                }
            }
        } catch (e) {
            Toast.error('上传过程发生错误: ' + e.message);
        } finally {
            loader.close();
        }
    }

    // 单个文件上传处理 (保持兼容性)
    async handleFileUpload(file, parentId = null) {
        await this.handleBatchUpload([file], parentId);
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        if (typeof ModuleHelp !== 'undefined') {
            ModuleHelp.bindHelpButtons(this.container);
        }

        // 定义全局拖放处理函数
        window.handleDropFile = (e) => {
            e.preventDefault();
            this.$('#uploadOverlay')?.classList.remove('active');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                let targetParentId = null;
                if (this.state.activeNode && this.state.activeNode.node_type === 'folder') {
                    targetParentId = this.state.activeNode.id;
                }
                this.handleBatchUpload(e.dataTransfer.files, targetParentId);
            }
        };
    }

    afterUpdate() {
        this.updateViewer();
        this.bindSearchEvent();
        this.bindDragEvents();
        if (this.state.viewMode === 'graph') {
            this.renderGraph();
        }
        if (typeof ModuleHelp !== 'undefined') {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindSearchEvent() {
        const searchInput = this.$('#searchInput');
        const btnSearch = this.$('#btnSearch');

        // 执行搜索的统一函数
        const triggerSearch = () => {
            const query = searchInput ? searchInput.value.trim() : '';
            this.performSearch(query);
        };

        if (btnSearch) {
            btnSearch.onclick = triggerSearch;
        }

        if (searchInput) {
            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerSearch();
                }
            };
        }

        // 过滤器切换
        const btnToggle = this.$('#btnToggleFilter');
        if (btnToggle) {
            btnToggle.onclick = () => {
                this.setState({ showFilters: !this.state.showFilters });
            };
        }

        // 过滤器芯片点击
        this.container.querySelectorAll('.filter-chip').forEach(chip => {
            chip.onclick = (e) => {
                const type = e.target.dataset.type;
                this.setState({ filters: { type } });
                this.performSearch(this.$('#searchInput').value);
            };
        });
    }

    bindDragEvents() {
        const contentArea = this.$('.kb-content');
        if (contentArea) {
            contentArea.ondragenter = (e) => {
                e.preventDefault();
                this.$('#uploadOverlay')?.classList.add('active');
            };
            const overlay = this.$('#uploadOverlay');
            if (overlay) {
                overlay.ondragleave = (e) => {
                    e.preventDefault();
                    overlay.classList.remove('active');
                };
            }
        }
    }

    bindEvents() {
        // 点击树节点
        this.delegate('click', '.tree-content', (e, el) => {
            if (e.target.tagName === 'BUTTON') return;
            const id = el.dataset.id;
            this.selectNode(id);
        });

        // 添加子节点
        this.delegate('click', '[data-action="add-sub"]', (e, el) => {
            e.stopPropagation();
            const parentId = el.dataset.id;
            this.showCreateNodeModal(parentId);
        });



        // 添加根节点
        this.delegate('click', '#btnAddRoot', () => this.showCreateNodeModal(null));

        // 编辑文档
        this.delegate('click', '#btnEditDoc', () => {
            this.setState({ editorMode: true });
        });

        // 删除文档
        this.delegate('click', '#btnDeleteDoc', () => {
            const id = this.state.activeNode.id;
            Modal.confirm('删除文档', '确定删除吗？', async () => {
                await KnowledgeApi.deleteNode(id);
                Toast.success('已删除');
                this.setState({ activeNode: null });
                this.loadData();
            });
        });

        // 根目录上传按钮
        this.delegate('click', '#btnUploadRoot', () => {
            this.uploadTargetId = null; // 上传到根目录
            const uploader = this.$('#fileUploader');
            if (uploader) uploader.click();
        });

        // 子目录上传按钮
        this.delegate('click', '[data-action="upload-sub"]', (e, el) => {
            e.stopPropagation();
            this.uploadTargetId = el.dataset.id;
            const uploader = this.$('#fileUploader');
            if (uploader) uploader.click();
        });

        // 文件输入变更 (因为输入框是隐藏的，可能需要手动委托)
        // 由于侧边栏会重绘，使用容器的事件冒泡
        this.container.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'fileUploader') {
                const files = e.target.files;
                if (files.length > 0) {
                    this.handleBatchUpload(files, this.uploadTargetId);
                    // 重置文件输入框
                    e.target.value = '';
                }
            }
        });

        // 面包屑导航
        this.delegate('click', '.breadcrumb-item', (e, el) => {
            const id = el.dataset.id;
            if (id === 'root') {
                this.setState({ activeNode: null });
                this.updateViewer();
            } else {
                this.selectNode(id);
            }
        });

        // 视图切换
        this.delegate('click', '#btnViewTree', () => this.switchView('tree'));
        this.delegate('click', '#btnViewGraph', () => this.switchView('graph'));

        // 图谱刷新
        this.delegate('click', '#btnRefreshGraph', () => this.loadGraphData());

        // 返回首页
        this.delegate('click', '#btnBackHome', () => {
            Router.push('/knowledge');
        });
    }

    async switchView(mode) {
        if (mode === this.state.viewMode) return;
        this.setState({ viewMode: mode, searchResults: null });
        if (mode === 'graph') {
            await this.loadGraphData();
        }
    }

    async loadGraphData() {
        const loader = Toast.loading('加载图谱数据...');
        try {
            const res = await KnowledgeApi.getGraph(this.baseId);
            this.setState({ graphData: res.data });
        } catch (e) {
            Toast.error('图谱加载失败');
        } finally {
            loader.close();
        }
    }

    async renderGraph() {
        const container = this.$('#echartsGraph');
        if (!container || !this.state.graphData) return;

        // 动态加载 ECharts
        if (typeof echarts === 'undefined') {
            await Utils.loadScript('https://lib.baomitu.com/echarts/5.4.3/echarts.min.js');
        }

        const chart = echarts.init(container);
        const data = this.state.graphData;

        const option = {
            tooltip: { show: true },
            legend: [{
                data: ['人物', '机构', '地点', '概念', '技术', '事件', '时间'],
                textStyle: { color: 'var(--text-secondary)' }
            }],
            series: [{
                type: 'graph',
                layout: 'force',
                animation: true,
                draggable: true,
                data: data.nodes.map(node => ({
                    id: node.id,
                    name: node.name,
                    symbolSize: node.type === '概念' ? 30 : 20,
                    category: node.type,
                    value: node.type,
                    label: { show: true, position: 'right' }
                })),
                links: data.edges.map(edge => ({
                    source: edge.source,
                    target: edge.target,
                    label: { show: true, formatter: edge.label, fontSize: 10 }
                })),
                categories: [
                    { name: '人物' }, { name: '机构' }, { name: '地点' },
                    { name: '概念' }, { name: '技术' }, { name: '事件' }, { name: '时间' }
                ],
                force: {
                    repulsion: 300,
                    edgeLength: 150,
                    gravity: 0.05
                },
                lineStyle: { color: 'source', curveness: 0.1, opacity: 0.6 },
                emphasis: { focus: 'adjacency', lineStyle: { width: 4 } }
            }]
        };

        chart.setOption(option);
        window.addEventListener('resize', () => chart.resize());
    }



    showCreateNodeModal(parentId) {
        Modal.form({
            title: '新建文档',
            fields: [
                { name: 'title', label: '标题', required: true },
                {
                    name: 'node_type', label: '类型', type: 'select', options: [
                        { value: 'document', text: '文档' },
                        { value: 'folder', text: '文件夹' }
                    ]
                }
            ],
            onSubmit: async (data) => {
                data.base_id = this.baseId;
                if (parentId) data.parent_id = parseInt(parentId);

                const res = await KnowledgeApi.createNode(data);
                Toast.success('创建成功');
                await this.loadData();
                if (res.data && res.data.id) {
                    this.selectNode(res.data.id);
                }
            }
        });
    }
}

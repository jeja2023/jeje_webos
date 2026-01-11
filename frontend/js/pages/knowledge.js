/**
 * 知识库功能模块
 */

const KnowledgeApi = {
    getBases: () => Api.get('/knowledge/bases'),
    createBase: (data) => Api.post('/knowledge/bases', data),
    deleteBase: (id) => Api.delete(`/knowledge/bases/${id}`),

    getNodes: (baseId) => Api.get(`/knowledge/bases/${baseId}/nodes`),
    getNode: (id) => Api.get(`/knowledge/nodes/${id}`),
    createNode: (data) => Api.post('/knowledge/nodes', data),
    updateNode: (id, data) => Api.put(`/knowledge/nodes/${id}`, data),
    deleteNode: (id) => Api.delete(`/knowledge/nodes/${id}`),

    uploadFile: (baseId, parentId, file) => {
        const formData = new FormData();
        formData.append('base_id', baseId);
        if (parentId) formData.append('parent_id', parentId);
        formData.append('file', file);
        return Api.post('/knowledge/upload', formData, {
            headers: { 'Content-Type': undefined } // Let browser set boundary
        });
    },

    search(query, baseId, nodeType = null) {
        let url = `/api/v1/knowledge/search?q=${encodeURIComponent(query)}`;
        if (baseId) url += `&base_id=${baseId}`;
        if (nodeType) url += `&node_type=${nodeType}`;
        return Api.request({ url });
    },

    // Add getFilePreviewUrl helper
    getPreviewUrl: (nodeId) => `/api/v1/knowledge/nodes/${nodeId}/preview?token=${localStorage.getItem('token')}`,

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
                <div class="page-header">
                    <div style="display:flex; align-items:center; gap:12px; flex:1">
                        <h1 class="page-title" style="margin:0">知识库</h1>
                        ${typeof ModuleHelp !== 'undefined' ? ModuleHelp.createHelpButton('knowledge', '知识库', 'btn-ghost') : ''}
                    </div>
                    <button class="btn btn-primary" id="btnCreateBase">➕ 新建知识库</button>
                </div>
                
                ${bases.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-icon">📚</div>
                        <p class="empty-text">创建一个知识库开始整理文档</p>
                    </div>
                ` : `
                    <div class="kb-grid">
                        ${bases.map(base => `
                            <div class="kb-card" data-id="${base.id}">
                                <div class="kb-card-icon">${base.cover || '📘'}</div>
                                <div class="kb-card-body">
                                    <h3 class="kb-title">${Utils.escapeHtml(base.name)}</h3>
                                    <p class="kb-desc">${Utils.escapeHtml(base.description || '无描述')}</p>
                                    <div class="kb-meta">
                                        <span>${Utils.timeAgo(base.updated_at)}</span>
                                        ${base.is_public ? '<span class="tag tag-success">公开</span>' : '<span class="tag">私有</span>'}
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
            const id = el.dataset.id;
            Router.push(`/knowledge/view/${id}`);
        });
    }

    showCreateModal() {
        Modal.form({
            title: '新建知识库',
            fields: [
                { name: 'name', label: '名称', required: true },
                { name: 'description', label: '描述' },
                { name: 'icon', label: '图标', placeholder: '比如 📚' },
                { name: 'is_public', label: '公开可见', type: 'checkbox' }
            ],
            onSubmit: async (data) => {
                data.cover = data.icon || '📘';
                delete data.icon; // mapping
                await KnowledgeApi.createBase(data);
                Toast.success('创建成功');
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
            nodes: [],       // flat list
            tree: [],        // nested
            activeNode: null, // current viewing node
            activeContent: null,
            searchResults: null, // null means no search active
            loading: true,
            editorMode: false,
            filters: { type: '' },
            showFilters: false,
            viewMode: 'tree', // 'tree' or 'graph'
            graphData: null
        };
        this.editor = null; // ToastUI Instance
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
        // Simple O(n^2) tree builder
        const map = {};
        const roots = [];
        // Deep copy nodes to avoid polluting original list if needed
        const nodesCopy = nodes.map(n => ({ ...n, children: [] }));

        nodesCopy.forEach(n => {
            map[n.id] = n;
        });

        nodesCopy.forEach(n => {
            if (n.parent_id && map[n.parent_id]) {
                map[n.parent_id].children.push(n);
            } else {
                roots.push(n);
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
                searchResults: null // clear search when selecting
            });
            // Update editor/viewer
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
                        <div class="kb-header-title" style="flex:1">
                            <span class="icon">${base.cover}</span>
                            <span class="text-truncate">${Utils.escapeHtml(base.name)}</span>
                        </div>
                        <div class="kb-view-toggles">
                            <button class="btn-icon ${viewMode === 'tree' ? 'active' : ''}" id="btnViewTree" title="树形列表">📁</button>
                            <button class="btn-icon ${viewMode === 'graph' ? 'active' : ''}" id="btnViewGraph" title="知识图谱">🕸️</button>
                        </div>
                        ${typeof ModuleHelp !== 'undefined' ? ModuleHelp.createHelpButton('knowledge', '知识库', 'btn-icon') : ''}
                    </div>
                    
                    <div class="kb-search-bar">
                        <input type="file" id="fileUploader" style="display:none" multiple>
                        <div class="search-input-group">
                            <input type="text" id="searchInput" placeholder="搜索知识库..." class="form-input" style="flex:1">
                            <button class="btn-filter ${showFilters ? 'active' : ''}" id="btnToggleFilter" title="筛选选项">⚙️</button>
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
                            <button class="btn btn-primary btn-sm" style="flex:1" id="btnAddRoot">➕ 新建文档</button>
                            <button class="btn btn-ghost btn-sm" id="btnUploadRoot" title="上传文件">⬆️ 上传</button>
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
                                    <button class="btn btn-ghost btn-sm" id="btnRefreshGraph">🔄 刷新</button>
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
                    `<button class="btn btn-ghost btn-sm" id="btnEditDoc">✏️ 编辑</button>` : ''
                }
                                    <button class="btn btn-ghost btn-sm text-danger" id="btnDeleteDoc">🗑️ 删除</button>
                                    ${activeNode.node_type === 'file' ?
                    `<a href="${KnowledgeApi.getPreviewUrl(activeNode.id)}" target="_blank" class="btn btn-primary btn-sm">📥 下载</a>` : ''
                }
                                </div>
                            </div>
                            <div id="editorContainer" class="kb-editor-area"></div>
                        ` : `
                            <div class="empty-state">
                                <div class="empty-icon">📤</div>
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
        // Map for fast lookup
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
                <span class="breadcrumb-item" data-id="root">🏠 根目录</span>
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
            const icon = isImage ? '🖼️' : '📄';
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
                                    <button class="btn-icon-tiny" data-action="add-sub" data-id="${node.id}" title="新建子项">+</button>
                                    <button class="btn-icon-tiny" data-action="upload-sub" data-id="${node.id}" title="上传文件">⬆️</button>
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
        if (node.node_type === 'folder') return '📁';
        if (node.node_type === 'file') {
            const ext = node.file_meta?.ext?.toLowerCase() || '';
            if (['pdf'].includes(ext)) return '📕';
            if (['doc', 'docx'].includes(ext)) return '📘';
            if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
            if (['ppt', 'pptx'].includes(ext)) return '📙';
            if (['jpg', 'png', 'jpeg', 'gif'].includes(ext)) return '🖼️';
            return '📎';
        }
        return '📄';
    }

    updateViewer() {
        const container = this.$('#editorContainer');
        if (!container || !this.state.activeNode) return;

        container.innerHTML = '';
        const node = this.state.activeNode;

        // Processing State Handling
        if (node.status === 'processing') {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon" style="animation:spin 2s linear infinite">⚙️</div>
                    <p>文档正在后台解析中...</p>
                    <p class="text-secondary" style="font-size:12px">解析完成后将自动显示内容</p>
                </div>
            `;
            // Start polling if not already started
            if (!this.pollingTimer) {
                this.pollingTimer = setInterval(() => this.checkNodeStatus(node.id), 2000);
            }
            return;
        } else {
            // Stop polling if status is done
            if (this.pollingTimer) {
                clearInterval(this.pollingTimer);
                this.pollingTimer = null;
            }
        }

        if (node.node_type === 'folder') {
            container.innerHTML = `
                 <div class="folder-view-placeholder">
                     <div class="empty-icon">📁</div>
                     <p>文件夹：${Utils.escapeHtml(node.title)}</p>
                     <p class="text-secondary">请在左侧选择子文档或上传文件</p>
                 </div>
             `;
            return;
        }

        if (this.state.editorMode) {
            // Editor Mode (Only for documents)
            this.editor = new toastui.Editor({
                el: container,
                height: '100%',
                initialEditType: 'markdown',
                previewStyle: 'vertical',
                initialValue: node.content || ''
            });

            // Add Save Button
            const btnSave = document.createElement('button');
            btnSave.className = 'btn btn-primary floating-save';
            btnSave.textContent = '保存';
            btnSave.onclick = () => this.saveDoc();
            container.appendChild(btnSave);

        } else {
            // Viewer Mode
            if (node.node_type === 'file') {
                const ext = node.file_meta?.ext?.toLowerCase();
                const previewUrl = KnowledgeApi.getPreviewUrl(node.id);

                if (ext === 'pdf') {
                    container.innerHTML = `<iframe src="${previewUrl}#toolbar=0" style="width:100%;height:100%;border:none;"></iframe>`;
                } else if (['jpg', 'png', 'jpeg', 'gif', 'svg'].includes(ext)) {
                    container.innerHTML = `<div style="display:flex;justify-content:center;padding:20px"><img src="${previewUrl}" style="max-width:100%;max-height:80vh;border-radius:8px;box-shadow:var(--shadow-md)"></div>`;
                } else {
                    // For Word/Excel, we display extracted text if available, or just download link
                    const extractedView = node.content ? `
                         <div class="extracted-text-view">
                             <div class="alert alert-info" style="margin-bottom:20px">这是从文件中提取的文本预览。部分格式可能丢失。</div>
                             <div class="markdown-body">${Utils.escapeHtml(node.content).replace(/\n/g, '<br>')}</div>
                         </div>
                     ` : `
                         <div class="empty-state">
                             <div class="empty-icon">📎</div>
                             <p>此文件不支持在线预览</p>
                             <a href="${previewUrl}" class="btn btn-primary">下载文件</a>
                         </div>
                     `;
                    container.innerHTML = extractedView;
                }
            } else {
                // Normal Document
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
                this.setState({ activeNode: newNode });
                this.updateViewer();
                Toast.success('文档解析完成');
            }
        } catch (e) {
            console.error('Polling error', e);
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

    // File Upload Handler
    async handleFileUpload(file, parentId = null) {
        if (!file) return;

        const loader = Toast.loading('正在上传并解析...');
        try {
            await KnowledgeApi.uploadFile(this.baseId, parentId, file);
            Toast.success('上传成功');
            this.loadData(); // Reload tree
        } catch (e) {
            Toast.error('上传失败: ' + e.message);
        } finally {
            loader.close();
        }
    }

    afterMount() {
        this.loadData();
        this.bindEvents(); // Delegated events
        if (typeof ModuleHelp !== 'undefined') {
            ModuleHelp.bindHelpButtons(this.container);
        }

        // Define global drop handler for this instance
        window.handleDropFile = (e) => {
            e.preventDefault();
            this.$('#uploadOverlay')?.classList.remove('active');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                let targetParentId = null;
                if (this.state.activeNode && this.state.activeNode.node_type === 'folder') {
                    targetParentId = this.state.activeNode.id;
                }
                this.handleFileUpload(e.dataTransfer.files[0], targetParentId);
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
        if (searchInput) {
            let timeout;
            searchInput.oninput = (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.performSearch(e.target.value), 300);
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
        // Tree Click
        this.delegate('click', '.tree-content', (e, el) => {
            if (e.target.tagName === 'BUTTON') return;
            const id = el.dataset.id;
            this.selectNode(id);
        });

        // Add Sub Node
        this.delegate('click', '[data-action="add-sub"]', (e, el) => {
            e.stopPropagation();
            const parentId = el.dataset.id;
            this.showCreateNodeModal(parentId);
        });

        // Upload Sub File
        this.delegate('click', '[data-action="upload-sub"]', (e, el) => {
            e.stopPropagation();
            const parentId = el.dataset.id;
            this.triggerUpload(parentId);
        });

        // Add Root Node
        this.delegate('click', '#btnAddRoot', () => this.showCreateNodeModal(null));

        // Edit Doc
        this.delegate('click', '#btnEditDoc', () => {
            this.setState({ editorMode: true });
        });

        // Delete Doc
        this.delegate('click', '#btnDeleteDoc', () => {
            const id = this.state.activeNode.id;
            Modal.confirm('删除文档', '确定删除吗？', async () => {
                await KnowledgeApi.deleteNode(id);
                Toast.success('已删除');
                this.setState({ activeNode: null });
                this.loadData();
            });
        });

        // Root Upload Button
        this.delegate('click', '#btnUploadRoot', () => {
            this.uploadTargetId = null; // Root upload
            const uploader = this.$('#fileUploader');
            if (uploader) uploader.click();
        });

        // Sub Upload Button
        this.delegate('click', '[data-action="upload-sub"]', (e, el) => {
            e.stopPropagation();
            this.uploadTargetId = el.dataset.id;
            const uploader = this.$('#fileUploader');
            if (uploader) uploader.click();
        });

        // File Input Change (Bind to container capture phase or delegate manually since input is hidden)
        // Since we re-render sidebar, we use the container's change event bubbling
        this.container.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'fileUploader') {
                const files = e.target.files;
                if (files.length > 0) {
                    // Upload each file
                    Array.from(files).forEach(file => {
                        this.handleFileUpload(file, this.uploadTargetId);
                    });
                    // Reset input
                    e.target.value = '';
                }
            }
        });

        // Breadcrumb Navigation
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

    triggerUpload(parentId) {

        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0], parentId);
            }
        };
        input.click();
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

                await KnowledgeApi.createNode(data);
                Toast.success('创建成功');
                this.loadData();
            }
        });
    }
}

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

    search: (query, baseId) => {
        const params = { q: query };
        if (baseId) params.base_id = baseId;
        return Api.get('/knowledge/search', params);
    },

    // Add getFilePreviewUrl helper
    getPreviewUrl: (nodeId) => `/api/v1/knowledge/nodes/${nodeId}/preview?token=${localStorage.getItem('token')}`
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
                    <h1 class="page-title">知识库</h1>
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
            editorMode: false
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
            const res = await KnowledgeApi.search(query, this.baseId);
            this.setState({ searchResults: res.data });
        } catch (e) {
            Toast.error('搜索失败');
        }
    }

    render() {
        const { base, tree, loading, activeNode, searchResults } = this.state;
        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page kb-layout">
                <!-- 左侧侧边栏 -->
                <div class="kb-sidebar">
                    <div class="kb-sidebar-header">
                        <div class="kb-header-title">
                            <span class="icon">${base.cover}</span>
                            <span class="text-truncate">${Utils.escapeHtml(base.name)}</span>
                        </div>
                    </div>
                    
                    <div class="kb-search-bar">
                        <input type="text" id="searchInput" placeholder="搜索知识库..." class="form-input" style="width:100%">
                    </div>
                    
                    <div class="kb-tree">
                        ${searchResults ? this.renderSearchResults(searchResults) : this.renderTree(tree)}
                    </div>
                    
                    <div class="kb-sidebar-footer">
                        <button class="btn btn-ghost btn-block" id="btnAddRoot">➕ 新建文档</button>
                    </div>
                </div>
                
                <!-- 右侧内容区 -->
                <div class="kb-content" ondragover="event.preventDefault()" ondrop="window.handleDropFile(event)">
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
                    
                    <!-- 上传遮罩 -->
                    <div id="uploadOverlay" class="upload-overlay">
                        <div class="upload-message">释放以上传文件到当前知识库</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSearchResults(results) {
        if (!results || results.length === 0) return '<div class="empty-text" style="padding:20px;text-align:center">无搜索结果</div>';

        return `
            <div class="search-results-header">搜索结果 (${results.length})</div>
            <ul class="tree-list">
                ${results.map(r => `
                    <li class="tree-item">
                        <div class="tree-content" data-id="${r.metadata.node_id}">
                            <span class="tree-icon">🔍</span>
                            <div class="tree-text-col">
                                <div class="tree-text">${Utils.escapeHtml(r.metadata.title)}</div>
                                <div class="tree-snippet">${Utils.escapeHtml(r.content.substring(0, 50))}...</div>
                            </div>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    renderTree(nodes, level = 0) {
        if (!nodes || nodes.length === 0) return '';
        return `
            <ul class="tree-list" style="padding-left: ${level * 12}px">
                ${nodes.map(node => `
                    <li class="tree-item ${this.state.activeNode?.id === node.id ? 'active' : ''}">
                        <div class="tree-content" data-id="${node.id}">
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
            loader.hide();
        }
    }

    afterMount() {
        this.loadData();
        this.bindEvents(); // Delegated events

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

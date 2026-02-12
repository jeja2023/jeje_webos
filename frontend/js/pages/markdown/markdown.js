/**
 * Markdown 编辑器页面
 * 专业的 Markdown 文档编辑与预览工具
 */

// Markdown 文档列表页
class MarkdownListPage extends Component {
    /** 文档列表页 */
    constructor(container) {
        super(container);
        this.state = {
            docs: [],
            total: 0,
            page: 1,
            size: 20,
            keyword: '',
            filter: 'all', // 全部, 收藏, 公开
            loading: true
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const params = new URLSearchParams({
                page: this.state.page,
                size: this.state.size
            });

            if (this.state.keyword) {
                params.append('keyword', this.state.keyword);
            }
            if (this.state.filter === 'starred') {
                params.append('is_starred', 'true');
            }
            if (this.state.filter === 'public') {
                params.append('is_public', 'true');
            }

            const res = await Api.get(`/markdown/docs?${params}`);
            this.setState({
                docs: res.data.items,
                total: res.data.total,
                loading: false
            });
        } catch (e) {
            Toast.error('加载文档列表失败');
            this.setState({ loading: false });
        }
    }

    async loadStatistics() {
        try {
            const res = await Api.get('/markdown/statistics');
            this.setState({ stats: res.data });
        } catch (e) {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('加载统计信息失败', e);
        }
    }

    changePage(page) {
        this.setState({ page });
        this.loadData();
    }

    search() {
        const input = this.container.querySelector('#search-input');
        const keyword = input ? input.value.trim() : '';
        this.setState({ keyword, page: 1 });
        this.loadData();
    }

    changeFilter(filter) {
        this.setState({ filter, page: 1 });
        this.loadData();
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }

    render() {
        const { docs, total, page, size, filter, loading, stats } = this.state;
        const totalPages = Math.ceil(total / size);

        return `
            <div class="markdown-page">
                <div class="markdown-sidebar">
                    <div class="markdown-sidebar-header">
                        <h3 class="sidebar-title">
                            <i class="ri-file-text-line"></i>
                            Markdown
                        </h3>
                    </div>
                    
                    <nav class="markdown-nav">
                        <div class="nav-item ${filter === 'all' ? 'active' : ''}" data-filter="all">
                            <i class="ri-file-list-3-line"></i>
                            <span>所有文档</span>
                            <span class="nav-count">${stats?.total_docs || 0}</span>
                        </div>
                        <div class="nav-item ${filter === 'starred' ? 'active' : ''}" data-filter="starred">
                            <i class="ri-star-line"></i>
                            <span>我的收藏</span>
                            <span class="nav-count">${stats?.starred_docs || 0}</span>
                        </div>
                        <div class="nav-item ${filter === 'public' ? 'active' : ''}" data-filter="public">
                            <i class="ri-global-line"></i>
                            <span>公开文档</span>
                            <span class="nav-count">${stats?.public_docs || 0}</span>
                        </div>
                    </nav>
                    
                    <div class="markdown-sidebar-footer">
                        <button class="btn btn-primary btn-block" id="btn-new-doc">
                            <i class="ri-add-line"></i> 新建文档
                        </button>
                    </div>
                </div>
                
                <div class="markdown-main">
                    <div class="markdown-header">
                        <div class="markdown-title">
                            <h2>${filter === 'all' ? '所有文档' : filter === 'starred' ? '我的收藏' : '公开文档'}</h2>
                            <span class="doc-count">共 ${total} 篇文档</span>
                        </div>
                        <div class="markdown-actions">
                            <div class="search-group">
                                <input type="text" class="form-input" id="search-input" placeholder="搜索文档..." 
                                       value="${this.state.keyword || ''}">
                                <button class="btn btn-primary" id="btn-search">
                                    <i class="ri-search-line"></i> 查找
                                </button>
                            </div>
                            ${window.ModuleHelp ? window.ModuleHelp.createHelpButton('markdown', 'Markdown 编辑器') : ''}
                        </div>
                    </div>
                    
                    <div class="markdown-content">
                        ${loading ? `
                            <div class="loading-container">
                                <div class="loading-spinner"></div>
                                <p>加载中...</p>
                            </div>
                        ` : docs.length === 0 ? `
                            <div class="empty-state">
                                <i class="ri-file-text-line"></i>
                                <h3>暂无文档</h3>
                                <p>点击"新建文档"开始创作</p>
                            </div>
                        ` : `
                            <div class="doc-grid">
                                ${docs.map(doc => `
                                    <div class="doc-card" data-id="${doc.id}">
                                        <div class="doc-card-header">
                                            <h4 class="doc-title">${this.escapeHtml(doc.title)}</h4>
                                            <div class="doc-badges">
                                                ${doc.is_starred ? '<span class="badge badge-star"><i class="ri-star-fill"></i></span>' : ''}
                                                ${doc.is_public ? '<span class="badge badge-public"><i class="ri-global-line"></i></span>' : ''}
                                            </div>
                                        </div>
                                        <p class="doc-summary">${this.escapeHtml(doc.summary) || '暂无摘要'}</p>
                                        <div class="doc-footer">
                                            <span class="doc-time">
                                                <i class="ri-time-line"></i>
                                                ${this.formatDate(doc.updated_at)}
                                            </span>
                                            <span class="doc-views">
                                                <i class="ri-eye-line"></i>
                                                ${doc.view_count}
                                            </span>
                                            <div class="doc-actions">
                                                <button class="btn-icon btn-edit" data-id="${doc.id}" title="编辑">
                                                    <i class="ri-edit-line"></i>
                                                </button>
                                                <button class="btn-icon btn-star ${doc.is_starred ? 'starred' : ''}" data-id="${doc.id}" title="收藏">
                                                    <i class="ri-star-${doc.is_starred ? 'fill' : 'line'}"></i>
                                                </button>
                                                <button class="btn-icon btn-delete" data-id="${doc.id}" title="删除">
                                                    <i class="ri-delete-bin-line"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            
                            ${totalPages > 1 ? `
                                <div class="pagination">
                                    <button class="btn btn-sm ${page <= 1 ? 'disabled' : ''}" 
                                            onclick="this.getRootNode().host?.changePage?.(${page - 1})"
                                            ${page <= 1 ? 'disabled' : ''}>
                                        <i class="ri-arrow-left-line"></i>
                                    </button>
                                    <span class="page-info">${page} / ${totalPages}</span>
                                    <button class="btn btn-sm ${page >= totalPages ? 'disabled' : ''}"
                                            onclick="this.getRootNode().host?.changePage?.(${page + 1})"
                                            ${page >= totalPages ? 'disabled' : ''}>
                                        <i class="ri-arrow-right-line"></i>
                                    </button>
                                </div>
                            ` : ''}
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async afterMount() {
        await Promise.all([this.loadData(), this.loadStatistics()]);
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        // 新建文档
        const btnNew = this.container.querySelector('#btn-new-doc');
        if (btnNew) {
            btnNew.onclick = () => Router.push('/markdown/edit');
        }

        // 搜索按钮点击
        const btnSearch = this.container.querySelector('#btn-search');
        if (btnSearch) {
            btnSearch.onclick = () => this.search();
        }

        // 搜索输入框回车触发
        const searchInput = this.container.querySelector('#search-input');
        if (searchInput) {
            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    this.search();
                }
            };
        }

        // 筛选导航
        const navItems = this.container.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.onclick = () => {
                const filter = item.dataset.filter;
                this.changeFilter(filter);
            };
        });

        // 文档卡片点击
        const docCards = this.container.querySelectorAll('.doc-card');
        docCards.forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('.btn-icon')) return;
                const id = card.dataset.id;
                Router.push(`/markdown/view/${id}`);
            };
        });

        // 编辑按钮
        const editBtns = this.container.querySelectorAll('.btn-edit');
        editBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                Router.push(`/markdown/edit/${btn.dataset.id}`);
            };
        });

        // 收藏按钮
        const starBtns = this.container.querySelectorAll('.btn-star');
        starBtns.forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await Api.post(`/markdown/docs/${btn.dataset.id}/star`);
                    this.loadData();
                    this.loadStatistics();
                } catch (error) {
                    Toast.error('操作失败');
                }
            };
        });

        // 删除按钮
        const deleteBtns = this.container.querySelectorAll('.btn-delete');
        deleteBtns.forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const confirmed = await Modal.confirm({
                    title: '确认删除',
                    content: '删除后无法恢复，确定要删除这篇文档吗？',
                    type: 'danger'
                });
                if (confirmed) {
                    try {
                        await Api.delete(`/markdown/docs/${btn.dataset.id}`);
                        Toast.success('删除成功');
                        this.loadData();
                        this.loadStatistics();
                    } catch (error) {
                        Toast.error('删除失败');
                    }
                }
            };
        });

        // 分页按钮
        const prevBtn = this.container.querySelector('.pagination button:first-child');
        const nextBtn = this.container.querySelector('.pagination button:last-child');
        if (prevBtn) {
            prevBtn.onclick = () => this.changePage(this.state.page - 1);
        }
        if (nextBtn) {
            nextBtn.onclick = () => this.changePage(this.state.page + 1);
        }
    }
}

// Markdown 编辑页
class MarkdownEditPage extends Component {
    /** 文档编辑页 */
    constructor(container, docId = null) {
        super(container);
        this.docId = docId;
        this.editor = null;
        this.autoSaveTimer = null;
        this.editorReady = false;
        this.state = {
            doc: null,
            templates: [],
            loading: !!docId,
            saving: false,
            wordCount: 0,
            charCount: 0,
            titleManuallyEdited: false // 跟踪标题是否被手动编辑过
        };
    }

    async loadData() {
        try {
            // 收集所有数据后一次性 setState，避免多次 render 擦除编辑器
            const newState = {};

            // 加载模板（忽略错误）
            try {
                const templatesRes = await Api.get('/markdown/templates');
                newState.templates = templatesRes.data || [];
            } catch (e) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('加载模板失败', e);
            }

            // 加载文件列表
            try {
                const docsRes = await Api.get('/markdown/docs?size=50');
                newState.sidebarDocs = docsRes.data.items || [];
            } catch (e) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('加载侧边栏文档失败', e);
            }

            // 如果有 docId，加载文档
            if (this.docId) {
                const docRes = await Api.get(`/markdown/docs/${this.docId}`);
                newState.doc = docRes.data;
            }
            newState.loading = false;

            // 一次性更新状态，只触发一次 render
            this.setState(newState);
        } catch (e) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    getEditorContent() {
        // 从所见即所得编辑器获取
        if (this.editor && typeof this.editor.getMarkdown === 'function') {
            return this.editor.getMarkdown();
        }
        return '';
    }

    async handleSave(silent = false) {
        const titleInput = this.container.querySelector('#doc-title');
        const title = titleInput?.value?.trim();

        if (!title) {
            if (!silent) Toast.error('请输入文档标题');
            return;
        }

        const content = this.getEditorContent();
        const isPublic = this.container.querySelector('#doc-public')?.checked || false;

        // 直接操作 DOM 更新状态栏和保存按钮，避免 setState 触发全量 render 擦除编辑器
        const autosaveTag = this.container.querySelector('.autosave-tag');
        if (autosaveTag) {
            autosaveTag.innerHTML = '<i class="ri-loader-4-line spin"></i> 正在保存...';
            autosaveTag.classList.add('saving');
        }

        // 更新保存按钮状态（直接 DOM 操作，不触发 render）
        const btnSave = this.container.querySelector('#btn-save');
        if (!silent && btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="ri-loader-4-line spin"></i><span>保存中...</span>';
        }
        this.state.saving = true;

        try {
            const data = { title, content, is_public: isPublic };

            if (this.docId) {
                await Api.put(`/markdown/docs/${this.docId}`, data);
            } else {
                const res = await Api.post('/markdown/docs', data);
                this.docId = res.data.id;
                // 更新 URL
                const fullUrl = `#/markdown/edit/${this.docId}`;
                history.replaceState(null, '', fullUrl);
                // 同步更新窗口管理器的 URL 状态，防止触发冗余路由跳转
                if (window.WindowManager) {
                    const activeWin = window.WindowManager.getActiveWindow();
                    if (activeWin && activeWin.id.includes('markdown')) {
                        activeWin.url = fullUrl;
                    }
                }
            }

            // 更新内存中的数据，防止后续 render 渲染旧数据
            if (this.state.doc) {
                this.state.doc.title = title;
                this.state.doc.content = content;
                this.state.doc.is_public = isPublic;
            } else {
                this.state.doc = { id: this.docId, title, content, is_public: isPublic };
            }

            if (!silent) {
                Toast.success('保存成功');
            }

            if (autosaveTag) {
                autosaveTag.innerHTML = '<i class="ri-checkbox-circle-line"></i> 已保存';
                autosaveTag.classList.remove('saving');
                setTimeout(() => {
                    const currentTag = this.container.querySelector('.autosave-tag');
                    if (currentTag && currentTag.innerText.includes('已保存')) {
                        currentTag.innerHTML = '<i class="ri-checkbox-circle-line"></i> 自动保存已开启';
                    }
                }, 3000);
            }
        } catch (e) {
            if (!silent) Toast.error('保存失败: ' + (e.message || '未知错误'));
            if (autosaveTag) {
                autosaveTag.innerHTML = '<i class="ri-error-warning-line"></i> 保存失败';
                autosaveTag.style.color = 'var(--color-danger)';
            }
        } finally {
            this.state.saving = false;
            // 恢复保存按钮状态（直接 DOM 操作）
            if (!silent && btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i class="ri-save-line"></i><span>保存</span>';
            }
        }
    }

    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        // 保留一个长周期的兜底，防止意外
        this.autoSaveTimer = setInterval(() => {
            const titleInput = this.container.querySelector('#doc-title');
            const title = titleInput?.value?.trim();
            const isDefaultTitle = !title || title === '未命名文档' || title === '新建文档';

            if (!this.state.saving && this.editorReady && (this.docId || !isDefaultTitle)) {
                this.handleSave(true);
            }
        }, 300000); // 5分钟一次
    }

    triggerSmartSave() {
        if (!this.editorReady) return;

        const autosaveTag = this.container.querySelector('.autosave-tag');
        if (autosaveTag && !this.state.saving) {
            autosaveTag.innerHTML = '<i class="ri-edit-circle-line" style="color: var(--color-warning)"></i> 正在编辑...';
        }

        clearTimeout(this.smartSaveTimer);
        this.smartSaveTimer = setTimeout(() => {
            const titleInput = this.container.querySelector('#doc-title');
            const title = titleInput?.value?.trim();
            const isDefaultTitle = !title || title === '未命名文档' || title === '新建文档';

            // 只要不是默认标题或已经是存量文档，就允许自动保存
            if (!this.state.saving && (this.docId || !isDefaultTitle)) {
                this.handleSave(true);
            }
        }, 3000); // 停止输入3秒后自动保存
    }

    updateWordCount() {
        const content = this.getEditorContent();
        const charCount = content.replace(/\s/g, '').length;
        const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
        const wordCount = chineseChars + englishWords;

        const wordCountEl = this.container.querySelector('.word-count');
        if (wordCountEl) {
            wordCountEl.textContent = `${wordCount} 字 / ${charCount} 字符`;
        }

        // 同时更新大纲
        this.updateOutline();
    }

    updateOutline() {
        const content = this.getEditorContent();
        const lines = content.split('\n');
        const outline = [];

        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,3})\s+(.*)/);
            if (match) {
                outline.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    index: index
                });
            }
        });

        const outlinePanel = this.container.querySelector('#sidebar-outline');
        if (!outlinePanel) return;

        if (outline.length === 0) {
            outlinePanel.innerHTML = '<div class="empty-hint">暂无大纲</div>';
            return;
        }

        outlinePanel.innerHTML = `
            <div class="outline-list">
                ${outline.map(item => `
                    <div class="outline-item outline-h${item.level}" data-index="${item.index}">
                        ${this.escapeHtml(item.text)}
                    </div>
                `).join('')}
            </div>
        `;

        // 绑定大纲点击跳转
        outlinePanel.querySelectorAll('.outline-item').forEach(el => {
            el.onclick = () => {
                const index = parseInt(el.dataset.index);
                const editorEl = this.container.querySelector('.markdown-wysiwyg-editor');
                if (editorEl && editorEl.childNodes[index]) {
                    editorEl.childNodes[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    editorEl.childNodes[index].classList.add('active');
                }
            };
        });
    }

    initEditor() {
        const editorEl = this.container.querySelector('#markdown-editor');
        if (!editorEl || this.editorReady) return;

        const initialContent = this.state.doc?.content || '';
        const EditorClass = window.MarkdownWysiwygEditor;

        if (EditorClass) {
            try {
                this.editor = new EditorClass(editorEl, {
                    initialValue: initialContent,
                    placeholder: '开始创作...',
                    autofocus: true,
                    onChange: () => {
                        this.updateWordCount();
                        this.triggerSmartSave();
                    },
                    onTitleSync: (newTitle) => {
                        const titleInput = this.container.querySelector('#doc-title');
                        // 逻辑：如果标题未被手动编辑过，则持续同步
                        if (titleInput && !this.state.titleManuallyEdited) {
                            titleInput.value = newTitle;
                        }
                    }
                });

                this.editorReady = true;
                this.startAutoSave();
                this.updateWordCount();
            } catch (e) {
                (typeof Config !== 'undefined' && Config.error) && Config.error('编辑器初始化失败:', e);
                this.initFallbackEditor(editorEl, initialContent);
            }
        }
    }

    render() {
        const { doc, templates, loading, saving, sidebarDocs = [] } = this.state;

        if (loading) {
            return `
                <div class="markdown-editor-page wysiwyg-mode">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="markdown-editor-page wysiwyg-mode">
                <div class="editor-toolbar">
                    <div class="toolbar-left">
                        <button class="btn btn-icon btn-ghost" id="btn-back" title="返回">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <div class="title-container">
                            <input type="text" id="doc-title" class="title-input" 
                                   placeholder="未命名文档" 
                                   value="${this.escapeHtml(doc?.title || '')}">
                        </div>
                    </div>
                    
                    <div class="toolbar-center">
                        <div class="format-toolbar">
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="undo" title="撤销 (Ctrl+Z)">
                                    <i class="ri-arrow-go-back-line"></i>
                                </button>
                                <button class="toolbar-btn" data-action="redo" title="重做 (Ctrl+Y)">
                                    <i class="ri-arrow-go-forward-line"></i>
                                </button>
                            </div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="h1" title="一级标题">H1</button>
                                <button class="toolbar-btn" data-action="h2" title="二级标题">H2</button>
                                <button class="toolbar-btn" data-action="h3" title="三级标题">H3</button>
                            </div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="bold" title="粗体 (Ctrl+B)">
                                    <i class="ri-bold"></i>
                                </button>
                                <button class="toolbar-btn" data-action="italic" title="斜体 (Ctrl+I)">
                                    <i class="ri-italic"></i>
                                </button>
                                <button class="toolbar-btn" data-action="strikethrough" title="删除线">
                                    <i class="ri-strikethrough"></i>
                                </button>
                                <button class="toolbar-btn" data-action="code" title="行内代码 (Ctrl+\`) ">
                                    <i class="ri-code-line"></i>
                                </button>
                            </div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="ul" title="无序列表">
                                    <i class="ri-list-unordered"></i>
                                </button>
                                <button class="toolbar-btn" data-action="ol" title="有序列表">
                                    <i class="ri-list-ordered"></i>
                                </button>
                                <button class="toolbar-btn" data-action="task" title="任务列表">
                                    <i class="ri-checkbox-line"></i>
                                </button>
                            </div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="quote" title="引用">
                                    <i class="ri-double-quotes-l"></i>
                                </button>
                                <button class="toolbar-btn" data-action="codeblock" title="代码块">
                                    <i class="ri-code-box-line"></i>
                                </button>
                                <button class="toolbar-btn" data-action="link" title="链接 (Ctrl+K)">
                                    <i class="ri-link"></i>
                                </button>
                                <button class="toolbar-btn" data-action="image" title="图片">
                                    <i class="ri-image-line"></i>
                                </button>
                            </div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="table" title="表格">
                                    <i class="ri-table-line"></i>
                                </button>
                                <button class="toolbar-btn" data-action="hr" title="分割线">
                                    <i class="ri-separator"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="toolbar-right">
                        ${templates.length > 0 ? `
                            <div class="select-wrapper">
                                <select id="template-select" class="template-select">
                                    <option value="">快速模板</option>
                                    ${templates.map(t => `
                                        <option value="${t.id}">${t.is_system ? '📌 ' : ''}${this.escapeHtml(t.name)}</option>
                                    `).join('')}
                                </select>
                                <i class="ri-arrow-down-s-line"></i>
                            </div>
                        ` : ''}
                        
                        <div class="public-switch">
                            <label class="checkbox-label">
                                <input type="checkbox" id="doc-public" ${doc?.is_public ? 'checked' : ''}>
                                <span>公开</span>
                            </label>
                        </div>
                        
                        <button class="btn btn-primary btn-save" id="btn-save" ${saving ? 'disabled' : ''}>
                            <i class="${saving ? 'ri-loader-4-line spin' : 'ri-save-line'}"></i>
                            <span>${saving ? '保存中...' : '保存'}</span>
                        </button>
                    </div>
                </div>
                
                <div class="editor-main-layout">
                    <!-- 左侧文档列表 -->
                    <aside class="editor-sidebar" id="editor-sidebar">
                        <div class="sidebar-header">
                            <span>文档列表</span>
                        </div>
                        <div class="sidebar-panel active" id="sidebar-files">
                            <div class="tree-list">
                                ${sidebarDocs.map(d => `
                                    <div class="tree-item ${d.id == this.docId ? 'active' : ''}" data-id="${d.id}">
                                        <i class="ri-file-text-line"></i>
                                        <span>${this.escapeHtml(d.title)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </aside>
                    
                    <div class="btn-toggle-sidebar" id="btn-toggle-sidebar">
                        <i class="ri-arrow-left-s-line"></i>
                    </div>
 
                    <div class="editor-container">
                        <div id="markdown-editor" class="markdown-editor wysiwyg-editor"></div>
                    </div>

                    <!-- 右侧大纲列表 -->
                    <div class="btn-toggle-right-sidebar" id="btn-toggle-right-sidebar">
                        <i class="ri-arrow-right-s-line"></i>
                    </div>
                    <aside class="editor-right-sidebar" id="editor-right-sidebar">
                        <div class="sidebar-header">
                            <span>大纲</span>
                            <i class="ri-list-check"></i>
                        </div>
                        <div class="sidebar-panel active" id="sidebar-outline">
                            <div class="empty-hint">加载中...</div>
                        </div>
                    </aside>
                </div>
                
                <div class="editor-statusbar">
                    <div class="statusbar-left">
                        <span class="word-count">0 字 / 0 字符</span>
                    </div>
                    <div class="statusbar-right">
                        <span class="autosave-tag">
                            <i class="ri-checkbox-circle-line"></i> 自动保存已开启
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
    }

    afterUpdate() {
        // 核心修复：如果容器被重新渲染擦除，必须重新初始化编辑器
        const editorEl = this.container.querySelector('#markdown-editor');
        if (editorEl && !this.state.loading) {
            // 检查编辑器实例是否与当前 DOM 失联
            const needsReinit = !this.editorReady ||
                !this.editor ||
                !editorEl.contains(this.editor?.editor);
            if (needsReinit) {
                // 在销毁旧编辑器前，先捕获当前编辑器内容，防止重建后丢失
                if (this.editor && typeof this.editor.getMarkdown === 'function') {
                    try {
                        const currentContent = this.editor.getMarkdown();
                        if (currentContent && currentContent.trim()) {
                            if (this.state.doc) {
                                this.state.doc.content = currentContent;
                            } else {
                                this.state.doc = { content: currentContent };
                            }
                        }
                    } catch (e) {
                        // 编辑器可能已失联，忽略错误
                    }
                }
                // 同时保留标题输入框的值
                const titleInput = this.container.querySelector('#doc-title');
                if (titleInput && titleInput.value && this.state.doc) {
                    this.state.doc.title = titleInput.value;
                }
                this.editorReady = false;
                this.initEditor();
            }
        }
        this.bindEvents();
    }

    handleToolbarAction(action) {
        if (!this.editor) return;

        switch (action) {
            case 'undo':
                this.editor.undo();
                break;
            case 'redo':
                this.editor.redo();
                break;
            case 'h1':
                this.editor.insertHeading(1);
                break;
            case 'h2':
                this.editor.insertHeading(2);
                break;
            case 'h3':
                this.editor.insertHeading(3);
                break;
            case 'bold':
                this.editor.toggleFormat('bold');
                break;
            case 'italic':
                this.editor.toggleFormat('italic');
                break;
            case 'strikethrough':
                this.editor.toggleFormat('strikethrough');
                break;
            case 'code':
                this.editor.toggleFormat('code');
                break;
            case 'ul':
                this.editor.insertList('ul');
                break;
            case 'ol':
                this.editor.insertList('ol');
                break;
            case 'task':
                this.editor.insertTask();
                break;
            case 'quote':
                this.editor.insertBlockquote();
                break;
            case 'codeblock':
                this.editor.insertCodeBlock();
                break;
            case 'link':
                this.editor.insertLink();
                break;
            case 'image':
                this.editor.insertImage();
                break;
            case 'table':
                this.editor.insertTable();
                break;
            case 'hr':
                this.editor.insertHr();
                break;
        }
    }

    async applyTemplate(templateId) {
        try {
            const template = this.state.templates.find(t => t.id === templateId);
            if (template && this.editor) {
                const currentContent = this.editor.getMarkdown();
                const newContent = currentContent + '\n\n' + template.content;
                this.editor.setContent(newContent);
                Toast.success(`已应用模板: ${template.name}`);
            }
        } catch (e) {
            Toast.error('应用模板失败');
        }
    }

    bindEvents() {
        // 侧边栏展开收起
        const sidebar = this.container.querySelector('#editor-sidebar');
        const toggleBtn = this.container.querySelector('#btn-toggle-sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.onclick = () => {
                const isCollapsed = sidebar.classList.toggle('collapsed');
                toggleBtn.querySelector('i').className = isCollapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line';
            };
        }

        // 右侧大纲栏展开收起
        const rightSidebar = this.container.querySelector('#editor-right-sidebar');
        const toggleRightBtn = this.container.querySelector('#btn-toggle-right-sidebar');
        if (toggleRightBtn && rightSidebar) {
            toggleRightBtn.onclick = () => {
                const isCollapsed = rightSidebar.classList.toggle('collapsed');
                toggleRightBtn.querySelector('i').className = isCollapsed ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line';
            };
        }

        // 文档切换
        const treeItems = this.container.querySelectorAll('.tree-item');
        treeItems.forEach(item => {
            item.onclick = () => {
                const id = item.dataset.id;
                if (id == this.docId) return;
                Router.push(`/markdown/edit/${id}`);
            };
        });

        // 返回
        const btnBack = this.container.querySelector('#btn-back');
        if (btnBack && !btnBack._bindOnce) {
            btnBack._bindOnce = true;
            btnBack.onclick = () => Router.push('/markdown/list');
        }

        // 标题输入（直接修改 state 变量，不触发 setState/render，避免擦除编辑器）
        const titleInput = this.container.querySelector('#doc-title');
        if (titleInput && !titleInput._bindOnce) {
            titleInput._bindOnce = true;
            titleInput.oninput = () => {
                this.state.titleManuallyEdited = true;
                this.triggerSmartSave();
            };
        }

        // 保存按钮
        const btnSave = this.container.querySelector('#btn-save');
        if (btnSave && !btnSave._bindOnce) {
            btnSave._bindOnce = true;
            btnSave.onclick = () => this.handleSave();
        }

        // 工具栏按钮（阻止 mousedown 默认行为，防止编辑器失焦导致选区丢失）
        const toolbarBtns = this.container.querySelectorAll('.toolbar-btn');
        toolbarBtns.forEach(btn => {
            if (btn._bindOnce) return;
            btn._bindOnce = true;
            btn.onmousedown = (e) => e.preventDefault();
            btn.onclick = () => {
                const action = btn.dataset.action;
                if (action) {
                    this.handleToolbarAction(action);
                }
            };
        });

        // 模板选择
        const templateSelect = this.container.querySelector('#template-select');
        if (templateSelect && !templateSelect._bindOnce) {
            templateSelect._bindOnce = true;
            templateSelect.onchange = (e) => {
                if (e.target.value) {
                    this.applyTemplate(parseInt(e.target.value));
                    e.target.value = '';
                }
            };
        };

        // 导出按钮
        const btnExport = this.container.querySelector('#btn-export');
        if (btnExport && !btnExport._bindOnce) {
            btnExport._bindOnce = true;
            btnExport.onclick = async () => {
                const format = await Modal.select({
                    title: '导出文档',
                    options: [
                        { label: 'HTML 文件 (.html)', value: 'html' },
                        { label: 'Markdown 文件 (.md)', value: 'markdown' }
                    ]
                });
                if (format) {
                    try {
                        Toast.info('正在准备下载...', 2000);
                        const { blob, filename } = await Api.download(`/markdown/docs/${this.docId}/export?format=${format}`);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename || `${this.state.doc?.title || 'document'}.${format === 'markdown' ? 'md' : 'html'}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        Toast.success('下载开始');
                    } catch (error) {
                        (typeof Config !== 'undefined' && Config.error) && Config.error('导出失败:', error);
                        Toast.error('导出失败: ' + error.message);
                    }
                }
            };
        }

        // 快捷键保存 (Ctrl+S)
        if (!this._keydownBound) {
            this._keydownBound = true;
            this._keydownHandler = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.handleSave();
                }
            };
            document.addEventListener('keydown', this._keydownHandler);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        if (this.smartSaveTimer) {
            clearTimeout(this.smartSaveTimer);
            this.smartSaveTimer = null;
        }
        if (this.editor && typeof this.editor.destroy === 'function') {
            try {
                this.editor.destroy();
            } catch (e) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('销毁编辑器失败', e);
            }
            this.editor = null;
        }
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
        }
    }
}



// Markdown 查看页
class MarkdownViewPage extends Component {
    /** 文档查看页 */
    constructor(container, docId) {
        super(container);
        this.docId = docId;
        this.state = {
            doc: null,
            loading: true
        };
    }

    async loadData() {
        try {
            // 加载详情
            const res = await Api.get(`/markdown/docs/${this.docId}`);

            // 同时加载侧边栏文档列表
            let sidebarDocs = [];
            try {
                const docsRes = await Api.get('/markdown/docs?size=50');
                sidebarDocs = docsRes.data.items || [];
            } catch (e) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('加载侧边栏文档失败', e);
            }

            this.setState({
                doc: res.data,
                sidebarDocs: sidebarDocs,
                loading: false
            });
        } catch (e) {
            Toast.error('加载文档失败');
            this.setState({ loading: false });
        }
    }

    renderMarkdown(content) {
        if (!content) return '';
        // 纯净的 HTML 容器，交由 MarkdownWysiwygEditor 渲染
        return `<div id="markdown-viewer" class="markdown-body read-only"></div>`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    render() {
        const { doc, loading, sidebarDocs = [] } = this.state;

        if (loading) {
            return `
                <div class="markdown-view-page">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
            `;
        }

        if (!doc) {
            return `
                <div class="markdown-view-page">
                    <div class="empty-state">
                        <i class="ri-file-unknow-line"></i>
                        <h3>文档不存在</h3>
                        <button class="btn btn-primary" id="btn-back">返回列表</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="markdown-view-page wysiwyg-mode">
                <div class="view-toolbar">
                    <button class="btn btn-icon" id="btn-back" title="返回">
                        <i class="ri-arrow-left-line"></i>
                    </button>
                    <div class="view-info">
                        <h1 class="view-title">${this.escapeHtml(doc.title)}</h1>
                        <div class="view-meta">
                            <span><i class="ri-user-line"></i> ${doc.username || '未知用户'}</span>
                            <span><i class="ri-time-line"></i> ${this.formatDate(doc.updated_at)}</span>
                            <span><i class="ri-eye-line"></i> ${doc.view_count} 次阅读</span>
                        </div>
                    </div>
                    <div class="view-actions">
                        <button class="btn btn-icon" id="btn-star" title="${doc.is_starred ? '取消收藏' : '收藏'}">
                            <i class="ri-star-${doc.is_starred ? 'fill' : 'line'}"></i>
                        </button>
                        <button class="btn btn-icon" id="btn-export-view" title="导出">
                            <i class="ri-download-line"></i>
                        </button>
                        <button class="btn btn-primary" id="btn-edit">
                            <i class="ri-edit-line"></i> 编辑
                        </button>
                    </div>
                </div>
                
                <div class="editor-main-layout">
                    <!-- 左侧文档列表 -->
                    <aside class="editor-sidebar" id="view-sidebar">
                        <div class="sidebar-header">
                            <span>文档列表</span>
                        </div>
                        <div class="sidebar-panel active">
                            <div class="tree-list">
                                ${sidebarDocs.map(d => `
                                    <div class="tree-item ${d.id == this.docId ? 'active' : ''}" data-id="${d.id}">
                                        <i class="ri-file-text-line"></i>
                                        <span>${this.escapeHtml(d.title)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </aside>

                    <div class="btn-toggle-sidebar" id="btn-toggle-view-sidebar">
                        <i class="ri-arrow-left-s-line"></i>
                    </div>

                    <div class="view-content-wrapper" style="flex:1; overflow-y:auto; background: var(--color-bg-primary);">
                        <div class="view-content" style="max-width: 1100px; margin: 0 auto; padding: 40px 60px;">
                            ${this.renderMarkdown(doc.content)}
                        </div>
                    </div>

                    <!-- 右侧大纲列表 -->
                    <div class="btn-toggle-right-sidebar" id="btn-toggle-view-outline">
                        <i class="ri-arrow-right-s-line"></i>
                    </div>
                    <aside class="editor-right-sidebar" id="view-outline-sidebar">
                        <div class="sidebar-header">
                            <span>大纲</span>
                            <i class="ri-list-check"></i>
                        </div>
                        <div class="sidebar-panel active" id="sidebar-outline">
                            <div class="empty-hint">加载中...</div>
                        </div>
                    </aside>
                </div>
            </div>
        `;
    }

    updateOutline() {
        if (!this.state.doc?.content) return;
        const content = this.state.doc.content;
        const lines = content.split('\n');
        const outline = [];

        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,3})\s+(.*)/);
            if (match) {
                outline.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    index: index
                });
            }
        });

        const outlinePanel = this.container.querySelector('#sidebar-outline');
        if (!outlinePanel) return;

        if (outline.length === 0) {
            outlinePanel.innerHTML = '<div class="empty-hint">暂无大纲</div>';
            return;
        }

        outlinePanel.innerHTML = `
            <div class="outline-list">
                ${outline.map(item => `
                    <div class="outline-item outline-h${item.level}" data-index="${item.index}">
                        ${this.escapeHtml(item.text)}
                    </div>
                `).join('')}
            </div>
        `;

        // 绑定大纲点击跳转
        outlinePanel.querySelectorAll('.outline-item').forEach(el => {
            el.onclick = () => {
                const index = parseInt(el.dataset.index);
                const viewerEl = this.container.querySelector('#markdown-viewer');
                if (viewerEl && viewerEl.childNodes[index]) {
                    viewerEl.childNodes[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 高亮提示
                    viewerEl.childNodes[index].classList.add('active');
                    setTimeout(() => {
                        viewerEl.childNodes[index].classList.remove('active');
                    }, 2000);
                }
            };
        });
    }

    initViewer() {
        const viewerEl = this.container.querySelector('#markdown-viewer');
        if (!viewerEl || !this.state.doc?.content) return;

        // 每次 render 后强制重新挂载阅读器
        const EditorClass = window.MarkdownWysiwygEditor;
        if (EditorClass) {
            try {
                viewerEl.innerHTML = '';
                new EditorClass(viewerEl, {
                    initialValue: this.state.doc.content,
                    readOnly: true
                });
            } catch (e) {
                (typeof Config !== 'undefined' && Config.error) && Config.error('阅读器渲染失败:', e);
                viewerEl.innerText = this.state.doc.content;
            }
        } else {
            viewerEl.innerText = this.state.doc.content;
        }
    }

    async afterMount() {
        await this.loadData();
    }

    afterUpdate() {
        this.initViewer();
        this.updateOutline();
        this.bindEvents();
    }

    bindEvents() {
        // 侧边栏切换
        const sidebar = this.container.querySelector('#view-sidebar');
        const toggleBtn = this.container.querySelector('#btn-toggle-view-sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.onclick = () => {
                const isCollapsed = sidebar.classList.toggle('collapsed');
                toggleBtn.querySelector('i').className = isCollapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line';
            };
        }

        const rightSidebar = this.container.querySelector('#view-outline-sidebar');
        const toggleRightBtn = this.container.querySelector('#btn-toggle-view-outline');
        if (toggleRightBtn && rightSidebar) {
            toggleRightBtn.onclick = () => {
                const isCollapsed = rightSidebar.classList.toggle('collapsed');
                toggleRightBtn.querySelector('i').className = isCollapsed ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line';
            };
        }

        // 文档切换
        const treeItems = this.container.querySelectorAll('.tree-item');
        treeItems.forEach(item => {
            item.onclick = () => {
                const id = item.dataset.id;
                if (id == this.docId) return;
                Router.push(`/markdown/view/${id}`);
            };
        });

        const btnBack = this.container.querySelector('#btn-back');
        if (btnBack) {
            btnBack.onclick = () => Router.push('/markdown/list');
        }

        const btnEdit = this.container.querySelector('#btn-edit');
        if (btnEdit) {
            btnEdit.onclick = () => Router.push(`/markdown/edit/${this.docId}`);
        }

        const btnStar = this.container.querySelector('#btn-star');
        if (btnStar) {
            btnStar.onclick = async () => {
                try {
                    await Api.post(`/markdown/docs/${this.docId}/star`);
                    this.loadData();
                } catch (error) {
                    Toast.error('操作失败');
                }
            };
        }

        const btnExport = this.container.querySelector('#btn-export-view');
        if (btnExport) {
            btnExport.onclick = async () => {
                const format = await Modal.select({
                    title: '导出文档',
                    options: [
                        { label: 'HTML 文件 (.html)', value: 'html' },
                        { label: 'Markdown 文件 (.md)', value: 'markdown' }
                    ]
                });
                if (format) {
                    try {
                        Toast.info('正在准备下载...', 2000);
                        const { blob, filename } = await Api.download(`/markdown/docs/${this.docId}/export?format=${format}`);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename || `${this.state.doc?.title || 'document'}.${format === 'markdown' ? 'md' : 'html'}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        Toast.success('下载开始');
                    } catch (error) {
                        (typeof Config !== 'undefined' && Config.error) && Config.error('导出失败:', error);
                        Toast.error('导出失败: ' + error.message);
                    }
                }
            };
        }
    }
}


// 将 MarkdownListPage 导出到全局作用域以支持动态加载
window.MarkdownListPage = MarkdownListPage;

// 将 MarkdownEditPage 导出到全局作用域以支持动态加载
window.MarkdownEditPage = MarkdownEditPage;

// 将 MarkdownViewPage 导出到全局作用域以支持动态加载
window.MarkdownViewPage = MarkdownViewPage;
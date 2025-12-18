/**
 * 笔记页面
 */

// 笔记列表页
class NotesListPage extends Component {
    constructor(container, folderId = null) {
        super(container);
        this.folderId = folderId;
        this.state = {
            notes: [],
            folders: [],
            folderTree: [],
            currentFolder: null,
            total: 0,
            page: 1,
            size: 20,
            keyword: '',
            loading: true
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            // 加载文件夹树
            const treeRes = await NotesApi.getFolderTree();
            this.state.folderTree = treeRes.data;

            // 如果有当前文件夹，获取信息
            if (this.folderId) {
                const folderRes = await NotesApi.getFolder(this.folderId);
                this.state.currentFolder = folderRes.data;
            }

            // 加载笔记列表
            const params = {
                page: this.state.page,
                size: this.state.size
            };
            if (this.folderId) params.folder_id = this.folderId;
            if (this.state.keyword) params.keyword = this.state.keyword;

            const notesRes = await NotesApi.getNotes(params);

            this.setState({
                notes: notesRes.data.items,
                total: notesRes.data.total,
                loading: false
            });
        } catch (error) {
            Toast.error('加载失败');
            this.setState({ loading: false });
        }
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    search(keyword) {
        this.state.keyword = keyword;
        this.state.page = 1;
        this.loadData();
    }

    renderFolderTree(folders, level = 0) {
        return folders.map(folder => `
            <div class="folder-item ${this.folderId == folder.id ? 'active' : ''}" 
                 style="padding-left: ${16 + level * 16}px"
                 data-folder="${folder.id}">
                <span class="folder-icon">📁</span>
                <span class="folder-name">${Utils.escapeHtml(folder.name)}</span>
                <span class="folder-count">${folder.note_count}</span>
            </div>
            ${folder.children.length > 0 ? this.renderFolderTree(folder.children, level + 1) : ''}
        `).join('');
    }

    render() {
        const { notes, folderTree, currentFolder, total, page, size, keyword, loading } = this.state;
        const pages = Math.ceil(total / size);

        return `
            <div class="notes-page fade-in">
                <div class="notes-sidebar">
                    <div class="notes-nav">
                        <div class="folder-item ${!this.folderId ? 'active' : ''}" data-folder="">
                            <span class="folder-icon">📋</span>
                            <span class="folder-name">所有笔记</span>
                        </div>
                        <div class="folder-item" onclick="Router.push('/notes/starred')">
                            <span class="folder-icon">⭐</span>
                            <span class="folder-name">我的收藏</span>
                        </div>
                        <div class="folder-item" onclick="Router.push('/notes/tags')">
                            <span class="folder-icon">🏷️</span>
                            <span class="folder-name">标签管理</span>
                        </div>
                        <div class="divider" style="margin: 8px 16px; border-top: 1px solid var(--color-border); opacity: 0.5;"></div>
                        ${this.renderFolderTree(folderTree)}
                    </div>
                </div>
                
                <div class="notes-main">
                    <div class="notes-header">
                        <div class="notes-title">
                            <h2>${currentFolder ? Utils.escapeHtml(currentFolder.name) : '所有笔记'}</h2>
                            <span class="notes-count">${total} 条笔记</span>
                        </div>
                        
                        <div class="notes-actions" style="display: flex; gap: 8px; align-items: center;">
                            <div class="notes-search" style="margin-right: 8px;">
                                <input type="text" class="form-input" 
                                       style="width: 200px;"
                                       placeholder="搜索笔记..." 
                                       value="${Utils.escapeHtml(keyword)}"
                                       id="searchInput">
                            </div>
                            <button class="btn btn-primary" id="newNote">
                                ➕ 新建笔记
                            </button>
                            <button class="btn btn-secondary" id="newFolder">
                                📁 新建文件夹
                            </button>
                        </div>
                    </div>
                    
                    <div class="notes-list">
                        ${loading ? '<div class="loading"></div>' :
                notes.length > 0 ? notes.map(note => `
                            <div class="note-card" data-note="${note.id}">
                                <div class="note-card-header">
                                    <h3 class="note-title">
                                        ${note.is_pinned ? '<span class="tag tag-warning" style="margin-right:6px">置顶</span>' : ''}
                                        ${Utils.escapeHtml(note.title)}
                                    </h3>
                                    <div class="note-actions">
                                        <button class="btn btn-ghost btn-sm" data-star="${note.id}" title="${note.is_starred ? '取消收藏' : '收藏'}">
                                            ${note.is_starred ? '⭐' : '☆'}
                                        </button>
                                        <button class="btn btn-ghost btn-sm" data-pin="${note.id}" title="${note.is_pinned ? '取消置顶' : '置顶'}">
                                            ${note.is_pinned ? '📌' : '📍'}
                                        </button>
                                        <button class="btn btn-ghost btn-sm" data-edit-note="${note.id}" title="编辑">✏️</button>
                                        <button class="btn btn-ghost btn-sm" data-delete-note="${note.id}" title="删除">🗑️</button>
                                    </div>
                                </div>
                                <p class="note-summary">${Utils.escapeHtml(note.summary || '暂无内容')}</p>
                                <div class="note-meta">
                                    <span class="note-time">${Utils.timeAgo(note.updated_at)}</span>
                                    ${note.tags.length > 0 ? `
                                        <div class="note-tags">
                                            ${note.tags.map(tag => `
                                                <span class="tag" style="background: ${tag.color}">${Utils.escapeHtml(tag.name)}</span>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('') : `
                            <div class="empty-state">
                                <div class="empty-icon">📝</div>
                                <p class="empty-text">暂无笔记</p>
                            </div>
                        `}
                    </div>
                    
                    ${Utils.renderPagination(page, pages)}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedNotesList) {
            this.container._bindedNotesList = true;

            // 新建笔记
            this.delegate('click', '#newNote', () => {
                Router.push(this.folderId ? `/notes/edit?folder=${this.folderId}` : '/notes/edit');
            });

            // 新建文件夹
            this.delegate('click', '#newFolder', () => this.showFolderModal());

            // 文件夹点击
            this.delegate('click', '.folder-item[data-folder]', (e, target) => {
                const folderId = target.dataset.folder;
                Router.push(folderId ? `/notes/list/${folderId}` : '/notes/list');
            });

            // 笔记卡片点击（阅读页）
            this.delegate('click', '.note-card[data-note]', (e, target) => {
                if (!e.target.closest('button')) {
                    const noteId = target.dataset.note;
                    Router.push(`/notes/view/${noteId}`);
                }
            });

            // 收藏
            this.delegate('click', '[data-star]', async (e, target) => {
                e.stopPropagation();
                const id = target.dataset.star;
                try {
                    await NotesApi.toggleStar(id);
                    this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });

            // 置顶
            this.delegate('click', '[data-pin]', async (e, target) => {
                e.stopPropagation();
                const id = target.dataset.pin;
                try {
                    await NotesApi.togglePin(id);
                    this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });

            // 编辑笔记
            this.delegate('click', '[data-edit-note]', (e, target) => {
                e.stopPropagation();
                Router.push(`/notes/edit/${target.dataset.editNote}`);
            });

            // 删除笔记
            this.delegate('click', '[data-delete-note]', (e, target) => {
                e.stopPropagation();
                const id = target.dataset.deleteNote;
                Modal.confirm('删除笔记', '确定要删除这条笔记吗？', async () => {
                    try {
                        await NotesApi.deleteNote(id);
                        Toast.success('删除成功');
                        this.loadData();
                    } catch (error) {
                        Toast.error(error.message);
                    }
                });
            });

            // 分页
            this.delegate('click', '[data-page]', (e, target) => {
                const page = parseInt(target.dataset.page);
                if (page > 0) this.changePage(page);
            });

            // 搜索
            const searchInput = this.$('#searchInput');
            if (searchInput) {
                let timeout;
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => this.search(e.target.value), 300);
                });
            }
        }
    }

    showFolderModal(folder = null) {
        Modal.show({
            title: folder ? '编辑文件夹' : '新建文件夹',
            content: `
                <form id="folderForm">
                    <div class="form-group">
                        <label class="form-label">名称</label>
                        <input type="text" name="name" class="form-input" 
                               value="${folder ? Utils.escapeHtml(folder.name) : ''}"
                               placeholder="文件夹名称" required>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="saveFolder">保存</button>
            `
        });

        document.getElementById('saveFolder')?.addEventListener('click', async () => {
            const name = document.querySelector('#folderForm [name="name"]').value.trim();
            if (!name) {
                Toast.error('请输入文件夹名称');
                return;
            }

            try {
                const data = { name, parent_id: this.folderId || null };
                if (folder) {
                    await NotesApi.updateFolder(folder.id, data);
                } else {
                    await NotesApi.createFolder(data);
                }
                Toast.success(folder ? '更新成功' : '创建成功');
                Modal.closeAll();
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }
}


// 笔记编辑页
class NotesEditPage extends Component {
    constructor(container, noteId = null, folderId = null) {
        super(container);
        this.noteId = noteId;
        this.defaultFolderId = folderId;
        this.state = {
            note: null,
            folders: [],
            tags: [],
            loading: !!noteId,
            saving: false
        };
        this.autoSaveTimer = null;
    }

    async loadData() {
        try {
            const [foldersRes, tagsRes] = await Promise.all([
                NotesApi.getFolderTree(),
                NotesApi.getTags()
            ]);

            this.state.folders = this.flattenFolders(foldersRes.data);
            this.state.tags = tagsRes.data;

            if (this.noteId) {
                const noteRes = await NotesApi.getNote(this.noteId);
                this.state.note = noteRes.data;
            }

            this.setState({ loading: false });
        } catch (error) {
            Toast.error('加载失败');
            this.setState({ loading: false });
        }
    }

    flattenFolders(folders, level = 0, result = []) {
        for (const folder of folders) {
            result.push({ ...folder, level });
            if (folder.children.length > 0) {
                this.flattenFolders(folder.children, level + 1, result);
            }
        }
        return result;
    }

    async handleSubmit(e, options = { silent: false }) {
        e?.preventDefault();

        const form = this.$('#noteForm');
        if (!form) return; // 组件已卸载或表单不存在时不提交

        // 获取选中的标签
        const selectedTags = Array.from(form.querySelectorAll('input[name="tags"]:checked'))
            .map(cb => parseInt(cb.value));

        const data = {
            title: form.title.value.trim() || '无标题笔记',
            content: form.content.value,
            folder_id: form.folder_id.value ? parseInt(form.folder_id.value) : null,
            tags: selectedTags,
            is_starred: form.is_starred?.checked || false
        };

        this.setState({ saving: true });

        try {
            if (this.noteId) {
                await NotesApi.updateNote(this.noteId, data);
                if (!options.silent) {
                    Toast.success('保存成功');
                    Router.push(`/notes/view/${this.noteId}`);
                }
            } else {
                const res = await NotesApi.createNote(data);
                this.noteId = res.data.id;
                if (!options.silent) {
                    Toast.success('创建成功');
                    Router.push(`/notes/view/${this.noteId}`);
                } else {
                    // 更新URL但不刷新（保持自动保存体验）
                    history.replaceState(null, '', `#/notes/edit/${this.noteId}`);
                }
            }
        } catch (error) {
            Toast.error(error.message);
        } finally {
            this.setState({ saving: false });
        }
    }

    startAutoSave() {
        const form = this.$('#noteForm');
        if (form) {
            form.addEventListener('input', () => {
                clearTimeout(this.autoSaveTimer);
                this.autoSaveTimer = setTimeout(() => {
                    this.handleSubmit(null, { silent: true });
                }, 3000);
            });
        }
    }

    render() {
        const { note, folders, tags, loading, saving } = this.state;
        const isEdit = !!this.noteId;

        if (loading) {
            return '<div class="loading"></div>';
        }

        const folderId = note?.folder_id || this.defaultFolderId;

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">${isEdit ? '编辑笔记' : '新建笔记'}</h1>
                        <p class="page-desc">${saving ? '保存中...' : '自动保存已启用'}</p>
                    </div>
                    <div style="display: flex; gap: var(--spacing-md)">
                        <button class="btn btn-primary" id="saveNote" ${saving ? 'disabled' : ''}>
                            ${saving ? '保存中...' : '立即保存'}
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <form id="noteForm" class="card-body">
                        <div class="form-group">
                            <input type="text" name="title" class="form-input note-title-input" 
                                   value="${Utils.escapeHtml(note?.title || '')}"
                                   placeholder="笔记标题">
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--spacing-md); margin-bottom: var(--spacing-lg)">
                            <div class="form-group" style="margin-bottom: 0">
                                <select name="folder_id" class="form-input form-select">
                                    <option value="">根目录</option>
                                    ${folders.map(f => `
                                        <option value="${f.id}" ${folderId == f.id ? 'selected' : ''}>
                                            ${'　'.repeat(f.level)}📁 ${Utils.escapeHtml(f.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div></div>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input type="checkbox" name="is_starred" ${note?.is_starred ? 'checked' : ''}>
                                <span>⭐ 收藏</span>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">标签</label>
                            <div class="tags-selector" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); min-height: 50px;">
                                ${tags.length > 0 ? tags.map(tag => {
            const isSelected = note?.tags?.some(t => t.id === tag.id) || false;
            return `
                                        <label style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--radius-sm); cursor: pointer; transition: all var(--transition-fast); 
                                               ${isSelected ? `background: ${tag.color}; color: white;` : 'background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color);'}
                                               ${isSelected ? '' : 'opacity: 0.7;'}
                                               ${isSelected ? '' : '&:hover { opacity: 1; }'}" 
                                               onmouseover="this.style.opacity='1'" 
                                               onmouseout="${isSelected ? '' : "this.style.opacity='0.7'"}">
                                            <input type="checkbox" name="tags" value="${tag.id}" ${isSelected ? 'checked' : ''} 
                                                   style="display: none;">
                                            <span style="width: 12px; height: 12px; border-radius: 50%; background: ${tag.color}; flex-shrink: 0;"></span>
                                            <span>${Utils.escapeHtml(tag.name)}</span>
                                        </label>
                                    `;
        }).join('') : `
                                    <div style="color: var(--text-secondary); font-size: 0.875rem;">
                                        暂无标签，<a href="#/notes/tags" style="color: var(--primary); text-decoration: underline;">去创建标签</a>
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <textarea name="content" class="form-input note-content-input" rows="20"
                                      placeholder="开始写笔记...（支持 Markdown）">${Utils.escapeHtml(note?.content || '')}</textarea>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
        this.startAutoSave();
    }

    bindEvents() {
        const saveBtn = this.$('#saveNote');
        if (saveBtn && !saveBtn._bindedNotesEdit) {
            saveBtn._bindedNotesEdit = true;
            saveBtn.addEventListener('click', () => this.handleSubmit(null, { silent: false }));
        }

        // 标签选择器交互
        if (this.container && !this.container._bindedTagSelector) {
            this.container._bindedTagSelector = true;
            this.delegate('click', '.tags-selector label', (e, target) => {
                const checkbox = target.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    // 更新样式
                    if (checkbox.checked) {
                        const tagColor = target.querySelector('span[style*="background"]')?.style.background || '#3b82f6';
                        target.style.background = tagColor;
                        target.style.color = 'white';
                        target.style.opacity = '1';
                    } else {
                        target.style.background = 'var(--bg-tertiary)';
                        target.style.color = 'var(--text-primary)';
                        target.style.opacity = '0.7';
                    }
                }
            });
        }
    }

    destroy() {
        clearTimeout(this.autoSaveTimer);
        super.destroy();
    }
}


// 收藏笔记页
class NotesStarredPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            notes: [],
            total: 0,
            page: 1,
            size: 20,
            loading: true
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const res = await NotesApi.getStarredNotes({
                page: this.state.page,
                size: this.state.size
            });

            this.setState({
                notes: res.data.items,
                total: res.data.total,
                loading: false
            });
        } catch (error) {
            Toast.error('加载失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { notes, total, loading } = this.state;

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">⭐ 我的收藏</h1>
                    <p class="page-desc">${total} 条收藏笔记</p>
                </div>
                
                <div class="notes-grid">
                    ${loading ? '<div class="loading"></div>' :
                notes.length > 0 ? notes.map(note => `
                        <div class="note-card card" data-note="${note.id}">
                            <div class="card-body">
                                <h3 class="note-title">
                                    ${note.is_pinned ? '<span class="tag tag-warning" style="margin-right:6px">置顶</span>' : ''}
                                    ${Utils.escapeHtml(note.title)}
                                </h3>
                                <p class="note-summary">${Utils.escapeHtml(note.summary || '暂无内容')}</p>
                                <div class="note-meta">
                                    <span class="note-time">${Utils.timeAgo(note.updated_at)}</span>
                                    <div style="display:flex;gap:6px;">
                                        <button class="btn btn-ghost btn-sm" data-pin="${note.id}" title="${note.is_pinned ? '取消置顶' : '置顶'}">${note.is_pinned ? '📌' : '📍'}</button>
                                        <button class="btn btn-ghost btn-sm" data-unstar="${note.id}" title="取消收藏">取消收藏</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="empty-state" style="grid-column: 1/-1">
                            <div class="empty-icon">⭐</div>
                            <p class="empty-text">暂无收藏</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedStarred) {
            this.container._bindedStarred = true;

            this.delegate('click', '.note-card[data-note]', (e, target) => {
                if (!e.target.closest('button')) {
                    Router.push(`/notes/view/${target.dataset.note}`);
                }
            });

            this.delegate('click', '[data-unstar]', async (e, target) => {
                e.stopPropagation();
                try {
                    await NotesApi.toggleStar(target.dataset.unstar);
                    Toast.success('已取消收藏');
                    this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });

            this.delegate('click', '[data-pin]', async (e, target) => {
                e.stopPropagation();
                try {
                    await NotesApi.togglePin(target.dataset.pin);
                    this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }
    }
}


// 标签管理页
class NotesTagsPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            tags: [],
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await NotesApi.getTags();
            this.setState({ tags: res.data, loading: false });
        } catch (error) {
            Toast.error('加载失败');
            this.setState({ loading: false });
        }
    }

    showTagModal(tag = null) {
        Modal.show({
            title: tag ? '编辑标签' : '新建标签',
            content: `
                <form id="tagForm">
                    <div class="form-group">
                        <label class="form-label">名称</label>
                        <input type="text" name="name" class="form-input" 
                               value="${tag ? Utils.escapeHtml(tag.name) : ''}"
                               placeholder="标签名称" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">颜色</label>
                        <input type="color" name="color" class="form-input" 
                               value="${tag?.color || '#3b82f6'}"
                               style="height: 40px; padding: 4px">
                    </div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="saveTag">保存</button>
            `
        });

        document.getElementById('saveTag')?.addEventListener('click', async () => {
            const form = document.getElementById('tagForm');
            const name = form.name.value.trim();
            const color = form.color.value;

            if (!name) {
                Toast.error('请输入标签名称');
                return;
            }

            try {
                const tagId = tag?.id;
                if (tagId !== undefined && tagId !== null) {
                    await NotesApi.updateTag(tagId, { name, color });
                } else {
                    await NotesApi.createTag({ name, color });
                }
                Toast.success(tag ? '更新成功' : '创建成功');
                Modal.closeAll();
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }

    render() {
        const { tags, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">🏷️ 标签管理</h1>
                        <p class="page-desc">共 ${tags.length} 个标签</p>
                    </div>
                    <button class="btn btn-primary" id="newTag">➕ 新建标签</button>
                </div>
                
                <div class="card">
                    ${tags.length > 0 ? `
                        <div class="tags-grid">
                            ${tags.map(tag => `
                                <div class="tag-card">
                                    <span class="tag-color" style="background: ${tag.color}"></span>
                                    <span class="tag-name">${Utils.escapeHtml(tag.name)}</span>
                                    <div class="tag-actions">
                                        <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(tag)}'>✏️</button>
                                        <button class="btn btn-ghost btn-sm" data-delete="${tag.id}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-state">
                            <div class="empty-icon">🏷️</div>
                            <p class="empty-text">暂无标签</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        const newBtn = this.$('#newTag');
        if (newBtn && !newBtn._bindedTags) {
            newBtn._bindedTags = true;
            newBtn.addEventListener('click', () => this.showTagModal());
        }

        if (this.container && !this.container._bindedTagsList) {
            this.container._bindedTagsList = true;

            this.delegate('click', '[data-edit]', (e, target) => {
                const tag = JSON.parse(target.dataset.edit);
                this.showTagModal(tag);
            });

            this.delegate('click', '[data-delete]', (e, target) => {
                const id = target.dataset.delete;
                Modal.confirm('删除标签', '确定要删除这个标签吗？', async () => {
                    try {
                        await NotesApi.deleteTag(id);
                        Toast.success('删除成功');
                        this.loadData();
                    } catch (error) {
                        Toast.error(error.message);
                    }
                });
            });
        }
    }
}


// 笔记阅读页
class NotesViewPage extends Component {
    constructor(container, noteId) {
        super(container);
        this.noteId = noteId;
        this.state = {
            note: null,
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await NotesApi.getNote(this.noteId);
            this.setState({ note: res.data, loading: false });
        } catch (error) {
            Toast.error('加载笔记失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { note, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        if (!note) {
            return `
                <div class="page fade-in">
                    <div class="empty-state" style="padding-top:80px">
                        <div class="empty-icon">🔍</div>
                        <p class="empty-text">笔记不存在或已删除</p>
                        <button class="btn btn-primary" onclick="Router.push('/notes/list')">返回列表</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <h1 class="page-title">
                            ${note.is_pinned ? '<span class="tag tag-warning" style="margin-right:6px">置顶</span>' : ''}
                            ${note.is_starred ? '<span class="tag tag-primary" style="margin-right:6px">收藏</span>' : ''}
                            ${Utils.escapeHtml(note.title)}
                        </h1>
                        <p class="page-desc">
                            ${note.folder_id ? '所属目录 · ' : ''}${Utils.timeAgo(note.updated_at || note.created_at)}
                        </p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-secondary" id="backNote">返回</button>
                        <button class="btn btn-ghost" id="toggleStar" title="${note.is_starred ? '取消收藏' : '收藏'}">${note.is_starred ? '取消收藏' : '收藏'}</button>
                        <button class="btn btn-ghost" id="togglePin" title="${note.is_pinned ? '取消置顶' : '置顶'}">${note.is_pinned ? '取消置顶' : '置顶'}</button>
                        <button class="btn btn-primary" id="editNote">编辑</button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        ${note.tags && note.tags.length ? `
                            <div style="margin-bottom: 12px; display:flex; gap:6px; flex-wrap:wrap;">
                                ${note.tags.map(tag => `<span class="tag" style="background:${tag.color}">${Utils.escapeHtml(tag.name)}</span>`).join('')}
                            </div>
                        ` : ''}
                        <div class="markdown-body" style="white-space: pre-wrap; line-height:1.7;">
                            ${Utils.escapeHtml(note.content || '')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        const backBtn = this.$('#backNote');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.back());
        }

        const editBtn = this.$('#editNote');
        if (editBtn && !editBtn._bindedEdit) {
            editBtn._bindedEdit = true;
            editBtn.addEventListener('click', () => Router.push(`/notes/edit/${this.noteId}`));
        }

        const starBtn = this.$('#toggleStar');
        if (starBtn && !starBtn._bindedStar) {
            starBtn._bindedStar = true;
            starBtn.addEventListener('click', async () => {
                try {
                    await NotesApi.toggleStar(this.noteId);
                    await this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }

        const pinBtn = this.$('#togglePin');
        if (pinBtn && !pinBtn._bindedPin) {
            pinBtn._bindedPin = true;
            pinBtn.addEventListener('click', async () => {
                try {
                    await NotesApi.togglePin(this.noteId);
                    await this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }
    }
}


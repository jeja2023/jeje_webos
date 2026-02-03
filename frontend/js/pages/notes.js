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
            tags: [],             // 所有标签
            selectedTagId: null,  // 选中的标签 ID
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

            // 加载标签列表（用于筛选）
            const tagsRes = await NotesApi.getTags();
            this.state.tags = tagsRes.data || [];

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
            if (this.state.selectedTagId) params.tag_id = this.state.selectedTagId;

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
                <span class="folder-icon"><i class="ri-folder-line"></i></span>
                <span class="folder-name">${Utils.escapeHtml(folder.name)}</span>
                <span class="folder-count">${folder.note_count}</span>
                <div class="folder-actions">
                    <button class="btn btn-ghost btn-xs" data-edit-folder="${folder.id}" data-folder-name="${Utils.escapeHtml(folder.name)}" title="编辑"><i class="ri-edit-line"></i></button>
                    <button class="btn btn-ghost btn-xs" data-delete-folder="${folder.id}" title="删除"><i class="ri-delete-bin-line"></i></button>
                </div>
            </div>
            ${folder.children.length > 0 ? this.renderFolderTree(folder.children, level + 1) : ''}
        `).join('');
    }

    render() {
        const { notes, folderTree, currentFolder, tags, selectedTagId, total, page, size, keyword, loading } = this.state;
        const pages = Math.ceil(total / size);
        const selectedTag = selectedTagId ? tags.find(t => t.id == selectedTagId) : null;

        return `
            <div class="notes-page fade-in">
                <div class="notes-sidebar">
                    <div class="notes-nav">
                        <div class="folder-item ${!this.folderId ? 'active' : ''}" data-folder="">
                            <span class="folder-icon"><i class="ri-clipboard-line"></i></span>
                            <span class="folder-name">所有笔记</span>
                        </div>
                        <div class="folder-item" onclick="Router.push('/notes/starred')">
                            <span class="folder-icon"><i class="ri-star-line"></i></span>
                            <span class="folder-name">我的收藏</span>
                        </div>
                        <div class="folder-item" onclick="Router.push('/notes/tags')">
                            <span class="folder-icon"><i class="ri-price-tag-3-line"></i></span>
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
                            <span class="notes-count">${total} 条笔记${selectedTag ? ` · 标签: ${Utils.escapeHtml(selectedTag.name)}` : ''}</span>
                        </div>
                        
                        <div class="notes-actions" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            ${window.ModuleHelp ? ModuleHelp.createHelpButton('notes', '笔记') : ''}
                            <div class="search-group">
                                <input type="text" class="form-input" id="notesSearchInput" placeholder="搜索笔记..."
                                       value="${Utils.escapeHtml(keyword)}">
                                <button class="btn btn-primary" id="btnNotesSearch">
                                    <i class="ri-search-line"></i> 查找
                                </button>
                            </div>
                            ${tags.length > 0 ? `
                                <select class="form-input form-select" id="tagFilter" style="width: auto; min-width: 120px;">
                                    <option value="">全部标签</option>
                                    ${tags.map(tag => `
                                        <option value="${tag.id}" ${selectedTagId == tag.id ? 'selected' : ''}>
                                            ${Utils.escapeHtml(tag.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            ` : ''}
                            <button class="btn btn-primary" id="newNote">
                                <i class="ri-add-line"></i> 新建笔记
                            </button>
                            <button class="btn btn-secondary" id="newFolder">
                                <i class="ri-folder-add-line"></i> 新建文件夹
                            </button>
                        </div>
                    </div>
                    
                    <!-- 批量操作栏 -->
                    <div class="batch-toolbar" id="batchToolbar" style="display: none; padding: 12px 16px; background: var(--color-bg-secondary); border-bottom: 1px solid var(--color-border); align-items: center; gap: 12px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="selectAll"> 全选
                        </label>
                        <span id="selectedCount" style="color: var(--color-text-secondary);">已选 0 条</span>
                        <div style="flex: 1;"></div>
                        <button class="btn btn-ghost btn-sm" id="batchStar"><i class="ri-star-line"></i> 收藏</button>
                        <button class="btn btn-ghost btn-sm" id="batchMove"><i class="ri-folder-transfer-line"></i> 移动</button>
                        <button class="btn btn-danger btn-sm" id="batchDelete"><i class="ri-delete-bin-line"></i> 删除</button>
                        <button class="btn btn-ghost btn-sm" id="cancelBatch">取消</button>
                    </div>

                    <div class="notes-list">
                        ${loading ? '<div class="loading"></div>' :
                notes.length > 0 ? notes.map(note => `
                            <div class="note-card" data-note="${note.id}">
                                <div class="note-card-header">
                                    <label class="note-checkbox" style="display: none; margin-right: 8px;" onclick="event.stopPropagation()">
                                        <input type="checkbox" class="note-select" data-id="${note.id}">
                                    </label>
                                    <h3 class="note-title">
                                        ${note.is_pinned ? '<span class="tag tag-warning" style="margin-right:6px">置顶</span>' : ''}
                                        ${Utils.escapeHtml(note.title)}
                                    </h3>
                                    <div class="note-actions">
                                        <button class="btn btn-ghost btn-sm" data-star="${note.id}" title="${note.is_starred ? '取消收藏' : '收藏'}">
                                            <i class="${note.is_starred ? 'ri-star-fill' : 'ri-star-line'}"></i>
                                        </button>
                                        <button class="btn btn-ghost btn-sm" data-pin="${note.id}" title="${note.is_pinned ? '取消置顶' : '置顶'}">
                                            <i class="${note.is_pinned ? 'ri-pushpin-fill' : 'ri-pushpin-line'}"></i>
                                        </button>
                                        <button class="btn btn-ghost btn-sm" data-edit-note="${note.id}" title="编辑"><i class="ri-edit-line"></i></button>
                                        <button class="btn btn-ghost btn-sm" data-delete-note="${note.id}" title="删除"><i class="ri-delete-bin-line"></i></button>
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
                                <div class="empty-icon"><i class="ri-file-list-line"></i></div>
                                <p class="empty-text">${keyword || selectedTagId ? '没有找到匹配的笔记' : '暂无笔记'}</p>
                                ${keyword || selectedTagId ?
                    '<button class="btn btn-secondary" id="clearFilters">清除筛选</button>' :
                    '<button class="btn btn-primary" onclick="Router.push(\'/notes/edit\')">创建第一条笔记</button>'
                }
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
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    // 批量操作相关方法
    toggleBatchMode(enabled) {
        const toolbar = this.$('#batchToolbar');
        const checkboxes = this.container.querySelectorAll('.note-checkbox');

        if (toolbar) {
            toolbar.style.display = enabled ? 'flex' : 'none';
        }

        checkboxes.forEach(cb => {
            cb.style.display = enabled ? 'block' : 'none';
        });

        if (!enabled) {
            // 取消所有选择
            this.container.querySelectorAll('.note-select:checked').forEach(cb => {
                cb.checked = false;
            });
            const selectAll = this.$('#selectAll');
            if (selectAll) selectAll.checked = false;
            this.updateSelectedCount();
        }
    }

    updateSelectedCount() {
        const selected = this.container.querySelectorAll('.note-select:checked');
        const countEl = this.$('#selectedCount');
        if (countEl) {
            countEl.textContent = `已选 ${selected.length} 条`;
        }
    }

    getSelectedIds() {
        return [...this.container.querySelectorAll('.note-select:checked')].map(cb => cb.dataset.id);
    }

    async batchToggleStar() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Toast.warning('请先选择笔记');
            return;
        }

        try {
            for (const id of ids) {
                await NotesApi.toggleStar(id);
            }
            Toast.success(`已操作 ${ids.length} 条笔记`);
            this.toggleBatchMode(false);
            this.loadData();
        } catch (error) {
            Toast.error(error.message);
        }
    }

    async batchDelete() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Toast.warning('请先选择笔记');
            return;
        }

        Modal.confirm('批量删除', `确定要删除选中的 ${ids.length} 条笔记吗？此操作不可恢复。`, async () => {
            try {
                for (const id of ids) {
                    await NotesApi.deleteNote(id);
                }
                Toast.success(`已删除 ${ids.length} 条笔记`);
                this.toggleBatchMode(false);
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }

    showMoveModal() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Toast.warning('请先选择笔记');
            return;
        }

        // 构建文件夹选项
        const buildOptions = (folders, level = 0) => {
            return folders.map(folder => `
                <option value="${folder.id}">${'　'.repeat(level)}📁 ${Utils.escapeHtml(folder.name)}</option>
                ${folder.children ? buildOptions(folder.children, level + 1) : ''}
            `).join('');
        };

        Modal.show({
            title: `移动 ${ids.length} 条笔记`,
            content: `
                <div class="form-group">
                    <label class="form-label">选择目标文件夹</label>
                    <select class="form-input form-select" id="targetFolder">
                        <option value="">根目录</option>
                        ${buildOptions(this.state.folderTree)}
                    </select>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="confirmMove">移动</button>
            `
        });

        document.getElementById('confirmMove')?.addEventListener('click', async () => {
            const targetFolderId = document.getElementById('targetFolder')?.value || null;
            try {
                for (const id of ids) {
                    await NotesApi.moveNote(id, targetFolderId);
                }
                Toast.success(`已移动 ${ids.length} 条笔记`);
                Modal.closeAll();
                this.toggleBatchMode(false);
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
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

            // 文件夹点击（排除按钮点击）
            this.delegate('click', '.folder-item[data-folder]', (e, target) => {
                // 如果点击的是编辑或删除按钮，不切换文件夹
                if (e.target.closest('button')) return;
                const folderId = target.dataset.folder;
                Router.push(folderId ? `/notes/list/${folderId}` : '/notes/list');
            });

            // 编辑文件夹
            this.delegate('click', '[data-edit-folder]', (e, target) => {
                e.stopPropagation();
                const folderId = target.dataset.editFolder;
                const folderName = target.dataset.folderName;
                this.showFolderModal({ id: folderId, name: folderName });
            });

            // 删除文件夹
            this.delegate('click', '[data-delete-folder]', (e, target) => {
                e.stopPropagation();
                const folderId = target.dataset.deleteFolder;
                Modal.confirm('删除文件夹', '确定要删除这个文件夹吗？文件夹内的笔记也会被删除。', async () => {
                    try {
                        await NotesApi.deleteFolder(folderId);
                        Toast.success('删除成功');
                        // 如果正在查看被删除的文件夹，跳转到所有笔记
                        if (this.folderId == folderId) {
                            Router.push('/notes/list');
                        } else {
                            this.loadData();
                        }
                    } catch (error) {
                        Toast.error(error.message);
                    }
                });
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

            // 搜索按钮点击（使用事件委托）
            this.delegate('click', '#btnNotesSearch', () => {
                const input = this.$('#notesSearchInput');
                if (input) this.search(input.value.trim());
            });

            // 搜索输入框回车触发（使用事件委托）
            this.delegate('keydown', '#notesSearchInput', (e) => {
                if (e.key === 'Enter') {
                    this.search(e.target.value.trim());
                }
            });

            // 标签筛选器
            const tagFilter = this.$('#tagFilter');
            if (tagFilter && !tagFilter._bindedFilter) {
                tagFilter._bindedFilter = true;
                tagFilter.addEventListener('change', (e) => {
                    this.state.selectedTagId = e.target.value || null;
                    this.state.page = 1;
                    this.loadData();
                });
            }

            // 清除筛选
            this.delegate('click', '#clearFilters', () => {
                this.state.keyword = '';
                this.state.selectedTagId = null;
                this.state.page = 1;
                this.loadData();
            });

            // 批量操作：长按笔记卡片激活批量模式
            let longPressTimer = null;
            this.delegate('mousedown', '.note-card', (e) => {
                if (e.target.closest('button') || e.target.closest('.note-checkbox')) return;
                longPressTimer = setTimeout(() => {
                    this.toggleBatchMode(true);
                    const checkbox = e.target.closest('.note-card').querySelector('.note-select');
                    if (checkbox) checkbox.checked = true;
                    this.updateSelectedCount();
                }, 500);
            });

            this.delegate('mouseup', '.note-card', () => {
                clearTimeout(longPressTimer);
            });

            this.delegate('mouseleave', '.note-card', () => {
                clearTimeout(longPressTimer);
            });

            // 批量选择复选框
            this.delegate('change', '.note-select', () => {
                this.updateSelectedCount();
            });

            // 全选
            const selectAll = this.$('#selectAll');
            if (selectAll && !selectAll._bindedSelectAll) {
                selectAll._bindedSelectAll = true;
                selectAll.addEventListener('change', (e) => {
                    const checkboxes = this.container.querySelectorAll('.note-select');
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                    this.updateSelectedCount();
                });
            }

            // 批量操作按钮
            const batchStar = this.$('#batchStar');
            if (batchStar && !batchStar._binded) {
                batchStar._binded = true;
                batchStar.addEventListener('click', () => this.batchToggleStar());
            }

            const batchMove = this.$('#batchMove');
            if (batchMove && !batchMove._binded) {
                batchMove._binded = true;
                batchMove.addEventListener('click', () => this.showMoveModal());
            }

            const batchDelete = this.$('#batchDelete');
            if (batchDelete && !batchDelete._binded) {
                batchDelete._binded = true;
                batchDelete.addEventListener('click', () => this.batchDelete());
            }

            const cancelBatch = this.$('#cancelBatch');
            if (cancelBatch && !cancelBatch._binded) {
                cancelBatch._binded = true;
                cancelBatch.addEventListener('click', () => this.toggleBatchMode(false));
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

        // 获取表单数据
        const data = {
            title: form.title.value.trim() || '无标题笔记',
            content: form.content.value,
            folder_id: form.folder_id.value ? parseInt(form.folder_id.value) : null,
            tags: selectedTags,
            is_starred: form.is_starred?.checked || false
        };

        // 同步数据到 state，关键修复：防止 saving 状态变更触发 re-render 时清空输入框
        this.state.note = { ...this.state.note, ...data };
        this.setState({ saving: true });

        try {
            if (this.noteId) {
                await NotesApi.updateNote(this.noteId, data);
                if (!options.silent) {
                    Toast.success('已保存');
                }
            } else {
                const res = await NotesApi.createNote(data);
                this.noteId = res.data.id;
                // 更新 URL 中的 ID，但不触发路由刷新
                history.replaceState(null, '', `#/notes/edit/${this.noteId}`);

                if (!options.silent) {
                    Toast.success('已创建并保存');
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
        if (form && !form._autoSaveBinded) {
            form._autoSaveBinded = true;
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
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <button class="btn btn-ghost" id="btnBackToList" title="返回列表">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin: 0;">${isEdit ? '编辑笔记' : '新建笔记'}</h1>
                            <p class="page-desc" style="margin: 4px 0 0 0;">${saving ? '正在同步云端...' : '已自动保存'}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: var(--spacing-sm)">
                        ${isEdit ? `
                            <button class="btn btn-secondary" id="viewNote" title="预览笔记">
                                <i class="ri-eye-line"></i> 预览
                            </button>
                        ` : ''}
                        <button class="btn btn-primary" id="saveNote" ${saving ? 'disabled' : ''}>
                            ${saving ? '保存中...' : '<i class="ri-save-line"></i> 立即保存'}
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
                                <span><i class="ri-star-line"></i> 收藏</span>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">标签</label>
                            <div class="tags-selector" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary); min-height: 50px;">
                                ${tags.length > 0 ? tags.map(tag => {
            const isSelected = note?.tags?.some(t => t.id === tag.id) || false;
            return `
                                        <label style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--radius-sm); cursor: pointer; transition: all var(--transition-fast); 
                                               ${isSelected ? `background: ${tag.color}; color: var(--color-text-inverse);` : 'background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border);'}
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
                                    <div style="color: var(--color-text-secondary); font-size: 0.875rem;">
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
        // 返回按钮
        const backBtn = this.$('#btnBackToList');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => {
                // 如果有修改，先保存再返回
                if (this.noteId) {
                    this.handleSubmit(null, { silent: true }).then(() => {
                        Router.push('/notes/list');
                    });
                } else {
                    Router.push('/notes/list');
                }
            });
        }

        // 预览按钮
        const viewBtn = this.$('#viewNote');
        if (viewBtn && !viewBtn._bindedView) {
            viewBtn._bindedView = true;
            viewBtn.addEventListener('click', () => {
                // 先保存再预览
                this.handleSubmit(null, { silent: true }).then(() => {
                    Router.push(`/notes/view/${this.noteId}`);
                });
            });
        }

        // 保存按钮
        const saveBtn = this.$('#saveNote');
        if (saveBtn && !saveBtn._bindedNotesEdit) {
            saveBtn._bindedNotesEdit = true;
            saveBtn.addEventListener('click', () => this.handleSubmit(null, { silent: false }));
            this.startAutoSave();
        }

        // 快捷键支持
        if (!this.container._bindedKeyboard) {
            this.container._bindedKeyboard = true;
            document.addEventListener('keydown', this._keyboardHandler = (e) => {
                // Ctrl+S 保存
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.handleSubmit(null, { silent: false });
                }
                // Esc 返回
                if (e.key === 'Escape') {
                    Router.push('/notes/list');
                }
            });
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
                        target.style.color = 'var(--color-text-inverse)';
                        target.style.opacity = '1';
                    } else {
                        target.style.background = 'var(--color-bg-tertiary)';
                        target.style.color = 'var(--color-text-primary)';
                        target.style.opacity = '0.7';
                    }
                }
            });
        }
    }

    destroy() {
        clearTimeout(this.autoSaveTimer);
        // 清理键盘事件监听器
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
        }
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
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <button class="btn btn-ghost" id="btnBack" title="返回列表">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin: 0;">⭐ 我的收藏</h1>
                            <p class="page-desc" style="margin: 4px 0 0 0;">${total} 条收藏笔记</p>
                        </div>
                    </div>
                    <div class="page-nav-tabs">
                        <button class="btn btn-secondary" onclick="Router.push('/notes/list')">
                            📋 所有笔记
                        </button>
                        <button class="btn btn-secondary" onclick="Router.push('/notes/tags')">
                            🏷️ 标签管理
                        </button>
                    </div>
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
                            <button class="btn btn-primary" onclick="Router.push('/notes/list')">浏览笔记</button>
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

            // 返回按钮
            this.delegate('click', '#btnBack', () => {
                Router.push('/notes/list');
            });

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
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <button class="btn btn-ghost" id="btnBack" title="返回列表">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin: 0;"><i class="ri-price-tag-3-line"></i> 标签管理</h1>
                            <p class="page-desc" style="margin: 4px 0 0 0;">共 ${tags.length} 个标签</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-secondary" onclick="Router.push('/notes/list')">
                            <i class="ri-clipboard-line"></i> 所有笔记
                        </button>
                        <button class="btn btn-secondary" onclick="Router.push('/notes/starred')">
                            <i class="ri-star-line"></i> 我的收藏
                        </button>
                        <button class="btn btn-primary" id="newTag"><i class="ri-add-line"></i> 新建标签</button>
                    </div>
                </div>
                
                <div class="card">
                    ${tags.length > 0 ? `
                        <div class="tags-grid">
                            ${tags.map(tag => `
                                <div class="tag-card">
                                    <span class="tag-color" style="background: ${tag.color}"></span>
                                    <span class="tag-name">${Utils.escapeHtml(tag.name)}</span>
                                    <div class="tag-actions">
                                        <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(tag)}'><i class="ri-edit-line"></i></button>
                                        <button class="btn btn-ghost btn-sm" data-delete="${tag.id}"><i class="ri-delete-bin-line"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-price-tag-3-line"></i></div>
                            <p class="empty-text">暂无标签，创建标签来更好地组织笔记</p>
                            <button class="btn btn-primary" id="newTagEmpty"><i class="ri-add-line"></i> 创建第一个标签</button>
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
        // 返回按钮
        const backBtn = this.$('#btnBack');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.push('/notes/list'));
        }

        // 新建标签按钮
        const newBtn = this.$('#newTag');
        if (newBtn && !newBtn._bindedTags) {
            newBtn._bindedTags = true;
            newBtn.addEventListener('click', () => this.showTagModal());
        }

        // 空状态时的新建按钮
        const newBtnEmpty = this.$('#newTagEmpty');
        if (newBtnEmpty && !newBtnEmpty._bindedTagsEmpty) {
            newBtnEmpty._bindedTagsEmpty = true;
            newBtnEmpty.addEventListener('click', () => this.showTagModal());
        }

        if (this.container && !this.container._bindedTagsList) {
            this.container._bindedTagsList = true;

            this.delegate('click', '[data-edit]', (e, target) => {
                const tag = JSON.parse(target.dataset.edit);
                this.showTagModal(tag);
            });

            this.delegate('click', '[data-delete]', (e, target) => {
                const id = target.dataset.delete;
                Modal.confirm('删除标签', '确定要删除这个标签吗？删除后，已使用该标签的笔记不会丢失。', async () => {
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

    // 增强版 Markdown 渲染器
    renderMarkdown(text) {
        if (!text) return '';

        let html = Utils.escapeHtml(text);

        // 代码块（多行）- 先处理以避免被其他规则干扰
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre class="code-block" data-lang="${lang || 'text'}"><code>${code.trim()}</code></pre>`;
        });

        // 标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 粗体
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 斜体
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 删除线
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // 任务列表
        html = html.replace(/^- \[x\] (.+)$/gm, '<div class="task-item done"><i class="ri-checkbox-circle-fill"></i> $1</div>');
        html = html.replace(/^- \[ \] (.+)$/gm, '<div class="task-item"><i class="ri-checkbox-blank-circle-line"></i> $1</div>');

        // 无序列表
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // 有序列表
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // 引用块
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // 水平线
        html = html.replace(/^---$/gm, '<hr>');

        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 图片
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;">');

        // 换行
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><\/p>/g, '');

        return html;
    }

    // 导出为 Markdown 文件
    exportAsMarkdown() {
        const { note } = this.state;
        if (!note) return;

        let content = `# ${note.title}\n\n`;

        if (note.tags && note.tags.length) {
            content += `**标签**: ${note.tags.map(t => t.name).join(', ')}\n\n`;
        }

        content += `**创建时间**: ${new Date(note.created_at).toLocaleString()}\n`;
        content += `**更新时间**: ${new Date(note.updated_at).toLocaleString()}\n\n`;
        content += `---\n\n`;
        content += note.content || '';

        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title || '笔记'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Toast.success('导出成功');
    }

    // 复制笔记内容
    async copyContent() {
        const { note } = this.state;
        if (!note) return;

        try {
            await navigator.clipboard.writeText(note.content || '');
            Toast.success('已复制到剪贴板');
        } catch (error) {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = note.content || '';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            Toast.success('已复制到剪贴板');
        }
    }

    // 删除笔记
    deleteNote() {
        Modal.confirm('删除笔记', '确定要删除这条笔记吗？此操作不可恢复。', async () => {
            try {
                await NotesApi.deleteNote(this.noteId);
                Toast.success('删除成功');
                Router.push('/notes/list');
            } catch (error) {
                Toast.error(error.message);
            }
        });
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
                        <div class="empty-icon"><i class="ri-search-line"></i></div>
                        <p class="empty-text">笔记不存在或已删除</p>
                        <button class="btn btn-primary" onclick="Router.push('/notes/list')">返回列表</button>
                    </div>
                </div>
            `;
        }

        const wordCount = (note.content || '').length;
        const readTime = Math.ceil(wordCount / 300);

        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <button class="btn btn-ghost" id="backNote" title="返回">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:8px;">
                                ${note.is_pinned ? '<span class="tag tag-warning">置顶</span>' : ''}
                                ${note.is_starred ? '<span class="tag tag-primary"><i class="ri-star-fill"></i></span>' : ''}
                                ${Utils.escapeHtml(note.title)}
                            </h1>
                            <p class="page-desc" style="margin:4px 0 0 0;">
                                <span title="字数"><i class="ri-file-list-line"></i> ${wordCount} 字</span> · 
                                <span title="预计阅读时间"><i class="ri-time-line"></i> ${readTime} 分钟</span> · 
                                <span title="更新时间">${Utils.timeAgo(note.updated_at || note.created_at)}</span>
                            </p>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-ghost" id="toggleStar" title="${note.is_starred ? '取消收藏' : '收藏'}">
                            ${note.is_starred ? '<i class="ri-star-unfill"></i> 取消收藏' : '<i class="ri-star-line"></i> 收藏'}
                        </button>
                        <button class="btn btn-ghost" id="togglePin" title="${note.is_pinned ? '取消置顶' : '置顶'}">
                            ${note.is_pinned ? '<i class="ri-pushpin-2-fill"></i> 取消置顶' : '<i class="ri-pushpin-line"></i> 置顶'}
                        </button>
                        <button class="btn btn-ghost" id="copyNote" title="复制内容">
                            <i class="ri-clipboard-line"></i> 复制
                        </button>
                        <button class="btn btn-ghost" id="exportNote" title="导出为Markdown">
                            <i class="ri-download-line"></i> 导出
                        </button>
                        <button class="btn btn-primary" id="editNote">
                            <i class="ri-edit-line"></i> 编辑
                        </button>
                        <button class="btn btn-danger" id="deleteNote" title="删除笔记">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body note-view-content">
                        ${note.tags && note.tags.length ? `
                            <div class="note-tags-display" style="margin-bottom: 16px; display:flex; gap:8px; flex-wrap:wrap;">
                                ${note.tags.map(tag => `
                                    <span class="tag" style="background:${tag.color};color:#fff;padding:4px 12px;border-radius:16px;">
                                        ${Utils.escapeHtml(tag.name)}
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}
                        <div class="markdown-body">
                            ${this.renderMarkdown(note.content)}
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
        // 返回按钮
        const backBtn = this.$('#backNote');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.push('/notes/list'));
        }

        // 编辑按钮
        const editBtn = this.$('#editNote');
        if (editBtn && !editBtn._bindedEdit) {
            editBtn._bindedEdit = true;
            editBtn.addEventListener('click', () => Router.push(`/notes/edit/${this.noteId}`));
        }

        // 收藏按钮
        const starBtn = this.$('#toggleStar');
        if (starBtn && !starBtn._bindedStar) {
            starBtn._bindedStar = true;
            starBtn.addEventListener('click', async () => {
                try {
                    await NotesApi.toggleStar(this.noteId);
                    await this.loadData();
                    Toast.success(this.state.note?.is_starred ? '已收藏' : '已取消收藏');
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }

        // 置顶按钮
        const pinBtn = this.$('#togglePin');
        if (pinBtn && !pinBtn._bindedPin) {
            pinBtn._bindedPin = true;
            pinBtn.addEventListener('click', async () => {
                try {
                    await NotesApi.togglePin(this.noteId);
                    await this.loadData();
                    Toast.success(this.state.note?.is_pinned ? '已置顶' : '已取消置顶');
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }

        // 复制按钮
        const copyBtn = this.$('#copyNote');
        if (copyBtn && !copyBtn._bindedCopy) {
            copyBtn._bindedCopy = true;
            copyBtn.addEventListener('click', () => this.copyContent());
        }

        // 导出按钮
        const exportBtn = this.$('#exportNote');
        if (exportBtn && !exportBtn._bindedExport) {
            exportBtn._bindedExport = true;
            exportBtn.addEventListener('click', () => this.exportAsMarkdown());
        }

        // 删除按钮
        const deleteBtn = this.$('#deleteNote');
        if (deleteBtn && !deleteBtn._bindedDelete) {
            deleteBtn._bindedDelete = true;
            deleteBtn.addEventListener('click', () => this.deleteNote());
        }

        // 快捷键支持
        if (!this.container._bindedKeyboard) {
            this.container._bindedKeyboard = true;
            document.addEventListener('keydown', this._keyboardHandler = (e) => {
                // E 编辑
                if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea')) {
                    Router.push(`/notes/edit/${this.noteId}`);
                }
                // Esc 返回
                if (e.key === 'Escape') {
                    Router.push('/notes/list');
                }
            });
        }
    }

    destroy() {
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
        }
        super.destroy();
    }
}


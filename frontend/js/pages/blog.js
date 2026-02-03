/**
 * 博客页面
 */

// 文章列表页
class BlogListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            posts: [],
            categories: [],
            total: 0,
            page: 1,
            size: 10,
            keyword: '',
            categoryId: null,
            status: '',  // 'draft', 'published', '' (全部)
            loading: true,
            batchMode: false,
            selectedIds: new Set()
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            // 加载分类（用于筛选）
            const categoriesRes = await BlogApi.getCategories();
            this.state.categories = categoriesRes.data || [];

            // 获取文章列表
            const params = {
                page: this.state.page,
                size: this.state.size
            };
            if (this.state.keyword) params.keyword = this.state.keyword;
            if (this.state.categoryId) params.category_id = this.state.categoryId;
            if (this.state.status) params.status = this.state.status;

            const res = await BlogApi.getMyPosts(params);

            this.setState({
                posts: res.data.items,
                total: res.data.total,
                loading: false,
                selectedIds: new Set()
            });
        } catch (error) {
            Toast.error('加载文章失败');
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

    filterByCategory(categoryId) {
        this.state.categoryId = categoryId || null;
        this.state.page = 1;
        this.loadData();
    }

    filterByStatus(status) {
        this.state.status = status;
        this.state.page = 1;
        this.loadData();
    }

    toggleBatchMode(enabled) {
        this.setState({
            batchMode: enabled,
            selectedIds: new Set()
        });
    }

    toggleSelect(id) {
        const { selectedIds } = this.state;
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
        } else {
            selectedIds.add(id);
        }
        this.setState({ selectedIds });
    }

    selectAll(checked) {
        if (checked) {
            const allIds = new Set(this.state.posts.map(p => p.id.toString()));
            this.setState({ selectedIds: allIds });
        } else {
            this.setState({ selectedIds: new Set() });
        }
    }

    async batchDelete() {
        const ids = [...this.state.selectedIds];
        if (ids.length === 0) {
            Toast.warning('请先选择文章');
            return;
        }

        Modal.confirm('批量删除', `确定要删除选中的 ${ids.length} 篇文章吗？此操作不可恢复。`, async () => {
            try {
                for (const id of ids) {
                    await BlogApi.deletePost(id);
                }
                Toast.success(`已删除 ${ids.length} 篇文章`);
                this.toggleBatchMode(false);
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }

    render() {
        const { posts, categories, total, page, size, keyword, categoryId, status, loading, batchMode, selectedIds } = this.state;
        const pages = Math.ceil(total / size);
        const selectedCategory = categoryId ? categories.find(c => c.id == categoryId) : null;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h1 class="page-title"><i class="ri-article-line"></i> 文章管理</h1>
                        <p class="page-desc">
                            共 ${total} 篇文章
                            ${selectedCategory ? ` · 分类: ${Utils.escapeHtml(selectedCategory.name)}` : ''}
                            ${status === 'draft' ? ' · 草稿' : status === 'published' ? ' · 已发布' : ''}
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('blog', '博客') : ''}
                        <a href="#/blog/category" class="btn btn-ghost"><i class="ri-folder-line"></i> 分类管理</a>
                        <button class="btn btn-ghost" id="toggleBatch">
                            ${batchMode ? '取消批量' : '<i class="ri-checkbox-multiple-line"></i> 批量操作'}
                        </button>
                        <button class="btn btn-primary" onclick="Router.push('/blog/edit')">
                            <i class="ri-add-line"></i> 发布文章
                        </button>
                    </div>
                </div>

                <!-- 筛选栏 -->
                <div class="blog-filters card" style="padding: 16px; margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                    <div class="search-group">
                        <input type="text" class="form-input" id="blogSearchInput" 
                               placeholder="搜索文章标题..." value="${Utils.escapeHtml(keyword)}">
                        <button class="btn btn-primary" data-action="search">
                            <i class="ri-search-line"></i> 查找
                        </button>
                    </div>
                    <select class="form-input form-select" data-filter="category" style="width: auto; min-width: 120px;">
                        <option value="">全部分类</option>
                        ${categories.map(c => `
                            <option value="${c.id}" ${categoryId == c.id ? 'selected' : ''}>
                                ${Utils.escapeHtml(c.name)}
                            </option>
                        `).join('')}
                    </select>
                    <select class="form-input form-select" data-filter="status" style="width: auto; min-width: 100px;">
                        <option value="" ${!status ? 'selected' : ''}>全部状态</option>
                        <option value="published" ${status === 'published' ? 'selected' : ''}>已发布</option>
                        <option value="draft" ${status === 'draft' ? 'selected' : ''}>草稿</option>
                    </select>
                    ${keyword || categoryId || status ? `
                        <button class="btn btn-ghost btn-sm" data-action="clear-filters">清除筛选</button>
                    ` : ''}
                </div>

                <!-- 批量操作栏 -->
                ${batchMode ? `
                    <div class="batch-toolbar card" style="padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="selectAll" ${selectedIds.size === posts.length && posts.length > 0 ? 'checked' : ''}>
                            全选
                        </label>
                        <span style="color: var(--color-text-secondary);">已选 ${selectedIds.size} 篇</span>
                        <div style="flex: 1;"></div>
                        <button class="btn btn-danger btn-sm" id="batchDelete"><i class="ri-delete-bin-line"></i> 删除选中</button>
                    </div>
                ` : ''}
                
                ${posts.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        ${batchMode ? '<th style="width: 40px;"></th>' : ''}
                                        <th>标题</th>
                                        <th>分类</th>
                                        <th>状态</th>
                                        <th>浏览</th>
                                        <th>发布时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${posts.map(post => `
                                        <tr>
                                            ${batchMode ? `
                                                <td>
                                                    <input type="checkbox" class="post-select" 
                                                           data-id="${post.id}" 
                                                           ${selectedIds.has(post.id.toString()) ? 'checked' : ''}>
                                                </td>
                                            ` : ''}
                                            <td>
                                                <a href="#/blog/view/${post.id}" class="truncate" style="max-width: 300px; display: block">
                                                    ${post.is_top ? '<span class="tag tag-warning" style="margin-right: 4px">置顶</span>' : ''}
                                                    ${Utils.escapeHtml(post.title)}
                                                </a>
                                            </td>
                                            <td>${post.category?.name || '-'}</td>
                                            <td>
                                                <span class="tag ${post.status === 'published' ? 'tag-primary' : 'tag-info'}">
                                                    ${post.status === 'published' ? '已发布' : '草稿'}
                                                </span>
                                            </td>
                                            <td><i class="ri-eye-line"></i> ${post.views}</td>
                                            <td>${Utils.timeAgo(post.published_at || post.created_at)}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-view="${post.id}" title="查看"><i class="ri-eye-line"></i></button>
                                                <button class="btn btn-ghost btn-sm" data-edit="${post.id}" title="编辑"><i class="ri-edit-line"></i></button>
                                                <button class="btn btn-ghost btn-sm" data-toggle-top="${post.id}" title="${post.is_top ? '取消置顶' : '置顶'}">
                                                    <i class="${post.is_top ? 'ri-pushpin-fill' : 'ri-pushpin-line'}"></i>
                                                </button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${post.id}" title="删除"><i class="ri-delete-bin-line"></i></button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    ${Utils.renderPagination(page, pages)}
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-file-list-line"></i></div>
                            <p class="empty-text">${keyword || categoryId || status ? '没有找到匹配的文章' : '还没有文章，快去发布一篇吧'}</p>
                            ${keyword || categoryId || status ?
                '<button class="btn btn-secondary" data-action="clear-filters">清除筛选</button>' :
                '<button class="btn btn-primary" onclick="Router.push(\'/blog/edit\')">发布第一篇</button>'
            }
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        if (this.container && !this.container._bindedBlogList) {
            this.container._bindedBlogList = true;

            // 分页
            this.delegate('click', '[data-page]', (e, target) => {
                const page = parseInt(target.dataset.page);
                if (page > 0) this.changePage(page);
            });

            // 搜索按钮
            this.delegate('click', '[data-action="search"]', () => {
                const input = this.$('#blogSearchInput');
                if (input) this.search(input.value.trim());
            });

            // 搜索回车
            this.delegate('keydown', '#blogSearchInput', (e) => {
                if (e.key === 'Enter') {
                    this.search(e.target.value.trim());
                }
            });

            // 分类筛选
            this.delegate('change', '[data-filter="category"]', (e, target) => {
                this.filterByCategory(target.value);
            });

            // 状态筛选
            this.delegate('change', '[data-filter="status"]', (e, target) => {
                this.filterByStatus(target.value);
            });

            // 清除筛选
            this.delegate('click', '[data-action="clear-filters"]', () => {
                this.state.keyword = '';
                this.state.categoryId = null;
                this.state.status = '';
                this.state.page = 1;
                this.loadData();
            });

            // 批量模式切换
            this.delegate('click', '#toggleBatch', () => {
                this.toggleBatchMode(!this.state.batchMode);
            });

            // 全选
            this.delegate('change', '#selectAll', (e) => {
                this.selectAll(e.target.checked);
            });

            // 单选
            this.delegate('change', '.post-select', (e) => {
                this.toggleSelect(e.target.dataset.id);
            });

            // 批量删除
            this.delegate('click', '#batchDelete', () => {
                this.batchDelete();
            });

            // 查看
            this.delegate('click', '[data-view]', (e, target) => {
                Router.push(`/blog/view/${target.dataset.view}`);
            });

            // 编辑
            this.delegate('click', '[data-edit]', (e, target) => {
                Router.push(`/blog/edit/${target.dataset.edit}`);
            });

            // 置顶切换
            this.delegate('click', '[data-toggle-top]', async (e, target) => {
                const id = target.dataset.toggleTop;
                const post = this.state.posts.find(p => p.id == id);
                if (post) {
                    try {
                        await BlogApi.updatePost(id, { is_top: !post.is_top });
                        Toast.success(post.is_top ? '已取消置顶' : '已置顶');
                        this.loadData();
                    } catch (error) {
                        Toast.error(error.message);
                    }
                }
            });

            // 删除
            this.delegate('click', '[data-delete]', (e, target) => {
                const id = target.dataset.delete;
                Modal.confirm('删除文章', '确定要删除这篇文章吗？此操作不可恢复。', async () => {
                    try {
                        await BlogApi.deletePost(id);
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

// 文章编辑页
class BlogEditPage extends Component {
    constructor(container, postId = null) {
        super(container);
        this.postId = postId;
        this.state = {
            post: null,
            categories: [],
            tags: [],
            loading: !!postId,
            saving: false
        };
        this.autoSaveTimer = null;
    }

    async loadData() {
        try {
            const [categoriesRes, tagsRes] = await Promise.all([
                BlogApi.getCategories(),
                BlogApi.getTags()
            ]);

            this.state.categories = categoriesRes.data;
            this.state.tags = tagsRes.data;

            if (this.postId) {
                const postRes = await BlogApi.getPost(this.postId);
                this.state.post = postRes.data;
            }

            this.setState({ loading: false });
        } catch (error) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    async handleSubmit(e, options = {}) {
        if (e) e.preventDefault();
        const { silent = false } = options;

        const form = this.$('#postForm');
        if (!form) return;

        const data = {
            title: form.title.value.trim(),
            slug: form.slug.value.trim() || this.generateSlug(form.title.value),
            summary: form.summary.value.trim(),
            content: form.content.value,
            category_id: form.category_id.value ? parseInt(form.category_id.value) : null,
            status: form.status.value,
            is_top: form.is_top.checked
        };

        if (!data.title || !data.content) {
            if (!silent) Toast.error('请填写标题和内容');
            return;
        }

        this.setState({ saving: true });

        try {
            if (this.postId) {
                await BlogApi.updatePost(this.postId, data);
                if (!silent) {
                    Toast.success('更新成功');
                    Router.push(`/blog/view/${this.postId}`);
                }
            } else {
                const res = await BlogApi.createPost(data);
                this.postId = res.data?.id;
                if (!silent) {
                    Toast.success('发布成功');
                    Router.push(this.postId ? `/blog/view/${this.postId}` : '/blog/list');
                }
            }
        } catch (error) {
            if (!silent) Toast.error(error.message);
        } finally {
            this.setState({ saving: false });
        }
    }

    generateSlug(title) {
        return title.toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
    }

    startAutoSave() {
        if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = setInterval(() => {
            if (this.postId) {
                this.handleSubmit(null, { silent: true });
            }
        }, 30000); // 每30秒自动保存
    }

    render() {
        const { post, categories, loading, saving } = this.state;
        const isEdit = !!this.postId;
        const wordCount = (post?.content || '').length;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <button class="btn btn-ghost" id="btnBack">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin: 0;">${isEdit ? '编辑文章' : '发布文章'}</h1>
                            <p class="page-desc" style="margin: 4px 0 0 0;">
                                ${saving ? '保存中...' : (isEdit ? '自动保存已启用' : '填写完成后发布')}
                                ${wordCount > 0 ? ` · ${wordCount} 字` : ''}
                            </p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        ${isEdit ? `
                            <button class="btn btn-ghost" id="btnPreview"><i class="ri-eye-line"></i> 预览</button>
                        ` : ''}
                        <button type="submit" form="postForm" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                            ${saving ? '保存中...' : (isEdit ? '<i class="ri-save-line"></i> 更新文章' : '<i class="ri-send-plane-fill"></i> 发布文章')}
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <form id="postForm" class="card-body">
                        <div class="form-group">
                            <label class="form-label">标题 *</label>
                            <input type="text" name="title" class="form-input" 
                                   value="${Utils.escapeHtml(post?.title || '')}"
                                   placeholder="请输入文章标题" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">URL别名</label>
                            <input type="text" name="slug" class="form-input" 
                                   value="${Utils.escapeHtml(post?.slug || '')}"
                                   placeholder="留空自动生成">
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg)">
                            <div class="form-group">
                                <label class="form-label">分类</label>
                                <select name="category_id" class="form-input form-select">
                                    <option value="">选择分类</option>
                                    ${categories.map(c => `
                                        <option value="${c.id}" ${post?.category_id === c.id ? 'selected' : ''}>
                                            ${Utils.escapeHtml(c.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">状态</label>
                                <select name="status" class="form-input form-select">
                                    <option value="draft" ${post?.status === 'draft' ? 'selected' : ''}>草稿</option>
                                    <option value="published" ${post?.status === 'published' ? 'selected' : ''}>发布</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">摘要</label>
                            <textarea name="summary" class="form-input" rows="2"
                                      placeholder="文章摘要（可选，用于列表展示）">${Utils.escapeHtml(post?.summary || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">内容 * <span style="font-weight: normal; color: var(--color-text-tertiary)">（支持 Markdown）</span></label>
                            <textarea name="content" class="form-input" rows="18"
                                      placeholder="请输入文章内容..." required>${Utils.escapeHtml(post?.content || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input type="checkbox" name="is_top" ${post?.is_top ? 'checked' : ''}>
                                <span><i class="ri-pushpin-line"></i> 置顶文章</span>
                            </label>
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
    }

    bindEvents() {
        const form = this.$('#postForm');
        if (form && !form._bindedBlogEdit) {
            form._bindedBlogEdit = true;
            form.addEventListener('submit', (e) => this.handleSubmit(e));
            if (this.postId) {
                this.startAutoSave();
            }
        }

        // 返回按钮
        const backBtn = this.$('#btnBack');
        if (backBtn && !backBtn._binded) {
            backBtn._binded = true;
            backBtn.addEventListener('click', () => {
                if (this.postId) {
                    this.handleSubmit(null, { silent: true }).then(() => {
                        Router.push('/blog/list');
                    });
                } else {
                    Router.push('/blog/list');
                }
            });
        }

        // 预览按钮
        const previewBtn = this.$('#btnPreview');
        if (previewBtn && !previewBtn._binded) {
            previewBtn._binded = true;
            previewBtn.addEventListener('click', () => {
                this.handleSubmit(null, { silent: true }).then(() => {
                    Router.push(`/blog/view/${this.postId}`);
                });
            });
        }

        // 快捷键
        if (!this.container._bindedKeyboard) {
            this.container._bindedKeyboard = true;
            document.addEventListener('keydown', this._keyboardHandler = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.handleSubmit(null, { silent: false });
                }
                if (e.key === 'Escape') {
                    Router.push('/blog/list');
                }
            });
        }
    }

    destroy() {
        if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
        }
        super.destroy();
    }
}

// 分类管理页
class BlogCategoryPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            categories: [],
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await BlogApi.getCategories();
            this.setState({ categories: res.data, loading: false });
        } catch (error) {
            Toast.error('加载分类失败');
            this.setState({ loading: false });
        }
    }

    showAddModal(category = null) {
        Modal.show({
            title: category ? '编辑分类' : '添加分类',
            content: `
                <form id="categoryForm">
                    <div class="form-group">
                        <label class="form-label">名称 *</label>
                        <input type="text" name="name" class="form-input" 
                               value="${category ? Utils.escapeHtml(category.name) : ''}"
                               placeholder="分类名称" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">别名</label>
                        <input type="text" name="slug" class="form-input" 
                               value="${category ? Utils.escapeHtml(category.slug) : ''}"
                               placeholder="URL别名，留空自动生成">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea name="description" class="form-input" rows="2"
                                  placeholder="分类描述（可选）">${category ? Utils.escapeHtml(category.description || '') : ''}</textarea>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn btn-secondary" data-close>取消</button>
                <button class="btn btn-primary" id="saveCategory">保存</button>
            `
        });

        document.getElementById('saveCategory')?.addEventListener('click', async () => {
            const form = document.getElementById('categoryForm');
            const name = form.name.value.trim();
            const slug = form.slug.value.trim() || name.toLowerCase().replace(/\s+/g, '-');
            const description = form.description.value.trim();

            if (!name) {
                Toast.error('请输入分类名称');
                return;
            }

            try {
                if (category) {
                    await BlogApi.updateCategory(category.id, { name, slug, description });
                    Toast.success('更新成功');
                } else {
                    await BlogApi.createCategory({ name, slug, description });
                    Toast.success('添加成功');
                }
                Modal.closeAll();
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }

    render() {
        const { categories, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <button class="btn btn-ghost" id="btnBack">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin: 0;"><i class="ri-folder-line"></i> 分类管理</h1>
                            <p class="page-desc" style="margin: 4px 0 0 0;">共 ${categories.length} 个分类</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" id="addCategory">
                        <i class="ri-add-line"></i> 添加分类
                    </button>
                </div>
                
                <div class="card">
                    ${categories.length > 0 ? `
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>名称</th>
                                        <th>别名</th>
                                        <th>描述</th>
                                        <th>排序</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${categories.map(cat => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(cat.name)}</strong></td>
                                            <td><code>${Utils.escapeHtml(cat.slug)}</code></td>
                                            <td>${Utils.escapeHtml(cat.description || '-')}</td>
                                            <td>${cat.order}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(cat)}'><i class="ri-edit-line"></i> 编辑</button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${cat.id}"><i class="ri-delete-bin-line"></i> 删除</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-folder-2-line"></i></div>
                            <p class="empty-text">暂无分类</p>
                            <button class="btn btn-primary" id="addCategoryEmpty">创建第一个分类</button>
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
        if (backBtn && !backBtn._binded) {
            backBtn._binded = true;
            backBtn.addEventListener('click', () => Router.push('/blog/list'));
        }

        // 添加分类按钮
        this.delegate('click', '#addCategory, #addCategoryEmpty', () => {
            this.showAddModal();
        });

        // 编辑按钮
        if (this.container && !this.container._bindedCategoryEdit) {
            this.container._bindedCategoryEdit = true;

            this.delegate('click', '[data-edit]', (e, target) => {
                const category = JSON.parse(target.dataset.edit);
                this.showAddModal(category);
            });

            // 删除按钮
            this.delegate('click', '[data-delete]', (e, target) => {
                const id = target.dataset.delete;
                Modal.confirm('删除分类', '确定要删除这个分类吗？分类下的文章不会被删除。', async () => {
                    try {
                        await BlogApi.deleteCategory(id);
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


// 文章阅读页
class BlogViewPage extends Component {
    constructor(container, postId) {
        super(container);
        this.postId = postId;
        this.state = {
            post: null,
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await BlogApi.getPost(this.postId);
            this.setState({ post: res.data, loading: false });
        } catch (error) {
            Toast.error('加载文章失败');
            this.setState({ loading: false });
        }
    }

    // Markdown 渲染器
    renderMarkdown(text) {
        if (!text) return '';

        let html = Utils.escapeHtml(text);

        // 代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre class="code-block" data-lang="${lang || 'text'}"><code>${code.trim()}</code></pre>`;
        });

        // 标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 粗体、斜体
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 删除线
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // 引用
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // 列表
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

        // 水平线
        html = html.replace(/^---$/gm, '<hr>');

        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 换行
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><\/p>/g, '');

        return html;
    }

    async copyContent() {
        const { post } = this.state;
        if (!post) return;

        try {
            await navigator.clipboard.writeText(post.content || '');
            Toast.success('已复制到剪贴板');
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = post.content || '';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            Toast.success('已复制到剪贴板');
        }
    }

    render() {
        const { post, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        if (!post) {
            return `
                <div class="page fade-in">
                    <div class="empty-state" style="padding-top: 80px">
                        <div class="empty-icon"><i class="ri-search-line"></i></div>
                        <p class="empty-text">文章不存在或已删除</p>
                        <button class="btn btn-primary" onclick="Router.push('/blog/list')">返回列表</button>
                    </div>
                </div>
            `;
        }

        const wordCount = (post.content || '').length;
        const readTime = Math.ceil(wordCount / 300);

        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <button class="btn btn-ghost" id="backBlog">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:8px;">
                                ${post.is_top ? '<span class="tag tag-warning">置顶</span>' : ''}
                                ${post.status === 'draft' ? '<span class="tag tag-info">草稿</span>' : ''}
                                ${Utils.escapeHtml(post.title)}
                            </h1>
                            <p class="page-desc" style="margin:4px 0 0 0;">
                                ${post.category ? `<i class="ri-folder-line"></i> ${Utils.escapeHtml(post.category.name)} · ` : ''}
                                <i class="ri-file-text-line"></i> ${wordCount} 字 · 
                                <i class="ri-time-line"></i> ${readTime} 分钟 · 
                                <i class="ri-eye-line"></i> ${post.views} 次浏览 ·
                                ${Utils.timeAgo(post.updated_at || post.created_at)}
                            </p>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-ghost" id="copyPost"><i class="ri-clipboard-line"></i> 复制</button>
                        <button class="btn btn-ghost" id="toggleTop">${post.is_top ? '<i class="ri-pushpin-2-fill"></i> 取消置顶' : '<i class="ri-pushpin-line"></i> 置顶'}</button>
                        <button class="btn btn-primary" id="editBlog"><i class="ri-edit-line"></i> 编辑</button>
                        <button class="btn btn-danger" id="deletePost"><i class="ri-delete-bin-line"></i></button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="max-width: 800px; padding: var(--spacing-xl);">
                        ${post.tags && post.tags.length ? `
                            <div style="margin-bottom: 16px; display:flex; gap:8px; flex-wrap:wrap;">
                                ${post.tags.map(tag => `<span class="tag">${Utils.escapeHtml(tag.name)}</span>`).join('')}
                            </div>
                        ` : ''}
                        ${post.summary ? `
                            <div style="padding: 16px; background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: 24px; color: var(--color-text-secondary); font-style: italic;">
                                ${Utils.escapeHtml(post.summary)}
                            </div>
                        ` : ''}
                        <div class="markdown-body">
                            ${this.renderMarkdown(post.content)}
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
        const backBtn = this.$('#backBlog');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.push('/blog/list'));
        }

        // 编辑按钮
        const editBtn = this.$('#editBlog');
        if (editBtn && !editBtn._bindedEdit) {
            editBtn._bindedEdit = true;
            editBtn.addEventListener('click', () => Router.push(`/blog/edit/${this.postId}`));
        }

        // 复制按钮
        const copyBtn = this.$('#copyPost');
        if (copyBtn && !copyBtn._binded) {
            copyBtn._binded = true;
            copyBtn.addEventListener('click', () => this.copyContent());
        }

        // 置顶按钮
        const topBtn = this.$('#toggleTop');
        if (topBtn && !topBtn._binded) {
            topBtn._binded = true;
            topBtn.addEventListener('click', async () => {
                const { post } = this.state;
                try {
                    await BlogApi.updatePost(this.postId, { is_top: !post.is_top });
                    Toast.success(post.is_top ? '已取消置顶' : '已置顶');
                    this.loadData();
                } catch (error) {
                    Toast.error(error.message);
                }
            });
        }

        // 删除按钮
        const deleteBtn = this.$('#deletePost');
        if (deleteBtn && !deleteBtn._binded) {
            deleteBtn._binded = true;
            deleteBtn.addEventListener('click', () => {
                Modal.confirm('删除文章', '确定要删除这篇文章吗？此操作不可恢复。', async () => {
                    try {
                        await BlogApi.deletePost(this.postId);
                        Toast.success('删除成功');
                        Router.push('/blog/list');
                    } catch (error) {
                        Toast.error(error.message);
                    }
                });
            });
        }

        // 快捷键
        if (!this.container._bindedKeyboard) {
            this.container._bindedKeyboard = true;
            document.addEventListener('keydown', this._keyboardHandler = (e) => {
                if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea')) {
                    Router.push(`/blog/edit/${this.postId}`);
                }
                if (e.key === 'Escape') {
                    Router.push('/blog/list');
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



/**
 * 博客页面
 */

// 文章列表页
class BlogListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            posts: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            // 获取文章列表（管理员可查看所有，普通用户只能查看自己的）
            const res = await BlogApi.getMyPosts({
                page: this.state.page,
                size: this.state.size
            });

            this.setState({
                posts: res.data.items,
                total: res.data.total,
                loading: false
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

    render() {
        const { posts, total, page, size, loading } = this.state;
        const pages = Math.ceil(total / size);

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">文章列表</h1>
                        <p class="page-desc">共 ${total} 篇文章</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <a href="#/blog/category" class="btn btn-secondary">📁 分类管理</a>
                        <button class="btn btn-primary" onclick="Router.push('/blog/edit')">
                            ➕ 发布文章
                        </button>
                    </div>
                </div>
                
                ${posts.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
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
                                            <td>${post.views}</td>
                                            <td>${Utils.timeAgo(post.published_at || post.created_at)}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-edit="${post.id}">编辑</button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${post.id}">删除</button>
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
                            <div class="empty-icon">📝</div>
                            <p class="empty-text">还没有文章，快去发布一篇吧</p>
                        </div>
                    </div>
                `}
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
        // 使用事件委托，只需绑定一次
        if (this.container && !this.container._bindedBlogList) {
            this.container._bindedBlogList = true;

            // 分页
            this.delegate('click', '[data-page]', (e, target) => {
                const page = parseInt(target.dataset.page);
                if (page > 0) this.changePage(page);
            });

            // 编辑
            this.delegate('click', '[data-edit]', (e, target) => {
                Router.push(`/blog/edit/${target.dataset.edit}`);
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

    async handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
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
            Toast.error('请填写标题和内容');
            return;
        }

        this.setState({ saving: true });

        try {
            if (this.postId) {
                await BlogApi.updatePost(this.postId, data);
                Toast.success('更新成功');
                Router.push(`/blog/view/${this.postId}`);
            } else {
                const res = await BlogApi.createPost(data);
                const newId = res.data?.id;
                Toast.success('发布成功');
                Router.push(newId ? `/blog/view/${newId}` : '/blog/list');
            }
        } catch (error) {
            Toast.error(error.message);
        } finally {
            this.setState({ saving: false });
        }
    }

    generateSlug(title) {
        return title.toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
    }

    render() {
        const { post, categories, loading, saving } = this.state;
        const isEdit = !!this.postId;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">${isEdit ? '编辑文章' : '发布文章'}</h1>
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
                                      placeholder="文章摘要（可选）">${Utils.escapeHtml(post?.summary || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">内容 *</label>
                            <textarea name="content" class="form-input" rows="15"
                                      placeholder="请输入文章内容（支持 Markdown）" required>${Utils.escapeHtml(post?.content || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input type="checkbox" name="is_top" ${post?.is_top ? 'checked' : ''}>
                                <span>置顶文章</span>
                            </label>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg)">
                            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                                ${saving ? '保存中...' : (isEdit ? '更新文章' : '发布文章')}
                            </button>
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
        }
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

    showAddModal() {
        Modal.show({
            title: '添加分类',
            content: `
                <form id="categoryForm">
                    <div class="form-group">
                        <label class="form-label">名称</label>
                        <input type="text" name="name" class="form-input" placeholder="分类名称" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">别名</label>
                        <input type="text" name="slug" class="form-input" placeholder="URL别名">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <input type="text" name="description" class="form-input" placeholder="分类描述">
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
                await BlogApi.createCategory({ name, slug, description });
                Toast.success('添加成功');
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
                    <div>
                        <h1 class="page-title">分类管理</h1>
                        <p class="page-desc">管理博客文章分类</p>
                    </div>
                    <button class="btn btn-primary" id="addCategory">
                        ➕ 添加分类
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
                                            <td>${Utils.escapeHtml(cat.name)}</td>
                                            <td><code>${Utils.escapeHtml(cat.slug)}</code></td>
                                            <td>${Utils.escapeHtml(cat.description || '-')}</td>
                                            <td>${cat.order}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-delete="${cat.id}">删除</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div class="empty-state">
                            <div class="empty-icon">📁</div>
                            <p class="empty-text">暂无分类</p>
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
        // 添加分类按钮
        const addBtn = this.$('#addCategory');
        if (addBtn && !addBtn._bindedCategory) {
            addBtn._bindedCategory = true;
            addBtn.addEventListener('click', () => this.showAddModal());
        }

        // 删除按钮使用事件委托
        if (this.container && !this.container._bindedCategoryDelete) {
            this.container._bindedCategoryDelete = true;
            this.delegate('click', '[data-delete]', (e, target) => {
                const id = target.dataset.delete;
                Modal.confirm('删除分类', '确定要删除这个分类吗？', async () => {
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

    render() {
        const { post, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        if (!post) {
            return `
                <div class="page fade-in">
                    <div class="empty-state" style="padding-top: 80px">
                        <div class="empty-icon">🔍</div>
                        <p class="empty-text">文章不存在或已删除</p>
                        <button class="btn btn-primary" onclick="Router.push('/blog/list')">返回列表</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <h1 class="page-title">${post.title ? Utils.escapeHtml(post.title) : '未命名文章'}</h1>
                        <p class="page-desc">
                            ${post.category ? `分类：${Utils.escapeHtml(post.category.name)} · ` : ''}
                            ${post.status === 'published' ? '已发布' : '草稿'} ·
                            ${Utils.timeAgo(post.updated_at || post.created_at)}
                        </p>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-primary" id="editBlog">编辑文章</button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        ${post.tags && post.tags.length ? `
                            <div style="margin-bottom: 12px; display:flex; gap:6px; flex-wrap:wrap;">
                                ${post.tags.map(tag => `<span class="tag">${Utils.escapeHtml(tag.name)}</span>`).join('')}
                            </div>
                        ` : ''}
                        <div class="markdown-body" style="white-space: pre-wrap; line-height:1.6;">
                            ${Utils.escapeHtml(post.content || '')}
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
        const backBtn = this.$('#backBlog');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.back());
        }

        const editBtn = this.$('#editBlog');
        if (editBtn && !editBtn._bindedEdit) {
            editBtn._bindedEdit = true;
            editBtn.addEventListener('click', () => Router.push(`/blog/edit/${this.postId}`));
        }
    }
}



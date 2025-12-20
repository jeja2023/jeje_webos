/**
 * 公告管理页面
 */

// 公告列表页
class AnnouncementListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            announcements: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            filters: {
                is_published: '',
                type: '',
                keyword: ''
            }
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const params = {
                page: this.state.page,
                size: this.state.size
            };

            if (this.state.filters.is_published !== '') {
                params.is_published = this.state.filters.is_published === 'true';
            }
            if (this.state.filters.type) {
                params.type = this.state.filters.type;
            }
            if (this.state.filters.keyword) {
                params.keyword = this.state.filters.keyword;
            }

            const res = await AnnouncementApi.list(params);
            this.setState({
                announcements: res.data.items,
                total: res.data.total,
                loading: false
            });
        } catch (error) {
            Toast.error('加载公告列表失败');
            this.setState({ loading: false });
        }
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    handleFilter(key, value) {
        this.state.filters[key] = value;
        this.state.page = 1;
        this.loadData();
    }

    async handleDelete(id, title) {
        Modal.confirm('删除公告', `确定要删除公告 "${title}" 吗？此操作不可恢复。`, async () => {
            try {
                await AnnouncementApi.delete(id);
                Toast.success('删除成功');
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }

    getTypeLabel(type) {
        const types = {
            'info': { label: '信息', cls: 'tag-info' },
            'success': { label: '成功', cls: 'tag-primary' },
            'warning': { label: '警告', cls: 'tag-warning' },
            'error': { label: '错误', cls: 'tag-danger' }
        };
        return types[type] || { label: type, cls: 'tag-default' };
    }

    render() {
        const { announcements, total, page, size, loading, filters } = this.state;
        const pages = Math.ceil(total / size);

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">公告管理</h1>
                        <p class="page-desc">共 ${total} 条公告</p>
                    </div>
                    <button class="btn btn-primary" onclick="Router.push('/announcement/edit')">
                        ➕ 发布公告
                    </button>
                </div>
                
                <!-- 筛选器 -->
                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body" style="display: grid; grid-template-columns: 1fr 1fr 2fr auto; gap: var(--spacing-md); align-items: end">
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="filterStatus" value="${filters.is_published}">
                                <option value="">全部</option>
                                <option value="true" ${filters.is_published === 'true' ? 'selected' : ''}>已发布</option>
                                <option value="false" ${filters.is_published === 'false' ? 'selected' : ''}>未发布</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">类型</label>
                            <select class="form-input form-select" id="filterType" value="${filters.type}">
                                <option value="">全部</option>
                                <option value="info" ${filters.type === 'info' ? 'selected' : ''}>信息</option>
                                <option value="success" ${filters.type === 'success' ? 'selected' : ''}>成功</option>
                                <option value="warning" ${filters.type === 'warning' ? 'selected' : ''}>警告</option>
                                <option value="error" ${filters.type === 'error' ? 'selected' : ''}>错误</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">搜索</label>
                            <input type="text" class="form-input" id="annFilterKeyword" 
                                   placeholder="标题、内容" value="${filters.keyword || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label" style="visibility: hidden">操作</label>
                            <button class="btn btn-primary" id="searchBtn" style="width: 100%">搜索</button>
                        </div>
                    </div>
                </div>
                
                ${announcements.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>标题</th>
                                        <th>类型</th>
                                        <th>状态</th>
                                        <th>置顶</th>
                                        <th>浏览次数</th>
                                        <th>发布时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${announcements.map(announcement => {
            const typeInfo = this.getTypeLabel(announcement.type);
            return `
                                            <tr>
                                                <td>
                                                    ${announcement.is_top ? '<span class="tag tag-warning" style="margin-right: 4px">置顶</span>' : ''}
                                                    <a href="#/announcement/view/${announcement.id}" class="truncate" style="max-width: 300px; display: block">
                                                        ${Utils.escapeHtml(announcement.title)}
                                                    </a>
                                                </td>
                                                <td><span class="tag ${typeInfo.cls}">${typeInfo.label}</span></td>
                                                <td>
                                                    <span class="tag ${announcement.is_published ? 'tag-primary' : 'tag-default'}">
                                                        ${announcement.is_published ? '已发布' : '未发布'}
                                                    </span>
                                                </td>
                                                <td>${announcement.is_top ? '是' : '否'}</td>
                                                <td>${announcement.views}</td>
                                                <td>${Utils.formatDate(announcement.created_at)}</td>
                                                <td>
                                                    <button class="btn btn-ghost btn-sm" data-edit="${announcement.id}">编辑</button>
                                                    <button class="btn btn-ghost btn-sm" data-delete="${announcement.id}" data-title="${Utils.escapeHtml(announcement.title)}">删除</button>
                                                </td>
                                            </tr>
                                        `;
        }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    ${Utils.renderPagination(page, pages)}
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">📢</div>
                            <p class="empty-text">暂无公告</p>
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
        if (this.container && !this.container._bindedAnnouncementList) {
            this.container._bindedAnnouncementList = true;

            // 筛选器
            this.delegate('change', '#filterStatus', (e) => {
                this.handleFilter('is_published', e.target.value);
            });

            this.delegate('change', '#filterType', (e) => {
                this.handleFilter('type', e.target.value);
            });

            this.delegate('click', '#searchBtn', () => {
                const keyword = this.$('#annFilterKeyword')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            });

            // 分页
            this.delegate('click', '[data-page]', (e, target) => {
                const page = parseInt(target.dataset.page);
                if (page > 0) this.changePage(page);
            });

            // 编辑
            this.delegate('click', '[data-edit]', (e, target) => {
                Router.push(`/announcement/edit/${target.dataset.edit}`);
            });

            // 删除
            this.delegate('click', '[data-delete]', (e, target) => {
                const id = parseInt(target.dataset.delete);
                const title = target.dataset.title;
                if (id && title) this.handleDelete(id, title);
            });
        }
    }
}

// 公告编辑页
class AnnouncementEditPage extends Component {
    constructor(container, announcementId = null) {
        super(container);
        this.announcementId = announcementId;
        this.state = {
            announcement: null,
            loading: !!announcementId,
            saving: false
        };
    }

    async loadData() {
        if (!this.announcementId) {
            this.setState({ loading: false });
            return;
        }

        try {
            const res = await AnnouncementApi.get(this.announcementId);
            this.setState({ announcement: res.data, loading: false });
        } catch (error) {
            Toast.error('加载公告失败');
            this.setState({ loading: false });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const data = {
            title: form.title.value.trim(),
            content: form.content.value.trim(),
            type: form.type.value,
            is_published: form.is_published.checked,
            is_top: form.is_top.checked,
            start_at: form.start_at.value ? new Date(form.start_at.value).toISOString() : null,
            end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null
        };

        if (!data.title || !data.content) {
            Toast.error('请填写标题和内容');
            return;
        }

        this.setState({ saving: true });

        try {
            if (this.announcementId) {
                await AnnouncementApi.update(this.announcementId, data);
                Toast.success('更新成功');
                Router.push(`/announcement/view/${this.announcementId}`);
            } else {
                const res = await AnnouncementApi.create(data);
                const newId = res.data?.id;
                Toast.success('发布成功');
                Router.push(newId ? `/announcement/view/${newId}` : '/announcement/list');
            }
        } catch (error) {
            Toast.error(error.message);
        } finally {
            this.setState({ saving: false });
        }
    }

    render() {
        const { announcement, loading, saving } = this.state;
        const isEdit = !!this.announcementId;

        if (loading) {
            return '<div class="loading"></div>';
        }

        const formatDateTime = (dt) => {
            if (!dt) return '';
            const d = new Date(dt);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">${isEdit ? '编辑公告' : '发布公告'}</h1>
                </div>
                
                <div class="card">
                    <form id="announcementForm" class="card-body">
                        <div class="form-group">
                            <label class="form-label">标题 *</label>
                            <input type="text" name="title" class="form-input" 
                                   value="${Utils.escapeHtml(announcement?.title || '')}"
                                   placeholder="请输入公告标题" required>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg)">
                            <div class="form-group">
                                <label class="form-label">类型</label>
                                <select name="type" class="form-input form-select">
                                    <option value="info" ${announcement?.type === 'info' ? 'selected' : ''}>信息</option>
                                    <option value="success" ${announcement?.type === 'success' ? 'selected' : ''}>成功</option>
                                    <option value="warning" ${announcement?.type === 'warning' ? 'selected' : ''}>警告</option>
                                    <option value="error" ${announcement?.type === 'error' ? 'selected' : ''}>错误</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                    <input type="checkbox" name="is_published" ${announcement?.is_published ? 'checked' : ''}>
                                    <span>立即发布</span>
                                </label>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg)">
                            <div class="form-group">
                                <label class="form-label">开始时间（可选）</label>
                                <input type="datetime-local" name="start_at" class="form-input" 
                                       value="${formatDateTime(announcement?.start_at)}">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">结束时间（可选）</label>
                                <input type="datetime-local" name="end_at" class="form-input" 
                                       value="${formatDateTime(announcement?.end_at)}">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">内容 *</label>
                            <textarea name="content" class="form-input" rows="15"
                                      placeholder="请输入公告内容（支持 Markdown）" required>${Utils.escapeHtml(announcement?.content || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input type="checkbox" name="is_top" ${announcement?.is_top ? 'checked' : ''}>
                                <span>置顶公告</span>
                            </label>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg)">
                            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                                ${saving ? '保存中...' : (isEdit ? '更新公告' : '发布公告')}
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
        const form = this.$('#announcementForm');
        if (form && !form._bindedAnnouncementEdit) {
            form._bindedAnnouncementEdit = true;
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }
}

// 公告查看页
class AnnouncementViewPage extends Component {
    constructor(container, announcementId) {
        super(container);
        this.announcementId = announcementId;
        this.state = {
            announcement: null,
            loading: true
        };
    }

    async loadData() {
        try {
            const res = await AnnouncementApi.get(this.announcementId);
            this.setState({ announcement: res.data, loading: false });
            // 增加浏览次数
            AnnouncementApi.view(this.announcementId).catch(() => { });
        } catch (error) {
            Toast.error('加载公告失败');
            this.setState({ loading: false });
        }
    }

    getTypeLabel(type) {
        const types = {
            'info': { label: '信息', cls: 'tag-info' },
            'success': { label: '成功', cls: 'tag-primary' },
            'warning': { label: '警告', cls: 'tag-warning' },
            'error': { label: '错误', cls: 'tag-danger' }
        };
        return types[type] || { label: type, cls: 'tag-default' };
    }

    render() {
        const { announcement, loading } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        if (!announcement) {
            return `
                <div class="page fade-in">
                    <div class="empty-state" style="padding-top: 80px">
                        <div class="empty-icon">🔍</div>
                        <p class="empty-text">公告不存在或已删除</p>
                        <button class="btn btn-primary" onclick="Router.push('/announcement/list')">返回列表</button>
                    </div>
                </div>
            `;
        }

        const typeInfo = this.getTypeLabel(announcement.type);

        return `
            <div class="page fade-in">
                <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <h1 class="page-title">${announcement.title ? Utils.escapeHtml(announcement.title) : '未命名公告'}</h1>
                        <p class="page-desc">
                            <span class="tag ${typeInfo.cls}" style="margin-right: 8px">${typeInfo.label}</span>
                            ${announcement.is_published ? '已发布' : '未发布'} ·
                            ${Utils.timeAgo(announcement.updated_at || announcement.created_at)} ·
                            浏览 ${announcement.views} 次
                        </p>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-primary" id="editBtn">编辑公告</button>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-body">
                        <div class="markdown-body" style="white-space: pre-wrap; line-height:1.6;">
                            ${Utils.escapeHtml(announcement.content || '')}
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
        const backBtn = this.$('#backBtn');
        if (backBtn && !backBtn._bindedBack) {
            backBtn._bindedBack = true;
            backBtn.addEventListener('click', () => Router.back());
        }

        const editBtn = this.$('#editBtn');
        if (editBtn && !editBtn._bindedEdit) {
            editBtn._bindedEdit = true;
            editBtn.addEventListener('click', () => Router.push(`/announcement/edit/${this.announcementId}`));
        }
    }
}








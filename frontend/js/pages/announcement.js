/**
 * 公告管理页面
 * 包含公告列表、编辑、查看功能
 * 支持批量操作（删除、发布、取消发布）
 */

// 公告列表页
class AnnouncementListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            announcements: [],
            total: 0,
            page: 1,
            size: 20,
            filters: {
                is_published: '',
                type: '',
                keyword: ''
            },
            loading: true,
            selectedIds: [],      // 已选中的公告ID
            selectAll: false      // 是否全选
        };
    }

    async loadData() {
        this.setState({ loading: true, selectedIds: [], selectAll: false });
        try {
            const { page, size, filters } = this.state;
            const res = await AnnouncementApi.list(page, size, filters);
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
        this.setState({ page });
        this.loadData();
    }

    handleFilter(key, value) {
        this.state.filters[key] = value;
        this.state.page = 1;
        this.loadData();
    }

    // 切换单个选中状态
    toggleSelect(id) {
        const { selectedIds, announcements } = this.state;
        const newSelected = selectedIds.includes(id)
            ? selectedIds.filter(i => i !== id)
            : [...selectedIds, id];

        this.setState({
            selectedIds: newSelected,
            selectAll: newSelected.length === announcements.length
        });
    }

    // 切换全选状态
    toggleSelectAll() {
        const { selectAll, announcements } = this.state;
        if (selectAll) {
            this.setState({ selectedIds: [], selectAll: false });
        } else {
            this.setState({
                selectedIds: announcements.map(a => a.id),
                selectAll: true
            });
        }
    }

    // 批量操作
    async handleBatchAction(action) {
        const { selectedIds } = this.state;
        if (selectedIds.length === 0) {
            Toast.warning('请先选择公告');
            return;
        }

        const actionLabels = {
            'delete': '删除',
            'publish': '发布',
            'unpublish': '取消发布'
        };

        const title = `批量${actionLabels[action]}`;
        const content = `确定要${actionLabels[action]}选中的 ${selectedIds.length} 条公告吗？`;

        const confirmed = await Modal.confirm(title, content);

        if (confirmed) {
            try {
                const res = await AnnouncementApi.batch(selectedIds, action);
                Toast.success(`成功${actionLabels[action]} ${res.data?.affected || selectedIds.length} 条公告`);
                this.loadData();
            } catch (error) {
                Toast.error(`批量${actionLabels[action]}失败`);
            }
        }
    }

    async handleDelete(id, title) {
        const confirmed = await Modal.confirm(
            '确认删除',
            `确定要删除公告 "${title}" 吗？此操作无法撤销。`
        );

        if (confirmed) {
            try {
                await AnnouncementApi.delete(id);
                Toast.success('删除成功');
                this.loadData();
            } catch (error) {
                Toast.error('删除失败');
            }
        }
    }

    getTypeLabel(type) {
        const types = {
            'info': { label: '信息', cls: 'tag-info' },
            'success': { label: '成功', cls: 'tag-primary' },
            'warning': { label: '警告', cls: 'tag-warning' },
            'error': { label: '错误', cls: 'tag-danger' }
        };
        return {
            label: Utils.escapeHtml(types[type]?.label || type),
            cls: types[type]?.cls || 'tag-default'
        };
    }

    render() {
        const { announcements, total, page, size, filters, loading, selectedIds, selectAll } = this.state;
        const pages = Math.ceil(total / size);
        const hasSelected = selectedIds.length > 0;

        // 权限判断
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">公告管理</h1>
                        <p class="page-desc">共 ${total} 条公告${hasSelected ? `，已选择 ${selectedIds.length} 条` : ''}</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('announcement', '公告') : ''}
                        ${isAdmin ? `
                        <button class="btn btn-primary" data-route="/announcement/edit">
                            <i class="ri-add-line"></i> 发布公告
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <!-- 筛选器 -->
                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body" style="display: grid; grid-template-columns: 1fr 1fr 3fr; gap: var(--spacing-md);">
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="filterStatus">
                                <option value="" ${filters.is_published === '' ? 'selected' : ''}>全部</option>
                                <option value="true" ${filters.is_published === 'true' ? 'selected' : ''}>已发布</option>
                                <option value="false" ${filters.is_published === 'false' ? 'selected' : ''}>未发布</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">类型</label>
                            <select class="form-input form-select" id="filterType">
                                <option value="" ${filters.type === '' ? 'selected' : ''}>全部</option>
                                <option value="info" ${filters.type === 'info' ? 'selected' : ''}>信息</option>
                                <option value="success" ${filters.type === 'success' ? 'selected' : ''}>成功</option>
                                <option value="warning" ${filters.type === 'warning' ? 'selected' : ''}>警告</option>
                                <option value="error" ${filters.type === 'error' ? 'selected' : ''}>错误</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">搜索</label>
                            <div class="search-group">
                                <input type="text" class="form-input" id="annSearchInput" 
                                       placeholder="标题、内容" value="${filters.keyword || ''}">
                                <button class="btn btn-primary" id="annSearchBtn"><i class="ri-search-line"></i> 搜索</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 批量操作工具栏 -->
                ${hasSelected && isAdmin ? `
                    <div class="batch-toolbar" style="margin-bottom: var(--spacing-md); display: flex; gap: 8px; align-items: center; padding: 12px 16px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                        <span style="color: var(--text-secondary); margin-right: 8px;">
                            <i class="ri-checkbox-multiple-line"></i> 已选 <strong>${selectedIds.length}</strong> 项
                        </span>
                        <button class="btn btn-sm btn-success" id="batchPublish">
                            <i class="ri-send-plane-line"></i> 批量发布
                        </button>
                        <button class="btn btn-sm btn-secondary" id="batchUnpublish">
                            <i class="ri-inbox-archive-line"></i> 批量取消发布
                        </button>
                        <button class="btn btn-sm btn-danger" id="batchDelete">
                            <i class="ri-delete-bin-line"></i> 批量删除
                        </button>
                        <button class="btn btn-sm btn-ghost" id="clearSelection" style="margin-left: auto;">
                            <i class="ri-close-line"></i> 取消选择
                        </button>
                    </div>
                ` : ''}
                
                ${loading ? '<div class="loading"></div>' : announcements.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        ${isAdmin ? `
                                        <th style="width: 40px;">
                                            <input type="checkbox" id="selectAllCheckbox" ${selectAll ? 'checked' : ''}>
                                        </th>
                                        ` : ''}
                                        <th>标题</th>
                                        <th>摘要</th>
                                        <th>类型</th>
                                        <th>状态</th>
                                        <th>浏览</th>
                                        <th>发布时间</th>
                                        ${isAdmin ? '<th>操作</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${announcements.map(announcement => {
            const typeInfo = this.getTypeLabel(announcement.type);
            const isSelected = selectedIds.includes(announcement.id);
            return `
                                            <tr class="${isSelected ? 'row-selected' : ''}">
                                                ${isAdmin ? `
                                                <td>
                                                    <input type="checkbox" class="row-checkbox" 
                                                           data-id="${Utils.escapeHtml(String(announcement.id))}" 
                                                           ${isSelected ? 'checked' : ''}>
                                                </td>
                                                ` : ''}
                                                <td>
                                                    ${announcement.is_top ? '<span class="tag tag-warning" style="margin-right: 4px"><i class="ri-pushpin-fill"></i> 置顶</span>' : ''}
                                                    <a href="#/announcement/view/${Utils.escapeHtml(String(announcement.id))}" class="truncate" style="max-width: 200px; display: inline-block; vertical-align: middle;">
                                                        ${Utils.escapeHtml(announcement.title)}
                                                    </a>
                                                </td>
                                                <td>
                                                    <span class="text-muted truncate" style="max-width: 200px; display: inline-block; font-size: 12px;">
                                                        ${Utils.escapeHtml(announcement.summary || '')}
                                                    </span>
                                                </td>
                                                <td><span class="tag ${typeInfo.cls}">${typeInfo.label}</span></td>
                                                <td>
                                                    <span class="tag ${announcement.is_published ? 'tag-primary' : 'tag-default'}">
                                                        ${announcement.is_published ? '已发布' : '未发布'}
                                                    </span>
                                                </td>
                                                <td>${announcement.views}</td>
                                                <td>${Utils.formatDate(announcement.created_at)}</td>
                                                ${isAdmin ? `
                                                <td>
                                                    <button class="btn btn-ghost btn-sm btn-icon" data-edit="${Utils.escapeHtml(String(announcement.id))}" title="编辑">
                                                        <i class="ri-edit-line"></i>
                                                    </button>
                                                    <button class="btn btn-ghost btn-sm btn-icon" data-delete="${Utils.escapeHtml(String(announcement.id))}" data-title="${Utils.escapeHtml(announcement.title)}" title="删除">
                                                        <i class="ri-delete-bin-line"></i>
                                                    </button>
                                                </td>
                                                ` : ''}
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
                            <div class="empty-icon"><i class="ri-notification-off-line"></i></div>
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
        if (this.container && !this.container._bindedAnnouncementList) {
            this.container._bindedAnnouncementList = true;

            this.delegate('click', '[data-route]', (e, el) => Router.push(el.dataset.route));
            this.delegate('click', '[data-action="go-back"]', () => Router.back());

            // 筛选器
            this.delegate('change', '#filterStatus', (e) => {
                this.handleFilter('is_published', e.target.value);
            });

            this.delegate('change', '#filterType', (e) => {
                this.handleFilter('type', e.target.value);
            });

            this.delegate('click', '#annSearchBtn', () => {
                const keyword = this.$('#annSearchInput')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            });

            this.delegate('keydown', '#annSearchInput', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const keyword = this.$('#annSearchInput')?.value.trim() || '';
                    this.handleFilter('keyword', keyword);
                }
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

            // 全选
            this.delegate('change', '#selectAllCheckbox', () => {
                this.toggleSelectAll();
            });

            // 单选
            this.delegate('change', '.row-checkbox', (e, target) => {
                const id = parseInt(target.dataset.id);
                if (id) this.toggleSelect(id);
            });

            // 批量操作
            this.delegate('click', '#batchPublish', () => {
                this.handleBatchAction('publish');
            });

            this.delegate('click', '#batchUnpublish', () => {
                this.handleBatchAction('unpublish');
            });

            this.delegate('click', '#batchDelete', () => {
                this.handleBatchAction('delete');
            });

            // 取消选择
            this.delegate('click', '#clearSelection', () => {
                this.setState({ selectedIds: [], selectAll: false });
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
        this.editor = null;
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
        const content = this.editor ? this.editor.getMarkdown() : '';

        const data = {
            title: form.title.value.trim(),
            content: content,
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
                Router.replace('/announcement/list');
            } else {
                await AnnouncementApi.create(data);
                Toast.success('发布成功');
                Router.replace('/announcement/list');
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
                            <label class="form-label">标题 <span class="required">*</span></label>
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
                            <label class="form-label">内容 <span class="required">*</span></label>
                            <div class="editor-container-wrapper">
                                <div id="announcement-editor" style="height: 500px;"></div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input type="checkbox" name="is_top" ${announcement?.is_top ? 'checked' : ''}>
                                <span>置顶公告</span>
                            </label>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg)">
                            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                                <i class="${saving ? 'ri-loader-4-line spin' : 'ri-save-line'}"></i>
                                ${saving ? '保存中...' : (isEdit ? '更新公告' : '发布公告')}
                            </button>
                            <button type="button" class="btn btn-secondary" data-action="go-back">取消</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData().then(() => {
            this.initEditor();
        });
        this.bindEvents();
    }

    async initEditor() {
        try {
            // 动态加载 Markdown 编辑器资源
            await ResourceLoader.loadCSS('/static/css/pages/markdown/markdown_wysiwyg.css');
            await ResourceLoader.loadJS('/static/js/pages/markdown/markdown_wysiwyg.js');

            if (window.MarkdownWysiwygEditor) {
                const editorEl = this.container.querySelector('#announcement-editor');
                if (editorEl) {
                    this.editor = new window.MarkdownWysiwygEditor(editorEl, {
                        initialValue: this.state.announcement?.content || '',
                        placeholder: '请输入公告内容...',
                        autofocus: !this.announcementId, // 新建时自动聚焦
                        // 配置图片上传
                        uploadImage: async (file) => {
                            try {
                                const res = await StorageApi.upload(file);
                                if (res.code === 200 && res.data) {
                                    return res.data.url; // 返回图片 URL
                                }
                                throw new Error(res.message || '上传失败');
                            } catch (e) {
                                Toast.error('图片上传失败: ' + e.message);
                                throw e;
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error('加载编辑器失败', e);
            Toast.error('编辑器加载失败');
        }
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedAnnouncementEdit) {
            this.container._bindedAnnouncementEdit = true;

            const form = this.$('#announcementForm');
            if (form) {
                form.addEventListener('submit', (e) => this.handleSubmit(e));
            }

            this.delegate('click', '[data-route]', (e, el) => Router.push(el.dataset.route));
            this.delegate('click', '[data-action="go-back"]', () => Router.back());
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
        this.viewer = null;
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
            'info': { label: '信息', cls: 'tag-info', icon: 'ri-information-line' },
            'success': { label: '成功', cls: 'tag-primary', icon: 'ri-checkbox-circle-line' },
            'warning': { label: '警告', cls: 'tag-warning', icon: 'ri-error-warning-line' },
            'error': { label: '错误', cls: 'tag-danger', icon: 'ri-close-circle-line' }
        };
        return {
            label: Utils.escapeHtml(types[type]?.label || type),
            cls: types[type]?.cls || 'tag-default',
            icon: types[type]?.icon || 'ri-notification-line'
        };
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
                        <div class="empty-icon"><i class="ri-file-warning-line"></i></div>
                        <p class="empty-text">公告不存在或已删除</p>
                        <button class="btn btn-primary" data-route="/announcement/list">
                            <i class="ri-arrow-left-line"></i> 返回列表
                        </button>
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
                            <span class="tag ${typeInfo.cls}" style="margin-right: 8px">
                                <i class="${Utils.escapeHtml(typeInfo.icon)}"></i> ${typeInfo.label}
                            </span>
                            <span style="margin-right: 12px;">
                                <i class="ri-flag-${announcement.is_published ? 'fill' : 'line'}"></i>
                                ${announcement.is_published ? '已发布' : '未发布'}
                            </span>
                            <span style="margin-right: 12px;">
                                <i class="ri-time-line"></i>
                                ${Utils.timeAgo(announcement.updated_at || announcement.created_at)}
                            </span>
                            <span>
                                <i class="ri-eye-line"></i>
                                浏览 ${announcement.views} 次
                            </span>
                        </p>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-secondary" data-route="/announcement/list">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <button class="btn btn-primary" data-route="/announcement/edit/${this.announcementId}">
                            <i class="ri-edit-line"></i> 编辑公告
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-body">
                        <!-- 使用专门的 div 作为查看器容器 -->
                        <div id="announcement-viewer" class="markdown-body" style="min-height: 200px;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData().then(() => {
            this.initViewer();
        });
        this.bindEvents();
    }

    async initViewer() {
        try {
            // 动态加载 Markdown 资源
            await ResourceLoader.loadCSS('/static/css/pages/markdown/markdown_wysiwyg.css');
            await ResourceLoader.loadJS('/static/js/pages/markdown/markdown_wysiwyg.js');

            if (window.MarkdownWysiwygEditor) {
                const viewerEl = this.container.querySelector('#announcement-viewer');
                if (viewerEl && this.state.announcement) {
                    // 初始化为只读模式
                    this.viewer = new window.MarkdownWysiwygEditor(viewerEl, {
                        initialValue: this.state.announcement.content || '',
                        readOnly: true,
                        placeholder: ''
                    });
                }
            }
        } catch (e) {
            console.error('加载查看器失败', e);
        }
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedAnnouncementView) {
            this.container._bindedAnnouncementView = true;

            this.delegate('click', '[data-route]', (e, el) => Router.push(el.dataset.route));
            this.delegate('click', '[data-action="go-back"]', () => Router.back());
        }
    }
}

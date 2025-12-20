/**
 * 反馈模块前端页面
 */

// 基础工具
const FeedbackUI = {
    statusTag(status) {
        const map = {
            pending: { text: '待处理', cls: 'tag-warning' },
            processing: { text: '处理中', cls: 'tag-primary' },
            resolved: { text: '已解决', cls: 'tag-success' },
            closed: { text: '已关闭', cls: 'tag-default' }
        };
        const info = map[status] || { text: status, cls: 'tag-default' };
        return `<span class="tag ${info.cls}">${info.text}</span>`;
    },
    typeTag(type) {
        const map = {
            suggestion: { text: '建议', cls: 'tag-primary' },
            opinion: { text: '建议', cls: 'tag-info' },
            bug: { text: '问题', cls: 'tag-danger' },
            feature: { text: '需求', cls: 'tag-success' },
            other: { text: '其他', cls: 'tag-default' }
        };
        const info = map[type] || { text: type, cls: 'tag-default' };
        return `<span class="tag ${info.cls}">${info.text}</span>`;
    },
    priorityTag(priority) {
        const map = {
            low: { text: '低', cls: 'tag-default' },
            normal: { text: '普通', cls: 'tag-info' },
            high: { text: '高', cls: 'tag-warning' },
            urgent: { text: '紧急', cls: 'tag-danger' }
        };
        const info = map[priority] || { text: priority, cls: 'tag-default' };
        return `<span class="tag ${info.cls}">${info.text}</span>`;
    }
};

/**
 * 我的反馈列表
 */
class FeedbackListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            items: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            filters: {
                status: '',
                type: '',
                priority: '',
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
            const { status, type, priority, keyword } = this.state.filters;
            if (status) params.status = status;
            if (type) params.type = type;
            if (priority) params.priority = priority;
            if (keyword) params.keyword = keyword;

            const res = await FeedbackApi.list(params);
            this.setState({
                items: res.data.items || [],
                total: res.data.total || 0,
                loading: false
            });
        } catch (e) {
            Toast.error(e.message || '加载失败');
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
        Modal.confirm('删除反馈', `确定要删除 "${title}" 吗？删除后不可恢复。`, async () => {
            await FeedbackApi.remove(id);
            Toast.success('删除成功');
            this.loadData();
        });
    }

    async showDetail(id) {
        try {
            const res = await FeedbackApi.get(id);
            const item = res.data;
            const content = `
                <div class="detail-block">
                    <h4>${Utils.escapeHtml(item.title)}</h4>
                    <p style="margin-top: 8px; white-space: pre-wrap;">${Utils.escapeHtml(item.content)}</p>
                </div>
                <div class="detail-meta" style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px;">
                    <div>类型：${FeedbackUI.typeTag(item.type)}</div>
                    <div>优先级：${FeedbackUI.priorityTag(item.priority)}</div>
                    <div>状态：${FeedbackUI.statusTag(item.status)}</div>
                    <div>提交时间：${Utils.formatDate(item.created_at)}</div>
                    ${item.reply_content ? `<div style="grid-column: 1 / -1">回复：${Utils.escapeHtml(item.reply_content)}</div>` : ''}
                </div>
            `;
            await Modal.alert('反馈详情', content);
        } catch (e) {
            Toast.error(e.message || '获取详情失败');
        }
    }

    render() {
        const { items, total, page, size, loading, filters } = this.state;
        const pages = Math.ceil(total / size);

        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1 class="page-title">我的反馈</h1>
                        <p class="page-desc">共 ${total} 条反馈</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-primary" onclick="Router.push('/feedback/create')">➕ 提交反馈</button>
                        <button class="btn btn-ghost" onclick="Router.push('/feedback/list')">管理视图</button>
                    </div>
                </div>

                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: var(--spacing-md); align-items: end">
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="filterStatus" value="${filters.status}">
                                <option value="">全部</option>
                                <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待处理</option>
                                <option value="processing" ${filters.status === 'processing' ? 'selected' : ''}>处理中</option>
                                <option value="resolved" ${filters.status === 'resolved' ? 'selected' : ''}>已解决</option>
                                <option value="closed" ${filters.status === 'closed' ? 'selected' : ''}>已关闭</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">类型</label>
                            <select class="form-input form-select" id="filterType" value="${filters.type}">
                                <option value="">全部</option>
                                <option value="suggestion" ${filters.type === 'suggestion' ? 'selected' : ''}>建议</option>
                                <option value="opinion" ${filters.type === 'opinion' ? 'selected' : ''}>建议</option>
                                <option value="bug" ${filters.type === 'bug' ? 'selected' : ''}>问题</option>
                                <option value="feature" ${filters.type === 'feature' ? 'selected' : ''}>需求</option>
                                <option value="other" ${filters.type === 'other' ? 'selected' : ''}>其他</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">优先级</label>
                            <select class="form-input form-select" id="filterPriority" value="${filters.priority}">
                                <option value="">全部</option>
                                <option value="low" ${filters.priority === 'low' ? 'selected' : ''}>低</option>
                                <option value="normal" ${filters.priority === 'normal' ? 'selected' : ''}>普通</option>
                                <option value="high" ${filters.priority === 'high' ? 'selected' : ''}>高</option>
                                <option value="urgent" ${filters.priority === 'urgent' ? 'selected' : ''}>紧急</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label class="form-label">搜索</label>
                            <div class="input-group" style="display: flex; gap: 8px; align-items: center; max-width: 380px;">
                                <input type="text" class="form-input" id="fbFilterKeyword" placeholder="标题、内容" value="${filters.keyword || ''}" style="flex: 1; min-width: 160px;">
                                <button class="btn btn-primary" id="searchBtn">搜索</button>
                            </div>
                        </div>
                    </div>
                </div>

                ${items.length ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>标题</th>
                                        <th>类型</th>
                                        <th>优先级</th>
                                        <th>状态</th>
                                        <th>回复时间</th>
                                        <th>创建时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map(item => `
                                        <tr>
                                            <td><a href="#/feedback/view/${item.id}" class="truncate" style="max-width: 260px; display:block">${Utils.escapeHtml(item.title)}</a></td>
                                            <td>${FeedbackUI.typeTag(item.type)}</td>
                                            <td>${FeedbackUI.priorityTag(item.priority)}</td>
                                            <td>${FeedbackUI.statusTag(item.status)}</td>
                                            <td>${item.reply_at ? Utils.formatDate(item.reply_at) : '-'}</td>
                                            <td>${Utils.formatDate(item.created_at)}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-view="${item.id}">查看</button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${item.id}" data-title="${Utils.escapeHtml(item.title)}">删除</button>
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
                            <div class="empty-icon">💬</div>
                            <p class="empty-text">暂无反馈</p>
                            <button class="btn btn-primary" onclick="Router.push('/feedback/create')">立即提交</button>
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
        if (!this.container || this.container._bindFeedbackList) return;
        this.container._bindFeedbackList = true;

        this.delegate('change', '#filterStatus', (e) => this.handleFilter('status', e.target.value));
        this.delegate('change', '#filterType', (e) => this.handleFilter('type', e.target.value));
        this.delegate('change', '#filterPriority', (e) => this.handleFilter('priority', e.target.value));
        this.delegate('click', '#searchBtn', () => {
            const keyword = this.$('#fbFilterKeyword')?.value.trim() || '';
            this.handleFilter('keyword', keyword);
        });
        this.delegate('click', '[data-view]', (e) => {
            const id = Number(e.target.dataset.view);
            if (id) this.showDetail(id);
        });
        this.delegate('click', '[data-delete]', (e) => {
            const id = Number(e.target.dataset.delete);
            const title = e.target.dataset.title || '';
            this.handleDelete(id, title);
        });
        this.delegate('click', '[data-page]', (e) => {
            const page = Number(e.target.dataset.page);
            if (page && page !== this.state.page) this.changePage(page);
        });
    }
}

/**
 * 提交反馈
 */
class FeedbackCreatePage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            submitting: false
        };
    }

    render() {
        return `
            <div class="page fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">提交反馈</h1>
                        <p class="page-desc">请尽量描述清晰，以便快速处理</p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="max-width: 720px; margin: 0 auto;">
                        <div class="form-group">
                            <label class="form-label">标题 <span class="tag tag-danger">必填</span></label>
                            <input id="fbTitle" class="form-input" placeholder="请简要概述问题或建议">
                        </div>
                        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: var(--spacing-md);">
                            <div class="form-group">
                                <label class="form-label">类型</label>
                                <select id="fbType" class="form-input form-select">
                                    <option value="suggestion">建议</option>
                                    <option value="opinion">建议</option>
                                    <option value="bug">问题</option>
                                    <option value="feature">功能需求</option>
                                    <option value="other" selected>其他</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">优先级</label>
                                <select id="fbPriority" class="form-input form-select">
                                    <option value="normal" selected>普通</option>
                                    <option value="low">低</option>
                                    <option value="high">高</option>
                                    <option value="urgent">紧急</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">联系方式（可选）</label>
                            <input id="fbContact" class="form-input" placeholder="邮箱/电话/IM">
                        </div>
                        <div class="form-group">
                            <label class="form-label">详细描述 <span class="tag tag-danger">必填</span></label>
                            <textarea id="fbContent" class="form-input" rows="8" placeholder="请详细描述问题、复现步骤或建议"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">附件（可选，填写文件路径或链接）</label>
                            <input id="fbAttachments" class="form-input" placeholder="如需，可粘贴截图链接或文件路径，多条用逗号分隔">
                        </div>
                        <div style="margin-top: var(--spacing-lg); display: flex; gap: 8px;">
                            <button class="btn btn-primary" id="submitFeedback">提交反馈</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.bindEvents();
    }

    bindEvents() {
        if (!this.container || this.container._bindFeedbackCreate) return;
        this.container._bindFeedbackCreate = true;

        this.delegate('click', '#submitFeedback', async () => {
            if (this.state.submitting) return;
            const title = this.$('#fbTitle')?.value.trim();
            const content = this.$('#fbContent')?.value.trim();
            const type = this.$('#fbType')?.value || 'other';
            const priority = this.$('#fbPriority')?.value || 'normal';
            const contact = this.$('#fbContact')?.value.trim() || undefined;
            const attachments = this.$('#fbAttachments')?.value.trim() || undefined;

            if (!title) {
                Toast.error('请输入标题');
                return;
            }
            if (!content) {
                Toast.error('请输入详细描述');
                return;
            }

            this.state.submitting = true;
            try {
                await FeedbackApi.create({ title, content, type, priority, contact, attachments });
                Toast.success('提交成功');
                Router.push('/feedback/my');
            } catch (e) {
                Toast.error(e.message || '提交失败');
            } finally {
                this.state.submitting = false;
            }
        });
    }
}

/**
 * 管理端列表
 */
class FeedbackAdminPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            items: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            stats: null,
            filters: {
                status: '',
                type: '',
                priority: '',
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
            const { status, type, priority, keyword } = this.state.filters;
            if (status) params.status = status;
            if (type) params.type = type;
            if (priority) params.priority = priority;
            if (keyword) params.keyword = keyword;

            const [listRes, statsRes] = await Promise.all([
                FeedbackApi.adminList(params),
                FeedbackApi.statistics()
            ]);

            this.setState({
                items: listRes.data.items || [],
                total: listRes.data.total || 0,
                stats: statsRes.data || {},
                loading: false
            });
        } catch (e) {
            Toast.error(e.message || '加载失败');
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
        Modal.confirm('删除反馈', `确定删除 "${title}" 吗？此操作不可恢复。`, async () => {
            await FeedbackApi.remove(id);
            Toast.success('删除成功');
            this.loadData();
        });
    }

    async handleResolve(id) {
        await FeedbackApi.adminUpdate(id, { status: 'resolved', resolved_at: new Date().toISOString() });
        Toast.success('已标记为已解决');
        this.loadData();
    }

    openReplyModal(item) {
        const modal = new Modal({
            title: '回复反馈',
            content: `
                <div class="form-group">
                    <label class="form-label">回复内容</label>
                    <textarea id="replyContent" class="form-input" rows="4" placeholder="请输入回复内容"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">更新状态</label>
                    <select id="replyStatus" class="form-input form-select">
                        <option value="">不修改</option>
                        <option value="processing">处理中</option>
                        <option value="resolved">已解决</option>
                        <option value="closed">已关闭</option>
                    </select>
                </div>
            `,
            onConfirm: async () => {
                const content = modal.overlay.querySelector('#replyContent')?.value.trim();
                const status = modal.overlay.querySelector('#replyStatus')?.value;
                if (!content) {
                    Toast.error('请输入回复内容');
                    return false;
                }
                await FeedbackApi.reply(item.id, {
                    reply_content: content,
                    status: status || undefined
                });
                Toast.success('回复成功');
                this.loadData();
                return true;
            }
        });
        modal.show();
    }

    renderStats() {
        const s = this.state.stats || {};
        return `
            <div class="card" style="margin-bottom: var(--spacing-lg)">
                <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: var(--spacing-md);">
                    <div class="stat-item">
                        <div class="stat-title">总数</div>
                        <div class="stat-value">${s.total || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-title">待处理</div>
                        <div class="stat-value">${s.pending || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-title">处理中</div>
                        <div class="stat-value">${s.processing || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-title">已解决</div>
                        <div class="stat-value">${s.resolved || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-title">已关闭</div>
                        <div class="stat-value">${s.closed || 0}</div>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const { items, total, page, size, loading, filters } = this.state;
        const pages = Math.ceil(total / size);
        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">反馈管理</h1>
                        <p class="page-desc">集中查看和处理所有用户反馈</p>
                    </div>
                </div>

                ${this.renderStats()}

                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: var(--spacing-md); align-items: end">
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="adFilterStatus" value="${filters.status}">
                                <option value="">全部</option>
                                <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>待处理</option>
                                <option value="processing" ${filters.status === 'processing' ? 'selected' : ''}>处理中</option>
                                <option value="resolved" ${filters.status === 'resolved' ? 'selected' : ''}>已解决</option>
                                <option value="closed" ${filters.status === 'closed' ? 'selected' : ''}>已关闭</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">类型</label>
                            <select class="form-input form-select" id="adFilterType" value="${filters.type}">
                                <option value="">全部</option>
                                <option value="suggestion" ${filters.type === 'suggestion' ? 'selected' : ''}>建议</option>
                                <option value="opinion" ${filters.type === 'opinion' ? 'selected' : ''}>建议</option>
                                <option value="bug" ${filters.type === 'bug' ? 'selected' : ''}>问题</option>
                                <option value="feature" ${filters.type === 'feature' ? 'selected' : ''}>需求</option>
                                <option value="other" ${filters.type === 'other' ? 'selected' : ''}>其他</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">优先级</label>
                            <select class="form-input form-select" id="adFilterPriority" value="${filters.priority}">
                                <option value="">全部</option>
                                <option value="low" ${filters.priority === 'low' ? 'selected' : ''}>低</option>
                                <option value="normal" ${filters.priority === 'normal' ? 'selected' : ''}>普通</option>
                                <option value="high" ${filters.priority === 'high' ? 'selected' : ''}>高</option>
                                <option value="urgent" ${filters.priority === 'urgent' ? 'selected' : ''}>紧急</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label class="form-label">搜索</label>
                            <div class="input-group" style="display: flex; gap: 8px; align-items: center; max-width: 380px;">
                                <input type="text" class="form-input" id="adFilterKeyword" placeholder="标题、内容" value="${filters.keyword || ''}" style="flex: 1; min-width: 160px;">
                                <button class="btn btn-primary" id="adSearchBtn">搜索</button>
                            </div>
                        </div>
                    </div>
                </div>

                ${items.length ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>标题</th>
                                        <th>类型</th>
                                        <th>优先级</th>
                                        <th>状态</th>
                                        <th>提交人</th>
                                        <th>回复时间</th>
                                        <th>创建时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map(item => `
                                        <tr>
                                            <td><a href="#/feedback/view/${item.id}" class="truncate" style="max-width: 200px; display:block">${Utils.escapeHtml(item.title)}</a></td>
                                            <td>${FeedbackUI.typeTag(item.type)}</td>
                                            <td>${FeedbackUI.priorityTag(item.priority)}</td>
                                            <td>${FeedbackUI.statusTag(item.status)}</td>
                                            <td>${item.user_id || '-'}</td>
                                            <td>${item.reply_at ? Utils.formatDate(item.reply_at) : '-'}</td>
                                            <td>${Utils.formatDate(item.created_at)}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-view="${item.id}">查看</button>
                                                <button class="btn btn-ghost btn-sm" data-reply="${item.id}">回复</button>
                                                <button class="btn btn-ghost btn-sm" data-resolve="${item.id}">已解决</button>
                                                <button class="btn btn-ghost btn-sm" data-delete="${item.id}" data-title="${Utils.escapeHtml(item.title)}">删除</button>
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
                            <div class="empty-icon">📭</div>
                            <p class="empty-text">暂无反馈</p>
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
        if (!this.container || this.container._bindFeedbackAdmin) return;
        this.container._bindFeedbackAdmin = true;

        this.delegate('change', '#adFilterStatus', (e) => this.handleFilter('status', e.target.value));
        this.delegate('change', '#adFilterType', (e) => this.handleFilter('type', e.target.value));
        this.delegate('change', '#adFilterPriority', (e) => this.handleFilter('priority', e.target.value));
        this.delegate('click', '#adSearchBtn', () => {
            const keyword = this.$('#adFilterKeyword')?.value.trim() || '';
            this.handleFilter('keyword', keyword);
        });
        this.delegate('click', '[data-view]', (e) => {
            const id = Number(e.target.dataset.view);
            if (id) Router.push(`/feedback/view/${id}`);
        });
        this.delegate('click', '[data-reply]', (e) => {
            const id = Number(e.target.dataset.reply);
            const item = this.state.items.find(i => i.id === id);
            if (item) this.openReplyModal(item);
        });
        this.delegate('click', '[data-resolve]', async (e) => {
            const id = Number(e.target.dataset.resolve);
            if (!id) return;
            await this.handleResolve(id);
        });
        this.delegate('click', '[data-delete]', (e) => {
            const id = Number(e.target.dataset.delete);
            const title = e.target.dataset.title || '';
            this.handleDelete(id, title);
        });
        this.delegate('click', '[data-page]', (e) => {
            const page = Number(e.target.dataset.page);
            if (page && page !== this.state.page) this.changePage(page);
        });
    }
}

/**
 * 反馈详情
 */
class FeedbackDetailPage extends Component {
    constructor(container, id) {
        super(container);
        this.id = id;
        this.state = {
            loading: true,
            item: null
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const res = await FeedbackApi.get(this.id);
            this.setState({ item: res.data, loading: false });
        } catch (e) {
            Toast.error(e.message || '加载失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { loading, item } = this.state;
        if (loading) return '<div class="loading"></div>';
        if (!item) return '<div class="empty-state"><div class="empty-icon">😢</div><p class="empty-text">未找到该反馈</p></div>';

        return `
            <div class="page fade-in">
                <div class="page-header" style="justify-content: space-between; align-items: center;">
                    <div>
                        <h1 class="page-title">反馈详情</h1>
                        <p class="page-desc">编号：${item.id}</p>
                    </div>
                    <div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        <div class="detail-block">
                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="tag tag-primary">${Utils.escapeHtml(item.title)}</span>
                                ${FeedbackUI.typeTag(item.type)}
                                ${FeedbackUI.priorityTag(item.priority)}
                                ${FeedbackUI.statusTag(item.status)}
                            </div>
                            <div style="margin-top: 12px; white-space: pre-wrap;">${Utils.escapeHtml(item.content)}</div>
                        </div>
                        <div class="detail-meta" style="margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 8px;">
                            <div>提交人：${item.user_id || '-'}</div>
                            <div>处理人：${item.handler_id || '-'}</div>
                            <div>创建时间：${Utils.formatDate(item.created_at)}</div>
                            <div>更新时间：${Utils.formatDate(item.updated_at)}</div>
                            <div>回复时间：${item.reply_at ? Utils.formatDate(item.reply_at) : '-'}</div>
                        </div>
                        ${item.reply_content ? `
                            <div class="card" style="margin-top: 16px;">
                                <div class="card-body">
                                    <div class="form-label" style="margin-bottom: 8px;">回复</div>
                                    <div style="white-space: pre-wrap;">${Utils.escapeHtml(item.reply_content)}</div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
    }
}



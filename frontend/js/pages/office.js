/**
 * 协同办公页面
 * 支持在线Word文档和Excel表格的创建、编辑和多人实时协作
 */

// ==================== API封装 ====================

const OfficeApi = {
    // 获取文档列表
    async getList(params = {}) {
        const query = new URLSearchParams(params).toString();
        return Api.get(`/office${query ? '?' + query : ''}`);
    },

    // 创建文档
    async create(data) {
        return Api.post('/office', data);
    },

    // 获取文档详情
    async get(id) {
        return Api.get(`/office/${id}`);
    },

    // 更新文档信息
    async update(id, data) {
        return Api.put(`/office/${id}`, data);
    },

    // 更新文档内容
    async updateContent(id, data) {
        return Api.put(`/office/${id}/content`, data);
    },

    // 删除文档
    async delete(id, permanent = false) {
        return Api.delete(`/office/${id}?permanent=${permanent}`);
    },

    // 恢复文档
    async restore(id) {
        return Api.post(`/office/${id}/restore`);
    },

    // 更新分享设置
    async updateShare(id, data) {
        return Api.put(`/office/${id}/share`, data);
    },

    // 获取版本历史
    async getVersions(id, page = 1, pageSize = 20) {
        return Api.get(`/office/${id}/versions?page=${page}&page_size=${pageSize}`);
    },

    // 恢复版本
    async restoreVersion(id, versionId) {
        return Api.post(`/office/${id}/versions/restore`, { version_id: versionId });
    },

    // 获取协作者
    async getCollaborators(id) {
        return Api.get(`/office/${id}/collaborators`);
    },

    // 添加协作者
    async addCollaborator(id, data) {
        return Api.post(`/office/${id}/collaborators`, data);
    },

    // 移除协作者
    async removeCollaborator(documentId, userId) {
        return Api.delete(`/office/${documentId}/collaborators/${userId}`);
    },

    // 获取在线编辑者
    async getOnlineEditors(id) {
        return Api.get(`/office/${id}/editors`);
    },

    // 获取模板列表
    async getTemplates(docType = null) {
        const query = docType ? `?doc_type=${docType}` : '';
        return Api.get(`/office/templates${query}`);
    },

    // 从模板创建
    async createFromTemplate(templateId, title) {
        return Api.post(`/office/from-template/${templateId}?title=${encodeURIComponent(title)}`);
    },

    // 通过分享码获取
    async getByShareCode(code) {
        return Api.get(`/office/share/${code}`);
    },

    // 搜索用户（用于添加协作者）
    async searchUsers(query) {
        return Api.get(`/users/search?query=${encodeURIComponent(query)}`);
    },

    // ==================== 评论批注 ====================

    // 获取文档评论
    async getComments(documentId, includeResolved = true) {
        return Api.get(`/office/${documentId}/comments?include_resolved=${includeResolved}`);
    },

    // 添加评论
    async addComment(documentId, data) {
        return Api.post(`/office/${documentId}/comments`, data);
    },

    // 更新评论
    async updateComment(commentId, data) {
        return Api.put(`/office/comments/${commentId}`, data);
    },

    // 删除评论
    async deleteComment(commentId) {
        return Api.delete(`/office/comments/${commentId}`);
    },

    // 解决评论
    async resolveComment(commentId) {
        return Api.post(`/office/comments/${commentId}/resolve`);
    },

    // 重新打开评论
    async reopenComment(commentId) {
        return Api.post(`/office/comments/${commentId}/reopen`);
    }
};


// ==================== 文档列表页 ====================

class OfficeListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            documents: [],
            total: 0,
            page: 1,
            pageSize: 20,
            docType: '',
            keyword: '',
            isStarred: null,
            isDeleted: false,
            loading: true
        };
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const params = {
                page: this.state.page,
                page_size: this.state.pageSize
            };

            if (this.state.docType) params.doc_type = this.state.docType;
            if (this.state.keyword) params.keyword = this.state.keyword;
            if (this.state.isStarred !== null) params.is_starred = this.state.isStarred;
            if (this.state.isDeleted) params.is_deleted = true;

            const res = await OfficeApi.getList(params);
            this.setState({
                documents: res.data.items || [],
                total: res.data.total || 0,
                loading: false
            });
        } catch (err) {
            Toast.error('加载文档列表失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { documents, total, page, pageSize, docType, keyword, isStarred, isDeleted, loading } = this.state;
        const totalPages = Math.ceil(total / pageSize);

        return `
            <div class="page-office">
                <div class="page-header">
                    <h1 class="page-title">
                        <i class="ri-file-text-line"></i>
                        ${isDeleted ? '回收站' : '协同办公'}
                    </h1>
                    <div class="page-actions">
                        ${!isDeleted ? `
                            <button class="btn btn-primary" id="btn-new-doc">
                                <i class="ri-file-add-line"></i> 新建文档
                            </button>
                            <button class="btn btn-success" id="btn-new-sheet">
                                <i class="ri-table-line"></i> 新建表格
                            </button>
                        ` : `
                            <button class="btn btn-secondary" id="btn-back-list">
                                <i class="ri-arrow-left-line"></i> 返回列表
                            </button>
                        `}
                    </div>
                </div>
                
                <div class="office-toolbar">
                    <div class="toolbar-left">
                        <div class="filter-group">
                            <select id="filter-type" class="form-select">
                                <option value="">全部类型</option>
                                <option value="doc" ${docType === 'doc' ? 'selected' : ''}>📝 文档</option>
                                <option value="sheet" ${docType === 'sheet' ? 'selected' : ''}>📊 表格</option>
                            </select>
                            <select id="filter-starred" class="form-select">
                                <option value="">全部文档</option>
                                <option value="true" ${isStarred === true ? 'selected' : ''}>⭐ 已收藏</option>
                                <option value="false" ${isStarred === false ? 'selected' : ''}>未收藏</option>
                            </select>
                        </div>
                        ${!isDeleted ? `
                            <button class="btn btn-text" id="btn-trash">
                                <i class="ri-delete-bin-line"></i> 回收站
                            </button>
                        ` : ''}
                    </div>
                    <div class="toolbar-right">
                        <div class="search-box">
                            <i class="ri-search-line"></i>
                            <input type="text" id="search-input" placeholder="搜索文档..." value="${Utils.escapeHtml(keyword)}">
                        </div>
                    </div>
                </div>
                
                <div class="office-content">
                    ${loading ? `
                        <div class="loading-container">
                            <div class="loader"></div>
                            <p>加载中...</p>
                        </div>
                    ` : documents.length === 0 ? `
                        <div class="empty-state">
                            <i class="ri-file-text-line"></i>
                            <p>${isDeleted ? '回收站为空' : '暂无文档'}</p>
                            ${!isDeleted ? '<p class="hint">点击上方按钮创建新文档</p>' : ''}
                        </div>
                    ` : `
                        <div class="document-grid">
                            ${documents.map(doc => this.renderDocumentCard(doc)).join('')}
                        </div>
                    `}
                </div>
                
                ${totalPages > 1 ? `
                    <div class="pagination-wrapper">
                        ${Utils.renderPagination(page, totalPages)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderDocumentCard(doc) {
        const isDoc = doc.doc_type === 'doc';
        const icon = isDoc ? 'ri-file-word-line' : 'ri-file-excel-line';
        const typeClass = isDoc ? 'type-doc' : 'type-sheet';
        const typeName = isDoc ? '文档' : '表格';

        return `
            <div class="document-card ${typeClass}" data-id="${doc.id}">
                <div class="card-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${Utils.escapeHtml(doc.title)}</h3>
                    <div class="card-meta">
                        <span class="meta-type">${typeName}</span>
                        <span class="meta-time">${Utils.timeAgo(doc.updated_at)}</span>
                    </div>
                    <div class="card-footer">
                        <span class="owner">${Utils.escapeHtml(doc.owner_name || '未知')}</span>
                        ${doc.is_starred ? '<i class="ri-star-fill starred"></i>' : ''}
                        ${doc.share_type !== 'private' ? '<i class="ri-share-line shared"></i>' : ''}
                    </div>
                </div>
                <div class="card-actions">
                    ${this.state.isDeleted ? `
                        <button class="btn-icon" data-action="restore" title="恢复">
                            <i class="ri-refresh-line"></i>
                        </button>
                        <button class="btn-icon danger" data-action="delete-permanent" title="永久删除">
                            <i class="ri-delete-bin-7-line"></i>
                        </button>
                    ` : `
                        <button class="btn-icon" data-action="open" title="打开">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="btn-icon" data-action="${doc.is_starred ? 'unstar' : 'star'}" title="${doc.is_starred ? '取消收藏' : '收藏'}">
                            <i class="${doc.is_starred ? 'ri-star-fill' : 'ri-star-line'}"></i>
                        </button>
                        <button class="btn-icon" data-action="share" title="分享">
                            <i class="ri-share-line"></i>
                        </button>
                        <button class="btn-icon" data-action="more" title="更多">
                            <i class="ri-more-2-fill"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    async afterMount() {
        await this.loadData();
        this.bindEvents();
        this.bindDelegateEvents(); // 只绑定一次委托事件
    }

    afterUpdate() {
        // 每次更新后都需要重新绑定普通DOM事件，因为DOM被替换了
        this.bindEvents();
    }

    bindDelegateEvents() {
        // 防止重复绑定委托事件
        if (this._delegatesBound) return;
        this._delegatesBound = true;

        // 文档卡片操作
        this.delegate('click', '.document-card', async (e) => {
            const card = e.target.closest('.document-card');
            if (!card) return; // 确保点击的是卡片

            const action = e.target.closest('[data-action]');
            const docId = parseInt(card.dataset.id);

            if (action) {
                const actionType = action.dataset.action;
                await this.handleCardAction(docId, actionType);
            } else {
                // 点击卡片本身打开文档
                this.openDocument(docId);
            }
        });

        // 分页
        this.delegate('click', '.pagination-btn', (e) => {
            const btn = e.target.closest('.pagination-btn');
            if (!btn) return;

            const page = parseInt(btn.dataset.page);
            if (page && page !== this.state.page) {
                this.setState({ page });
                this.loadData();
            }
        });
    }

    bindEvents() {
        // 新建文档
        this.on('#btn-new-doc', 'click', () => this.showCreateModal('doc'));
        this.on('#btn-new-sheet', 'click', () => this.showCreateModal('sheet'));

        // 返回列表
        this.on('#btn-back-list', 'click', () => {
            this.setState({ isDeleted: false, page: 1 });
            this.loadData();
        });

        // 回收站
        this.on('#btn-trash', 'click', () => {
            this.setState({ isDeleted: true, page: 1 });
            this.loadData();
        });

        // 筛选
        this.on('#filter-type', 'change', (e) => {
            this.setState({ docType: e.target.value, page: 1 });
            this.loadData();
        });

        this.on('#filter-starred', 'change', (e) => {
            const val = e.target.value;
            this.setState({
                isStarred: val === '' ? null : val === 'true',
                page: 1
            });
            this.loadData();
        });

        // 搜索
        const searchInput = this.$('#search-input');
        if (searchInput) {
            searchInput.addEventListener('keyup', Utils.debounce((e) => {
                this.setState({ keyword: e.target.value, page: 1 });
                this.loadData();
            }, 300));
        }

    }

    async handleCardAction(docId, action) {
        // 简单防抖锁
        if (this._processingAction) return;
        this._processingAction = true;
        setTimeout(() => this._processingAction = false, 500);

        switch (action) {
            case 'open':
                this.openDocument(docId);
                break;
            case 'star':
            case 'unstar':
                await this.toggleStar(docId, action === 'star');
                break;
            case 'share':
                this.showShareModal(docId);
                break;
            case 'more':
                this.showMoreMenu(docId);
                break;
            case 'restore':
                await this.restoreDocument(docId);
                break;
            case 'delete-permanent':
                await this.deleteDocument(docId, true);
                break;
        }
    }

    openDocument(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (!doc) return;

        const path = doc.doc_type === 'doc'
            ? `/office/doc/${docId}`
            : `/office/sheet/${docId}`;
        Router.push(path);
    }

    async toggleStar(docId, star) {
        try {
            await OfficeApi.update(docId, { is_starred: star });
            Toast.success(star ? '已收藏' : '已取消收藏');
            await this.loadData();
        } catch (err) {
            Toast.error('操作失败');
        }
    }

    async restoreDocument(docId) {
        try {
            await OfficeApi.restore(docId);
            Toast.success('文档已恢复');
            await this.loadData();
        } catch (err) {
            Toast.error('恢复失败');
        }
    }

    async deleteDocument(docId, permanent = false) {
        const title = permanent ? '永久删除' : '删除文档';
        const message = permanent
            ? '此操作不可恢复，确定要永久删除该文档吗？'
            : '文档将被移到回收站，您可以稍后恢复。';

        const confirmed = await Modal.confirm(title, message);

        if (!confirmed) return;

        try {
            await OfficeApi.delete(docId, permanent);
            Toast.success('删除成功');
            await this.loadData();
        } catch (err) {
            Toast.error('删除失败');
        }
    }

    showMoreMenu(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (!doc) return;

        const content = `
            <div class="more-menu-list">
                <button class="more-menu-item" data-action="duplicate">
                    <i class="ri-file-copy-line"></i> 复制
                </button>
                <button class="more-menu-item" data-action="rename">
                    <i class="ri-edit-line"></i> 重命名
                </button>
                <button class="more-menu-item" data-action="versions">
                    <i class="ri-history-line"></i> 版本历史
                </button>
                <button class="more-menu-item" data-action="collaborators">
                    <i class="ri-team-line"></i> 协作者管理
                </button>
                <div class="more-menu-divider"></div>
                <button class="more-menu-item danger" data-action="delete">
                    <i class="ri-delete-bin-line"></i> 删除
                </button>
            </div>
        `;

        const { overlay, close } = Modal.show({
            title: '更多操作',
            content,
            footer: false  // 不显示默认按钮
        });

        // 手动绑定菜单项点击事件
        if (overlay) {
            overlay.querySelectorAll('.more-menu-item').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    close();  // 使用返回的close函数

                    switch (action) {
                        case 'duplicate':
                            await this.duplicateDocument(docId);
                            break;
                        case 'rename':
                            this.showRenameModal(docId);
                            break;
                        case 'versions':
                            this.showVersionsModal(docId);
                            break;
                        case 'collaborators':
                            this.showCollaboratorsModal(docId);
                            break;
                        case 'delete':
                            await this.deleteDocument(docId);
                            break;
                    }
                });
            });
        }
    }

    async duplicateDocument(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (!doc) return;

        try {
            const res = await OfficeApi.create({
                title: `${doc.title} (副本)`,
                doc_type: doc.doc_type
            });

            // 复制内容
            if (doc.content) {
                await OfficeApi.updateContent(res.data.id, {
                    content: doc.content,
                    version: 1,
                    create_version: false
                });
            }

            Toast.success('文档已复制');
            await this.loadData();
        } catch (err) {
            Toast.error('复制失败');
        }
    }

    showRenameModal(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (!doc) return;

        Modal.form({
            title: '重命名',
            fields: [
                { name: 'title', label: '新标题', type: 'text', required: true, value: doc.title }
            ],
            onSubmit: async (data) => {
                try {
                    await OfficeApi.update(docId, { title: data.title });
                    Toast.success('重命名成功');
                    await this.loadData();
                    return true;
                } catch (err) {
                    Toast.error('重命名失败');
                    return false;
                }
            }
        });
    }

    showCreateModal(docType) {
        const typeName = docType === 'doc' ? '文档' : '表格';

        Modal.form({
            title: `新建${typeName}`,
            fields: [
                { name: 'title', label: '标题', type: 'text', required: true, placeholder: `请输入${typeName}标题` }
            ],
            onSubmit: async (data) => {
                try {
                    const res = await OfficeApi.create({
                        title: data.title,
                        doc_type: docType
                    });
                    Toast.success('创建成功');

                    // 打开新文档
                    const path = docType === 'doc'
                        ? `/office/doc/${res.data.id}`
                        : `/office/sheet/${res.data.id}`;
                    Router.push(path);

                    return true;
                } catch (err) {
                    Toast.error('创建失败');
                    return false;
                }
            }
        });
    }

    showShareModal(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (!doc) return;

        Modal.form({
            title: '分享设置',
            fields: [
                {
                    name: 'share_type',
                    label: '分享方式',
                    type: 'select',
                    value: doc.share_type || 'private',
                    options: [
                        { value: 'private', text: '私有 - 仅自己和协作者可见' },
                        { value: 'link', text: '链接分享 - 知道链接的人可访问' },
                        { value: 'public', text: '公开 - 所有人可见' }
                    ]
                },
                {
                    name: 'share_permission',
                    label: '权限',
                    type: 'select',
                    value: doc.share_permission || 'view',
                    options: [
                        { value: 'view', text: '只读' },
                        { value: 'edit', text: '可编辑' }
                    ]
                }
            ],
            onSubmit: async (data) => {
                try {
                    const res = await OfficeApi.updateShare(docId, data);

                    if (data.share_type !== 'private' && res.data.share_code) {
                        const shareUrl = `${window.location.origin}/#/office/share/${res.data.share_code}`;
                        await navigator.clipboard.writeText(shareUrl);
                        Toast.success('分享链接已复制到剪贴板');
                    } else {
                        Toast.success('分享设置已更新');
                    }

                    await this.loadData();
                    return true;
                } catch (err) {
                    Toast.error('更新失败');
                    return false;
                }
            }
        });
    }

    async showCollaboratorsModal(docId) {
        try {
            const res = await OfficeApi.getCollaborators(docId);
            const collaborators = res.data || [];

            let content = `
                <div class="collaborators-list">
                    ${collaborators.length === 0
                    ? '<p class="empty-hint">暂无协作者</p>'
                    : collaborators.map(c => `
                            <div class="collaborator-item" data-user-id="${c.user_id}">
                                <img src="${c.user_avatar || '/static/images/default-avatar.png'}" alt="" class="avatar">
                                <span class="name">${Utils.escapeHtml(c.user_name)}</span>
                                <span class="permission">${c.permission === 'edit' ? '可编辑' : (c.permission === 'admin' ? '管理员' : '只读')}</span>
                                <button class="btn-icon danger btn-remove" title="移除">
                                    <i class="ri-close-line"></i>
                                </button>
                            </div>
                        `).join('')}
                </div>
                <div class="add-collaborator">
                    <div class="user-search-wrapper">
                        <input type="text" id="user-search-input" placeholder="搜索用户名或昵称..." class="form-input" autocomplete="off">
                        <input type="hidden" id="selected-user-id">
                        <div class="user-search-results" id="user-search-results"></div>
                    </div>
                    <select id="new-collab-permission" class="form-select">
                        <option value="view">只读</option>
                        <option value="edit">可编辑</option>
                        <option value="admin">管理员</option>
                    </select>
                    <button class="btn btn-primary btn-add-collab">添加</button>
                </div>
            `;

            Modal.show({
                title: '协作者管理',
                content,
                buttons: [{ text: '关闭', type: 'secondary' }],
                onMounted: (modal) => {
                    const searchInput = modal.querySelector('#user-search-input');
                    const searchResults = modal.querySelector('#user-search-results');
                    const selectedUserIdInput = modal.querySelector('#selected-user-id');
                    let searchTimeout = null;

                    // 用户搜索功能
                    searchInput.addEventListener('input', (e) => {
                        const query = e.target.value.trim();
                        selectedUserIdInput.value = ''; // 清除已选用户

                        if (searchTimeout) clearTimeout(searchTimeout);

                        if (query.length < 1) {
                            searchResults.innerHTML = '';
                            searchResults.style.display = 'none';
                            return;
                        }

                        // 防抖搜索
                        searchTimeout = setTimeout(async () => {
                            try {
                                const res = await OfficeApi.searchUsers(query);
                                const users = res.data || [];

                                // 过滤掉已添加的协作者
                                const existingIds = collaborators.map(c => c.user_id);
                                const filteredUsers = users.filter(u => !existingIds.includes(u.id));

                                if (filteredUsers.length === 0) {
                                    searchResults.innerHTML = '<div class="search-no-result">未找到用户</div>';
                                } else {
                                    searchResults.innerHTML = filteredUsers.map(u => `
                                        <div class="search-result-item" data-id="${u.id}" data-name="${Utils.escapeHtml(u.nickname || u.username)}">
                                            <img src="${u.avatar || '/static/images/default-avatar.png'}" alt="" class="avatar-sm">
                                            <span class="user-info">
                                                <span class="nickname">${Utils.escapeHtml(u.nickname || u.username)}</span>
                                                <span class="username">@${Utils.escapeHtml(u.username)}</span>
                                            </span>
                                        </div>
                                    `).join('');
                                }
                                searchResults.style.display = 'block';
                            } catch (err) {
                                searchResults.innerHTML = '<div class="search-error">搜索失败</div>';
                                searchResults.style.display = 'block';
                            }
                        }, 300);
                    });

                    // 选择用户
                    searchResults.addEventListener('click', (e) => {
                        const item = e.target.closest('.search-result-item');
                        if (item) {
                            selectedUserIdInput.value = item.dataset.id;
                            searchInput.value = item.dataset.name;
                            searchResults.style.display = 'none';
                        }
                    });

                    // 点击其他区域隐藏搜索结果
                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('.user-search-wrapper')) {
                            searchResults.style.display = 'none';
                        }
                    });

                    // 移除协作者
                    modal.querySelectorAll('.btn-remove').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const item = e.target.closest('.collaborator-item');
                            const userId = parseInt(item.dataset.userId);
                            try {
                                await OfficeApi.removeCollaborator(docId, userId);
                                item.remove();
                                Toast.success('已移除');
                            } catch (err) {
                                Toast.error('移除失败');
                            }
                        });
                    });

                    // 添加协作者
                    modal.querySelector('.btn-add-collab').addEventListener('click', async () => {
                        const userId = parseInt(selectedUserIdInput.value);
                        const permission = modal.querySelector('#new-collab-permission').value;

                        if (!userId) {
                            Toast.warning('请选择要添加的用户');
                            return;
                        }

                        try {
                            await OfficeApi.addCollaborator(docId, { user_id: userId, permission });
                            Toast.success('已添加');
                            Modal.close();
                            this.showCollaboratorsModal(docId);
                        } catch (err) {
                            Toast.error('添加失败');
                        }
                    });
                }
            });
        } catch (err) {
            Toast.error('获取协作者列表失败');
        }
    }

    async showVersionsModal(docId) {
        try {
            const res = await OfficeApi.getVersions(docId);
            const versions = res.data.items || [];

            let content = `
                <div class="versions-list">
                    ${versions.length === 0
                    ? '<p class="empty-hint">暂无版本历史</p>'
                    : versions.map(v => `
                            <div class="version-item" data-version-id="${v.id}">
                                <div class="version-info">
                                    <span class="version-num">版本 ${v.version}</span>
                                    <span class="version-time">${Utils.formatDate(v.created_at)}</span>
                                    <span class="version-user">${Utils.escapeHtml(v.user_name || '未知用户')}</span>
                                </div>
                                ${v.comment ? `<p class="version-comment">${Utils.escapeHtml(v.comment)}</p>` : ''}
                                <button class="btn btn-sm btn-text btn-restore">恢复此版本</button>
                            </div>
                        `).join('')}
                </div>
            `;

            Modal.show({
                title: '版本历史',
                content,
                buttons: [{ text: '关闭', type: 'secondary' }],
                onMounted: (modal) => {
                    modal.querySelectorAll('.btn-restore').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const item = e.target.closest('.version-item');
                            const versionId = parseInt(item.dataset.versionId);

                            const confirmed = await Modal.confirm({
                                title: '恢复版本',
                                content: '确定要恢复到此版本吗？当前内容将被保存为新版本。'
                            });

                            if (!confirmed) return;

                            try {
                                await OfficeApi.restoreVersion(docId, versionId);
                                Toast.success('版本已恢复');
                                Modal.close();
                            } catch (err) {
                                Toast.error('恢复失败');
                            }
                        });
                    });
                }
            });
        } catch (err) {
            Toast.error('获取版本历史失败');
        }
    }
}


// ==================== 文档编辑页（Word类） ====================

class OfficeDocPage extends Component {
    constructor(container, documentId = null) {
        super(container);
        this.documentId = documentId;
        this.state = {
            document: null,
            loading: true,
            saving: false,
            saveStatus: 'saved', // saved, unsaved, saving
            onlineEditors: [],
            connected: false
        };
        this.editor = null;
        this.ws = null;
        this.debounceSaveTimer = null;
        this.lastSavedContent = null;
        this.contentChanged = false;

        // 绑定离开页面提醒
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        window.addEventListener('beforeunload', this.handleBeforeUnload);

        // 绑定全局快捷键
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    // 离开页面提醒
    handleBeforeUnload(e) {
        if (this.contentChanged) {
            e.preventDefault();
            e.returnValue = '您有未保存的更改，确定要离开吗？';
            return e.returnValue;
        }
    }

    // 快捷键处理
    handleKeyDown(e) {
        // Ctrl+S 保存
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (this.contentChanged && !this.state.saving) {
                this.saveContent(true); // 强制保存并显示提示
            } else if (!this.contentChanged) {
                Toast.info('文档已是最新状态');
            }
        }
    }

    async loadData() {
        if (!this.documentId) {
            this.setState({ loading: false });
            return;
        }

        try {
            const res = await OfficeApi.get(this.documentId);
            this.setState({
                document: res.data,
                loading: false
            });
            this.lastSavedContent = res.data.content;
        } catch (err) {
            Toast.error('加载文档失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { document, loading, saving, onlineEditors, connected } = this.state;

        if (loading) {
            return `
                <div class="page-office-doc">
                    <div class="loading-container">
                        <div class="loader"></div>
                        <p>正在加载文档...</p>
                    </div>
                </div>
            `;
        }

        if (!document) {
            return `
                <div class="page-office-doc">
                    <div class="empty-state">
                        <i class="ri-file-damage-line"></i>
                        <p>文档不存在或无权访问</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="page-office-doc">
                <div class="doc-header">
                    <div class="header-left">
                        <button class="btn btn-icon" id="btn-back" title="返回">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <input type="text" class="doc-title-input" id="doc-title" 
                            value="${Utils.escapeHtml(document.title)}" placeholder="无标题文档">
                    </div>
                    <div class="header-center">
                        <span class="save-status ${this.state.saveStatus}" title="Ctrl+S 快捷保存">
                            ${this.state.saveStatus === 'saving' ? '保存中...' :
                this.state.saveStatus === 'unsaved' ? '未保存' : '已保存'}
                        </span>
                    </div>
                    <div class="header-right">
                        <div class="online-editors">
                            ${onlineEditors.map(u => `
                                <div class="editor-avatar" title="${Utils.escapeHtml(u.user_name)}">
                                    <img src="${u.user_avatar || '/static/images/default-avatar.png'}" alt="">
                                </div>
                            `).join('')}
                        </div>
                        <span class="connection-status ${connected ? 'connected' : 'disconnected'}">
                            <i class="ri-${connected ? 'wifi-line' : 'wifi-off-line'}"></i>
                        </span>
                        <button class="btn btn-icon" id="btn-export" title="导出文档">
                            <i class="ri-download-line"></i>
                        </button>
                        <button class="btn btn-icon" id="btn-comment" title="评论批注">
                            <i class="ri-chat-3-line"></i>
                        </button>
                        <button class="btn btn-icon" id="btn-share" title="分享">
                            <i class="ri-share-line"></i>
                        </button>
                        <button class="btn btn-icon" id="btn-history" title="版本历史">
                            <i class="ri-history-line"></i>
                        </button>
                    </div>
                </div>
                
                <div class="doc-toolbar" id="doc-toolbar">
                    <!-- 工具栏由Tiptap渲染 -->
                </div>
                
                <div class="doc-main">
                    <div class="doc-editor-container">
                        <div id="editor" class="doc-editor"></div>
                    </div>
                    <div class="doc-comments-panel" id="comments-panel" style="display: none;">
                        <div class="comments-header">
                            <h3>评论批注</h3>
                            <button class="btn btn-icon btn-close-comments" title="关闭">
                                <i class="ri-close-line"></i>
                            </button>
                        </div>
                        <div class="comments-list" id="comments-list">
                            <!-- 评论列表 -->
                        </div>
                        <div class="comments-add">
                            <textarea id="new-comment" placeholder="添加评论..." rows="2"></textarea>
                            <button class="btn btn-primary btn-sm" id="btn-add-comment">发送</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterMount() {
        await this.loadData();
        if (this.state.document) {
            this.initEditor();
            this.connectWebSocket();
            this.startAutoSave();
        }
    }

    initEditor() {
        const editorContainer = this.$('#editor');
        if (!editorContainer) return;

        // 解析文档内容
        let content = { type: 'doc', content: [{ type: 'paragraph' }] };
        if (this.state.document.content) {
            try {
                content = JSON.parse(this.state.document.content);
            } catch (e) {
                console.warn('解析文档内容失败，使用默认内容');
            }
        }

        // 创建富文本编辑器
        editorContainer.contentEditable = 'true';
        editorContainer.innerHTML = this.renderContent(content);

        // 渲染工具栏
        this.renderToolbar();

        // 初始化协同编辑器（如果CollabEditor可用）
        if (typeof CollabEditor !== 'undefined') {
            this.collabEditor = new CollabEditor(editorContainer, {
                documentId: this.documentId,
                userId: Utils.getCurrentUserId(),
                userName: Utils.getCurrentUserName() || '匿名用户',
                syncDelay: 300
            });
        }

        // 监听内容变化
        editorContainer.addEventListener('input', () => {
            this.onContentChange();
        });
    }

    renderContent(content) {
        // 简化渲染，实际应使用Tiptap
        if (content.content) {
            return content.content.map(node => {
                if (node.type === 'paragraph') {
                    const text = node.content ? node.content.map(n => n.text || '').join('') : '';
                    return `<p>${text || '<br>'}</p>`;
                }
                if (node.type === 'heading') {
                    const level = node.attrs?.level || 1;
                    const text = node.content ? node.content.map(n => n.text || '').join('') : '';
                    return `<h${level}>${text}</h${level}>`;
                }
                return '';
            }).join('');
        }
        return '<p><br></p>';
    }

    renderToolbar() {
        const toolbar = this.$('#doc-toolbar');
        if (!toolbar) return;

        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button class="toolbar-btn" data-command="bold" title="加粗 (Ctrl+B)">
                    <i class="ri-bold"></i>
                </button>
                <button class="toolbar-btn" data-command="italic" title="斜体 (Ctrl+I)">
                    <i class="ri-italic"></i>
                </button>
                <button class="toolbar-btn" data-command="underline" title="下划线 (Ctrl+U)">
                    <i class="ri-underline"></i>
                </button>
                <button class="toolbar-btn" data-command="strikeThrough" title="删除线">
                    <i class="ri-strikethrough"></i>
                </button>
            </div>
            <div class="toolbar-group">
                <select class="toolbar-select" id="heading-select">
                    <option value="p">正文</option>
                    <option value="h1">标题 1</option>
                    <option value="h2">标题 2</option>
                    <option value="h3">标题 3</option>
                </select>
            </div>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-command="insertUnorderedList" title="无序列表">
                    <i class="ri-list-unordered"></i>
                </button>
                <button class="toolbar-btn" data-command="insertOrderedList" title="有序列表">
                    <i class="ri-list-ordered"></i>
                </button>
            </div>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-command="justifyLeft" title="左对齐">
                    <i class="ri-align-left"></i>
                </button>
                <button class="toolbar-btn" data-command="justifyCenter" title="居中">
                    <i class="ri-align-center"></i>
                </button>
                <button class="toolbar-btn" data-command="justifyRight" title="右对齐">
                    <i class="ri-align-right"></i>
                </button>
            </div>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-command="undo" title="撤销 (Ctrl+Z)">
                    <i class="ri-arrow-go-back-line"></i>
                </button>
                <button class="toolbar-btn" data-command="redo" title="重做 (Ctrl+Y)">
                    <i class="ri-arrow-go-forward-line"></i>
                </button>
            </div>
        `;

        // 绑定工具栏事件
        toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                document.execCommand(command, false, null);
                this.$('#editor').focus();
            });
        });

        const headingSelect = toolbar.querySelector('#heading-select');
        if (headingSelect) {
            headingSelect.addEventListener('change', (e) => {
                document.execCommand('formatBlock', false, e.target.value);
                this.$('#editor').focus();
            });
        }
    }

    onContentChange() {
        // 标记为未保存
        this.contentChanged = true;
        this.setState({ saveStatus: 'unsaved' });

        // 使用防抖策略：停止输入3秒后自动保存
        if (this.debounceSaveTimer) {
            clearTimeout(this.debounceSaveTimer);
        }
        this.debounceSaveTimer = setTimeout(async () => {
            if (this.contentChanged && !this.state.saving) {
                await this.saveContent();
            }
        }, 3000);
    }

    startAutoSave() {
        // 防抖策略已在 onContentChange 中实现
        // 这里添加一个兜底的定时检查（每30秒）
        this.autoSaveTimer = setInterval(async () => {
            if (this.contentChanged && !this.state.saving) {
                await this.saveContent();
            }
        }, 30000);
    }

    async saveContent(showToast = false) {
        const editor = this.$('#editor');
        if (!editor) return;

        const content = editor.innerHTML;

        // 转换为文档格式
        const docContent = JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: editor.innerText }] }]
        });

        if (docContent === this.lastSavedContent) {
            this.contentChanged = false;
            this.setState({ saveStatus: 'saved' });
            return;
        }

        this.setState({ saving: true, saveStatus: 'saving' });

        try {
            await OfficeApi.updateContent(this.documentId, {
                content: docContent,
                version: this.state.document.version,
                create_version: false
            });

            this.lastSavedContent = docContent;
            this.contentChanged = false;
            this.state.document.version++;

            this.setState({ saving: false, saveStatus: 'saved' });

            if (showToast) {
                Toast.success('保存成功');
            }
        } catch (err) {
            console.error('保存失败:', err);
            this.setState({ saving: false, saveStatus: 'unsaved' });
            Toast.error('保存失败，请重试');
        }
    }

    connectWebSocket() {
        const token = Utils.getToken();
        if (!token) return;

        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/office/ws/${this.documentId}?token=${token}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('协同连接已建立');
                this.setState({ connected: true });
                this.loadOnlineEditors();

                // 启用协同编辑器
                if (this.collabEditor) {
                    this.collabEditor.enable(this.ws);
                }
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                console.log('协同连接已断开');
                this.setState({ connected: false });
                // 尝试重连
                setTimeout(() => this.connectWebSocket(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
        } catch (err) {
            console.error('WebSocket连接失败:', err);
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'join':
                this.loadOnlineEditors();
                Toast.info(`${message.data.user_name} 加入了编辑`);
                break;
            case 'leave':
                this.loadOnlineEditors();
                this.removeCursor(message.data.user_id);
                break;
            case 'cursor':
                // 显示其他用户的光标位置
                this.showRemoteCursor(message.data);
                break;
            case 'content':
                // 接收其他用户的内容更新 - 使用OT引擎处理
                if (this.collabEditor && message.data.op) {
                    this.collabEditor.receiveOp(message.data.op);
                } else {
                    // 后备方案：显示提示
                    Toast.info(`${message.data.user_name} 正在编辑文档...`);
                }
                break;
            case 'comment_add':
                // 新评论通知
                Toast.info(`${message.data.user_name} 添加了评论`);
                // 如果评论面板已打开，刷新列表
                if (this.$('#comments-panel')?.style.display !== 'none') {
                    this.loadComments();
                }
                break;
        }
    }

    // 显示远程用户光标
    showRemoteCursor(data) {
        const { user_id, user_name, position } = data;
        let cursorEl = this.$(`#remote-cursor-${user_id}`);

        if (!cursorEl) {
            // 创建光标元素
            cursorEl = document.createElement('div');
            cursorEl.id = `remote-cursor-${user_id}`;
            cursorEl.className = 'remote-cursor';
            cursorEl.innerHTML = `
                <div class="cursor-line"></div>
                <div class="cursor-label">${Utils.escapeHtml(user_name)}</div>
            `;
            // 随机颜色
            const colors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#009688', '#ff5722'];
            const color = colors[user_id % colors.length];
            cursorEl.style.setProperty('--cursor-color', color);

            const editorContainer = this.$('.doc-editor-container');
            if (editorContainer) {
                editorContainer.appendChild(cursorEl);
            }
        }

        // 更新位置（简化处理）
        if (position) {
            cursorEl.style.display = 'block';
            // 设置定时器隐藏（用户不活跃时）
            if (cursorEl._hideTimer) clearTimeout(cursorEl._hideTimer);
            cursorEl._hideTimer = setTimeout(() => {
                cursorEl.style.opacity = '0.3';
            }, 5000);
            cursorEl.style.opacity = '1';
        }
    }

    // 移除远程光标
    removeCursor(userId) {
        const cursorEl = this.$(`#remote-cursor-${userId}`);
        if (cursorEl) {
            cursorEl.remove();
        }
    }

    async loadOnlineEditors() {
        try {
            const res = await OfficeApi.getOnlineEditors(this.documentId);
            this.setState({ onlineEditors: res.data || [] });
        } catch (err) {
            console.error('获取在线编辑者失败:', err);
        }
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        // 返回
        this.on('#btn-back', 'click', async () => {
            if (this.contentChanged) {
                await this.saveContent();
            }
            Router.push('/office/list');
        });

        // 标题更新
        const titleInput = this.$('#doc-title');
        if (titleInput) {
            titleInput.addEventListener('blur', async () => {
                const newTitle = titleInput.value.trim();
                if (newTitle && newTitle !== this.state.document.title) {
                    try {
                        await OfficeApi.update(this.documentId, { title: newTitle });
                        this.state.document.title = newTitle;
                    } catch (err) {
                        Toast.error('更新标题失败');
                    }
                }
            });
        }

        // 分享
        this.on('#btn-share', 'click', () => {
            this.showShareModal();
        });

        // 版本历史
        this.on('#btn-history', 'click', () => {
            this.showVersionsModal();
        });

        // 导出文档
        this.on('#btn-export', 'click', () => {
            this.exportDocument();
        });

        // 评论批注
        this.on('#btn-comment', 'click', () => {
            this.toggleCommentsPanel();
        });

        // 关闭评论面板
        this.on('.btn-close-comments', 'click', () => {
            this.toggleCommentsPanel(false);
        });

        // 添加评论
        this.on('#btn-add-comment', 'click', async () => {
            await this.addComment();
        });
    }

    // 切换评论面板
    toggleCommentsPanel(show = null) {
        const panel = this.$('#comments-panel');
        if (!panel) return;

        const shouldShow = show !== null ? show : panel.style.display === 'none';
        panel.style.display = shouldShow ? 'flex' : 'none';

        if (shouldShow) {
            this.loadComments();
        }
    }

    // 加载评论列表
    async loadComments() {
        try {
            const res = await OfficeApi.getComments(this.documentId);
            const comments = res.data || [];
            this.renderComments(comments);
        } catch (err) {
            console.error('加载评论失败:', err);
        }
    }

    // 渲染评论列表
    renderComments(comments) {
        const container = this.$('#comments-list');
        if (!container) return;

        if (comments.length === 0) {
            container.innerHTML = '<p class="empty-hint">暂无评论</p>';
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="comment-item ${comment.is_resolved ? 'resolved' : ''}" data-id="${comment.id}">
                <div class="comment-header">
                    <img src="${comment.user_avatar || '/static/images/default-avatar.png'}" alt="" class="comment-avatar">
                    <span class="comment-author">${Utils.escapeHtml(comment.user_name)}</span>
                    <span class="comment-time">${Utils.timeAgo(comment.created_at)}</span>
                </div>
                ${comment.selected_text ? `
                    <div class="comment-quote">"${Utils.escapeHtml(comment.selected_text)}"</div>
                ` : ''}
                <div class="comment-content">${Utils.escapeHtml(comment.content)}</div>
                <div class="comment-actions">
                    ${!comment.is_resolved ? `
                        <button class="btn btn-text btn-sm btn-resolve" title="标记为已解决">
                            <i class="ri-check-line"></i> 解决
                        </button>
                    ` : `
                        <button class="btn btn-text btn-sm btn-reopen" title="重新打开">
                            <i class="ri-refresh-line"></i> 重开
                        </button>
                    `}
                    <button class="btn btn-text btn-sm btn-delete-comment" title="删除">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
                ${comment.replies.length > 0 ? `
                    <div class="comment-replies">
                        ${comment.replies.map(reply => `
                            <div class="reply-item" data-id="${reply.id}">
                                <img src="${reply.user_avatar || '/static/images/default-avatar.png'}" alt="" class="reply-avatar">
                                <div class="reply-content">
                                    <span class="reply-author">${Utils.escapeHtml(reply.user_name)}</span>
                                    <span class="reply-text">${Utils.escapeHtml(reply.content)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="comment-reply-input">
                    <input type="text" placeholder="回复..." class="form-input form-input-sm reply-input">
                    <button class="btn btn-sm btn-primary btn-reply">回复</button>
                </div>
            </div>
        `).join('');

        // 绑定评论操作事件
        this.bindCommentEvents();
    }

    // 绑定评论事件
    bindCommentEvents() {
        // 解决评论
        this.$$('.btn-resolve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const commentId = parseInt(e.target.closest('.comment-item').dataset.id);
                try {
                    await OfficeApi.resolveComment(commentId);
                    Toast.success('评论已解决');
                    this.loadComments();
                } catch (err) {
                    Toast.error('操作失败');
                }
            });
        });

        // 重新打开评论
        this.$$('.btn-reopen').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const commentId = parseInt(e.target.closest('.comment-item').dataset.id);
                try {
                    await OfficeApi.reopenComment(commentId);
                    Toast.success('评论已重新打开');
                    this.loadComments();
                } catch (err) {
                    Toast.error('操作失败');
                }
            });
        });

        // 删除评论
        this.$$('.btn-delete-comment').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const commentId = parseInt(e.target.closest('.comment-item').dataset.id);
                const confirmed = await Modal.confirm({
                    title: '删除评论',
                    content: '确定要删除这条评论吗？'
                });
                if (!confirmed) return;

                try {
                    await OfficeApi.deleteComment(commentId);
                    Toast.success('评论已删除');
                    this.loadComments();
                } catch (err) {
                    Toast.error('删除失败');
                }
            });
        });

        // 回复评论
        this.$$('.btn-reply').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const item = e.target.closest('.comment-item');
                const parentId = parseInt(item.dataset.id);
                const input = item.querySelector('.reply-input');
                const content = input.value.trim();

                if (!content) {
                    Toast.warning('请输入回复内容');
                    return;
                }

                try {
                    await OfficeApi.addComment(this.documentId, {
                        content,
                        parent_id: parentId
                    });
                    input.value = '';
                    Toast.success('回复已发送');
                    this.loadComments();
                } catch (err) {
                    Toast.error('回复失败');
                }
            });
        });
    }

    // 添加评论
    async addComment() {
        const textarea = this.$('#new-comment');
        if (!textarea) return;

        const content = textarea.value.trim();
        if (!content) {
            Toast.warning('请输入评论内容');
            return;
        }

        // 获取选中的文本
        const selection = window.getSelection();
        let selectedText = null;
        let selectionStart = null;
        let selectionEnd = null;

        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            selectedText = selection.toString().substring(0, 500);
        }

        try {
            await OfficeApi.addComment(this.documentId, {
                content,
                selected_text: selectedText,
                selection_start: selectionStart,
                selection_end: selectionEnd
            });
            textarea.value = '';
            Toast.success('评论已添加');
            this.loadComments();
        } catch (err) {
            Toast.error('添加评论失败');
        }
    }

    // 分享模态框
    showShareModal() {
        const doc = this.state.document;
        if (!doc) return;

        Modal.form({
            title: '分享设置',
            fields: [
                {
                    name: 'share_type',
                    label: '分享方式',
                    type: 'select',
                    value: doc.share_type || 'private',
                    options: [
                        { value: 'private', label: '私有 - 仅自己和协作者可见' },
                        { value: 'link', label: '链接分享 - 知道链接的人可访问' },
                        { value: 'public', label: '公开 - 所有人可见' }
                    ]
                },
                {
                    name: 'share_permission',
                    label: '权限',
                    type: 'select',
                    value: doc.share_permission || 'view',
                    options: [
                        { value: 'view', label: '只读' },
                        { value: 'edit', label: '可编辑' }
                    ]
                }
            ],
            onSubmit: async (data) => {
                try {
                    const res = await OfficeApi.updateShare(this.documentId, data);
                    this.state.document.share_type = data.share_type;
                    this.state.document.share_code = res.data.share_code;

                    if (data.share_type !== 'private' && res.data.share_code) {
                        const shareUrl = `${window.location.origin}/#/office/share/${res.data.share_code}`;
                        await navigator.clipboard.writeText(shareUrl);
                        Toast.success('分享链接已复制到剪贴板');
                    } else {
                        Toast.success('分享设置已更新');
                    }
                    return true;
                } catch (err) {
                    Toast.error('更新失败');
                    return false;
                }
            }
        });
    }

    // 版本历史模态框
    async showVersionsModal() {
        try {
            const res = await OfficeApi.getVersions(this.documentId);
            const versions = res.data.items || [];

            let content = `
                <div class="versions-list">
                    ${versions.length === 0
                    ? '<p class="empty-hint">暂无版本历史，保存时勾选“创建版本快照”可生成版本</p>'
                    : versions.map(v => `
                            <div class="version-item" data-version-id="${v.id}">
                                <div class="version-info">
                                    <span class="version-num">版本 ${v.version}</span>
                                    <span class="version-time">${Utils.formatDate(v.created_at)}</span>
                                    <span class="version-user">${Utils.escapeHtml(v.user_name || '未知用户')}</span>
                                </div>
                                ${v.comment ? `<p class="version-comment">${Utils.escapeHtml(v.comment)}</p>` : ''}
                                <button class="btn btn-sm btn-text btn-restore">恢复此版本</button>
                            </div>
                        `).join('')}
                </div>
            `;

            Modal.show({
                title: '版本历史',
                content,
                buttons: [{ text: '关闭', type: 'secondary' }],
                onMounted: (modal) => {
                    modal.querySelectorAll('.btn-restore').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const item = e.target.closest('.version-item');
                            const versionId = parseInt(item.dataset.versionId);

                            const confirmed = await Modal.confirm({
                                title: '恢复版本',
                                content: '确定要恢复到此版本吗？当前内容将被保存为新版本。'
                            });

                            if (!confirmed) return;

                            try {
                                await OfficeApi.restoreVersion(this.documentId, versionId);
                                Toast.success('版本已恢复，请刷新页面');
                                Modal.close();
                                // 重新加载文档
                                await this.loadData();
                                this.initEditor();
                            } catch (err) {
                                Toast.error('恢复失败');
                            }
                        });
                    });
                }
            });
        } catch (err) {
            Toast.error('获取版本历史失败');
        }
    }

    // 导出文档
    exportDocument() {
        const editor = this.$('#editor');
        if (!editor) return;

        const doc = this.state.document;
        const content = editor.innerHTML;
        const title = doc.title || '未命名文档';

        // 生成HTML文件
        const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${Utils.escapeHtml(title)}</title>
    <style>
        body {
            font-family: 'Georgia', serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.8;
            color: #333;
        }
        h1 { font-size: 2rem; margin: 1rem 0; }
        h2 { font-size: 1.5rem; margin: 0.8rem 0; }
        h3 { font-size: 1.25rem; margin: 0.6rem 0; }
        p { margin: 0.5rem 0; }
        ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
    </style>
</head>
<body>
    <h1>${Utils.escapeHtml(title)}</h1>
    ${content}
</body>
</html>
        `.trim();

        // 创建下载
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.html`;
        a.click();
        URL.revokeObjectURL(url);

        Toast.success('文档已导出');
    }

    destroy() {
        // 保存内容
        if (this.contentChanged) {
            this.saveContent();
        }

        // 清理防抖定时器
        if (this.debounceSaveTimer) {
            clearTimeout(this.debounceSaveTimer);
        }

        // 清理兜底定时器
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // 禁用协同编辑器
        if (this.collabEditor) {
            this.collabEditor.disable();
        }

        // 关闭WebSocket
        if (this.ws) {
            this.ws.close();
        }

        // 移除事件监听
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        document.removeEventListener('keydown', this.handleKeyDown);

        super.destroy();
    }
}


// ==================== 表格编辑页（Excel类） ====================

class OfficeSheetPage extends Component {
    constructor(container, documentId = null) {
        super(container);
        this.documentId = documentId;
        this.state = {
            document: null,
            loading: true,
            saving: false,
            saveStatus: 'saved',
            onlineEditors: [],
            connected: false
        };
        this.spreadsheet = null;
        this.ws = null;
        this.debounceSaveTimer = null;
        this.autoSaveTimer = null;
        this.lastSavedContent = null;
        this.contentChanged = false;

        // 绑定离开页面提醒
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        window.addEventListener('beforeunload', this.handleBeforeUnload);

        // 绑定全局快捷键
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    handleBeforeUnload(e) {
        if (this.contentChanged) {
            e.preventDefault();
            e.returnValue = '您有未保存的更改，确定要离开吗？';
            return e.returnValue;
        }
    }

    handleKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (this.contentChanged && !this.state.saving) {
                this.saveContent(true);
            } else if (!this.contentChanged) {
                Toast.info('表格已是最新状态');
            }
        }
    }

    async loadData() {
        if (!this.documentId) {
            this.setState({ loading: false });
            return;
        }

        try {
            const res = await OfficeApi.get(this.documentId);
            this.setState({
                document: res.data,
                loading: false
            });
            this.lastSavedContent = res.data.content;
        } catch (err) {
            Toast.error('加载表格失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { document, loading, saving, onlineEditors, connected } = this.state;

        if (loading) {
            return `
                <div class="page-office-sheet">
                    <div class="loading-container">
                        <div class="loader"></div>
                        <p>正在加载表格...</p>
                    </div>
                </div>
            `;
        }

        if (!document) {
            return `
                <div class="page-office-sheet">
                    <div class="empty-state">
                        <i class="ri-file-damage-line"></i>
                        <p>表格不存在或无权访问</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="page-office-sheet">
                <div class="sheet-header">
                    <div class="header-left">
                        <button class="btn btn-icon" id="btn-back" title="返回">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <input type="text" class="sheet-title-input" id="sheet-title" 
                            value="${Utils.escapeHtml(document.title)}" placeholder="无标题表格">
                    </div>
                    <div class="header-center">
                        <span class="save-status ${this.state.saveStatus}" title="Ctrl+S 快捷保存">
                            ${this.state.saveStatus === 'saving' ? '保存中...' :
                this.state.saveStatus === 'unsaved' ? '未保存' : '已保存'}
                        </span>
                    </div>
                    <div class="header-right">
                        <div class="online-editors">
                            ${onlineEditors.map(u => `
                                <div class="editor-avatar" title="${Utils.escapeHtml(u.user_name)}">
                                    <img src="${u.user_avatar || '/static/images/default-avatar.png'}" alt="">
                                </div>
                            `).join('')}
                        </div>
                        <span class="connection-status ${connected ? 'connected' : 'disconnected'}">
                            <i class="ri-${connected ? 'wifi-line' : 'wifi-off-line'}"></i>
                        </span>
                        <button class="btn btn-icon" id="btn-export" title="导出">
                            <i class="ri-download-line"></i>
                        </button>
                        <button class="btn btn-icon" id="btn-share" title="分享">
                            <i class="ri-share-line"></i>
                        </button>
                    </div>
                </div>
                
                <div class="sheet-container" id="sheet-container">
                    <!-- 表格由Luckysheet渲染 -->
                    <div class="sheet-placeholder">
                        <p>正在初始化表格编辑器...</p>
                        <p class="hint">提示：实际项目中将集成 Luckysheet 实现完整的 Excel 功能</p>
                    </div>
                </div>
            </div>
        `;
    }

    async afterMount() {
        await this.loadData();
        if (this.state.document) {
            this.initSpreadsheet();
            this.connectWebSocket();
            this.startAutoSave();
        }
    }

    initSpreadsheet() {
        // 创建一个特定的 Luckysheet ID 容器，避免与 Component 的 container 冲突
        const containerId = `luckysheet-${this.documentId}`;
        const container = this.$('#sheet-container');
        if (!container) return;

        // 清空容器并添加 Luckysheet 专用 div
        container.innerHTML = `<div id="${containerId}" style="margin:0px;padding:0px;position:absolute;width:100%;height:100%;left:0px;top:0px;"></div>`;

        // 解析表格内容
        let sheetData = [{
            name: 'Sheet1',
            index: 0,
            status: 1,
            order: 0,
            celldata: [],
            config: {}
        }];

        if (this.state.document.content) {
            try {
                sheetData = JSON.parse(this.state.document.content);
                // 确保数据格式正确
                if (!Array.isArray(sheetData)) {
                    sheetData = [sheetData];
                }
            } catch (e) {
                console.warn('解析表格内容失败，使用默认内容');
            }
        }

        // 初始化 Luckysheet
        if (typeof luckysheet !== 'undefined') {
            luckysheet.create({
                container: containerId,
                lang: 'zh',
                showinfobar: false,
                data: sheetData,
                hook: {
                    updated: () => {
                        this.onContentChange();
                    },
                    cellUpdated: () => {
                        this.onContentChange();
                    }
                }
            });
        } else {
            container.innerHTML = '<div class="sheet-placeholder"><p>Luckysheet 加载失败，请检查网络</p></div>';
        }
    }

    onContentChange() {
        this.contentChanged = true;
        this.setState({ saveStatus: 'unsaved' });

        // 防抖保存
        if (this.debounceSaveTimer) {
            clearTimeout(this.debounceSaveTimer);
        }
        this.debounceSaveTimer = setTimeout(async () => {
            if (this.contentChanged && !this.state.saving) {
                await this.saveContent();
            }
        }, 3000);
    }

    renderSimpleSheet(sheetData) {
        const sheet = sheetData[0] || {};
        const celldata = sheet.celldata || [];

        // 构建单元格数据映射
        const cellMap = {};
        celldata.forEach(cell => {
            const key = `${cell.r}_${cell.c}`;
            cellMap[key] = cell.v?.v || cell.v || '';
        });

        // 生成表格HTML
        const rows = 50;
        const cols = 26;

        let html = '<table class="simple-sheet">';

        // 表头（列名）
        html += '<thead><tr><th></th>';
        for (let c = 0; c < cols; c++) {
            html += `<th>${String.fromCharCode(65 + c)}</th>`;
        }
        html += '</tr></thead>';

        // 表体
        html += '<tbody>';
        for (let r = 0; r < rows; r++) {
            html += `<tr><td class="row-header">${r + 1}</td>`;
            for (let c = 0; c < cols; c++) {
                const value = cellMap[`${r}_${c}`] || '';
                html += `<td class="cell" data-row="${r}" data-col="${c}" contenteditable="true">${Utils.escapeHtml(value)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        return html;
    }

    bindSheetEvents() {
        // Luckysheet 通过 hook 处理大多数事件，这里保留用于其他自定义交互
    }

    startAutoSave() {
        // 兜底保存（每30秒）
        this.autoSaveTimer = setInterval(async () => {
            if (this.contentChanged && !this.state.saving) {
                await this.saveContent();
            }
        }, 30000);
    }

    async saveContent(showToast = false) {
        if (typeof luckysheet === 'undefined') return;

        // 获取所有工作表数据
        const sheets = luckysheet.getAllSheets();
        // 简单处理：移除由于 Luckysheet 运行产生的循环引用或非必要数据（Luckysheet内部会处理，但这里为了后端存储轻量化）
        const content = JSON.stringify(sheets);

        if (content === this.lastSavedContent) {
            this.contentChanged = false;
            this.setState({ saveStatus: 'saved' });
            return;
        }

        this.setState({ saving: true, saveStatus: 'saving' });

        try {
            await OfficeApi.updateContent(this.documentId, {
                content,
                version: this.state.document.version,
                create_version: false
            });

            this.lastSavedContent = content;
            this.contentChanged = false;
            this.state.document.version++;

            this.setState({ saving: false, saveStatus: 'saved' });

            if (showToast) {
                Toast.success('保存成功');
            }
        } catch (err) {
            console.error('保存失败:', err);
            this.setState({ saving: false, saveStatus: 'unsaved' });
            Toast.error('保存失败，请重试');
        }
    }

    connectWebSocket() {
        // 与文档编辑器相同的WebSocket逻辑
        const token = Utils.getToken();
        if (!token) return;

        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/office/ws/${this.documentId}?token=${token}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.setState({ connected: true });
                this.loadOnlineEditors();
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                this.setState({ connected: false });
                setTimeout(() => this.connectWebSocket(), 3000);
            };
        } catch (err) {
            console.error('WebSocket连接失败:', err);
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'join':
            case 'leave':
                this.loadOnlineEditors();
                break;
        }
    }

    async loadOnlineEditors() {
        try {
            const res = await OfficeApi.getOnlineEditors(this.documentId);
            this.setState({ onlineEditors: res.data || [] });
        } catch (err) {
            console.error('获取在线编辑者失败:', err);
        }
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        this.on('#btn-back', 'click', async () => {
            if (this.contentChanged) {
                await this.saveContent();
            }
            Router.push('/office/list');
        });

        const titleInput = this.$('#sheet-title');
        if (titleInput) {
            titleInput.addEventListener('blur', async () => {
                const newTitle = titleInput.value.trim();
                if (newTitle && newTitle !== this.state.document.title) {
                    try {
                        await OfficeApi.update(this.documentId, { title: newTitle });
                        this.state.document.title = newTitle;
                    } catch (err) {
                        Toast.error('更新标题失败');
                    }
                }
            });
        }

        this.on('#btn-export', 'click', () => {
            this.exportSheet();
        });
    }

    exportSheet() {
        if (typeof luckysheet === 'undefined') return;

        // Luckysheet 本身不支持直接导出文本，需要借助插件或手动处理
        // 这里沿用之前的导出思路，但从 Luckysheet 获取数据
        const sheet = luckysheet.getAllSheets()[0];
        const celldata = sheet.celldata || [];

        const data = [];
        let maxRow = 0;
        let maxCol = 0;

        celldata.forEach(item => {
            const r = item.r;
            const c = item.c;
            const v = item.v?.v || item.v || '';

            if (v) {
                if (!data[r]) data[r] = [];
                data[r][c] = v;
                if (r > maxRow) maxRow = r;
                if (c > maxCol) maxCol = c;
            }
        });

        // 填充空单元格
        for (let r = 0; r <= maxRow; r++) {
            if (!data[r]) data[r] = [];
            for (let c = 0; c <= maxCol; c++) {
                if (!data[r][c]) data[r][c] = '';
            }
        }

        Utils.exportToCSV(data, this.state.document.title || '表格');
        Toast.success('导出成功');
    }

    destroy() {
        if (this.contentChanged) {
            this.saveContent();
        }

        if (this.debounceSaveTimer) {
            clearTimeout(this.debounceSaveTimer);
        }

        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        if (this.ws) {
            this.ws.close();
        }

        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        document.removeEventListener('keydown', this.handleKeyDown);

        super.destroy();
    }
}

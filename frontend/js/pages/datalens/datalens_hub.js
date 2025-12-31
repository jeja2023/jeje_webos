/**
 * DataLens Hub 模块 - 主页列表、搜索与分类
 */

const DataLensHubMixin = {
    async _loadHubData() {
        this.setState({ loading: true });
        try {
            const [overviewRes, categoriesRes, viewsRes] = await Promise.all([
                LensApi.getOverview(),
                LensApi.getCategories(),
                LensApi.getViews()
            ]);

            this.setState({
                overview: overviewRes.data,
                categories: categoriesRes.data || [],
                views: viewsRes.data || [],
                loading: false
            });
        } catch (e) {
            console.error('加载数据失败:', e);
            this.setState({ loading: false });
            Toast.error('加载数据失败');
        }
    },

    async _loadViews(categoryId = null, search = '') {
        try {
            const params = {};
            if (categoryId) params.category_id = categoryId;
            if (search) params.search = search;

            const res = await LensApi.getViews(params);
            this.setState({ views: res.data || [] });
        } catch (e) {
            console.error('加载视图列表失败:', e);
        }
    },

    async _toggleFavorite(viewId, currentState) {
        try {
            if (currentState) {
                await LensApi.removeFavorite(viewId);
            } else {
                await LensApi.addFavorite(viewId);
            }

            // 更新视图列表中的收藏状态
            const { views } = this.state;
            const updatedViews = views.map(v =>
                v.id === viewId ? { ...v, is_favorited: !currentState } : v
            );
            this.setState({ views: updatedViews });

            Toast.success(currentState ? '已取消收藏' : '已添加收藏');
        } catch (e) {
            Toast.error('操作失败');
        }
    },

    _toggleStartMenuShortcut(view, isSaved) {
        try {
            const user = Store.get('user');
            if (!user) {
                Toast.error('请先登录');
                return;
            }

            // 从用户设置中获取现有的快捷方式 (稳定性保证)
            let shortcuts = user.settings?.start_menu_shortcuts || [];
            if (!Array.isArray(shortcuts)) shortcuts = [];

            if (isSaved) {
                // 移除
                shortcuts = shortcuts.filter(s =>
                    !(s.type === 'datalens' && s.view_id === view.id)
                );
                Toast.success('已从开始菜单移除');
            } else {
                // 添加
                const newShortcut = {
                    id: `datalens_view_${view.id}`,
                    name: view.name,
                    icon: view.icon || '📊',
                    path: `/lens/view/${view.id}`,
                    type: 'datalens',
                    view_id: view.id
                };
                // 冗余检查
                if (!shortcuts.some(s => s.type === 'datalens' && s.view_id === view.id)) {
                    shortcuts.push(newShortcut);
                }
                Toast.success('已固定到开始菜单');
            }

            // 更新本地 Store (触发 UI 刷新)
            const newSettings = {
                ...(user.settings || {}),
                start_menu_shortcuts: shortcuts
            };
            const updatedUser = { ...user, settings: newSettings };
            Store.set('user', updatedUser);

            // 清理 localStorage 中的冗余 DataLens 数据 (现在由后端 UserSettings 统一管理)
            const STORAGE_KEY = 'jeje_pinned_apps';
            let localPinned = [];
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    localPinned = JSON.parse(saved);
                    if (Array.isArray(localPinned)) {
                        localPinned = localPinned.filter(app =>
                            !(typeof app === 'object' && app.type === 'datalens' && app.view_id === view.id)
                        );
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(localPinned));
                    }
                }
            } catch (e) { }

            // 同步到后端
            if (window.UserApi) {
                UserApi.updateProfile({ settings: newSettings }).catch(err => {
                    console.error('[DataLens] 同步快捷方式到后端失败:', err);
                });
            }

            // 触发 storage 事件以便开始菜单等系统组件同步 (兼容性支持)
            window.dispatchEvent(new StorageEvent('storage', {
                key: STORAGE_KEY,
                newValue: JSON.stringify(localPinned)
            }));

            // 更新本地视图列表状态
            const { views } = this.state;
            const updatedViews = views.map(v => {
                if (v.id === view.id) {
                    return { ...v, _pinned_updated: Date.now() };
                }
                return v;
            });
            this.setState({ views: updatedViews });

        } catch (e) {
            console.error('[DataLens] 固定快捷方式失败:', e);
            Toast.error('操作失败: ' + (e.message || '未知错误'));
        }
    },

    _renderHub() {
        const { categories, views, currentCategory, searchQuery, overview } = this.state;

        return `
            <div class="lens-hub animate-fade-in">
                <div class="lens-sidebar">
                    <div class="lens-sidebar-section">
                        <div class="lens-sidebar-label">常用</div>
                        <div class="lens-sidebar-item ${!currentCategory && !this.state.showFavorites && !this.state.showRecent ? 'active' : ''}" data-category="all">
                            <span class="lens-sidebar-icon">🏠</span>
                            <span class="lens-sidebar-text">全部视图</span>
                        </div>
                        <div class="lens-sidebar-item ${this.state.showFavorites ? 'active' : ''}" data-category="favorites">
                            <span class="lens-sidebar-icon">⭐</span>
                            <span class="lens-sidebar-text">我的收藏</span>
                        </div>
                        <div class="lens-sidebar-item ${this.state.showRecent ? 'active' : ''}" data-category="recent">
                            <span class="lens-sidebar-icon">🕒</span>
                            <span class="lens-sidebar-text">最近浏览</span>
                        </div>
                    </div>
                    
                    <div class="lens-sidebar-section">
                        <div class="lens-sidebar-label">业务分类</div>
                        ${categories.map(c => `
                            <div class="lens-sidebar-item ${currentCategory === c.id ? 'active' : ''}" data-category="${c.id}">
                                <span class="lens-sidebar-icon">${c.icon || '📁'}</span>
                                <span class="lens-sidebar-text">${c.name}</span>
                                ${c.view_count ? `<span class="lens-category-count">${c.view_count}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>

                    <div class="lens-sidebar-footer">
                        <div class="lens-sidebar-label">系统管理</div>
                        ${this._hasPermission('datalens:source:manage') || this._hasPermission('datalens:admin') ? `
                            <div class="lens-sidebar-item" id="lens-manage-sources">
                                <span class="lens-sidebar-icon">🔌</span>
                                <span class="lens-sidebar-text">数据源管理</span>
                            </div>
                        ` : ''}
                        ${this._hasPermission('datalens:category:manage') || this._hasPermission('datalens:admin') ? `
                            <div class="lens-sidebar-item" id="lens-manage-categories">
                                <span class="lens-sidebar-icon">📂</span>
                                <span class="lens-sidebar-text">分类管理</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="lens-main">
                    <div class="lens-hub-header">
                        <div class="lens-search-bar">
                            <span class="lens-search-icon">🔍</span>
                            <input type="text" id="lens-hub-search" placeholder="搜索视图名称、描述或作者..." value="${searchQuery || ''}">
                        </div>
                    </div>
                    
                    <div class="lens-hub-content">
                        <div class="lens-section-title">
                            ${this._getCategoryTitle(currentCategory)}
                            <span class="lens-count">${views.length}</span>
                        </div>
                        <div class="lens-view-grid">
                            ${this._renderViewCards(views)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    _getCategoryTitle(categoryId) {
        if (this.state.showFavorites) return '我的收藏';
        if (this.state.showRecent) return '最近浏览';
        if (!categoryId) return '全部视图';
        const cat = this.state.categories.find(c => c.id === categoryId);
        return cat ? cat.name : '未知分类';
    },

    _renderViewCards(views) {
        if (views.length === 0) {
            return `
                <div class="lens-empty" style="grid-column: 1 / -1; width: 100%;">
                    <div class="lens-empty-icon">📊</div>
                    <div class="lens-empty-text">暂无符合条件的视图</div>
                    <div class="lens-empty-hint" style="font-size: 14px; color: var(--text-muted); margin-top: 8px;">
                        点击右上角「新建视图」创建您的第一个数据视图
                    </div>
                </div>
            `;
        }

        // 获取用户已固定的快捷方式（优先从后端同步的设置中获取）
        const user = Store.get('user');
        const pinnedShortcuts = user?.settings?.start_menu_shortcuts || [];

        // 同时也兼容一下本地缓存（用于即时状态展示）
        let localPinned = [];
        try {
            const saved = localStorage.getItem('jeje_pinned_apps');
            localPinned = saved ? JSON.parse(saved) : [];
        } catch (e) { }

        // 检查视图是否在开始菜单中 (包含后端同步的与本地暂存的)
        const isPinned = (viewId) => {
            return pinnedShortcuts.some(s => s.type === 'datalens' && s.view_id === viewId) ||
                localPinned.some(app => typeof app === 'object' && app.type === 'datalens' && app.view_id === viewId);
        };

        return views.map(view => {
            const pinned = isPinned(view.id);
            // 格式化日期时间到时分秒
            const dateStr = view.updated_at ? Utils.formatDate(view.updated_at, 'YYYY-MM-DD HH:mm:ss') : '未知';
            // 获取创建者名称
            const ownerName = view.creator_name || view.created_by_name || view.owner_name || `用户${view.created_by || view.owner_id || ''}`;
            return `
                <div class="lens-view-card animate-slide-up" data-id="${view.id}">
                    <div class="lens-view-card-icon">${view.icon || '📊'}</div>
                    <div class="lens-view-card-body">
                        <div class="lens-view-card-name">${Utils.escapeHtml(view.name)}</div>
                        <div class="lens-view-card-desc">${Utils.escapeHtml(view.description || '暂无描述')}</div>
                        <div class="lens-view-card-meta">
                            <span>👤 ${Utils.escapeHtml(ownerName)}</span>
                            <span>📅 ${dateStr}</span>
                        </div>
                    </div>
                    <div class="lens-view-card-actions">
                        <button class="lens-view-card-btn favorite ${view.is_favorited ? 'active' : ''}" 
                                data-id="${view.id}" 
                                title="${view.is_favorited ? '取消收藏' : '收藏'}">
                            ${view.is_favorited ? '⭐' : '☆'}
                        </button>
                        <button class="lens-view-card-btn pin ${pinned ? 'active' : ''}" 
                                data-id="${view.id}"
                                data-active="${pinned}"
                                title="${pinned ? '从开始菜单移除' : '固定到开始菜单'}">
                            ${pinned ? '📍' : '📌'}
                        </button>
                        ${this._hasPermission('datalens:admin') || view.owner_id === Store.get('user')?.id ? `
                            <button class="lens-view-card-btn edit" data-id="${view.id}" title="编辑">✏️</button>
                            <button class="lens-view-card-btn delete" data-id="${view.id}" title="删除">🗑️</button>
                        ` : ''}
                    </div>
                </div>
            `}).join('');
    }
};

// 混入到 DataLensPage
if (typeof DataLensPage !== 'undefined') {
    Object.assign(DataLensPage.prototype, DataLensHubMixin);
}


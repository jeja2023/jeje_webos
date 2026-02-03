/**
 * DataLens 数据透镜模块
 * 系统的万能视窗 - 支持连接多种外部数据源进行数据查看
 */

/**
 * DataLens 主页面
 */
class DataLensPage extends Component {
    constructor(container, viewId) {
        super(container);
        // 是否处于独立视图模式（由独立窗口或路由打开）
        const singleViewId = viewId ? parseInt(viewId) : null;

        this.state = {
            // 当前模式：hub（首页）、viewer（浏览）
            mode: singleViewId ? 'viewer' : 'hub',
            isSingleView: !!singleViewId,
            singleViewId: singleViewId,
            // Hub 数据
            overview: null,
            categories: [],
            views: [],
            // 当前选中的分类
            currentCategory: null,
            searchQuery: '',
            // 查看状态
            showFavorites: false,
            showRecent: false,
            // 打开的标签页
            openTabs: [],
            activeTabId: null,
            // 加载状态
            loading: !!singleViewId
        };

        // 单例引用，供外部或弹窗调用
        window.DataLensPageInstance = this;

        // 检查 URL 参数，支持直接打开视图
        this._checkUrlParams();
    }

    _checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const viewId = params.get('viewId');
        if (viewId) {
            if (this.state.isSingleView) {
                this._openViewById(parseInt(viewId));
            } else {
                // 如果在 Hub 窗口检测到 viewId，则开启专门的视图窗口，不破坏当前 Hub
                if (typeof WindowManager !== 'undefined') {
                    WindowManager.open(DataLensPage, [parseInt(viewId)], {
                        id: `/lens/view/${viewId}`,
                        title: '数据透镜',
                        url: `/lens/view/${viewId}`
                    });
                    // 清理 URL 避免刷新再次触发
                    Router.replace('/lens');
                } else {
                    this._openViewById(parseInt(viewId));
                }
            }
        }
    }

    async _openViewById(viewId) {
        try {
            const res = await LensApi.getView(viewId);
            if (res.code === 200) {
                this._openViewTab(res.data);
            }
        } catch (e) {
            console.error('打开视图失败:', e);
            this.setState({ loading: false });
            Toast.error('视图加载失败: ' + e.message);
        }
    }

    async afterMount() {
        if (this.state.isSingleView) {
            await this._openViewById(this.state.singleViewId);
        } else {
            await this._loadHubData();
            this._checkUrlParams();
        }
        this.bindEvents();

        // 监听主题切换，刷新图表
        this._themeChangeHandler = () => this._refreshChartsOnThemeChange();
        window.addEventListener('themechange', this._themeChangeHandler);
    }

    _refreshChartsOnThemeChange() {
        const { openTabs } = this.state;
        openTabs.forEach(tab => {
            if (tab._chartInstance && tab.viewMode === 'chart') {
                // 销毁旧图表
                ChartHelper.disposeChart(tab._chartInstance);
                if (tab._chartResizeCleanup) {
                    tab._chartResizeCleanup();
                }
                tab._chartInstance = null;
                tab._chartResizeCleanup = null;
                // 重新初始化
                setTimeout(() => this._initChart(tab), 100);
            }
        });
    }

    beforeDestroy() {
        // 清理主题监听
        if (this._themeChangeHandler) {
            window.removeEventListener('themechange', this._themeChangeHandler);
        }
        // 清理所有图表实例
        const { openTabs } = this.state;
        openTabs.forEach(tab => {
            if (tab._chartInstance) {
                ChartHelper.disposeChart(tab._chartInstance);
                if (tab._chartResizeCleanup) {
                    tab._chartResizeCleanup();
                }
            }
        });
    }

    _openViewTab(view) {
        const { openTabs } = this.state;

        // 检查是否已打开
        const existingTab = openTabs.find(t => t.id === view.id);
        if (existingTab) {
            this.setState({ mode: 'viewer', activeTabId: view.id });
            return;
        }

        // 添加新标签，赋予初始浏览模式
        const newTab = {
            ...view,
            viewMode: 'table', // 默认表格
            data: null,
            loading: true, // 初始为加载中状态
            page: 1,
            pageSize: 20,
            search: '',
            sortField: null,
            sortOrder: null,
            sorts: [],           // 多字段排序
            filters: {},         // 筛选条件
            showFilterPanel: false,  // 筛选面板显示状态
            showSortPanel: false     // 排序面板显示状态
        };

        // 更新状态，关闭全局 loading，添加新标签页
        this.setState({
            mode: 'viewer',
            loading: false,
            openTabs: [...openTabs, newTab],
            activeTabId: view.id
        });

        // 加载数据 —— 使用 setTimeout 确保状态已完全更新
        setTimeout(() => this._loadViewData(view.id), 0);
    }

    _closeTab(tabId) {
        const { openTabs, activeTabId } = this.state;
        const closingTab = openTabs.find(t => t.id === tabId);

        // 清除图表实例
        if (closingTab?._chartInstance) {
            ChartHelper.disposeChart(closingTab._chartInstance);
            if (closingTab._chartResizeCleanup) {
                closingTab._chartResizeCleanup();
            }
        }

        const newTabs = openTabs.filter(t => t.id !== tabId);
        let newActiveId = activeTabId;

        if (activeTabId === tabId) {
            if (newTabs.length > 0) {
                newActiveId = newTabs[newTabs.length - 1].id;
            } else {
                newActiveId = null;
                this.setState({ mode: 'hub' });
            }
        }

        this.setState({ openTabs: newTabs, activeTabId: newActiveId });
    }

    _hasPermission(permission) {
        const user = Store.get('user');
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (user.permissions && user.permissions.includes('datalens.admin')) return true;
        return user.permissions && user.permissions.includes(permission);
    }

    _showImagePreview(src) {
        Modal.show({
            title: '图片预览',
            content: `<div class="text-center p-10"><img src="${src}" style="max-width:100%; max-height: 70vh; border-radius: 8px; box-shadow: var(--shadow-lg);"></div>`,
            buttons: [{ text: '关闭', onClick: () => Modal.close() }]
        });
    }

    _renderLoading(text = '正在加载...') {
        return `
            <div class="lens-loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">${text}</div>
            </div>
        `;
    }

    bindEvents() {
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }

        // Hub 侧边栏分类点击
        this.delegate('click', '.lens-sidebar-item', async (e, el) => {
            const category = el.dataset.category;
            if (!category) return; // 忽略没有分类标识的项（如管理按钮）

            let res;
            let newState = {
                currentCategory: null,
                showFavorites: false,
                showRecent: false
            };

            if (category === 'all') {
                res = await LensApi.getViews();
            } else if (category === 'favorites') {
                newState.showFavorites = true;
                res = await LensApi.getFavorites();
            } else if (category === 'recent') {
                newState.showRecent = true;
                res = await LensApi.getRecent();
            } else {
                const catId = parseInt(category);
                newState.currentCategory = catId;
                res = await LensApi.getViews({ category_id: catId });
            }

            this.setState({ ...newState, views: res.data || [] });
        });

        // Hub 搜索 - 改为按钮点击和回车触发
        this.delegate('click', '#lens-hub-search-btn', () => {
            const val = this.$('#lens-hub-search')?.value.trim() || '';
            this.state.searchQuery = val;
            this._loadViews(this.state.currentCategory, val);
        });

        this.delegate('keydown', '#lens-hub-search', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim();
                this.state.searchQuery = val;
                this._loadViews(this.state.currentCategory, val);
            }
        });

        // 视图卡片点击
        this.delegate('click', '.lens-view-card', (e, el) => {
            if (e.target.closest('.lens-view-card-btn')) return;
            const viewId = parseInt(el.dataset.id);
            const view = this.state.views.find(v => v.id === viewId);

            if (view) {
                // 在新窗口打开
                if (typeof WindowManager !== 'undefined') {
                    WindowManager.open(DataLensPage, [view.id], {
                        id: `/lens/view/${view.id}`,
                        title: `数据透镜 - ${view.name}`,
                        url: `/lens/view/${view.id}`
                    });
                } else {
                    // 降级使用标签页（如果 WindowManager 未定义）
                    this._openViewTab(view);
                }
            }
        });

        // 卡片操作
        this.delegate('click', '.lens-view-card-btn.favorite', (e, el) => {
            const id = parseInt(el.dataset.id);
            const active = el.classList.contains('active');
            this._toggleFavorite(id, active);
        });

        this.delegate('click', '.lens-view-card-btn.pin', (e, el) => {
            const id = parseInt(el.dataset.id);
            const view = this.state.views.find(v => v.id === id);
            const active = el.dataset.active === 'true';
            if (view) this._toggleStartMenuShortcut(view, active);
        });

        this.delegate('click', '.lens-view-card-btn.edit', (e, el) => {
            this._editView(parseInt(el.dataset.id));
        });

        this.delegate('click', '.lens-view-card-btn.delete', (e, el) => {
            this._deleteView(parseInt(el.dataset.id));
        });

        // 管理入口
        this.delegate('click', '#lens-manage-sources', () => this._showSourceManager());
        this.delegate('click', '#lens-manage-categories', () => this._showCategoryManager());
        this.delegate('click', '#lens-create-view', () => this._showViewEditor());


        // Viewer 刷新
        this.delegate('click', '.lens-refresh-btn', () => {
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (tab) this._loadViewData(activeTabId, tab.page, tab.pageSize, tab.search, tab.sortField, tab.sortOrder, tab.sorts, tab.filters);
        });

        // Viewer 导出
        this.delegate('click', '.lens-export-btn', () => this._exportCurrentView());

        // Viewer 显示配置
        this.delegate('click', '.lens-visual-settings-btn', (e, el) => {
            const viewId = parseInt(el.dataset.id);
            this._showVisualSettings(viewId);
        });

        // Viewer 模式切换 (表格/图表)
        this.delegate('click', '.lens-mode-btn', (e, el) => {
            const mode = el.dataset.mode;
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.viewMode = mode;
                this.setState({ openTabs: [...openTabs] });
            }
        });

        // Viewer 搜索 - 改为按钮点击和回车触发
        this.delegate('click', '#lens-viewer-search-btn', () => {
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (!tab) return;
            const input = this.$('.lens-viewer-search-input');
            const val = input ? input.value.trim() : '';
            this._loadViewData(activeTabId, 1, tab.pageSize, val, tab.sortField, tab.sortOrder, tab.sorts, tab.filters);
        });

        this.delegate('keydown', '.lens-viewer-search-input', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const { activeTabId, openTabs } = this.state;
                const tab = openTabs.find(t => t.id === activeTabId);
                if (!tab) return;
                const val = e.target.value.trim();
                this._loadViewData(activeTabId, 1, tab.pageSize, val, tab.sortField, tab.sortOrder, tab.sorts, tab.filters);
            }
        });

        this.delegate('click', '.lens-search-clear', (e, el) => {
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (tab) {
                const input = el.parentElement.querySelector('input');
                if (input) input.value = '';
                this._loadViewData(activeTabId, 1, tab.pageSize, '', tab.sortField, tab.sortOrder, tab.sorts, tab.filters);
            }
        });

        // Viewer 排序
        this.delegate('click', '.lens-sortable-th', (e, el) => {
            const field = el.dataset.field;
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (!tab) return;
            let order = 'asc';
            if (tab.sortField === field) order = tab.sortOrder === 'asc' ? 'desc' : 'asc';
            // 点击表头时使用单字段排序，清空多字段排序
            this._loadViewData(activeTabId, 1, tab.pageSize, tab.search, field, order, [], tab.filters);
        });

        // Viewer 分页
        this.delegate('click', '.lens-page-btn', (e, el) => {
            const action = el.dataset.action;
            const { activeTabId, openTabs } = this.state;
            const tab = openTabs.find(t => t.id === activeTabId);
            if (!tab || !tab.data) return;

            let newPage = tab.page;
            const totalPages = Math.ceil(tab.data.total / tab.pageSize);

            if (action === 'first') newPage = 1;
            else if (action === 'last') newPage = totalPages;
            else if (action === 'prev' && tab.page > 1) newPage--;
            else if (action === 'next' && tab.page < totalPages) newPage++;
            else if (!isNaN(action)) newPage = parseInt(action);

            if (newPage !== tab.page) {
                this._loadViewData(activeTabId, newPage, tab.pageSize, tab.search, tab.sortField, tab.sortOrder, tab.sorts, tab.filters);
            }
        });

        // 筛选面板事件
        this.delegate('click', '.lens-filter-btn', () => this._toggleFilterPanel());
        this.delegate('click', '.lens-filter-close', () => this._toggleFilterPanel());
        this.delegate('click', '.lens-filter-add', () => this._addFilterRow());
        this.delegate('click', '.lens-filter-apply', () => this._applyFilters());
        this.delegate('click', '.lens-filter-clear', () => this._clearFilters());
        this.delegate('click', '.lens-filter-remove', (e, el) => {
            const row = el.closest('.lens-filter-row');
            if (row) row.remove();
        });

        // 排序面板事件
        this.delegate('click', '.lens-sort-btn', () => this._toggleSortPanel());
        this.delegate('click', '.lens-sort-close', () => this._toggleSortPanel());
        this.delegate('click', '.lens-sort-add', () => this._addSortRow());
        this.delegate('click', '.lens-sort-apply', () => this._applySorts());
        this.delegate('click', '.lens-sort-clear', () => this._clearSorts());
        this.delegate('click', '.lens-sort-remove', (e, el) => {
            const row = el.closest('.lens-sort-row');
            if (row) row.remove();
        });
    }

    _renderHeader() {
        return `
            <div class="lens-header">
                <div class="lens-app-info">
                    <span class="lens-tab-icon"><i class="ri-home-line"></i></span>
                    <span class="lens-tab-name" style="font-weight: 600; font-size: 15px;">数据透镜</span>
                </div>
                <div class="lens-header-actions" style="display: flex; gap: 8px; align-items: center;">
                    ${window.ModuleHelp ? ModuleHelp.createHelpButton('datalens', '数据透镜') : ''}
                    ${this._hasPermission('datalens.create') ? `
                        <button class="lens-btn lens-btn-primary" id="lens-create-view" style="padding: 6px 16px; border-radius: 8px;">
                            <span><i class="ri-add-line"></i> 新建视图</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    render() {
        const { mode, loading, isSingleView } = this.state;
        return `
            <div class="lens-page ${isSingleView ? 'single-view-mode' : ''}">
                ${isSingleView ? '' : this._renderHeader()}
                <div class="lens-container">
                    ${loading ? this._renderLoading() : (
                mode === 'hub' ? this._renderHub() : this._renderViewer()
            )}
                </div>
            </div>
        `;
    }
}

// 暴露全局入口
window.DataLensPage = DataLensPage;

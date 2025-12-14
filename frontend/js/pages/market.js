/**
 * 应用中心 - macOS Launchpad 风格
 */

class AppCenterMarketPage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin';
        this.activePopup = null; // 当前打开的弹窗 ID

        this.state = {
            modules: [],
            loading: true,
            view: 'home', // home, manage, market, dev
            processingId: null
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            let modules = [];
            const user = Store.get('user');
            // 总是获取最新模块列表（如果是管理员），或者从 store 获取
            if (this.isAdmin) {
                const res = await SystemApi.getModules();
                modules = Array.isArray(res) ? res : (res.data || []);
                Store.set('modules', modules);
            } else {
                modules = Store.get('modules') || [];
            }

            this.setState({
                modules: modules,
                loading: false
            });
        } catch (error) {
            Toast.error('加载应用列表失败: ' + (error.message || '未知错误'));
            this.setState({ loading: false, modules: [] });
        }
    }

    async loadMarketData() {
        this.setState({ marketLoading: true });
        try {
            const res = await Api.get('/system/market/list');
            const modules = Array.isArray(res) ? res : (res.data || []);
            this.setState({ marketModules: modules, marketLoading: false });
        } catch (error) {
            Toast.error('加载市场数据失败: ' + (error.message || '未知错误'));
            this.setState({ marketModules: [], marketLoading: false });
        }
    }

    async handleInstall(moduleId) {
        try {
            await Api.post(`/system/market/install/${moduleId}`);
            Toast.success('安装成功！');
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('安装失败: ' + (error.message || '未知错误'));
        }
    }

    async handleUninstall(moduleId) {
        const confirmed = await Modal.confirm('确认卸载', `确定要卸载此应用吗？卸载后需要重新安装才能使用。`);
        if (!confirmed) return;

        try {
            await Api.post(`/system/market/uninstall/${moduleId}`);
            Toast.success('卸载成功！');
            await this.loadMarketData();
            await this.loadData();
        } catch (error) {
            Toast.error('卸载失败: ' + (error.message || '未知错误'));
        }
    }

    // 固定应用相关方法
    getPinnedApps() {
        try {
            const saved = localStorage.getItem('jeje_pinned_apps');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    savePinnedApps(apps) {
        localStorage.setItem('jeje_pinned_apps', JSON.stringify(apps));
        Store.set('pinnedApps', apps);
    }

    togglePinApp(moduleId) {
        const pinned = this.getPinnedApps();
        const isPinned = pinned.includes(moduleId);

        if (isPinned) {
            // 取消固定
            const newPinned = pinned.filter(id => id !== moduleId);
            this.savePinnedApps(newPinned);
            Toast.info('已从 Dock 移除');
        } else {
            // 固定
            pinned.push(moduleId);
            this.savePinnedApps(pinned);
            Toast.success('已固定到 Dock');
        }

        // 强制重新渲染以更新图标状态
        this.setState({ _pinUpdate: Date.now() });
    }

    async handleToggleModule(module) {
        if (this.state.processingId) return;

        const action = module.enabled ? '禁用' : '启用';
        if (['blog', 'notes', 'feedback'].includes(module.id) && module.enabled) {
            const confirm = await Modal.confirm(`禁用 ${module.name}`, `警告：禁用核心模块可能会导致相关功能不可用。确定要继续吗？`);
            if (!confirm) return;
        }

        this.setState({ processingId: module.id });
        try {
            await SystemApi.toggleModule(module.id, !module.enabled);
            Toast.success(`${module.name} 已${action}`);
            await this.loadData();
        } catch (error) {
            Toast.error(`${action}失败: ` + error.message);
        } finally {
            this.setState({ processingId: null });
        }
    }

    // 获取应用的入口路径
    getAppEntryPath(module) {
        const pathMap = {
            'blog': '/blog/list',
            'notes': '/notes/list',
            'feedback': '/feedback/my'
        };
        if (module.menu && module.menu.path) return module.menu.path;
        return pathMap[module.id] || null;
    }

    // 获取应用的子功能菜单（与 Dock 保持一致）
    getChildLinks(module) {
        const links = [];
        const user = Store.get('user');
        const isAdmin = user?.role === 'admin';

        if (module.id === 'blog') {
            return [
                { title: '文章列表', icon: '📄', path: '/blog/list' },
                { title: '发布文章', icon: '✏️', path: '/blog/edit' },
                { title: '分类管理', icon: '📁', path: '/blog/category' }
            ];
        }
        if (module.id === 'notes') {
            return [
                { title: '所有笔记', icon: '📋', path: '/notes/list' },
                { title: '我的收藏', icon: '⭐', path: '/notes/starred' },
                { title: '标签管理', icon: '🏷️', path: '/notes/tags' }
            ];
        }
        if (module.id === 'feedback') {
            const list = [
                { title: '我的反馈', icon: '📨', path: '/feedback/my' },
                { title: '提交反馈', icon: '➕', path: '/feedback/create' }
            ];
            if (isAdmin || user?.role === 'manager') {
                list.push({ title: '反馈管理', icon: '🗂️', path: '/feedback/list' });
            }
            return list;
        }

        // 如果模块定义了 menu.children
        if (module.menu && module.menu.children && module.menu.children.length > 0) {
            return module.menu.children;
        }

        return null;
    }

    togglePopup(id) {
        if (this.activePopup === id) {
            this.activePopup = null;
        } else {
            this.activePopup = id;
        }
        this.updatePopupState();
    }

    closePopup() {
        this.activePopup = null;
        this.updatePopupState();
    }

    updatePopupState() {
        const popups = this.container.querySelectorAll('.app-popup');
        popups.forEach(popup => {
            const parent = popup.closest('.app-card-wrapper');
            if (parent.dataset.id === this.activePopup) {
                popup.classList.add('show');
            } else {
                popup.classList.remove('show');
            }
        });
    }

    // 渲染主页：应用图标网格
    renderHome() {
        const { modules } = this.state;
        const enabledModules = modules.filter(m => m.enabled);

        // 系统工具应用
        const systemApps = [];

        if (this.isAdmin) {
            systemApps.push({ id: 'sys_manage', name: '应用管理', icon: '⚙️', isSystem: true, viewTarget: 'manage' });
        }
        systemApps.push({ id: 'sys_market', name: '应用市场', icon: '🏪', isSystem: true, viewTarget: 'market' });
        systemApps.push({ id: 'sys_dev', name: '开发套件', icon: '🛠️', isSystem: true, viewTarget: 'dev' });

        const allItems = [...enabledModules, ...systemApps];

        // 获取已固定的应用列表
        const pinnedApps = this.getPinnedApps();

        return `
            <div class="apps-dashboard fade-in">
                <div class="apps-grid">
                    ${allItems.map(item => {
            const isSystem = item.isSystem;
            const isSystemApp = ['feedback', 'announcement'].includes(item.id);  // 系统应用
            const children = !isSystem ? this.getChildLinks(item) : null;
            const hasChildren = children && children.length > 0;
            const entryPath = !isSystem && !hasChildren ? this.getAppEntryPath(item) : null;
            const isPinned = !isSystem && (isSystemApp || pinnedApps.includes(item.id));

            return `
                            <div class="app-card-wrapper" data-id="${item.id}" ${hasChildren ? 'data-has-popup="true"' : ''}>
                                <div class="app-card clickable"
                                     ${isSystem ? `data-view-target="${item.viewTarget}"` : ''}
                                     ${entryPath ? `data-app-path="${entryPath}"` : ''}
                                     ${hasChildren ? `data-toggle-popup="${item.id}"` : ''}>
                                    <div class="app-icon-large" style="${isSystem ? 'background: var(--bg-tertiary); box-shadow:none; border: 1px solid var(--border-color);' : ''}">
                                        ${item.icon || '📦'}
                                    </div>
                                    <div class="app-name">${Utils.escapeHtml(item.name)}</div>
                                    ${!isSystem ? (isSystemApp ? `
                                        <div class="pin-btn pinned system-pinned" title="系统应用，始终固定">
                                            🔒
                                        </div>
                                    ` : `
                                        <button class="pin-btn ${isPinned ? 'pinned' : ''}" 
                                                data-pin-app="${item.id}" 
                                                title="${isPinned ? '从 Dock 取消固定' : '固定到 Dock'}">
                                            ${isPinned ? '📌' : '📍'}
                                        </button>
                                    `) : ''}
                                </div>

                                ${hasChildren ? `
                                    <div class="app-popup">
                                        <div class="app-popup-arrow"></div>
                                        <div class="app-popup-content">
                                            ${children.map(child => `
                                                <div class="app-popup-item" data-app-path="${child.path}">
                                                    <span class="popup-icon">${child.icon}</span>
                                                    <span class="popup-text">${child.title}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    renderHeader(title, backView = 'home') {
        return `
            <div class="sub-page-header">
                <button class="btn btn-ghost btn-icon" data-view-target="${backView}">
                    ⬅️ 返回
                </button>
                <div class="sub-page-title">${title}</div>
            </div>
        `;
    }

    // 应用管理列表
    renderManage() {
        const { modules, processingId } = this.state;
        return `
            <div class="sub-page fade-in">
                ${this.renderHeader('应用管理')}
                <div class="card-grid">
                    ${modules.map(m => `
                        <div class="card module-card ${!m.enabled ? 'disabled' : ''}">
                            <div class="card-body">
                                <div class="module-header">
                                    <div class="module-icon">${m.icon || '📦'}</div>
                                    <div class="module-info">
                                        <h3 class="module-title">
                                            ${Utils.escapeHtml(m.name)}
                                            <span class="tag tag-default">${m.version || '1.0.0'}</span>
                                        </h3>
                                        <div class="module-actions">
                                            <label class="switch">
                                                <input type="checkbox" ${m.enabled ? 'checked' : ''} ${processingId === m.id ? 'disabled' : ''} data-toggle="${m.id}">
                                                <span class="slider round"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <p class="module-desc">${Utils.escapeHtml(m.description || '暂无描述')}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderMarket() {
        const { marketModules = [], marketLoading } = this.state;

        if (marketLoading) {
            return `
                <div class="sub-page fade-in">
                    ${this.renderHeader('应用市场')}
                    <div class="loading">加载中...</div>
                </div>
            `;
        }

        const availableModules = marketModules.filter(m => !m.installed);
        const installedModules = marketModules.filter(m => m.installed);

        return `
            <div class="sub-page fade-in">
                ${this.renderHeader('应用市场')}
                
                ${availableModules.length > 0 ? `
                    <h3 style="margin-bottom: 16px; color: var(--text-secondary);">📦 可安装的应用</h3>
                    <div class="card-grid" style="margin-bottom: 32px;">
                        ${availableModules.map(app => `
                            <div class="card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon" style="background: var(--bg-tertiary);">${app.icon || '📦'}</div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--text-secondary);">
                                        <span>版本: ${app.version || '1.0.0'}</span>
                                        ${app.author ? `<span style="margin-left: 12px;">作者: ${Utils.escapeHtml(app.author)}</span>` : ''}
                                    </div>
                                    <div class="module-footer">
                                        <button class="btn btn-primary btn-block" data-install="${app.id}">
                                            ➕ 安装
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${installedModules.length > 0 ? `
                    <h3 style="margin-bottom: 16px; color: var(--text-secondary);">✅ 已安装的应用</h3>
                    <div class="card-grid">
                        ${installedModules.map(app => `
                            <div class="card">
                                <div class="card-body">
                                    <div class="module-header">
                                        <div class="module-icon">${app.icon || '📦'}</div>
                                        <div class="module-info">
                                            <h3 class="module-title">${Utils.escapeHtml(app.name)}</h3>
                                            <p class="module-desc">${Utils.escapeHtml(app.description || '暂无描述')}</p>
                                        </div>
                                    </div>
                                    <div class="module-meta" style="margin: 12px 0; font-size: 12px; color: var(--text-secondary);">
                                        <span>版本: ${app.version || '1.0.0'}</span>
                                        <span style="margin-left: 12px; color: ${app.enabled ? 'var(--color-success)' : 'var(--text-secondary)'};">
                                            ${app.enabled ? '● 已启用' : '○ 未启用'}
                                        </span>
                                    </div>
                                    <div class="module-footer" style="display: flex; gap: 8px;">
                                        <button class="btn btn-ghost" data-uninstall="${app.id}" style="flex: 1;">
                                            🗑️ 卸载
                                        </button>
                                        <button class="btn btn-primary" data-view-target="manage" style="flex: 1;">
                                            ⚙️ 管理
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${marketModules.length === 0 ? `
                    <div class="info-banner">
                        <p>📭 暂无可用应用。使用「开发套件」创建新应用后，重启后端即可在此看到。</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderDev() {
        return `
            <div class="sub-page fade-in">
                ${this.renderHeader('开发套件')}
                
                <!-- Action Buttons -->
                <div class="wrapper" style="margin-bottom: 24px;">
                     <div class="btn-group">
                         <button class="btn btn-primary" data-action="create-app">
                             <span class="icon">➕</span> 一键创建应用
                         </button>
                         <button class="btn btn-danger" data-action="delete-app">
                             <span class="icon">🗑️</span> 一键删除应用
                         </button>
                     </div>
                </div>

                <!-- Documentation -->
                <div class="dev-grid">
                    
                    <!-- Guide -->
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">📖 模块开发指南</h3></div>
                        <div class="card-body">
                             <div class="markdown-body">
                                 <h4>1. 创建模块</h4>
                                 <p>使用上方的"一键创建应用"按钮，输入模块ID（英文）和名称。</p>
                                 <p>系统会自动在 <code>backend/modules/</code> 和 <code>frontend/js/pages/</code> 下生成模板代码。</p>
                                 
                                 <h4>2. 后端开发</h4>
                                 <p>在 <code>backend/modules/{id}/</code> 中定义路由、模型和业务逻辑。</p>
                                 <ul style="padding-left: 20px; color: var(--text-secondary);">
                                     <li><code>{id}_router.py</code>: 注册 API 路由</li>
                                     <li><code>{id}_service.py</code>: 业务逻辑</li>
                                     <li><code>models.py</code>: 数据库模型</li>
                                 </ul>

                                 <h4>3. 前端开发</h4>
                                 <p>在 <code>frontend/js/pages/{id}.js</code> 中编写页面组件。</p>
                                 <p>组件需继承 <code>Component</code> 类，并实现 <code>render()</code> 方法。</p>
                                 
                                 <h4>4. 注册与测试</h4>
                                 <p>新模块创建后需重启后端服务以生效。</p>
                                 <p>前端页面路由已自动注册。</p>
                             </div>
                        </div>
                    </div>

                    <!-- Standards -->
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">📏 开发规范</h3></div>
                        <div class="card-body">
                             <div class="markdown-body">
                                 <h4>命名规范</h4>
                                 <ul style="padding-left: 20px; color: var(--text-secondary);">
                                     <li><strong>模块ID</strong>: 全小写英文，无空格 (e.g., <code>todo_list</code>)</li>
                                     <li><strong>类名</strong>: PascalCase (e.g., <code>TodoListPage</code>)</li>
                                     <li><strong>变量/函数</strong>: camelCase (JS), snake_case (Python)</li>
                                 </ul>
                                 
                                 <h4>API 规范</h4>
                                 <ul style="padding-left: 20px; color: var(--text-secondary);">
                                     <li>前缀: <code>/api/v1/{module_id}</code></li>
                                     <li>响应: 统一使用 <code>success(data)</code> 或抛出 <code>HTTPException</code></li>
                                 </ul>

                                 <h4>最佳实践</h4>
                                 <ul style="padding-left: 20px; color: var(--text-secondary);">
                                     <li>保持代码简洁，单一职责原则。</li>
                                     <li>使用 <code>Store</code> 进行状态管理。</li>
                                     <li>所有 UI 文本应支持国际化。</li>
                                     <li>组件销毁时请清理事件监听 (<code>destroy()</code>)。</li>
                                 </ul>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async handleCreateApp() {
        const user = Store.get('user');
        new Modal({
            title: '创建新应用',
            content: `
                <form id="create-app-form">
                    <div class="form-group">
                        <label>模块ID (英文)</label>
                        <input type="text" class="form-input" name="id" placeholder="例如: todo_app" required pattern="^[a-z_][a-z0-9_]*$" title="只能包含小写字母、数字和下划线，且以字母或下划线开头">
                        <small style="color: var(--text-secondary);">只能包含小写字母、数字和下划线</small>
                    </div>
                    <div class="form-group">
                        <label>应用名称 (中文)</label>
                        <input type="text" class="form-input" name="name" placeholder="例如: 待办清单" required>
                    </div>
                    <div class="form-group">
                        <label>作者</label>
                        <input type="text" class="form-input" name="author" value="${user?.nickname || user?.username || ''}">
                    </div>
                </form>
            `,
            confirmText: '立即创建',
            onConfirm: async () => {
                const form = document.getElementById('create-app-form');
                if (!form.reportValidity()) return false;

                const data = {
                    id: form.id.value.trim(),
                    name: form.name.value.trim(),
                    author: form.author.value.trim()
                };

                try {
                    await SystemApi.createModule(data);
                    await Modal.alert('创建成功', '新应用模块已生成！<br>请<strong>手动重启后端服务</strong>以加载新模块。');
                    return true;
                } catch (e) {
                    Toast.error('创建失败: ' + e.message);
                    return false;
                }
            }
        }).show();
    }

    async handleDeleteApp() {
        // 获取市场中所有模块（包括未安装的）
        let allModules = [];
        try {
            const res = await Api.get('/system/market/list');
            allModules = Array.isArray(res) ? res : (res.data || []);
        } catch (e) {
            Toast.error('获取模块列表失败');
            return;
        }

        // 筛选可删除的模块：只有未安装且非系统的模块才能删除
        const deletableModules = allModules.filter(m => {
            // 排除核心模块
            if (['system', 'user', 'auth', 'boot'].includes(m.id)) return false;
            // 排除系统应用
            if (m.isSystem) return false;
            // 只有未安装的模块才能删除
            return !m.installed;
        });

        // 已安装的模块（提示用户先卸载）
        const installedModules = allModules.filter(m =>
            m.installed && !m.isSystem && !['system', 'user', 'auth', 'boot'].includes(m.id)
        );

        // 系统应用（提示不可删除）
        const systemModules = allModules.filter(m => m.isSystem);

        if (deletableModules.length === 0 && installedModules.length === 0) {
            Toast.info('当前没有可删除的应用');
            return;
        }

        let warningHtml = '';
        if (systemModules.length > 0) {
            warningHtml += `
                <div class="info-box" style="background: rgba(100, 100, 255, 0.1); color: #6666ff; padding: 10px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                    🔒 以下是系统应用，不可删除：<br>
                    <strong>${systemModules.map(m => m.name).join('、')}</strong>
                </div>
            `;
        }
        if (installedModules.length > 0) {
            warningHtml += `
                <div class="info-box" style="background: rgba(255, 204, 0, 0.1); color: #cc9900; padding: 10px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                    💡 以下应用已安装，需先在「应用市场」中卸载后才能删除：<br>
                    <strong>${installedModules.map(m => m.name).join('、')}</strong>
                </div>
            `;
        }

        if (deletableModules.length === 0) {
            await Modal.alert('无法删除', warningHtml + '<p>当前没有可删除的应用。</p>');
            return;
        }

        new Modal({
            title: '删除应用',
            content: `
                <form id="delete-app-form">
                    ${warningHtml}
                    <div class="form-group">
                        <label>选择要删除的应用</label>
                        <select class="form-select" name="module_id" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color);">
                            ${deletableModules.map(m => `<option value="${m.id}">${m.name} (${m.id})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:20px;">
                        <label class="checkbox" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" name="delete_db" checked> 
                            <span>同时删除数据库表 (如果不选，数据将保留)</span>
                        </label>
                    </div>
                    <div class="alert" style="background: rgba(255, 59, 48, 0.1); color: #ff3b30; padding: 10px; border-radius: 8px; margin-top: 16px; font-size: 13px;">
                        ⚠️ 警告：删除操作不可恢复！对应的代码文件将被永久删除。
                    </div>
                </form>
            `,
            confirmText: '确认删除',
            onConfirm: async () => {
                const form = document.getElementById('delete-app-form');
                const moduleId = form.module_id.value;
                const deleteDb = form.delete_db.checked;

                const confirmed = await Modal.confirm('最终确认', `确定要彻底删除应用 "${moduleId}" 吗？此操作无法撤销。`);
                if (!confirmed) return false;

                try {
                    await SystemApi.deleteModule(moduleId, { delete_db: deleteDb });
                    await Modal.alert('删除成功', '应用已删除！<br>请<strong>手动重启后端服务</strong>以清理缓存。');
                    this.loadData();
                    this.loadMarketData();
                    return true;
                } catch (e) {
                    Toast.error('删除失败: ' + e.message);
                    return false;
                }
            }
        }).show();
    }

    render() {
        const { loading, view } = this.state;
        if (loading) return '<div class="loading"></div>';

        return `
            <div class="page app-center-page">
                ${view === 'home' ? this.renderHome() : ''}
                ${view === 'manage' ? this.renderManage() : ''}
                ${view === 'market' ? this.renderMarket() : ''}
                ${view === 'dev' ? this.renderDev() : ''}
            </div>

            <style>
                .app-center-page { padding: 20px; min-height: 100%; }
                .sub-page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
                .sub-page-title { font-size: 20px; font-weight: 600; }

                /* Grid Layout */
                .apps-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    gap: 32px 24px;
                    justify-content: center;
                    padding: 20px 0;
                }

                .app-card-wrapper {
                    position: relative;
                    display: flex;
                    justify-content: center;
                }

                .app-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    transition: all 0.2s;
                    border-radius: 12px;
                    padding: 12px;
                    width: 100%;
                }

                .app-card:hover {
                    background: rgba(255,255,255,0.1);
                    transform: translateY(-4px);
                }

                .app-icon-large {
                    width: 72px;
                    height: 72px;
                    margin-bottom: 12px;
                    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 36px;
                    box-shadow: 0 10px 20px rgba(0,0,0,0.15);
                    color: white;
                }

                .app-name {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                }

                /* Pin Button */
                .pin-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 32px;
                    height: 32px;
                    border: 2px solid rgba(255,255,255,0.3);
                    background: rgba(0,0,0,0.4);
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.6;
                    transition: all 0.25s ease;
                    backdrop-filter: blur(4px);
                }
                .app-card:hover .pin-btn {
                    opacity: 1;
                    transform: scale(1.05);
                }
                .pin-btn:hover {
                    background: var(--color-primary);
                    border-color: var(--color-primary);
                    transform: scale(1.15);
                    box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.4);
                }
                .pin-btn.pinned {
                    opacity: 1;
                    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
                    border-color: transparent;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                .pin-btn.pinned:hover {
                    background: rgba(255,100,100,0.8);
                    border-color: transparent;
                }
                .pin-btn.system-pinned {
                    cursor: default;
                    background: rgba(100,100,100,0.6);
                    border-color: rgba(150,150,150,0.3);
                    font-size: 12px;
                }
                .pin-btn.system-pinned:hover {
                    transform: none;
                    background: rgba(100,100,100,0.6);
                    box-shadow: none;
                }

                /* Popup Menu */
                .app-popup {
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%) translateY(10px) scale(0.95);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 6px;
                    min-width: 160px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    z-index: 100;
                }

                .app-popup.show {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0) scale(1);
                }

                .app-popup-arrow {
                    position: absolute;
                    top: -6px;
                    left: 50%;
                    transform: translateX(-50%) rotate(45deg);
                    width: 12px;
                    height: 12px;
                    background: var(--bg-secondary);
                    border-left: 1px solid var(--border-color);
                    border-top: 1px solid var(--border-color);
                }

                .app-popup-content {
                    position: relative;
                    z-index: 1;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                }

                .app-popup-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    color: var(--text-primary);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .app-popup-item:hover {
                    background: var(--bg-tertiary);
                }

                .popup-icon { font-size: 16px; }
                .popup-text { font-size: 13px; font-weight: 500; }

                /* Other Styles */
                .card-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                }
                .module-card { border: 1px solid var(--border-color); }
                .module-icon { width: 48px; height: 48px; background: var(--bg-secondary); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
                .module-header { display: flex; gap: 16px; margin-bottom: 16px; }
                .module-info { flex: 1; min-width: 0; }
                .module-title { font-size: 16px; font-weight: 600; margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; }
                .module-desc { font-size: 13px; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .switch { position: relative; display: inline-block; width: 40px; height: 20px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; }
                .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; }
                input:checked + .slider { background-color: var(--color-primary); }
                input:focus + .slider { box-shadow: 0 0 1px var(--color-primary); }
                input:checked + .slider:before { transform: translateX(20px); }
                .slider.round { border-radius: 20px; }
                .slider.round:before { border-radius: 50%; }
                .module-card.disabled .module-icon { filter: grayscale(1); opacity: 0.6; }
                
                /* Dev Tools Styles */
                .dev-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: 20px;
                }
                .markdown-body h4 {
                    margin-top: 16px;
                    margin-bottom: 8px;
                    color: var(--text-primary);
                    font-size: 15px;
                }
                .markdown-body p, .markdown-body ul {
                    margin-bottom: 12px;
                    font-size: 14px;
                    line-height: 1.6;
                }
                .markdown-body code {
                    background: rgba(255,255,255,0.1);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: monospace;
                    color: var(--color-accent);
                }
            </style>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
        // 恢复弹出层状态
        if (this.activePopup) {
            this.updatePopupState();
        }
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // View Switching
            this.delegate('click', '[data-view-target]', (e, t) => {
                const target = t.dataset.viewTarget;
                this.setState({ view: target });
                // 切换到市场视图时加载市场数据
                if (target === 'market') {
                    this.loadMarketData();
                }
            });

            // Install Module
            this.delegate('click', '[data-install]', async (e, t) => {
                const moduleId = t.dataset.install;
                if (moduleId) {
                    t.disabled = true;
                    t.textContent = '安装中...';
                    await this.handleInstall(moduleId);
                }
            });

            // Uninstall Module
            this.delegate('click', '[data-uninstall]', async (e, t) => {
                const moduleId = t.dataset.uninstall;
                if (moduleId) {
                    await this.handleUninstall(moduleId);
                }
            });

            // Developer Actions
            this.delegate('click', '[data-action="create-app"]', (e) => {
                this.handleCreateApp();
            });
            this.delegate('click', '[data-action="delete-app"]', (e) => {
                this.handleDeleteApp();
            });

            // Toggle Module
            this.delegate('change', '[data-toggle]', (e, t) => {
                const moduleId = t.dataset.toggle;
                const module = this.state.modules.find(m => m.id === moduleId);
                if (module) {
                    e.preventDefault();
                    this.handleToggleModule(module);
                }
            });

            // Open App (Direct)
            this.delegate('click', '[data-app-path]', (e, t) => {
                e.stopPropagation();
                // 如果是 popup item，关闭所有 popup
                if (t.classList.contains('app-popup-item')) {
                    this.closePopup();
                }

                const path = t.dataset.appPath;
                if (path) {
                    Router.push(path, { from: 'apps' });
                }
            });

            // Toggle Popup
            this.delegate('click', '[data-toggle-popup]', (e, t) => {
                e.stopPropagation();
                const id = t.dataset.togglePopup;
                this.togglePopup(id);
            });

            // Pin/Unpin App to Dock
            this.delegate('click', '[data-pin-app]', (e, t) => {
                e.stopPropagation();
                e.preventDefault();
                const moduleId = t.dataset.pinApp;
                if (moduleId) {
                    this.togglePinApp(moduleId);
                }
            });

            // Click outside to close
            document.addEventListener('click', (e) => {
                if (this.activePopup && !e.target.closest('.app-card-wrapper')) {
                    this.closePopup();
                }
            });
        }
    }
}

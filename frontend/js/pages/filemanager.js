/**
 * 文件管理页面
 * 提供完整的文件浏览、上传、下载、管理功能
 */

class FileManagerPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            currentFolderId: null,
            breadcrumbs: [],
            folders: [],
            files: [],
            folderTree: [],
            stats: null,
            selectedItems: [],
            viewMode: 'grid', // 网格 | 列表
            searchKeyword: '',
            loading: true,
            uploading: false
        };
    }

    /* 安全地渲染图标，防止 XSS */

    _renderSafeIcon(icon, defaultIcon) {
        if (!icon) return defaultIcon;
        // 如果是简单的 emoji 或纯文本 (无标签)，直接返回
        if (!/[<>]/.test(icon)) return icon;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(icon, 'text/html');
            const body = doc.body;

            // 如果内容为空
            if (!body.innerHTML.trim()) return defaultIcon;

            // 允许的标签和属性白名单
            const allowedTags = ['i', 'span', 'div', 'img', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon'];
            const allowedAttrs = ['class', 'style', 'src', 'alt', 'title', 'width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width', 'd', 'xmlns', 'opacity', 'fill-rule', 'clip-rule'];

            const allElements = body.querySelectorAll('*');
            // 检查所有元素
            for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                const tagName = el.tagName.toLowerCase();

                // 1. 检查标签名
                if (!allowedTags.includes(tagName)) {
                    return defaultIcon;
                }

                // 2. 检查属性
                const attrs = el.attributes;
                for (let j = 0; j < attrs.length; j++) {
                    const attr = attrs[j];
                    const name = attr.name.toLowerCase();
                    const value = attr.value.toLowerCase().trim();

                    // 检查属性名 (允许 data- 和 aria-)
                    if (!allowedAttrs.includes(name) && !name.startsWith('data-') && !name.startsWith('aria-')) {
                        return defaultIcon;
                    }

                    // 检查 URL 协议 (src)
                    if (name === 'src' || name === 'href') {
                        if (value.startsWith('javascript:') || value.startsWith('vbscript:')) {
                            return defaultIcon;
                        }
                    }

                    // 显式禁止事件处理程序 (虽然不在白名单中，但作为双重保障)
                    if (name.startsWith('on')) return defaultIcon;
                }
            }

            return body.innerHTML;
        } catch (e) {
            console.warn('Icon parse error:', e);
            return defaultIcon;
        }
    }

    async init() {
        await this.loadFolderTree();
        await this.loadDirectory();
        await this.loadStats();
    }

    async loadDirectory(folderId = null, keyword = null) {
        this.setState({ loading: true, currentFolderId: folderId, selectedItems: [] });

        try {
            const params = new URLSearchParams();
            if (folderId) params.append('folder_id', folderId);
            if (keyword) params.append('keyword', keyword);

            const res = await Api.get(`/filemanager/browse?${params}`);
            if (res.code === 200) {
                this.setState({
                    breadcrumbs: res.data.breadcrumbs || [],
                    folders: res.data.folders || [],
                    files: res.data.files || [],
                    loading: false
                });
            } else {
                Toast.error(res.message || '加载失败');
                this.setState({ loading: false });
            }
        } catch (err) {
            console.error(err);
            Toast.error('加载目录失败');
            this.setState({ loading: false });
        }
    }

    async loadFolderTree() {
        try {
            const res = await Api.get('/filemanager/folders/tree');
            if (res.code === 200) {
                this.setState({ folderTree: res.data || [] });
            }
        } catch (err) {
            console.error('加载文件夹树失败', err);
        }
    }

    async loadStats() {
        try {
            const res = await Api.get('/filemanager/stats');
            if (res.code === 200) {
                // 确保配额信息正确传递
                const stats = res.data || {};
                // 记录存储统计信息
                this.setState({ stats });
            }
        } catch (err) {
            console.error('加载统计失败', err);
        }
    }

    render() {
        const { viewMode, breadcrumbs, folders, files, folderTree, stats, loading, selectedItems, searchKeyword, currentFolderId } = this.state;

        return `
            <div class="filemanager-page">
                <!-- 工具栏 -->
                <div class="fm-toolbar">
                    <div class="fm-toolbar-left">
                        ${currentFolderId ? `
                        <button class="fm-nav-btn" id="btnBack" title="返回上级">
                            <i class="ri-arrow-left-line"></i>
                        </button>` : ''}
                        <button class="fm-nav-btn" id="btnRefresh" title="刷新">
                            <i class="ri-refresh-line"></i>
                        </button>
                        
                        <!-- 面包屑 -->
                        <div class="fm-breadcrumb">
                            ${breadcrumbs.map((item, index) => `
                                <span class="fm-breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}" 
                                      data-folder-id="${item.id || ''}">
                                    ${Utils.escapeHtml(item.name)}
                                </span>
                                ${index < breadcrumbs.length - 1 ? '<span class="fm-breadcrumb-separator">/</span>' : ''}
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="fm-toolbar-right">
                        <!-- 存储配额信息 -->
                        ${stats ? `
                        <div class="fm-quota-info" style="display: flex; align-items: center; gap: 8px; margin-right: 16px; padding: 6px 12px; background: var(--color-bg-secondary, rgba(0,0,0,0.05)); border-radius: 8px; font-size: 13px;">
                            <span style="color: var(--color-text-secondary);"><i class="ri-hard-drive-line"></i> 存储:</span>
                            <span style="font-weight: 500;">${this.formatSize(stats.total_size)}</span>
                            ${stats.storage_quota && stats.storage_quota > 0 ? `
                            <span style="color: var(--color-text-secondary);">/</span>
                            <span style="color: var(--color-text-secondary);">${this.formatSize(stats.storage_quota)}</span>
                            <div style="width: 60px; height: 4px; background: var(--color-bg-tertiary, rgba(0,0,0,0.1)); border-radius: 2px; overflow: hidden; margin-left: 4px;">
                                <div style="height: 100%; background: ${stats.used_percentage > 90 ? 'var(--color-danger, #ff4444)' : stats.used_percentage > 70 ? 'var(--color-warning, #ffaa00)' : 'var(--color-primary, #0066ff)'}; width: ${Math.min(stats.used_percentage || 0, 100)}%; transition: width 0.3s;"></div>
                            </div>
                            <span style="color: var(--color-text-secondary); font-size: 12px;">${stats.used_percentage ? stats.used_percentage.toFixed(1) : 0}%</span>
                            ` : `
                            <span style="color: var(--color-text-secondary); font-size: 12px; margin-left: 4px;">(无限制)</span>
                            `}
                        </div>
                        ` : ''}
                        
                        <div class="fm-search search-group">
                            <input type="text" class="form-input fm-search-input" 
                                   placeholder="搜索文件..." 
                                   id="fmSearchInput"
                                   value="${Utils.escapeHtml(searchKeyword)}">
                            <button class="btn btn-primary" id="fmSearchBtn">搜索</button>
                        </div>
                        
                        <!-- 视图切换 -->
                        <div class="fm-view-toggle">
                            <button class="fm-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="网格视图">
                                <i class="ri-grid-fill"></i>
                            </button>
                            <button class="fm-view-btn ${viewMode === 'list' ? 'active' : ''}" data-view="list" title="列表视图">
                                <i class="ri-list-check"></i>
                            </button>
                        </div>
                        
                        <!-- 操作按钮 -->
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('filemanager', '文件管理') : ''}
                        <button class="btn btn-secondary btn-sm" id="btnNewFolder">
                            <i class="ri-folder-add-line"></i> 新建文件夹
                        </button>
                        <div class="btn-group">
                            <button class="btn btn-primary btn-sm" id="btnUpload">
                                <i class="ri-upload-cloud-2-line"></i> 上传文件
                            </button>
                            <button class="btn btn-primary btn-sm" id="btnUploadFolder" title="上传整个文件夹">
                                <i class="ri-folder-upload-line"></i> 上传文件夹
                            </button>
                        </div>
                        <button class="btn btn-info btn-sm" id="btnDownload" ${!this.canDownloadAny() ? 'disabled' : ''}>
                            <i class="ri-download-line"></i> 下载
                        </button>
                        <button class="btn btn-danger btn-sm" id="btnDelete" ${selectedItems.length === 0 ? 'disabled' : ''}>
                            <i class="ri-delete-bin-line"></i> 删除
                        </button>
                        <input type="file" id="fileInput" multiple style="display: none;">
                        <input type="file" id="folderInput" webkitdirectory directory multiple style="display: none;">
                    </div>
                </div>
                
                <!-- 主内容区 -->
                <div class="fm-main">
                    <!-- 侧边栏 -->
                    <div class="fm-sidebar">
                        <div class="fm-sidebar-section">
                            <div class="fm-sidebar-title">快捷访问</div>
                            <div class="fm-sidebar-item" data-action="home">
                                <span class="icon"><i class="ri-home-line"></i></span>
                                <span>全部文件</span>
                            </div>
                            <div class="fm-sidebar-item" data-action="starred">
                                <span class="icon"><i class="ri-star-line"></i></span>
                                <span>我的收藏</span>
                            </div>
                        </div>
                        
                        ${stats ? `
                        <div class="fm-sidebar-section">
                            <div class="fm-sidebar-title">存储统计</div>
                            <div class="fm-storage-stats">
                                <div class="fm-stat-row"><i class="ri-folder-line"></i> ${stats.total_folders} 个文件夹</div>
                                <div class="fm-stat-row"><i class="ri-file-line"></i> ${stats.total_files} 个文件</div>
                                <div class="fm-stat-row"><i class="ri-hard-drive-line"></i> ${this.formatSize(stats.total_size)}</div>
                                ${stats.storage_quota ? `
                                <div class="fm-quota-section">
                                    <div class="fm-quota-label">
                                        <span>配额使用</span>
                                        <span>${stats.used_percentage ? stats.used_percentage.toFixed(1) : 0}%</span>
                                    </div>
                                    <div class="fm-quota-bar">
                                        <div class="fm-quota-fill ${stats.used_percentage > 90 ? 'danger' : stats.used_percentage > 70 ? 'warning' : ''}" 
                                             style="width: ${Math.min(stats.used_percentage || 0, 100)}%"></div>
                                    </div>
                                    <div class="fm-quota-detail">
                                        ${this.formatSize(stats.total_size)} / ${this.formatSize(stats.storage_quota)}
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="fm-sidebar-section">
                            <div class="fm-sidebar-title">文件夹</div>
                            <div class="fm-folder-tree">
                                ${this.renderFolderTree(folderTree)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 文件内容区 -->
                    <div class="fm-content" id="fileContent">
                        ${loading ? `
                            <div class="fm-empty">
                                <div class="fm-empty-icon"><i class="ri-loader-4-line spin"></i></div>
                                <div class="fm-empty-text">加载中...</div>
                            </div>
                        ` : this.renderContent()}
                        
                        <!-- 拖拽上传提示 -->
                        <div class="fm-dropzone" id="dropzone">
                            <div class="fm-dropzone-content">
                                <div class="fm-dropzone-icon"><i class="ri-upload-cloud-2-line"></i></div>
                                <div class="fm-dropzone-text">释放文件以上传</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 状态栏 -->
                <div class="fm-statusbar">
                    <span>${folders.length} 个文件夹, ${files.length} 个文件</span>
                    <span>${selectedItems.length > 0 ? `已选择 ${selectedItems.length} 项` : ''}</span>
                </div>
                
                <!-- 右键菜单 -->
                <div class="fm-context-menu" id="contextMenu" style="display: none;">
                    <div class="fm-context-item" data-menu-action="open"><span class="icon"><i class="ri-folder-open-line"></i></span> 打开</div>
                    <div class="fm-context-item" data-menu-action="preview"><span class="icon"><i class="ri-eye-line"></i></span> 预览</div>
                    <div class="fm-context-item" data-menu-action="download"><span class="icon"><i class="ri-download-line"></i></span> 下载</div>
                    <div class="fm-context-divider"></div>
                    <div class="fm-context-item" data-menu-action="rename"><span class="icon"><i class="ri-edit-line"></i></span> 重命名</div>
                    <div class="fm-context-item" data-menu-action="move"><span class="icon"><i class="ri-folder-transfer-line"></i></span> 移动到...</div>
                    <div class="fm-context-item" data-menu-action="star"><span class="icon"><i class="ri-star-line"></i></span> 收藏/取消收藏</div>
                    <div class="fm-context-divider"></div>
                    <div class="fm-context-item danger" data-menu-action="delete"><span class="icon"><i class="ri-delete-bin-line"></i></span> 删除</div>
                </div>
                
                <!-- 移动目标选择对话框占位 -->
                <div id="moveTargetOverlay" class="fm-move-overlay" style="display: none;"></div>
            </div>
        `;
    }

    renderContent() {
        const { viewMode, folders, files } = this.state;

        if (folders.length === 0 && files.length === 0) {
            return `
                <div class="fm-empty">
                    <div class="fm-empty-icon"><i class="ri-folder-open-line"></i></div>
                    <div class="fm-empty-text">此文件夹为空</div>
                    <button class="btn btn-primary" id="btnUploadEmpty">上传文件</button>
                </div>
            `;
        }

        if (viewMode === 'list') {
            return this.renderListView();
        }

        return this.renderGridView();
    }

    renderGridView() {
        const { folders, files, selectedItems } = this.state;

        return `
            <div class="fm-grid">
                ${folders.map(folder => `
                    <div class="fm-item ${selectedItems.includes('folder-' + folder.id) ? 'selected' : ''} ${folder.is_virtual ? 'virtual-item' : ''}" 
                         data-type="folder" 
                         data-is-virtual="${folder.is_virtual}"
                         data-id="${folder.id}">
                        <div class="fm-item-icon">${this._renderSafeIcon(folder.icon, '<i class="ri-folder-fill"></i>')}</div>
                        <div class="fm-item-name">${Utils.escapeHtml(folder.name)}</div>
                    </div>
                `).join('')}
                ${files.map(file => `
                    <div class="fm-item ${selectedItems.includes('file-' + file.id) ? 'selected' : ''}" 
                         data-type="file" 
                         data-id="${file.id}">
                        ${file.is_starred ? '<div class="fm-item-star"><i class="ri-star-fill"></i></div>' : ''}
                        ${this.renderFileIcon(file)}
                        <div class="fm-item-name">${Utils.escapeHtml(file.name)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderListView() {
        const { folders, files, selectedItems } = this.state;

        return `
            <div class="fm-list">
                <div class="fm-list-header">
                    <span></span>
                    <span>名称</span>
                    <span>大小</span>
                    <span>修改时间</span>
                    <span>操作</span>
                </div>
                ${folders.map(folder => `
                    <div class="fm-list-item ${selectedItems.includes('folder-' + folder.id) ? 'selected' : ''}" 
                         data-type="folder" 
                         data-is-virtual="${folder.is_virtual}"
                         data-id="${folder.id}">
                        <span>${this._renderSafeIcon(folder.icon, '<i class="ri-folder-line"></i>')}</span>
                        <span style="${folder.is_virtual ? 'color: var(--color-primary); font-weight: 500;' : ''}">${Utils.escapeHtml(folder.name)}</span>
                        <span>--</span>
                        <span>${Utils.formatDate(folder.updated_at)}</span>
                        <span>
                            ${(!folder.is_virtual && !folder.is_system) ? `
                            <button class="btn btn-ghost btn-sm" data-action="rename" data-type="folder" data-id="${folder.id}"><i class="ri-edit-line"></i></button>
                            <button class="btn btn-ghost btn-sm danger" data-action="delete" data-type="folder" data-id="${folder.id}"><i class="ri-delete-bin-line"></i></button>
                            ` : `<span style="color: var(--color-primary); font-size: 11px;">系统${folder.is_system ? '文件夹' : '挂载'}</span>`}
                        </span>
                    </div>
                `).join('')}
                ${files.map(file => `
                    <div class="fm-list-item ${selectedItems.includes('file-' + file.id) ? 'selected' : ''}" 
                         data-type="file" 
                         data-id="${Utils.escapeHtml(String(file.id))}">
                        <span>${this._renderSafeIcon(file.icon, '<i class="ri-file-line"></i>')}</span>
                        <span>${file.is_starred ? '<i class="ri-star-fill"></i> ' : ''}${Utils.escapeHtml(file.name)}</span>
                        <span>${this.formatSize(file.file_size)}</span>
                        <span>${Utils.formatDate(file.updated_at)}</span>
                        <span>
                            <button class="btn btn-ghost btn-sm" data-action="download" data-id="${Utils.escapeHtml(String(file.id))}"><i class="ri-download-line"></i></button>
                            <button class="btn btn-ghost btn-sm" data-action="star" data-id="${Utils.escapeHtml(String(file.id))}"><i class="${file.is_starred ? 'ri-star-fill' : 'ri-star-line'}"></i></button>
                            <button class="btn btn-ghost btn-sm danger" data-action="delete" data-type="file" data-id="${Utils.escapeHtml(String(file.id))}"><i class="ri-delete-bin-line"></i></button>
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderFileIcon(file) {
        // 如果是图片，可以显示缩略图
        if (file.mime_type && file.mime_type.startsWith('image/')) {
            const token = Store.get('token');
            const safeName = Utils.escapeHtml(file.name);
            const safeUrl = Utils.escapeHtml(`${file.preview_url}?token=${token}`);
            // 处理图片加载失败的情况：替换为图标
            // 使用 _renderSafeIcon 替代简单的正则检查
            const saferIconData = this._renderSafeIcon(file.icon, '<i class="ri-image-line"></i>');
            // 注意：这里需要确保 saferIconData 在 outerHTML 中是安全的
            // saferIconData 已经是经过 _renderSafeIcon 过滤的 HTML 字符串 (例如 <i class="..."></i>)
            // 在 JS 字符串中使用时，需要转义单引号和换行
            const jsSafeIcon = saferIconData.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

            return `<img class="fm-item-preview" src="${safeUrl}" alt="${safeName}" onerror="this.onerror=null; this.outerHTML='<div class=\\'fm-item-icon\\'>${jsSafeIcon}</div>'">`;
        }
        return `<div class="fm-item-icon">${this._renderSafeIcon(file.icon, '<i class="ri-file-line"></i>')}</div>`;
    }

    renderFolderTree(nodes, level = 0) {
        if (!nodes || nodes.length === 0) {
            return level === 0 ? '<div style="padding: 8px; color: var(--color-text-tertiary); font-size: 12px;">暂无文件夹</div>' : '';
        }

        return nodes.map(node => `
            <div class="fm-tree-item" data-folder-id="${node.id}" style="padding-left: ${8 + level * 16}px;">
                ${node.children && node.children.length > 0 ?
                '<span class="fm-tree-toggle"><i class="ri-arrow-right-s-line"></i></span>' :
                '<span style="width: 16px;"></span>'}
                <span><i class="ri-folder-line"></i></span>
                <span>${Utils.escapeHtml(node.name)}</span>
            </div>
            ${node.children && node.children.length > 0 ?
                `<div class="fm-tree-children">${this.renderFolderTree(node.children, level + 1)}</div>` : ''}
        `).join('');
    }

    formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    afterMount() {
        this.init();
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
        // 重新设置拖拽属性
        this.container?.querySelectorAll('.fm-item, .fm-list-item').forEach(item => {
            item.setAttribute('draggable', 'true');
        });
    }

    bindEvents() {
        if (this.container && !this.container._bindFM) {
            this.container._bindFM = true;

            // 返回上级
            this.delegate('click', '#btnBack', () => {
                const { breadcrumbs } = this.state;
                if (breadcrumbs.length > 1) {
                    const parentId = breadcrumbs[breadcrumbs.length - 2].id || null;
                    this.loadDirectory(parentId);
                }
            });

            // 刷新
            this.delegate('click', '#btnRefresh', () => {
                this.loadDirectory(this.state.currentFolderId);
                this.loadStats();
            });

            // 面包屑导航
            this.delegate('click', '.fm-breadcrumb-item', (e, t) => {
                const folderId = t.dataset.folderId || null;
                this.loadDirectory(folderId ? parseInt(folderId) : null);
            });

            // 视图切换
            this.delegate('click', '.fm-view-btn', (e, t) => {
                const view = t.dataset.view;
                this.setState({ viewMode: view });
            });

            // 搜索 - 改为按钮点击和回车触发
            this.delegate('click', '#fmSearchBtn', () => {
                const input = this.$('#fmSearchInput');
                const keyword = input ? input.value.trim() : '';
                this.setState({ searchKeyword: keyword });
                if (keyword) {
                    this.search(keyword);
                } else {
                    this.loadDirectory(this.state.currentFolderId);
                }
            });

            this.delegate('keydown', '#fmSearchInput', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const keyword = e.target.value.trim();
                    this.setState({ searchKeyword: keyword });
                    if (keyword) {
                        this.search(keyword);
                    } else {
                        this.loadDirectory(this.state.currentFolderId);
                    }
                }
            });

            // 新建文件夹
            this.delegate('click', '#btnNewFolder', () => this.createFolder());

            // 上传文件按钮
            this.delegate('click', '#btnUpload, #btnUploadEmpty', () => {
                this.$('#fileInput')?.click();
            });

            // 上传文件夹按钮
            this.delegate('click', '#btnUploadFolder', () => {
                this.$('#folderInput')?.click();
            });

            // 文件夹选择
            this.delegate('change', '#folderInput', (e) => {
                if (e.target.files.length > 0) {
                    this.uploadFolder(e.target.files);
                    e.target.value = '';
                }
            });

            // 删除按钮
            this.delegate('click', '#btnDelete', () => this.deleteItems());

            // 下载按钮（支持文件和文件夹）
            this.delegate('click', '#btnDownload', () => this.downloadSelected());

            // 列表视图的操作按钮委托
            this.delegate('click', '[data-action="download"]', (e, t) => {
                e.stopPropagation();
                this.downloadFile(t.dataset.id);
            });

            this.delegate('click', '[data-action="star"]', (e, t) => {
                e.stopPropagation();
                this.toggleStar(t.dataset.id);
            });

            this.delegate('click', '[data-action="delete"]', (e, t) => {
                e.stopPropagation();
                // 模拟选中并删除
                const type = t.dataset.type;
                const id = t.dataset.id;
                this.setState({ selectedItems: [`${type}-${id}`] });
                this.deleteItems();
            });

            // 文件选择（使用委托，支持重新渲染）
            this.delegate('change', '#fileInput', (e) => {
                if (e.target.files.length > 0) {
                    this.uploadFiles(e.target.files);
                    e.target.value = '';
                }
            });

            // 侧边栏快捷访问
            this.delegate('click', '.fm-sidebar-item', (e, t) => {
                const action = t.dataset.action;
                if (action === 'home') {
                    this.loadDirectory(null);
                } else if (action === 'starred') {
                    this.loadStarred();
                }
            });

            // 文件夹树点击
            this.delegate('click', '.fm-tree-item', (e, t) => {
                const folderId = parseInt(t.dataset.folderId);
                this.loadDirectory(folderId);
            });

            // 文件/文件夹点击
            this.delegate('dblclick', '.fm-item, .fm-list-item', (e, t) => {
                const type = t.dataset.type;
                const id = parseInt(t.dataset.id);

                if (type === 'folder') {
                    // 支持字符串/负数 ID (虚拟目录)
                    this.loadDirectory(id);
                } else if (type === 'file') {
                    if (id) {
                        this.previewFile(id);
                    } else {
                        // 虚拟文件暂不支持预览，仅支持下载
                        Toast.info('虚拟文件暂不支持直接预览');
                    }
                }
            });

            // 单击选择
            this.delegate('click', '.fm-item, .fm-list-item', (e, t) => {
                if (e.detail === 2) return; // 忽略双击

                const type = t.dataset.type;
                const id = parseInt(t.dataset.id);
                const key = `${type}-${id}`;

                let { selectedItems } = this.state;
                if (e.ctrlKey || e.metaKey) {
                    // 多选
                    if (selectedItems.includes(key)) {
                        selectedItems = selectedItems.filter(k => k !== key);
                    } else {
                        selectedItems = [...selectedItems, key];
                    }
                } else {
                    // 单选
                    selectedItems = [key];
                }
                this.setState({ selectedItems });
            });

            // 操作按钮
            // 重命名操作
            this.delegate('click', '[data-action="rename"]', (e, t) => {
                e.stopPropagation();
                const type = t.dataset.type;
                const id = parseInt(t.dataset.id);
                this.renameItem(type, id);
            });

            // 拖拽上传
            this.setupDragDrop();

            // 右键菜单
            this.setupContextMenu();

            // 拖拽移动
            this.setupDragMove();
        }
    }

    setupDragDrop() {
        const content = this.$('#fileContent');
        const dropzone = this.$('#dropzone');
        if (!content || !dropzone || content._bindedDrop) return;

        this.addListener(content, 'dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('active');
        });

        this.addListener(content, 'dragleave', (e) => {
            if (!content.contains(e.relatedTarget)) {
                dropzone.classList.remove('active');
            }
        });

        this.addListener(content, 'drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('active');

            if (e.dataTransfer.files.length > 0) {
                this.uploadFiles(e.dataTransfer.files);
            }
        });
    }

    // ============ 操作方法 ============

    async createFolder() {
        const name = await Modal.prompt('新建文件夹', '请输入文件夹名称', '新文件夹');
        if (!name) return;

        try {
            const res = await Api.post('/filemanager/folders', {
                name: name,
                parent_id: this.state.currentFolderId
            });

            if (res.code === 200) {
                // Toast.success('文件夹创建成功');
                this.loadDirectory(this.state.currentFolderId);
                this.loadFolderTree();
            } else {
                Toast.error(res.message || '创建失败');
            }
        } catch (err) {
            Toast.error('创建失败');
        }
    }

    async uploadFiles(files) {
        if (!files || files.length === 0) return;

        this.setState({ uploading: true });
        Toast.info(`正在上传 ${files.length} 个文件...`);

        try {
            // 构建 FormData，支持多文件上传
            const formData = new FormData();

            // 后端期望字段名为 'files'（复数），支持多个文件
            for (const file of files) {
                formData.append('files', file);
            }

            if (this.state.currentFolderId) {
                formData.append('folder_id', this.state.currentFolderId);
            }

            const res = await Api.upload('/filemanager/upload', formData);

            if (res.code === 200 && res.data) {
                const summary = res.data.summary || {};
                const successCount = summary.success || 0;
                const failCount = summary.failed || 0;
                const errors = res.data.errors || [];

                this.setState({ uploading: false });

                if (successCount > 0) {
                    let message = `成功上传 ${successCount} 个文件`;
                    if (failCount > 0) {
                        message += `，${failCount} 个文件失败`;
                        // 显示失败文件的详细信息
                        const errorMessages = errors.map(e => `${Utils.escapeHtml(String(e.filename))}: ${Utils.escapeHtml(String(e.error))}`).join('; ');
                        if (errorMessages) {
                            Toast.warning(message + '\n' + errorMessages);
                        } else {
                            Toast.warning(message);
                        }
                    } else {
                        Toast.success(message);
                    }
                    this.loadDirectory(this.state.currentFolderId);
                    this.loadStats();
                } else {
                    const errorMessages = errors.map(e => `${Utils.escapeHtml(String(e.filename))}: ${Utils.escapeHtml(String(e.error))}`).join('; ');
                    Toast.error(`上传失败: ${errorMessages || '未知错误'}`);
                }
            } else {
                this.setState({ uploading: false });
                Toast.error(`上传失败: ${res.message || res.detail || '未知错误'}`);
            }
        } catch (err) {
            this.setState({ uploading: false });
            console.error('上传异常:', err);
            Toast.error(`上传异常: ${err.message || '网络错误'}`);
        }
    }


    async toggleStar(fileId) {
        try {
            const res = await Api.put(`/filemanager/files/${fileId}/star`);
            if (res.code === 200) {
                // Toast.success(res.message);
                this.loadDirectory(this.state.currentFolderId);
            }
        } catch (err) {
            Toast.error('操作失败');
        }
    }

    async deleteItem(type, id) {
        const item = type === 'folder'
            ? this.state.folders.find(f => String(f.id) === String(id))
            : this.state.files.find(f => String(f.id) === String(id));

        if (!item) return;

        if (type === 'folder' && item.is_system) {
            Toast.warning('系统文件夹不允许删除');
            return;
        }

        const confirmed = await Modal.confirm('删除确认', `确定要删除这个${type === 'folder' ? '文件夹' : '文件'}吗？${type === 'folder' ? '文件夹内的所有内容也会被删除。' : ''}`);
        if (!confirmed) return;

        try {
            const endpoint = type === 'folder' ? `/filemanager/folders/${id}` : `/filemanager/files/${id}`;
            const res = await Api.delete(endpoint);

            if (res.code === 200) {
                Toast.success('删除成功');
                this.loadDirectory(this.state.currentFolderId);
                if (type === 'folder') {
                    this.loadFolderTree();
                }
                this.loadStats();
            } else {
                Toast.error(res.message || '删除失败');
            }
        } catch (err) {
            Toast.error('删除失败');
        }
    }
    async renameItem(type, id) {

        const item = type === 'folder'
            ? this.state.folders.find(f => String(f.id) === String(id))
            : this.state.files.find(f => String(f.id) === String(id));

        if (!item) return;

        if (item.is_virtual || item.is_readonly || item.is_system) {
            Toast.warning('系统项项目不支持重命名');
            return;
        }

        const newName = await Modal.prompt('重命名', '请输入新名称', item.name);
        if (!newName || newName === item.name) return;

        try {
            const endpoint = type === 'folder'
                ? `/filemanager/folders/${id}`
                : `/filemanager/files/${id}`;

            const res = await Api.put(endpoint, { name: newName });

            if (res.code === 200) {
                Toast.success('重命名成功');
                this.loadDirectory(this.state.currentFolderId);
                if (type === 'folder') {
                    this.loadFolderTree();
                }
            } else {
                Toast.error(res.message || '重命名失败');
            }
        } catch (err) {
            Toast.error('重命名失败');
        }
    }

    async search(keyword) {
        try {
            const res = await Api.get(`/filemanager/search?keyword=${encodeURIComponent(keyword)}`);
            if (res.code === 200) {
                this.setState({
                    breadcrumbs: res.data.breadcrumbs || [],
                    folders: res.data.folders || [],
                    files: res.data.files || [],
                    loading: false
                });
            }
        } catch (err) {
            Toast.error('搜索失败');
        }
    }

    async loadStarred() {
        try {
            const res = await Api.get('/filemanager/starred');
            if (res.code === 200) {
                this.setState({
                    currentFolderId: null,
                    breadcrumbs: [{ id: null, name: '⭐ 我的收藏', path: '/starred' }],
                    folders: [],
                    files: res.data || [],
                    loading: false
                });
            }
        } catch (err) {
            Toast.error('加载收藏失败');
        }
    }


    async deleteItems() {
        const { selectedItems } = this.state;
        if (selectedItems.length === 0) return;

        if (!await Modal.confirm('删除确认', `确定要删除选中的 ${selectedItems.length} 项吗？此操作不可恢复。`)) {
            return;
        }

        // 分离文件和文件夹ID
        const fileIds = [];
        const folderIds = [];

        for (const key of selectedItems) {
            const [type, id] = key.split('-');
            if (type === 'file') {
                fileIds.push(parseInt(id));
            } else if (type === 'folder') {
                folderIds.push(parseInt(id));
            }
        }

        try {
            // 使用批量删除接口
            const res = await Api.post('/filemanager/batch/delete', {
                file_ids: fileIds,
                folder_ids: folderIds
            });

            if (res.code === 200 && res.data) {
                const result = res.data;
                const successCount = result.success_count || 0;
                const failCount = result.failed_count || 0;

                this.setState({ selectedItems: [] });

                // 刷新目录和统计
                this.loadDirectory(this.state.currentFolderId);
                this.loadStats();

                // 如果删除了文件夹，刷新树
                if (folderIds.length > 0) {
                    this.loadFolderTree();
                }

                if (successCount > 0) {
                    let message = `成功删除 ${successCount} 项`;
                    if (failCount > 0) {
                        message += `，${failCount} 项失败`;
                        const errorMessages = (result.errors || []).map(e =>
                            `${e.type === 'file' ? '文件' : '文件夹'} ${Utils.escapeHtml(String(e.id))}: ${Utils.escapeHtml(String(e.error))}`
                        ).join('; ');
                        if (errorMessages) {
                            Toast.warning(message + '\n' + errorMessages);
                        } else {
                            Toast.warning(message);
                        }
                    } else {
                        Toast.success(message);
                    }
                } else {
                    const errorMessages = (result.errors || []).map(e =>
                        `${e.type === 'file' ? '文件' : '文件夹'} ${Utils.escapeHtml(String(e.id))}: ${Utils.escapeHtml(String(e.error))}`
                    ).join('; ');
                    Toast.error(`删除失败: ${errorMessages || '未知错误'}`);
                }
            } else {
                Toast.error(res.message || '删除失败');
            }
        } catch (err) {
            console.error('批量删除失败:', err);
            Toast.error(`删除失败: ${err.message || '网络错误'}`);
        }
    }
    // 检查是否可以下载（旧方法，保持兼容）
    canDownload() {
        const { selectedItems } = this.state;
        if (selectedItems.length !== 1) return false;
        return selectedItems[0].startsWith('file-');
    }

    // 检查是否可以下载（支持文件和文件夹）
    canDownloadAny() {
        const { selectedItems } = this.state;
        if (selectedItems.length !== 1) return false;
        // 支持文件或文件夹
        return selectedItems[0].startsWith('file-') || selectedItems[0].startsWith('folder-');
    }

    // 下载选中项（文件或文件夹）
    downloadSelected() {
        const { selectedItems } = this.state;
        if (selectedItems.length !== 1) {
            Toast.warning('请选择一个文件或文件夹进行下载');
            return;
        }

        const [type, id] = selectedItems[0].split('-');
        if (type === 'file') {
            this.downloadFile(id);
        } else if (type === 'folder') {
            this.downloadFolder(id);
        }
    }

    // 下载单个文件
    downloadFile(id) {
        // 如果未传入ID，尝试从选中项获取
        if (!id) {
            const { selectedItems } = this.state;
            if (selectedItems.length === 1 && selectedItems[0].startsWith('file-')) {
                id = selectedItems[0].split('-')[1];
            }
        }

        if (!id) return;

        const token = Utils.getToken();
        const url = `${Config.apiBase}/filemanager/download/${id}?token=${token}`;

        // 创建隐藏的 iframe 进行下载，避免弹出新窗口被拦截
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        this.setTimeout(() => document.body.removeChild(iframe), 60000);
    }

    // 下载文件夹（打包为ZIP）
    async downloadFolder(id) {
        if (!id) return;

        const folder = this.state.folders.find(f => String(f.id) === String(id));
        const folderName = folder ? folder.name : '文件夹';

        Toast.info(`正在打包 "${folderName}"，请稍候...`);

        const token = Utils.getToken();
        const url = `${Config.apiBase}/filemanager/folders/${id}/download?token=${token}`;

        // 使用 iframe 下载
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        this.setTimeout(() => document.body.removeChild(iframe), 120000);
    }

    // 上传文件夹（保持目录结构）
    async uploadFolder(files) {
        if (!files || files.length === 0) return;

        this.setState({ uploading: true });
        Toast.info(`正在上传文件夹（${files.length} 个文件）...`);

        try {
            const formData = new FormData();

            // 收集文件和相对路径
            for (const file of files) {
                formData.append('files', file);
                // webkitRelativePath 包含相对于选择的根目录的路径
                formData.append('relative_paths', file.webkitRelativePath || file.name);
            }

            if (this.state.currentFolderId) {
                formData.append('folder_id', this.state.currentFolderId);
            }

            // 使用文件夹上传接口
            const res = await Api.upload('/filemanager/upload/folder', formData);

            if (res.code === 200 && res.data) {
                const summary = res.data.summary || {};
                const successCount = summary.success || 0;
                const failCount = summary.failed || 0;
                const createdFolders = summary.created_folders || 0;
                const errors = res.data.errors || [];

                this.setState({ uploading: false });

                if (successCount > 0 || createdFolders > 0) {
                    let message = `上传完成：${successCount} 个文件`;
                    if (createdFolders > 0) {
                        message += `，${createdFolders} 个文件夹`;
                    }
                    if (failCount > 0) {
                        message += `，${failCount} 个失败`;
                        const errorMessages = errors.map(e => `${Utils.escapeHtml(String(e.filename))}: ${Utils.escapeHtml(String(e.error))}`).join('; ');
                        if (errorMessages) {
                            Toast.warning(message + '\n' + errorMessages);
                        } else {
                            Toast.warning(message);
                        }
                    } else {
                        Toast.success(message);
                    }
                    this.loadDirectory(this.state.currentFolderId);
                    this.loadFolderTree();
                    this.loadStats();
                } else {
                    const errorMessages = errors.map(e => `${Utils.escapeHtml(String(e.filename))}: ${Utils.escapeHtml(String(e.error))}`).join('; ');
                    Toast.error(`上传失败: ${errorMessages || '未知错误'}`);
                }
            } else {
                this.setState({ uploading: false });
                Toast.error(`上传失败: ${res.message || res.detail || '未知错误'}`);
            }
        } catch (err) {
            this.setState({ uploading: false });
            console.error('文件夹上传异常:', err);
            Toast.error(`上传异常: ${err.message || '网络错误'}`);
        }
    }

    previewFile(id) {
        const file = this.state.files.find(f => f.id == id);
        if (!file) return;

        const token = Utils.getToken();
        const url = `${Config.apiBase}/filemanager/preview/${id}?token=${token}`;
        const mime = file.mime_type || '';

        // 根据文件类型选择预览方式
        if (mime.startsWith('image/')) {
            // 图片预览
            Modal.show({
                title: Utils.escapeHtml(file.name),
                content: `<div style="text-align: center; background: #1a1a1a; padding: 20px; border-radius: 8px;">
                    <img src="${Utils.escapeHtml(url)}" style="max-width: 100%; max-height: 75vh; border-radius: 4px;" alt="${Utils.escapeHtml(file.name)}">
                </div>`,
                width: '900px'
            });
        } else if (mime.startsWith('video/')) {
            // 视频预览
            Modal.show({
                title: `🎬 ${Utils.escapeHtml(file.name)}`,
                content: `<div style="text-align: center; background: #000; border-radius: 8px; overflow: hidden;">
                    <video controls autoplay style="max-width: 100%; max-height: 75vh;">
                        <source src="${Utils.escapeHtml(url)}" type="${Utils.escapeHtml(mime)}">
                        您的浏览器不支持视频播放
                    </video>
                </div>`,
                width: '900px'
            });
        } else if (mime.startsWith('audio/')) {
            // 音频预览
            Modal.show({
                title: `🎵 ${Utils.escapeHtml(file.name)}`,
                content: `<div style="text-align: center; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🎵</div>
                    <div style="color: white; font-size: 18px; margin-bottom: 20px;">${Utils.escapeHtml(file.name)}</div>
                    <audio controls autoplay style="width: 100%;">
                        <source src="${Utils.escapeHtml(url)}" type="${mime}">
                        您的浏览器不支持音频播放
                    </audio>
                </div>`,
                width: '500px'
            });
        } else if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            // PDF 预览 - 使用 PdfViewer 组件
            if (window.PdfViewer) {
                PdfViewer.open({
                    fileId: file.id,
                    filename: file.name,
                    source: 'filemanager'
                });
            } else {
                // 降级处理：使用 iframe
                Modal.show({
                    title: `📕 ${Utils.escapeHtml(file.name)}`,
                    content: `<iframe src="${Utils.escapeHtml(url)}" style="width: 100%; height: 80vh; border: none; border-radius: 8px;"></iframe>`,
                    width: '900px'
                });
            }
        } else if (mime.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(mime)) {
            // 文本文件预览
            fetch(url)
                .then(res => res.text())
                .then(text => {
                    Modal.show({
                        title: `📄 ${Utils.escapeHtml(file.name)}`,
                        content: `<pre style="max-height: 70vh; overflow: auto; background: var(--color-bg-tertiary); padding: 16px; border-radius: 8px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all;">${Utils.escapeHtml(text)}</pre>`,
                        width: '800px'
                    });
                })
                .catch(() => {
                    window.open(url, '_blank');
                });
        } else if (mime.includes('word') || mime.includes('document') || file.name.endsWith('.docx')) {
            // Word 文档预览 - 使用 OfficeViewer 组件
            if (window.OfficeViewer && window.OfficeViewer.isWordFile(file.name)) {
                OfficeViewer.previewWord({ url, filename: file.name });
            } else {
                // 降级处理
                Modal.show({
                    title: `📄 ${Utils.escapeHtml(file.name)}`,
                    content: `<div style="text-align: center; padding: 40px;">
                        <p style="margin-bottom: 20px;">Word 预览组件未加载</p>
                        <button class="btn btn-primary" data-download-url="${Utils.escapeHtml(url)}">下载查看</button>
                    </div>`,
                    width: '500px',
                    onConfirm: () => { window.open(url, '_blank'); return true; }
                });
            }
        } else if (mime.includes('spreadsheet') || mime.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // Excel 表格预览 - 使用 OfficeViewer 组件
            if (window.OfficeViewer && window.OfficeViewer.isExcelFile(file.name)) {
                OfficeViewer.previewExcel({ url, filename: file.name });
            } else {
                // 降级处理
                Modal.show({
                    title: `📊 ${Utils.escapeHtml(file.name)}`,
                    content: `<div style="text-align: center; padding: 40px;">
                        <p style="margin-bottom: 20px;">Excel 预览组件未加载</p>
                        <button class="btn btn-primary" data-download-url="${Utils.escapeHtml(url)}">下载查看</button>
                    </div>`,
                    width: '500px',
                    onConfirm: () => { window.open(url, '_blank'); return true; }
                });
            }
        } else if (mime.includes('presentation') || mime.includes('powerpoint')) {
            // PPT 暂不支持在线预览
            Modal.show({
                title: `📽️ ${Utils.escapeHtml(file.name)}`,
                content: `<div style="text-align: center; padding: 40px;">
                    <p style="margin-bottom: 20px;">PPT 文件暂不支持在线预览</p>
                    <button class="btn btn-primary" data-download-url="${Utils.escapeHtml(url)}">下载查看</button>
                </div>`,
                width: '500px',
                onConfirm: () => { window.open(url, '_blank'); return true; }
            });
        } else {
            // 其他文件直接下载
            this.downloadFile(id);
        }
    }

    // ============ 右键菜单 ============

    setupContextMenu() {
        const container = this.container;
        if (!container || container._bindContext) return;
        container._bindContext = true;

        // 存储当前右键的目标
        this.contextTarget = null;

        // 右键事件
        this.addListener(container, 'contextmenu', (e) => {
            const item = e.target.closest('.fm-item, .fm-list-item');
            if (!item) {
                this.hideContextMenu();
                return;
            }

            e.preventDefault();

            const type = item.dataset.type;
            const id = parseInt(item.dataset.id);
            this.contextTarget = { type, id };

            // 根据类型调整菜单项
            const menu = this.$('#contextMenu');
            if (!menu) return;

            // 显示/隐藏相关菜单项
            const previewItem = menu.querySelector('[data-menu-action="preview"]');
            const downloadItem = menu.querySelector('[data-menu-action="download"]');
            const starItem = menu.querySelector('[data-menu-action="star"]');

            if (previewItem) previewItem.style.display = type === 'file' ? 'flex' : 'none';
            if (downloadItem) downloadItem.style.display = 'flex'; // 文件和文件夹都可以下载
            if (starItem) starItem.style.display = type === 'file' ? 'flex' : 'none';

            // 立即保存鼠标坐标
            const clickX = e.clientX;
            const clickY = e.clientY;

            // 显示菜单以获取尺寸和 offsetParent
            menu.style.display = 'block';
            menu.style.position = 'absolute'; // 强制使用 absolute，避免 fixed 在 transform 下的 bug
            menu.style.zIndex = '10000';

            // 获取菜单尺寸
            const menuWidth = menu.offsetWidth || 180;
            const menuHeight = menu.offsetHeight || 250;

            // 计算相对于 offsetParent 的坐标
            let x = clickX;
            let y = clickY;

            const offsetParent = menu.offsetParent;
            if (offsetParent) {
                const parentRect = offsetParent.getBoundingClientRect();
                x = clickX - parentRect.left;
                y = clickY - parentRect.top;

                // 边界检查（使用屏幕坐标判断是否超出）
                if (clickX + menuWidth > window.innerWidth) {
                    x -= menuWidth;
                }
                if (clickY + menuHeight > window.innerHeight) {
                    y -= menuHeight;
                }
            } else {
                // 如果没有 offsetParent，回退到视口坐标
                if (clickX + menuWidth > window.innerWidth) x = clickX - menuWidth;
                if (clickY + menuHeight > window.innerHeight) y = clickY - menuHeight;
            }

            // 确保不为负数
            x = Math.max(0, x);
            y = Math.max(0, y);

            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
        });

        // 点击其他地方隐藏菜单
        this.addDocumentEvent('click', () => this.hideContextMenu());

        // 菜单项点击
        this.delegate('click', '[data-menu-action]', (e, t) => {
            const action = t.dataset.menuAction;
            this.handleContextAction(action);
            this.hideContextMenu();
        });
    }

    hideContextMenu() {
        const menu = this.$('#contextMenu');
        if (menu) menu.style.display = 'none';
    }

    handleContextAction(action) {
        if (!this.contextTarget) return;
        const { type, id } = this.contextTarget;

        switch (action) {
            case 'open':
                if (type === 'folder') {
                    this.loadDirectory(id);
                } else {
                    this.previewFile(id);
                }
                break;
            case 'preview':
                if (type === 'file') this.previewFile(id);
                break;
            case 'download':
                if (type === 'file') {
                    this.downloadFile(id);
                } else if (type === 'folder') {
                    this.downloadFolder(id);
                }
                break;
            case 'rename':
                this.renameItem(type, id);
                break;
            case 'move':
                this.showMoveDialog(type, id);
                break;
            case 'star':
                if (type === 'file') this.toggleStar(id);
                break;
            case 'delete':
                this.deleteItem(type, id);
                break;
        }
    }

    // ============ 移动对话框 ============

    async showMoveDialog(type, id) {
        // 获取文件夹树
        const tree = this.state.folderTree;
        const currentFolderId = this.state.currentFolderId;

        // 构建文件夹选择HTML
        const buildFolderOptions = (nodes, level = 0) => {
            let html = '';
            for (const node of nodes) {
                // 如果是移动文件夹，排除自己和子文件夹
                if (type === 'folder' && node.id === id) continue;

                const indent = '&nbsp;&nbsp;'.repeat(level);
                const selected = node.id === currentFolderId ? 'selected' : '';
                html += `<option value="${node.id}" ${selected}>${indent}📁 ${Utils.escapeHtml(node.name)}</option>`;
                if (node.children && node.children.length > 0) {
                    html += buildFolderOptions(node.children, level + 1);
                }
            }
            return html;
        };

        const folderOptions = buildFolderOptions(tree);
        const itemName = type === 'folder'
            ? this.state.folders.find(f => f.id === id)?.name
            : this.state.files.find(f => f.id === id)?.name;

        const confirmed = await Modal.confirm('移动到...', `
            <div style="margin-bottom: 16px;">
                将 <strong>${Utils.escapeHtml(itemName || '所选项')}</strong> 移动到：
            </div>
            <select id="moveTargetFolder" class="form-select" style="width: 100%; padding: 10px; border-radius: 8px; background: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                <option value="">📂 根目录</option>
                ${folderOptions}
            </select>
        `);

        if (confirmed) {
            const select = document.getElementById('moveTargetFolder');
            const targetFolderId = select?.value ? parseInt(select.value) : null;
            await this.moveItem(type, id, targetFolderId);
        }
    }

    async moveItem(type, id, targetFolderId) {
        try {
            const endpoint = type === 'folder'
                ? `/filemanager/folders/${id}/move`
                : `/filemanager/files/${id}/move`;

            const body = type === 'folder'
                ? { target_parent_id: targetFolderId }
                : { target_folder_id: targetFolderId };

            const res = await Api.put(endpoint, body);

            if (res.code === 200) {
                Toast.success('移动成功');
                this.loadDirectory(this.state.currentFolderId);
                if (type === 'folder') {
                    this.loadFolderTree();
                }
            } else {
                Toast.error(res.message || '移动失败');
            }
        } catch (err) {
            Toast.error('移动失败: ' + err.message);
        }
    }

    // ============ 拖拽移动 ============

    setupDragMove() {
        const container = this.container;
        if (!container || container._bindDragMove) return;
        container._bindDragMove = true;

        let draggedItem = null;
        let dragType = null;
        let dragId = null;

        // 使文件项可拖拽
        this.addListener(container, 'dragstart', (e) => {
            const item = e.target.closest('.fm-item, .fm-list-item');
            if (!item) return;

            draggedItem = item;
            dragType = item.dataset.type;
            dragId = parseInt(item.dataset.id);

            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `${dragType}-${dragId}`);
        });

        this.addListener(container, 'dragend', (e) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            // 移除所有拖拽悬停效果
            container.querySelectorAll('.fm-item.drag-over, .fm-tree-item.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        });

        // 文件夹接收拖拽
        this.addListener(container, 'dragover', (e) => {
            const target = e.target.closest('.fm-item[data-type="folder"], .fm-tree-item');
            if (target && draggedItem && target !== draggedItem) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                target.classList.add('drag-over');
            }
        });

        this.addListener(container, 'dragleave', (e) => {
            const target = e.target.closest('.fm-item[data-type="folder"], .fm-tree-item');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        this.addListener(container, 'drop', async (e) => {
            const target = e.target.closest('.fm-item[data-type="folder"], .fm-tree-item');
            if (!target || !dragType || !dragId) return;

            e.preventDefault();
            target.classList.remove('drag-over');

            const targetFolderId = parseInt(target.dataset.folderId || target.dataset.id);

            // 不允许移动到自己
            if (dragType === 'folder' && dragId === targetFolderId) {
                Toast.warning('不能将文件夹移动到自己');
                return;
            }

            await this.moveItem(dragType, dragId, targetFolderId);

            dragType = null;
            dragId = null;
        });

        // 使文件项可拖拽
        container.querySelectorAll('.fm-item, .fm-list-item').forEach(item => {
            item.setAttribute('draggable', 'true');
        });
    }
    destroy() {
        super.destroy();
    }
}

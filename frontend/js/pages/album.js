/**
 * 相册页面组件
 * 
 * 功能：相册管理、照片上传和预览、批量操作、封面设置、拖拽上传
 * 优化：旗舰级视觉效果、平滑切换、性能预加、批量删除
 */

class AlbumPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            view: 'albums',  // 专辑 | 照片 | 查看器
            albums: [],
            photos: [],
            currentAlbum: null,
            selectedPhoto: null,
            selectedIndex: 0,
            loading: false,
            uploading: false,
            uploadProgress: 0,
            selectedIds: new Set(),
            selectionMode: false,
            keyword: ''
        };
    }

    async afterMount() {
        this.bindEvents();
        await this.loadAlbums();
    }

    afterUpdate() {
        // 每次更新后绑定图片错误处理
        this.bindImageErrorHandlers();

        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        if (!this.container) return;

        // --- 相册列表事件 ---
        // 创建相册
        this.delegate('click', '[data-action="create-album"]', () => this.showCreateAlbumModal());

        // 帮助按钮
        if (window.ModuleHelp) {
            this.delegate('click', '[data-action="show-help"]', () => {
                ModuleHelp.show('album', '相册');
            });
        }

        // 搜索相册
        this.delegate('click', '#albumSearchBtn', () => {
            const val = this.container.querySelector('#albumSearchInput')?.value.trim() || '';
            this.setState({ keyword: val });
            this.loadAlbums();
        });

        this.delegate('keydown', '#albumSearchInput', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                this.setState({ keyword: val });
                this.loadAlbums();
            }
        });
        this.delegate('click', '.album-card', (e, el) => {
            // 如果点击的是操作按钮，不触发打开相册
            if (e.target.closest('[data-action="edit-album"]') || e.target.closest('[data-action="delete-album"]')) {
                return;
            }
            const albumId = el.dataset.albumId;
            if (albumId) this.openAlbum(parseInt(albumId));
        });
        this.delegate('click', '[data-action="edit-album"]', (e, el) => {
            e.stopPropagation();
            const albumId = el.dataset.albumId;
            if (albumId) this.showEditAlbumModal(parseInt(albumId));
        });
        this.delegate('click', '[data-action="delete-album"]', async (e, el) => {
            e.stopPropagation();
            const albumId = el.dataset.albumId;
            if (albumId) await this.deleteAlbum(parseInt(albumId));
        });

        // --- 照片列表事件 ---
        this.delegate('click', '[data-action="back-to-albums"]', () => this.backToAlbums());
        this.delegate('click', '[data-action="upload-photos"]', () => this.triggerUpload());
        this.delegate('change', '#photoUploadInput', (e) => this.handleFileSelect(e));

        // 拖拽上传支持
        this.delegate('dragover', '.photo-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.photo-grid-view').classList.add('drag-over');
        });
        this.delegate('dragleave', '.photo-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.photo-grid-view').classList.remove('drag-over');
        });
        this.delegate('drop', '.photo-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.photo-grid-view').classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleUploadFiles(Array.from(files));
        });

        // 多选逻辑
        this.delegate('click', '[data-action="toggle-selection"]', () => this.toggleSelectionMode());
        this.delegate('click', '[data-action="batch-download"]', () => this.handleBatchDownload());
        this.delegate('click', '[data-action="batch-delete"]', () => this.handleBatchDelete());
        this.delegate('click', '[data-action="select-all"]', () => this.selectAllPhotos());

        // 照片点击
        this.delegate('click', '.photo-item', (e, el) => {
            const index = parseInt(el.dataset.index);
            const photoId = parseInt(el.dataset.photoId);

            if (this.state.selectionMode) {
                this.togglePhotoSelection(photoId);
            } else {
                this.openViewer(index);
            }
        });

        // 设为封面
        this.delegate('click', '[data-action="set-cover"]', async (e, el) => {
            e.stopPropagation();
            const photoId = el.dataset.photoId;
            if (photoId) await this.setAlbumCover(parseInt(photoId));
        });

        // 编辑照片
        this.delegate('click', '[data-action="edit-photo"]', async (e, el) => {
            e.stopPropagation();
            const photoId = el.dataset.photoId;
            if (photoId) this.showEditPhotoModal(parseInt(photoId));
        });

        // 拖拽排序
        this.delegate('dragstart', '.photo-item', (e, el) => this.handleDragStart(e, el));
        this.delegate('dragenter', '.photo-item', (e, el) => this.handleDragEnter(e, el));
        this.delegate('dragleave', '.photo-item', (e, el) => this.handleDragLeave(e, el));
        this.delegate('dragover', '.photo-item', (e, el) => this.handleDragOver(e, el));
        this.delegate('drop', '.photo-item', (e, el) => this.handleDrop(e, el));
        this.delegate('dragend', '.photo-item', (e, el) => this.handleDragEnd(e, el));

        // --- 查看器事件 ---
        this.delegate('click', '.photo-viewer-overlay', (e) => {
            if (e.target.classList.contains('photo-viewer-overlay') || e.target.classList.contains('viewer-content')) {
                this.closeViewer();
            }
        });
        this.delegate('click', '[data-action="close-viewer"]', () => this.closeViewer());
        this.delegate('click', '[data-action="prev-photo"]', () => this.prevPhoto());
        this.delegate('click', '[data-action="next-photo"]', () => this.nextPhoto());

        // 键盘快捷键
        this.addDocumentEvent('keydown', this._keyHandler);
    }

    destroy() {
        super.destroy();
    }

    /**
     * 为图片 URL 附加 token 参数以支持认证
     * @param {string} url 原始 URL
     * @returns {string} 附加了 token 的 URL
     */
    withToken(url) {
        if (!url) return url;
        const token = Utils.getToken();
        if (!token) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}token=${encodeURIComponent(token)}`;
    }

    /**
     * 检查 API 响应是否成功
     */
    isApiSuccess(res) {
        return res && (res.code === 200 || res.code === 0);
    }

    /**
     * 处理图片加载失败，显示占位符
     */
    handleImageError(img, type = 'photo') {
        if (!img) return;
        const placeholder = type === 'album'
            ? '<i class="ri-image-2-line"></i>'
            : '<i class="ri-image-line"></i>';
        const wrapper = document.createElement('div');
        wrapper.className = type === 'album' ? 'album-cover-placeholder' : 'photo-placeholder';
        wrapper.innerHTML = placeholder;
        img.parentNode.replaceChild(wrapper, img);
    }

    /**
     * 绑定图片错误处理事件
     */
    bindImageErrorHandlers() {
        // 为所有图片添加错误处理
        const images = this.container.querySelectorAll('img[data-fallback]');
        images.forEach(img => {
            if (!img._errorBound) {
                img._errorBound = true;
                img.onerror = () => this.handleImageError(img, img.dataset.fallback);
            }
        });
    }

    // ==================== 数据加载 ====================

    async loadAlbums() {
        this.setState({ loading: true });
        try {
            const { keyword } = this.state;
            // 手动构建查询参数，避免 Api 封装差异导致的问题
            const params = [];
            if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);

            const url = `/album/${params.length > 0 ? '?' + params.join('&') : ''}`;
            const res = await Api.get(url);

            if (this.isApiSuccess(res) && res.data && Array.isArray(res.data.items)) {
                this.setState({ albums: res.data.items });
            } else {
                this.setState({ albums: [] });
            }
        } catch (e) {
            console.error('加载相册异常:', e);
            Toast.error('加载相册失败: ' + (e.message || '未知错误'));
        } finally {
            this.setState({ loading: false });
        }
    }

    async loadAlbumDetail(albumId) {
        this.setState({ loading: true });
        try {
            const res = await Api.get(`/album/${albumId}`);
            if (this.isApiSuccess(res)) {
                this.setState({
                    currentAlbum: res.data,
                    photos: res.data.photos || [],
                    view: 'photos',
                    selectedIds: new Set(),
                    selectionMode: false
                });
            }
        } catch (e) {
            Toast.error('加载相册详情失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    // ==================== 相册/照片操作 ====================

    async setAlbumCover(photoId) {
        const { currentAlbum } = this.state;
        if (!currentAlbum) return;

        try {
            const res = await Api.put(`/album/${currentAlbum.id}`, { cover_photo_id: photoId });
            if (this.isApiSuccess(res)) {
                Toast.success('已设为相册封面');
                // 更新本地状态
                this.setState({
                    currentAlbum: { ...currentAlbum, cover_photo_id: photoId }
                });
            }
        } catch (e) {
            Toast.error('设置封面失败');
        }
    }

    triggerUpload() {
        const input = this.container.querySelector('#photoUploadInput');
        if (input) input.click();
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) await this.handleUploadFiles(files);
        e.target.value = '';
    }

    async handleUploadFiles(files) {
        const { currentAlbum } = this.state;
        if (!currentAlbum) return;

        // 过滤非图片文件
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            Toast.info('请选择图片文件上传');
            return;
        }

        // 检查文件大小 (20MB)
        const MAX_SIZE = 20 * 1024 * 1024;
        const oversizedFiles = imageFiles.filter(f => f.size > MAX_SIZE);
        if (oversizedFiles.length > 0) {
            Toast.error(`部分文件超过 20MB 限制：\n${oversizedFiles.map(f => f.name).slice(0, 3).join('\n')}${oversizedFiles.length > 3 ? '...' : ''}`);
            return;
        }

        this.setState({ uploading: true, uploadProgress: 0 });

        let uploadedCount = 0;
        const total = imageFiles.length;
        const CONCURRENT_LIMIT = 3; // 并发限制

        // 辅助函数：单个上传
        const uploadFile = async (file) => {
            try {
                const formData = new FormData();
                formData.append('file', file);
                await Api.upload(`/album/${currentAlbum.id}/photos`, formData);
                uploadedCount++;
                this.setState({ uploadProgress: Math.round((uploadedCount / total) * 100) });
                return true;
            } catch (err) {
                console.error('上传失败:', file.name, err);
                return false;
            }
        };

        // 并发控制执行
        const results = [];
        const executing = [];

        for (const file of imageFiles) {
            const p = uploadFile(file);
            results.push(p);

            if (CONCURRENT_LIMIT <= imageFiles.length) {
                const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                executing.push(e);
                if (executing.length >= CONCURRENT_LIMIT) {
                    await Promise.race(executing);
                }
            }
        }

        await Promise.all(results);

        const successCount = (await Promise.all(results)).filter(Boolean).length;

        if (successCount > 0) {
            Toast.success(`成功上传 ${successCount} 张照片`);
            await this.loadAlbumDetail(currentAlbum.id);
        } else {
            Toast.error('照片上传失败');
        }
        this.setState({ uploading: false, uploadProgress: 0 });
    }

    toggleSelectionMode() {
        this.setState({
            selectionMode: !this.state.selectionMode,
            selectedIds: new Set()
        });
    }

    togglePhotoSelection(photoId) {
        const selectedIds = new Set(this.state.selectedIds);
        if (selectedIds.has(photoId)) {
            selectedIds.delete(photoId);
        } else {
            selectedIds.add(photoId);
        }
        this.setState({ selectedIds });
    }

    selectAllPhotos() {
        const { photos, selectedIds } = this.state;
        if (selectedIds.size === photos.length) {
            this.setState({ selectedIds: new Set() });
        } else {
            const allIds = new Set(photos.map(p => p.id));
            this.setState({ selectedIds: allIds });
        }
    }

    async handleBatchDelete() {
        const { selectedIds, currentAlbum } = this.state;
        if (selectedIds.size === 0) return;

        const confirmed = await Modal.confirm('批量删除', `确定要删除选中的 ${selectedIds.size} 张照片吗？`);
        if (!confirmed) return;

        try {
            const res = await Api.post('/album/photos/batch-delete', { ids: Array.from(selectedIds) });
            if (this.isApiSuccess(res)) {
                Toast.success(res.message || '照片已删除');
                await this.loadAlbumDetail(currentAlbum.id);
            }
        } catch (e) {
            Toast.error('批量删除失败');
        }
    }

    async deleteAlbum(albumId) {
        const confirmed = await Modal.confirm('删除相册', '确定要删除这个相册吗？相册中的所有照片也将被删除，此操作不可恢复。');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/album/${albumId}`);
            if (res.code === 200 || res.code === 0) {
                Toast.success('相册已删除');
                await this.loadAlbums();
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    openAlbum(albumId) {
        this.loadAlbumDetail(albumId);
    }

    backToAlbums() {
        this.setState({ view: 'albums', currentAlbum: null, photos: [] });
    }

    // ==================== 查看器 ====================

    openViewer(index) {
        const { photos } = this.state;
        if (index < 0 || index >= photos.length) return;

        this.setState({
            view: 'viewer',
            selectedPhoto: photos[index],
            selectedIndex: index
        });

        // 预加载下一张
        this.preloadNext(index);
    }

    preloadNext(index) {
        const { photos } = this.state;
        const nextIndex = (index + 1) % photos.length;
        const img = new Image();
        img.src = this.withToken(photos[nextIndex].url);
    }

    closeViewer() {
        this.setState({ view: 'photos', selectedPhoto: null });
    }

    prevPhoto() {
        const { photos, selectedIndex } = this.state;
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : photos.length - 1;
        this.setState({
            selectedIndex: newIndex,
            selectedPhoto: photos[newIndex]
        });
    }

    nextPhoto() {
        const { photos, selectedIndex } = this.state;
        const newIndex = selectedIndex < photos.length - 1 ? selectedIndex + 1 : 0;
        this.setState({
            selectedIndex: newIndex,
            selectedPhoto: photos[newIndex]
        });
        this.preloadNext(newIndex);
    }

    // ==================== 渲染函数 ====================

    render() {
        try {
            const { view, loading, uploading, uploadProgress } = this.state;

            return `
                <div class="album-page fade-in">
                    ${view === 'albums' ? this.renderAlbumList() : ''}
                    ${view === 'photos' ? this.renderPhotoGrid() : ''}
                    ${view === 'viewer' ? this.renderViewer() : ''}
                    
                    ${uploading ? `
                        <div class="upload-progress-container">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold">正在上传照片...</span>
                                <span class="text-secondary">${uploadProgress}%</span>
                            </div>
                            <div class="progress-bar-wrapper">
                                <div class="progress-bar-inner" style="width: ${uploadProgress}%"></div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (e) {
            console.error('渲染错误:', e);
            return `<div class="alert alert-danger m-4">页面渲染错误: ${e.message}</div>`;
        }
    }

    renderAlbumList() {
        const { albums, loading, keyword } = this.state;

        if (loading && albums.length === 0) {
            return '<div class="loading-full"><div class="loading-spinner"></div></div>';
        }

        return `
            <div class="album-list-view">
                <div class="page-header">
                    <div class="header-left">
                        <h1 class="page-title">我的相册</h1>
                    </div>
                    <div class="header-right d-flex align-items-center gap-3">
                        <div class="search-group search-box" style="width: 240px;">
                            <input type="text" id="albumSearchInput" class="form-control" placeholder="搜索相册..." value="${Utils.escapeHtml(keyword)}">
                            <button class="btn btn-primary" id="albumSearchBtn">
                                <i class="ri-search-line"></i>
                            </button>
                        </div>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('album', '相册') : `
                            <button class="btn btn-ghost" data-action="show-help" title="使用帮助">
                                <i class="ri-question-line"></i> 帮助
                            </button>
                        `}
                        <button class="btn btn-primary" data-action="create-album">
                            <i class="ri-add-line"></i> 创建相册
                        </button>
                    </div>
                </div>

                <div class="album-grid">
                    ${albums.length === 0 ? `
                        <div class="empty-state">
                            <i class="ri-image-line"></i>
                            <div class="main-text">还没有相册</div>
                            <div class="sub-text">点击右上方按钮创建一个相册来整理您的瞬间</div>
                        </div>
                    ` : albums.map(album => `
                        <div class="album-card" data-album-id="${Utils.escapeHtml(String(album.id))}">
                            <div class="album-cover">
                                ${album.cover_url
                ? `<img src="${Utils.escapeHtml(this.withToken(album.cover_url))}" alt="${Utils.escapeHtml(album.name || '')}" loading="lazy" data-fallback="album">`
                : `<div class="album-cover-placeholder"><i class="ri-image-2-line"></i></div>`
            }
                                <div class="album-overlay">
                                    <button class="album-action-btn" data-action="edit-album" data-album-id="${Utils.escapeHtml(String(album.id))}" title="编辑">
                                        <i class="ri-edit-line"></i>
                                    </button>
                                    <button class="album-action-btn danger" data-action="delete-album" data-album-id="${Utils.escapeHtml(String(album.id))}" title="删除">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="album-info">
                                <div class="album-name">${Utils.escapeHtml(album.name || '未命名')}</div>
                                <div class="album-meta">${album.photo_count || 0} 张照片</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderPhotoGrid() {
        const { currentAlbum, photos, selectionMode, selectedIds, loading } = this.state;

        return `
            <div class="photo-grid-view">
                <div class="page-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back-to-albums">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <div>
                            <h1 class="page-title">${Utils.escapeHtml(currentAlbum?.name || '未命名相册')}</h1>
                            <p class="page-subtitle">${Utils.escapeHtml(String(photos.length))} 张照片</p>
                        </div>
                    </div>
                    <div class="header-actions d-flex gap-2">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('album', '相册') : `
                            <button class="btn btn-ghost" data-action="show-help" title="使用帮助">
                                <i class="ri-question-line"></i> 帮助
                            </button>
                        `}
                        ${selectionMode ? `
                            <button class="btn btn-ghost" data-action="select-all">
                                ${selectedIds.size === photos.length ? '取消全选' : '全选'}
                            </button>
                            <button class="btn btn-secondary" data-action="batch-download" ${selectedIds.size === 0 ? 'disabled' : ''}>
                                <i class="ri-download-line"></i> 下载 (${Utils.escapeHtml(String(selectedIds.size))})
                            </button>
                            <button class="btn btn-danger" data-action="batch-delete" ${selectedIds.size === 0 ? 'disabled' : ''}>
                                删除 (${Utils.escapeHtml(String(selectedIds.size))})
                            </button>
                            <button class="btn btn-primary" data-action="toggle-selection">退出管理</button>
                        ` : `
                            <button class="btn btn-ghost" data-action="toggle-selection" ${photos.length === 0 ? 'disabled' : ''}>
                                <i class="ri-checkbox-multiple-line"></i> 管理
                            </button>
                            <input type="file" id="photoUploadInput" multiple accept="image/*" style="display:none;">
                            <button class="btn btn-primary" data-action="upload-photos">
                                <i class="ri-upload-cloud-2-line"></i> 上传照片
                            </button>
                        `}
                    </div>
                </div >

    ${loading && photos.length === 0 ? '<div class="loading-center"><div class="loading-spinner"></div></div>' : `
                    <div class="photo-grid">
                        ${photos.length === 0 ? `
                            <div class="empty-state">
                                <i class="ri-image-add-line"></i>
                                <div class="main-text">相册内还没有照片</div>
                                <div class="sub-text">直接将图片拖拽到此处，或点击上传按钮</div>
                            </div>
                        ` : photos.map((photo, index) => {
            const isSelected = selectedIds.has(photo.id);
            const isCover = currentAlbum?.cover_photo_id === photo.id;
            return `
                                <div class="photo-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-photo-id="${Utils.escapeHtml(String(photo.id))}" ${!selectionMode ? 'draggable="true"' : ''}>
                                    <img src="${Utils.escapeHtml(this.withToken(photo.thumbnail_url))}" alt="${Utils.escapeHtml(photo.filename)}" loading="lazy" data-fallback="photo">
                                    <div class="photo-overlay">
                                        ${selectionMode ? `
                                            <div class="photo-checkbox ${isSelected ? 'checked' : ''}">
                                                <i class="${isSelected ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i>
                                            </div>
                                        ` : `
                                            <button class="photo-action-btn" data-action="edit-photo" data-photo-id="${Utils.escapeHtml(String(photo.id))}" title="编辑">
                                                <i class="ri-edit-line"></i>
                                            </button>
                                            <button class="photo-action-btn ${isCover ? 'active' : ''}" data-action="set-cover" data-photo-id="${Utils.escapeHtml(String(photo.id))}" title="${isCover ? '当前封面' : '设为封面'}">
                                                <i class="${isCover ? 'ri-bookmark-fill' : 'ri-bookmark-line'}"></i>
                                            </button>
                                        `}
                                    </div>
                                    ${isCover ? '<div class="photo-badge">封面</div>' : ''}
                                </div>
                            `;
        }).join('')}
                    </div>
                `}
            </div >
    `;
    }

    renderViewer() {
        const { selectedPhoto, selectedIndex, photos } = this.state;
        if (!selectedPhoto) return '';

        const fileSize = Utils.formatBytes(selectedPhoto.file_size);
        const dimension = selectedPhoto.width ? `${selectedPhoto.width} × ${selectedPhoto.height} ` : '未知尺寸';

        return `
            <div class="photo-viewer-overlay">
                <div class="viewer-header">
                    <div class="viewer-info">
                        <span class="viewer-counter">${selectedIndex + 1} / ${photos.length}</span>
                        <span class="viewer-title">${Utils.escapeHtml(selectedPhoto.title || selectedPhoto.filename)}</span>
                    </div>
                    <button class="viewer-close-btn" data-action="close-viewer">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                
                <div class="viewer-content">
                    <button class="viewer-nav-btn prev" data-action="prev-photo">
                        <i class="ri-arrow-left-s-line"></i>
                    </button>
                    
                    <div class="viewer-image-container">
                        <img src="${Utils.escapeHtml(this.withToken(selectedPhoto.url))}" alt="" id="viewerImage">
                    </div>
                    
                    <button class="viewer-nav-btn next" data-action="next-photo">
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            </div>
    `;
    }

    // 模态框辅助函数
    showCreateAlbumModal() {
        Modal.form({
            title: '新建相册',
            confirmText: '创建相册',
            fields: [
                { name: 'name', label: '相册名称', required: true, placeholder: '例如：我的旅行', maxlength: 100 },
                { name: 'description', label: '描述', type: 'textarea', placeholder: '添加一段关于相册的描述...' }
            ],
            onSubmit: async (data) => {
                const res = await Api.post('/album/', data);
                if (res.code === 200 || res.code === 0) {
                    Toast.success('相册已成功创建');
                    // 清空搜索以便显示新创建的项
                    this.setState({ keyword: '' });
                    const searchInput = document.getElementById('albumSearchInput');
                    if (searchInput) searchInput.value = '';

                    try {
                        await this.loadAlbums();
                    } catch (e) {
                        console.error('刷新列表失败:', e);
                    }
                } else {
                    throw new Error(res.message || '创建失败');
                }
            }
        });
    }

    showEditAlbumModal(albumId) {
        const album = this.state.albums.find(a => a.id === albumId);
        if (!album) return;
        new Modal({
            title: '编辑相册',
            content: `
                <form id="albumForm">
                    <div class="form-group mb-3">
                        <label class="form-label">相册名称 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="name" value="${Utils.escapeHtml(album.name)}" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-control" name="description" rows="3">${Utils.escapeHtml(album.description || '')}</textarea>
                    </div>
                </form>
    `,
            confirmText: '保存修改',
            onConfirm: async () => {
                const form = document.getElementById('albumForm');
                if (!form.reportValidity()) return false;
                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };
                const res = await Api.put(`/album/${albumId}`, data);
                if (this.isApiSuccess(res)) {
                    Toast.success('修改已保存');
                    await this.loadAlbums();
                    return true;
                }
                return false;
            }
        }).show();
    }

    showEditPhotoModal(photoId) {
        const photo = this.state.photos.find(p => p.id === photoId);
        if (!photo) return;

        new Modal({
            title: '编辑照片',
            content: `
                <form id="photoForm">
                    <div class="form-group mb-3">
                        <label class="form-label">标题</label>
                        <input type="text" class="form-control" name="title" value="${Utils.escapeHtml(photo.title || '')}" maxlength="200" placeholder="为照片添加标题">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-control" name="description" rows="3" placeholder="添加照片描述...">${Utils.escapeHtml(photo.description || '')}</textarea>
                    </div>
                    <div class="form-group mt-3">
                        <div class="text-muted small">
                            <div><i class="ri-file-info-line"></i> ${Utils.escapeHtml(photo.filename)}</div>
                            <div><i class="ri-image-line"></i> ${photo.width || '?'} × ${photo.height || '?'} 像素</div>
                            <div><i class="ri-database-line"></i> ${Utils.formatBytes(photo.file_size)}</div>
                        </div>
                    </div>
                </form>
    `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('photoForm');
                const data = {
                    title: form.title.value.trim() || null,
                    description: form.description.value.trim() || null
                };
                try {
                    const res = await Api.put(`/album/photos/${photoId}`, data);
                    if (this.isApiSuccess(res)) {
                        Toast.success('照片信息已更新');
                        // 更新本地状态
                        const photos = this.state.photos.map(p =>
                            p.id === photoId ? { ...p, ...data } : p
                        );
                        this.setState({ photos });
                        return true;
                    }
                    return false;
                } catch (e) {
                    Toast.error('保存失败');
                    return false;
                }
            }
        }).show();
    }

    async handleBatchDownload() {
        const { selectedIds } = this.state;
        if (selectedIds.size === 0) return;

        try {
            const res = await Api.download('/album/photos/batch-download', {
                method: 'POST',
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });

            const url = window.URL.createObjectURL(res.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `photos_${selectedIds.size}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            Toast.success('所有文件已加入下载队列');
            this.toggleSelectionMode(); // 退出选择模式
        } catch (e) {
            console.error(e);
            Toast.error('下载发生错误');
        }
    }

    // ==================== 拖拽排序 ====================

    handleDragStart(e, el) {
        if (this.state.selectionMode) {
            e.preventDefault();
            return;
        }
        this.dragSourceEl = el;
        el.style.opacity = '0.4';

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.index);
    }

    handleDragOver(e, el) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e, el) {
        if (this.dragSourceEl !== el) {
            el.classList.add('drag-over-candidate');
        }
    }

    handleDragLeave(e, el) {
        el.classList.remove('drag-over-candidate');
    }

    async handleDrop(e, el) {
        if (e.stopPropagation) e.stopPropagation();

        if (this.dragSourceEl !== el) {
            const oldIndex = parseInt(this.dragSourceEl.dataset.index);
            const newIndex = parseInt(el.dataset.index);

            // 移动数组元素
            const photos = [...this.state.photos];
            const [moved] = photos.splice(oldIndex, 1);
            photos.splice(newIndex, 0, moved);

            // 乐观更新
            this.setState({ photos });

            // 发送给后端
            try {
                const ids = photos.map(p => p.id);
                // POST /album/{id}/reorder
                await Api.post(`/album/${this.state.currentAlbum.id}/reorder`, { ids });
            } catch (err) {
                console.error('排序失败', err);
                // 失败可考虑回滚，这里从简暂不处理
                Toast.error('排序同步失败');
            }
        }
        return false;
    }

    handleDragEnd(e, el) {
        el.style.opacity = '1';
        this.container.querySelectorAll('.photo-item').forEach(item => {
            item.classList.remove('drag-over-candidate');
        });
        this.dragSourceEl = null;
    }
}

/**
 * 相册页面组件
 * 
 * 功能：相册管理、照片上传和预览
 * 依赖：api.js, store.js, router.js, component.js, modal.js, toast.js
 */

class AlbumPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            view: 'albums',  // albums | photos | viewer
            albums: [],
            photos: [],
            currentAlbum: null,
            selectedPhoto: null,
            selectedIndex: 0,
            loading: false,
            uploading: false,
            uploadProgress: 0
        };
    }

    async afterMount() {
        this.bindEvents();
        await this.loadAlbums();
    }

    bindEvents() {
        if (!this.container) return;

        // 创建相册
        this.delegate('click', '[data-action="create-album"]', () => this.showCreateAlbumModal());

        // 打开相册
        this.delegate('click', '.album-card', (e, el) => {
            const albumId = el.dataset.albumId;
            if (albumId) this.openAlbum(parseInt(albumId));
        });

        // 编辑相册
        this.delegate('click', '[data-action="edit-album"]', (e, el) => {
            e.stopPropagation();
            const albumId = el.dataset.albumId;
            if (albumId) this.showEditAlbumModal(parseInt(albumId));
        });

        // 删除相册
        this.delegate('click', '[data-action="delete-album"]', async (e, el) => {
            e.stopPropagation();
            const albumId = el.dataset.albumId;
            if (albumId) await this.deleteAlbum(parseInt(albumId));
        });

        // 返回相册列表
        this.delegate('click', '[data-action="back-to-albums"]', () => this.backToAlbums());

        // 上传照片
        this.delegate('click', '[data-action="upload-photos"]', () => this.triggerUpload());
        this.delegate('change', '#photoUploadInput', (e) => this.handleFileSelect(e));

        // 查看照片
        this.delegate('click', '.photo-item', (e, el) => {
            const index = parseInt(el.dataset.index);
            this.openViewer(index);
        });

        // 关闭查看器
        this.delegate('click', '.photo-viewer-overlay', (e) => {
            if (e.target.classList.contains('photo-viewer-overlay')) {
                this.closeViewer();
            }
        });
        this.delegate('click', '[data-action="close-viewer"]', () => this.closeViewer());

        // 上一张/下一张
        this.delegate('click', '[data-action="prev-photo"]', () => this.prevPhoto());
        this.delegate('click', '[data-action="next-photo"]', () => this.nextPhoto());

        // 删除照片
        this.delegate('click', '[data-action="delete-photo"]', async (e, el) => {
            e.stopPropagation();
            const photoId = el.dataset.photoId;
            if (photoId) await this.deletePhoto(parseInt(photoId));
        });

        // 键盘事件
        this._keyHandler = (e) => {
            if (this.state.view === 'viewer') {
                if (e.key === 'Escape') this.closeViewer();
                if (e.key === 'ArrowLeft') this.prevPhoto();
                if (e.key === 'ArrowRight') this.nextPhoto();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    destroy() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
        }
        super.destroy();
    }

    // ==================== 数据加载 ====================

    async loadAlbums() {
        this.setState({ loading: true });
        try {
            const res = await Api.get('/album/');
            if (res.code === 0) {
                this.setState({ albums: res.data.items || [] });
            }
        } catch (e) {
            Toast.error('加载相册失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    async loadAlbumDetail(albumId) {
        this.setState({ loading: true });
        try {
            const res = await Api.get(`/album/${albumId}`);
            if (res.code === 0) {
                this.setState({
                    currentAlbum: res.data,
                    photos: res.data.photos || [],
                    view: 'photos'
                });
            }
        } catch (e) {
            Toast.error('加载相册详情失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    // ==================== 相册操作 ====================

    showCreateAlbumModal() {
        new Modal({
            title: '创建相册',
            content: `
                <form id="albumForm">
                    <div class="form-group">
                        <label>相册名称 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" placeholder="输入相册名称" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-control" name="description" rows="3" placeholder="简单描述一下这个相册"></textarea>
                    </div>
                </form>
            `,
            confirmText: '创建',
            onConfirm: async () => {
                const form = document.getElementById('albumForm');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };

                try {
                    const res = await Api.post('/album/', data);
                    if (res.code === 0) {
                        Toast.success('相册创建成功');
                        await this.loadAlbums();
                        return true;
                    }
                } catch (e) {
                    Toast.error('创建失败');
                }
                return false;
            }
        }).show();
    }

    async showEditAlbumModal(albumId) {
        const album = this.state.albums.find(a => a.id === albumId);
        if (!album) return;

        new Modal({
            title: '编辑相册',
            content: `
                <form id="albumForm">
                    <div class="form-group">
                        <label>相册名称 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" value="${Utils.escapeHtml(album.name)}" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-control" name="description" rows="3">${Utils.escapeHtml(album.description || '')}</textarea>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('albumForm');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };

                try {
                    const res = await Api.put(`/album/${albumId}`, data);
                    if (res.code === 0) {
                        Toast.success('保存成功');
                        await this.loadAlbums();
                        return true;
                    }
                } catch (e) {
                    Toast.error('保存失败');
                }
                return false;
            }
        }).show();
    }

    async deleteAlbum(albumId) {
        const confirmed = await Modal.confirm('删除相册', '确定要删除这个相册吗？相册中的所有照片也将被删除，此操作不可恢复。');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/album/${albumId}`);
            if (res.code === 0) {
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

    // ==================== 照片操作 ====================

    triggerUpload() {
        const input = this.container.querySelector('#photoUploadInput');
        if (input) input.click();
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const { currentAlbum } = this.state;
        if (!currentAlbum) return;

        this.setState({ uploading: true, uploadProgress: 0 });

        let uploaded = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                await Api.upload(`/album/${currentAlbum.id}/photos`, formData);
                uploaded++;
                this.setState({ uploadProgress: Math.round((uploaded / files.length) * 100) });
            } catch (err) {
                console.error('上传失败:', file.name, err);
            }
        }

        Toast.success(`成功上传 ${uploaded} 张照片`);
        this.setState({ uploading: false, uploadProgress: 0 });

        // 刷新照片列表
        await this.loadAlbumDetail(currentAlbum.id);

        // 清空文件选择
        e.target.value = '';
    }

    async deletePhoto(photoId) {
        const confirmed = await Modal.confirm('删除照片', '确定要删除这张照片吗？');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/album/photos/${photoId}`);
            if (res.code === 0) {
                Toast.success('照片已删除');
                // 刷新
                if (this.state.currentAlbum) {
                    await this.loadAlbumDetail(this.state.currentAlbum.id);
                }
            }
        } catch (e) {
            Toast.error('删除失败');
        }
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
    }

    // ==================== 渲染 ====================

    render() {
        const { view, loading } = this.state;

        if (loading && view === 'albums') {
            return '<div class="loading-full"><div class="loading-spinner"></div></div>';
        }

        return `
            <div class="album-page fade-in">
                ${view === 'albums' ? this.renderAlbumList() : ''}
                ${view === 'photos' ? this.renderPhotoGrid() : ''}
                ${view === 'viewer' ? this.renderViewer() : ''}
            </div>
        `;
    }

    renderAlbumList() {
        const { albums } = this.state;

        return `
            <div class="album-list-view">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">我的相册</h1>
                        <p class="page-subtitle">管理和浏览您的照片集</p>
                    </div>
                    <button class="btn btn-primary" data-action="create-album">
                        <i class="ri-add-line"></i> 创建相册
                    </button>
                </div>

                <div class="album-grid">
                    ${albums.length === 0 ? `
                        <div class="empty-state">
                            <i class="ri-image-line"></i>
                            <p>还没有相册</p>
                            <p class="text-secondary">点击"创建相册"开始整理您的照片</p>
                        </div>
                    ` : albums.map(album => `
                        <div class="album-card" data-album-id="${album.id}">
                            <div class="album-cover">
                                ${album.cover_url
                ? `<img src="${album.cover_url}" alt="${Utils.escapeHtml(album.name)}">`
                : `<div class="album-cover-placeholder"><i class="ri-image-line"></i></div>`
            }
                                <div class="album-overlay">
                                    <button class="album-action-btn" data-action="edit-album" data-album-id="${album.id}" title="编辑">
                                        <i class="ri-edit-line"></i>
                                    </button>
                                    <button class="album-action-btn danger" data-action="delete-album" data-album-id="${album.id}" title="删除">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="album-info">
                                <div class="album-name">${Utils.escapeHtml(album.name)}</div>
                                <div class="album-meta">${album.photo_count || 0} 张照片</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderPhotoGrid() {
        const { currentAlbum, photos, uploading, uploadProgress, loading } = this.state;

        return `
            <div class="photo-grid-view">
                <div class="page-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back-to-albums">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title">${Utils.escapeHtml(currentAlbum?.name || '')}</h1>
                            <p class="page-subtitle">${photos.length} 张照片</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <input type="file" id="photoUploadInput" multiple accept="image/*" style="display:none;">
                        <button class="btn btn-primary" data-action="upload-photos" ${uploading ? 'disabled' : ''}>
                            ${uploading
                ? `<i class="ri-loader-4-line spin"></i> 上传中 ${uploadProgress}%`
                : `<i class="ri-upload-2-line"></i> 上传照片`
            }
                        </button>
                    </div>
                </div>

                ${loading ? '<div class="loading">加载中...</div>' : `
                    <div class="photo-grid">
                        ${photos.length === 0 ? `
                            <div class="empty-state">
                                <i class="ri-image-add-line"></i>
                                <p>相册还是空的</p>
                                <p class="text-secondary">点击"上传照片"添加您的照片</p>
                            </div>
                        ` : photos.map((photo, index) => `
                            <div class="photo-item" data-index="${index}">
                                <img src="${photo.thumbnail_url}" alt="${Utils.escapeHtml(photo.title || photo.filename)}" loading="lazy">
                                <div class="photo-overlay">
                                    <button class="photo-action-btn danger" data-action="delete-photo" data-photo-id="${photo.id}" title="删除">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    renderViewer() {
        const { selectedPhoto, selectedIndex, photos } = this.state;
        if (!selectedPhoto) return '';

        return `
            <div class="photo-viewer-overlay">
                <div class="viewer-header">
                    <div class="viewer-info">
                        <span>${selectedIndex + 1} / ${photos.length}</span>
                        ${selectedPhoto.title ? `<span class="viewer-title">${Utils.escapeHtml(selectedPhoto.title)}</span>` : ''}
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
                        <img src="${selectedPhoto.url}" alt="">
                    </div>
                    
                    <button class="viewer-nav-btn next" data-action="next-photo">
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            </div>
        `;
    }
}

/**
 * 视频页面组件
 * 
 * 功能：视频集管理、视频上传和播放
 * 依赖：api.js, store.js, router.js, component.js, modal.js, toast.js
 */

class VideoPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            view: 'collections',  // collections | videos | player
            collections: [],
            videos: [],
            currentCollection: null,
            selectedVideo: null,
            selectedIndex: 0,
            loading: false,
            uploading: false,
            uploadProgress: 0
        };
    }

    async afterMount() {
        this.bindEvents();
        await this.loadCollections();
    }

    bindEvents() {
        if (!this.container) return;

        // 创建视频集
        this.delegate('click', '[data-action="create-collection"]', () => this.showCreateCollectionModal());

        // 打开视频集
        this.delegate('click', '.collection-card', (e, el) => {
            const collectionId = el.dataset.collectionId;
            if (collectionId) this.openCollection(parseInt(collectionId));
        });

        // 编辑视频集
        this.delegate('click', '[data-action="edit-collection"]', (e, el) => {
            e.stopPropagation();
            const collectionId = el.dataset.collectionId;
            if (collectionId) this.showEditCollectionModal(parseInt(collectionId));
        });

        // 删除视频集
        this.delegate('click', '[data-action="delete-collection"]', async (e, el) => {
            e.stopPropagation();
            const collectionId = el.dataset.collectionId;
            if (collectionId) await this.deleteCollection(parseInt(collectionId));
        });

        // 返回视频集列表
        this.delegate('click', '[data-action="back-to-collections"]', () => this.backToCollections());

        // 上传视频
        this.delegate('click', '[data-action="upload-videos"]', () => this.triggerUpload());
        this.delegate('change', '#videoUploadInput', (e) => this.handleFileSelect(e));

        // 播放视频
        this.delegate('click', '.video-item', (e, el) => {
            const index = parseInt(el.dataset.index);
            this.openPlayer(index);
        });

        // 关闭播放器
        this.delegate('click', '.video-player-overlay', (e) => {
            if (e.target.classList.contains('video-player-overlay')) {
                this.closePlayer();
            }
        });
        this.delegate('click', '[data-action="close-player"]', () => this.closePlayer());

        // 上一个/下一个
        this.delegate('click', '[data-action="prev-video"]', () => this.prevVideo());
        this.delegate('click', '[data-action="next-video"]', () => this.nextVideo());

        // 删除视频
        this.delegate('click', '[data-action="delete-video"]', async (e, el) => {
            e.stopPropagation();
            const videoId = el.dataset.videoId;
            if (videoId) await this.deleteVideo(parseInt(videoId));
        });

        // 键盘事件
        this._keyHandler = (e) => {
            if (this.state.view === 'player') {
                if (e.key === 'Escape') this.closePlayer();
                if (e.key === 'ArrowLeft') this.prevVideo();
                if (e.key === 'ArrowRight') this.nextVideo();
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

    async loadCollections() {
        this.setState({ loading: true });
        try {
            const res = await Api.get('/video/');
            if (res.code === 0) {
                this.setState({ collections: res.data.items || [] });
            }
        } catch (e) {
            Toast.error('加载视频集失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    async loadCollectionDetail(collectionId) {
        this.setState({ loading: true });
        try {
            const res = await Api.get(`/video/${collectionId}`);
            if (res.code === 0) {
                this.setState({
                    currentCollection: res.data,
                    videos: res.data.videos || [],
                    view: 'videos'
                });
            }
        } catch (e) {
            Toast.error('加载视频集详情失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    // ==================== 视频集操作 ====================

    showCreateCollectionModal() {
        new Modal({
            title: '创建视频集',
            content: `
                <form id="collectionForm">
                    <div class="form-group">
                        <label>视频集名称 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" placeholder="输入视频集名称" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-control" name="description" rows="3" placeholder="简单描述一下这个视频集"></textarea>
                    </div>
                </form>
            `,
            confirmText: '创建',
            onConfirm: async () => {
                const form = document.getElementById('collectionForm');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };

                try {
                    const res = await Api.post('/video/', data);
                    if (res.code === 0) {
                        Toast.success('视频集创建成功');
                        await this.loadCollections();
                        return true;
                    }
                } catch (e) {
                    Toast.error('创建失败');
                }
                return false;
            }
        }).show();
    }

    async showEditCollectionModal(collectionId) {
        const collection = this.state.collections.find(c => c.id === collectionId);
        if (!collection) return;

        new Modal({
            title: '编辑视频集',
            content: `
                <form id="collectionForm">
                    <div class="form-group">
                        <label>视频集名称 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" value="${Utils.escapeHtml(collection.name)}" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-control" name="description" rows="3">${Utils.escapeHtml(collection.description || '')}</textarea>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('collectionForm');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };

                try {
                    const res = await Api.put(`/video/${collectionId}`, data);
                    if (res.code === 0) {
                        Toast.success('保存成功');
                        await this.loadCollections();
                        return true;
                    }
                } catch (e) {
                    Toast.error('保存失败');
                }
                return false;
            }
        }).show();
    }

    async deleteCollection(collectionId) {
        const confirmed = await Modal.confirm('删除视频集', '确定要删除这个视频集吗？视频集中的所有视频也将被删除，此操作不可恢复。');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/video/${collectionId}`);
            if (res.code === 0) {
                Toast.success('视频集已删除');
                await this.loadCollections();
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    openCollection(collectionId) {
        this.loadCollectionDetail(collectionId);
    }

    backToCollections() {
        this.setState({ view: 'collections', currentCollection: null, videos: [] });
    }

    // ==================== 视频操作 ====================

    triggerUpload() {
        const input = this.container.querySelector('#videoUploadInput');
        if (input) input.click();
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const { currentCollection } = this.state;
        if (!currentCollection) return;

        this.setState({ uploading: true, uploadProgress: 0 });

        let uploaded = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                await Api.upload(`/video/${currentCollection.id}/videos`, formData);
                uploaded++;
                this.setState({ uploadProgress: Math.round((uploaded / files.length) * 100) });
            } catch (err) {
                console.error('上传失败:', file.name, err);
            }
        }

        Toast.success(`成功上传 ${uploaded} 个视频`);
        this.setState({ uploading: false, uploadProgress: 0 });

        // 刷新视频列表
        await this.loadCollectionDetail(currentCollection.id);

        // 清空文件选择
        e.target.value = '';
    }

    async deleteVideo(videoId) {
        const confirmed = await Modal.confirm('删除视频', '确定要删除这个视频吗？');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/video/videos/${videoId}`);
            if (res.code === 0) {
                Toast.success('视频已删除');
                // 刷新
                if (this.state.currentCollection) {
                    await this.loadCollectionDetail(this.state.currentCollection.id);
                }
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    // ==================== 播放器 ====================

    openPlayer(index) {
        const { videos } = this.state;
        if (index < 0 || index >= videos.length) return;

        this.setState({
            view: 'player',
            selectedVideo: videos[index],
            selectedIndex: index
        });
    }

    closePlayer() {
        this.setState({ view: 'videos', selectedVideo: null });
    }

    prevVideo() {
        const { videos, selectedIndex } = this.state;
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : videos.length - 1;
        this.setState({
            selectedIndex: newIndex,
            selectedVideo: videos[newIndex]
        });
    }

    nextVideo() {
        const { videos, selectedIndex } = this.state;
        const newIndex = selectedIndex < videos.length - 1 ? selectedIndex + 1 : 0;
        this.setState({
            selectedIndex: newIndex,
            selectedVideo: videos[newIndex]
        });
    }

    // ==================== 工具方法 ====================

    formatFileSize(bytes) {
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    // ==================== 渲染 ====================

    render() {
        const { view, loading } = this.state;

        if (loading && view === 'collections') {
            return '<div class="loading-full"><div class="loading-spinner"></div></div>';
        }

        return `
            <div class="video-page fade-in">
                ${view === 'collections' ? this.renderCollectionList() : ''}
                ${view === 'videos' ? this.renderVideoGrid() : ''}
                ${view === 'player' ? this.renderPlayer() : ''}
            </div>
        `;
    }

    renderCollectionList() {
        const { collections } = this.state;

        return `
            <div class="collection-list-view">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">我的视频</h1>
                        <p class="page-subtitle">管理和浏览您的视频集</p>
                    </div>
                    <button class="btn btn-primary" data-action="create-collection">
                        <i class="ri-add-line"></i> 创建视频集
                    </button>
                </div>

                <div class="collection-grid">
                    ${collections.length === 0 ? `
                        <div class="empty-state">
                            <i class="ri-video-line"></i>
                            <p>还没有视频集</p>
                            <p class="text-secondary">点击"创建视频集"开始整理您的视频</p>
                        </div>
                    ` : collections.map(collection => `
                        <div class="collection-card" data-collection-id="${collection.id}">
                            <div class="collection-cover">
                                ${collection.cover_url
                ? `<img src="${collection.cover_url}" alt="${Utils.escapeHtml(collection.name)}">`
                : `<div class="collection-cover-placeholder"><i class="ri-film-line"></i></div>`
            }
                                <div class="collection-overlay">
                                    <button class="collection-action-btn" data-action="edit-collection" data-collection-id="${collection.id}" title="编辑">
                                        <i class="ri-edit-line"></i>
                                    </button>
                                    <button class="collection-action-btn danger" data-action="delete-collection" data-collection-id="${collection.id}" title="删除">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="collection-info">
                                <div class="collection-name">${Utils.escapeHtml(collection.name)}</div>
                                <div class="collection-meta">${collection.video_count || 0} 个视频</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderVideoGrid() {
        const { currentCollection, videos, uploading, uploadProgress, loading } = this.state;

        return `
            <div class="video-grid-view">
                <div class="page-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back-to-collections">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                        <div>
                            <h1 class="page-title">${Utils.escapeHtml(currentCollection?.name || '')}</h1>
                            <p class="page-subtitle">${videos.length} 个视频</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <input type="file" id="videoUploadInput" multiple accept="video/*" style="display:none;">
                        <button class="btn btn-primary" data-action="upload-videos" ${uploading ? 'disabled' : ''}>
                            ${uploading
                ? `<i class="ri-loader-4-line spin"></i> 上传中 ${uploadProgress}%`
                : `<i class="ri-upload-2-line"></i> 上传视频`
            }
                        </button>
                    </div>
                </div>

                ${loading ? '<div class="loading">加载中...</div>' : `
                    <div class="video-grid">
                        ${videos.length === 0 ? `
                            <div class="empty-state">
                                <i class="ri-video-add-line"></i>
                                <p>视频集还是空的</p>
                                <p class="text-secondary">点击"上传视频"添加您的视频</p>
                            </div>
                        ` : videos.map((video, index) => `
                            <div class="video-item" data-index="${index}">
                                <div class="video-thumbnail">
                                    ${video.thumbnail_url
                    ? `<img src="${video.thumbnail_url}" alt="${Utils.escapeHtml(video.title || video.filename)}" loading="lazy">`
                    : `<div class="video-thumbnail-placeholder"><i class="ri-play-circle-line"></i></div>`
                }
                                    <div class="video-duration">${video.duration_formatted || ''}</div>
                                    <div class="video-play-icon"><i class="ri-play-fill"></i></div>
                                </div>
                                <div class="video-info">
                                    <div class="video-title">${Utils.escapeHtml(video.title || video.filename)}</div>
                                    <div class="video-meta">${this.formatFileSize(video.file_size)}</div>
                                </div>
                                <div class="video-overlay">
                                    <button class="video-action-btn danger" data-action="delete-video" data-video-id="${video.id}" title="删除">
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

    renderPlayer() {
        const { selectedVideo, selectedIndex, videos } = this.state;
        if (!selectedVideo) return '';

        return `
            <div class="video-player-overlay">
                <div class="player-header">
                    <div class="player-info">
                        <span>${selectedIndex + 1} / ${videos.length}</span>
                        ${selectedVideo.title ? `<span class="player-title">${Utils.escapeHtml(selectedVideo.title)}</span>` : ''}
                    </div>
                    <button class="player-close-btn" data-action="close-player">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                
                <div class="player-content">
                    <button class="player-nav-btn prev" data-action="prev-video">
                        <i class="ri-arrow-left-s-line"></i>
                    </button>
                    
                    <div class="player-video-container">
                        <video 
                            src="${selectedVideo.url}" 
                            controls 
                            autoplay
                            class="player-video"
                        ></video>
                    </div>
                    
                    <button class="player-nav-btn next" data-action="next-video">
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            </div>
        `;
    }
}

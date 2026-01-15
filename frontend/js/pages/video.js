/**
 * 视频页面组件
 * 
 * 功能：视频集管理、视频上传和播放、批量操作、封面设置、倍速控制
 * 优化：旗舰级视觉效果、沉浸式播放器、预加载、拖拽上传
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
            uploadProgress: 0,
            playbackSpeed: 1.0,
            selectedIds: new Set(),
            selectionMode: false,
            keyword: ''
        };
    }

    async afterMount() {
        this.bindEvents();
        await this.loadCollections();

        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
        // 每次更新后绑定图片错误处理
        this.bindImageErrorHandlers();

        // 绑定播放器错误处理
        const videoPlayer = this.container.querySelector('#videoPlayer');
        if (videoPlayer && !videoPlayer._errorBound) {
            videoPlayer._errorBound = true;
            videoPlayer.addEventListener('error', (e) => {
                const error = videoPlayer.error;
                console.error('视频播放错误:', error);
                let msg = '视频播放出错';
                if (error) {
                    switch (error.code) {
                        case 1: msg = '视频加载被中止'; break;
                        case 2: msg = '网络错误导致视频加载失败'; break;
                        case 3: msg = '视频解码失败'; break;
                        case 4: msg = '不支持的视频格式或源不可用'; break;
                    }
                }
                Toast.error(msg);
            });
        }
    }

    bindEvents() {
        if (!this.container) return;

        // --- 视频集列表事件 ---
        this.delegate('click', '[data-action="create-collection"]', () => this.showCreateCollectionModal());

        // 帮助按钮
        if (window.ModuleHelp) {
            this.delegate('click', '[data-action="show-help"]', () => {
                ModuleHelp.show('video', '视频库');
            });
        }

        // 搜索视频集
        this.delegate('input', '#videoSearchInput', (e) => {
            this.setState({ keyword: e.target.value });
        });
        this.delegate('keydown', '#videoSearchInput', (e) => {
            if (e.key === 'Enter') this.loadCollections();
        });
        this.delegate('click', '[data-action="search-video"]', () => this.loadCollections());

        this.delegate('click', '.collection-card', (e, el) => {
            // 如果点击的是操作按钮，不触发打开视频集
            if (e.target.closest('[data-action="edit-collection"]') || e.target.closest('[data-action="delete-collection"]')) {
                return;
            }
            const collectionId = el.dataset.collectionId;
            if (collectionId) this.openCollection(parseInt(collectionId));
        });
        this.delegate('click', '[data-action="edit-collection"]', (e, el) => {
            e.stopPropagation();
            const collectionId = el.dataset.collectionId;
            if (collectionId) this.showEditCollectionModal(parseInt(collectionId));
        });
        this.delegate('click', '[data-action="delete-collection"]', async (e, el) => {
            e.stopPropagation();
            const collectionId = el.dataset.collectionId;
            if (collectionId) await this.deleteCollection(parseInt(collectionId));
        });

        // --- 视频网格事件 ---
        this.delegate('click', '[data-action="back-to-collections"]', () => this.backToCollections());
        this.delegate('click', '[data-action="upload-videos"]', () => this.triggerUpload());
        this.delegate('change', '#videoUploadInput', (e) => this.handleFileSelect(e));

        // 拖拽上传支持
        this.delegate('dragover', '.video-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.video-grid-view').classList.add('drag-over');
        });
        this.delegate('dragleave', '.video-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.video-grid-view').classList.remove('drag-over');
        });
        this.delegate('drop', '.video-grid-view', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.querySelector('.video-grid-view').classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleUploadFiles(Array.from(files));
        });

        // 多选逻辑
        this.delegate('click', '[data-action="toggle-selection"]', () => this.toggleSelectionMode());
        this.delegate('click', '[data-action="batch-delete"]', () => this.handleBatchDelete());
        this.delegate('click', '[data-action="select-all"]', () => this.selectAllVideos());

        // 视频点击
        this.delegate('click', '.video-item', (e, el) => {
            // 如果点击的是操作按钮，不触发播放
            if (e.target.closest('.video-action-btn')) {
                return;
            }

            const index = parseInt(el.dataset.index);
            const videoId = parseInt(el.dataset.videoId);

            if (this.state.selectionMode) {
                this.toggleVideoSelection(videoId);
            } else {
                this.openPlayer(index);
            }
        });

        // 设为封面
        this.delegate('click', '[data-action="set-cover"]', async (e, el) => {
            e.stopPropagation();
            const videoId = el.dataset.videoId;
            if (videoId) await this.setCollectionCover(parseInt(videoId));
        });

        // 编辑视频
        this.delegate('click', '[data-action="edit-video"]', async (e, el) => {
            e.stopPropagation();
            const videoId = el.dataset.videoId;
            if (videoId) this.showEditVideoModal(parseInt(videoId));
        });

        // 删除单个视频
        this.delegate('click', '[data-action="delete-video"]', async (e, el) => {
            e.stopPropagation();
            const videoId = el.dataset.videoId;
            if (videoId) await this.deleteVideo(parseInt(videoId));
        });

        // --- 播放器事件 ---
        this.delegate('click', '.video-player-overlay', (e) => {
            if (e.target.classList.contains('video-player-overlay') || e.target.classList.contains('player-content')) {
                this.closePlayer();
            }
        });
        this.delegate('click', '[data-action="close-player"]', () => this.closePlayer());
        this.delegate('click', '[data-action="prev-video"]', () => this.prevVideo());
        this.delegate('click', '[data-action="next-video"]', () => this.nextVideo());

        // 倍速切换
        this.delegate('click', '.speed-badge', (e, el) => {
            const speed = parseFloat(el.dataset.speed);
            this.setPlaybackSpeed(speed);
        });

        // 键盘快捷键
        this._keyHandler = (e) => {
            if (this.state.view === 'player') {
                if (e.key === 'Escape') this.closePlayer();
                if (e.key === 'ArrowLeft') this.prevVideo();
                if (e.key === 'ArrowRight') this.nextVideo();
                if (e.key === ' ') {
                    e.preventDefault();
                    const video = this.container.querySelector('video');
                    if (video) video.paused ? video.play() : video.pause();
                }
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

    /**
     * 为视频/缩略图 URL 附加 token 参数以支持认证
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
    handleImageError(img, type = 'video') {
        if (!img) return;
        const placeholder = type === 'collection'
            ? '<i class="ri-film-line"></i>'
            : '<i class="ri-clapperboard-line"></i>';
        const wrapper = document.createElement('div');
        wrapper.className = type === 'collection' ? 'collection-cover-placeholder' : 'video-thumbnail-placeholder';
        wrapper.innerHTML = placeholder;
        img.parentNode.replaceChild(wrapper, img);
    }

    /**
     * 绑定图片错误处理事件
     */
    bindImageErrorHandlers() {
        const images = this.container.querySelectorAll('img[data-fallback]');
        images.forEach(img => {
            if (!img._errorBound) {
                img._errorBound = true;
                img.onerror = () => this.handleImageError(img, img.dataset.fallback);
            }
        });
    }

    // ==================== 数据加载 ====================

    async loadCollections() {
        this.setState({ loading: true });
        try {
            const { keyword } = this.state;
            // 手动构建查询参数
            const params = [];
            if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);

            const url = `/video/${params.length > 0 ? '?' + params.join('&') : ''}`;
            const res = await Api.get(url);

            if (this.isApiSuccess(res) && res.data && Array.isArray(res.data.items)) {
                this.setState({ collections: res.data.items });
            } else {
                this.setState({ collections: [] });
            }
        } catch (e) {
            console.error('加载视频集异常:', e);
            Toast.error('加载视频集失败: ' + (e.message || '未知错误'));
        } finally {
            this.setState({ loading: false });
        }
    }

    async loadCollectionDetail(collectionId) {
        this.setState({ loading: true });
        try {
            const res = await Api.get(`/video/${collectionId}`);
            if (this.isApiSuccess(res)) {
                this.setState({
                    currentCollection: res.data,
                    videos: res.data.videos || [],
                    view: 'videos',
                    selectedIds: new Set(),
                    selectionMode: false
                });
            }
        } catch (e) {
            Toast.error('加载视频集详情失败');
        } finally {
            this.setState({ loading: false });
        }
    }

    // ==================== 视频集/视频操作 ====================

    async setCollectionCover(videoId) {
        const { currentCollection } = this.state;
        if (!currentCollection) return;

        try {
            const res = await Api.put(`/video/${currentCollection.id}`, { cover_video_id: videoId });
            if (res.code === 200 || res.code === 0) {
                Toast.success('已设为视频集封面');
                this.setState({
                    currentCollection: { ...currentCollection, cover_video_id: videoId }
                });
            }
        } catch (e) {
            Toast.error('设置封面失败');
        }
    }

    triggerUpload() {
        const input = this.container.querySelector('#videoUploadInput');
        if (input) input.click();
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) await this.handleUploadFiles(files);
        e.target.value = '';
    }

    async handleUploadFiles(files) {
        const { currentCollection } = this.state;
        if (!currentCollection) return;

        // 过滤视频文件
        const videoFiles = files.filter(f => f.type.startsWith('video/'));
        if (videoFiles.length === 0) {
            Toast.info('请选择视频文件上传');
            return;
        }

        // 检查文件大小 (1GB)
        const MAX_SIZE = 1024 * 1024 * 1024;
        const oversizedFiles = videoFiles.filter(f => f.size > MAX_SIZE);
        if (oversizedFiles.length > 0) {
            Toast.error(`部分文件超过 1GB 限制：\n${oversizedFiles.map(f => f.name).slice(0, 3).join('\n')}${oversizedFiles.length > 3 ? '...' : ''}`);
            return;
        }

        this.setState({ uploading: true, uploadProgress: 0 });

        let uploadedCount = 0;
        const total = videoFiles.length;
        const CONCURRENT_LIMIT = 2; // 视频并发限制较小，避免带宽拥堵

        // 辅助函数：单个上传
        const uploadFile = async (file) => {
            try {
                const formData = new FormData();
                formData.append('file', file);
                await Api.upload(`/video/${currentCollection.id}/videos`, formData);
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

        for (const file of videoFiles) {
            const p = uploadFile(file);
            results.push(p);

            if (CONCURRENT_LIMIT <= videoFiles.length) {
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
            Toast.success(`成功上传 ${successCount} 个视频`);
            await this.loadCollectionDetail(currentCollection.id);
        } else {
            Toast.error('视频上传失败');
        }
        this.setState({ uploading: false, uploadProgress: 0 });
    }

    toggleSelectionMode() {
        this.setState({
            selectionMode: !this.state.selectionMode,
            selectedIds: new Set()
        });
    }

    toggleVideoSelection(videoId) {
        const selectedIds = new Set(this.state.selectedIds);
        if (selectedIds.has(videoId)) {
            selectedIds.delete(videoId);
        } else {
            selectedIds.add(videoId);
        }
        this.setState({ selectedIds });
    }

    selectAllVideos() {
        const { videos, selectedIds } = this.state;
        if (selectedIds.size === videos.length) {
            this.setState({ selectedIds: new Set() });
        } else {
            const allIds = new Set(videos.map(v => v.id));
            this.setState({ selectedIds: allIds });
        }
    }

    async handleBatchDelete() {
        const { selectedIds, currentCollection } = this.state;
        if (selectedIds.size === 0) return;

        const confirmed = await Modal.confirm('批量删除', `确定要删除选中的 ${selectedIds.size} 个视频吗？此操作无法撤销。`);
        if (!confirmed) return;

        try {
            const res = await Api.post('/video/videos/batch-delete', { ids: Array.from(selectedIds) });
            if (res.code === 200 || res.code === 0) {
                Toast.success(res.message || '视频已删除');
                await this.loadCollectionDetail(currentCollection.id);
            }
        } catch (e) {
            Toast.error('批量删除失败');
        }
    }

    async deleteCollection(collectionId) {
        const confirmed = await Modal.confirm('删除视频集', '确定要删除此视频集吗？其中包含的所有视频将被同步永久删除。');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/video/${collectionId}`);
            if (res.code === 200 || res.code === 0) {
                Toast.success('视频集已删除');
                await this.loadCollections();
            }
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    async deleteVideo(videoId) {
        const confirmed = await Modal.confirm('删除视频', '确定要永久删除此视频吗？此操作无法撤销。');
        if (!confirmed) return;

        try {
            const res = await Api.delete(`/video/videos/${videoId}`);
            if (res.code === 200 || res.code === 0) {
                Toast.success('视频已删除');
                // 刷新详情
                if (this.state.currentCollection) {
                    await this.loadCollectionDetail(this.state.currentCollection.id);
                }
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

    // ==================== 播放器逻辑 ====================

    openPlayer(index) {
        const { videos } = this.state;
        if (index < 0 || index >= videos.length) return;

        this.setState({
            view: 'player',
            selectedVideo: videos[index],
            selectedIndex: index
        });

        // 预载设置
        setTimeout(() => this.applyPlaybackSpeed(), 100);
    }

    closePlayer() {
        // 先暂停视频再关闭，防止后台播放（某些浏览器）
        const videoEl = this.container.querySelector('video');
        if (videoEl) videoEl.pause();
        this.setState({ view: 'videos', selectedVideo: null });
    }

    prevVideo() {
        const { videos, selectedIndex } = this.state;
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : videos.length - 1;
        this.setState({
            selectedIndex: newIndex,
            selectedVideo: videos[newIndex]
        }, () => this.applyPlaybackSpeed());
    }

    nextVideo() {
        const { videos, selectedIndex } = this.state;
        const newIndex = selectedIndex < videos.length - 1 ? selectedIndex + 1 : 0;
        this.setState({
            selectedIndex: newIndex,
            selectedVideo: videos[newIndex]
        }, () => this.applyPlaybackSpeed());
    }

    setPlaybackSpeed(speed) {
        this.setState({ playbackSpeed: speed }, () => this.applyPlaybackSpeed());
    }

    applyPlaybackSpeed() {
        const videoEl = this.container.querySelector('video');
        if (videoEl) {
            videoEl.playbackRate = this.state.playbackSpeed;
        }
    }

    // ==================== 渲染函数 ====================

    render() {
        try {
            const { view, loading, uploading, uploadProgress } = this.state;

            return `
                <div class="video-page fade-in">
                    ${view === 'collections' ? this.renderCollectionList() : ''}
                    ${view === 'videos' ? this.renderVideoGrid() : ''}
                    ${view === 'player' ? this.renderPlayer() : ''}
                    
                    ${uploading ? `
                        <div class="upload-progress-container">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold">正在上传视频...</span>
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

    renderCollectionList() {
        const { collections, loading, keyword } = this.state;

        if (loading && collections.length === 0) {
            return '<div class="loading-full"><div class="loading-spinner"></div></div>';
        }

        return `
            <div class="collection-list-view">
                <div class="page-header">
                    <div class="header-left">
                        <h1 class="page-title">我的视频</h1>
                    </div>
                    <div class="header-right d-flex align-items-center gap-3">
                        <div class="input-group search-box" style="width: 240px;">
                            <input type="text" id="videoSearchInput" class="form-control" placeholder="搜索视频集..." value="${Utils.escapeHtml(keyword)}">
                            <button class="btn btn-outline-secondary" data-action="search-video">
                                <i class="ri-search-line"></i>
                            </button>
                        </div>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('video', '视频库') : `
                            <button class="btn btn-ghost" data-action="show-help" title="使用帮助">
                                <i class="ri-question-line"></i> 帮助
                            </button>
                        `}
                        <button class="btn btn-primary" data-action="create-collection">
                            <i class="ri-add-line"></i> 创建视频集
                        </button>
                    </div>
                </div>

                <div class="collection-grid">
                    ${collections.length === 0 ? `
                        <div class="empty-state">
                            <i class="ri-video-line"></i>
                            <div class="main-text">还没有视频集</div>
                            <div class="sub-text">点击上方按钮创建一个合集来存放您的精彩视频</div>
                        </div>
                    ` : collections.map(collection => `
                        <div class="collection-card" data-collection-id="${collection.id}">
                            <div class="collection-cover">
                                ${collection.cover_url
                ? `<img src="${this.withToken(collection.cover_url)}" alt="${Utils.escapeHtml(collection.name || '')}" loading="lazy" data-fallback="collection">`
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
                                <div class="collection-name">${Utils.escapeHtml(collection.name || '未命名')}</div>
                                <div class="collection-meta">${collection.video_count || 0} 个视频</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderVideoGrid() {
        const { currentCollection, videos, selectionMode, selectedIds, loading } = this.state;

        return `
            <div class="video-grid-view">
                <div class="page-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back-to-collections">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <div>
                            <h1 class="page-title">${Utils.escapeHtml(currentCollection?.name || '未命名合集')}</h1>
                            <p class="page-subtitle">${videos.length} 个视频</p>
                        </div>
                    </div>
                    <div class="header-actions d-flex gap-2">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('video', '视频库') : `
                            <button class="btn btn-ghost" data-action="show-help" title="使用帮助">
                                <i class="ri-question-line"></i> 帮助
                            </button>
                        `}
                        ${selectionMode ? `
                            <button class="btn btn-ghost" data-action="select-all">
                                ${selectedIds.size === videos.length ? '取消全选' : '全选'}
                            </button>
                            <button class="btn btn-danger" data-action="batch-delete" ${selectedIds.size === 0 ? 'disabled' : ''}>
                                删除 (${selectedIds.size})
                            </button>
                            <button class="btn btn-primary" data-action="toggle-selection">退出管理</button>
                        ` : `
                            <button class="btn btn-ghost" data-action="toggle-selection" ${videos.length === 0 ? 'disabled' : ''}>
                                <i class="ri-checkbox-multiple-line"></i> 管理
                            </button>
                            <input type="file" id="videoUploadInput" multiple accept="video/*" style="display:none;">
                            <button class="btn btn-primary" data-action="upload-videos">
                                <i class="ri-upload-cloud-2-line"></i> 上传视频
                            </button>
                        `}
                    </div>
                </div>

                ${loading && videos.length === 0 ? '<div class="loading-center"><div class="loading-spinner"></div></div>' : `
                    <div class="video-grid">
                        ${videos.length === 0 ? `
                            <div class="empty-state">
                                <i class="ri-video-add-line"></i>
                                <div class="main-text">此视频集为空</div>
                                <div class="sub-text">将视频文件拖拽到此或点击上传按钮</div>
                            </div>
                        ` : videos.map((video, index) => {
            const isSelected = selectedIds.has(video.id);
            const isCover = currentCollection?.cover_video_id === video.id;
            return `
                                <div class="video-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-video-id="${video.id}">
                                    <div class="video-thumbnail">
                                        ${video.thumbnail_url
                    ? `<img src="${this.withToken(video.thumbnail_url)}" alt="${Utils.escapeHtml(video.filename)}" loading="lazy" data-fallback="video">`
                    : `<div class="video-thumbnail-placeholder"><i class="ri-clapperboard-line"></i></div>`
                }
                                        <div class="video-duration">${video.duration_formatted || '00:00'}</div>
                                        <div class="video-play-icon"><i class="ri-play-fill"></i></div>
                                        ${selectionMode ? `
                                            <div class="video-checkbox">
                                                <i class="${isSelected ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i>
                                            </div>
                                        ` : ''}
                                    </div>
                                    <div class="video-info">
                                        <div class="video-title">${Utils.escapeHtml(video.title || video.filename)}</div>
                                        <div class="video-meta">${Utils.formatBytes(video.file_size)}</div>
                                    </div>
                                    <div class="video-overlay">
                                        ${!selectionMode ? `
                                            <button class="video-action-btn" data-action="edit-video" data-video-id="${video.id}" title="编辑">
                                                <i class="ri-edit-line"></i>
                                            </button>
                                            <button class="video-action-btn ${isCover ? 'active' : ''}" data-action="set-cover" data-video-id="${video.id}" title="${isCover ? '当前集封面' : '设为合集封面'}">
                                                <i class="${isCover ? 'ri-bookmark-fill' : 'ri-bookmark-line'}"></i>
                                            </button>
                                            <button class="video-action-btn danger" data-action="delete-video" data-video-id="${video.id}" title="删除">
                                                <i class="ri-delete-bin-line"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                    ${isCover ? '<div class="video-badge">封面</div>' : ''}
                                </div>
                            `;
        }).join('')}
                    </div>
                `}
            </div>
        `;
    }

    renderPlayer() {
        const { selectedVideo, selectedIndex, videos, playbackSpeed } = this.state;
        if (!selectedVideo) return '';

        const speeds = [0.5, 1.0, 1.25, 1.5, 2.0];

        return `
            <div class="video-player-overlay">
                <div class="player-header">
                    <div class="player-info">
                        <div class="player-counter">VIDEO ${selectedIndex + 1} OF ${videos.length}</div>
                        <div class="player-title">${Utils.escapeHtml(selectedVideo.filename)}</div>
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
                            id="videoPlayer"
                            src="${this.withToken(selectedVideo.url)}" 
                            controls 
                            autoplay
                            class="player-video"
                        ></video>
                    </div>
                    
                    <button class="player-nav-btn next" data-action="next-video">
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                </div>

                <div class="player-controls-extra">
                    ${speeds.map(s => `
                        <div class="speed-badge ${playbackSpeed === s ? 'active' : ''}" data-speed="${s}">${s}x</div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // 弹窗辅助方法
    showCreateCollectionModal() {
        Modal.form({
            title: '新建视频集',
            confirmText: '创建视频集',
            fields: [
                { name: 'name', label: '视频集名称', required: true, placeholder: '例如：精彩电影' },
                { name: 'description', label: '描述', type: 'textarea', placeholder: '添加一段关于视频集的描述...' }
            ],
            onSubmit: async (data) => {
                const res = await Api.post('/video/', data);
                if (res.code === 200 || res.code === 0) {
                    Toast.success('视频集已成功创建');
                    // 清空搜索以便显示新创建的项
                    this.setState({ keyword: '' });
                    const searchInput = document.getElementById('videoSearchInput');
                    if (searchInput) searchInput.value = '';

                    try {
                        await this.loadCollections();
                    } catch (e) {
                        console.error('刷新列表失败:', e);
                    }
                } else {
                    throw new Error(res.message || '创建失败');
                }
            }
        });
    }

    showEditCollectionModal(collectionId) {
        const collection = this.state.collections.find(c => c.id === collectionId);
        if (!collection) return;
        new Modal({
            title: '编辑视频集',
            content: `
                <form id="collectionForm">
                    <div class="form-group mb-3">
                        <label class="form-label">合集名称 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="name" value="${Utils.escapeHtml(collection.name)}" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-control" name="description" rows="3">${Utils.escapeHtml(collection.description || '')}</textarea>
                    </div>
                </form>
            `,
            confirmText: '保存修改',
            onConfirm: async () => {
                const form = document.getElementById('collectionForm');
                if (!form.reportValidity()) return false;
                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };
                const res = await Api.put(`/video/${collectionId}`, data);
                if (this.isApiSuccess(res)) {
                    Toast.success('更改已保存');
                    await this.loadCollections();
                    return true;
                }
                return false;
            }
        }).show();
    }

    showEditVideoModal(videoId) {
        const video = this.state.videos.find(v => v.id === videoId);
        if (!video) return;

        new Modal({
            title: '编辑视频',
            content: `
                <form id="videoEditForm">
                    <div class="form-group mb-3">
                        <label class="form-label">标题</label>
                        <input type="text" class="form-control" name="title" value="${Utils.escapeHtml(video.title || '')}" maxlength="200" placeholder="为视频添加标题">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-control" name="description" rows="3" placeholder="添加视频描述...">${Utils.escapeHtml(video.description || '')}</textarea>
                    </div>
                    <div class="form-group mt-3">
                        <div class="text-muted small">
                            <div><i class="ri-file-info-line"></i> ${Utils.escapeHtml(video.filename)}</div>
                            <div><i class="ri-vidicon-line"></i> ${video.width || '?'} × ${video.height || '?'} 像素</div>
                            <div><i class="ri-time-line"></i> ${video.duration_formatted || '未知时长'}</div>
                            <div><i class="ri-database-line"></i> ${Utils.formatBytes(video.file_size)}</div>
                        </div>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('videoEditForm');
                const data = {
                    title: form.title.value.trim() || null,
                    description: form.description.value.trim() || null
                };
                try {
                    const res = await Api.put(`/video/videos/${videoId}`, data);
                    if (this.isApiSuccess(res)) {
                        Toast.success('视频信息已更新');
                        // 更新本地状态
                        const videos = this.state.videos.map(v =>
                            v.id === videoId ? { ...v, ...data } : v
                        );
                        this.setState({ videos });
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
}

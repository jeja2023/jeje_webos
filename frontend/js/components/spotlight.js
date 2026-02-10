/**
 * 全局搜索组件 (Spotlight)
 * 提供应用、设置、文件的统一搜索入口
 */
const Spotlight = {
    isOpen: false,
    element: null,
    input: null,
    resultsContainer: null,
    selectedIndex: 0,
    results: [],

    // 预定义的系统设置索引
    settingsIndex: [
        { title: '系统设置', desc: '主题、安全策略、全局配置', icon: '⚙️', path: '/system/settings' },
        { title: '用户管理', desc: '添加用户、重置密码、角色管理', icon: '👥', path: '/users/list', permission: 'admin' },
        { title: '待审核用户', desc: '查看等待审核的新注册用户', icon: '⏳', path: '/users/pending', permission: 'admin' },
        { title: '个人资料', desc: '修改昵称、头像', icon: '👤', path: '/profile' },
        { title: '修改密码', desc: '修改当前登录密码', icon: '🔐', action: 'changePassword' },
        { title: '文件管理', desc: '浏览、上传、下载文件', icon: '📁', path: '/filemanager' },
        { title: '知识库', desc: '企业级知识管理与文档协作', icon: '📚', path: '/knowledge' },
        { title: '我的笔记', desc: '记录灵感、工作计划、待办事项', icon: '📝', path: '/notes' },
        { title: '我的相册', desc: '珍藏回忆，管理精彩时刻', icon: '🖼️', path: '/album' },
        { title: '视频中心', desc: '管理和观看视频合集', icon: '🎬', path: '/video' },
        { title: '消息中心', desc: '查看系统通知、即时通讯', icon: '💬', path: '/im' },
        { title: '应用中心', desc: '安装、管理应用模块', icon: '🧩', path: '/apps' },
        { title: '应用市场', desc: '浏览和下载新应用', icon: '🛍️', path: '/apps' },
        { title: 'PDF工具', desc: '处理PDF合并、拆分、提取文本', icon: '📄', path: '/pdf' },
        { title: '公告管理', desc: '发布和管理系统公告', icon: '📢', path: '/announcement', permission: 'admin' },
        { title: '备份管理', desc: '系统数据备份与还原', icon: '💾', path: '/system/backup', permission: 'admin' },
        { title: '数据透镜', desc: '可视化数据分析、报表看板', icon: '📊', path: '/lens' },
        { title: '数据图表', desc: '浏览我的可视化数据视图', icon: '📈', path: '/lens/views' },
        { title: '关于系统', desc: '查看版本信息', icon: 'ℹ️', action: 'about' }
    ],

    init() {
        if (this.element) return;
        this.render();
        this.bindEvents();
        this.bindGlobalKeys();
    },

    render() {
        if (document.querySelector('.spotlight-overlay')) return;
        const overlay = document.createElement('div');
        overlay.className = 'spotlight-overlay';
        overlay.innerHTML = `
            <div class="spotlight-container">
                <div class="spotlight-header">
                    <div class="spotlight-icon">🔍</div>
                    <input type="text" class="spotlight-input" placeholder="搜索功能、文件、笔记、相册、视频、公告..." autocomplete="off">
                    <div class="spotlight-badge">ESC 关闭</div>
                </div>
                <div class="spotlight-results">
                    <!-- 结果列表 -->
                </div>
                <div class="spotlight-footer">
                    <div class="spotlight-key"><kbd>↑</kbd> <kbd>↓</kbd> <span>选择</span></div>
                    <div class="spotlight-key"><kbd>↵</kbd> <span>打开</span></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        this.element = overlay;
        this.input = overlay.querySelector('.spotlight-input');
        this.resultsContainer = overlay.querySelector('.spotlight-results');
    },

    bindEvents() {
        // 关闭点击背景
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) {
                this.close();
            }
        });

        // 输入事件
        this.input.addEventListener('input', Utils.debounce((e) => {
            this.search(e.target.value);
        }, 300));

        // 键盘导航
        this.input.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.moveSelection(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.moveSelection(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.triggerSelected();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
            }
        });
    },

    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            // Ctrl + K 或 Ctrl + Space 唤起
            if ((e.ctrlKey && e.key === 'k') || (e.ctrlKey && e.code === 'Space')) {
                e.preventDefault();
                if (this.isOpen) {
                    this.close();
                } else {
                    this.open();
                }
            }

            // ESC 关闭
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    },

    open() {
        this.isOpen = true;
        this.element.classList.add('active');
        this.input.value = '';
        this.input.focus();
        this.search('');
    },

    close() {
        this.isOpen = false;
        this.element.classList.remove('active');
    },

    async search(keyword) {
        keyword = keyword.trim().toLowerCase();

        let results = [];
        const user = Store.get('user') || {};
        const isAdmin = ['admin', 'manager'].includes(user.role);

        // 1. 搜索系统设置与应用入口 (本地索引)
        const settingsMatches = this.settingsIndex.filter(item => {
            // 权限检查
            if (item.permission === 'admin' && !isAdmin) return false;

            if (!keyword) return true; // 空关键词显示推荐项
            return item.title.toLowerCase().includes(keyword) ||
                item.desc.toLowerCase().includes(keyword);
        }).map(item => ({
            ...item,
            type: 'setting',
            group: '功能跳转'
        }));

        // 限制空搜索时的推荐数量
        results = keyword ? [...settingsMatches] : settingsMatches.slice(0, 8);

        if (keyword.length >= 1) {
            const searchPromises = [];

            // 2. 搜索用户
            searchPromises.push(
                Api.get('/users/search', { query: keyword })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.map(u => ({
                        title: u.nickname || u.username,
                        desc: `@${u.username}`,
                        icon: u.avatar || '👤',
                        type: 'user',
                        group: '用户',
                        id: u.id,
                        path: `/im?userId=${u.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 3. 搜索文件
            if (keyword.length >= 2) {
                searchPromises.push(
                    Api.get('/storage/list', { keyword: keyword, page: 1, page_size: 5 })
                        .then(res => (res.data && res.data.items) ? res.data.items.map(file => ({
                            title: file.filename,
                            desc: Utils.formatBytes(file.file_size),
                            icon: this.getFileIcon(file.filename),
                            type: 'file',
                            group: '文件',
                            id: file.id,
                            path: file.url
                        })) : [])
                        .catch(() => [])
                );
            }

            // 4. 搜索知识库
            searchPromises.push(
                Api.get('/knowledge/search', { q: keyword, mode: 'quick' })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.map(item => ({
                        title: item.title || (item.metadata && item.metadata.title) || '未知文档',
                        desc: (item.metadata && item.metadata.node_type === 'folder') ? '文件夹' : '文档',
                        icon: (item.metadata && item.metadata.node_type === 'folder') ? '📁' : '📄',
                        type: 'knowledge',
                        group: '知识库',
                        id: item.node_id,
                        path: `/knowledge?node=${item.node_id}`
                    })) : [])
                    .catch(() => [])
            );

            // 5. 搜索笔记
            searchPromises.push(
                Api.get('/notes/notes', { keyword: keyword, page: 1, size: 5 })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.items.map(note => ({
                        title: note.title,
                        desc: note.content_preview || '笔记内容',
                        icon: '📝',
                        type: 'note',
                        group: '笔记',
                        id: note.id,
                        path: `/notes?id=${note.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 6. 搜索相册
            searchPromises.push(
                Api.get('/album/', { keyword: keyword, page: 1, page_size: 5 })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.items.map(album => ({
                        title: album.name,
                        desc: `${album.photo_count || 0} 张照片`,
                        icon: '🖼️',
                        type: 'album',
                        group: '相册',
                        id: album.id,
                        path: `/album?id=${album.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 7. 数据透镜 (动态加载)
            if (window.LensApi) {
                searchPromises.push(
                    LensApi.getViews({ search: keyword })
                        .then(res => (res.code === 200 && res.data) ? res.data.map(view => ({
                            title: view.name,
                            desc: view.description || '数据透镜视图',
                            icon: view.icon || '📊',
                            type: 'datalens',
                            group: '数据透镜',
                            id: view.id,
                            path: `/lens/viewer?id=${view.id}`
                        })) : [])
                        .catch(() => [])
                );
            }

            // 8. 搜索视频
            searchPromises.push(
                Api.get('/video/', { keyword: keyword, page: 1, page_size: 5 })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.items.map(video => ({
                        title: video.name,
                        desc: video.description || '视频集',
                        icon: '🎬',
                        type: 'video',
                        group: '视频',
                        id: video.id,
                        path: `/video?id=${video.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 9. 搜索公告
            searchPromises.push(
                Api.get('/announcements', { keyword: keyword, page: 1, size: 5 })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.items.map(notice => ({
                        title: notice.title,
                        desc: notice.summary || '系统公告',
                        icon: '📢',
                        type: 'announcement',
                        group: '公告',
                        id: notice.id,
                        path: `/announcement?id=${notice.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 10. 搜索博客文章
            searchPromises.push(
                Api.get('/blog/posts', { keyword: keyword, page: 1, size: 5 })
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.items.map(post => ({
                        title: post.title,
                        desc: post.summary || '博客文章',
                        icon: '✍️',
                        type: 'blog',
                        group: '博客',
                        id: post.id,
                        path: `/blog/post/${post.id}`
                    })) : [])
                    .catch(() => [])
            );

            // 11. 搜索应用市场 (本地过滤或服务端)
            searchPromises.push(
                Api.get('/system/market/list')
                    .then(res => (res.code === 200 || res.code === 0) ? res.data.filter(app =>
                        app.name.toLowerCase().includes(keyword.toLowerCase()) ||
                        app.description.toLowerCase().includes(keyword.toLowerCase())
                    ).slice(0, 3).map(app => ({
                        title: app.name,
                        desc: app.description,
                        icon: app.icon || '🧩',
                        type: 'market',
                        group: '应用市场',
                        id: app.id,
                        path: '/apps'
                    })) : [])
                    .catch(() => [])
            );

            // 12. 搜索审计日志 (仅管理员)
            const user = (typeof Store !== 'undefined') ? Store.get('user') : null;
            if (user && (user.role === 'admin' || user.role === 'manager')) {
                searchPromises.push(
                    Api.get('/audit', { keyword: keyword, page: 1, size: 5 })
                        .then(res => {
                            if (res.code === 200 || res.code === 0) {
                                return res.data.items.map(log => ({
                                    title: `[${log.module || '系统'}] ${log.action}`,
                                    desc: `${log.username}: ${log.message}`,
                                    icon: log.level === 'ERROR' ? '❌' : '📜',
                                    type: 'audit',
                                    group: '审计日志',
                                    id: log.id,
                                    path: '/system/settings'
                                }));
                            }
                            return [];
                        })
                        .catch(() => [])
                );
            }

            const allResults = await Promise.allSettled(searchPromises);
            allResults.forEach(res => {
                if (res.status === 'fulfilled') {
                    results = [...results, ...res.value];
                }
            });
        }

        this.results = results;
        this.renderResults();
    },

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'pdf': '📄', 'doc': '📝', 'docx': '📝',
            'xls': '📊', 'xlsx': '📊',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
            'zip': '📦', 'rar': '📦', 'jwapp': '📦',
            'mp3': '🎵', 'mp4': '🎬',
            'txt': '📃', 'md': '📃'
        };
        return icons[ext] || '📄';
    },

    renderResults() {
        this.resultsContainer.innerHTML = '';
        this.selectedIndex = 0;

        if (this.results.length === 0) {
            this.resultsContainer.innerHTML = '<div class="spotlight-empty">未找到相关内容</div>';
            return;
        }

        // 按分组渲染
        const groups = {};
        this.results.forEach(item => {
            if (!groups[item.group]) groups[item.group] = [];
            groups[item.group].push(item);
        });

        let html = '';
        let globalIndex = 0;

        Object.keys(groups).forEach(groupName => {
            html += `<div class="spotlight-group">
                <div class="spotlight-group-title">${groupName}</div>`;

            groups[groupName].forEach(item => {
                const isAvatar = item.type === 'user' && item.icon && (item.icon.startsWith('http') || item.icon.startsWith('/') || item.icon.startsWith('data:'));
                const iconHtml = isAvatar
                    ? `<img src="${Utils.escapeHtml(item.icon)}" class="spotlight-item-avatar">`
                    : Utils.escapeHtml(item.icon || '🔹');

                html += `
                    <div class="spotlight-item ${globalIndex === 0 ? 'active' : ''}" data-index="${globalIndex}">
                        <div class="spotlight-item-icon ${isAvatar ? 'is-avatar' : ''}">${iconHtml}</div>
                        <div class="spotlight-item-content">
                            <div class="spotlight-item-title">${Utils.escapeHtml(item.title)}</div>
                            <div class="spotlight-item-desc">${Utils.escapeHtml(item.desc)}</div>
                        </div>
                        <div class="spotlight-item-action">↵ 打开</div>
                    </div>
                `;
                globalIndex++;
            });

            html += `</div>`;
        });

        this.resultsContainer.innerHTML = html;

        // 绑定鼠标悬停事件
        this.resultsContainer.querySelectorAll('.spotlight-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const idx = parseInt(el.dataset.index);
                this.setSelection(idx);
            });
            el.addEventListener('click', () => {
                this.triggerSelected();
            });
        });
    },

    setSelection(index) {
        const items = this.resultsContainer.querySelectorAll('.spotlight-item');
        if (items.length === 0) return;
        if (index < 0) index = 0;
        if (index >= items.length) index = items.length - 1;

        this.selectedIndex = index;

        items.forEach(el => el.classList.remove('active'));
        if (items[index]) {
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    },

    moveSelection(delta) {
        this.setSelection(this.selectedIndex + delta);
    },

    triggerSelected() {
        const item = this.results[this.selectedIndex];
        if (!item) return;

        this.close();

        if (item.action) {
            this.handleAction(item.action);
        } else if (item.path) {
            if (item.type === 'file') {
                window.open(Utils.withToken(`${Config.apiBase}/storage/download/${item.id}`));
            } else {
                Router.push(item.path);
            }
        }
    },

    handleAction(action) {
        switch (action) {
            case 'changePassword':
                Router.push('/profile/password');
                break;
            case 'about':
                if (window.App && App.topbar && typeof App.topbar.showAboutModal === 'function') {
                    App.topbar.showAboutModal();
                } else {
                    const brand = document.querySelector('#brandPill');
                    if (brand) brand.click();
                }
                break;
        }
    }
};

window.Spotlight = Spotlight;

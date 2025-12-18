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
        { title: '添加用户', desc: '快速创建新用户账户', icon: '➕', action: 'createUser', permission: 'admin' },
        { title: '个人资料', desc: '修改昵称、头像', icon: '👤', action: 'profile' },
        { title: '修改密码', desc: '修改当前登录密码', icon: '🔐', action: 'changePassword' },
        { title: '文件管理', desc: '浏览、上传、下载文件', icon: '📁', path: '/filemanager' },
        { title: '应用中心', desc: '安装、管理应用模块', icon: 'qy', path: '/apps' },
        { title: '应用市场', desc: '浏览和下载新应用', icon: '🛍️', path: '/apps' },
        { title: '待审核用户', desc: '查看等待审核的新注册用户', icon: '⏳', path: '/users/pending', permission: 'admin' },
        { title: '系统监控', desc: '查看系统运行状态', icon: '📊', path: '/system/monitor' },
        { title: '关于系统', desc: '查看版本信息', icon: 'ℹ️', action: 'about' }
    ],

    init() {
        if (this.element) return;
        this.render();
        this.bindEvents();
        this.bindGlobalKeys();
    },

    render() {
        const overlay = document.createElement('div');
        overlay.className = 'spotlight-overlay';
        overlay.innerHTML = `
            <div class="spotlight-container">
                <div class="spotlight-header">
                    <div class="spotlight-icon">🔍</div>
                    <input type="text" class="spotlight-input" placeholder="搜索应用、文件、设置..." autocomplete="off">
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
        }, 150));

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

        // 1. 搜索应用 (已安装的模块)
        // 从 Store 或 Config 中获取模块列表
        const modules = Store.get('modules') || []; // 假设 Store 中存了 modules
        // 如果 Store 没有 modules，尝试从侧边栏菜单配置中获取
        // 这里简化为搜索预定义的设置项和已知的系统页面

        // 2. 搜索系统设置 (本地索引)
        const settingsMatches = this.settingsIndex.filter(item => {
            // 权限检查
            if (item.permission === 'admin' && !isAdmin) return false;

            if (!keyword) return true; // 空关键词显示推荐项
            return item.title.toLowerCase().includes(keyword) ||
                item.desc.toLowerCase().includes(keyword);
        }).map(item => ({
            ...item,
            type: 'setting',
            group: '系统功能'
        }));

        results = [...results, ...settingsMatches];

        // 3. 搜索文件 (调用后端 API)
        // 只有当关键词长度 > 1 时才搜索文件，避免请求过多
        if (keyword.length > 1) {
            try {
                // 假设 Api.getFileList 支持 keyword 参数
                // 这里需要确认 Api 是否有 searchFiles 或者 use list?keyword
                // 暂时模拟，或者如果 Api.js 没有暴露 searchFiles，则跳过或添加 TODO
                // 根据之前的分析，Api.js 中没有直接暴露 search 文件的方法，但 storage list 支持 keyword
                const res = await Api.get('/storage/list', {
                    keyword: keyword,
                    page: 1,
                    size: 5
                });

                if (res.data && res.data.items) {
                    const fileMatches = res.data.items.map(file => ({
                        title: file.filename,
                        desc: Utils.formatBytes(file.file_size),
                        icon: this.getFileIcon(file.filename),
                        type: 'file',
                        group: '文件',
                        id: file.id,
                        path: file.url // 下载链接
                    }));
                    results = [...results, ...fileMatches];
                }
            } catch (e) {
                console.warn('文件搜索失败', e);
            }
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
                html += `
                    <div class="spotlight-item ${globalIndex === 0 ? 'active' : ''}" data-index="${globalIndex}">
                        <div class="spotlight-item-icon">${item.icon || '🔹'}</div>
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
                // 如果是文件，可能是下载或预览
                // 这里暂时做下载/新标签页打开
                // 如果是图片，可以用 PreviewModal (如果存在)
                // 简单起见，文件直接打开下载链接
                window.open(`${Config.apiBase}/storage/download/${item.id}?token=${Store.get('token')}`);
            } else {
                // 路由跳转
                Router.push(item.path);
            }
        }
    },

    handleAction(action) {
        switch (action) {
            case 'createUser':
                // 尝试调用 UsersPage 的方法？这比较困难，因为 UsersPage 未必实例化
                // 更好的方法是跳转到用户列表，并携带参数让其自动打开弹窗
                // 或者直接在这里调用 UserApi 并弹窗？如果 Modal 组件是全局的，可以直接用。
                // 复用 UsersPage 的逻辑需要稍微重构 UsersPage 使其方法可复用，或者在这里重写一份
                // 为了简单，我们跳转到用户管理页面
                Router.push('/users/list');
                setTimeout(() => {
                    const btn = document.getElementById('createUserBtn');
                    if (btn) btn.click();
                }, 500);
                break;
            case 'profile':
                // 跳转到个人中心
                Router.push('/profile');
                break;
            case 'changePassword':
                // 跳转到修改密码页面
                Router.push('/profile/password');
                break;
            case 'about':
                // 触发 Topbar 的关于弹窗
                const brand = document.querySelector('.navbar-brand');
                if (brand) brand.click();
                break;
        }
    }
};

// 导出
window.Spotlight = Spotlight;

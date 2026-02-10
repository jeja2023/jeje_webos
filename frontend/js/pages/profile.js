/**
 * 个人中心页面
 */

class ProfilePage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            user: Store.get('user') || {},
            editing: false,
            loading: false,
            form: {}
        };
    }

    async loadProfile() {
        try {
            const res = await AuthApi.profile();
            const user = res.data || res;
            this.setState({ user, form: { ...user } });
            Store.set('user', user);
        } catch (e) {
            Toast.error('加载用户信息失败');
        }
    }

    async saveProfile() {
        const { form } = this.state;

        if (!form.nickname?.trim()) {
            Toast.error('昵称不能为空');
            return;
        }

        this.setState({ loading: true });
        try {
            const res = await UserApi.updateProfile({
                nickname: form.nickname,
                phone: form.phone || ''
            });
            const user = res.data || res;
            Store.set('user', { ...Store.get('user'), ...user });
            this.setState({
                user: { ...this.state.user, ...user },
                editing: false,
                loading: false
            });
            Toast.success('保存成功');
        } catch (e) {
            this.setState({ loading: false });
            Toast.error(e.message || '保存失败');
        }
    }

    getInitials(user) {
        // 获取头像显示的缩写
        const name = user?.nickname || user?.username || '?';
        if (!name) return '?';

        // 如果是中文，取前两个字
        if (/[\u4e00-\u9fa5]/.test(name)) {
            return name.substring(0, 2);
        }

        // 如果是英文，取首字母大写
        return name.charAt(0).toUpperCase();
    }

    render() {
        const { user, editing, loading, form } = this.state;
        const initials = this.getInitials(user);

        return `
            <div class="page fade-in compact-page">
                <div class="page-header compact-header">
                    <h1 class="page-title">个人中心</h1>
                </div>

                <div class="profile-layout">
                    <!-- 左侧：头像和基本信息 -->
                    <div class="profile-left">
                        <div class="card profile-card-compact">
                            <div class="profile-header-compact">
                                <div class="profile-avatar-large" id="avatarUploadTrigger">
                                    ${user.avatar ?
                `<img src="${Utils.escapeHtml(Utils.withToken(user.avatar))}" alt="Avatar">` :
                Utils.escapeHtml(initials)
            }
                                    <div class="avatar-overlay"><i class="ri-camera-line"></i></div>
                                </div>
                                <input type="file" id="avatarInput" accept="image/*" style="display: none;">
                                <div class="profile-basic">
                                    <h2>${Utils.escapeHtml(user.nickname || user.username)}</h2>
                                    <p class="profile-username">@${Utils.escapeHtml(user.username || '')}</p>
                                    <span class="role-badge role-${user.role}">${this.getRoleName(user.role)}</span>
                                </div>
                            </div>
                            <div class="profile-stats-inline">
                                <div class="stat-inline">
                                    <span class="stat-label">注册时间</span>
                                    <span class="stat-value">${user.created_at ? Utils.formatDate(user.created_at, 'YYYY-MM-DD') : '-'}</span>
                                </div>
                                <div class="stat-inline">
                                    <span class="stat-label">最后登录</span>
                                    <span class="stat-value">${user.last_login ? Utils.timeAgo(user.last_login) : '从未登录'}</span>
                                </div>
                                <div class="stat-inline status-horizontal">
                                    <span class="stat-label">账户状态</span>
                                    <span class="status-dot ${user.is_active !== false ? 'active' : 'inactive'}"></span>
                                    <span class="stat-value" style="font-size: 12px; margin-left: 4px;">${user.is_active !== false ? '正常' : '已禁用'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：账户信息和安全设置 -->
                    <div class="profile-right">
                        <!-- 账户信息 -->
                        <div class="card card-compact">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ri-file-list-line"></i> 账户信息</h3>
                                ${!editing ? `<button class="btn btn-primary btn-sm" id="editBtn"><i class="ri-edit-line"></i> 编辑</button>` : ''}
                            </div>
                            <div class="card-body">
                                ${editing ? this.renderEditForm() : this.renderInfoDisplay()}
                            </div>
                        </div>

                        <!-- 安全设置 -->
                        <div class="card card-compact">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ri-lock-line"></i> 安全设置</h3>
                            </div>
                            <div class="card-body">
                                <div class="security-item-compact">
                                    <div class="security-info">
                                        <span class="security-title">登录密码</span>
                                        <span class="security-desc">定期更换密码可以提高账户安全性，建议每3-6个月更换一次</span>
                                    </div>
                                    <button class="btn btn-secondary btn-sm" id="changePasswordBtn">修改密码</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderInfoDisplay() {
        const { user } = this.state;
        return `
            <div class="info-list">
                <div class="info-item">
                    <span class="info-label">用户名</span>
                    <span class="info-value">${Utils.escapeHtml(user.username || '-')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">昵称</span>
                    <span class="info-value">${Utils.escapeHtml(user.nickname) || '未设置'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">手机号</span>
                    <span class="info-value">${Utils.escapeHtml(user.phone) || '未绑定'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">角色</span>
                    <span class="info-value">${this.getRoleName(user.role)}</span>
                </div>
                ${user.email ? `
                <div class="info-item">
                    <span class="info-label">邮箱</span>
                    <span class="info-value">${Utils.escapeHtml(user.email)}</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    renderEditForm() {
        const { form, loading } = this.state;
        return `
            <div class="form-group">
                <label class="form-label">用户名</label>
                <input type="text" class="form-input" value="${Utils.escapeHtml(form.username)}" disabled>
                <small class="form-hint">用户名不可修改</small>
            </div>
            <div class="form-group">
                <label class="form-label">昵称 <span class="required">*</span></label>
                <input type="text" class="form-input" id="nicknameInput" value="${Utils.escapeHtml(form.nickname || '')}" placeholder="请输入昵称">
            </div>
            <div class="form-group">
                <label class="form-label">手机号</label>
                <input type="text" class="form-input" id="phoneInput" value="${Utils.escapeHtml(form.phone || '')}" placeholder="请输入手机号">
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="cancelBtn" ${loading ? 'disabled' : ''}>取消</button>
                <button class="btn btn-primary" id="saveBtn" ${loading ? 'disabled' : ''}>
                    ${loading ? '保存中...' : '保存'}
                </button>
            </div>
        `;
    }

    getRoleName(role) {
        const roles = {
            'admin': '管理员',
            'manager': '管理员',
            'user': '普通用户',
            'guest': '访客'
        };
        return roles[role] || role;
    }

    afterMount() {
        this.loadProfile();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    async uploadAvatar(file) {
        const formData = new FormData();
        formData.append('file', file);

        // 显示加载状态
        const avatarEl = this.$('.profile-avatar-large');
        if (avatarEl) avatarEl.style.opacity = '0.5';

        try {
            // 1. 上传文件 (category=avatar)
            const uploadRes = await Api.upload('/storage/upload?category=avatar', formData);
            if (uploadRes.code === 200) {
                const avatarUrl = uploadRes.data.url;

                // 2. 更新用户资料
                const updateRes = await UserApi.updateProfile({
                    avatar: avatarUrl
                });

                if (updateRes.code === 200) {
                    // 更新本地状态
                    const newUser = { ...this.state.user, avatar: avatarUrl };
                    this.setState({ user: newUser });
                    Store.set('user', newUser);

                    // 广播用户信息更新事件（如果有的话）
                    Toast.success('头像更新成功');
                }
            } else {
                Toast.error(uploadRes.message || '上传失败');
            }
        } catch (err) {
            console.error(err);
            Toast.error('上传头像失败');
        } finally {
            if (avatarEl) avatarEl.style.opacity = '1';
        }
    }

    showCropModal(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;

            // 裁剪状态
            const state = {
                scale: 1,
                x: 0,
                y: 0,
                isDragging: false,
                startX: 0,
                startY: 0,
                initialX: 0,
                initialY: 0
            };

            const content = `
                <div class="crop-container" style="display: flex; flex-direction: column; align-items: center; gap: 16px; user-select: none;">
                    <div class="crop-viewport" style="
                        width: 250px; 
                        height: 250px; 
                        border-radius: 50%;
                        border: 2px solid var(--color-primary);
                        overflow: hidden; 
                        position: relative; 
                        background: #111;
                        cursor: grab;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        /* 增加棋盘格背景表示透明 */
                        background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%);
                        background-size: 20px 20px;
                        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                    ">
                        <img id="cropImage" src="${imageUrl}" style="
                            position: absolute; 
                            top: 0; 
                            left: 0; 
                            transform-origin: 0 0; 
                            will-change: transform;
                            pointer-events: none;
                            max-width: none;
                        " draggable="false">
                    </div>
                    
                    <div style="display: flex; align-items: center; width: 100%; gap: 12px; padding: 0 20px;">
                        <span style="font-size: 14px;"><i class="ri-subtract-line"></i></span>
                        <input type="range" id="cropZoom" min="0.1" max="5" step="0.05" value="1" style="flex: 1; cursor: pointer;">
                        <span style="font-size: 14px;"><i class="ri-add-line"></i></span>
                    </div>

                    <div style="display: flex; gap: 12px; width: 100%; margin-top: 8px;">
                        <button class="btn btn-secondary" style="flex: 1;" data-close>取消</button>
                        <button class="btn btn-primary" style="flex: 1;" id="cropConfirmBtn">确认并上传</button>
                    </div>
                </div>
            `;

            // 事件清理函数引用
            let cleanupEvents = null;

            const modal = Modal.show({
                title: '调整头像',
                content,
                footer: false, // 自定义底部
                width: '360px',
                onCancel: () => {
                    if (cleanupEvents) cleanupEvents();
                }
            });

            const overlay = modal.overlay;
            const img = overlay.querySelector('#cropImage');
            const viewport = overlay.querySelector('.crop-viewport');
            const zoomInput = overlay.querySelector('#cropZoom');
            const confirmBtn = overlay.querySelector('#cropConfirmBtn');

            // 更新变换
            const updateTransform = () => {
                img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
            };

            // 初始化图片位置（居中适应）
            const initImage = () => {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                if (!w || !h) return;

                // 初始适应：短边填满250px
                const s = Math.max(250 / w, 250 / h);
                state.scale = s;
                state.x = (250 - w * s) / 2;
                state.y = (250 - h * s) / 2;

                zoomInput.value = s;
                updateTransform();
            };

            if (img.complete) {
                initImage();
            } else {
                img.onload = initImage;
            }

            // 缩放控制
            zoomInput.oninput = (e) => {
                const newScale = parseFloat(e.target.value);
                if (newScale <= 0) return;

                // 以视口中心为基准缩放
                // 中心点在图片上的相对坐标: cx, cy
                // 125 = state.x + cx * state.scale  =>  cx = (125 - state.x) / state.scale
                const cx = (125 - state.x) / state.scale;
                const cy = (125 - state.y) / state.scale;

                state.scale = newScale;
                // 新位置: 125 - cx * newScale
                state.x = 125 - cx * newScale;
                state.y = 125 - cy * newScale;

                updateTransform();
            };

            // 拖拽逻辑
            const onMouseDown = (e) => {
                state.isDragging = true;
                state.startX = e.clientX;
                state.startY = e.clientY;
                state.initialX = state.x;
                state.initialY = state.y;
                viewport.style.cursor = 'grabbing';
            };

            const onMouseMove = (e) => {
                if (!state.isDragging) return;
                e.preventDefault();
                const dx = e.clientX - state.startX;
                const dy = e.clientY - state.startY;
                state.x = state.initialX + dx;
                state.y = state.initialY + dy;
                updateTransform();
            };

            const onMouseUp = () => {
                state.isDragging = false;
                viewport.style.cursor = 'grab';
            };

            // 绑定事件
            viewport.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);

            cleanupEvents = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            // 确认上传
            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                confirmBtn.innerText = '正在处理...';

                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 250;
                    canvas.height = 250;
                    const ctx = canvas.getContext('2d');

                    // 填充白色背景（避免透明图变成黑色）
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, 250, 250);

                    // 绘制变换后的图片
                    ctx.translate(state.x, state.y);
                    ctx.scale(state.scale, state.scale);
                    ctx.drawImage(img, 0, 0);

                    // 导出并上传
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            // 调用现有的上传方法
                            // 构造一个新的 File 对象
                            const newFile = new File([blob], file.name || 'avatar.png', { type: file.type || 'image/png' });

                            // 移除事件监听
                            cleanupEvents();

                            // 执行上传
                            await this.uploadAvatar(newFile);

                            // 关闭弹窗
                            modal.close();
                        } else {
                            throw new Error('Canvas 导出失败');
                        }
                    }, file.type || 'image/png', 0.9);

                } catch (err) {
                    console.error(err);
                    Toast.error('裁切失败: ' + err.message);
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = '确认并上传';
                }
            };
        };
        reader.readAsDataURL(file);
    }

    bindEvents() {
        if (this.container && !this.container._bindedProfile) {
            this.container._bindedProfile = true;

            // 头像上传触发
            this.delegate('click', '#avatarUploadTrigger', () => {
                this.$('#avatarInput')?.click();
            });

            // 使用 delegate 绑定 change 事件，解决组件重渲染后事件丢失问题
            this.delegate('change', '#avatarInput', (e) => {
                if (e.target.files.length > 0) {
                    this.showCropModal(e.target.files[0]);
                    // 清空 input，允许重复选择同一文件
                    e.target.value = '';
                }
            });

            // 头像 hover 效果 (JS 辅助)
            this.delegate('mouseover', '#avatarUploadTrigger', (e, el) => {
                const overlay = el.querySelector('.avatar-overlay');
                if (overlay) overlay.style.opacity = '1';
            });
            this.delegate('mouseout', '#avatarUploadTrigger', (e, el) => {
                const overlay = el.querySelector('.avatar-overlay');
                if (overlay) overlay.style.opacity = '0';
            });

            // 编辑按钮
            this.delegate('click', '#editBtn', () => {
                this.setState({ editing: true, form: { ...this.state.user } });
            });

            // 取消按钮
            this.delegate('click', '#cancelBtn', () => {
                this.setState({ editing: false });
            });

            // 保存按钮
            this.delegate('click', '#saveBtn', () => {
                const nickname = this.$('#nicknameInput')?.value;
                const phone = this.$('#phoneInput')?.value;
                this.state.form.nickname = nickname;
                this.state.form.phone = phone;
                this.saveProfile();
            });

            // 修改密码
            this.delegate('click', '#changePasswordBtn', () => {
                Router.push('/profile/password');
            });

            this.delegate('click', '[data-action="go-profile"]', () => {
                Router.push('/profile');
            });
        }
    }
}

/**
 * 修改密码页面
 */
class ChangePasswordPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            loading: false
        };
    }

    async changePassword() {
        const oldPassword = this.$('#oldPassword')?.value;
        const newPassword = this.$('#newPassword')?.value;
        const confirmPassword = this.$('#confirmPassword')?.value;

        // 验证
        if (!oldPassword) {
            Toast.error('请输入当前密码');
            return;
        }
        if (!newPassword) {
            Toast.error('请输入新密码');
            return;
        }
        const settings = Store.getSystemSettings();
        const minLength = settings?.password_min_length || 6;

        if (newPassword.length < minLength) {
            Toast.error(`新密码长度至少${minLength}位`);
            return;
        }
        if (newPassword !== confirmPassword) {
            Toast.error('两次输入的密码不一致');
            return;
        }
        if (oldPassword === newPassword) {
            Toast.error('新密码不能与旧密码相同');
            return;
        }

        this.setState({ loading: true });
        try {
            await UserApi.changePassword({
                old_password: oldPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });
            Toast.success('密码修改成功，请重新登录');
            // 清除登录状态
            Store.clearAuth();
            Router.push('/login');
        } catch (e) {
            this.setState({ loading: false });
            Toast.error(e.message || '密码修改失败');
        }
    }

    render() {
        const { loading } = this.state;

        return `
            <div class="page fade-in" style="display: flex; flex-direction: column; height: 100%; padding: 0; overflow: hidden;">
                <!-- 顶部导航栏 (绝对定位) -->
                <div style="position: absolute; top: 0; left: 0; right: 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 10;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-ghost btn-sm" data-action="go-profile" style="padding-left: 0; color: var(--color-text-primary);">
                            ← 返回个人中心
                        </button>
                    </div>
                </div>

                <!-- 居中内容区域 -->
                <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <div class="card" style="width: 100%; max-width: 400px; box-shadow: var(--shadow-lg);">
                        <div class="card-header" style="border-bottom: none; padding-bottom: 0; text-align: center;">
                            <h3 class="card-title" style="font-size: 1.25rem;"><i class="ri-lock-password-line"></i> 修改密码</h3>
                        </div>
                        <div class="card-body" style="padding: 24px;">
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" style="margin-bottom: 4px; font-size: 0.85rem; color: var(--color-text-primary); font-weight: 600;">当前密码 <span style="color: var(--color-error);">*</span></label>
                                <input type="password" class="form-input" id="oldPassword" placeholder="输入当前密码">
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" style="margin-bottom: 4px; font-size: 0.85rem; color: var(--color-text-primary); font-weight: 600;">新密码 <span style="color: var(--color-error);">*</span></label>
                                <input type="password" class="form-input" id="newPassword" placeholder="输入新密码 (至少${Store.getSystemSettings()?.password_min_length || 6}位)">
                            </div>
                            <div class="form-group" style="margin-bottom: 24px;">
                                <label class="form-label" style="margin-bottom: 4px; font-size: 0.85rem; color: var(--color-text-primary); font-weight: 600;">确认新密码 <span style="color: var(--color-error);">*</span></label>
                                <input type="password" class="form-input" id="confirmPassword" placeholder="再次输入新密码">
                            </div>
                            
                            <div class="form-actions">
                                <button class="btn btn-primary btn-block" id="submitBtn" ${loading ? 'disabled' : ''} style="width: 100%;">
                                    ${loading ? '提交中...' : '确认修改'}
                                </button>
                            </div>

                            <p style="margin-top: 16px; font-size: 12px; color: var(--color-text-tertiary); text-align: center;">
                                修改成功后需要重新登录
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedPassword) {
            this.container._bindedPassword = true;

            this.delegate('click', '#submitBtn', () => {
                this.changePassword();
            });

            // 回车提交
            this.delegate('keypress', 'input', (e) => {
                if (e.key === 'Enter') {
                    this.changePassword();
                }
            });
        }
    }
}



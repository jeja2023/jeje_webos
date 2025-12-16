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
                                <div class="profile-avatar-large" id="avatarUploadTrigger" style="position: relative; cursor: pointer; overflow: hidden;">
                                    ${user.avatar ?
                `<img src="${user.avatar.includes('?') ? user.avatar : user.avatar + '?token=' + Store.get('token')}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">` :
                initials
            }
                                    <div class="avatar-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; opacity: 0; transition: opacity 0.2s;">
                                        📷
                                    </div>
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
                                    <span class="stat-label">注册</span>
                                    <span class="stat-value">${Utils.formatDate(user.created_at, 'YYYY-MM-DD')}</span>
                                </div>
                                <div class="stat-inline">
                                    <span class="stat-label">登录</span>
                                    <span class="stat-value">${user.last_login ? Utils.timeAgo(user.last_login) : '从未'}</span>
                                </div>
                                <div class="stat-inline status-horizontal">
                                    <span class="stat-label">状态</span>
                                    <span class="status-dot ${user.is_active ? 'active' : 'inactive'}"></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：账户信息和安全设置 -->
                    <div class="profile-right">
                        <!-- 账户信息 -->
                        <div class="card card-compact">
                            <div class="card-header">
                                <h3 class="card-title">📋 账户信息</h3>
                                ${!editing ? `<button class="btn btn-primary btn-sm" id="editBtn">✏️ 编辑</button>` : ''}
                            </div>
                            <div class="card-body">
                                ${editing ? this.renderEditForm() : this.renderInfoDisplay()}
                            </div>
                        </div>

                        <!-- 安全设置 -->
                        <div class="card card-compact">
                            <div class="card-header">
                                <h3 class="card-title">🔒 安全设置</h3>
                            </div>
                            <div class="card-body">
                                <div class="security-item-compact">
                                    <div class="security-info">
                                        <span class="security-title">登录密码</span>
                                        <span class="security-desc">定期更换提高安全性</span>
                                    </div>
                                    <button class="btn btn-secondary btn-sm" id="changePasswordBtn">修改</button>
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
                    <span class="info-value">${Utils.escapeHtml(user.username)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">昵称</span>
                    <span class="info-value">${Utils.escapeHtml(user.nickname) || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">手机号</span>
                    <span class="info-value">${Utils.escapeHtml(user.phone) || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">角色</span>
                    <span class="info-value">${this.getRoleName(user.role)}</span>
                </div>
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

    bindEvents() {
        if (this.container && !this.container._bindedProfile) {
            this.container._bindedProfile = true;

            // 头像上传
            this.delegate('click', '#avatarUploadTrigger', () => {
                this.$('#avatarInput')?.click();
            });

            const avatarInput = this.$('#avatarInput');
            if (avatarInput) {
                avatarInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        this.uploadAvatar(e.target.files[0]);
                        // 清空 input，允许重复选择同一文件
                        e.target.value = '';
                    }
                });
            }

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
        if (newPassword.length < 6) {
            Toast.error('新密码长度至少6位');
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
                        <button class="btn btn-ghost btn-sm" onclick="Router.push('/profile')" style="padding-left: 0; color: var(--color-text-primary);">
                            ← 返回个人中心
                        </button>
                    </div>
                </div>

                <!-- 居中内容区域 -->
                <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <div class="card" style="width: 100%; max-width: 400px; box-shadow: var(--shadow-lg);">
                        <div class="card-header" style="border-bottom: none; padding-bottom: 0; text-align: center;">
                            <h3 class="card-title" style="font-size: 1.25rem;">🔐 修改密码</h3>
                        </div>
                        <div class="card-body" style="padding: 24px;">
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" style="margin-bottom: 4px; font-size: 0.85rem; color: var(--color-text-primary); font-weight: 600;">当前密码 <span style="color: var(--color-error);">*</span></label>
                                <input type="password" class="form-input" id="oldPassword" placeholder="输入当前密码">
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label class="form-label" style="margin-bottom: 4px; font-size: 0.85rem; color: var(--color-text-primary); font-weight: 600;">新密码 <span style="color: var(--color-error);">*</span></label>
                                <input type="password" class="form-input" id="newPassword" placeholder="输入新密码 (至少6位)">
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



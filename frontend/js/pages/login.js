/**
 * 登录页面
 */

class LoginPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            mode: 'login', // 登录 | 注册
            loading: false,
            error: ''
        };
    }

    toggleMode() {
        this.setState({
            mode: this.state.mode === 'login' ? 'register' : 'login',
            error: ''
        });
    }

    async handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const username = form.username.value.trim();
        const password = form.password.value;

        if (!username || !password) {
            this.setState({ error: '请填写用户名和密码' });
            return;
        }

        // 用户名长度验证
        if (username.length < 3) {
            this.setState({ error: '用户名至少3个字符' });
            return;
        }

        // 注册模式的额外验证
        if (this.state.mode === 'register') {
            const confirmPassword = form.confirm_password?.value;
            const phone = form.phone?.value.trim();

            // 密码双重验证
            if (password !== confirmPassword) {
                this.setState({ error: '两次输入的密码不一致' });
                return;
            }

            // 密码强度验证（与后端一致：≥8，含大小写、数字、特殊字符）
            if (password.length < 8) {
                this.setState({ error: '密码长度至少8位' });
                return;
            }
            const hasUpper = /[A-Z]/.test(password);
            const hasLower = /[a-z]/.test(password);
            const hasDigit = /\d/.test(password);
            const hasSpecial = /[!@#$%^&*]/.test(password);
            if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
                this.setState({ error: '密码需包含大写、小写、数字和特殊字符(!@#$%^&*)' });
                return;
            }

            // 手机号验证（必填）
            if (!phone) {
                this.setState({ error: '请输入手机号码' });
                return;
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
                this.setState({ error: '请输入正确的11位手机号码' });
                return;
            }
        }

        this.setState({ loading: true, error: '' });

        try {
            if (this.state.mode === 'login') {
                const res = await AuthApi.login({ username, password });
                const { access_token, user } = res.data;

                Store.setAuth(access_token, user);

                // 重新获取系统信息（包含模块和菜单）
                await Store.refreshSystemInfo();

                // 同步本地固定应用到后端（如果后端没有但本地有）
                // 等待一下确保 Store 已更新
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const localPinnedApps = localStorage.getItem('jeje_pinned_apps');
                const currentUser = Store.get('user');
                console.log('[Login] 当前用户:', currentUser);
                console.log('[Login] 本地固定应用:', localPinnedApps);
                
                if (localPinnedApps && currentUser) {
                    try {
                        const parsed = JSON.parse(localPinnedApps);
                        // 如果后端没有 dock_pinned_apps 但本地有，则同步
                        const backendHasPinnedApps = currentUser.settings?.dock_pinned_apps && 
                                                     Array.isArray(currentUser.settings.dock_pinned_apps) && 
                                                     currentUser.settings.dock_pinned_apps.length > 0;
                        
                        console.log('[Login] 后端是否有固定应用:', backendHasPinnedApps);
                        console.log('[Login] 本地固定应用数量:', parsed.length);
                        
                        if (!backendHasPinnedApps && parsed.length > 0) {
                            console.log('[Login] 开始同步本地固定应用到后端...');
                            if (window.UserApi) {
                                const res = await UserApi.updateProfile({
                                    settings: { dock_pinned_apps: parsed }
                                });
                                console.log('[Login] 同步响应:', res);
                                
                                // 使用后端返回的数据更新 Store
                                if (res && res.data) {
                                    const updatedUser = { ...currentUser, ...res.data };
                                    Store.set('user', updatedUser);
                                    console.log('[Login] Store 用户已更新:', updatedUser);
                                    console.log('[Login] 更新后的 settings:', updatedUser.settings);
                                } else {
                                    // 如果返回格式不同，手动更新 settings
                                    const newSettings = { ...(currentUser.settings || {}), dock_pinned_apps: parsed };
                                    Store.set('user', { ...currentUser, settings: newSettings });
                                    console.log('[Login] Store 用户 settings 手动更新:', newSettings);
                                }
                            }
                        } else {
                            console.log('[Login] 跳过同步：后端已有固定应用或本地为空');
                        }
                    } catch (e) {
                        console.warn('[Login] 同步本地固定应用失败:', e);
                    }
                }

                Toast.success('登录成功');
                Router.push('/desktop');
            } else {
                const phone = form.phone?.value.trim();
                const confirmPassword = form.confirm_password?.value;
                const res = await AuthApi.register({
                    username,
                    password,
                    confirm_password: confirmPassword,
                    phone
                });

                // 显示后端返回的消息（包含审核提示）
                Toast.success(res.message || '注册成功，请等待管理员审核');
                this.setState({ mode: 'login', error: '' });
            }
        } catch (error) {
            this.setState({ error: error.message });
        } finally {
            this.setState({ loading: false });
        }
    }

    render() {
        const { mode, loading, error } = this.state;
        const isLogin = mode === 'login';

        return `
            <div class="login-page">
                <div class="login-box">
                    <div class="login-header">
                        <div class="login-logo">🌐</div>
                        <h1 class="login-title gradient-text">${Store.get('appName')}</h1>
                        <p class="login-subtitle">${isLogin ? '欢迎回来' : '创建新账户'}</p>
                    </div>
                    
                    <div class="login-form">
                        <div class="card">
                            <form id="loginForm">
                                ${error ? `<div class="form-error" style="margin-bottom: 16px">${error}</div>` : ''}
                                
                                <div class="form-group">
                                    <label class="form-label">用户名</label>
                                    <input type="text" name="username" class="form-input" 
                                           placeholder="请输入用户名" autocomplete="username" required>
                                </div>
                                
                                ${!isLogin ? `
                                    <div class="form-group">
                                        <label class="form-label">手机号码</label>
                                        <input type="tel" name="phone" class="form-input" 
                                               placeholder="请输入11位手机号码" maxlength="11"
                                               pattern="^1[3-9]\\d{9}$" required>
                                    </div>
                                ` : ''}
                                
                                <div class="form-group">
                                    <label class="form-label">密码</label>
                                    <input type="password" name="password" class="form-input" 
                                           placeholder="${isLogin ? '请输入密码' : '至少8位，含大写/小写/数字/特殊字符'}" 
                                           minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required>
                                </div>
                                
                                ${!isLogin ? `
                                    <div class="form-group">
                                        <label class="form-label">确认密码</label>
                                        <input type="password" name="confirm_password" class="form-input" 
                                               placeholder="请再次输入密码" minlength="8" 
                                               autocomplete="new-password" required>
                                    </div>
                                ` : ''}
                                
                                <button type="submit" class="btn btn-primary btn-lg" 
                                        ${loading ? 'disabled' : ''}>
                                    ${loading ? '处理中...' : (isLogin ? '登录' : '注册')}
                                </button>
                            </form>
                        </div>
                    </div>
                    
                    <div class="login-footer">
                        ${isLogin ? '还没有账号？' : '已有账号？'}
                        <a href="javascript:void(0)" id="toggleMode">
                            ${isLogin ? '立即注册' : '去登录'}
                        </a>
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
        // 表单提交
        const form = this.$('#loginForm');
        if (form && !form._bindedLogin) {
            form._bindedLogin = true;
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // 切换模式
        const toggleBtn = this.$('#toggleMode');
        if (toggleBtn && !toggleBtn._bindedLogin) {
            toggleBtn._bindedLogin = true;
            toggleBtn.addEventListener('click', () => this.toggleMode());
        }
    }
}


/**
 * 登录过期弹窗组件
 * 当 Token 失效且无法刷新时，原地弹出登录框，避免跳转导致的数据丢失
 */

const AuthModal = {
    modal: null,
    isShown: false,

    init() {
        if (this.modal) return;

        // 创建 DOM 结构
        const div = document.createElement('div');
        div.className = 'modal auth-modal';
        div.id = 'auth-modal';
        div.style.zIndex = '9999'; // 确保在最上层
        div.innerHTML = `
            <div class="modal-content" style="max-width: 360px;">
                <div class="modal-header">
                    <h3>登录会话已过期</h3>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 20px; color: var(--text-secondary);">为了保护您的数据安全，请重新验证身份。</p>
                    <form id="auth-modal-form" onsubmit="return false;">
                        <div class="form-group">
                            <label>账号</label>
                            <input type="text" name="username" class="form-control" placeholder="用户名/手机号" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label>密码</label>
                            <input type="password" name="password" class="form-control" placeholder="请输入密码" required autocomplete="current-password">
                        </div>
                        <div id="auth-modal-error" style="color: var(--danger); font-size: 14px; margin-bottom: 10px; display: none;"></div>
                        <div class="form-actions" style="justify-content: flex-end; margin-top: 20px;">
                            <button type="button" class="btn btn-secondary" onclick="AuthModal.cancel()">放弃并退出</button>
                            <button type="submit" class="btn btn-primary" id="auth-modal-submit">重新登录</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        this.modal = div;

        // 绑定事件
        const form = div.querySelector('#auth-modal-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
    },

    show() {
        this.init();
        if (this.isShown) return;

        // 自动填充用户名（如果 Store 中有）
        const user = Store.get('user');
        if (user && user.username) {
            const usernameInput = this.modal.querySelector('input[name="username"]');
            if (usernameInput) usernameInput.value = user.username;
        }

        this.modal.classList.add('open');
        this.isShown = true;

        // 聚焦密码框
        setTimeout(() => {
            const pwdInput = this.modal.querySelector('input[name="password"]');
            if (pwdInput) pwdInput.focus();
        }, 100);
    },

    cancel() {
        // 用户放弃登录，跳转到登录页（彻底清除状态）
        this.hide();
        Store.clearAuth();
        Router.push('/login');
    },

    hide() {
        if (this.modal) {
            this.modal.classList.remove('open');
            // 清空密码
            const pwdInput = this.modal.querySelector('input[name="password"]');
            if (pwdInput) pwdInput.value = '';

            // 隐藏错误
            const errorDiv = this.modal.querySelector('#auth-modal-error');
            if (errorDiv) errorDiv.style.display = 'none';
        }
        this.isShown = false;
    },

    async login() {
        const form = this.modal.querySelector('form');
        const username = form.username.value.trim();
        const password = form.password.value;
        const submitBtn = this.modal.querySelector('#auth-modal-submit');
        const errorDiv = this.modal.querySelector('#auth-modal-error');

        if (!username || !password) return;

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = '登录中...';
            errorDiv.style.display = 'none';

            // 使用 Api.post 但跳过全局 401 处理（防止无限循环）
            // 注意：login 接口接收 JSON 格式
            const res = await Api.post('/auth/login', {
                username,
                password
            }, {
                skip401Handler: true // 关键：防止递归触发 AuthModal
            });

            if (res && res.code === 200 && res.data) {
                const { access_token, user, refresh_token } = res.data;
                // 更新 Store 和 LocalStorage
                Store.setAuth(access_token, user, refresh_token);

                if (typeof Toast !== 'undefined') Toast.success('会话已恢复');

                // 关闭弹窗
                this.hide();
            } else {
                throw new Error(res.message || '登录失败');
            }
        } catch (e) {
            errorDiv.textContent = e.message || '登录失败，请检查账号密码';
            errorDiv.style.display = 'block';

            // 如果是 Api.post 抛出的 Error 对象（非 200 响应）
            // 在 skip401Handler=true 时，Api.post 仍然会抛出 Error 吗？
            // 看 api.js: if (!response.ok) ... throw err;
            // 是的，Api 在非 200 时会抛出 Error。
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '重新登录';
        }
    }
};

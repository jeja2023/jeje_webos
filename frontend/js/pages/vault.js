/**
 * 密码箱页面
 * 安全存储和管理用户名密码
 */

// 密码箱主页面
class VaultPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            view: 'list', // list, categories, detail
            items: [],
            categories: [],
            stats: {},
            total: 0,
            page: 1,
            size: 20,
            loading: true,
            unlocked: false,
            hasMasterKey: false,
            isLocked: false,
            currentCategoryId: null,
            keyword: '',
            selectedItem: null,
            showPassword: {}
        };
        // 存储主密码（仅在内存中，页面刷新后需重新输入）
        this._masterPassword = null;

        // 自动锁定配置（5分钟 = 300000毫秒）
        this._autoLockTimeout = 5 * 60 * 1000;
        this._autoLockTimer = null;
        this._activityHandler = this._resetAutoLockTimer.bind(this);
    }

    // 启动自动锁定定时器
    _startAutoLockTimer() {
        this._resetAutoLockTimer();
        // 监听用户活动
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, this._activityHandler, { passive: true });
        });
    }

    // 停止自动锁定定时器
    _stopAutoLockTimer() {
        if (this._autoLockTimer) {
            clearTimeout(this._autoLockTimer);
            this._autoLockTimer = null;
        }
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
            document.removeEventListener(event, this._activityHandler);
        });
    }

    // 重置自动锁定定时器
    _resetAutoLockTimer() {
        if (this._autoLockTimer) {
            clearTimeout(this._autoLockTimer);
        }
        if (this.state.unlocked) {
            this._autoLockTimer = setTimeout(() => {
                this._autoLock();
            }, this._autoLockTimeout);
        }
    }

    // 自动锁定
    _autoLock() {
        if (this.state.unlocked) {
            this.lock();
            Toast.warning('因长时间未操作，密码箱已自动锁定');
        }
    }

    async loadData(options = {}) {
        // 如果没有强制不显示loading，则显示
        if (!options.silent) {
            this.setState({ loading: true });
        }

        try {
            // 检查主密码状态
            const statusRes = await Api.get('/vault/master/status');
            const hasMasterKey = statusRes.data?.has_master_key || false;
            const isLocked = statusRes.data?.is_locked || false;

            this.setState({ hasMasterKey, isLocked });

            if (!hasMasterKey) {
                this.setState({ loading: false });
                return;
            }

            // 加载分类
            const catsRes = await Api.get('/vault/categories');
            const categories = catsRes.data || [];

            // 构建条目查询参数
            const itemParams = {
                page: options.page || parseInt(this.state.page) || 1,
                size: options.size || parseInt(this.state.size) || 20
            };

            // 优先使用传入的 categoryId，否则使用 state 中的
            const currentCatId = options.categoryId !== undefined ? options.categoryId : this.state.currentCategoryId;

            if (currentCatId !== null && currentCatId !== undefined) {
                itemParams.category_id = currentCatId;
            }

            // 搜索关键词
            const keyword = options.keyword !== undefined ? options.keyword : this.state.keyword;
            if (keyword) {
                itemParams.keyword = keyword;
            }

            // 加载条目列表
            const itemsRes = await Api.get('/vault/items', itemParams, {
                headers: this._masterPassword ? { 'X-Vault-Key': this._masterPassword } : {}
            });

            let items = [];
            let total = 0;
            if (itemsRes && itemsRes.data) {
                items = itemsRes.data.items || [];
                total = itemsRes.data.total || 0;
            } else if (itemsRes && Array.isArray(itemsRes.items)) {
                items = itemsRes.items;
                total = itemsRes.total || items.length;
            }

            // 加载统计
            const statsRes = await Api.get('/vault/stats');
            const stats = statsRes.data || {};

            this.setState({
                categories,
                items,
                total,
                stats,
                loading: false
            });
        } catch (error) {
            Toast.error('加载数据失败: ' + (error.message || '未知错误'));
            this.setState({ loading: false });
        }
    }

    async unlock() {
        const password = await this.showPasswordPrompt('请输入主密码', '输入您的密码箱主密码以解锁', false, async (pwd) => {
            try {
                const res = await Api.post('/vault/master/verify', { master_password: pwd });
                return res.data?.verified === true;
            } catch (e) {
                return e.message || '密码错误';
            }
        });

        if (password) {
            this._masterPassword = password;
            this.setState({ unlocked: true, isLocked: false }); // 成功解锁，确保清除锁定标记
            this._startAutoLockTimer();
            Toast.success('密码箱已解锁');
            // 解锁后重新加载数据
            await this.loadData();
        } else {
            // 如果用户取消了输入（返回 null），检查一下是否是因为被锁定导致的
            try {
                const statusRes = await Api.get('/vault/master/status');
                if (statusRes.data?.is_locked) {
                    this.setState({
                        isLocked: true,
                        unlocked: false,
                        view: 'list' // 重置视图
                    });
                }
            } catch (e) {
                console.error('检查状态失败:', e);
            }
        }
    }

    lock() {
        this._stopAutoLockTimer();
        this._masterPassword = null;
        this.setState({ unlocked: false, selectedItem: null, showPassword: {} });
        Toast.info('密码箱已锁定');
    }

    async setupMasterKey() {
        const password = await this.showPasswordPrompt('设置主密码', '强密码要求：至少8位，包含大小写字母和数字', true);
        if (!password) return;

        try {
            const res = await Api.post('/vault/master/create', { master_password: password });
            this._masterPassword = password;
            this.setState({ hasMasterKey: true, unlocked: true });
            this._startAutoLockTimer();

            // 展示恢复码弹窗
            const recoveryKey = res.data?.recovery_key;
            if (recoveryKey) {
                await this.showRecoveryKeyModal(recoveryKey, true);
            }

            Toast.success('主密码设置成功');
            await this.loadData();
        } catch (error) {
            Toast.error('设置失败: ' + (error.message || '未知错误'));
        }
    }

    showRecoveryKeyModal(recoveryKey, isNew = false) {
        return new Promise((resolve) => {
            new Modal({
                title: isNew ? '🔑 请保存您的恢复码' : '🔑 新的恢复码',
                content: `
                    <div style="text-align: center;">
                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                            <p style="color: var(--color-danger); font-weight: 600; margin-bottom: 8px;">
                                ⚠️ 重要提示
                            </p>
                            <p style="font-size: 13px; color: var(--color-text-secondary); margin: 0;">
                                恢复码是您忘记主密码时恢复账户的唯一方式。<br>
                                请立即将其保存到安全的地方（如打印存放、密码管理器等）。
                            </p>
                        </div>
                        
                        <div style="background: var(--color-bg-tertiary); border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                            <p style="font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 8px;">您的恢复码</p>
                            <p id="recovery-key-display" style="font-family: monospace; font-size: 18px; font-weight: 700; letter-spacing: 2px; color: var(--color-primary); word-break: break-all; margin: 0;">
                                ${recoveryKey}
                            </p>
                        </div>
                        
                        <button type="button" id="btn-copy-recovery" class="btn btn-primary" style="width: 100%;">
                            <i class="ri-file-copy-line"></i> 复制恢复码
                        </button>
                    </div>
                `,
                confirmText: '我已保存',
                showCancel: false,
                onConfirm: () => {
                    resolve(true);
                    return true;
                }
            }).show();

            // 绑定复制按钮
            setTimeout(() => {
                const copyBtn = document.getElementById('btn-copy-recovery');
                if (copyBtn) {
                    copyBtn.addEventListener('click', async () => {
                        try {
                            await navigator.clipboard.writeText(recoveryKey);
                            Toast.success('恢复码已复制到剪贴板');
                            copyBtn.innerHTML = '<i class="ri-check-line"></i> 已复制';
                            copyBtn.disabled = true;
                        } catch (e) {
                            Toast.error('复制失败，请手动复制');
                        }
                    });
                }
            }, 100);
        });
    }

    showPasswordPrompt(title, placeholder, isSetup = false, onVerify = null) {
        const uniqueId = Date.now();
        return new Promise((resolve) => {
            new Modal({
                title: title,
                content: `
                    <form class="vault-password-form" autocomplete="off">
                        <div class="form-group">
                            <label>${placeholder}</label>
                            <div class="password-input-wrapper">
                                <input type="password" 
                                       class="form-input vault-master-pwd" 
                                       placeholder="请输入密码"
                                       ${isSetup ? 'minlength="6"' : ''}
                                       required
                                       autocomplete="new-password">
                                <button type="button" class="toggle-pwd-btn vault-toggle-pwd">
                                    <i class="ri-eye-line"></i>
                                </button>
                            </div>
                        </div>
                        ${isSetup ? `
                        <div class="password-strength-indicator" style="margin: 12px 0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 12px; color: var(--color-text-tertiary);">密码强度</span>
                                <span class="strength-text" style="font-size: 12px; font-weight: 500;">--</span>
                            </div>
                            <div style="background: var(--color-bg-tertiary); border-radius: 4px; height: 6px; overflow: hidden;">
                                <div class="strength-bar" style="height: 100%; width: 0%; transition: all 0.3s ease;"></div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>确认密码</label>
                            <input type="password" 
                                   class="form-input vault-master-pwd-confirm" 
                                   placeholder="请再次输入密码"
                                   minlength="8"
                                   required
                                   autocomplete="new-password">
                        </div>
                        <div class="password-requirements" style="font-size: 12px; color: var(--color-text-tertiary); margin-top: 8px; line-height: 1.4;">
                            <p style="margin-bottom: 4px;"><strong>密码必须满足：</strong></p>
                            <ul style="list-style: disc; padding-left: 16px;">
                                <li id="req-length" style="color: var(--color-text-tertiary);">长度至少 8 位</li>
                                <li id="req-upper" style="color: var(--color-text-tertiary);">包含大写字母 (A-Z)</li>
                                <li id="req-lower" style="color: var(--color-text-tertiary);">包含小写字母 (a-z)</li>
                                <li id="req-digit" style="color: var(--color-text-tertiary);">包含数字 (0-9)</li>
                            </ul>
                        </div>
                        ` : ''}
                        <div class="form-error" style="
                            color: #ef4444; 
                            background: rgba(239, 68, 68, 0.1); 
                            border: 1px solid rgba(239, 68, 68, 0.2); 
                            padding: 8px 12px; 
                            border-radius: 6px; 
                            font-size: 13px; 
                            margin-top: 16px; 
                            display: none;
                            text-align: center;
                            font-weight: 500;
                        "></div>
                    </form>
                `,
                confirmText: isSetup ? '设置' : '解锁',
                onConfirm: async () => {
                    const modal = document.querySelector('.modal-overlay:last-child');
                    const pwdInput = modal?.querySelector('.vault-master-pwd');
                    const pwd = pwdInput?.value || '';
                    const errorEl = modal?.querySelector('.form-error');

                    const showError = (msg) => {
                        if (errorEl) {
                            errorEl.innerHTML = msg; // 使用 innerHTML 以支持插入按钮
                            errorEl.style.display = 'block';

                            // 如果检测到“锁定”关键词，动态显示恢复按钮
                            if (msg.includes('锁定')) {
                                const actionHtml = `
                                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(239, 68, 68, 0.3);">
                                        <button class="btn btn-primary btn-sm" id="btn-go-recovery-inline" style="width: 100%; height: 36px; font-weight: 600;">
                                            <i class="ri-key-2-line"></i> 立即使用恢复码重置
                                        </button>
                                    </div>
                                `;
                                errorEl.insertAdjacentHTML('beforeend', actionHtml);

                                // 彻底移除/禁用无效的解锁按钮（强制使用恢复码）
                                // 修正选择器以匹配 Modal 组件的 data-action
                                const confirmBtn = modal?.querySelector('[data-action="confirm"]');
                                if (confirmBtn) {
                                    confirmBtn.disabled = true;
                                    confirmBtn.style.opacity = '0.5';
                                    confirmBtn.style.cursor = 'not-allowed';
                                    confirmBtn.innerHTML = '<i class="ri-lock-line"></i> 已锁定';
                                    // 根据用户要求，彻底移除以绝后患，或禁用
                                    // confirmBtn.remove(); 
                                }

                                // 隐藏输入框区域，避免误导
                                const inputGroup = modal?.querySelector('.form-group');
                                if (inputGroup) {
                                    inputGroup.style.display = 'none';
                                }

                                // 更新标题
                                const modalTitle = modal?.querySelector('.modal-title');
                                if (modalTitle) modalTitle.textContent = '账户已锁定';

                                // 重要：立即在主页面状态中标记已锁定，强制登出（解锁状态失效）并隐藏所有敏感内容
                                this._masterPassword = null;
                                this._stopAutoLockTimer();
                                this.setState({
                                    isLocked: true,
                                    unlocked: false,
                                    selectedItem: null,
                                    view: 'list'
                                });

                                // 绑定恢复按钮点击事件
                                modal?.querySelector('#btn-go-recovery-inline')?.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    // 1. 先彻底关闭当前的密码提示弹窗
                                    const closeBtn = modal?.querySelector('.btn-close-modal') || modal?.querySelector('.btn-cancel');
                                    if (closeBtn) {
                                        closeBtn.click();
                                    } else {
                                        modal?.remove(); // 兜底方案
                                    }

                                    // 2. 立即触发重置/恢复流程
                                    this.resetVault();
                                });
                            }

                            // 强烈的抖动动画效果
                            errorEl.animate([
                                { transform: 'translateX(0)' },
                                { transform: 'translateX(-4px)' },
                                { transform: 'translateX(4px)' },
                                { transform: 'translateX(0)' }
                            ], { duration: 200, iterations: 2 });
                        }
                    };

                    if (!pwd) {
                        showError('请输入密码');
                        pwdInput?.focus();
                        return false;
                    }

                    if (isSetup) {
                        const confirm = modal?.querySelector('.vault-master-pwd-confirm')?.value || '';
                        if (pwd !== confirm) {
                            showError('两次密码输入不一致');
                            return false;
                        }
                        if (pwd.length < 8) {
                            showError('密码长度至少需要8位');
                            return false;
                        }
                        // 强密码复杂度校验
                        if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
                            showError('密码必须包含大写字母、小写字母和数字');
                            return false;
                        }
                    } else if (typeof onVerify === 'function') {
                        // 如果传入了验证函数（如解锁、验证旧密码），在这里直接验证
                        const confirmBtn = modal?.querySelector('[data-action="confirm"]');
                        const originalText = confirmBtn?.innerHTML;
                        if (confirmBtn) {
                            confirmBtn.disabled = true;
                            confirmBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 验证中...';
                        }

                        try {
                            const result = await onVerify(pwd);
                            if (result !== true) {
                                const msg = typeof result === 'string' ? result : '密码错误';
                                showError(msg);
                                // 如果没有被锁定，才恢复按钮状态
                                if (confirmBtn && !msg.includes('锁定')) {
                                    confirmBtn.disabled = false;
                                    confirmBtn.innerHTML = originalText;
                                }
                                return false;
                            }
                        } catch (e) {
                            const msg = e.message || '未知错误';
                            showError('验证出错: ' + msg);
                            if (confirmBtn && !msg.includes('锁定')) {
                                confirmBtn.disabled = false;
                                confirmBtn.innerHTML = originalText;
                            }
                            return false;
                        }
                    }

                    resolve(pwd);
                    return true;
                },
                onCancel: () => {
                    resolve(null);
                }
            }).show();

            // 绑定密码显示切换和输入监听
            setTimeout(() => {
                const modal = document.querySelector('.modal-overlay:last-child');
                const errorEl = modal?.querySelector('.form-error');
                const inputs = modal?.querySelectorAll('input');

                inputs?.forEach(input => {
                    input.addEventListener('input', () => {
                        if (errorEl) errorEl.style.display = 'none';
                    });
                });

                // 密码强度检测（仅设置模式）
                const pwdInput = modal?.querySelector('.vault-master-pwd');
                const strengthBar = modal?.querySelector('.strength-bar');
                const strengthText = modal?.querySelector('.strength-text');
                const reqLength = modal?.querySelector('#req-length');
                const reqUpper = modal?.querySelector('#req-upper');
                const reqLower = modal?.querySelector('#req-lower');
                const reqDigit = modal?.querySelector('#req-digit');

                if (pwdInput && strengthBar) {
                    pwdInput.addEventListener('input', () => {
                        const pwd = pwdInput.value;
                        let score = 0;

                        // 检测各项要求
                        const hasLength = pwd.length >= 8;
                        const hasUpper = /[A-Z]/.test(pwd);
                        const hasLower = /[a-z]/.test(pwd);
                        const hasDigit = /[0-9]/.test(pwd);
                        const hasSymbol = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pwd);

                        // 更新要求列表样式
                        if (reqLength) reqLength.style.color = hasLength ? 'var(--color-success)' : 'var(--color-text-tertiary)';
                        if (reqUpper) reqUpper.style.color = hasUpper ? 'var(--color-success)' : 'var(--color-text-tertiary)';
                        if (reqLower) reqLower.style.color = hasLower ? 'var(--color-success)' : 'var(--color-text-tertiary)';
                        if (reqDigit) reqDigit.style.color = hasDigit ? 'var(--color-success)' : 'var(--color-text-tertiary)';

                        // 计算分数
                        if (pwd.length >= 8) score += 1;
                        if (pwd.length >= 12) score += 1;
                        if (pwd.length >= 16) score += 1;
                        if (hasUpper) score += 1;
                        if (hasLower) score += 1;
                        if (hasDigit) score += 1;
                        if (hasSymbol) score += 1;

                        // 更新强度条
                        let width, color, text;
                        if (pwd.length === 0) {
                            width = '0%'; color = 'transparent'; text = '--';
                        } else if (score <= 2) {
                            width = '25%'; color = '#ef4444'; text = '弱';
                        } else if (score <= 4) {
                            width = '50%'; color = '#f97316'; text = '中等';
                        } else if (score <= 6) {
                            width = '75%'; color = '#22c55e'; text = '强';
                        } else {
                            width = '100%'; color = '#10b981'; text = '非常强';
                        }

                        strengthBar.style.width = width;
                        strengthBar.style.background = color;
                        if (strengthText) {
                            strengthText.textContent = text;
                            strengthText.style.color = color === 'transparent' ? 'var(--color-text-tertiary)' : color;
                        }
                    });
                }

                const toggleBtn = modal?.querySelector('.vault-toggle-pwd');
                const input = modal?.querySelector('.vault-master-pwd');
                if (toggleBtn && input) {
                    toggleBtn.addEventListener('click', () => {
                        const icon = toggleBtn.querySelector('i');
                        if (input.type === 'password') {
                            input.type = 'text';
                            icon.className = 'ri-eye-off-line';
                        } else {
                            input.type = 'password';
                            icon.className = 'ri-eye-line';
                        }
                    });
                }
            }, 100);
        });
    }

    async changeMasterKey() {
        if (!this._masterPassword) {
            Toast.error('请先解锁密码箱');
            return;
        }

        const oldPwd = await this.showPasswordPrompt('验证身份', '请输入当前主密码', false, (pwd) => {
            return pwd === this._masterPassword;
        });
        if (!oldPwd) return;

        const newPwd = await this.showPasswordPrompt('修改主密码', '强密码要求：至少8位，包含大小写字母和数字', true);
        if (!newPwd) return;

        try {
            await Api.post('/vault/master/change', {
                old_password: oldPwd,
                new_password: newPwd
            });
            this._masterPassword = newPwd;
            Toast.success('主密码修改成功');
        } catch (error) {
            Toast.error('修改失败: ' + (error.message || '未知错误'));
        }
    }

    async resetVault() {
        // 先显示选项弹窗
        const choice = await new Promise(resolve => {
            new Modal({
                title: '🔑 忘记主密码',
                content: `
                    <div style="text-align: center;">
                        <p style="margin-bottom: 20px; color: var(--color-text-secondary);">
                            请选择恢复方式：
                        </p>
                        
                        <button type="button" id="btn-use-recovery" class="btn btn-primary" style="width: 100%; margin-bottom: 12px;">
                            <i class="ri-key-line"></i> 使用恢复码恢复
                        </button>
                        <p style="font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 20px;">
                            如果您保存了恢复码，可以使用它重置主密码而不丢失数据
                        </p>
                        
                        <button type="button" id="btn-reset-all" class="btn btn-danger-ghost" style="width: 100%;">
                            <i class="ri-delete-bin-line"></i> 彻底重置
                        </button>
                        <p style="font-size: 12px; color: var(--color-danger); margin-top: 8px;">
                            ⚠️ 这将删除所有数据，无法恢复
                        </p>
                    </div>
                `,
                confirmText: '关闭',
                showCancel: false,
                onConfirm: () => {
                    resolve(null);
                    return true;
                }
            }).show();

            setTimeout(() => {
                const closeModal = () => {
                    // 直接移除Modal DOM元素，确保彻底关闭
                    const overlay = document.querySelector('.modal-overlay:last-child');
                    if (overlay) overlay.remove();
                };

                document.getElementById('btn-use-recovery')?.addEventListener('click', () => {
                    closeModal();
                    resolve('recover');
                });
                document.getElementById('btn-reset-all')?.addEventListener('click', () => {
                    closeModal();
                    resolve('reset');
                });
            }, 100);
        });

        if (choice === 'recover') {
            await this.recoverWithRecoveryKey();
        } else if (choice === 'reset') {
            await this.confirmResetVault();
        }
    }

    async recoverWithRecoveryKey() {
        // 输入恢复码
        const recoveryKey = await new Promise(resolve => {
            new Modal({
                title: '🔑 使用恢复码恢复',
                content: `
                    <form id="recovery-form">
                        <div class="form-group">
                            <label>恢复码</label>
                            <input type="text" class="form-input" id="input-recovery-key" 
                                   placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                                   style="font-family: monospace; text-transform: uppercase;"
                                   required>
                        </div>
                        <div class="form-error" style="
                            color: #ef4444; 
                            background: rgba(239, 68, 68, 0.1); 
                            border: 1px solid rgba(239, 68, 68, 0.2);
                            padding: 8px 12px;
                            border-radius: 6px;
                            margin-top: 12px;
                            display: none;
                            text-align: center;
                        "></div>
                    </form>
                `,
                confirmText: '下一步',
                onConfirm: () => {
                    const key = document.getElementById('input-recovery-key')?.value?.trim();
                    if (!key) {
                        const errEl = document.querySelector('.form-error');
                        if (errEl) {
                            errEl.textContent = '请输入恢复码';
                            errEl.style.display = 'block';
                        }
                        return false;
                    }
                    resolve(key);
                    return true;
                },
                onCancel: () => resolve(null)
            }).show();
        });

        if (!recoveryKey) return;

        // 输入新密码
        const newPwd = await this.showPasswordPrompt('设置新主密码', '强密码要求：至少8位，包含大小写字母和数字', true);
        if (!newPwd) return;

        try {
            const res = await Api.post('/vault/master/recover', {
                recovery_key: recoveryKey,
                new_password: newPwd
            });

            this._masterPassword = newPwd;
            this.setState({ unlocked: true });
            this._startAutoLockTimer();

            // 展示新的恢复码
            const newRecoveryKey = res.data?.recovery_key;
            if (newRecoveryKey) {
                await this.showRecoveryKeyModal(newRecoveryKey, false);
            }

            Toast.success('主密码重置成功');
            await this.loadData();
        } catch (error) {
            Toast.error('恢复失败: ' + (error.message || '恢复码错误'));
        }
    }

    async confirmResetVault() {
        const confirmed = await new Promise(resolve => {
            new Modal({
                title: '⚠️ 危险：重置密码箱',
                content: `
                    <div style="color: var(--color-danger);">
                        <p style="margin-bottom: 10px;"><strong>注意：此操作不可撤销！</strong></p>
                        <p>重置密码箱将会：</p>
                        <ul style="list-style: disc; padding-left: 20px; margin: 10px 0;">
                            <li>永久删除所有已保存的密码条目</li>
                            <li>删除所有分类</li>
                            <li>清除当前的主密码</li>
                        </ul>
                        <p>您确定要彻底删除所有数据并重置吗？</p>
                    </div>
                `,
                confirmText: '确认重置',
                confirmType: 'danger',
                onConfirm: () => {
                    resolve(true);
                    return true;
                },
                onCancel: () => resolve(false)
            }).show();
        });

        if (!confirmed) return;

        try {
            await Api.post('/vault/master/reset');
            this._masterPassword = null;
            this.setState({
                hasMasterKey: false,
                unlocked: false,
                items: [],
                categories: [],
                stats: {}
            });
            Toast.success('密码箱已重置，数据已清除');
        } catch (error) {
            Toast.error('重置失败: ' + (error.message || '未知错误'));
        }
    }

    async viewItem(itemId) {
        if (!this.state.unlocked) {
            Toast.warning('请先解锁密码箱');
            return;
        }

        try {
            const res = await Api.get(`/vault/items/${itemId}`, {}, {
                headers: { 'X-Vault-Key': this._masterPassword }
            });
            this.setState({ selectedItem: res.data, view: 'detail' });
        } catch (error) {
            Toast.error('获取详情失败');
        }
    }

    async toggleStar(itemId, e) {
        e.stopPropagation();
        try {
            await Api.put(`/vault/items/${itemId}/star`);
            await this.loadData();
        } catch (error) {
            Toast.error('操作失败');
        }
    }

    async deleteItem(itemId) {
        const confirmed = await Modal.confirm('确认删除', '确定要删除这个密码条目吗？此操作不可恢复。');
        if (!confirmed) return;

        try {
            await Api.delete(`/vault/items/${itemId}`);
            Toast.success('删除成功');
            this.setState({ selectedItem: null, view: 'list' });
            await this.loadData();
        } catch (error) {
            Toast.error('删除失败');
        }
    }

    showItemModal(item = null) {
        if (!this.state.unlocked) {
            Toast.warning('请先解锁密码箱');
            return;
        }

        const isEdit = !!item;
        const { categories } = this.state;

        new Modal({
            title: isEdit ? '编辑密码' : '添加密码',
            content: `
                <form id="vault-item-form" autocomplete="off">
                    <div class="form-group">
                        <label>标题 <span class="required">*</span></label>
                        <input type="text" class="form-input" name="title" 
                               value="${isEdit ? Utils.escapeHtml(item.title) : ''}" 
                               placeholder="例如：GitHub" required>
                    </div>
                    <div class="form-group">
                        <label>网站地址</label>
                        <input type="text" class="form-input" name="website" 
                               value="${isEdit ? Utils.escapeHtml(item.website || '') : ''}" 
                               placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label>用户名 <span class="required">*</span></label>
                        <input type="text" class="form-input" name="username" 
                               value="${isEdit ? Utils.escapeHtml(item.username || '') : ''}" 
                               placeholder="用户名/邮箱/手机号" required autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>密码 <span class="required">*</span></label>
                        <div class="password-input-wrapper">
                            <input type="password" class="form-input" name="password" id="item-pwd"
                                   value="${isEdit ? Utils.escapeHtml(item.password || '') : ''}" 
                                   placeholder="密码" required autocomplete="new-password">
                            <button type="button" class="toggle-pwd-btn" id="toggle-item-pwd">
                                <i class="ri-eye-line"></i>
                            </button>
                            <button type="button" class="generate-pwd-btn" id="generate-pwd" title="生成随机密码">
                                <i class="ri-refresh-line"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>分类</label>
                        <select class="form-select" name="category_id">
                            <option value="">未分类</option>
                            ${categories.map(c => `
                                <option value="${c.id}" ${isEdit && item.category_id === c.id ? 'selected' : ''}>
                                    ${c.icon} ${Utils.escapeHtml(c.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>备注</label>
                        <textarea class="form-input" name="notes" rows="3" 
                                  placeholder="可选的备注信息">${isEdit ? Utils.escapeHtml(item.notes || '') : ''}</textarea>
                    </div>
                </form>
            `,
            confirmText: isEdit ? '保存' : '添加',
            onConfirm: async () => {
                const form = document.getElementById('vault-item-form');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    website: form.website.value.trim() || null,
                    username: form.username.value.trim(),
                    password: form.password.value,
                    notes: form.notes.value.trim() || null,
                    category_id: form.category_id.value ? parseInt(form.category_id.value) : null
                };

                try {
                    if (isEdit) {
                        await Api.put(`/vault/items/${item.id}`, data, {
                            headers: { 'X-Vault-Key': this._masterPassword }
                        });
                        Toast.success('保存成功');
                    } else {
                        await Api.post('/vault/items', data, {
                            headers: { 'X-Vault-Key': this._masterPassword }
                        });
                        Toast.success('添加成功');
                    }
                    await this.loadData();
                    this.setState({ selectedItem: null, view: 'list' });
                    return true;
                } catch (error) {
                    Toast.error((isEdit ? '保存' : '添加') + '失败: ' + (error.message || '未知错误'));
                    return false;
                }
            }
        }).show();

        // 绑定密码显示/生成按钮
        setTimeout(() => {
            const toggleBtn = document.getElementById('toggle-item-pwd');
            const generateBtn = document.getElementById('generate-pwd');
            const pwdInput = document.getElementById('item-pwd');

            if (toggleBtn && pwdInput) {
                toggleBtn.addEventListener('click', () => {
                    const icon = toggleBtn.querySelector('i');
                    if (pwdInput.type === 'password') {
                        pwdInput.type = 'text';
                        icon.className = 'ri-eye-off-line';
                    } else {
                        pwdInput.type = 'password';
                        icon.className = 'ri-eye-line';
                    }
                });
            }

            if (generateBtn && pwdInput) {
                generateBtn.addEventListener('click', async () => {
                    try {
                        const res = await Api.post('/vault/generate', {
                            length: 16,
                            include_uppercase: true,
                            include_lowercase: true,
                            include_numbers: true,
                            include_symbols: true
                        });
                        if (res.data?.password) {
                            pwdInput.value = res.data.password;
                            pwdInput.type = 'text';
                            const icon = toggleBtn.querySelector('i');
                            icon.className = 'ri-eye-off-line';
                            Toast.success('已生成强密码');
                        }
                    } catch (e) {
                        Toast.error('生成失败');
                    }
                });
            }
        }, 100);
    }

    showCategoryModal(category = null) {
        const isEdit = !!category;

        new Modal({
            title: isEdit ? '编辑分类' : '添加分类',
            content: `
                <form id="vault-category-form">
                    <div class="form-group">
                        <label>分类名称 <span class="required">*</span></label>
                        <input type="text" class="form-input" name="name" 
                               value="${isEdit ? Utils.escapeHtml(category.name) : ''}" 
                               placeholder="例如：工作账户" required maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>图标</label>
                        <input type="text" class="form-input" name="icon" 
                               value="${isEdit ? category.icon : '📁'}" 
                               placeholder="选择一个emoji" maxlength="50">
                    </div>
                    <div class="form-group">
                        <label>颜色</label>
                        <input type="color" class="form-input" name="color" 
                               value="${isEdit ? category.color : '#3b82f6'}" 
                               style="height: 40px; padding: 4px;">
                    </div>
                </form>
            `,
            confirmText: isEdit ? '保存' : '添加',
            onConfirm: async () => {
                const form = document.getElementById('vault-category-form');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    icon: form.icon.value.trim() || '📁',
                    color: form.color.value
                };

                try {
                    if (isEdit) {
                        await Api.put(`/vault/categories/${category.id}`, data);
                        Toast.success('保存成功');
                    } else {
                        await Api.post('/vault/categories', data);
                        Toast.success('添加成功');
                    }
                    await this.loadData();
                    return true;
                } catch (error) {
                    Toast.error((isEdit ? '保存' : '添加') + '失败');
                    return false;
                }
            }
        }).show();
    }

    async deleteCategory(categoryId) {
        const confirmed = await Modal.confirm('确认删除', '确定要删除这个分类吗？分类下的密码条目将变为未分类。');
        if (!confirmed) return;

        try {
            await Api.delete(`/vault/categories/${categoryId}`);
            Toast.success('删除成功');
            await this.loadData();
        } catch (error) {
            Toast.error('删除失败');
        }
    }

    copyToClipboard(text, label) {
        navigator.clipboard.writeText(text).then(() => {
            Toast.success(`${label}已复制到剪贴板，30秒后自动清除`);

            // 30秒后清除剪贴板（如果浏览器支持写入空字符串来模拟清除）
            setTimeout(() => {
                // 读取剪贴板内容，确认是否还是刚才复制的内容，避免覆盖用户新复制的内容
                navigator.clipboard.readText().then(currentText => {
                    if (currentText === text) {
                        navigator.clipboard.writeText('').catch(() => { });
                        // 可选：提示用户已清除
                        // Toast.info('剪贴板已清除');
                    }
                }).catch(() => {
                    // 如果无法读取（通常是因为没有焦点），则尝试直接写入空
                    navigator.clipboard.writeText('').catch(() => { });
                });
            }, 30000);

        }).catch(() => {
            Toast.error('复制失败');
        });
    }

    togglePasswordVisibility(itemId) {
        const showPassword = { ...this.state.showPassword };
        const willShow = !showPassword[itemId];

        showPassword[itemId] = willShow;
        this.setState({ showPassword });

        // 如果是显示密码，设置30秒后自动隐藏
        if (willShow) {
            // 清除可能已存在的旧定时器
            if (this._pwdTimers && this._pwdTimers[itemId]) {
                clearTimeout(this._pwdTimers[itemId]);
            }
            if (!this._pwdTimers) this._pwdTimers = {};

            this._pwdTimers[itemId] = setTimeout(() => {
                const currentShow = { ...this.state.showPassword };
                if (currentShow[itemId]) {
                    currentShow[itemId] = false;
                    this.setState({ showPassword: currentShow });
                }
                delete this._pwdTimers[itemId];
            }, 30000);
        }
    }

    async exportData() {
        if (!this._masterPassword) {
            Toast.error('请先解锁密码箱');
            return;
        }

        try {
            const res = await Api.get('/vault/export', {}, {
                headers: { 'X-Vault-Key': this._masterPassword }
            });

            const data = res.data;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `密码箱备份_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Toast.success(`导出成功：${data.items?.length || 0}个密码`);
        } catch (error) {
            Toast.error('导出失败: ' + (error.message || '未知错误'));
        }
    }

    async importData() {
        if (!this._masterPassword) {
            Toast.error('请先解锁密码箱');
            return;
        }

        // 创建文件选择器
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // 验证数据格式
                if (!data.items || !Array.isArray(data.items)) {
                    Toast.error('无效的备份文件格式');
                    return;
                }

                // 确认导入
                const confirmed = await new Promise(resolve => {
                    new Modal({
                        title: '📥 确认导入',
                        content: `
                            <div style="text-align: center;">
                                <p>即将导入 <strong>${data.items.length}</strong> 个密码和 <strong>${data.categories?.length || 0}</strong> 个分类</p>
                                <p style="color: var(--color-text-secondary); font-size: 13px; margin-top: 8px;">
                                    已存在的条目（相同标题和网站）将被跳过
                                </p>
                            </div>
                        `,
                        confirmText: '确认导入',
                        onConfirm: () => { resolve(true); return true; },
                        onCancel: () => resolve(false)
                    }).show();
                });

                if (!confirmed) return;

                const res = await Api.post('/vault/import', data, {
                    headers: { 'X-Vault-Key': this._masterPassword }
                });

                Toast.success(`导入完成：${res.data?.imported_items || 0}个密码，${res.data?.skipped_items || 0}个跳过`);
                await this.loadData();
            } catch (error) {
                Toast.error('导入失败: ' + (error.message || '文件解析错误'));
            }
        };

        input.click();
    }

    changePage(page) {
        this.setState({ page }, () => this.loadData({ page }));
    }

    filterByCategory(categoryId) {
        // 确保如果是全部(null)或未分类(0)，处理正确
        const id = (categoryId === 'all' || categoryId === null) ? null : parseInt(categoryId);

        // 切换分类时同步清空搜索框 UI
        const searchInput = this.container?.querySelector('#vault-search');
        if (searchInput) searchInput.value = '';

        // 切换分类时必须重置为列表视图，并清理搜索关键词
        this.setState({
            currentCategoryId: id,
            page: 1,
            view: 'list',
            selectedItem: null,
            keyword: ''
        });

        // 显式传递 categoryId 给 loadData，避免 state 更新延迟
        this.loadData({ categoryId: id, page: 1, keyword: '' });
    }

    search(keyword) {
        // 直接更新状态并调用 loadData，不使用回调（Component 基类不支持）
        this.state.keyword = keyword;
        this.state.page = 1;
        this.loadData({ keyword, page: 1 });
    }

    renderSetupView() {
        return `
            <div class="vault-setup">
                <div class="setup-card">
                    <div class="setup-icon">
                        <i class="ri-shield-keyhole-line"></i>
                    </div>
                    <h2>欢迎使用密码箱</h2>
                    <p class="setup-desc">
                        密码箱使用 AES-256 加密保护您的数据。<br>
                        请设置主密码以开始使用。
                    </p>
                    <div class="setup-features">
                        <div class="feature-item">
                            <i class="ri-lock-line"></i>
                            <span>AES-256 加密</span>
                        </div>
                        <div class="feature-item">
                            <i class="ri-user-line"></i>
                            <span>用户数据隔离</span>
                        </div>
                        <div class="feature-item">
                            <i class="ri-key-line"></i>
                            <span>本地派生密钥</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-lg" id="btn-setup-master">
                        <i class="ri-add-line"></i> 设置主密码
                    </button>
                    <div style="margin-top: 16px;">
                        ${ModuleHelp.createHelpButton('vault', '使用帮助', 'btn-ghost btn-sm')}
                    </div>
                </div>
            </div>
        `;
    }

    renderLockedView() {
        const { isLocked } = this.state;

        return `
            <div class="vault-locked">
                <div class="locked-card ${isLocked ? 'locked-danger' : ''}">
                    <div class="locked-icon">
                        <i class="${isLocked ? 'ri-error-warning-line' : 'ri-lock-2-line'}"></i>
                    </div>
                    <h2>${isLocked ? '账户已锁定' : '密码箱已锁定'}</h2>
                    <p>${isLocked ? '由于主密码尝试次数过多，账户已被锁定。' : '请输入主密码以解锁'}</p>
                    
                    ${isLocked ? `
                        <button class="btn btn-primary btn-lg" id="btn-forgot-password">
                            <i class="ri-key-2-line"></i> 立即使用恢复码重置
                        </button>
                    ` : `
                        <button class="btn btn-primary btn-lg" id="btn-unlock">
                            <i class="ri-lock-unlock-line"></i> 解锁
                        </button>
                    `}
                    <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px; align-items: center;">
                        ${!isLocked ? `
                            <button class="btn btn-danger-ghost btn-sm" id="btn-forgot-password" style="font-size: 13px; opacity: 0.8;">
                                忘记主密码？
                            </button>
                        ` : ''}
                        ${ModuleHelp.createHelpButton('vault', '使用帮助', 'btn-ghost btn-sm')}
                    </div>
                </div>
            </div>
        `;
    }

    renderSidebar() {
        const { categories, stats, currentCategoryId } = this.state;

        return `
            <div class="vault-sidebar">
                <div class="sidebar-section">
                    <div class="sidebar-item ${currentCategoryId === null ? 'active' : ''}" data-filter-category="all">
                        <i class="ri-apps-line"></i>
                        <span>全部密码</span>
                        <span class="badge">${stats.total_items || 0}</span>
                    </div>
                    <div class="sidebar-item ${currentCategoryId === 0 ? 'active' : ''}" data-filter-category="0">
                        <i class="ri-folder-line"></i>
                        <span>未分类</span>
                    </div>
                    <div class="sidebar-item" data-filter-starred>
                        <i class="ri-star-line"></i>
                        <span>收藏</span>
                        <span class="badge">${stats.starred_items || 0}</span>
                    </div>
                </div>
                
                <div class="sidebar-section">
                    <div class="section-header">
                        <span>分类</span>
                        <button class="btn-icon" id="btn-add-category" title="添加分类">
                            <i class="ri-add-line"></i>
                        </button>
                    </div>
                    ${categories.length > 0 ? categories.map(cat => `
                        <div class="sidebar-item category-item ${currentCategoryId === cat.id ? 'active' : ''}" 
                             data-filter-category="${cat.id}">
                            <span class="cat-icon" style="color: ${cat.color}">${cat.icon}</span>
                            <span class="cat-name">${Utils.escapeHtml(cat.name)}</span>
                            <span class="badge">${cat.item_count || 0}</span>
                            <div class="item-actions">
                                <button class="btn-icon btn-xs" data-edit-category="${cat.id}" title="编辑">
                                    <i class="ri-edit-line"></i>
                                </button>
                                <button class="btn-icon btn-xs" data-delete-category="${cat.id}" title="删除">
                                    <i class="ri-delete-bin-line"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') : '<div class="empty-hint">暂无分类</div>'}
                </div>
                
                <div class="sidebar-section" style="margin-top: auto; border-top: 1px solid var(--color-border-secondary); padding-top: 12px;">
                    <div class="sidebar-item" id="btn-export-data">
                        <i class="ri-download-line"></i>
                        <span>导出数据</span>
                    </div>
                    <div class="sidebar-item" id="btn-import-data">
                        <i class="ri-upload-line"></i>
                        <span>导入数据</span>
                    </div>
                    <div class="help-wrapper" style="margin-top: 8px;">
                        ${ModuleHelp.createHelpButton('vault', '使用帮助', 'sidebar-item')}
                    </div>
                </div>
            </div>
        `;
    }

    renderItemsList() {
        const { items, total, page, size, keyword } = this.state;
        const totalPages = Math.ceil(total / size);

        return `
            <div class="vault-list">
                <div class="list-header">
                    <div class="search-group">
                        <input type="text" class="form-input" id="vault-search" 
                               placeholder="搜索密码..." value="${Utils.escapeHtml(keyword)}">
                        <button class="btn btn-primary" id="btn-vault-search">
                            <i class="ri-search-line"></i> 查找
                        </button>
                    </div>
                    <div class="header-actions">
                        <button class="btn btn-secondary" id="btn-change-password" title="修改主密码">
                            <i class="ri-key-2-line"></i> 修改主密码
                        </button>
                        <button class="btn btn-secondary" id="btn-lock" title="锁定">
                            <i class="ri-lock-line"></i> 锁定
                        </button>
                        ${ModuleHelp.createHelpButton('vault', '帮助')}
                        <button class="btn btn-primary" id="btn-add-item">
                            <i class="ri-add-line"></i> 添加密码
                        </button>
                    </div>
                </div>
                
                <div class="items-grid">
                    ${items.length > 0 ? items.map(item => `
                        <div class="item-card" data-item-id="${item.id}">
                            <div class="item-icon">
                                ${this.getItemIcon(item)}
                            </div>
                            <div class="item-content">
                                <div class="item-title">${Utils.escapeHtml(item.title)}</div>
                                <div class="item-website">${item.website ? Utils.escapeHtml(item.website) : '无网址'}</div>
                            </div>
                            <div class="item-actions">
                                <button class="btn-icon ${item.is_starred ? 'starred' : ''}" 
                                        data-toggle-star="${item.id}" title="${item.is_starred ? '取消收藏' : '收藏'}">
                                    <i class="${item.is_starred ? 'ri-star-fill' : 'ri-star-line'}"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="empty-state">
                            <i class="ri-key-line"></i>
                            <p>${keyword ? '未找到匹配的密码' : '还没有保存的密码'}</p>
                            ${!keyword ? '<button class="btn btn-primary" id="btn-add-first">添加第一个密码</button>' : ''}
                        </div>
                    `}
                </div>
                
                ${totalPages > 1 ? `
                    <div class="pagination">
                        <button class="btn btn-ghost" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
                            <i class="ri-arrow-left-line"></i>
                        </button>
                        <span class="page-info">${page} / ${totalPages}</span>
                        <button class="btn btn-ghost" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">
                            <i class="ri-arrow-right-line"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderItemDetail() {
        const { selectedItem, showPassword } = this.state;
        if (!selectedItem) return '';

        const isPasswordVisible = showPassword[selectedItem.id];

        return `
            <div class="vault-detail">
                <div class="detail-header">
                    <button class="btn btn-ghost" id="btn-back-list">
                        <i class="ri-arrow-left-line"></i> 返回列表
                    </button>
                    <div class="header-actions">
                        <button class="btn btn-ghost" id="btn-edit-item">
                            <i class="ri-edit-line"></i> 编辑
                        </button>
                        <button class="btn btn-danger-ghost" id="btn-delete-item">
                            <i class="ri-delete-bin-line"></i> 删除
                        </button>
                    </div>
                </div>
                
                <div class="detail-card">
                    <div class="detail-icon">
                        ${this.getItemIcon(selectedItem)}
                    </div>
                    <h2 class="detail-title">${Utils.escapeHtml(selectedItem.title)}</h2>
                    ${selectedItem.category_name ? `
                        <div class="detail-category">${selectedItem.category_name}</div>
                    ` : ''}
                    
                    <div class="detail-fields">
                        ${selectedItem.website ? `
                            <div class="field-row">
                                <div class="field-label">
                                    <i class="ri-global-line"></i> 网站
                                </div>
                                <div class="field-value">
                                    <a href="${selectedItem.website}" target="_blank" rel="noopener">
                                        ${Utils.escapeHtml(selectedItem.website)}
                                    </a>
                                    <button class="btn-copy" data-copy="${selectedItem.website}" data-label="网址">
                                        <i class="ri-file-copy-line"></i>
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="field-row">
                            <div class="field-label">
                                <i class="ri-user-line"></i> 用户名
                            </div>
                            <div class="field-value">
                                <span>${Utils.escapeHtml(selectedItem.username || '')}</span>
                                <button class="btn-copy" data-copy="${selectedItem.username || ''}" data-label="用户名">
                                    <i class="ri-file-copy-line"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="field-row">
                            <div class="field-label">
                                <i class="ri-lock-password-line"></i> 密码
                            </div>
                            <div class="field-value password-field">
                                <span class="password-text ${isPasswordVisible ? '' : 'masked'}">
                                    ${isPasswordVisible ? Utils.escapeHtml(selectedItem.password || '') : '••••••••••••'}
                                </span>
                                <button class="btn-toggle-pwd" data-toggle-pwd="${selectedItem.id}">
                                    <i class="${isPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'}"></i>
                                </button>
                                <button class="btn-copy" data-copy="${selectedItem.password || ''}" data-label="密码">
                                    <i class="ri-file-copy-line"></i>
                                </button>
                            </div>
                        </div>
                        
                        ${selectedItem.notes ? `
                            <div class="field-row notes-row">
                                <div class="field-label">
                                    <i class="ri-sticky-note-line"></i> 备注
                                </div>
                                <div class="field-value notes-value">
                                    <pre>${Utils.escapeHtml(selectedItem.notes)}</pre>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="detail-meta">
                        <div class="meta-item">
                            <span class="meta-label">创建时间</span>
                            <span class="meta-value">${Utils.formatDate(selectedItem.created_at)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">更新时间</span>
                            <span class="meta-value">${Utils.formatDate(selectedItem.updated_at)}</span>
                        </div>
                        ${selectedItem.last_used_at ? `
                            <div class="meta-item">
                                <span class="meta-label">最后使用</span>
                                <span class="meta-value">${Utils.formatDate(selectedItem.last_used_at)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    getItemIcon(item) {
        if (!item) return '<i class="ri-key-2-line"></i>';

        // 根据网站域名显示不同图标
        const website = item.website || '';
        if (website) {
            try {
                // 处理没有协议的网址
                let urlStr = website;
                if (!urlStr.startsWith('http')) {
                    urlStr = 'http://' + urlStr;
                }
                const url = new URL(urlStr);
                const domain = url.hostname.toLowerCase();

                if (domain.includes('github')) return '<i class="ri-github-fill"></i>';
                if (domain.includes('google')) return '<i class="ri-google-fill"></i>';
                if (domain.includes('microsoft') || domain.includes('outlook') || domain.includes('live'))
                    return '<i class="ri-microsoft-fill"></i>';
                if (domain.includes('apple') || domain.includes('icloud')) return '<i class="ri-apple-fill"></i>';
                if (domain.includes('amazon')) return '<i class="ri-amazon-fill"></i>';
                if (domain.includes('facebook') || domain.includes('fb')) return '<i class="ri-facebook-fill"></i>';
                if (domain.includes('twitter') || domain.includes('x.com')) return '<i class="ri-twitter-x-fill"></i>';
                if (domain.includes('linkedin')) return '<i class="ri-linkedin-fill"></i>';
                if (domain.includes('instagram')) return '<i class="ri-instagram-fill"></i>';
                if (domain.includes('youtube')) return '<i class="ri-youtube-fill"></i>';
                if (domain.includes('netflix')) return '<i class="ri-netflix-fill"></i>';
                if (domain.includes('spotify')) return '<i class="ri-spotify-fill"></i>';
                if (domain.includes('discord')) return '<i class="ri-discord-fill"></i>';
                if (domain.includes('slack')) return '<i class="ri-slack-fill"></i>';
                if (domain.includes('wechat') || domain.includes('weixin')) return '<i class="ri-wechat-fill"></i>';
                if (domain.includes('qq')) return '<i class="ri-qq-fill"></i>';
                if (domain.includes('alipay')) return '<i class="ri-alipay-fill"></i>';
                if (domain.includes('taobao') || domain.includes('tmall')) return '<i class="ri-taobao-fill"></i>';
                if (domain.includes('weibo')) return '<i class="ri-weibo-fill"></i>';
            } catch (e) {
                // 解析失败，使用默认图标
            }
        }
        return '<i class="ri-key-2-line"></i>';
    }

    render() {
        const { loading, hasMasterKey, unlocked, view } = this.state;

        if (loading) {
            return `
                <div class="page-vault">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
            `;
        }

        // 未设置主密码
        if (!hasMasterKey) {
            return `
                <div class="page-vault">
                    ${this.renderSetupView()}
                </div>
            `;
        }

        // 未解锁
        if (!unlocked) {
            return `
                <div class="page-vault">
                    ${this.renderLockedView()}
                </div>
            `;
        }

        // 已解锁
        return `
            <div class="page-vault">
                <div class="vault-container">
                    ${this.renderSidebar()}
                    <div class="vault-main">
                        ${view === 'detail' ? this.renderItemDetail() : this.renderItemsList()}
                    </div>
                </div>
            </div>
        `;
    }

    async afterMount() {
        await this.loadData();
        this.bindEvents();
        ModuleHelp.bindHelpButtons(this.container);
    }

    afterUpdate() {
        this.bindEvents();
        ModuleHelp.bindHelpButtons(this.container);
    }

    bindEvents() {
        // 防止重复绑定
        if (this._eventsBound) return;
        this._eventsBound = true;

        // 使用事件委托统一处理点击事件
        this.delegate('click', '#btn-setup-master', () => this.setupMasterKey());
        this.delegate('click', '#btn-unlock', () => this.unlock());
        this.delegate('click', '#btn-lock', () => this.lock());
        this.delegate('click', '#btn-change-password', () => this.changeMasterKey());
        this.delegate('click', '#btn-forgot-password', () => this.resetVault());
        this.delegate('click', '#btn-add-item', () => this.showItemModal());
        this.delegate('click', '#btn-add-first', () => this.showItemModal());
        this.delegate('click', '#btn-add-category', () => this.showCategoryModal());
        this.delegate('click', '#btn-back-list', () => {
            this.setState({ view: 'list', selectedItem: null, showPassword: {} });
        });
        this.delegate('click', '#btn-edit-item', () => {
            this.showItemModal(this.state.selectedItem);
        });
        this.delegate('click', '#btn-delete-item', () => {
            this.deleteItem(this.state.selectedItem.id);
        });

        // 分类筛选
        this.delegate('click', '[data-filter-category]', (e, el) => {
            const catId = el.dataset.filterCategory;
            if (catId === 'all') {
                this.filterByCategory(null);
            } else {
                const id = parseInt(catId);
                this.filterByCategory(isNaN(id) ? null : id);
            }
        });

        // 收藏筛选
        this.delegate('click', '[data-filter-starred]', async () => {
            // 清理搜索状态
            const searchInput = this.container?.querySelector('#vault-search');
            if (searchInput) searchInput.value = '';

            this.setState({
                currentCategoryId: -1, // 特殊值代表收藏
                page: 1,
                view: 'list',
                selectedItem: null,
                keyword: ''
            });
            const res = await Api.get('/vault/items/starred');
            this.setState({
                items: res.data?.items || [],
                total: res.data?.total || 0,
                loading: false
            });
        });

        // 编辑分类
        this.delegate('click', '[data-edit-category]', (e, el) => {
            e.stopPropagation();
            const catId = parseInt(el.dataset.editCategory);
            const category = this.state.categories.find(c => c.id === catId);
            if (category) this.showCategoryModal(category);
        });

        // 删除分类
        this.delegate('click', '[data-delete-category]', (e, el) => {
            e.stopPropagation();
            this.deleteCategory(parseInt(el.dataset.deleteCategory));
        });

        // 点击条目查看详情
        this.delegate('click', '.item-card[data-item-id]', (e, el) => {
            // 如果点击的是收藏按钮，不触发查看详情
            if (e.target.closest('[data-toggle-star]')) return;
            this.viewItem(parseInt(el.dataset.itemId));
        });

        // 收藏切换
        this.delegate('click', '[data-toggle-star]', (e, el) => {
            e.stopPropagation();
            this.toggleStar(parseInt(el.dataset.toggleStar), e);
        });

        // 分页
        this.delegate('click', '[data-page]', (e, el) => {
            this.changePage(parseInt(el.dataset.page));
        });

        // 复制
        this.delegate('click', '[data-copy]', (e, el) => {
            this.copyToClipboard(el.dataset.copy, el.dataset.label);
        });

        // 切换密码显示
        this.delegate('click', '[data-toggle-pwd]', (e, el) => {
            this.togglePasswordVisibility(parseInt(el.dataset.togglePwd));
        });

        // 搜索按钮点击
        this.delegate('click', '#btn-vault-search', (e) => {
            e.preventDefault();
            const input = this.container.querySelector('#vault-search');
            if (input) this.search(input.value.trim());
        });

        // 搜索框回车触发
        this.delegate('keydown', '#vault-search', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.search(e.target.value.trim());
            }
        });

        // 导出数据
        this.delegate('click', '#btn-export-data', () => this.exportData());

        // 导入数据
        this.delegate('click', '#btn-import-data', () => this.importData());
    }
}

// 导出
window.VaultPage = VaultPage;

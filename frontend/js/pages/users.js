/**
 * 用户管理页面
 */

// 用户列表页
class UserListPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            users: [],
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            groups: [],
            filters: {
                role: '',
                is_active: '',
                keyword: '',
                role_id: ''
            },
            selectedUsers: [],  // 批量选中的用户ID
            importing: false,
            importResult: null
        };
        this._eventsBinded = false;
        this._auditing = {};
        this._toggling = {};
        this._deleting = {};
        this._permsModalOpen = false;
        this._handlers = {};
    }

    // 批量导入用户
    async handleImportUsers(file) {
        if (!file) return;

        this.setState({ importing: true, importResult: null });
        try {
            const res = await ExportApi.importUsers(file);
            const result = res.data || res;
            this.setState({
                importing: false,
                importResult: {
                    success: true,
                    total: result.total || 0,
                    imported: result.imported || 0,
                    skipped: result.skipped || 0,
                    errors: result.errors || []
                }
            });
            Toast.success(`导入完成：成功 ${result.imported || 0} 条`);
            // 刷新用户列表
            this.loadData();
        } catch (e) {
            this.setState({
                importing: false,
                importResult: {
                    success: false,
                    message: e.message || '导入失败'
                }
            });
            Toast.error(e.message || '导入失败');
        }
    }

    // 显示导入对话框
    showImportModal() {
        const content = `
            <div style="display:grid;gap:16px;">
                <div>
                    <input type="file" id="importUserFile" accept=".xlsx,.xls" style="display:none;">
                    <div class="upload-area-compact" id="uploadUserArea" style="padding:40px 20px;border:2px dashed var(--color-border);border-radius:12px;text-align:center;cursor:pointer;">
                        <div style="font-size:36px;margin-bottom:8px;"><i class="ri-file-excel-2-line"></i></div>
                        <div>点击或拖放 Excel 文件</div>
                        <small style="color:var(--color-text-secondary);">支持 .xlsx, .xls 格式</small>
                    </div>
                </div>
                <div style="background:var(--color-bg-secondary);padding:12px 16px;border-radius:8px;">
                    <div style="font-weight:500;margin-bottom:8px;"><i class="ri-file-list-line"></i> 导入说明</div>
                    <ul style="margin:0;padding-left:20px;color:var(--color-text-secondary);font-size:13px;line-height:1.8;">
                        <li><b>用户名</b>（必填）：username 或 用户名，需唯一</li>
                        <li><b>手机号</b>（必填）：phone 或 手机号，11位手机号码</li>
                        <li><b>昵称</b>（可选）：nickname 或 昵称</li>
                        <li><b>角色</b>（可选）：role 或 角色，默认 guest</li>
                        <li><b>是否激活</b>（可选）：is_active，默认未激活需审核</li>
                        <li style="margin-top:8px;">💡 密码将使用默认密码 <code style="background:var(--color-bg-tertiary);padding:2px 6px;border-radius:4px;">Import@123</code></li>
                        <li>已存在的用户名或手机号会被跳过</li>
                    </ul>
                </div>
                <div id="importProgress" style="display:none;">
                    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--color-bg-secondary);border-radius:8px;">
                        <div class="loading-sm"></div>
                        <span>正在导入...</span>
                    </div>
                </div>
                <div id="importResultBox"></div>
            </div>
        `;

        const { overlay, close } = Modal.show({
            title: '<i class="ri-upload-cloud-2-line"></i> 批量导入用户',
            content,
            footer: `<button class="btn btn-secondary" data-action="cancel">关闭</button>`,
            width: '500px'
        });

        const fileInput = overlay.querySelector('#importUserFile');
        const uploadArea = overlay.querySelector('#uploadUserArea');
        const progressBox = overlay.querySelector('#importProgress');
        const resultBox = overlay.querySelector('#importResultBox');

        const handleFile = async (file) => {
            if (!file) return;

            progressBox.style.display = 'block';
            resultBox.innerHTML = '';

            try {
                const res = await ExportApi.importUsers(file);
                const result = res.data || res;

                progressBox.style.display = 'none';
                resultBox.innerHTML = `
                    <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;color:var(--color-success);">
                        <div style="font-weight:500;margin-bottom:8px;"><i class="ri-checkbox-circle-line"></i> 导入完成</div>
                        <div style="font-size:14px;">
                            共 ${result.total || 0} 条，成功 ${result.imported || 0} 条，跳过 ${result.skipped || 0} 条
                        </div>
                        ${result.errors && result.errors.length > 0 ? `
                            <div style="margin-top:8px;font-size:12px;color:var(--color-text-secondary);max-height:100px;overflow-y:auto;">
                                ${result.errors.slice(0, 10).map(e => `<div>• ${e}</div>`).join('')}
                                ${result.errors.length > 10 ? `<div>... 等 ${result.errors.length} 条</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;

                Toast.success(`导入完成：成功 ${result.imported || 0} 条`);
                this.loadData();
            } catch (e) {
                progressBox.style.display = 'none';
                resultBox.innerHTML = `
                    <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;color:var(--color-error);">
                        <i class="ri-close-circle-line"></i> ${e.message || '导入失败'}
                    </div>
                `;
            }
        };

        uploadArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
            e.target.value = '';
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-primary)';
            uploadArea.style.background = 'var(--color-bg-secondary)';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--color-border)';
            uploadArea.style.background = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-border)';
            uploadArea.style.background = '';
            handleFile(e.dataTransfer.files[0]);
        });
    }

    async loadData() {
        this.setState({ loading: true });

        try {
            const params = {
                page: this.state.page,
                size: this.state.size
            };

            if (this.state.filters.role) {
                params.role = this.state.filters.role;
            }
            if (this.state.filters.role_id) {
                const rid = parseInt(this.state.filters.role_id);
                if (!isNaN(rid)) {
                    params.role_id = rid;
                }
            }
            if (this.state.filters.is_active !== '') {
                params.is_active = this.state.filters.is_active === 'true';
            }
            if (this.state.filters.keyword) {
                params.keyword = this.state.filters.keyword;
            }

            const [usersRes, groupsRes] = await Promise.all([
                UserApi.getUsers(params),
                GroupApi.list().catch(() => ({ data: [] }))
            ]);
            this.setState({
                users: usersRes.data.items,
                total: usersRes.data.total,
                groups: groupsRes.data || [],
                loading: false
            });
        } catch (error) {
            Toast.error('加载用户列表失败');
            this.setState({ loading: false });
        }
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    handleFilter(key, value) {
        // 直接更新状态对象（不使用回调函数，因为Component.setState不支持）
        this.state.filters = { ...this.state.filters, [key]: value };
        this.state.page = 1;
        this.state.selectedUsers = [];  // 切换筛选条件时清空选中
        this.loadData();
    }

    async handleBatchAction(action) {
        const { selectedUsers } = this.state;
        if (selectedUsers.length === 0) {
            Toast.warning('请先选择用户');
            return;
        }

        const actionNames = {
            enable: '启用',
            disable: '禁用',
            delete: '删除'
        };
        const actionName = actionNames[action] || action;

        // 删除操作需要二次确认
        if (action === 'delete') {
            const confirmed = await Modal.confirm(
                '确认删除',
                `确定要删除选中的 ${selectedUsers.length} 个用户吗？此操作不可撤销。`
            );
            if (!confirmed) return;
        } else {
            const confirmed = await Modal.confirm(
                `批量${actionName}`,
                `确定要${actionName}选中的 ${selectedUsers.length} 个用户吗？`
            );
            if (!confirmed) return;
        }

        try {
            const res = await UserApi.batchAction(selectedUsers, action);
            const { operated, skipped } = res.data;
            if (operated.length > 0) {
                Toast.success(`批量${actionName}成功：${operated.length} 个用户`);
            }
            if (skipped.length > 0) {
                Toast.warning(`跳过 ${skipped.length} 个用户（无权限或为管理员）`);
            }
            this.setState({ selectedUsers: [] });
            this.loadData();
        } catch (error) {
            Toast.error(`批量${actionName}失败：${error.message}`);
        }
    }

    async handleAudit(userId, isActive) {
        // 防止重复调用
        const key = `audit_${userId}_${isActive}`;
        if (this._auditing && this._auditing[key]) {
            return;
        }
        if (!this._auditing) {
            this._auditing = {};
        }
        this._auditing[key] = true;

        try {
            const action = isActive ? '通过' : '拒绝';
            const reason = await Modal.prompt(`审核${action}`, `请输入审核备注（可选）`);

            // 如果用户取消，reason 为 null
            if (reason === null) {
                delete this._auditing[key];
                return;
            }

            await UserApi.auditUser(userId, {
                is_active: isActive,
                reason: reason || null
            });
            Toast.success(`用户审核${action}成功`);
            this.loadData();
        } catch (error) {
            Toast.error(error.message);
        } finally {
            delete this._auditing[key];
        }
    }

    async handleToggleStatus(userId, currentStatus) {
        // 防止重复调用
        const key = `toggle_${userId}`;
        if (this._toggling && this._toggling[key]) {
            return;
        }
        if (!this._toggling) {
            this._toggling = {};
        }
        this._toggling[key] = true;

        const action = currentStatus ? '禁用' : '启用';
        Modal.confirm(`${action}用户`, `确定要${action}此用户吗？`, async () => {
            try {
                await UserApi.toggleUserStatus(userId, !currentStatus);
                Toast.success(`用户已${action}`);
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            } finally {
                delete this._toggling[key];
            }
        }, () => {
            // 用户取消时也清除标志
            delete this._toggling[key];
        });
    }

    async handleDelete(userId, username) {
        // 防止重复调用
        const key = `delete_${userId}`;
        if (this._deleting && this._deleting[key]) {
            return;
        }
        if (!this._deleting) {
            this._deleting = {};
        }
        this._deleting[key] = true;

        Modal.confirm('删除用户', `确定要删除用户 "${username}" 吗？此操作不可恢复。`, async () => {
            try {
                await UserApi.deleteUser(userId);
                Toast.success('用户已删除');
                this.loadData();
            } catch (error) {
                Toast.error(error.message);
            } finally {
                delete this._deleting[key];
            }
        }, () => {
            // 用户取消时也清除标志
            delete this._deleting[key];
        });
    }

    resolveRole(user) {
        if (user.role === 'admin') return { label: '系统管理员', cls: 'tag-danger' };
        if (user.role === 'manager') return { label: '管理员', cls: 'tag-warning' };
        // 优先根据用户组判断
        const groupIds = user.role_ids || [];
        const guestGroup = this.state.groups.find(g => g.name?.toLowerCase() === 'guest');
        if (guestGroup && groupIds.includes(guestGroup.id)) {
            return { label: '访客', cls: 'tag-default' };
        }
        if (user.role === 'guest') return { label: '访客', cls: 'tag-default' };
        return { label: '普通用户', cls: 'tag-info' };
    }

    // 格式化存储配额显示
    formatStorageQuota(quota) {
        if (quota === null || quota === undefined) return '无限制';
        const gb = quota / (1024 * 1024 * 1024);
        const mb = quota / (1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;
        return `${mb.toFixed(2)} MB`;
    }

    // 显示编辑用户弹窗
    showEditModal(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) {
            Toast.error('用户不存在');
            return;
        }

        // 计算当前存储使用情况（需要从文件管理模块获取，这里先显示配额）
        const quotaGB = user.storage_quota ? (user.storage_quota / (1024 * 1024 * 1024)).toFixed(2) : '';
        const quotaMB = user.storage_quota ? (user.storage_quota / (1024 * 1024)).toFixed(0) : '';

        const content = `
            <form id="editUserForm" style="display:grid;gap:16px;">
                <div class="form-group">
                    <label class="form-label">用户名</label>
                    <input type="text" class="form-input" value="${Utils.escapeHtml(user.username)}" disabled style="background:var(--color-bg-secondary);">
                    <small class="form-hint">用户名不可修改</small>
                </div>
                
                <div class="form-group">
                    <label class="form-label">昵称</label>
                    <input type="text" name="nickname" class="form-input" value="${Utils.escapeHtml(user.nickname || '')}" placeholder="请输入昵称">
                </div>
                
                <div class="form-group">
                    <label class="form-label">手机号</label>
                    <input type="tel" name="phone" class="form-input" value="${Utils.escapeHtml(user.phone || '')}" placeholder="请输入11位手机号" maxlength="11">
                </div>
                
                <div class="form-group">
                    <label class="form-label">头像URL</label>
                    <input type="url" name="avatar" class="form-input" value="${Utils.escapeHtml(user.avatar || '')}" placeholder="请输入头像URL">
                </div>
                
                <div class="form-group">
                    <label class="form-label">存储配额</label>
                    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;">
                        <div>
                            <input type="number" name="quota_value" class="form-input" 
                                   value="${quotaGB || quotaMB || ''}" 
                                   placeholder="请输入配额" 
                                   min="0" step="0.01">
                        </div>
                        <select name="quota_unit" class="form-input form-select" style="width:80px;">
                            <option value="gb" ${quotaGB ? 'selected' : ''}>GB</option>
                            <option value="mb" ${quotaMB && !quotaGB ? 'selected' : ''}>MB</option>
                            <option value="unlimited" ${!user.storage_quota ? 'selected' : ''}>无限制</option>
                        </select>
                    </div>
                    <small class="form-hint">
                        当前配额: ${this.formatStorageQuota(user.storage_quota)} | 
                        留空或选择"无限制"表示不限制存储空间
                    </small>
                </div>
            </form>
        `;

        const { overlay, close } = Modal.show({
            title: `编辑用户: ${Utils.escapeHtml(user.username)}`,
            content: content,
            footer: `
                <button type="button" class="btn btn-secondary" data-close>取消</button>
                <button type="button" class="btn btn-primary" id="saveEditUserBtn">保存</button>
            `,
            width: '500px'
        });

        // 绑定表单提交
        const form = overlay.querySelector('#editUserForm');
        const saveBtn = overlay.querySelector('#saveEditUserBtn');

        if (saveBtn && form) {
            saveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleEditUser(userId, form);
                close();
            });
        }
    }

    // 处理编辑用户
    async handleEditUser(userId, form) {
        const nickname = form.querySelector('[name="nickname"]')?.value.trim() || null;
        const phone = form.querySelector('[name="phone"]')?.value.trim() || null;
        const avatar = form.querySelector('[name="avatar"]')?.value.trim() || null;
        const quotaValue = form.querySelector('[name="quota_value"]')?.value;
        const quotaUnit = form.querySelector('[name="quota_unit"]')?.value;

        // 计算存储配额（字节）
        let storage_quota = null;
        if (quotaUnit !== 'unlimited' && quotaValue) {
            const value = parseFloat(quotaValue);
            if (!isNaN(value) && value > 0) {
                if (quotaUnit === 'gb') {
                    storage_quota = Math.round(value * 1024 * 1024 * 1024);
                } else if (quotaUnit === 'mb') {
                    storage_quota = Math.round(value * 1024 * 1024);
                }
            }
        }

        try {
            await UserApi.updateUser(userId, {
                nickname: nickname,
                phone: phone,
                avatar: avatar,
                storage_quota: storage_quota
            });
            Toast.success('用户信息已更新');
            this.loadData(); // 刷新列表
        } catch (e) {
            Toast.error(e.message || '更新失败');
        }
    }

    // 显示创建用户弹窗
    showCreateUserModal() {
        const content = `
            <form id="createUserForm" style="display:grid;gap:16px;">
                <div class="form-group">
                    <label class="form-label">用户名 <span style="color:var(--color-error);">*</span></label>
                    <input type="text" name="username" class="form-input" placeholder="3-20位字母开头，可含数字下划线" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">密码 <span style="color:var(--color-error);">*</span></label>
                    <input type="password" name="password" class="form-input" 
                           placeholder="至少${Store.get('systemSettings')?.password_min_length || 6}位" 
                           minlength="${Store.get('systemSettings')?.password_min_length || 6}" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">昵称</label>
                    <input type="text" name="nickname" class="form-input" placeholder="可选，默认使用用户名">
                </div>
                
                <div class="form-group">
                    <label class="form-label">手机号</label>
                    <input type="tel" name="phone" class="form-input" placeholder="可选，11位手机号" maxlength="11">
                </div>
                
                <div class="form-group">
                    <label class="form-label">角色</label>
                    <select name="role" class="form-input form-select">
                        <option value="user" selected>普通用户</option>
                        <option value="guest">访客</option>
                        <option value="manager">管理员</option>
                        <option value="admin">系统管理员</option>
                    </select>
                    <small class="form-hint">管理员及以上将自动获得全部权限</small>
                </div>
            </form>
        `;

        const { overlay, close } = Modal.show({
            title: '<i class="ri-user-add-line"></i> 添加用户',
            content: content,
            footer: `
                <button type="button" class="btn btn-secondary" data-close>取消</button>
                <button type="button" class="btn btn-primary" id="submitCreateUserBtn">创建</button>
            `,
            width: '450px'
        });

        const form = overlay.querySelector('#createUserForm');
        const submitBtn = overlay.querySelector('#submitCreateUserBtn');

        if (submitBtn && form) {
            submitBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                const username = form.querySelector('[name="username"]')?.value.trim();
                const password = form.querySelector('[name="password"]')?.value;
                const nickname = form.querySelector('[name="nickname"]')?.value.trim() || '';
                const phone = form.querySelector('[name="phone"]')?.value.trim() || '';
                const role = form.querySelector('[name="role"]')?.value || 'user';

                if (!username || username.length < 3) {
                    Toast.error('用户名至少3个字符');
                    return;
                }

                const settings = Store.getSystemSettings();
                const minLength = settings?.password_min_length || 6;

                if (!password || password.length < minLength) {
                    Toast.error(`密码至少${minLength}个字符`);
                    return;
                }

                try {
                    submitBtn.disabled = true;
                    submitBtn.textContent = '创建中...';

                    await UserApi.createUser({
                        username,
                        password,
                        nickname,
                        phone,
                        role
                    });

                    Toast.success(`用户 ${username} 创建成功`);
                    close();
                    this.loadData();
                } catch (err) {
                    Toast.error(err.message || '创建失败');
                    submitBtn.disabled = false;
                    submitBtn.textContent = '创建';
                }
            });
        }
    }

    // 显示重置密码弹窗
    showResetPasswordModal(userId, username) {
        const settings = Store.getSystemSettings();
        const minLength = settings?.password_min_length || 6;

        const content = `
            <form id="resetPasswordForm" style="display:grid;gap:16px;">
                <div style="padding:12px;background:var(--color-bg-tertiary);border-radius:8px;margin-bottom:8px;">
                    <div style="font-size:14px;color:var(--color-text-secondary);">即将为以下用户重置密码：</div>
                    <div style="font-size:18px;font-weight:600;color:var(--color-text-primary);margin-top:4px;">${Utils.escapeHtml(username)}</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">新密码 <span style="color:var(--color-bg-danger);">*</span></label>
                    <input type="password" name="newPassword" class="form-input" placeholder="至少${minLength}位" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">确认密码 <span style="color:var(--color-error);">*</span></label>
                    <input type="password" name="confirmPassword" class="form-input" placeholder="再次输入新密码" required>
                </div>
                
                <div style="padding:10px;background:rgba(255,193,7,0.1);border-radius:8px;color:var(--color-warning);font-size:13px;">
                    ⚠️ 重置密码后，用户需要使用新密码重新登录
                </div>
            </form>
        `;

        const { overlay, close } = Modal.show({
            title: '<i class="ri-lock-password-line"></i> 重置密码',
            content: content,
            footer: `
                <button type="button" class="btn btn-secondary" data-close>取消</button>
                <button type="button" class="btn btn-danger" id="submitResetPwdBtn">重置密码</button>
            `,
            width: '400px'
        });

        const form = overlay.querySelector('#resetPasswordForm');
        const submitBtn = overlay.querySelector('#submitResetPwdBtn');

        if (submitBtn && form) {
            submitBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                const newPassword = form.querySelector('[name="newPassword"]')?.value;
                const confirmPassword = form.querySelector('[name="confirmPassword"]')?.value;

                if (!newPassword || newPassword.length < minLength) {
                    Toast.error(`新密码至少${minLength}个字符`);
                    return;
                }

                if (newPassword !== confirmPassword) {
                    Toast.error('两次输入的密码不一致');
                    return;
                }

                try {
                    submitBtn.disabled = true;
                    submitBtn.textContent = '重置中...';

                    await UserApi.resetPassword(userId, newPassword);

                    Toast.success(`用户 ${username} 的密码已重置`);
                    close();
                } catch (err) {
                    Toast.error(err.message || '重置失败');
                    submitBtn.disabled = false;
                    submitBtn.textContent = '重置密码';
                }
            });
        }
    }

    render() {
        const { users, total, page, size, loading, filters, groups, selectedUsers } = this.state;
        const pages = Math.ceil(total / size);

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">用户管理</h1>
                        <p class="page-desc">共 ${total} 个用户</p>
                    </div>
                    <div class="page-header-actions">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('users', '用户管理') : ''}
                        <button class="btn btn-primary" id="createUserBtn">
                            <i class="ri-user-add-line"></i> 添加用户
                        </button>
                        <button class="btn btn-secondary" id="downloadTemplateBtn">
                            <i class="ri-file-excel-line"></i> 下载模板
                        </button>
                        <button class="btn btn-secondary" id="importUsersBtn">
                            <i class="ri-upload-cloud-2-line"></i> 批量导入
                        </button>
                        <button class="btn btn-secondary" id="exportUsersBtn">
                            <i class="ri-download-cloud-2-line"></i> 导出列表
                        </button>
                        <a href="#/users/pending" class="btn btn-secondary" style="color:var(--color-warning);">
                            <i class="ri-time-line"></i> 待审核
                        </a>
                        <a href="#/system/roles" class="btn btn-secondary" style="color:var(--color-info);">
                            <i class="ri-shield-user-line"></i> 用户组
                        </a>
                    </div>
                </div>
                
                <!-- 筛选器 -->
                <div class="card" style="margin-bottom: var(--spacing-lg)">
                    <div class="card-body users-filters">
                        <div class="form-group">
                            <label class="form-label">角色</label>
                            <select class="form-input form-select" id="filterRole" value="${filters.role}">
                                <option value="">全部</option>
                                <option value="admin" ${filters.role === 'admin' ? 'selected' : ''}>系统管理员</option>
                                <option value="manager" ${filters.role === 'manager' ? 'selected' : ''}>管理员</option>
                                <option value="user" ${filters.role === 'user' ? 'selected' : ''}>普通用户</option>
                                <option value="guest" ${filters.role === 'guest' ? 'selected' : ''}>访客</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">用户组</label>
                            <select class="form-input form-select" id="filterRoleId">
                                <option value="">全部</option>
                                ${groups.map(g => `<option value="${g.id}" ${filters.role_id == g.id ? 'selected' : ''}>${Utils.escapeHtml(g.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">状态</label>
                            <select class="form-input form-select" id="filterStatus" value="${filters.is_active}">
                                <option value="">全部</option>
                                <option value="true" ${filters.is_active === 'true' ? 'selected' : ''}>已激活</option>
                                <option value="false" ${filters.is_active === 'false' ? 'selected' : ''}>待审核</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">搜索</label>
                            <div class="search-group">
                                <input type="text" class="form-input" id="usersSearchInput" 
                                       placeholder="用户名、手机号、昵称" value="${filters.keyword || ''}">
                                <button class="btn btn-primary" id="usersSearchBtn">
                                    <i class="ri-search-line"></i> 搜索
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 批量操作栏 -->
                ${selectedUsers.length > 0 ? `
                <div class="card" style="margin-bottom: var(--spacing-md); background: rgba(var(--color-primary-rgb), 0.1); border: 1px solid var(--color-primary);">
                    <div class="card-body" style="display: flex; align-items: center; gap: 16px; padding: 12px 16px;">
                        <span style="font-weight: 500; color: var(--color-primary);">
                            <i class="ri-checkbox-multiple-line"></i>
                            已选择 ${selectedUsers.length} 个用户
                        </span>
                        <div style="display: flex; gap: 8px; flex: 1;">
                            <button class="btn btn-sm btn-secondary" id="batchEnable">
                                <i class="ri-check-line"></i> 批量启用
                            </button>
                            <button class="btn btn-sm btn-secondary" id="batchDisable">
                                <i class="ri-forbid-line"></i> 批量禁用
                            </button>
                            <button class="btn btn-sm btn-secondary" style="color: var(--color-error);" id="batchDelete">
                                <i class="ri-delete-bin-line"></i> 批量删除
                            </button>
                        </div>
                        <button class="btn btn-sm btn-ghost" id="clearSelection">
                            <i class="ri-close-line"></i> 取消选择
                        </button>
                    </div>
                </div>
                ` : ''}
                
                ${users.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th style="width: 40px;">
                                            <input type="checkbox" id="selectAllUsers" 
                                                   ${selectedUsers.length === users.filter(u => u.role !== 'admin').length && users.filter(u => u.role !== 'admin').length > 0 ? 'checked' : ''}>
                                        </th>
                                        <th>ID</th>
                                        <th>用户名</th>
                                        <th>手机号</th>
                                        <th>昵称</th>
                                        <th>角色</th>
                                        <th>存储配额</th>
                                        <th>状态</th>
                                        <th>最后登录</th>
                                        <th>注册时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => `
                                        <tr>
                                            <td>
                                                ${user.role !== 'admin' ? `
                                                    <input type="checkbox" class="user-checkbox" data-user-id="${user.id}" 
                                                           ${selectedUsers.includes(user.id) ? 'checked' : ''}>
                                                ` : ''}
                                            </td>
                                            <td>${user.id}</td>
                                            <td>${Utils.escapeHtml(user.username)}</td>
                                            <td>${user.phone || '-'}</td>
                                            <td>${Utils.escapeHtml(user.nickname || '-')}</td>
                                            <td>
                                                ${(() => {
                const info = this.resolveRole(user);
                return `<span class="tag ${info.cls}">${info.label}</span>`;
            })()}
                                            </td>
                                            <td>
                                                <span style="font-size:12px;color:var(--color-text-secondary);">
                                                    ${this.formatStorageQuota(user.storage_quota)}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="tag ${user.is_active ? 'tag-primary' : 'tag-danger'}">
                                                    ${user.is_active ? '已激活' : '待审核'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style="color:var(--color-text-secondary);font-size:13px;">
                                                    ${user.last_login ? Utils.formatDate(user.last_login) : '-'}
                                                </span>
                                            </td>
                                            <td>${Utils.formatDate(user.created_at)}</td>
                                            <td>
                                                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                                                    ${!user.is_active ? `
                                                        <button class="btn btn-ghost btn-sm" data-audit-pass="${user.id}" title="通过审核"><i class="ri-check-line"></i></button>
                                                        <button class="btn btn-ghost btn-sm" data-audit-reject="${user.id}" title="拒绝审核"><i class="ri-close-line"></i></button>
                                                    ` : ''}
                                                    ${user.is_active ? `
                                                        <button class="btn btn-ghost btn-sm" data-disable="${user.id}" title="禁用"><i class="ri-forbid-line"></i></button>
                                                    ` : `
                                                        ${user.role !== 'guest' ? `<button class="btn btn-ghost btn-sm" data-enable="${user.id}" title="启用"><i class="ri-check-line"></i></button>` : ''}
                                                    `}
                                                    <button class="btn btn-ghost btn-sm" data-edit="${user.id}" title="编辑"><i class="ri-edit-line"></i></button>
                                                    ${user.role !== 'admin' ? `<button class="btn btn-ghost btn-sm" data-perms="${user.id}" title="权限"><i class="ri-shield-keyhole-line"></i></button>` : ''}
                                                    <!-- 更多操作下拉菜单 -->
                                                    ${user.role !== 'admin' ? `
                                                        <div class="dropdown" style="position: relative; display: inline-block;">
                                                            <button class="btn btn-ghost btn-sm dropdown-toggle" data-toggle-dropdown="${user.id}" title="更多操作">
                                                                <i class="ri-more-2-line"></i>
                                                            </button>
                                                            <div class="dropdown-menu" id="dropdown-${user.id}" style="display: none; position: absolute; right: 0; top: 100%; background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-md); z-index: 100; min-width: 120px;">
                                                                <button class="dropdown-item" data-reset-pwd="${user.id}" data-username="${Utils.escapeHtml(user.username)}" style="display: block; width: 100%; padding: 8px 12px; text-align: left; background: none; border: none; cursor: pointer; color: var(--color-text-primary);">
                                                                    <i class="ri-lock-password-line"></i> 重置密码
                                                                </button>
                                                                <button class="dropdown-item" data-delete="${user.id}" data-username="${Utils.escapeHtml(user.username)}" style="display: block; width: 100%; padding: 8px 12px; text-align: left; background: none; border: none; cursor: pointer; color: var(--color-error);">
                                                                    <i class="ri-delete-bin-line"></i> 删除用户
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    ${Utils.renderPagination(page, pages)}
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-group-line"></i></div>
                            <p class="empty-text">暂无用户</p>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        // 重置事件绑定标志，确保重新挂载时能重新绑定
        this._eventsBinded = false;
        this._auditing = {};
        this._toggling = {};
        this._deleting = {};
        this._permsModalOpen = false;
        this._handlers = {};
        this._filterHandlers = {};
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        // 只在首次绑定后不再重复绑定
        if (!this._eventsBinded) {
            this.bindEvents();
        }
        // 每次更新后重新绑定筛选/搜索事件
        if (typeof this.bindFilterEvents === 'function') {
            this.bindFilterEvents();
        }
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // 批量导入按钮 - 使用事件委托
            this.delegate('click', '#importUsersBtn', () => {
                this.showImportModal();
            });

            // 添加用户按钮
            this.delegate('click', '#createUserBtn', () => {
                this.showCreateUserModal();
            });

            // 下载导入模板按钮
            this.delegate('click', '#downloadTemplateBtn', () => {
                const token = Store.get('token');
                window.open(`/api/v1/export/import/users/template?format=xlsx&token=${token}`, '_blank');
            });

            // 筛选器
            this.delegate('change', '#filterRole', (e) => this.handleFilter('role', e.target.value));
            this.delegate('change', '#filterRoleId', (e) => this.handleFilter('role_id', e.target.value));
            this.delegate('change', '#filterStatus', (e) => this.handleFilter('is_active', e.target.value));
            this.delegate('click', '#usersSearchBtn', () => {
                const keyword = this.$('#usersSearchInput')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            });
            this.delegate('keydown', '#usersSearchInput', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const keyword = this.$('#usersSearchInput')?.value.trim() || '';
                    this.handleFilter('keyword', keyword);
                }
            });
            this.delegate('click', '#exportUsersBtn', () => this.handleExport());

            // 批量选择：全选复选框
            this.delegate('change', '#selectAllUsers', (e) => {
                const checked = e.target.checked;
                const selectableUsers = this.state.users.filter(u => u.role !== 'admin');
                if (checked) {
                    this.setState({ selectedUsers: selectableUsers.map(u => u.id) });
                } else {
                    this.setState({ selectedUsers: [] });
                }
            });

            // 批量选择：单个复选框
            this.delegate('change', '.user-checkbox', (e) => {
                const userId = parseInt(e.target.dataset.userId);
                const checked = e.target.checked;
                let selectedUsers = [...this.state.selectedUsers];
                if (checked && !selectedUsers.includes(userId)) {
                    selectedUsers.push(userId);
                } else if (!checked) {
                    selectedUsers = selectedUsers.filter(id => id !== userId);
                }
                this.setState({ selectedUsers });
            });

            // 批量操作按钮
            this.delegate('click', '#batchEnable', () => this.handleBatchAction('enable'));
            this.delegate('click', '#batchDisable', () => this.handleBatchAction('disable'));
            this.delegate('click', '#batchDelete', () => this.handleBatchAction('delete'));
            this.delegate('click', '#clearSelection', () => this.setState({ selectedUsers: [] }));

            // 下拉菜单切换
            this.delegate('click', '[data-toggle-dropdown]', (e) => {
                e.stopPropagation();
                const userId = e.target.closest('[data-toggle-dropdown]').dataset.toggleDropdown;
                const dropdown = document.getElementById(`dropdown-${userId}`);
                if (dropdown) {
                    // 关闭其他下拉菜单
                    document.querySelectorAll('.dropdown-menu').forEach(menu => {
                        if (menu.id !== `dropdown-${userId}`) {
                            menu.style.display = 'none';
                        }
                    });
                    // 切换当前下拉菜单
                    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                }
            });

            // 点击其他地方关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.dropdown')) {
                    document.querySelectorAll('.dropdown-menu').forEach(menu => {
                        menu.style.display = 'none';
                    });
                }
            });

            // 使用单一的事件监听器处理所有点击事件
            const clickHandler = (e) => {
                // 分页
                const pageBtn = e.target.closest('[data-page]');
                if (pageBtn && this.container.contains(pageBtn)) {
                    e.stopPropagation();
                    const page = parseInt(pageBtn.dataset.page);
                    if (page > 0) this.changePage(page);
                    return;
                }

                // 审核通过
                const auditPassBtn = e.target.closest('[data-audit-pass]');
                if (auditPassBtn && this.container.contains(auditPassBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(auditPassBtn.dataset.auditPass);
                    if (userId) this.handleAudit(userId, true);
                    return;
                }

                // 审核拒绝
                const auditRejectBtn = e.target.closest('[data-audit-reject]');
                if (auditRejectBtn && this.container.contains(auditRejectBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(auditRejectBtn.dataset.auditReject);
                    if (userId) this.handleAudit(userId, false);
                    return;
                }

                // 启用
                const enableBtn = e.target.closest('[data-enable]');
                if (enableBtn && this.container.contains(enableBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(enableBtn.dataset.enable);
                    if (userId) this.handleToggleStatus(userId, false);
                    return;
                }

                // 禁用
                const disableBtn = e.target.closest('[data-disable]');
                if (disableBtn && this.container.contains(disableBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(disableBtn.dataset.disable);
                    if (userId) this.handleToggleStatus(userId, true);
                    return;
                }

                // 编辑用户
                const editBtn = e.target.closest('[data-edit]');
                if (editBtn && this.container.contains(editBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(editBtn.dataset.edit);
                    if (userId) this.showEditModal(userId);
                    return;
                }

                // 重置密码
                const resetPwdBtn = e.target.closest('[data-reset-pwd]');
                if (resetPwdBtn && this.container.contains(resetPwdBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(resetPwdBtn.dataset.resetPwd);
                    const username = resetPwdBtn.dataset.username;
                    if (userId && username) this.showResetPasswordModal(userId, username);
                    return;
                }

                // 删除
                const deleteBtn = e.target.closest('[data-delete]');
                if (deleteBtn && this.container.contains(deleteBtn)) {
                    e.stopPropagation();
                    const userId = parseInt(deleteBtn.dataset.delete);
                    const username = deleteBtn.dataset.username;
                    if (userId && username) this.handleDelete(userId, username);
                    return;
                }
            };
            this._handlers.clickHandler = clickHandler;
            this.container.addEventListener('click', clickHandler);

            const handlePerms = async (e, target) => {
                e.stopPropagation();
                const userId = target.dataset.perms;

                // 防止重复打开弹窗
                if (this._permsModalOpen) {
                    return;
                }
                this._permsModalOpen = true;

                const currentUser = this.state.users.find(u => String(u.id) === String(userId));

                // 拉取用户组
                let groups = [];
                try {
                    const res = await GroupApi.list();
                    groups = res.data || [];
                } catch (err) {
                    Toast.error('加载用户组失败');
                    return;
                }

                // 模块（只取已启用的）
                const modules = (Store.get('modules') || []).filter(m => m.enabled !== false);
                const moduleOptions = modules.map(m => ({ id: m.id, name: m.name || m.id }));

                const currentPerms = currentUser?.permissions || [];
                const currentModules = moduleOptions.filter(m => currentPerms.includes(`${m.id}.*`)).map(m => m.id);
                const currentGroupIds = currentUser?.role_ids || [];
                const currentRole = currentUser?.role || 'user';

                // 定义用户组优先级（数字越大优先级越高）
                const groupPriority = {
                    'admin': 4,
                    'manager': 3,
                    'user': 2,
                    'guest': 1
                };

                // 获取用户组的优先级
                const getGroupPriority = (groupIds) => {
                    if (!groupIds || groupIds.length === 0) return 0;
                    const group = groups.find(g => groupIds.includes(g.id));
                    return group ? (groupPriority[group.name] || 0) : 0;
                };

                const computeAllowed = (selectedIds) => {
                    const allowedModules = new Set();
                    const specific = new Set();
                    let wildcard = false;
                    groups.forEach(g => {
                        if (!selectedIds.includes(g.id)) return;
                        (g.permissions || []).forEach(p => {
                            if (p === '*') {
                                wildcard = true;
                            } else if (p.endsWith('.*')) {
                                allowedModules.add(p.split('.')[0]);
                            } else if (p.includes('.')) {
                                allowedModules.add(p.split('.')[0]);
                                specific.add(p);
                            }
                        });
                    });
                    return { wildcard, allowedModules, specific };
                };

                const renderModules = (selectedGroupIds, presetModules = [], isUpgrade = false) => {
                    const { wildcard, allowedModules } = computeAllowed(selectedGroupIds);

                    // 如果是升级，默认选中所有允许的模块
                    // 如果是降级或保持，使用预设的模块（保留用户已选择的）
                    let defaultModules;
                    if (isUpgrade) {
                        // 升级：默认选中所有允许的模块
                        defaultModules = wildcard ? moduleOptions.map(m => m.id) : Array.from(allowedModules);
                    } else {
                        // 降级或保持：只保留在允许范围内的已选模块
                        defaultModules = presetModules.length
                            ? presetModules.filter(m => wildcard || allowedModules.has(m))
                            : (wildcard ? moduleOptions.map(m => m.id) : Array.from(allowedModules));
                    }

                    return moduleOptions.map(m => {
                        const allowed = wildcard || allowedModules.has(m.id);
                        const checked = defaultModules.includes(m.id);
                        return `
                            <label style="display:flex;align-items:center;gap:6px;opacity:${allowed ? 1 : 0.55};">
                                <input type="checkbox" name="modules" value="${m.id}" ${checked ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
                                <span>${m.name}</span>
                                ${allowed ? '' : '<span class="tag tag-default">超出用户组</span>'}
                            </label>
                        `;
                    }).join('');
                };

                const rolesHtml = groups.map(r => `
                    <label style="display:flex;align-items:center;gap:6px;">
                        <input type="radio" name="roles" value="${r.id}" ${currentGroupIds.includes(r.id) ? 'checked' : ''}>
                        <span>${Utils.escapeHtml(r.name)}</span>
                    </label>
                `).join('');

                const renderSpecific = (selectedGroupIds, presetSpecific = [], isUpgrade = false) => {
                    const { specific, wildcard } = computeAllowed(selectedGroupIds);
                    const allowedSpecific = Array.from(specific);
                    if (!wildcard && allowedSpecific.length === 0) {
                        return '<div style="color:var(--color-text-secondary);">该用户组未暴露子功能权限</div>';
                    }

                    // 如果是升级，默认选中所有允许的子功能
                    // 如果是降级或保持，使用预设的子功能（保留用户已选择的）
                    let presets;
                    if (isUpgrade) {
                        // 升级：默认选中所有允许的子功能
                        // 如果用户组是全权限（wildcard），保留已有的子功能（如果有），否则为空（全权限不需要子功能）
                        // 如果用户组有具体权限，选中所有允许的子功能
                        presets = wildcard ? (presetSpecific.length ? presetSpecific : []) : allowedSpecific;
                    } else {
                        // 降级或保持：只保留在允许范围内的已选子功能
                        if (wildcard) {
                            // 全权限：保留已有的子功能
                            presets = presetSpecific.length ? presetSpecific : [];
                        } else {
                            // 具体权限：只保留在允许范围内的已选子功能
                            presets = presetSpecific.length ? presetSpecific.filter(p => specific.has(p)) : allowedSpecific;
                        }
                    }

                    // 构建分组显示
                    // 如果用户组是全权限，显示已有的子功能（如果有），否则显示所有允许的子功能
                    const displayList = wildcard && presets.length ? presets : allowedSpecific;
                    const grouped = {};
                    displayList.forEach(p => {
                        const [mod, ...rest] = p.split('.');
                        const tail = rest.join('.') || p;
                        if (!grouped[mod]) grouped[mod] = [];
                        grouped[mod].push({ id: p, tail });
                    });
                    const moduleKeys = Object.keys(grouped);
                    if (moduleKeys.length === 0 && wildcard) {
                        return '<div style="color:var(--color-text-secondary);">用户组为全权限，可通过不选来收紧。</div>';
                    }
                    return moduleKeys.map(mod => {
                        const allChecked = grouped[mod].every(item => presets.includes(item.id));
                        return `
                        <div class="user-perm-module-section" style="margin-bottom:12px; border:1px solid var(--color-border); border-radius:6px; padding:10px; background:rgba(0,0,0,0.01);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--color-border-subtle); padding-bottom:4px;">
                                <div class="form-label" style="margin-bottom:0; font-weight:600; color:var(--color-primary);">${mod}</div>
                                <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; user-select:none;">
                                    <input type="checkbox" class="user-module-specific-all" data-user-mod="${mod}" ${allChecked ? 'checked' : ''}>
                                    <span style="color:var(--color-text-secondary);">全选</span>
                                </label>
                            </div>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${grouped[mod].map(item => `
                                    <label style="display:flex;align-items:center;gap:6px; cursor:pointer;">
                                        <input type="checkbox" name="specific" data-user-mod-ref="${mod}" value="${item.id}" ${presets.includes(item.id) ? 'checked' : ''}>
                                        <span style="font-size:13px;">${item.tail}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `;
                    }).join('');
                };

                const currentSpecific = (currentPerms || []).filter(p => p !== '*' && !p.endsWith('.*'));

                const content = `
                    <div style="display:grid;gap:12px;">
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">用户组（单选）</div>
                            <div id="groupBox" style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${rolesHtml || '<span style="color:var(--color-text-secondary)">暂无用户组，请先创建</span>'}
                            </div>
                        </div>
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">模块访问（在用户组权限范围内收紧）</div>
                            <div id="moduleAccessBox" style="display:flex;gap:12px;flex-wrap:wrap;">
                                ${renderModules(currentGroupIds, currentModules)}
                            </div>
                            <div style="color:var(--color-text-secondary);font-size:12px;margin-top:4px;">
                                用户组决定可见的模块范围，勾选后为该用户开放，未勾选则收紧为不可用。
                            </div>
                        </div>
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">子功能权限（可在用户组范围内收紧）</div>
                            <div id="specificBox" style="display:flex;gap:12px;flex-direction:column;">
                                ${renderSpecific(currentGroupIds, currentSpecific)}
                            </div>
                        </div>
                    </div>
                `;

                const { overlay, close } = Modal.show({
                    title: `设置权限 - 用户ID ${userId}`,
                    content,
                    footer: `
                        <button class="btn btn-secondary" data-close>取消</button>
                        <button class="btn btn-primary" id="savePerms">保存</button>
                    `,
                    onCancel: () => {
                        // 弹窗关闭时重置标志
                        this._permsModalOpen = false;
                    }
                });

                // 记录初始用户组，用于判断升级/降级
                let previousGroupIds = [...currentGroupIds];

                const getSelectedGroupIds = () => {
                    const checked = overlay.querySelector('#groupBox input[name="roles"]:checked');
                    return checked ? [parseInt(checked.value)] : [];
                };
                const getSelectedModules = () =>
                    Array.from(overlay.querySelectorAll('#moduleAccessBox input[name="modules"]:checked')).map(i => i.value);
                const getSelectedSpecific = () =>
                    Array.from(overlay.querySelectorAll('#specificBox input[name="specific"]:checked')).map(i => i.value);

                const refreshModules = () => {
                    const selectedGroupIds = getSelectedGroupIds();

                    // 判断是升级还是降级
                    // 从无用户组到有用户组，或者从低优先级到高优先级，都视为升级
                    const previousPriority = getGroupPriority(previousGroupIds);
                    const currentPriority = getGroupPriority(selectedGroupIds);
                    const isUpgrade = currentPriority > previousPriority;

                    // 获取当前已选中的模块和子功能（用于降级时保留）
                    const currentCheckedModules = getSelectedModules();
                    const currentCheckedSpecific = getSelectedSpecific();

                    // 刷新模块列表和子功能列表
                    const moduleBox = overlay.querySelector('#moduleAccessBox');
                    const specificBox = overlay.querySelector('#specificBox');

                    if (moduleBox) {
                        moduleBox.innerHTML = renderModules(selectedGroupIds, currentCheckedModules, isUpgrade);
                    }
                    if (specificBox) {
                        specificBox.innerHTML = renderSpecific(selectedGroupIds, currentCheckedSpecific, isUpgrade);
                    }
                };



                // 绑定用户组切换
                overlay.querySelector('#groupBox')?.addEventListener('change', refreshModules);

                // 绑定模块权限全选逻辑
                overlay.addEventListener('change', (e) => {
                    const target = e.target;
                    if (target.classList.contains('user-module-specific-all')) {
                        const mod = target.dataset.userMod;
                        const checked = target.checked;
                        overlay.querySelectorAll(`input[name="specific"][data-user-mod-ref="${mod}"]`).forEach(cb => {
                            cb.checked = checked;
                        });
                    } else if (target.name === 'specific' && target.dataset.userModRef) {
                        const mod = target.dataset.userModRef;
                        const allInMod = overlay.querySelectorAll(`input[name="specific"][data-user-mod-ref="${mod}"]`);
                        const selectAll = overlay.querySelector(`.user-module-specific-all[data-user-mod="${mod}"]`);
                        if (selectAll) {
                            selectAll.checked = Array.from(allInMod).every(cb => cb.checked);
                        }
                    }
                });

                // 初次渲染
                refreshModules();


                // 保存 - 防止重复点击
                let saving = false;
                overlay.querySelector('#savePerms')?.addEventListener('click', async () => {
                    if (saving) {
                        return;
                    }
                    saving = true;

                    const selectedGroupIds = getSelectedGroupIds();
                    const selectedModules = getSelectedModules();
                    const selectedSpecific = getSelectedSpecific();
                    const { wildcard, allowedModules, specific } = computeAllowed(selectedGroupIds);

                    if (!wildcard) {
                        const invalid = selectedModules.filter(m => !allowedModules.has(m));
                        if (invalid.length) {
                            Toast.error(`存在超出用户组的模块：${invalid.join(', ')}`);
                            saving = false;
                            return;
                        }
                        const invalidSpec = selectedSpecific.filter(p => !specific.has(p));
                        if (invalidSpec.length) {
                            Toast.error(`存在超出用户组的子功能：${invalidSpec.join(', ')}`);
                            saving = false;
                            return;
                        }
                    }
                    if (!selectedGroupIds.length && selectedModules.length) {
                        Toast.error('请先选择用户组，再为用户分配模块');
                        saving = false;
                        return;
                    }
                    try {
                        await UserApi.updatePermissions(userId, {
                            module_access: selectedModules,
                            role_ids: selectedGroupIds,
                            specific_perms: selectedSpecific
                        });
                        Toast.success('权限已更新');
                        this._permsModalOpen = false;
                        close();
                        this.loadData();
                    } catch (err) {
                        Toast.error(err.message);
                        saving = false;
                    }
                });

                // 关闭按钮也重置标志
                overlay.querySelectorAll('[data-close]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._permsModalOpen = false;
                    }, { once: true });
                });
            };

            // 绑定权限按钮点击
            this.delegate('click', '[data-perms]', (e, t) => {
                handlePerms(e, t);
            });
        }
    }

    bindFilterEvents() {
        // 为过滤和搜索绑定事件（非委托），避免渲染替换后失效
        const bind = (selector, event, key, handler) => {
            const el = this.$(selector);
            if (!el) return;
            if (this._filterHandlers[key]) {
                el.removeEventListener(event, this._filterHandlers[key]);
            }
            el.addEventListener(event, handler);
            this._filterHandlers[key] = handler;
        };

        bind('#filterRole', 'change', 'roleChange', (e) => this.handleFilter('role', e.target.value));
        bind('#filterStatus', 'change', 'statusChange', (e) => this.handleFilter('is_active', e.target.value));
        bind('#usersSearchBtn', 'click', 'searchClick', () => {
            const keyword = this.$('#usersSearchInput')?.value.trim() || '';
            this.handleFilter('keyword', keyword);
        });
        bind('#usersSearchInput', 'keydown', 'searchEnter', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.$('#usersSearchInput')?.value.trim() || '';
                this.handleFilter('keyword', keyword);
            }
        });
    }

    handleExport() {
        const token = localStorage.getItem(Config.storageKeys.token);
        if (!token) {
            Toast.error('请先登录');
            return;
        }
        window.open(`${ExportApi.exportUsers('xlsx')}&token=${token}`, '_blank');
    }

    destroy() {
        if (this._eventsBinded && this.container) {
            if (this._handlers.roleHandler) {
                this.$('#filterRole')?.removeEventListener('change', this._handlers.roleHandler);
            }
            if (this._handlers.statusHandler) {
                this.$('#filterStatus')?.removeEventListener('change', this._handlers.statusHandler);
            }
            if (this._handlers.searchHandler) {
                this.$('#usersSearchBtn')?.removeEventListener('click', this._handlers.searchHandler);
            }
            if (this._handlers.clickHandler) {
                this.container.removeEventListener('click', this._handlers.clickHandler);
            }
            if (this._handlers.permsClickHandler) {
                this.container.removeEventListener('click', this._handlers.permsClickHandler);
            }
        }
        this._eventsBinded = false;
        this._handlers = {};
    }
}

// 待审核用户页
class PendingUsersPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            users: [],
            selectedUsers: [], // 批量选中的用户ID
            loading: true
        };
        this._eventsBinded = false;
        this._auditing = {};
        this._handlers = {};
    }

    async loadData() {
        this.setState({ loading: true, selectedUsers: [] });

        try {
            const res = await UserApi.getPendingUsers();
            this.setState({
                users: res.data,
                loading: false
            });
        } catch (error) {
            Toast.error('加载待审核用户失败');
            this.setState({ loading: false });
        }
    }

    async handleAudit(userId, isActive) {
        // 防止重复调用
        const key = `audit_${userId}_${isActive}`;
        if (this._auditing && this._auditing[key]) {
            return;
        }
        if (!this._auditing) {
            this._auditing = {};
        }
        this._auditing[key] = true;

        try {
            const action = isActive ? '通过' : '拒绝';
            const actionType = isActive ? 'audit_pass' : 'audit_reject';
            const reason = await Modal.prompt(`审核${action}`, `请输入审核备注（可选）`);

            // 如果用户取消，reason 为 null
            if (reason === null) {
                delete this._auditing[key];
                return;
            }

            try {
                // 使用批量接口处理单个审核，统一逻辑
                await UserApi.batchAction([userId], actionType, reason);
                Toast.success(`用户审核${action}成功`);
                await this.loadData();
            } catch (error) {
                Toast.error(error.message);
            }
        } catch (error) {
            Toast.error(error.message || '审核操作失败');
        } finally {
            delete this._auditing[key];
        }
    }

    async handleBatchAudit(isActive) {
        const { selectedUsers } = this.state;
        if (selectedUsers.length === 0) {
            Toast.warning('请先选择用户');
            return;
        }

        const action = isActive ? '通过' : '拒绝';
        const actionType = isActive ? 'audit_pass' : 'audit_reject';

        const reason = await Modal.prompt(`批量审核${action}`, `确定要${action}选中的 ${selectedUsers.length} 个用户吗？\n请输入审核备注（可选）：`);
        if (reason === null) return;

        try {
            const res = await UserApi.batchAction(selectedUsers, actionType, reason);
            const { operated, skipped } = res.data;
            if (operated.length > 0) {
                Toast.success(`批量审核${action}成功：${operated.length} 个用户`);
            }
            if (skipped.length > 0) {
                Toast.warning(`跳过 ${skipped.length} 个用户`);
            }
            this.setState({ selectedUsers: [] });
            this.loadData();
        } catch (error) {
            Toast.error(`操作失败：${error.message}`);
        }
    }

    render() {
        const { users, loading, selectedUsers } = this.state;

        if (loading) {
            return '<div class="loading"></div>';
        }

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <div>
                        <h1 class="page-title">待审核用户</h1>
                        <p class="page-desc">共 ${users.length} 个待审核用户</p>
                    </div>
                    <div class="page-header-actions">
                        <button class="btn btn-secondary" onclick="window.history.back()">
                            <i class="ri-arrow-left-line"></i> 返回
                        </button>
                    </div>
                </div>

                <!-- 批量操作栏 -->
                ${selectedUsers.length > 0 ? `
                <div class="card" style="margin-bottom: var(--spacing-md); background: rgba(var(--color-primary-rgb), 0.1); border: 1px solid var(--color-primary);">
                    <div class="card-body" style="display: flex; align-items: center; gap: 16px; padding: 12px 16px;">
                        <span style="font-weight: 500; color: var(--color-primary);">
                            <i class="ri-checkbox-multiple-line"></i>
                            已选择 ${selectedUsers.length} 个待审核用户
                        </span>
                        <div style="display: flex; gap: 8px; flex: 1;">
                            <button class="btn btn-sm btn-primary" id="batchAuditPass">
                                <i class="ri-check-line"></i> 批量通过
                            </button>
                            <button class="btn btn-sm btn-secondary" style="color: var(--color-error);" id="batchAuditReject">
                                <i class="ri-close-line"></i> 批量拒绝
                            </button>
                        </div>
                        <button class="btn btn-sm btn-ghost" id="clearSelection">
                            <i class="ri-close-line"></i> 取消选择
                        </button>
                    </div>
                </div>
                ` : ''}
                
                ${users.length > 0 ? `
                    <div class="card">
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th style="width: 40px;">
                                            <input type="checkbox" id="selectAllPending" 
                                                   ${selectedUsers.length === users.length && users.length > 0 ? 'checked' : ''}>
                                        </th>
                                        <th>ID</th>
                                        <th>用户名</th>
                                        <th>手机号</th>
                                        <th>昵称</th>
                                        <th>注册时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => `
                                        <tr>
                                            <td>
                                                <input type="checkbox" class="pending-checkbox" data-user-id="${user.id}" 
                                                       ${selectedUsers.includes(user.id) ? 'checked' : ''}>
                                            </td>
                                            <td>${user.id}</td>
                                            <td>${Utils.escapeHtml(user.username)}</td>
                                            <td>${user.phone || '-'}</td>
                                            <td>${Utils.escapeHtml(user.nickname || '-')}</td>
                                            <td>${Utils.formatDate(user.created_at)}</td>
                                            <td>
                                                <button class="btn btn-ghost btn-sm" data-audit-pass="${user.id}" title="通过"><i class="ri-check-line"></i></button>
                                                <button class="btn btn-ghost btn-sm" data-audit-reject="${user.id}" title="拒绝"><i class="ri-close-line"></i></button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon"><i class="ri-check-double-line"></i></div>
                            <p class="empty-text">暂无待审核用户</p>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        this._auditing = {};
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        if (this.container && !this._eventsBinded) {
            this._eventsBinded = true;

            // 批量选择：全选复选框
            this.delegate('change', '#selectAllPending', (e) => {
                const checked = e.target.checked;
                if (checked) {
                    this.setState({ selectedUsers: this.state.users.map(u => u.id) });
                } else {
                    this.setState({ selectedUsers: [] });
                }
            });

            // 批量选择：单个复选框
            this.delegate('change', '.pending-checkbox', (e) => {
                const userId = parseInt(e.target.dataset.userId);
                const checked = e.target.checked;
                let selectedUsers = [...this.state.selectedUsers];
                if (checked && !selectedUsers.includes(userId)) {
                    selectedUsers.push(userId);
                } else if (!checked) {
                    selectedUsers = selectedUsers.filter(id => id !== userId);
                }
                this.setState({ selectedUsers });
            });

            // 批量操作按钮
            this.delegate('click', '#batchAuditPass', () => this.handleBatchAudit(true));
            this.delegate('click', '#batchAuditReject', () => this.handleBatchAudit(false));
            this.delegate('click', '#clearSelection', () => this.setState({ selectedUsers: [] }));

            // 使用事件委托处理所有点击事件
            const clickHandler = (e) => {
                // 审核通过
                const auditPassBtn = e.target.closest('[data-audit-pass]');
                if (auditPassBtn && this.container.contains(auditPassBtn)) {
                    const userId = parseInt(auditPassBtn.dataset.auditPass);
                    if (userId) this.handleAudit(userId, true);
                    return;
                }

                // 审核拒绝
                const auditRejectBtn = e.target.closest('[data-audit-reject]');
                if (auditRejectBtn && this.container.contains(auditRejectBtn)) {
                    const userId = parseInt(auditRejectBtn.dataset.auditReject);
                    if (userId) this.handleAudit(userId, false);
                    return;
                }
            };
            this._handlers.clickHandler = clickHandler;
            this.container.addEventListener('click', clickHandler);
        }
    }

    destroy() {
        if (this._eventsBinded && this.container && this._handlers?.clickHandler) {
            this.container.removeEventListener('click', this._handlers.clickHandler);
        }
        this._eventsBinded = false;
        this._handlers = {};
    }
}


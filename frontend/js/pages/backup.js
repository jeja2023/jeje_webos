/**
 * 数据备份与恢复页面
 */

class BackupPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            activeTab: 'manual', // 手动, 计划
            backups: [],
            schedules: [], // 调度计划列表
            total: 0,
            page: 1,
            size: 10,
            loading: true,
            creating: false
        };
        this.statusListener = null;
    }

    async loadData() {
        this.setState({ loading: true });
        const { page, size, activeTab } = this.state;

        try {
            if (activeTab === 'manual') {
                const res = await BackupApi.list({ page, size });
                this.setState({
                    backups: res.data?.items || res.items || [],
                    total: res.data?.total || res.total || 0,
                    loading: false
                });
            } else {
                const res = await BackupApi.listSchedules();
                this.setState({
                    schedules: res.data?.items || res.items || [],
                    loading: false
                });
            }
        } catch (e) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    async handleCreate(type) {
        // 创建备份配置弹窗
        const typeLabels = { 'full': '全量备份', 'database': '数据库备份', 'files': '文件备份' };

        // 使用 Modal.show 自定义表单
        const result = await new Promise((resolve) => {
            Modal.show({
                title: `创建${typeLabels[type] || '备份'}`,
                content: `
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div>
                            <label style="display:block;margin-bottom:4px;font-weight:500;">备份备注</label>
                            <input type="text" id="backupNote" class="form-input" placeholder="选填，例如：发布前备份" maxlength="50">
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" id="backupEncrypt" style="width:auto;">
                            <label for="backupEncrypt" style="cursor:pointer;user-select:none;">启用加密存储</label>
                        </div>
                        <div id="passwordArea" style="display:none;">
                            <label style="display:block;margin-bottom:4px;font-weight:500;">加密密码 <span style="color:var(--color-error)">*</span></label>
                            <input type="password" id="backupPassword" class="form-input" placeholder="请输入加密密码">
                            <p style="font-size:12px;color:var(--color-warning);margin-top:4px;"><i class="ri-error-warning-line"></i> 请务必牢记密码，恢复时需要使用</p>
                        </div>
                    </div>
                `,
                onConfirm: () => {
                    const note = document.getElementById('backupNote').value;
                    const isEncrypted = document.getElementById('backupEncrypt').checked;
                    const password = document.getElementById('backupPassword').value;

                    if (isEncrypted && !password) {
                        Toast.error('加密备份必须提供密码');
                        return false; // 阻止关闭
                    }
                    resolve({ note, isEncrypted, password });
                    return true;
                },
                onCancel: () => resolve(null)
            });

            // 简单的事件绑定用于显示/隐藏密码框
            setTimeout(() => {
                const check = document.getElementById('backupEncrypt');
                const area = document.getElementById('passwordArea');
                if (check && area) {
                    check.addEventListener('change', (e) => {
                        area.style.display = e.target.checked ? 'block' : 'none';
                    });
                }
                document.getElementById('backupNote')?.focus();
            }, 100);
        });

        // 用户取消
        if (result === null) return;

        this.setState({ creating: true });
        try {
            await BackupApi.create(type, result.note || '', result.isEncrypted, result.password);
            Toast.success('备份任务已创建，正在后台执行...');

            // 立即刷新一次
            await this.loadData();
        } catch (e) {
            Toast.error(e.message || '创建备份失败');
        } finally {
            this.setState({ creating: false });
        }
    }

    handleStatusUpdate(data) {
        Config.log('收到备份状态更新:', data);

        // 如果当前页面显示的是手动备份列表，且更新的数据项在列表中，则更新状态
        if (this.state.activeTab === 'manual') {
            const backups = [...this.state.backups];
            const index = backups.findIndex(b => b.id == data.id);

            if (index !== -1) {
                // 更新现有记录
                backups[index] = { ...backups[index], status: data.status, error_message: data.message };
                this.setState({ backups });

                // 如果任务完成或失败，显示提示
                if (data.status === 'success') {
                    Toast.success(`备份任务 #${data.id} 已完成`);
                    this.loadData(); // 刷新列表以获取文件大小等信息
                } else if (data.status === 'failed') {
                    Toast.error(`备份任务 #${data.id} 失败: ${data.message}`);
                    this.loadData();
                }
            } else {
                // 如果是新创建的任务，刷新列表
                this.loadData();
            }
        }
    }


    async handleRestore(backupId) {
        // 先检查是否是加密备份
        const backup = this.state.backups.find(b => b.id == backupId);
        const isEncrypted = backup ? backup.is_encrypted : false;

        const confirmRestoreAction = async (password = null) => {
            try {
                const res = await BackupApi.restore(backupId, password);
                Toast.success(res.message || '恢复成功');
                setTimeout(() => window.location.reload(), 1500);
                return true;
            } catch (e) {
                Toast.error(e.message || '恢复失败');
                return false;
            }
        };

        if (isEncrypted) {
            // 加密备份需要输入密码
            Modal.show({
                title: '恢复加密备份',
                content: `
                    <p style="margin-bottom:12px;color:var(--color-warning);"><i class="ri-error-warning-line"></i> 警告：恢复操作将覆盖现有数据！确定要继续吗？</p>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:500;">请输入备份密码</label>
                        <input type="password" id="restorePassword" class="form-input" placeholder="输入解密密码">
                    </div>
                `,
                onConfirm: async () => {
                    const password = document.getElementById('restorePassword').value;
                    if (!password) {
                        Toast.error('请输入密码');
                        return false;
                    }
                    return await confirmRestoreAction(password);
                }
            });
        } else {
            // 普通备份确认
            Modal.confirm({
                title: '确认恢复',
                content: '<p><i class="ri-error-warning-line"></i> 警告：恢复操作将覆盖现有数据！确定要继续吗？</p>',
                onConfirm: async () => {
                    return await confirmRestoreAction();
                }
            });
        }
    }

    // ========== 调度管理相关方法 ==========

    async handleCreateSchedule() {
        // 弹出创建调度表单
        const formHtml = this.getScheduleFormHtml();

        const modal = Modal.show({
            title: '新建备份计划',
            content: formHtml,
            onConfirm: async () => {
                const data = this.getScheduleFormData(modal);
                if (!data) return false;

                try {
                    await BackupApi.createSchedule(data);
                    Toast.success('创建成功');
                    this.loadData();
                    return true;
                } catch (e) {
                    Toast.error(e.message || '创建失败');
                    return false;
                }
            }
        });

        this.bindScheduleFormEvents(modal);
    }

    async handleToggleSchedule(id) {
        try {
            await BackupApi.toggleSchedule(id);
            // 本地更新状态
            const schedules = this.state.schedules.map(s => {
                if (s.id == id) s.is_enabled = !s.is_enabled;
                return s;
            });
            this.setState({ schedules });
            Toast.success('状态已更新');
        } catch (e) {
            Toast.error('操作失败');
        }
    }

    async handleDeleteSchedule(id) {
        Modal.confirm('确认删除', '确定要删除这个自动备份计划吗？', async () => {
            try {
                await BackupApi.deleteSchedule(id);
                Toast.success('计划已删除');
                this.loadData();
            } catch (e) {
                Toast.error('删除失败');
            }
        });
    }

    getScheduleFormHtml() {
        return `
            <div class="form-group">
                <label>计划名称</label>
                <input type="text" id="schName" class="form-input" placeholder="例如：每日全量备份">
            </div>
            <div class="form-group">
                <label>备份类型</label>
                <select id="schType" class="form-input form-select">
                    <option value="full">全量备份</option>
                    <option value="database">仅数据库</option>
                    <option value="files">仅文件</option>
                </select>
            </div>
            <div class="form-row" style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1;">
                    <label>频率</label>
                    <select id="schFreq" class="form-input form-select">
                        <option value="daily">每天</option>
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>时间</label>
                    <input type="time" id="schTime" class="form-input" value="02:00">
                </div>
            </div>
            <div class="form-group" id="schDayWrapper" style="display:none;">
                <label id="schDayLabel">日期</label>
                <select id="schDay" class="form-input form-select"></select>
            </div>
            <div class="form-group">
                <label>保留天数</label>
                <input type="number" id="schRetention" class="form-input" value="30" min="1" max="365">
            </div>
            <div style="margin-top:12px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="schEncrypt" style="width:auto;">
                    <label for="schEncrypt" style="cursor:pointer;">启用加密存储</label>
                </div>
                <div style="margin-left:24px;margin-top:4px;font-size:12px;color:var(--color-text-secondary);">
                    注：自动备份暂时不支持设置密码，将使用系统默认密钥加密（仅限高级版）。<br>
                    当前版本加密功能仅在手动备份中完全支持自定义密码。
                </div>
            </div>
        `;
    }

    bindScheduleFormEvents(modal) {
        const freq = modal.query('#schFreq');
        const dayWrapper = modal.query('#schDayWrapper');
        const daySelect = modal.query('#schDay');
        const dayLabel = modal.query('#schDayLabel');

        if (!freq) return;

        const updateDayOptions = () => {
            const val = freq.value;
            daySelect.innerHTML = '';

            if (val === 'daily') {
                dayWrapper.style.display = 'none';
            } else if (val === 'weekly') {
                dayWrapper.style.display = 'block';
                dayLabel.textContent = '周几';
                ['一', '二', '三', '四', '五', '六', '日'].forEach((d, i) => {
                    daySelect.add(new Option(`周${d}`, i + 1));
                });
            } else if (val === 'monthly') {
                dayWrapper.style.display = 'block';
                dayLabel.textContent = '几号';
                for (let i = 1; i <= 31; i++) {
                    daySelect.add(new Option(`${i}号`, i));
                }
            }
        };

        freq.addEventListener('change', updateDayOptions);
        updateDayOptions(); // 初始化
    }

    getScheduleFormData(modal) {
        const nameEl = modal.query('#schName');
        if (!nameEl || !nameEl.value) {
            Toast.error('请输入计划名称');
            return null;
        }

        const freqEl = modal.query('#schFreq');
        const schDayEl = modal.query('#schDay');
        const schEncryptEl = modal.query('#schEncrypt');
        const schRetentionEl = modal.query('#schRetention');
        const schTypeEl = modal.query('#schType');
        const schTimeEl = modal.query('#schTime');

        if (!freqEl || !schEncryptEl || !schRetentionEl || !schTypeEl || !schTimeEl) {
            Toast.error('表单数据不完整');
            return null;
        }

        return {
            name: nameEl.value,
            backup_type: schTypeEl.value,
            schedule_type: freqEl.value,
            schedule_time: schTimeEl.value,
            schedule_day: freqEl.value !== 'daily' && schDayEl ?
                parseInt(schDayEl.value) : null,
            is_encrypted: schEncryptEl.checked,
            retention_days: parseInt(schRetentionEl.value) || 30,
            is_enabled: true
        };
    }

    async handleDelete(backupId) {
        Modal.confirm('确认删除', '确定要删除这个备份吗？', async () => {
            try {
                await BackupApi.delete(backupId);
                Toast.success('备份已删除');
                this.loadData();
            } catch (e) {
                Toast.error(e.message || '删除失败');
            }
        });
    }

    handleDownload(backupId) {
        const token = localStorage.getItem(Config.storageKeys.token);
        window.open(`${BackupApi.download(backupId)}?token=${token}`, '_blank');
    }

    formatSize(bytes) {
        if (!bytes) return '-';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }

    getStatusTag(status, errorMessage) {
        const map = {
            'pending': '<span class="tag tag-warning">等待中</span>',
            'running': '<span class="tag tag-info">执行中</span>',
            'success': '<span class="tag tag-primary">已完成</span>',
            'failed': `<span class="tag tag-danger" title="${Utils.escapeHtml(errorMessage || '未知错误')}">失败</span>`
        };
        return map[status] || `<span class="tag">${status}</span>`;
    }

    getTypeLabel(type) {
        const map = {
            'full': '全量备份',
            'database': '数据库',
            'files': '文件'
        };
        return map[type] || type;
    }

    changePage(page) {
        this.state.page = page;
        this.loadData();
    }

    render() {
        const { backups, schedules, total, page, size, loading, creating, activeTab } = this.state;
        const pages = Math.ceil(total / size) || 1;

        return `
            <div class="page fade-in">
                <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <a href="#/system/settings" class="btn btn-ghost btn-sm" title="返回系统设置"><i class="ri-arrow-left-line"></i></a>
                        <div>
                            <h1 class="page-title" style="margin:0;"><i class="ri-hard-drive-2-line"></i> 数据备份</h1>
                            <p class="page-desc" style="margin:0;">创建和管理系统备份</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('backup', '数据备份') : ''}
                    </div>
                </div>

                <!-- Tab 切换 -->
                <div class="tabs" style="margin-bottom:var(--spacing-md);border-bottom:1px solid var(--color-border);">
                    <div class="tab-item ${activeTab === 'manual' ? 'active' : ''}" data-tab="manual" style="padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;font-weight:500;color:var(--color-text-secondary);">
                        <i class="ri-hand-coin-line"></i> 手动备份
                    </div>
                    <div class="tab-item ${activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule" style="padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;font-weight:500;color:var(--color-text-secondary);">
                        <i class="ri-calendar-todo-line"></i> 自动调度
                    </div>
                </div>

                ${activeTab === 'manual' ? this.renderManualTab(backups, loading, creating, page, pages) : this.renderScheduleTab(schedules, loading)}
            </div>
        `;
    }

    renderManualTab(backups, loading, creating, page, pages) {
        return `
            <div class="card" style="margin-bottom: var(--spacing-lg);">
                <div class="card-header">
                    <h3 class="card-title"><i class="ri-add-circle-line"></i> 创建备份</h3>
                </div>
                <div class="card-body">
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button class="btn btn-secondary" data-create="full" ${creating ? 'disabled' : ''}>
                            <i class="ri-hard-drive-2-line"></i> 全量备份
                        </button>
                        <button class="btn btn-secondary" data-create="database" ${creating ? 'disabled' : ''}>
                            <i class="ri-database-2-line"></i> 仅数据库
                        </button>
                        <button class="btn btn-secondary" data-create="files" ${creating ? 'disabled' : ''}>
                            <i class="ri-folder-3-line"></i> 仅文件
                        </button>
                    </div>
                    <p style="margin-top: 12px; color: var(--color-text-secondary); font-size: 14px;">
                        <i class="ri-lightbulb-line"></i> 提示：全量备份包含数据库和所有上传的文件。支持加密存储。
                    </p>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="ri-history-line"></i> 备份历史</h3>
                    <button class="btn btn-ghost btn-sm" id="refreshBackups"><i class="ri-refresh-line"></i> 刷新</button>
                </div>
                ${loading ? '<div class="loading"></div>' : backups.length === 0 ? `
                    <div class="empty-state" style="padding: 60px 0;">
                        <div class="empty-icon"><i class="ri-hard-drive-2-line"></i></div>
                        <p class="empty-text">暂无备份记录</p>
                        <p style="color: var(--color-text-secondary);">点击上方按钮创建第一个备份</p>
                    </div>
                ` : `
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>备份信息</th>
                                    <th style="width: 100px;">类型</th>
                                    <th style="width: 80px;">大小</th>
                                    <th style="width: 100px;">状态</th>
                                    <th style="width: 150px;">创建时间</th>
                                    <th style="width: 160px; text-align: center;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${backups.map(b => `
                                    <tr>
                                        <td>
                                            <div style="display:flex;flex-direction:column;gap:2px;">
                                                <div style="display:flex;align-items:center;gap:4px;">
                                                    <span style="font-weight:500;">${Utils.escapeHtml(b.filename || b.name || `备份 #${b.id}`)}</span>
                                                    ${b.is_encrypted ? '<i class="ri-lock-2-line" title="已加密" style="color:var(--color-success);font-size:14px;"></i>' : ''}
                                                </div>
                                                ${b.description ? `<small style="color:var(--color-text-secondary);" title="${Utils.escapeHtml(b.description)}"><i class="ri-sticky-note-line"></i> ${Utils.escapeHtml(b.description.substring(0, 40))}${b.description.length > 40 ? '...' : ''}</small>` : ''}
                                                ${b.error_message ? `<small style="color:var(--color-error);font-size:12px;" title="${Utils.escapeHtml(b.error_message)}"><i class="ri-error-warning-line"></i> ${Utils.escapeHtml(b.error_message.substring(0, 30))}${b.error_message.length > 30 ? '...' : ''}</small>` : ''}
                                            </div>
                                        </td>
                                        <td><span class="tag">${this.getTypeLabel(b.backup_type)}</span></td>
                                        <td>${this.formatSize(b.file_size)}</td>
                                        <td>${this.getStatusTag(b.status, b.error_message)}</td>
                                        <td>${Utils.formatDate(b.created_at)}</td>
                                        <td>
                                            <div class="backup-actions">
                                                ${b.status === 'success' ? `
                                                    <button class="btn btn-ghost btn-sm" data-download="${Utils.escapeHtml(String(b.id))}" title="下载备份"><i class="ri-download-line"></i></button>
                                                    <button class="btn btn-ghost btn-sm" data-restore="${Utils.escapeHtml(String(b.id))}" title="恢复数据"><i class="ri-refresh-line"></i></button>
                                                ` : `
                                                    <span class="btn-placeholder"></span>
                                                    <span class="btn-placeholder"></span>
                                                `}
                                                <button class="btn btn-ghost btn-sm btn-danger-hover" data-delete="${Utils.escapeHtml(String(b.id))}" title="删除备份"><i class="ri-delete-bin-line"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${Utils.renderPagination(page, pages)}
                `}
            </div>
        `;
    }

    renderScheduleTab(schedules, loading) {
        const getFreqLabel = (s) => {
            const time = s.schedule_time;
            if (s.schedule_type === 'daily') return `每天 ${time}`;
            if (s.schedule_type === 'weekly') {
                const days = ['一', '二', '三', '四', '五', '六', '日'];
                return `每周${days[s.schedule_day - 1] || s.schedule_day} ${time}`;
            }
            if (s.schedule_type === 'monthly') return `每月${s.schedule_day}号 ${time}`;
            return s.schedule_type;
        };

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="ri-calendar-check-line"></i> 自动备份计划</h3>
                    <button class="btn btn-primary btn-sm" id="createSchedule"><i class="ri-add-line"></i> 新建计划</button>
                </div>
                ${loading ? '<div class="loading"></div>' : schedules.length === 0 ? `
                    <div class="empty-state" style="padding: 60px 0;">
                        <div class="empty-icon"><i class="ri-time-line"></i></div>
                        <p class="empty-text">暂无自动备份计划</p>
                        <p style="color: var(--color-text-secondary);">点击上方按钮创建自动备份任务</p>
                    </div>
                ` : `
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>计划名称</th>
                                    <th>类型</th>
                                    <th>执行频率</th>
                                    <th>下次执行</th>
                                    <th>保留策略</th>
                                    <th>状态</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${schedules.map(s => `
                                    <tr>
                                        <td>
                                            <div style="font-weight:500;">${Utils.escapeHtml(s.name)}</div>
                                            ${s.is_encrypted ? '<small style="color:var(--color-success);"><i class="ri-lock-2-line"></i> 加密存储</small>' : ''}
                                        </td>
                                        <td><span class="tag">${this.getTypeLabel(s.backup_type)}</span></td>
                                        <td>${getFreqLabel(s)}</td>
                                        <td>${Utils.formatDate(s.next_run_at)}</td>
                                        <td>保留 ${s.retention_days} 天</td>
                                        <td>
                                            <label class="switch">
                                                <input type="checkbox" ${s.is_enabled ? 'checked' : ''} data-toggle-sch="${Utils.escapeHtml(String(s.id))}">
                                                <span class="slider round"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <button class="btn btn-ghost btn-sm btn-danger-hover" data-delete-sch="${Utils.escapeHtml(String(s.id))}" title="删除计划"><i class="ri-delete-bin-line"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();

        // 注册 WebSocket 监听器
        this.statusListener = (data) => this.handleStatusUpdate(data);
        if (window.WebSocketClient) {
            WebSocketClient.on('system.backup_status', this.statusListener);
        }

        // 样式修正：Tab 选中效果
        const style = document.createElement('style');
        style.innerHTML = `
            .tab-item.active {
                color: var(--color-primary) !important;
                border-bottom-color: var(--color-primary) !important;
            }
            .tab-item:hover {
                color: var(--color-primary);
                background: var(--color-bg-secondary);
            }
        `;
        this.container.appendChild(style);

        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }


    }

    destroy() {
        // 移除 WebSocket 监听器
        if (this.statusListener && window.WebSocketClient) {
            WebSocketClient.off('system.backup_status', this.statusListener);
        }
        super.destroy();
    }

    afterUpdate() {
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        // Tab 切换
        this.delegate('click', '[data-tab]', (e, t) => {
            const tab = t.dataset.tab;
            if (tab !== this.state.activeTab) {
                this.setState({ activeTab: tab });
                this.loadData();
            }
        });

        // 通用操作 (无论哪个 Tab)
        this.delegate('click', '#refreshBackups', () => this.loadData());

        // 手动备份页签事件
        this.delegate('click', '[data-create]', (e, t) => this.handleCreate(t.dataset.create));
        this.delegate('click', '[data-download]', (e, t) => this.handleDownload(t.dataset.download));
        this.delegate('click', '[data-restore]', (e, t) => this.handleRestore(t.dataset.restore));
        this.delegate('click', '[data-delete]', (e, t) => this.handleDelete(t.dataset.delete));
        this.delegate('click', '[data-page]', (e, t) => {
            const p = parseInt(t.dataset.page);
            if (p > 0) this.changePage(p);
        });

        // 调度计划页签事件
        this.delegate('click', '#createSchedule', () => this.handleCreateSchedule());
        this.delegate('click', '[data-delete-sch]', (e, t) => this.handleDeleteSchedule(t.dataset.deleteSch));
        this.delegate('change', '[data-toggle-sch]', (e, t) => this.handleToggleSchedule(t.dataset.toggleSch));
    }
}



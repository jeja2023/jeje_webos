/**
 * 系统监控页面
 */

class MonitorPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            system: null,
            process: null,
            loading: true,
            refreshInterval: null
        };
    }

    async loadData() {
        try {
            const [sysRes, procRes, statsRes] = await Promise.all([
                MonitorApi.getSystem(),
                MonitorApi.getProcess(),
                SystemApi.getStats().catch(() => ({ data: {} }))
            ]);
            this.setState({
                system: sysRes.data || sysRes,
                process: procRes.data || procRes,
                health: statsRes.data?.health || {},
                loading: false
            });
        } catch (e) {
            Toast.error('加载监控数据失败');
            this.setState({ loading: false });
        }
    }

    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }

    formatUptime(seconds) {
        if (!seconds) return '-';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (days > 0) return `${days}天 ${hours}小时`;
        if (hours > 0) return `${hours}小时 ${mins}分钟`;
        return `${mins}分钟`;
    }

    getProgressColor(percent) {
        if (percent >= 90) return 'var(--color-error)';
        if (percent >= 70) return 'var(--color-warning)';
        return 'var(--color-primary)';
    }

    renderProgressBar(percent, label) {
        const color = this.getProgressColor(percent);
        return `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 6px;">
                    <span style="font-size: 13px; color: var(--color-text-secondary);">${label}</span>
                    <span style="font-weight: 600; font-size: 18px; line-height: 1;">${percent.toFixed(1)}%</span>
                </div>
                <div style="height: 6px; background: var(--color-bg-tertiary); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${percent}%; background: ${color}; border-radius: 3px; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    render() {
        const { system, process, health, loading } = this.state;

        if (loading) {
            return `
                <div class="page fade-in">
                    <div class="page-header">
                        <h1 class="page-title">系统监控</h1>
                    </div>
                    <div class="loading"></div>
                </div>
            `;
        }

        const cpu = system?.cpu || {};
        const memory = system?.memory || {};
        const disk = system?.disk || {};
        const dbStatus = health?.database || 'unknown';
        const redisStatus = health?.redis || 'unknown';

        return `
            <div class="page fade-in">
                <div class="page-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <a href="#/system/settings" class="btn btn-ghost btn-sm" title="返回系统设置"><i class="ri-arrow-left-line"></i></a>
                        <div>
                            <h1 class="page-title" style="margin:0;"><i class="ri-line-chart-line"></i> 系统监控</h1>
                            <p class="page-desc" style="margin:0;font-size:13px;color:var(--color-text-secondary);">实时系统资源监控 · 每30秒自动刷新</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('monitor', '系统监控') : ''}
                        <button class="btn btn-secondary btn-sm" id="refreshMonitor"><i class="ri-refresh-line"></i> 刷新</button>
                    </div>
                </div>

                <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
                    <!-- CPU 使用率 -->
                    <div class="card">
                        <div class="card-header" style="padding: 12px 16px;">
                            <h3 class="card-title" style="font-size: 15px;"><i class="ri-cpu-line"></i> CPU</h3>
                        </div>
                        <div class="card-body" style="padding: 16px; padding-top: 4px;">
                            ${this.renderProgressBar(cpu.percent || 0, '使用率')}
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                <div>
                                    <div style="color: var(--color-text-secondary);">核心数</div>
                                    <div style="font-weight: 600;">${cpu.cores || '-'}</div>
                                </div>
                                <div>
                                    <div style="color: var(--color-text-secondary);">逻辑处理器</div>
                                    <div style="font-weight: 600;">${cpu.logical_cores || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 内存使用率 -->
                    <div class="card">
                        <div class="card-header" style="padding: 12px 16px;">
                            <h3 class="card-title" style="font-size: 15px;"><i class="ri-hard-drive-2-line"></i> 内存</h3>
                        </div>
                        <div class="card-body" style="padding: 16px; padding-top: 4px;">
                            ${this.renderProgressBar(memory.percent || 0, '使用率')}
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                <div>
                                    <div style="color: var(--color-text-secondary);">已使用</div>
                                    <div style="font-weight: 600;">${this.formatBytes(memory.used)}</div>
                                </div>
                                <div>
                                    <div style="color: var(--color-text-secondary);">总计</div>
                                    <div style="font-weight: 600;">${this.formatBytes(memory.total)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 磁盘使用率 -->
                    <div class="card">
                        <div class="card-header" style="padding: 12px 16px;">
                            <h3 class="card-title" style="font-size: 15px;"><i class="ri-save-line"></i> 磁盘</h3>
                        </div>
                        <div class="card-body" style="padding: 16px; padding-top: 4px;">
                            ${this.renderProgressBar(disk.percent || 0, '使用率')}
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                <div>
                                    <div style="color: var(--color-text-secondary);">已使用</div>
                                    <div style="font-weight: 600;">${this.formatBytes(disk.used)}</div>
                                </div>
                                <div>
                                    <div style="color: var(--color-text-secondary);">总计</div>
                                    <div style="font-weight: 600;">${this.formatBytes(disk.total)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 服务健康状态 -->
                <div class="card" style="margin-top: 16px;">
                    <div class="card-header" style="padding: 12px 16px;">
                        <h3 class="card-title" style="font-size: 15px;"><i class="ri-heart-pulse-line"></i> 服务状态</h3>
                    </div>
                    <div class="card-body" style="padding: 16px;">
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <!-- 数据库状态 -->
                            <div class="health-status-card ${dbStatus === 'ok' ? 'status-ok' : 'status-error'}" style="flex: 1; min-width: 200px; padding: 12px;">
                                <div class="health-icon" style="font-size: 24px;"><i class="ri-database-2-line"></i></div>
                                <div class="health-info">
                                    <div class="health-name" style="font-size: 14px;">数据库 (${Utils.escapeHtml(health?.db_type || 'SQLite')})</div>
                                    <div class="health-status" style="font-size: 13px;">
                                        <span class="status-indicator ${dbStatus === 'ok' ? 'ok' : 'error'}" style="width: 8px; height: 8px;"></span>
                                        <span>${dbStatus === 'ok' ? '正常运行' : '连接异常'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Redis 状态 -->
                            <div class="health-status-card ${redisStatus === 'ok' ? 'status-ok' : redisStatus === 'disabled' ? 'status-disabled' : 'status-error'}" style="flex: 1; min-width: 200px; padding: 12px;">
                                <div class="health-icon" style="font-size: 24px;"><i class="ri-server-line"></i></div>
                                <div class="health-info">
                                    <div class="health-name" style="font-size: 14px;">Redis 缓存</div>
                                    <div class="health-status" style="font-size: 13px;">
                                        <span class="status-indicator ${redisStatus === 'ok' ? 'ok' : redisStatus === 'disabled' ? 'disabled' : 'error'}" style="width: 8px; height: 8px;"></span>
                                        <span>${redisStatus === 'ok' ? '正常运行' : redisStatus === 'disabled' ? '未启用' : '连接异常'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-top: 16px;">
                    <!-- 进程信息 -->
                    <div class="card">
                        <div class="card-header" style="padding: 12px 16px;">
                            <h3 class="card-title" style="font-size: 15px;"><i class="ri-bar-chart-box-line"></i> 进程信息</h3>
                        </div>
                        <div class="card-body" style="padding: 16px;">
                            <div style="display: flex; flex-wrap: wrap; gap: 24px; row-gap: 16px;">
                                <div style="min-width: 80px;">
                                    <div style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 2px;">进程 ID</div>
                                    <div style="font-size: 18px; font-weight: 600;">${Utils.escapeHtml(String(process?.pid || '-'))}</div>
                                </div>
                                <div style="min-width: 80px;">
                                    <div style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 2px;">运行时间</div>
                                    <div style="font-size: 18px; font-weight: 600;">${this.formatUptime(process?.uptime)}</div>
                                </div>
                                <div style="min-width: 80px;">
                                    <div style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 2px;">进程内存</div>
                                    <div style="font-size: 18px; font-weight: 600;">${this.formatBytes(process?.memory_info?.rss)}</div>
                                </div>
                                <div style="min-width: 80px;">
                                    <div style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 2px;">进程 CPU</div>
                                    <div style="font-size: 18px; font-weight: 600;">${(process?.cpu_percent || 0).toFixed(1)}%</div>
                                </div>
                                <div style="min-width: 80px;">
                                    <div style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 2px;">线程数</div>
                                    <div style="font-size: 18px; font-weight: 600;">${process?.num_threads || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 系统信息 -->
                    <div class="card">
                        <div class="card-header" style="padding: 12px 16px;">
                            <h3 class="card-title" style="font-size: 15px;"><i class="ri-information-line"></i> 系统信息</h3>
                        </div>
                        <div class="card-body" style="padding: 16px;">
                            <div style="display: grid; gap: 8px; font-size: 13px;">
                                <div style="display: flex; gap: 12px; align-items: center;">
                                    <span style="color: var(--color-text-secondary); width: 70px;">操作系统</span>
                                    <span style="font-weight: 500;">${Utils.escapeHtml(system?.platform || '-')}</span>
                                </div>
                                <div style="display: flex; gap: 12px; align-items: center;">
                                    <span style="color: var(--color-text-secondary); width: 70px;">主机名</span>
                                    <span style="font-weight: 500;">${Utils.escapeHtml(system?.hostname || '-')}</span>
                                </div>
                                <div style="display: flex; gap: 12px; align-items: center;">
                                    <span style="color: var(--color-text-secondary); width: 70px;">运行时间</span>
                                    <span style="font-weight: 500;">${this.formatUptime(system?.boot_time)}</span>
                                </div>
                                <div style="display: flex; gap: 12px; align-items: center;">
                                    <span style="color: var(--color-text-secondary); width: 70px;">Python</span>
                                    <span style="font-weight: 500;">${Utils.escapeHtml(system?.python_version || '-')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .health-status-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    border-radius: 12px;
                    background: var(--color-bg-secondary);
                    border: 1px solid transparent;
                    transition: all 0.2s;
                }
                
                .health-status-card.status-ok {
                    border-color: rgba(16, 185, 129, 0.3);
                    background: rgba(16, 185, 129, 0.05);
                }
                
                .health-status-card.status-error {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: rgba(239, 68, 68, 0.05);
                }
                
                .health-status-card.status-disabled {
                    border-color: rgba(156, 163, 175, 0.3);
                    background: rgba(156, 163, 175, 0.05);
                }
                
                .health-icon {
                    font-size: 32px;
                    flex-shrink: 0;
                }
                
                .health-info {
                    flex: 1;
                }
                
                .health-name {
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    margin-bottom: 4px;
                }
                
                .health-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: var(--color-text-secondary);
                }
                
                .status-indicator {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    display: inline-block;
                }
                
                .status-indicator.ok {
                    background: #10b981;
                    box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
                }
                
                .status-indicator.error {
                    background: #ef4444;
                    box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
                }
                
                .status-indicator.disabled {
                    background: #9ca3af;
                }
            </style>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
        // 自动刷新（每30秒）
        this.setInterval(() => {
            this.loadData();
        }, 30000);
    }

    afterUpdate() {
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    destroy() {
        super.destroy();
    }

    bindEvents() {
        if (this.container && !this.container._bindMonitor) {
            this.container._bindMonitor = true;

            this.delegate('click', '#refreshMonitor', () => {
                this.loadData();
            });
        }
    }
}




// 将 MonitorPage 导出到全局作用域以支持动态加载
window.MonitorPage = MonitorPage;
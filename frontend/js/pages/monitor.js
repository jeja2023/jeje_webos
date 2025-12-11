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
            const [sysRes, procRes] = await Promise.all([
                MonitorApi.getSystem(),
                MonitorApi.getProcess()
            ]);
            this.setState({
                system: sysRes.data || sysRes,
                process: procRes.data || procRes,
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
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>${label}</span>
                    <span style="font-weight: 600;">${percent.toFixed(1)}%</span>
                </div>
                <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${percent}%; background: ${color}; border-radius: 4px; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    render() {
        const { system, process, loading } = this.state;

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

        return `
            <div class="page fade-in">
                <div class="page-header">
                    <h1 class="page-title">系统监控</h1>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary" id="refreshMonitor">🔄 刷新</button>
                    </div>
                </div>

                <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
                    <!-- CPU 使用率 -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">🖥️ CPU</h3>
                        </div>
                        <div class="card-body">
                            ${this.renderProgressBar(cpu.percent || 0, '使用率')}
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                                <div>
                                    <div style="color: var(--text-secondary);">核心数</div>
                                    <div style="font-weight: 600;">${cpu.cores || '-'}</div>
                                </div>
                                <div>
                                    <div style="color: var(--text-secondary);">逻辑处理器</div>
                                    <div style="font-weight: 600;">${cpu.logical_cores || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 内存使用率 -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">💾 内存</h3>
                        </div>
                        <div class="card-body">
                            ${this.renderProgressBar(memory.percent || 0, '使用率')}
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                                <div>
                                    <div style="color: var(--text-secondary);">已使用</div>
                                    <div style="font-weight: 600;">${this.formatBytes(memory.used)}</div>
                                </div>
                                <div>
                                    <div style="color: var(--text-secondary);">总计</div>
                                    <div style="font-weight: 600;">${this.formatBytes(memory.total)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 磁盘使用率 -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">💿 磁盘</h3>
                        </div>
                        <div class="card-body">
                            ${this.renderProgressBar(disk.percent || 0, '使用率')}
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                                <div>
                                    <div style="color: var(--text-secondary);">已使用</div>
                                    <div style="font-weight: 600;">${this.formatBytes(disk.used)}</div>
                                </div>
                                <div>
                                    <div style="color: var(--text-secondary);">总计</div>
                                    <div style="font-weight: 600;">${this.formatBytes(disk.total)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 进程信息 -->
                <div class="card" style="margin-top: var(--spacing-lg);">
                    <div class="card-header">
                        <h3 class="card-title">📊 进程信息</h3>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px;">
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">进程 ID</div>
                                <div style="font-size: 24px; font-weight: 600;">${process?.pid || '-'}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">运行时间</div>
                                <div style="font-size: 24px; font-weight: 600;">${this.formatUptime(process?.uptime)}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">内存占用</div>
                                <div style="font-size: 24px; font-weight: 600;">${this.formatBytes(process?.memory_info?.rss)}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">CPU 使用</div>
                                <div style="font-size: 24px; font-weight: 600;">${(process?.cpu_percent || 0).toFixed(1)}%</div>
                            </div>
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">线程数</div>
                                <div style="font-size: 24px; font-weight: 600;">${process?.num_threads || '-'}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-secondary); margin-bottom: 4px;">打开文件数</div>
                                <div style="font-size: 24px; font-weight: 600;">${process?.open_files || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 系统信息 -->
                <div class="card" style="margin-top: var(--spacing-lg);">
                    <div class="card-header">
                        <h3 class="card-title">ℹ️ 系统信息</h3>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; font-size: 14px;">
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                <span style="color: var(--text-secondary);">操作系统</span>
                                <span>${system?.platform || '-'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                <span style="color: var(--text-secondary);">主机名</span>
                                <span>${system?.hostname || '-'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                <span style="color: var(--text-secondary);">系统运行时间</span>
                                <span>${this.formatUptime(system?.boot_time)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                <span style="color: var(--text-secondary);">Python 版本</span>
                                <span>${system?.python_version || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        // 自动刷新（每30秒）- 仅在当前路由是监控页时刷新
        this.state.refreshInterval = setInterval(() => {
            // 检查当前路由是否仍在监控页面
            const currentRoute = Store.get('currentRoute');
            if (currentRoute === '/system/monitor') {
                this.loadData();
            } else {
                // 不在监控页了，清理定时器
                this.cleanup();
            }
        }, 30000);
    }

    afterUpdate() {
        this.bindEvents();
    }

    cleanup() {
        if (this.state.refreshInterval) {
            clearInterval(this.state.refreshInterval);
            this.state.refreshInterval = null;
        }
    }

    destroy() {
        this.cleanup();
        super.destroy();
    }

    bindEvents() {
        if (this.container && !this.container._bindedMonitor) {
            this.container._bindedMonitor = true;

            this.delegate('click', '#refreshMonitor', () => {
                this.loadData();
            });
        }
    }
}



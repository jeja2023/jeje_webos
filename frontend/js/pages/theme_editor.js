/**
 * 主题编辑器
 * 可视化编辑系统主题与配色
 */

class ThemeEditorPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            mode: Store.get('theme') || 'auto',
            customConfig: JSON.parse(localStorage.getItem('user_theme_custom_config') || '{}'),
            presetColors: {
                'bg-deep': '#f3f4f6',
                'bg-primary': '#ffffff',
                'bg-secondary': '#ffffff',
                'accent': '#2563eb',
                'text-primary': '#111827'
            }
        };

        // 定义可编辑的变量映射
        this.variables = [
            {
                group: '背景色彩', items: [
                    { key: '--color-bg-deep', label: '全局背景', type: 'color' },
                    { key: '--color-bg-primary', label: '主要容器', type: 'color' },
                    { key: '--color-bg-secondary', label: '次要容器', type: 'color' },
                    { key: '--color-bg-tertiary', label: '输入框背景', type: 'color' },
                    { key: '--color-bg-hover', label: '悬停背景', type: 'color' }
                ]
            },
            {
                group: '强调色彩', items: [
                    { key: '--color-primary', label: '主色调', type: 'color' },
                    { key: '--color-primary-hover', label: '浅色调', type: 'color' },
                    { key: '--color-primary-dark', label: '深色调', type: 'color' }
                ]
            },
            {
                group: '文字色彩', items: [
                    { key: '--color-text-primary', label: '主要文字', type: 'color' },
                    { key: '--color-text-secondary', label: '次要文字', type: 'color' },
                    { key: '--color-text-tertiary', label: '提示文字', type: 'color' },
                    { key: '--color-text-inverse', label: '反色文字', type: 'color' }
                ]
            },
            {
                group: '边框与状态', items: [
                    { key: '--color-border', label: '边框颜色', type: 'color' },
                    { key: '--color-success', label: '成功状态', type: 'color' },
                    { key: '--color-error', label: '错误状态', type: 'color' },
                    { key: '--color-warning', label: '警告状态', type: 'color' }
                ]
            }
        ];
    }

    // 获取当前生效的变量值
    getCurrentValue(key) {
        if (this.state.mode === 'custom' && this.state.customConfig[key]) {
            return this.state.customConfig[key];
        }
        // 获取计算样式
        return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    }

    render() {
        const { mode } = this.state;

        return `
            <div class="page theme-editor-page fade-in">
                <div class="page-header">
                    <h1 class="page-title">主题编辑器</h1>
                    <p class="page-desc">个性化定制您的桌面外观</p>
                </div>

                <div class="alert-info">
                    <span>🎨</span>
                    <span>所选更改将实时应用。若要在不同设备间同步，请联系管理员更新系统设置。</span>
                </div>

                <h3 style="margin-bottom: 15px;">预设主题</h3>
                <div class="theme-grid">
                    ${this.renderThemeCard('light', '浅色模式', '#ffffff', '#111827')}
                    ${this.renderThemeCard('dark', '深色模式', '#1c1c1e', '#ffffff')}
                    ${this.renderThemeCard('sunrise', '日出印象', 'linear-gradient(to top, #FF9A56, #FFCDA8, #A8DADC)', '#264653')}
                    ${this.renderThemeCard('neon', '星夜霓虹', 'linear-gradient(135deg, #1A1A2E, #16213E)', '#ffffff')}
                    ${this.renderThemeCard('summer', '仲夏之夜', 'linear-gradient(to bottom, #0c1445, #1a237e, #311b92)', '#e8e8f0')}
                    ${this.renderThemeCard('winter', '冬日暖阳', 'linear-gradient(135deg, #eceff1, #cfd8dc, #ffb74d)', '#37474f')}
                    ${this.renderThemeCard('spring', '春意盎然', 'linear-gradient(135deg, #e8f5e9, #c8e6c9, #f8bbd9)', '#1b5e20')}
                    ${this.renderThemeCard('autumn', '秋日私语', 'linear-gradient(to bottom, #fff8e1, #ffe0b2, #d7ccc8)', '#4e342e')}
                    ${this.renderThemeCard('custom', '自定义', 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)', 'var(--color-text-primary)')}
                </div>

                ${mode === 'custom' ? this.renderCustomEditor() : ''}
            </div>
        `;
    }

    renderThemeCard(key, name, bg, text) {
        const isActive = this.state.mode === key;
        return `
            <div class="theme-card ${isActive ? 'active' : ''}" data-mode="${key}">
                <div class="theme-card-preview" style="background: ${bg}; color: ${text}; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 24px;">Aa</span>
                </div>
                <div class="theme-name">${name}</div>
            </div>
        `;
    }

    renderCustomEditor() {
        return `
            <div class="custom-editor fade-in">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>自定义配色</h3>
                    <div class="btn-group">
                        <input type="file" id="importThemeFile" accept=".json" style="display:none;">
                        <button class="btn btn-secondary btn-sm" id="btnImportTheme">📥 导入</button>
                        <button class="btn btn-secondary btn-sm" id="btnExportTheme">📤 导出</button>
                        <button class="btn btn-ghost btn-danger btn-sm" id="btnResetTheme">🔄 重置</button>
                    </div>
                </div>

                <!-- 组件预览区 -->
                <div class="var-group" style="margin-bottom: 24px;">
                    <div class="var-group-title">效果预览</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                        <button class="btn btn-primary">主按钮</button>
                        <button class="btn btn-secondary">次按钮</button>
                        <span class="tag tag-primary">标签</span>
                        <input type="text" class="form-input" placeholder="输入框提示文字" style="max-width: 180px;">
                    </div>
                </div>

                ${this.variables.map(group => `
                    <div class="var-group">
                        <div class="var-group-title">${group.group}</div>
                        <div class="var-list">
                            ${group.items.map(item => {
            const val = this.getCurrentValue(item.key);
            return `
                                    <div class="var-item">
                                        <div class="var-label">${item.label}</div>
                                        <div class="color-input-wrapper">
                                            <input type="color" class="color-input" 
                                                   data-var="${item.key}" 
                                                   value="${this.formatColor(val)}">
                                            <input type="text" class="color-text" 
                                                   data-var-text="${item.key}"
                                                   value="${val}">
                                        </div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 辅助：处理颜色格式，保证 input type=color 能识别 (hex 6位)
    formatColor(color) {
        if (!color) return '#000000';
        // 简单处理，如果是 hex 且长度不够，或者非 hex，可能不显示
        // 实际场景中 computedStyle 返回往往是 rgb()
        if (color.startsWith('rgb')) {
            return this.rgbToHex(color);
        }
        return color.substring(0, 7);
    }

    rgbToHex(rgb) {
        // rgb(r, g, b) -> #rrggbb
        const res = rgb.match(/\d+/g);
        if (!res) return '#000000';
        return '#' + res.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    afterMount() {
        this.bindEvents();
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedTheme) {
            this.container._bindedTheme = true;

            // 切换模式
            this.delegate('click', '.theme-card', (e, t) => {
                const mode = t.dataset.mode;
                if (mode === this.state.mode) return;

                this.state.mode = mode;
                Store.setTheme(mode);
                this.update(); // 重新渲染以显示/隐藏自定义编辑器
            });

            // 颜色改变 (实时)
            this.delegate('input', '.color-input', (e, t) => {
                const key = t.dataset.var;
                const value = t.value;
                this.updateCustomTheme(key, value);

                // 同步文本框
                const textInput = this.container.querySelector(`[data-var-text="${key}"]`);
                if (textInput) textInput.value = value;
            });

            // 文本框改变
            this.delegate('change', '.color-text', (e, t) => {
                const key = t.dataset.varText;
                const value = t.value;
                this.updateCustomTheme(key, value);

                // 同步颜色选择器 (如果是有效 hex)
                if (value.startsWith('#') && value.length === 7) {
                    const colorInput = this.container.querySelector(`[data-var="${key}"]`);
                    if (colorInput) colorInput.value = value;
                }
            });

            // 重置
            this.delegate('click', '#btnResetTheme', async () => {
                const confirmed = await Modal.confirm('重置确认', '确定要重置所有自定义颜色吗？此操作不可恢复。');
                if (confirmed) {
                    localStorage.removeItem('user_theme_custom_config');
                    this.state.customConfig = {};
                    Store.setTheme('custom'); // 重新应用（触发重置）
                    this.update();
                    Toast.success('已重置为默认配色');
                }
            });

            // 导入配置
            this.delegate('click', '#btnImportTheme', () => {
                this.$('#importThemeFile')?.click();
            });

            this.delegate('change', '#importThemeFile', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const config = JSON.parse(event.target.result);
                        if (typeof config !== 'object') {
                            Toast.error('无效的配置文件格式');
                            return;
                        }
                        // 应用导入的配置
                        this.state.customConfig = config;
                        localStorage.setItem('user_theme_custom_config', JSON.stringify(config));
                        Store.setTheme('custom');
                        this.update();
                        Toast.success('主题配置已导入');
                    } catch (err) {
                        Toast.error('解析配置文件失败：' + err.message);
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // 重置以便再次选择同一文件
            });

            // 导出配置
            this.delegate('click', '#btnExportTheme', () => {
                const config = JSON.stringify(this.state.customConfig, null, 2);
                const blob = new Blob([config], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'jeje-theme.json';
                a.click();
                URL.revokeObjectURL(url);
                Toast.success('主题配置已导出');
            });
        }
    }

    updateCustomTheme(key, value) {
        // 更新 State
        this.state.customConfig[key] = value;
        // 保存到 LocalStorage
        localStorage.setItem('user_theme_custom_config', JSON.stringify(this.state.customConfig));

        // 实时应用到 DOM
        document.documentElement.style.setProperty(key, value);
    }
}

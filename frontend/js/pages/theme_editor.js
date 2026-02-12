/**
 * 主题编辑器
 * 可视化编辑系统主题与配色
 */

class ThemeEditorPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            mode: Store.get('theme') || 'neon'
        };
    }

    render() {
        const { mode } = this.state;

        return `
            <div class="page theme-editor-page fade-in">
                <div class="page-header">
                    <h1 class="page-title">主题选择</h1>
                    <p class="page-desc">选择您喜欢的主题风格</p>
                </div>

                <div class="alert-info">
                    <span>🎨</span>
                    <span>所选主题将实时应用。若要在不同设备间同步，请联系管理员更新系统设置。</span>
                </div>

                <h3 style="margin-bottom: 15px;">可用主题</h3>
                <div class="theme-grid">
                    ${this.renderThemeCard('sunrise', '日出印象', 'linear-gradient(to top, #FF9A56, #FFCDA8, #A8DADC)', '#264653')}
                    ${this.renderThemeCard('neon', '星夜霓虹', 'linear-gradient(135deg, #1A1A2E, #16213E)', '#ffffff')}
                </div>
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

        }
    }

}


// 将 ThemeEditorPage 导出到全局作用域以支持动态加载
window.ThemeEditorPage = ThemeEditorPage;
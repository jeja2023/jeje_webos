/**
 * 国际化设置页面
 */

class I18nSettingsPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            languages: [],
            currentLang: localStorage.getItem('language') || 'zh_CN',
            loading: true,
            saving: false
        };
    }

    async loadData() {
        try {
            const res = await I18nApi.getLanguages();
            this.setState({
                languages: res.data || res.languages || [],
                loading: false
            });
        } catch (e) {
            // 如果 API 失败，使用默认语言列表
            this.setState({
                languages: [
                    { code: 'zh_CN', name: '简体中文' },
                    { code: 'zh_TW', name: '繁体中文' },
                    { code: 'en_US', name: 'English' },
                    { code: 'es_ES', name: 'Español' }
                ],
                loading: false
            });
        }
    }

    async handleLanguageChange(langCode) {
        this.setState({ saving: true });
        try {
            await I18nApi.setLanguage(langCode);
            localStorage.setItem('language', langCode);
            this.setState({ currentLang: langCode, saving: false });
            Toast.success('语言设置已保存');
            // 可选：刷新页面以应用新语言
            // window.location.reload();
        } catch (e) {
            // 即使 API 失败也保存到本地
            localStorage.setItem('language', langCode);
            this.setState({ currentLang: langCode, saving: false });
            Toast.success('语言设置已保存（本地）');
        }
    }

    getLangFlag(code) {
        const flags = {
            'zh_CN': '🇨🇳',
            'zh_TW': '🇹🇼',
            'en_US': '🇺🇸',
            'es_ES': '🇪🇸'
        };
        return flags[code] || '🌐';
    }

    render() {
        const { languages, currentLang, loading, saving } = this.state;

        if (loading) {
            return `
                <div class="page fade-in">
                    <div class="page-header">
                        <h1 class="page-title">语言设置</h1>
                    </div>
                    <div class="loading"></div>
                </div>
            `;
        }

        return `
            <div class="page fade-in compact-page">
                <div class="page-header compact-header">
                    <h1 class="page-title">🌍 语言设置</h1>
                </div>

                <div class="i18n-layout">
                    <!-- 左侧：语言选择 -->
                    <div class="card card-compact">
                        <div class="card-header">
                            <h3 class="card-title">可用语言</h3>
                        </div>
                        <div class="card-body">
                            <div class="language-list-compact">
                                ${languages.map(lang => `
                                    <div class="language-item-compact ${currentLang === lang.code ? 'active' : ''}" 
                                         data-lang="${lang.code}" ${saving ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                                        <span class="language-flag">${this.getLangFlag(lang.code)}</span>
                                        <span class="language-name">${lang.name}</span>
                                        ${currentLang === lang.code ? '<span class="language-check">✓</span>' : ''}
                                    </div>
                                `).join('')}
                            </div>
                            <div class="i18n-tip">
                                <small>💡 语言设置影响系统界面显示</small>
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：短语预览 -->
                    <div class="card card-compact">
                        <div class="card-header">
                            <h3 class="card-title">常用短语预览</h3>
                        </div>
                        <div class="card-body">
                            <div class="phrase-list-compact">
                                <div class="phrase-row"><span class="phrase-key">success</span><span class="phrase-value" id="phraseSuccess">-</span></div>
                                <div class="phrase-row"><span class="phrase-key">error</span><span class="phrase-value" id="phraseError">-</span></div>
                                <div class="phrase-row"><span class="phrase-key">confirm</span><span class="phrase-value" id="phraseConfirm">-</span></div>
                                <div class="phrase-row"><span class="phrase-key">cancel</span><span class="phrase-value" id="phraseCancel">-</span></div>
                                <div class="phrase-row"><span class="phrase-key">login</span><span class="phrase-value" id="phraseLogin">-</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadPhrases() {
        const lang = this.state.currentLang;
        const phrases = ['common.success', 'common.error', 'common.confirm', 'common.cancel', 'auth.login_success'];
        const ids = ['phraseSuccess', 'phraseError', 'phraseConfirm', 'phraseCancel', 'phraseLogin'];

        for (let i = 0; i < phrases.length; i++) {
            try {
                const res = await I18nApi.translate(phrases[i], lang);
                const el = this.$(`#${ids[i]}`);
                if (el) {
                    el.textContent = res.data?.text || res.text || phrases[i];
                }
            } catch (e) {
                // 忽略错误
            }
        }
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
        setTimeout(() => this.loadPhrases(), 500);
    }

    afterUpdate() {
        this.bindEvents();
    }

    bindEvents() {
        if (this.container && !this.container._bindedI18n) {
            this.container._bindedI18n = true;

            // 语言选择
            this.delegate('click', '.language-item-compact', (e, t) => {
                const lang = t.dataset.lang;
                if (lang && lang !== this.state.currentLang) {
                    this.handleLanguageChange(lang);
                }
            });
        }
    }
}



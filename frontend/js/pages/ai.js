/**
 * AI助手页面组件
 * 实现混合模式（本地+在线）、知识库挂载与数据分析交互
 * 支持多模型切换、角色预设、Token统计
 */

class AIPage extends Component {
    // 预设角色模板
    static ROLE_PRESETS = [
        { id: 'default', name: '通用助手', icon: '🧠', prompt: '你是一个全能智能助手。' },
        { id: 'coder', name: '编程助手', icon: '💻', prompt: '你是一个专业的编程助手，擅长多种编程语言和框架。请提供清晰、高效、可维护的代码解决方案。' },
        { id: 'writer', name: '写作助手', icon: '✍️', prompt: '你是一个专业的写作助手，擅长各种文体风格。请帮助我创作、修改和改进文字内容。' },
        { id: 'translator', name: '翻译助手', icon: '🌍', prompt: '你是一个专业的翻译助手，精通中英双语翻译。请帮助我翻译文本，保持原文的语气和风格。' },
        { id: 'analyst', name: '数据助手', icon: '📊', prompt: '你是一个数据分析专家，擅长SQL、Python和数据可视化。请帮助我分析数据并提供洞察。' }
    ];

    // 简单的加密方法（Base64 + 字符偏移）
    static encryptKey(text) {
        if (!text) return '';
        // 字符偏移 + Base64
        const shifted = text.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 3)).join('');
        return btoa(shifted);
    }

    // 解密方法
    static decryptKey(encrypted) {
        if (!encrypted) return '';
        try {
            const shifted = atob(encrypted);
            return shifted.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
        } catch (e) {
            return encrypted; // 如果解密失败，返回原文（兼容旧数据）
        }
    }

    constructor(container) {
        super(container);

        this.state = {
            sessions: [{ id: 'temp_1', title: '新对话', messages: [] }],
            activeSessionId: 'temp_1',
            isGenerating: false,
            inputMessage: '',
            selectedKb: null,
            useAnalysis: false,
            provider: 'local', // '本地' 或 '在线'
            knowledgeBases: [],
            _bindEvents: false, // 标记事件是否已绑定，防止重复绑定
            _saving: false, // 防止重复保存
            rolePreset: 'default', // 当前角色预设
            selectedModel: null, // 选中的本地模型
            availableModels: [], // 可用的本地模型列表
            tokenStats: { prompt: 0, completion: 0, total: 0 }, // Token统计
            generationSpeed: 0, // 生成速度 (tokens/s)
            sessionSearchQuery: '', // 会话搜索关键词
            hasOnlineConfig: false, // 是否已配置在线 API
            apiConfig: {
                apiKey: '', // 仅用于临时输入显示，不持久化保存到 State
                baseUrl: 'https://api.deepseek.com/v1',
                model: 'deepseek-chat'
            }
        };

        this._abortController = null;
        this._generationStartTime = null;
        this._tokenCount = 0;

        // 输入历史记录
        this._inputHistory = [];
        this._historyIndex = -1;
        this._maxHistorySize = 50;

        // 标志位：是否需要强制置底（用于解决初始加载和会话切换时的跳动问题）
        this._shouldForceScroll = false;
    }

    // 从后端加载会话
    async loadSessions() {
        try {
            const res = await Api.get('/ai/sessions');
            if (res.data && res.data.length > 0) {
                // 加载每个会话的详细消息
                const sessionsWithMessages = await Promise.all(
                    res.data.map(async (s) => {
                        try {
                            const detailRes = await Api.get(`/ai/sessions/${s.id}`);
                            if (detailRes.data) {
                                return {
                                    id: detailRes.data.id,
                                    title: detailRes.data.title,
                                    messages: detailRes.data.messages.map(m => ({
                                        role: m.role,
                                        content: m.content,
                                        timestamp: m.created_at || m.timestamp || Date.now(),
                                        isError: m.isError || false
                                    })),
                                    provider: detailRes.data.provider || 'local',
                                    knowledge_base_id: detailRes.data.knowledge_base_id,
                                    use_analysis: detailRes.data.use_analysis || false
                                };
                            }
                        } catch (e) {
                            Config.error(`加载会话 ${s.id} 失败:`, e);
                        }
                        return {
                            id: s.id,
                            title: s.title,
                            messages: [],
                            provider: s.provider || 'local'
                        };
                    })
                );

                this.setState({
                    sessions: sessionsWithMessages,
                    activeSessionId: sessionsWithMessages[0].id
                });

                // 首次加载完成，标记需要强制置底
                this._shouldForceScroll = true;
            } else {
                // 后端返回空数组，保持默认会话
                Config.info('后端无会话记录，使用默认会话');
            }
        } catch (e) {
            Config.error('加载会话失败:', e);
            // 如果后端加载失败，尝试从LocalStorage恢复（降级方案）
            const savedSessions = localStorage.getItem(Config.storageKeys.aiSessions);
            if (savedSessions) {
                try {
                    const parsed = JSON.parse(savedSessions);
                    if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
                        this.setState({
                            sessions: parsed.sessions,
                            activeSessionId: parsed.activeSessionId || parsed.sessions[0].id
                        });
                        return;
                    }
                } catch (e2) {
                    Config.error('从LocalStorage恢复失败:', e2);
                }
            }
            // LocalStorage也没有，保持默认会话（constructor中初始化的）
            Config.info('使用默认会话');
        }
    }

    // 保存会话到后端（同时备份到LocalStorage）
    async saveSessions() {
        if (this.state._saving) return; // 防止重复保存
        this.state._saving = true;

        try {
            // 转换会话格式
            const sessionsToSave = this.state.sessions.map(s => ({
                id: typeof s.id === 'string' && s.id.startsWith('temp_') ? null : s.id,
                title: s.title,
                provider: s.provider || this.state.provider,
                knowledge_base_id: s.knowledge_base_id || (this.state.selectedKb ? parseInt(this.state.selectedKb) : null),
                use_analysis: s.use_analysis !== undefined ? s.use_analysis : this.state.useAnalysis,
                messages: s.messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp,
                    created_at: m.created_at,
                    isError: m.isError || false
                }))
            }));

            // 保存到后端
            const res = await Api.post('/ai/sessions/save', {
                sessions: sessionsToSave,
                active_session_id: typeof this.state.activeSessionId === 'string' && this.state.activeSessionId.startsWith('temp_')
                    ? null
                    : this.state.activeSessionId
            });

            if (res.data && res.data.sessions) {
                // 更新会话ID（将临时ID替换为真实ID）
                const updatedSessions = this.state.sessions.map((s, idx) => {
                    if (idx < res.data.sessions.length) {
                        return {
                            ...s,
                            id: res.data.sessions[idx].id
                        };
                    }
                    return s;
                });

                // 更新activeSessionId
                let updatedActiveId = this.state.activeSessionId;
                const activeIdx = this.state.sessions.findIndex(s => s.id === this.state.activeSessionId);
                if (activeIdx >= 0 && activeIdx < res.data.sessions.length) {
                    updatedActiveId = res.data.sessions[activeIdx].id;
                }

                // 直接修改 state，不触发 update()
                // 这只是 ID 的静默更新，不需要重新渲染 UI，避免滚动位置丢失
                this.state.sessions = updatedSessions;
                this.state.activeSessionId = updatedActiveId;
            }

            // 同时备份到LocalStorage（降级方案）
            try {
                localStorage.setItem(Config.storageKeys.aiSessions, JSON.stringify({
                    sessions: this.state.sessions,
                    activeSessionId: this.state.activeSessionId,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // LocalStorage失败不影响主流程
                Config.warn('LocalStorage备份失败:', e);
            }
        } catch (e) {
            Config.error('保存会话到后端失败:', e);
            // 降级到LocalStorage
            try {
                localStorage.setItem(Config.storageKeys.aiSessions, JSON.stringify({
                    sessions: this.state.sessions,
                    activeSessionId: this.state.activeSessionId,
                    timestamp: Date.now()
                }));
            } catch (e2) {
                Config.error('LocalStorage保存也失败:', e2);
            }
        } finally {
            this.state._saving = false;
        }
    }

    async loadData() {
        try {
            // 并行加载知识库、会话和AI状态
            const [kbRes, aiStatusRes] = await Promise.all([
                Api.get('/knowledge/bases'),
                Api.get('/ai/status'),
                this.loadSessions() // 加载会话
            ]);

            // 从 LocalStorage 加载部分非敏感配置（BaseURL/Model）
            const savedConfig = localStorage.getItem(Config.storageKeys.aiConfig);
            let apiConfig = this.state.apiConfig;
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    apiConfig = { ...apiConfig, ...parsed, apiKey: '' }; // 确保不读取旧 Key
                } catch (e) { Config.error('解析配置失败', e); }
            }

            // 清理旧的敏感配置
            localStorage.removeItem('jeje_ai_config');

            // 从 LocalStorage 加载选中的模型
            const savedModel = localStorage.getItem(Config.storageKeys.aiModel);
            let selectedModel = null;
            const availableModels = aiStatusRes.data?.available_models || [];
            if (savedModel && availableModels.includes(savedModel)) {
                selectedModel = savedModel;
            } else if (availableModels.length > 0) {
                selectedModel = availableModels[0];
            }

            this.setState({
                knowledgeBases: kbRes.data || [],
                availableModels: availableModels,
                selectedModel: selectedModel,
                apiConfig: apiConfig,
                hasOnlineConfig: aiStatusRes.data?.has_online_config || false
            });
        } catch (e) {
            Config.error('加载数据失败', e);
        }
    }

    render() {
        const { sessions, activeSessionId, isGenerating, inputMessage, knowledgeBases, selectedKb, useAnalysis, provider, apiConfig, availableModels, selectedModel } = this.state;
        const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

        return `
            <div class="page ai-layout fade-in">
                <!-- 左侧会话列表 -->
                <div class="ai-sidebar">
                    <div class="sidebar-header">
                        <button class="btn btn-primary btn-block" id="btnNewChat"><i class="ri-add-line"></i> 新建对话</button>
                        <div class="session-search search-group" style="margin-top: 8px;">
                            <input type="text" class="form-input" id="sessionSearchInput" 
                                placeholder="搜索会话...">
                            <button class="btn btn-primary" id="btnSessionSearch"><i class="ri-search-2-line"></i></button>
                        </div>
                    </div>
                    <div class="session-list">
                        ${(() => {
                // 过滤会话列表
                const query = (this.state.sessionSearchQuery || '').toLowerCase().trim();
                const filteredSessions = query
                    ? sessions.filter(s => s.title.toLowerCase().includes(query))
                    : sessions;

                // 无会话时显示提示
                if (sessions.length === 0) {
                    return '<div class="session-empty" style="padding: 12px; text-align: center; opacity: 0.6;">暂无会话，点击上方按钮新建</div>';
                }

                // 有搜索但无匹配结果
                if (filteredSessions.length === 0 && query) {
                    return '<div class="session-empty" style="padding: 12px; text-align: center; opacity: 0.6;">未找到匹配的会话</div>';
                }

                return filteredSessions.map(s => `
                                <div class="session-item ${s.id === activeSessionId ? 'active' : ''}" data-id="${Utils.escapeHtml(String(s.id))}">
                                    <i class="ri-message-3-line"></i>
                                    <div class="session-info">
                                        <span class="session-title text-truncate">${Utils.escapeHtml(s.title)}</span>
                                        <span class="session-time">${this.formatSessionTime(s.updated_at || s.created_at)}</span>
                                    </div>
                                    <button class="session-delete-btn" data-delete-session="${Utils.escapeHtml(String(s.id))}" title="删除会话">
                                        <i class="ri-close-line"></i>
                                    </button>
                                </div>
                            `).join('');
            })()}
                    </div>
                    <div class="sidebar-footer">
                        <div class="mode-switch">
                            <button class="mode-btn ${provider === 'local' ? 'active' : ''}" data-mode="local"><i class="ri-home-line"></i> 本地</button>
                            <button class="mode-btn ${provider === 'online' ? 'active' : ''}" data-mode="online"><i class="ri-cloud-line"></i> 在线</button>
                        </div>
                        ${provider === 'local' && availableModels.length > 0 ? `
                            <div class="model-selector" style="margin-top: 8px;">
                                <select class="form-input btn-sm" id="modelSelector" style="width: 100%;" title="选择本地模型">
                                    ${availableModels.map(m => `
                                        <option value="${m}" ${selectedModel === m ? 'selected' : ''}>${m.replace('.gguf', '').substring(0, 20)}${m.length > 25 ? '...' : ''}</option>
                                    `).join('')}
                                </select>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- 右侧对话区域 -->
                <div class="ai-main">
                    <div class="ai-header">
                        <div class="ai-title">

                            <h3>AI助手 <small style="font-size: 10px; opacity: 0.5;">v3.0</small></h3>
                            <span class="ai-badge">${provider === 'local' ? '<i class="ri-home-line"></i> 本地模型' : '<i class="ri-cloud-line"></i> 在线 API'}</span>
                            ${selectedKb ? '<span class="ai-badge secondary"><i class="ri-book-mark-line"></i> 已挂载知识库</span>' : ''}
                        </div>
                        <div class="ai-options">
                            <!-- 角色预设选择器 -->
                            <select class="form-input btn-sm" id="roleSelector" style="width: 120px;" title="选择AI角色">
                                ${AIPage.ROLE_PRESETS.map(r => `
                                    <option value="${Utils.escapeHtml(r.id)}" ${this.state.rolePreset === r.id ? 'selected' : ''}>${Utils.escapeHtml(r.icon)} ${Utils.escapeHtml(r.name)}</option>
                                `).join('')}
                            </select>
                            
                            <label class="checkbox-label" title="开启将连接数据分析模块">
                                <input type="checkbox" id="checkAnalysis" ${useAnalysis ? 'checked' : ''}> <i class="ri-line-chart-line"></i> 数据模式
                            </label>
                            
                            <select class="form-input btn-sm" id="kbSelector" style="width: 130px;">
                                <option value="">无知识库</option>
                                ${knowledgeBases.map(kb => `
                                    <option value="${Utils.escapeHtml(String(kb.id))}" ${selectedKb == kb.id ? 'selected' : ''}>知识库: ${Utils.escapeHtml(kb.name)}</option>
                                `).join('')}
                            </select>

                            <button class="btn-icon-only" id="btnExport" title="导出对话">
                                <i class="ri-download-line"></i>
                            </button>

                            <button class="btn-icon-only" id="btnConfig" title="API 设置">
                                <i class="ri-settings-3-line"></i>
                            </button>
                            ${window.ModuleHelp ? ModuleHelp.createHelpButton('ai', 'AI 助手') : ''}
                        </div>
                    </div>

                    <div class="chat-container" id="chatContainer">
                        ${activeSession.messages.length === 0 ? `
                            <div class="ai-welcome">
                                <div class="welcome-icon"><i class="ri-brain-line"></i></div>
                                <h2>你好，我是AI助手</h2>
                                <p>当前处于 <b>${provider === 'local' ? '本地离线模式' : '在线 API 模式'}</b></p>
                                ${provider === 'online' && !this.state.hasOnlineConfig ?
                    '<p class="text-warning"><i class="ri-alert-line"></i> 您尚未配置在线 API Key，请点击右上角设置图标进行配置。</p>' :
                    '<p>我可以帮你总结文档、分析数据或进行通用对话。请选择一个模式开始吧！</p>'}
                                <div class="welcome-hints">
                                    <div class="hint-card" data-text="${Utils.escapeHtml("什么是 RAG 技术？")}">"什么是 RAG 技术？"</div>
                                    <div class="hint-card" data-text="${Utils.escapeHtml("介绍一下 JeJe WebOS")}">"介绍一下 JeJe WebOS"</div>
                                    <div class="hint-card" data-text="${Utils.escapeHtml("帮我写一段 Python 脚本")}">"帮我写一段 Python 脚本"</div>
                                </div>
                            </div>
                        ` : `
                            <div class="message-list">
                                ${activeSession.messages.map((msg, idx) => {
                        // 跳过正在生成中的空 AI 消息，由下面的点点点占位符代替显示
                        if (isGenerating && msg.role === 'assistant' && !msg.content && idx === activeSession.messages.length - 1) {
                            return '';
                        }
                        return `
                                    <div class="message-wrapper ${msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'ai'}" data-message-idx="${Utils.escapeHtml(String(idx))}">
                                        <div class="avatar">${msg.role === 'user' ? '<i class="ri-user-line"></i>' : msg.role === 'system' ? '<i class="ri-alert-line"></i>' : '<i class="ri-brain-line"></i>'}</div>
                                        <div class="message-content-wrapper">
                                            <div class="message-content markdown-body ${msg.isError ? 'error-message' : ''}">
                                                ${this.renderMarkdown(msg.content)}
                                            </div>
                                            <div class="message-meta">
                                                <span class="message-time">${this.formatMessageTime(msg.timestamp)}</span>
                                            </div>
                                            <div class="message-actions">
                                                <button class="msg-action-btn" data-action="copy" data-message-idx="${Utils.escapeHtml(String(idx))}" title="复制">
                                                    <i class="ri-file-copy-line"></i>
                                                </button>
                                                ${msg.role === 'user' ? `
                                                    <button class="msg-action-btn" data-action="edit" data-message-idx="${Utils.escapeHtml(String(idx))}" title="编辑">
                                                        <i class="ri-edit-line"></i>
                                                    </button>
                                                ` : `
                                                    <button class="msg-action-btn" data-action="regenerate" data-message-idx="${Utils.escapeHtml(String(idx))}" title="重新生成">
                                                        <i class="ri-refresh-line"></i>
                                                    </button>
                                                `}
                                                <button class="msg-action-btn danger" data-action="delete" data-message-idx="${Utils.escapeHtml(String(idx))}" title="删除">
                                                    <i class="ri-delete-bin-line"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `}).join('')}
                                ${isGenerating && (activeSession.messages.length === 0 || activeSession.messages[activeSession.messages.length - 1].role !== 'assistant' || !activeSession.messages[activeSession.messages.length - 1].content) ? `
                                    <div class="message-wrapper ai">
                                        <div class="avatar"><i class="ri-brain-line"></i></div>
                                        <div class="message-content generating">
                                            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `}
                    </div>

                    <div class="ai-input-wrapper">
                        <div class="input-area">
                            <textarea id="aiInput" placeholder="输入您的问题 (Shift + Enter 换行)" ${isGenerating ? 'disabled' : ''}>${inputMessage}</textarea>
                            <button class="btn-send ${isGenerating ? 'btn-stop' : ''}" id="btnSend" ${!isGenerating && !inputMessage.trim() ? 'disabled' : ''}>
                                ${isGenerating ? '<i class="ri-stop-fill"></i>' : '<i class="ri-send-plane-2-fill"></i>'}
                            </button>
                        </div>
                        <div class="ai-footer-info">
                            <span>引擎：${provider === 'local' ? '本地 (llama-cpp)' : `在线 (${apiConfig.model})`}</span>
                            ${this.state.tokenStats.total > 0 ? `
                                <span class="token-stats">
                                    | Tokens: ${this.state.tokenStats.total}
                                    ${this.state.generationSpeed > 0 ? ` | ${this.state.generationSpeed.toFixed(1)} tokens/s` : ''}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 格式化消息时间戳（显示完整日期时分秒）
     * @param {number|string} timestamp - 时间戳或时间字符串
     * @returns {string} 格式化后的时间
     */
    formatMessageTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;

        // 判断是否是今天
        if (msgDate.getTime() === today.getTime()) {
            return `今天 ${timeStr}`;
        }

        // 判断是否是昨天
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (msgDate.getTime() === yesterday.getTime()) {
            return `昨天 ${timeStr}`;
        }

        // 判断是否是今年
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        if (date.getFullYear() === now.getFullYear()) {
            return `${month}-${day} ${timeStr}`;
        }

        // 其他情况显示完整日期
        return `${date.getFullYear()}-${month}-${day} ${timeStr}`;
    }

    /**
     * 格式化会话时间（用于左侧会话列表）
     * @param {number|string} timestamp - 时间戳或时间字符串
     * @returns {string} 格式化后的时间
     */
    formatSessionTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sessionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        // 判断是否是今天
        if (sessionDate.getTime() === today.getTime()) {
            return timeStr;
        }

        // 判断是否是昨天
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (sessionDate.getTime() === yesterday.getTime()) {
            return '昨天';
        }

        // 判断是否是今年
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        if (date.getFullYear() === now.getFullYear()) {
            return `${month}-${day}`;
        }

        // 其他情况显示完整日期
        return `${date.getFullYear()}-${month}-${day}`;
    }

    renderMarkdown(text) {
        if (!text) return '';

        // 增强的 Markdown 渲染（参考 analysis_smart_report.js）
        let html = Utils.escapeHtml(text);

        // 1. 代码块（需要在其他替换之前处理）
        html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            const escapedCode = Utils.escapeHtml(code.trim());
            return `<pre><code class="language-${lang || ''}">${escapedCode}</code></pre>`;
        });
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

        // 2. 表格处理
        html = html.replace(/\|(.+)\|\n\|[-\s|:]+\|\n((?:\|.+\|\n?)+)/g, (match, header, rows) => {
            const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
            const rowLines = rows.trim().split('\n');
            const body = rowLines.map(row => {
                const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            return `<table class="markdown-table"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
        });

        // 3. 引用块
        html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');
        html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

        // 4. 水平线
        html = html.replace(/^---$/gim, '<hr>');
        html = html.replace(/^\*\*\*$/gim, '<hr>');

        // 5. 标题
        html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
        html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
        html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // 6. 粗体和斜体
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');

        // 7. 链接（转义文本和 URL 防止 XSS）
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            const safeUrl = url.trim();
            const safeText = Utils.escapeHtml(text);
            if (/^(javascript|vbscript|data):/i.test(safeUrl)) {
                return `<a href="javascript:void(0)" title="Blocked dangerous protocol" style="color:var(--color-error);text-decoration:line-through;">${safeText}</a>`;
            }
            return `<a href="${Utils.escapeHtml(safeUrl)}" target="_blank" rel="noopener">${safeText}</a>`;
        });

        // 8. 图片（转义 alt 和 src 防止 XSS）
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
            const safeSrc = src.trim();
            const safeAlt = Utils.escapeHtml(alt);
            if (/^(javascript|vbscript|data):/i.test(safeSrc)) {
                return `<div class="broken-image" title="Blocked dangerous image source" style="padding:10px;background:var(--color-bg-tertiary);border-radius:4px;color:var(--color-text-secondary);font-size:12px;"><i class="ri-image-off-line"></i> ${safeAlt || '图片无法显示'}</div>`;
            }
            return `<img src="${Utils.escapeHtml(safeSrc)}" alt="${safeAlt}" style="max-width: 100%;">`;
        });

        // 9. 列表（无序）
        html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
        html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // 10. 列表（有序）
        html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, (match) => {
            if (!match.includes('<ul>')) {
                return '<ol>' + match + '</ol>';
            }
            return match;
        });

        // 11. 换行处理（保留段落）
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>(<[^>]+>)/g, '$1');
        html = html.replace(/(<\/[^>]+>)<\/p>/g, '$1');

        return html;
    }

    /**
     * 显示 API 设置弹窗（使用全局 Modal 组件）
     */
    showConfigModal() {
        const { apiConfig, hasOnlineConfig } = this.state;

        const modal = Modal.show({
            title: '⚙️ API 设置 (在线模式)',
            width: '450px',
            content: `
                <div class="form-group">
                    <label class="form-label">API Key</label>
                    <input type="password" class="form-input" id="cfgApiKey" 
                           value="" 
                           placeholder="${hasOnlineConfig ? '已配置 (留空保持不变)' : 'sk-...'}"
                           autocomplete="new-password">
                    <small class="form-hint">密钥将加密存储在服务器，前端不保留。支持 DeepSeek / OpenAI。</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Base URL</label>
                    <input type="text" class="form-input" id="cfgBaseUrl" 
                           value="${Utils.escapeHtml(apiConfig.baseUrl || '')}" 
                           placeholder="https://api.deepseek.com/v1">
                    <small class="form-hint">API 基础地址</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Model Name</label>
                    <input type="text" class="form-input" id="cfgModel" 
                           value="${Utils.escapeHtml(apiConfig.model || '')}" 
                           placeholder="deepseek-chat">
                    <small class="form-hint">模型名称，如 deepseek-chat, gpt-4o 等</small>
                </div>
            `,
            confirmText: '保存到服务器',
            cancelText: '取消',
            onConfirm: async () => {
                const overlay = modal.overlay;
                const apiKey = overlay.querySelector('#cfgApiKey').value.trim();
                const baseUrl = overlay.querySelector('#cfgBaseUrl').value.trim();
                const model = overlay.querySelector('#cfgModel').value.trim();

                if (!hasOnlineConfig && !apiKey) {
                    Toast.error('请输入 API Key');
                    return false;
                }

                try {
                    // 仅当用户输入了新 Key 时才发送 Key，否则只更新其他配置（需后端支持，暂时假设都发送）
                    // 实际上如果用户没填 Key 但已配置，我们如何告诉后端？
                    // 简单起见，如果已配置且未填，则不允许为空，或者我们假设用户想修改其他配置
                    // 这里我们要求如果是首次配置必须填。如果已配置，填了就更新，没填就报错（简化逻辑）
                    if (!apiKey && !hasOnlineConfig) {
                        Toast.error('请填写 API Key');
                        return false;
                    }

                    // 如果已配置且留空，则发送特定标识或不发送？
                    // 为了简化，我们要求如果要修改配置，最好重新输入 Key。
                    // 或者，我们可以只在 apiKey 有值时才发送

                    if (apiKey) {
                        await Api.post('/ai/config', {
                            api_key: apiKey,
                            base_url: baseUrl,
                            model: model
                        });
                        Toast.success('配置已安全保存到服务器');
                        this.setState({ hasOnlineConfig: true, provider: 'online' });
                    } else if (hasOnlineConfig) {
                        // 仅更新非敏感信息（暂不实现，提示用户输入Key）
                        Toast.info('如需修改 BaseURL 或模型，请重新输入 API Key 以验证身份');
                        return false;
                    }

                    // 保存非敏感配置到本地以便回显
                    localStorage.setItem(Config.storageKeys.aiConfig, JSON.stringify({
                        baseUrl,
                        model
                    }));

                    // 更新本地状态用于回显
                    this.setState({
                        apiConfig: { ...this.state.apiConfig, baseUrl, model }
                    });

                    return true;
                } catch (e) {
                    Toast.error('保存失败: ' + e.message);
                    return false;
                }
            }
        });
    }

    bindEvents() {
        if (this.state._bindEvents) return; // 防止重复绑定 delegate
        this.state._bindEvents = true;

        // 由于 innerHTML 会覆盖，对于直接在 DOM 上绑定的事件，需要在 afterUpdate 里单独处理
        this.bindDomEvents();

        this.delegate('click', '#btnSend', () => {
            if (this.state.isGenerating) {
                this.stopGeneration();
            } else {
                this.handleSendMessage();
            }
        });



        this.delegate('click', '#btnNewChat', () => {
            this.createNewSession();
        });

        // 设置按钮 - 使用全局 Modal
        this.delegate('click', '#btnConfig', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showConfigModal();
        });

        this.delegate('click', '.session-item', (e, el) => {
            // 如果点击的是删除按钮，不切换会话
            if (e.target.closest('.session-delete-btn')) {
                return;
            }
            // 切换会话需要强制滚动到新会话的底部
            this._shouldForceScroll = true;
            this.setState({
                activeSessionId: parseInt(el.dataset.id) || el.dataset.id,
                mobileSidebarOpen: false
            }, () => {
                this.saveSessions(); // 保存会话
            });
        });

        // 删除会话
        this.delegate('click', '.session-delete-btn', async (e, el) => {
            e.stopPropagation();
            e.preventDefault();
            const sessionId = el.dataset.deleteSession;
            const session = this.state.sessions.find(s => s.id == sessionId);

            Modal.confirm('删除会话', `确定要删除会话"${session?.title || '未命名'}"吗？此操作不可恢复。`, async () => {
                try {
                    // 如果是真实ID（不是临时ID），调用后端删除
                    if (typeof sessionId === 'string' && !sessionId.startsWith('temp_')) {
                        try {
                            await Api.delete(`/ai/sessions/${sessionId}`);
                        } catch (e) {
                            Config.warn('后端删除失败，仅本地删除:', e);
                        }
                    }

                    // 从本地状态中删除
                    const newSessions = this.state.sessions.filter(s => s.id != sessionId);
                    let newActiveId = this.state.activeSessionId;

                    // 如果删除的是当前会话，切换到其他会话
                    if (newActiveId == sessionId) {
                        newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
                    }

                    // 如果没有会话了，创建一个新的
                    if (newSessions.length === 0) {
                        await this.createNewSession();
                    } else {
                        // 删除会话后切换需要强制滚动
                        this._shouldForceScroll = true;
                        this.setState({
                            sessions: newSessions,
                            activeSessionId: newActiveId
                        }, () => {
                            this.saveSessions();
                        });
                    }

                    Toast.success('会话已删除');
                    return true;
                } catch (e) {
                    Toast.error('删除失败: ' + e.message);
                    return false;
                }
            });
        });
        this.delegate('click', '.hint-card', (e, el) => {
            const text = el.dataset.text;
            this.state.inputMessage = text;
            const inputEl = this.$('#aiInput');
            if (inputEl) inputEl.value = text;
            this.handleSendMessage();
        });

        // 会话搜索 - 只在点击或回车时触发搜索，不监听input事件以避免重渲染
        this.delegate('click', '#btnSessionSearch', () => {
            const inputEl = this.$('#sessionSearchInput');
            const query = inputEl ? inputEl.value.trim() : '';
            this.setState({ sessionSearchQuery: query });
        });

        this.delegate('keydown', '#sessionSearchInput', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = e.target.value.trim();
                this.setState({ sessionSearchQuery: query });
            }
        });

        // 模式切换
        this.delegate('click', '.mode-btn', (e, el) => {
            this.setState({ provider: el.dataset.mode });
        });

        this.delegate('change', '#kbSelector', (e) => {
            this.setState({ selectedKb: e.target.value });
        });

        this.delegate('change', '#checkAnalysis', (e) => {
            this.setState({ useAnalysis: e.target.checked });
        });

        // 角色预设切换
        this.delegate('change', '#roleSelector', (e) => {
            const roleId = e.target.value;
            this.setState({ rolePreset: roleId });
            const preset = AIPage.ROLE_PRESETS.find(r => r.id === roleId);
            if (preset) {
                Toast.success(`已切换为${preset.icon} ${preset.name}模式`);
            }
        });

        // 本地模型切换
        this.delegate('change', '#modelSelector', (e) => {
            const modelName = e.target.value;
            this.setState({ selectedModel: modelName });
            localStorage.setItem(Config.storageKeys.aiModel, modelName);
            Toast.success(`已切换模型: ${modelName.replace('.gguf', '').substring(0, 15)}...`);
        });

        // 导出对话
        this.delegate('click', '#btnExport', () => {
            this.exportConversation();
        });

        // 消息操作
        this.delegate('click', '[data-action="copy"]', (e, el) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.messageIdx);
            const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
            if (session && session.messages[idx]) {
                const text = session.messages[idx].content;
                navigator.clipboard.writeText(text).then(() => {
                    Toast.success('已复制到剪贴板');
                }).catch(() => {
                    // 降级方案
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    Toast.success('已复制到剪贴板');
                });
            }
        });

        this.delegate('click', '[data-action="delete"]', (e, el) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.messageIdx);
            Modal.confirm('删除消息', '确定要删除这条消息吗？', () => {
                const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
                if (session && session.messages[idx]) {
                    session.messages.splice(idx, 1);

                    // 删除后需要保持滚动位置，设置强制滚动标志
                    this._shouldForceScroll = true;

                    this.setState({ sessions: [...this.state.sessions] }, () => {
                        this.saveSessions();
                    });
                    Toast.success('已删除');
                }
                return true;
            });
        });

        this.delegate('click', '[data-action="edit"]', (e, el) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.messageIdx);
            const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
            if (session && session.messages[idx] && session.messages[idx].role === 'user') {
                const originalText = session.messages[idx].content;
                Modal.prompt('编辑消息', '修改消息内容：', '输入消息', originalText).then(newText => {
                    if (newText && newText.trim() && newText !== originalText) {
                        session.messages[idx].content = newText.trim();
                        // 删除该消息之后的所有AI回复
                        session.messages = session.messages.slice(0, idx + 1);
                        // 编辑后保持滚动位置
                        this._shouldForceScroll = true;
                        this.setState({ sessions: [...this.state.sessions] }, () => {
                            this.saveSessions();
                        });
                        Toast.success('已更新，可以重新发送');
                    }
                });
            }
        });

        this.delegate('click', '[data-action="regenerate"]', (e, el) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.messageIdx);
            const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
            if (session && session.messages[idx] && session.messages[idx].role === 'assistant') {
                // 找到对应的用户消息
                let userMsgIdx = idx - 1;
                while (userMsgIdx >= 0 && session.messages[userMsgIdx].role !== 'user') {
                    userMsgIdx--;
                }
                if (userMsgIdx >= 0) {
                    // 重新生成逻辑：删除旧的用户消息和 AI 回复，然后重新发送
                    const contentToRegenerate = session.messages[userMsgIdx].content;

                    // 删除从用户消息开始的所有内容（包括用户消息本身和 AI 回复）
                    session.messages = session.messages.slice(0, userMsgIdx);

                    // 直接修改 state 不触发 update，避免滚动跳动
                    // handleSendMessage 会自动触发 update
                    this.handleSendMessage(contentToRegenerate);
                }
            }
        });
    }

    // 绑定那些在 update 后会被销毁的非委托事件
    bindDomEvents() {
        const input = this.$('#aiInput');
        if (input && !input._bindAI) {
            input._bindAI = true;
            this.addListener(input, 'input', (e) => {
                const value = e.target.value;
                this.state.inputMessage = value;
                const btnSend = this.$('#btnSend');
                if (btnSend && !this.state.isGenerating) {
                    btnSend.disabled = !value.trim();
                }
            });
            this.addListener(input, 'keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    }

    async handleSendMessage(overrideText = null) {
        const inputEl = this.$('#aiInput');
        const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);

        let currentInput;
        // 如果传入了 overrideText（重新生成时），直接使用
        if (typeof overrideText === 'string' && overrideText) {
            currentInput = overrideText;
        } else {
            // 否则从输入框获取
            currentInput = inputEl ? inputEl.value.trim() : this.state.inputMessage.trim();
        }

        const { isGenerating, activeSessionId, selectedKb, useAnalysis, provider, sessions, apiConfig } = this.state;

        // 校验：如果在生成中，或者输入为空，则返回
        if (isGenerating || !currentInput) return;

        // 如果是在线模式但没有配置
        if (provider === 'online' && !this.state.hasOnlineConfig) {
            Toast.error('请先配置 API Key');
            this.showConfigModal();
            return;
        }

        // 保存到输入历史（仅限手动输入的情况，或者是重新生成的内容不保存？保存吧，方便）
        if (this._inputHistory[this._inputHistory.length - 1] !== currentInput) {
            this._inputHistory.push(currentInput);
            if (this._inputHistory.length > this._maxHistorySize) {
                this._inputHistory.shift();
            }
        }

        // 发送新消息：总是追加到列表末尾（不仅是普通发送，重新生成现在也是追加）
        this._historyIndex = -1; // 重置历史索引
        const userMsg = { role: 'user', content: currentInput, timestamp: Date.now() };
        session.messages.push(userMsg);
        session.updated_at = Date.now();
        if (session.messages.length === 1) {
            session.title = Utils.truncate(currentInput, 15);
        }
        // 准备发送，此时清空输入框
        if (inputEl) inputEl.value = '';
        this.state.inputMessage = '';

        // 如果是临时会话ID，先创建会话并获取真实ID
        let realSessionId = session.id;
        const tempSessionId = session.id;
        if (typeof session.id === 'string' && session.id.startsWith('temp_')) {
            try {
                // 先保存会话以获取真实ID
                await this.saveSessions();
                // 等待保存完成，获取更新后的会话ID
                // 通过临时ID找到对应的会话（saveSessions会更新ID）
                const updatedSession = this.state.sessions.find(s => {
                    // 如果ID已更新为数字，说明是刚才保存的会话
                    return typeof s.id === 'number' && s.title === session.title;
                });
                if (updatedSession) {
                    realSessionId = updatedSession.id;
                    session.id = updatedSession.id;
                    // 更新activeSessionId
                    this.setState({ activeSessionId: updatedSession.id });
                } else {
                    // 如果找不到，可能是保存失败，使用原临时ID
                    Config.warn('无法找到更新后的会话ID，消息可能不会保存到数据库');
                }
            } catch (e) {
                Config.warn('创建会话失败，将不保存消息到数据库:', e);
            }
            // 如果是真实ID，更新标题
            try {
                await Api.put(`/ai/sessions/${session.id}`, { title: session.title });
            } catch (e) {
                Config.warn('更新会话标题失败:', e);
            }
        }

        // 初始化Token统计
        this._generationStartTime = Date.now();
        this._tokenCount = 0;

        // 绕过 setState 的自动更新机制，直接修改 state 对象
        // 这样可以避免触发完整的 DOM 重建，防止滚动位置丢失
        this.state.isGenerating = true;
        this.state.tokenStats = { prompt: 0, completion: 0, total: 0 };
        this.state.generationSpeed = 0;

        // 手动触发一次更新，显示用户消息和加载状态
        this.update();
        this.scrollToBottom(true); // 强制置底！确保不跳到顶部

        // 关键修复：强制等待浏览器完成 DOM 渲染
        // 确保后续的增量更新能找到 DOM 元素，而不是触发完整重建
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // 终极暴力置底：启动一个定时器，在生成期间持续强制置底
        // 这解决了各种因 DOM 高度变化、图片加载或浏览器机制导致的滚动失效问题
        this._scrollInterval = this.setInterval(() => {
            if (this.state.isGenerating) {
                this.scrollToBottom(true);
            }
        }, 100);

        // 创建中止控制器
        this._abortController = new AbortController();

        try {
            const history = session.messages.slice(0, -1).slice(-6).map(m => ({
                role: m.role,
                content: m.content
            }));
            const response = await fetch('/api/v1/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Utils.getToken()}`,
                    'X-CSRF-Token': Store.get('csrfToken')
                },
                signal: this._abortController.signal,
                body: JSON.stringify({
                    query: currentInput, // 使用当前获取的输入
                    history: history,
                    knowledge_base_id: selectedKb ? parseInt(selectedKb) : null,
                    use_analysis: useAnalysis,
                    provider: provider,
                    // 传递角色预设
                    role_preset: this.state.rolePreset,
                    // 传递本地模型名称
                    model_name: provider === 'local' ? this.state.selectedModel : null,
                    // 不再传递 api_config (apiKey)，后端会自动从数据库读取
                    // 仅当 api_config 为空时，后端才会查库
                    api_config: null,
                    // 传递会话ID，用于保存消息到数据库
                    session_id: typeof realSessionId === 'number' ? realSessionId : null
                })
            });

            if (!response.ok) throw new Error('网络请求失败');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiMsg = { role: 'assistant', content: '', timestamp: Date.now() };
            session.messages.push(aiMsg);

            // 先执行一次完整更新，确保 AI 消息的 DOM 元素已经存在
            this.update();
            this.scrollToBottom(true);

            // 使用节流优化更新频率
            let lastUpdateTime = 0;
            const updateThrottle = 150; // 稍微增加节流时间，降低重排频率
            let pendingUpdate = false;

            // 增量更新：只更新最后一条 AI 消息的内容，不重建整个 DOM
            const incrementalUpdate = () => {
                const container = this.$('#chatContainer');
                if (!container) return;

                // 找到最后一条 AI 消息的内容元素
                const messageWrappers = container.querySelectorAll('.message-wrapper.ai');
                const lastWrapper = messageWrappers[messageWrappers.length - 1];
                if (!lastWrapper) {
                    // 如果找不到（可能是第一次），执行完整更新
                    this.update();
                    return;
                }

                const contentEl = lastWrapper.querySelector('.message-content');
                if (!contentEl) {
                    this.update();
                    return;
                }

                // 只更新内容，不重新渲染整个组件
                contentEl.innerHTML = this.renderMarkdown(aiMsg.content);

                // 更新 token 统计显示
                const footerInfo = this.$('.ai-footer-info');
                if (footerInfo && this.state.generationSpeed > 0) {
                    const tokenStats = footerInfo.querySelector('.token-stats');
                    if (tokenStats) {
                        tokenStats.textContent = `| Tokens: ${this._tokenCount} | ${this.state.generationSpeed.toFixed(1)} tokens/s`;
                    }
                }

                // 强制确保列表可见
                const list = container.querySelector('.message-list');
                if (list && !list.classList.contains('visible')) {
                    list.classList.add('visible');
                }

                // 滚动到底部
                this.scrollToBottom();
            };

            const throttledUpdate = () => {
                const now = Date.now();
                if (now - lastUpdateTime >= updateThrottle) {
                    incrementalUpdate(); // 使用增量更新
                    lastUpdateTime = now;
                    pendingUpdate = false;
                } else if (!pendingUpdate) {
                    pendingUpdate = true;
                    this.setTimeout(() => {
                        if (pendingUpdate) {
                            incrementalUpdate(); // 使用增量更新
                            pendingUpdate = false;
                            lastUpdateTime = Date.now();
                        }
                    }, updateThrottle - (now - lastUpdateTime));
                }
            };

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 使用 stream: true 处理跨 chunk 的多字节字符
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // 保留最后一个可能不完整的行
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith(':')) continue; // 忽略 SSE 注释

                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') break;

                        try {
                            const data = JSON.parse(dataStr);
                            if (data.error) {
                                // 增强的错误处理
                                let errorMsg = data.error;
                                if (data.suggestions && data.suggestions.length > 0) {
                                    errorMsg += '\n\n建议：\n' + data.suggestions.map(s => `• ${s}`).join('\n');
                                }
                                throw new Error(errorMsg);
                            }
                            if (data.content) {
                                aiMsg.content += data.content;
                                // Token统计：简单估算，每4个字符约等于1个token
                                this._tokenCount += Math.ceil(data.content.length / 4);
                                throttledUpdate(); // 使用节流更新
                            }
                            // 更新生成速度
                            if (this._generationStartTime && this._tokenCount > 0) {
                                const elapsed = (Date.now() - this._generationStartTime) / 1000;
                                if (elapsed > 0.5) { // 至少0.5秒后才计算
                                    this.state.generationSpeed = this._tokenCount / elapsed;
                                    this.state.tokenStats.completion = this._tokenCount;
                                    this.state.tokenStats.total = this._tokenCount;
                                }
                            }
                        } catch (e) {
                            if (dataStr !== '[DONE]') Config.error('解析 SSE 数据失败', e);
                        }
                    }
                }
            }

            // 确保最后更新一次
            this.update();

            // 流式接收完成后保存会话
            this.saveSessions();
        } catch (e) {
            if (e.name === 'AbortError') {
                return;
            }
            // 增强的错误处理和用户提示
            let errorMessage = e.message || 'AI 响应异常';

            // 根据错误类型提供不同的处理
            if (errorMessage.includes('网络') || errorMessage.includes('Network') || errorMessage.includes('fetch')) {
                errorMessage = '网络连接失败，请检查网络设置后重试';
            } else if (errorMessage.includes('API Key') || errorMessage.includes('未配置')) {
                errorMessage = 'API 配置错误，请检查设置';
                // 自动打开设置弹窗
                this.setTimeout(() => this.showConfigModal(), 500);
            } else if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
                errorMessage = '请求超时，请稍后重试';
            }

            Toast.error(errorMessage, 5000); // 显示5秒

            // 移除刚才添加的空消息，避免显示 bug
            const activeSession = sessions.find(s => s.id === activeSessionId);
            if (activeSession && activeSession.messages.length > 0) {
                const lastMsg = activeSession.messages[activeSession.messages.length - 1];
                if (lastMsg.role === 'assistant' && lastMsg.content === '') {
                    activeSession.messages.pop();
                } else if (lastMsg.role === 'assistant') {
                    // 在最后一条消息后添加错误提示
                    activeSession.messages.push({
                        role: 'system',
                        content: `❌ 错误: ${errorMessage}`,
                        isError: true
                    });
                }
            }

            // 保存会话状态
            this.saveSessions();
        } finally {
            if (this._scrollInterval) {
                clearInterval(this._scrollInterval);
                this._scrollInterval = null;
            }

            this._abortController = null;
            // 绕过 setState，直接修改状态并手动更新
            this.state.isGenerating = false;

            // 生成结束后的最后一次更新，必须强制置底，防止浏览器滚动复位
            this._shouldForceScroll = true;

            this.update();
            // 延迟保存，避免频繁请求
            this.setTimeout(() => this.saveSessions(), 1000);
        }
    }

    stopGeneration() {
        if (this._scrollInterval) {
            clearInterval(this._scrollInterval);
            this._scrollInterval = null;
        }

        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
            // 绕过 setState，直接修改状态并手动更新
            this.state.isGenerating = false;
            this._shouldForceScroll = true; // 停止时也要置底
            this.update();
            Toast.info('已停止生成');
        }
    }

    async createNewSession() {
        const newId = `temp_${Date.now()}`;
        const now = Date.now();
        const newSession = {
            id: newId,
            title: '新对话',
            messages: [],
            provider: this.state.provider,
            knowledge_base_id: this.state.selectedKb ? parseInt(this.state.selectedKb) : null,
            use_analysis: this.state.useAnalysis,
            created_at: now,
            updated_at: now
        };
        this.setState({
            sessions: [newSession, ...this.state.sessions],
            activeSessionId: newId
        }, () => {
            // 异步保存，不阻塞UI
            this.setTimeout(() => this.saveSessions(), 500);
        });

        // 新建会话也需要强制置底（虽然内容为空，但为了逻辑统一）
        this._shouldForceScroll = true;
    }

    scrollToBottom(force = false) {
        const container = this.$('#chatContainer');
        if (!container) return;

        // 核心：处理列表的显示状态
        const list = container.querySelector('.message-list');
        const showList = () => {
            if (list && !list.classList.contains('visible')) {
                // 使用 requestAnimationFrame 确保在设置scrollTop后再显示
                requestAnimationFrame(() => list.classList.add('visible'));
            }
        };

        // 如果是强制模式，直接无条件置底
        if (force) {
            container.scrollTop = container.scrollHeight + 10000;
            showList();
            return;
        }

        // 常规检测：获取当前是否已经在底部附近
        const IS_AT_BOTTOM_THRESHOLD = 500; // 放宽阈值，提高自动滚动的容错率
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < IS_AT_BOTTOM_THRESHOLD;

        // 如果已经在底部，或者正在生成（只要在生成就尽量保持底部），则执行置底
        if (isAtBottom || this.state.isGenerating) {
            container.scrollTop = container.scrollHeight + 10000;
        }

        // 无论是否滚动，只要调用了这个方法，就尝试显示列表
        // 这是为了防止列表永远不显示
        showList();
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindDomEvents(); // 仅重新绑定非委托事件
        this.bindInputHistoryEvents(); // 绑定输入历史事件

        // 移除 adjustMessageButtonPosition 调用，避免抖动

        // 使用明确的标志位控制强制滚动，比依赖 DOM 状态更可靠
        if (this._shouldForceScroll || this.state.isGenerating) {
            this.scrollToBottom(true);
            // 增加延迟滚动，确保 DOM 布局完成后再次置底，防止“回到顶部”
            requestAnimationFrame(() => this.scrollToBottom(true));
            this.setTimeout(() => this.scrollToBottom(true), 100);
            this.setTimeout(() => this.scrollToBottom(true), 300);
            this.setTimeout(() => this.scrollToBottom(true), 600);

            this._shouldForceScroll = false; // 重置标志位
        } else {
            this.scrollToBottom();
        }
    }

    /**
     * 绑定输入框历史记录事件
     */
    bindInputHistoryEvents() {
        const inputEl = this.$('#aiInput');
        if (!inputEl || inputEl._historyBound) return;
        inputEl._historyBound = true;

        this.addListener(inputEl, 'keydown', (e) => {
            // 上箭头：切换到上一条历史
            if (e.key === 'ArrowUp' && !e.shiftKey && inputEl.value === '') {
                e.preventDefault();
                if (this._inputHistory.length > 0 && this._historyIndex < this._inputHistory.length - 1) {
                    this._historyIndex++;
                    inputEl.value = this._inputHistory[this._inputHistory.length - 1 - this._historyIndex];
                }
            }
            // 下箭头：切换到下一条历史
            else if (e.key === 'ArrowDown' && !e.shiftKey) {
                e.preventDefault();
                if (this._historyIndex > 0) {
                    this._historyIndex--;
                    inputEl.value = this._inputHistory[this._inputHistory.length - 1 - this._historyIndex];
                } else if (this._historyIndex === 0) {
                    this._historyIndex = -1;
                    inputEl.value = '';
                }
            }
        });
    }

    destroy() {
        if (this._abortController) {
            this._abortController.abort();
        }
        super.destroy();
    }

    /**
     * 根据消息高度调整按钮位置
     * 短消息：按钮显示在消息气泡外部
     * 长消息：按钮显示在消息气泡内部
     */
    /**
     * 根据内容高度调整按钮位置（已移除以优化性能）
     */
    adjustMessageButtonPosition() {
        // 这是一个空方法，保留是为了兼容性，避免报错
        // 原逻辑导致了严重的 Layout Thrashing 和滚动跳动
    }

    /**
     * 导出当前对话为Markdown文件
     */
    exportConversation() {
        const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
        if (!session || session.messages.length === 0) {
            Toast.warning('当前对话为空，无法导出');
            return;
        }

        // 生成Markdown内容
        const now = new Date();
        const dateStr = now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(/\//g, '-');

        let markdown = `# ${session.title}\n\n`;
        markdown += `> 导出时间: ${dateStr}\n`;
        markdown += `> 模式: ${this.state.provider === 'local' ? '本地模型' : '在线API'}\n`;
        if (this.state.provider === 'local' && this.state.selectedModel) {
            markdown += `> 模型: ${this.state.selectedModel}\n`;
        }
        markdown += `\n---\n\n`;

        session.messages.forEach((msg, idx) => {
            if (msg.role === 'user') {
                markdown += `## 👤 用户\n\n${msg.content}\n\n`;
            } else if (msg.role === 'assistant') {
                markdown += `## 🧠 AI助手\n\n${msg.content}\n\n`;
            } else if (msg.role === 'system' && msg.isError) {
                markdown += `## ⚠️ 系统提示\n\n${msg.content}\n\n`;
            }
        });

        markdown += `---\n\n*由 JeJe WebOS AI助手导出*\n`;

        // 创建下载
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `对话_${session.title.substring(0, 20)}_${dateStr.replace(/[:\s]/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Toast.success('对话已导出为 Markdown 文件');
    }
}

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
            provider: 'local', // 'local' 或 'online'
            knowledgeBases: [],
            _eventsBound: false, // 标记事件是否已绑定，防止重复绑定
            _saving: false, // 防止重复保存
            rolePreset: 'default', // 当前角色预设
            selectedModel: null, // 选中的本地模型
            availableModels: [], // 可用的本地模型列表
            tokenStats: { prompt: 0, completion: 0, total: 0 }, // Token统计
            generationSpeed: 0, // 生成速度 (tokens/s)
            sessionSearchQuery: '', // 会话搜索关键词
            apiConfig: {
                apiKey: '',
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
                                        isError: m.isError || false
                                    })),
                                    provider: detailRes.data.provider || 'local',
                                    knowledge_base_id: detailRes.data.knowledge_base_id,
                                    use_analysis: detailRes.data.use_analysis || false
                                };
                            }
                        } catch (e) {
                            console.error(`加载会话 ${s.id} 失败:`, e);
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
            }
        } catch (e) {
            console.error('加载会话失败:', e);
            // 如果后端加载失败，尝试从LocalStorage恢复（降级方案）
            const savedSessions = localStorage.getItem('jeje_ai_sessions');
            if (savedSessions) {
                try {
                    const parsed = JSON.parse(savedSessions);
                    if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
                        this.setState({
                            sessions: parsed.sessions,
                            activeSessionId: parsed.activeSessionId || parsed.sessions[0].id
                        });
                    }
                } catch (e2) {
                    console.error('从LocalStorage恢复失败:', e2);
                }
            }
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

                this.setState({
                    sessions: updatedSessions,
                    activeSessionId: updatedActiveId
                });
            }

            // 同时备份到LocalStorage（降级方案）
            try {
                localStorage.setItem('jeje_ai_sessions', JSON.stringify({
                    sessions: this.state.sessions,
                    activeSessionId: this.state.activeSessionId,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // LocalStorage失败不影响主流程
                console.warn('LocalStorage备份失败:', e);
            }
        } catch (e) {
            console.error('保存会话到后端失败:', e);
            // 降级到LocalStorage
            try {
                localStorage.setItem('jeje_ai_sessions', JSON.stringify({
                    sessions: this.state.sessions,
                    activeSessionId: this.state.activeSessionId,
                    timestamp: Date.now()
                }));
            } catch (e2) {
                console.error('LocalStorage保存也失败:', e2);
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

            // 从 LocalStorage 加载 API 配置（解密API密钥）
            const savedConfig = localStorage.getItem('jeje_ai_config');
            let apiConfig = this.state.apiConfig;
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    // 解密API密钥
                    if (parsed.apiKey) {
                        parsed.apiKey = AIPage.decryptKey(parsed.apiKey);
                    }
                    apiConfig = { ...apiConfig, ...parsed };
                } catch (e) { console.error('Parsed config error', e); }
            }

            // 从 LocalStorage 加载选中的模型
            const savedModel = localStorage.getItem('jeje_ai_selected_model');
            let selectedModel = null;
            const availableModels = aiStatusRes.data?.available_models || [];
            if (savedModel && availableModels.includes(savedModel)) {
                selectedModel = savedModel;
            } else if (availableModels.length > 0) {
                selectedModel = availableModels[0];
            }

            this.setState({
                knowledgeBases: kbRes.data || [],
                apiConfig: apiConfig,
                availableModels: availableModels,
                selectedModel: selectedModel
            });
        } catch (e) {
            console.error('加载数据失败', e);
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
                        <button class="btn btn-primary btn-block" id="btnNewChat">➕ 新建对话</button>
                        <div class="session-search" style="margin-top: 8px;">
                            <input type="text" class="form-input btn-sm" id="sessionSearch" 
                                placeholder="🔍 搜索会话..." 
                                value="${this.state.sessionSearchQuery}"
                                style="width: 100%;">
                        </div>
                    </div>
                    <div class="session-list">
                        ${(() => {
                // 过滤会话列表
                const query = this.state.sessionSearchQuery.toLowerCase().trim();
                const filteredSessions = query
                    ? sessions.filter(s => s.title.toLowerCase().includes(query))
                    : sessions;

                if (filteredSessions.length === 0 && query) {
                    return '<div class="session-empty" style="padding: 12px; text-align: center; opacity: 0.6;">未找到匹配的会话</div>';
                }

                return filteredSessions.map(s => `
                                <div class="session-item ${s.id === activeSessionId ? 'active' : ''}" data-id="${s.id}">
                                    <i class="ri-message-3-line"></i>
                                    <div class="session-info">
                                        <span class="session-title text-truncate">${Utils.escapeHtml(s.title)}</span>
                                        <span class="session-time">${this.formatSessionTime(s.updated_at || s.created_at)}</span>
                                    </div>
                                    <button class="session-delete-btn" data-delete-session="${s.id}" title="删除会话">
                                        <i class="ri-close-line"></i>
                                    </button>
                                </div>
                            `).join('');
            })()}
                    </div>
                    <div class="sidebar-footer">
                        <div class="mode-switch">
                            <button class="mode-btn ${provider === 'local' ? 'active' : ''}" data-mode="local">🏠 本地</button>
                            <button class="mode-btn ${provider === 'online' ? 'active' : ''}" data-mode="online">☁️ 在线</button>
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
                            <span class="ai-badge">${provider === 'local' ? '🏠 本地模型' : '☁️ 在线 API'}</span>
                            ${selectedKb ? '<span class="ai-badge secondary">📚 已挂载知识库</span>' : ''}
                        </div>
                        <div class="ai-options">
                            <!-- 角色预设选择器 -->
                            <select class="form-input btn-sm" id="roleSelector" style="width: 120px;" title="选择AI角色">
                                ${AIPage.ROLE_PRESETS.map(r => `
                                    <option value="${r.id}" ${this.state.rolePreset === r.id ? 'selected' : ''}>${r.icon} ${r.name}</option>
                                `).join('')}
                            </select>
                            
                            <label class="checkbox-label" title="开启将连接数据分析模块">
                                <input type="checkbox" id="checkAnalysis" ${useAnalysis ? 'checked' : ''}> 📈 数据模式
                            </label>
                            
                            <select class="form-input btn-sm" id="kbSelector" style="width: 130px;">
                                <option value="">无知识库</option>
                                ${knowledgeBases.map(kb => `
                                    <option value="${kb.id}" ${selectedKb == kb.id ? 'selected' : ''}>📚 ${kb.name}</option>
                                `).join('')}
                            </select>

                            <button class="btn-icon-only" id="btnExport" title="导出对话">
                                <i class="ri-download-line"></i>
                            </button>

                            <button class="btn-icon-only" id="btnConfig" title="API 设置">
                                <i class="ri-settings-3-line"></i>
                            </button>
                        </div>
                    </div>

                    <div class="chat-container" id="chatContainer">
                        ${activeSession.messages.length === 0 ? `
                            <div class="ai-welcome">
                                <div class="welcome-icon">🧠</div>
                                <h2>你好，我是AI助手</h2>
                                <p>当前处于 <b>${provider === 'local' ? '本地离线模式' : '在线 API 模式'}</b></p>
                                <p>我可以帮你总结文档、分析数据或进行通用对话。请选择一个模式开始吧！</p>
                                <div class="welcome-hints">
                                    <div class="hint-card" data-text="什么是 RAG 技术？">"什么是 RAG 技术？"</div>
                                    <div class="hint-card" data-text="介绍一下 JeJe WebOS">"介绍一下 JeJe WebOS"</div>
                                    <div class="hint-card" data-text="帮我写一段 Python 脚本">"帮我写一段 Python 脚本"</div>
                                </div>
                            </div>
                        ` : `
                            <div class="message-list">
                                ${activeSession.messages.map((msg, idx) => `
                                    <div class="message-wrapper ${msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'ai'}" data-message-idx="${idx}">
                                        <div class="avatar">${msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚠️' : '🧠'}</div>
                                        <div class="message-content-wrapper">
                                            <div class="message-content markdown-body ${msg.isError ? 'error-message' : ''}">
                                                ${this.renderMarkdown(msg.content)}
                                            </div>
                                            <div class="message-meta">
                                                <span class="message-time">${this.formatMessageTime(msg.timestamp)}</span>
                                            </div>
                                            <div class="message-actions">
                                                <button class="msg-action-btn" data-action="copy" data-message-idx="${idx}" title="复制">
                                                    <i class="ri-file-copy-line"></i>
                                                </button>
                                                ${msg.role === 'user' ? `
                                                    <button class="msg-action-btn" data-action="edit" data-message-idx="${idx}" title="编辑">
                                                        <i class="ri-edit-line"></i>
                                                    </button>
                                                ` : `
                                                    <button class="msg-action-btn" data-action="regenerate" data-message-idx="${idx}" title="重新生成">
                                                        <i class="ri-refresh-line"></i>
                                                    </button>
                                                `}
                                                <button class="msg-action-btn danger" data-action="delete" data-message-idx="${idx}" title="删除">
                                                    <i class="ri-delete-bin-line"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                                ${isGenerating ? `
                                    <div class="message-wrapper ai">
                                        <div class="avatar">🧠</div>
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

        // 7. 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 8. 图片
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;">');

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
        const { apiConfig } = this.state;

        const modal = Modal.show({
            title: '⚙️ API 设置 (在线模式)',
            width: '450px',
            content: `
                <div class="form-group">
                    <label class="form-label">API Key</label>
                    <input type="password" class="form-input" id="cfgApiKey" 
                           value="${Utils.escapeHtml(apiConfig.apiKey || '')}" 
                           placeholder="sk-...">
                    <small class="form-hint">DeepSeek / OpenAI 兼容的 API Key</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Base URL</label>
                    <input type="text" class="form-input" id="cfgBaseUrl" 
                           value="${Utils.escapeHtml(apiConfig.baseUrl || '')}" 
                           placeholder="https://api.deepseek.com/v1">
                    <small class="form-hint">API 基础地址，支持 OpenAI 兼容接口</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Model Name</label>
                    <input type="text" class="form-input" id="cfgModel" 
                           value="${Utils.escapeHtml(apiConfig.model || '')}" 
                           placeholder="deepseek-chat">
                    <small class="form-hint">模型名称，如 deepseek-chat, gpt-4o 等</small>
                </div>
            `,
            confirmText: '保存配置',
            cancelText: '取消',
            onConfirm: () => {
                const overlay = modal.overlay;
                const apiKey = overlay.querySelector('#cfgApiKey').value.trim();
                const baseUrl = overlay.querySelector('#cfgBaseUrl').value.trim();
                const model = overlay.querySelector('#cfgModel').value.trim();

                if (!apiKey) {
                    Toast.error('请输入 API Key');
                    return false; // 阻止关闭
                }

                // 保存时加密API密钥
                const configToSave = {
                    apiKey: AIPage.encryptKey(apiKey),
                    baseUrl,
                    model
                };
                localStorage.setItem('jeje_ai_config', JSON.stringify(configToSave));

                // 状态中保存解密后的密钥（用于实际请求）
                const newConfig = { apiKey, baseUrl, model };
                this.setState({ apiConfig: newConfig, provider: 'online' });
                Toast.success('API 配置已保存（密钥已加密存储）');
                return true; // 允许关闭
            }
        });
    }

    bindEvents() {
        if (this.state._eventsBound) return; // 防止重复绑定 delegate
        this.state._eventsBound = true;

        // 由于 innerHTML 会覆盖，对于直接在 DOM 上绑定的事件，需要在 afterUpdate 里单独处理
        this.bindDomEvents();

        this.delegate('click', '#btnSend', () => {
            if (this.state.isGenerating) {
                this.stopGeneration();
            } else {
                this.handleSendMessage();
            }
        });
        this.delegate('click', '#btnNewChat', () => this.createNewSession());

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
            this.setState({ activeSessionId: parseInt(el.dataset.id) || el.dataset.id }, () => {
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
                            console.warn('后端删除失败，仅本地删除:', e);
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

        // 会话搜索
        this.delegate('input', '#sessionSearch', (e) => {
            this.setState({ sessionSearchQuery: e.target.value });
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
            localStorage.setItem('jeje_ai_selected_model', modelName);
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
                    // 删除当前AI回复及之后的所有消息
                    session.messages = session.messages.slice(0, idx);
                    this.setState({ sessions: [...this.state.sessions] }, () => {
                        this.saveSessions();
                        // 重新发送用户消息
                        const userMsg = session.messages[userMsgIdx];
                        const inputEl = this.$('#aiInput');
                        if (inputEl) {
                            inputEl.value = userMsg.content;
                            this.state.inputMessage = userMsg.content;
                        }
                        const btnSend = this.$('#btnSend');
                        if (btnSend) btnSend.disabled = false;
                        setTimeout(() => this.handleSendMessage(), 100);
                    });
                }
            }
        });
    }

    // 绑定那些在 update 后会被销毁的非委托事件
    bindDomEvents() {
        const input = this.$('#aiInput');
        if (input) {
            input.oninput = (e) => {
                const value = e.target.value;
                this.state.inputMessage = value;
                const btnSend = this.$('#btnSend');
                if (btnSend && !this.state.isGenerating) {
                    btnSend.disabled = !value.trim();
                }
            };
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            };
        }
    }

    async handleSendMessage() {
        // 直接从 DOM 获取最新值，确保万无一失
        const inputEl = this.$('#aiInput');
        const currentInput = inputEl ? inputEl.value.trim() : this.state.inputMessage.trim();

        const { isGenerating, activeSessionId, selectedKb, useAnalysis, provider, sessions, apiConfig } = this.state;
        if (isGenerating || !currentInput) return;

        // 如果是在线模式但没有配置
        if (provider === 'online' && !apiConfig.apiKey) {
            Toast.error('请先配置 API Key');
            this.showConfigModal();
            return;
        }

        const session = sessions.find(s => s.id === activeSessionId);
        const userMsg = { role: 'user', content: currentInput, timestamp: Date.now() };

        // 保存到输入历史
        if (this._inputHistory[this._inputHistory.length - 1] !== currentInput) {
            this._inputHistory.push(currentInput);
            if (this._inputHistory.length > this._maxHistorySize) {
                this._inputHistory.shift(); // 超过最大长度时移除最早的
            }
        }
        this._historyIndex = -1; // 重置历史索引

        session.messages.push(userMsg);
        session.updated_at = Date.now(); // 更新会话时间
        if (session.messages.length === 1) {
            session.title = Utils.truncate(currentInput, 15);
        }

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
                    console.warn('无法找到更新后的会话ID，消息可能不会保存到数据库');
                }
            } catch (e) {
                console.warn('创建会话失败，将不保存消息到数据库:', e);
            }
        } else if (typeof session.id === 'number') {
            // 如果是真实ID，更新标题
            try {
                await Api.put(`/ai/sessions/${session.id}`, { title: session.title });
            } catch (e) {
                console.warn('更新会话标题失败:', e);
            }
        }

        // 准备发送，此时清空输入框
        if (inputEl) inputEl.value = '';

        // 初始化Token统计
        this._generationStartTime = Date.now();
        this._tokenCount = 0;

        this.setState({
            inputMessage: '',
            isGenerating: true,
            tokenStats: { prompt: 0, completion: 0, total: 0 },
            generationSpeed: 0
        });

        this.scrollToBottom();

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
                    'Authorization': `Bearer ${Utils.getToken()}`
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
                    // 传递临时 API 配置
                    api_config: provider === 'online' ? apiConfig : null,
                    // 传递会话ID，用于保存消息到数据库
                    session_id: typeof realSessionId === 'number' ? realSessionId : null
                })
            });

            if (!response.ok) throw new Error('网络请求失败');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiMsg = { role: 'assistant', content: '', timestamp: Date.now() };
            session.messages.push(aiMsg);

            // 使用节流优化更新频率
            let lastUpdateTime = 0;
            const updateThrottle = 100; // 每100ms最多更新一次
            let pendingUpdate = false;

            const throttledUpdate = () => {
                const now = Date.now();
                if (now - lastUpdateTime >= updateThrottle) {
                    this.update();
                    this.scrollToBottom();
                    lastUpdateTime = now;
                    pendingUpdate = false;
                } else if (!pendingUpdate) {
                    pendingUpdate = true;
                    setTimeout(() => {
                        if (pendingUpdate) {
                            this.update();
                            this.scrollToBottom();
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
                            if (dataStr !== '[DONE]') console.error('Parse SSE error', e);
                        }
                    }
                }
            }

            // 确保最后更新一次
            this.update();
            this.scrollToBottom();

            // 流式接收完成后保存会话
            this.saveSessions();
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('生成已中止');
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
                setTimeout(() => this.showConfigModal(), 500);
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
            this._abortController = null;
            this.setState({ isGenerating: false }, () => {
                // 延迟保存，避免频繁请求
                setTimeout(() => this.saveSessions(), 1000);
            });
        }
    }

    stopGeneration() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
            this.setState({ isGenerating: false });
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
            setTimeout(() => this.saveSessions(), 500);
        });
    }

    scrollToBottom() {
        const container = this.$('#chatContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    afterMount() {
        this.loadData();
        this.bindEvents();
    }

    afterUpdate() {
        this.bindDomEvents(); // 仅重新绑定非委托事件
        this.bindInputHistoryEvents(); // 绑定输入历史事件
        this.adjustMessageButtonPosition(); // 调整按钮位置
        this.scrollToBottom();
    }

    /**
     * 绑定输入框历史记录事件
     */
    bindInputHistoryEvents() {
        const inputEl = this.$('#aiInput');
        if (!inputEl || inputEl._historyBound) return;
        inputEl._historyBound = true;

        inputEl.addEventListener('keydown', (e) => {
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

    /**
     * 根据消息高度调整按钮位置
     * 短消息：按钮显示在消息气泡外部
     * 长消息：按钮显示在消息气泡内部
     */
    adjustMessageButtonPosition() {
        const messageWrappers = this.container.querySelectorAll('.message-content-wrapper');
        messageWrappers.forEach(wrapper => {
            const content = wrapper.querySelector('.message-content');
            if (!content) return;

            // 获取消息内容的高度
            const height = content.offsetHeight;
            const threshold = 60; // 阈值：60px，超过此高度视为长消息

            if (height > threshold) {
                wrapper.classList.add('message-long');
            } else {
                wrapper.classList.remove('message-long');
            }
        });
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

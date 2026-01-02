/**
 * 快传页面
 * 局域网内设备间高速文件传输
 */

class TransferPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            currentView: 'send',
            config: { max_file_size: 1024 * 1024 * 1024, chunk_size: 1024 * 1024, session_expire_minutes: 10 },
            selectedFile: null,
            sessionCode: null,
            isWaiting: false,
            peerConnected: false,
            peerNickname: null,
            inputCode: '',
            joinedSession: null,
            isTransferring: false,
            transferProgress: 0,
            transferredBytes: 0,
            totalBytes: 0,
            transferSpeed: 0,
            history: [],
            historyTotal: 0,
            historyPage: 1,
            historyFilter: null,
            stats: { total_sent: 0, total_received: 0, success_rate: 100 }
        };
        this.currentChunkIndex = 0;
        this.startTime = null;
        this.wsListeners = [];
    }

    async init() {
        await this.loadConfig();
        await this.loadStats();
        await this.loadHistory();
        this.setupWebSocketListeners();
    }

    async loadConfig() {
        try {
            const res = await Api.get('/transfer/config');
            if (res.code === 0 || res.max_file_size) {
                this.setState({ config: res.data || res });
            }
        } catch (e) { console.error('加载配置失败:', e); }
    }

    async loadStats() {
        try {
            const res = await Api.get('/transfer/history/stats');
            if (res.code === 0) this.setState({ stats: res.data });
        } catch (e) { console.error('加载统计失败:', e); }
    }

    async loadHistory() {
        try {
            const { historyPage, historyFilter } = this.state;
            let url = `/transfer/history?page=${historyPage}&size=10`;
            if (historyFilter) url += `&direction=${historyFilter}`;
            const res = await Api.get(url);
            if (res.code === 0) {
                this.setState({ history: res.data.items, historyTotal: res.data.total });
            }
        } catch (e) { console.error('加载历史失败:', e); }
    }

    // 使用全局 WebSocketClient
    setupWebSocketListeners() {
        if (typeof WebSocketClient === 'undefined') return;

        const listeners = [
            ['transfer_peer_connected', (data) => this.handlePeerConnected(data)],
            ['transfer_peer_disconnected', () => this.handlePeerDisconnected()],
            ['transfer_started', () => this.handleTransferStarted()],
            ['transfer_progress', (data) => this.handleProgress(data)],
            ['transfer_completed', () => this.handleTransferComplete()],
            ['transfer_cancelled', () => this.handleTransferCancelled()]
        ];

        listeners.forEach(([event, handler]) => {
            WebSocketClient.on(event, handler);
            this.wsListeners.push([event, handler]);
        });
    }

    sendWSMessage(type, data = {}) {
        if (typeof WebSocketClient !== 'undefined' && WebSocketClient.isConnected()) {
            WebSocketClient.send(type, data);
        }
    }

    handlePeerConnected(data) {
        this.setState({ peerConnected: true, peerNickname: data?.nickname || '对方' });
        Toast.success('对方已连接');
    }

    handlePeerDisconnected() {
        this.setState({ peerConnected: false });
        Toast.warning('对方已断开');
    }

    handleTransferStarted() {
        this.setState({ isTransferring: true });
    }

    handleProgress(data) {
        this.setState({
            transferProgress: data?.progress_percent || 0,
            transferredBytes: data?.transferred_bytes || 0
        });
    }

    handleTransferCancelled() {
        this.resetState();
        Toast.warning('传输已取消');
    }

    // 格式化文件大小
    formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    render() {
        const { currentView, stats } = this.state;
        return `
            <div class="transfer-page">
                <div class="transfer-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="header-title"><i class="fas fa-bolt"></i><span>快传</span></div>
                        <div class="header-stats">
                            <span><i class="fas fa-arrow-up"></i> 发送 ${stats.total_sent}</span>
                            <span><i class="fas fa-arrow-down"></i> 接收 ${stats.total_received}</span>
                            <span><i class="fas fa-check-circle"></i> ${stats.success_rate}%</span>
                        </div>
                    </div>
                    <div>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('transfer', '快传') : ''}
                    </div>
                </div>
                <div class="transfer-tabs">
                    <button class="tab-btn ${currentView === 'send' ? 'active' : ''}" data-view="send"><i class="fas fa-share"></i> 发送</button>
                    <button class="tab-btn ${currentView === 'receive' ? 'active' : ''}" data-view="receive"><i class="fas fa-download"></i> 接收</button>
                    <button class="tab-btn ${currentView === 'history' ? 'active' : ''}" data-view="history"><i class="fas fa-history"></i> 历史</button>
                </div>
                <div class="transfer-content">
                    ${currentView === 'send' ? this.renderSendView() : ''}
                    ${currentView === 'receive' ? this.renderReceiveView() : ''}
                    ${currentView === 'history' ? this.renderHistoryView() : ''}
                </div>
            </div>`;
    }

    renderSendView() {
        const { selectedFile, sessionCode, isWaiting, peerConnected, isTransferring, config } = this.state;
        if (isTransferring) return this.renderProgress();
        if (isWaiting && sessionCode) {
            return `<div class="send-waiting">
                <div class="code-display">${sessionCode.split('').map(d => `<span class="digit">${d}</span>`).join('')}</div>
                <button class="btn" id="copyCodeBtn"><i class="fas fa-copy"></i> 复制</button>
                <p>传输码 ${config.session_expire_minutes} 分钟内有效</p>
                <div class="file-info"><i class="fas fa-file"></i> ${selectedFile?.name} (${this.formatSize(selectedFile?.size || 0)})</div>
                ${peerConnected ? `<button class="btn primary" id="startTransferBtn"><i class="fas fa-play"></i> 开始传输</button>` : '<p class="waiting">等待对方连接...</p>'}
                <button class="btn cancel" id="cancelSessionBtn"><i class="fas fa-times"></i> 取消</button>
            </div>`;
        }
        return `<div class="send-select">
            <div class="drop-zone" id="dropZone">
                <div class="drop-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <p class="drop-title">拖拽文件或点击选择</p>
                <p class="drop-hint">支持任意类型文件</p>
                <input type="file" id="fileInput" hidden>
            </div>
            ${selectedFile ? `
            <div class="selected-file">
                <i class="fas fa-file"></i>
                <div class="file-details">
                    <span class="file-name">${selectedFile.name}</span>
                    <span class="file-size">${this.formatSize(selectedFile.size)}</span>
                </div>
                <button id="removeFileBtn"><i class="fas fa-times"></i></button>
            </div>
            <button class="btn primary" id="createSessionBtn"><i class="fas fa-bolt"></i> 生成传输码</button>
            ` : ''}
            <p class="tip"><i class="fas fa-info-circle"></i> 最大支持 ${this.formatSize(config.max_file_size)}</p>
        </div>`;
    }

    renderReceiveView() {
        const { inputCode, joinedSession, isTransferring } = this.state;
        if (isTransferring) return this.renderProgress();
        if (joinedSession) {
            return `<div class="receive-joined"><i class="fas fa-check-circle"></i><p>已连接，等待传输...</p><div class="file-info">${joinedSession.file_name} (${this.formatSize(joinedSession.file_size)})</div><button class="btn cancel" id="leaveSessionBtn"><i class="fas fa-times"></i> 取消</button></div>`;
        }
        return `<div class="receive-input"><p>输入6位传输码</p><input type="text" class="code-input" id="codeInput" maxlength="6" placeholder="______" value="${inputCode}"><button class="btn primary ${inputCode.length === 6 ? '' : 'disabled'}" id="joinSessionBtn" ${inputCode.length !== 6 ? 'disabled' : ''}><i class="fas fa-link"></i> 连接</button></div>`;
    }

    renderProgress() {
        const { transferProgress, transferredBytes, totalBytes, transferSpeed, currentView } = this.state;
        return `<div class="transfer-progress"><div class="progress-icon"><i class="fas ${currentView === 'send' ? 'fa-arrow-up' : 'fa-arrow-down'}"></i></div><p>${currentView === 'send' ? '正在发送' : '正在接收'}</p><div class="progress-bar"><div class="fill" style="width:${transferProgress}%"></div></div><p>${transferProgress.toFixed(1)}% · ${this.formatSize(transferredBytes)}/${this.formatSize(totalBytes)} · ${this.formatSize(transferSpeed)}/s</p><button class="btn cancel" id="cancelTransferBtn"><i class="fas fa-times"></i> 取消</button></div>`;
    }

    renderHistoryView() {
        const { history, historyTotal, historyPage, historyFilter } = this.state;
        const pages = Math.ceil(historyTotal / 10);
        return `<div class="history-view">
            <div class="filter">
                <span style="margin-right:10px;color:rgba(255,255,255,0.6)">筛选:</span>
                <button class="${!historyFilter ? 'active' : ''}" data-filter="">全部</button>
                <button class="${historyFilter === 'send' ? 'active' : ''}" data-filter="send">仅发送</button>
                <button class="${historyFilter === 'receive' ? 'active' : ''}" data-filter="receive">仅接收</button>
            </div>
            ${history.length === 0 ? '<div class="empty"><i class="fas fa-inbox"></i><p>暂无传输记录</p></div>' : `<div class="list">${history.map(h => `
                <div class="item">
                    <div class="item-icon ${h.direction}">
                        <i class="fas ${h.direction === 'send' ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                    </div>
                    <div class="item-info">
                        <span class="item-name">${h.file_name}</span>
                        <span class="item-meta">${this.formatSize(h.file_size)} · ${h.peer_nickname || '未知'} · ${Utils.timeAgo(h.created_at)}</span>
                    </div>
                    <button class="del" data-id="${h.id}"><i class="fas fa-trash"></i></button>
                </div>`).join('')}</div>`}
            ${pages > 1 ? `<div class="pagination"><button ${historyPage <= 1 ? 'disabled' : ''} data-page="${historyPage - 1}">上一页</button><span>${historyPage}/${pages}</span><button ${historyPage >= pages ? 'disabled' : ''} data-page="${historyPage + 1}">下一页</button></div>` : ''}
        </div>`;
    }

    afterMount() {
        this.init();
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    afterUpdate() {
        this.bindEvents();
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }

    bindEvents() {
        // Tab 切换
        this.delegate('click', '.tab-btn', (e, el) => {
            this.setState({ currentView: el.dataset.view });
        });

        // 拖放区域
        const dropZone = this.$('#dropZone');
        const fileInput = this.$('#fileInput');
        if (dropZone && fileInput && !dropZone._bindedDrop) {
            dropZone._bindedDrop = true;
            dropZone.onclick = () => fileInput.click();
            fileInput.onchange = (e) => { if (e.target.files[0]) this.handleFileSelect(e.target.files[0]); };
            dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
            dropZone.ondragleave = () => dropZone.classList.remove('dragover');
            dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.handleFileSelect(e.dataTransfer.files[0]); };
        }

        // 发送视图按钮
        this.delegate('click', '#removeFileBtn', () => this.setState({ selectedFile: null }));
        this.delegate('click', '#createSessionBtn', () => this.createSession());
        this.delegate('click', '#copyCodeBtn', () => { navigator.clipboard.writeText(this.state.sessionCode); Toast.success('已复制'); });
        this.delegate('click', '#startTransferBtn', () => this.startTransfer());
        this.delegate('click', '#cancelSessionBtn', () => this.cancelSession());
        this.delegate('click', '#cancelTransferBtn', () => this.cancelTransfer());

        // 接收视图
        const codeInput = this.$('#codeInput');
        if (codeInput && !codeInput._binded) {
            codeInput._binded = true;
            codeInput.oninput = (e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                this.state.inputCode = val; // 直接更新 state

                if (e.target.value !== val) e.target.value = val;

                const btn = this.$('#joinSessionBtn');
                if (btn) {
                    const isValid = val.length === 6 && !this.state.isJoining;
                    btn.disabled = !isValid;
                    if (isValid) btn.classList.remove('disabled');
                    else btn.classList.add('disabled');
                }
            };
        }
        this.delegate('click', '#joinSessionBtn', () => this.joinSession());
        this.delegate('click', '#leaveSessionBtn', () => {
            this.sendWSMessage('transfer_close', { session_code: this.state.joinedSession?.session_code });
            this.setState({ joinedSession: null, inputCode: '' });
        });

        // 历史记录
        this.delegate('click', '.filter button', (e, el) => {
            this.setState({ historyFilter: el.dataset.filter || null, historyPage: 1 });
            this.loadHistory();
        });
        this.delegate('click', '.list .del', (e, el) => this.deleteHistory(el.dataset.id));
        this.delegate('click', '.pagination button', (e, el) => {
            if (!el.disabled) {
                this.setState({ historyPage: parseInt(el.dataset.page) });
                this.loadHistory();
            }
        });
    }

    handleFileSelect(file) {
        if (file.size > this.state.config.max_file_size) {
            Toast.error('文件过大');
            return;
        }
        this.setState({ selectedFile: file });
    }

    async createSession() {
        const { selectedFile, isCreating } = this.state;
        if (!selectedFile || isCreating) return;

        this.setState({ isCreating: true });
        try {
            const res = await Api.post('/transfer/session', {
                file_name: selectedFile.name,
                file_size: selectedFile.size,
                file_type: selectedFile.type
            });
            if (res.code === 0) {
                this.setState({ sessionCode: res.data.session_code, isWaiting: true });
                this.sendWSMessage('transfer_create', { session_code: res.data.session_code });
                this.startPolling();
                Toast.success('传输码已生成');
            } else {
                Toast.error(res.message || '创建失败');
            }
        } catch (e) {
            Toast.error('创建失败');
        } finally {
            this.setState({ isCreating: false });
        }
    }

    async joinSession() {
        const { inputCode, isJoining } = this.state;
        if (inputCode.length !== 6 || isJoining) return;

        this.setState({ isJoining: true });
        try {
            const res = await Api.post('/transfer/session/join', { session_code: inputCode });
            if (res.code === 0) {
                this.setState({ joinedSession: res.data, totalBytes: res.data.file_size });
                this.sendWSMessage('transfer_join', { session_code: inputCode });
                this.startPolling();
                Toast.success('连接成功');
            } else {
                Toast.error(res.message || '连接失败');
            }
        } catch (e) {
            console.error(e);
            Toast.error(e.message || '传输码无效或已过期');
        } finally {
            this.setState({ isJoining: false });
        }
    }

    async startTransfer() {
        const { selectedFile, sessionCode, config } = this.state;
        if (!selectedFile || !sessionCode) return;
        this.setState({ isTransferring: true, transferProgress: 0, transferredBytes: 0, totalBytes: selectedFile.size });
        this.startTime = Date.now();
        this.currentChunkIndex = 0;
        this.sendWSMessage('transfer_start', { session_code: sessionCode });
        await this.uploadChunks();
    }

    async uploadChunks() {
        const { selectedFile, sessionCode, config } = this.state;
        const chunkSize = config.chunk_size || 1024 * 1024;
        const total = Math.ceil(selectedFile.size / chunkSize);

        while (this.currentChunkIndex < total) {
            const start = this.currentChunkIndex * chunkSize;
            const chunk = selectedFile.slice(start, Math.min(start + chunkSize, selectedFile.size));
            const fd = new FormData();
            fd.append('session_code', sessionCode);
            fd.append('chunk_index', this.currentChunkIndex);
            fd.append('chunk', chunk);

            try {
                const res = await Api.upload('/transfer/chunk/upload', fd);
                if (res.code === 0) {
                    const elapsed = (Date.now() - this.startTime) / 1000;
                    this.setState({
                        transferredBytes: res.data.transferred_bytes,
                        transferProgress: res.data.progress_percent,
                        transferSpeed: elapsed > 0 ? res.data.transferred_bytes / elapsed : 0
                    });
                    this.sendWSMessage('transfer_progress', {
                        session_code: sessionCode,
                        transferred_bytes: res.data.transferred_bytes,
                        progress_percent: res.data.progress_percent
                    });
                    this.currentChunkIndex++;
                } else {
                    throw new Error(res.message);
                }
            } catch (e) {
                Toast.error('传输失败: ' + e.message);
                this.cancelTransfer();
                return;
            }
        }
        this.sendWSMessage('transfer_complete', { session_code: sessionCode });
        this.handleTransferComplete();
    }

    handleTransferComplete() {
        // 接收方自动下载
        const { currentView, joinedSession } = this.state;
        if (currentView === 'receive' && joinedSession) {
            this.downloadFile(joinedSession.session_code);
        }

        Toast.success('传输完成');
        this.resetState();
        this.loadHistory();
        this.loadStats();
    }

    downloadFile(sessionCode) {
        const token = localStorage.getItem(Config.storageKeys.token);
        const url = `${Config.apiBase}/transfer/download/${sessionCode}?token=${token}`;

        // 创建隐藏的 iframe 或 a 标签下载
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async cancelSession() {
        const { sessionCode, isCancelling } = this.state;
        if (!sessionCode || isCancelling) return;

        this.setState({ isCancelling: true });
        try {
            await Api.delete(`/transfer/session/${sessionCode}`);
        } catch (e) { /* ignore */ }

        this.sendWSMessage('transfer_close', { session_code: sessionCode });
        this.setState({ isCancelling: false });
        this.resetState();
    }

    async cancelTransfer() {
        const { sessionCode, joinedSession, isCancelling } = this.state;
        if (isCancelling) return;

        const code = sessionCode || joinedSession?.session_code;
        if (code) {
            this.setState({ isCancelling: true });
            this.sendWSMessage('transfer_cancel', { session_code: code });
            try {
                await Api.delete(`/transfer/session/${code}`);
            } catch (e) { /* ignore */ }
            this.setState({ isCancelling: false });
        }
        this.resetState();
        Toast.warning('已取消');
    }

    resetState() {
        this.stopPolling();
        this.setState({
            selectedFile: null,
            sessionCode: null,
            isWaiting: false,
            peerConnected: false,
            isTransferring: false,
            transferProgress: 0,
            transferredBytes: 0,
            transferSpeed: 0,
            joinedSession: null,
            inputCode: ''
        });
        this.currentChunkIndex = 0;
    }

    async deleteHistory(id) {
        try {
            await Api.delete(`/transfer/history/${id}`);
            Toast.success('已删除');
            this.loadHistory();
            this.loadStats();
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    startPolling() {
        this.stopPolling();
        this.pollingInterval = setInterval(async () => {
            const { sessionCode, joinedSession, currentView, peerConnected, isTransferring } = this.state;
            const code = sessionCode || joinedSession?.session_code;

            if (!code) return;

            try {
                const res = await Api.get(`/transfer/session/${code}`);
                if (res.code === 0) {
                    const data = res.data;
                    const status = data.status;

                    // 发送方：检测对方连接
                    if (currentView === 'send' && !peerConnected && data.peer_connected) {
                        this.handlePeerConnected({ nickname: data.peer_nickname });
                    }

                    // 双方：检测传输开始
                    if (!isTransferring && status === 'transferring') {
                        this.handleTransferStarted();
                    }

                    // 双方：检测传输完成
                    if (status === 'completed' && this.state.transferProgress < 100) {
                        // 确保最后一次进度更新
                        this.setState({ transferProgress: 100, transferredBytes: data.file_size });
                        this.handleTransferComplete();
                    }

                    // 双方：检测取消
                    if (status === 'cancelled' || status === 'failed') {
                        this.handleTransferCancelled();
                    }
                }
            } catch (e) {
                // 会话可能已不存在
                if (e.message.includes('404')) {
                    // this.handleTransferCancelled(); // 404 可能意味着还没同步，暂不强制取消
                }
            }
        }, 3000); // 每3秒轮询一次
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    destroy() {
        this.stopPolling();
        // 清理WebSocket监听器
        if (typeof WebSocketClient !== 'undefined') {
            this.wsListeners.forEach(([event, handler]) => {
                WebSocketClient.off(event, handler);
            });
        }
        this.wsListeners = [];
        super.destroy();
    }
}

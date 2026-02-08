/**
 * 考试模块页面组件
 * 
 * 功能：题库管理、试卷管理、在线考试、阅卷
 */

class ExamPage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');

        this.state = {
            view: 'home',  // 视图: home, questions, papers, take, result, grading, grading_detail, result_detail, wrong_questions, ranking, preview
            loading: false,

            // 题库相关
            banks: [],
            currentBankId: null,

            // 题目相关
            questions: [],
            questionPage: 1,
            questionTotal: 0,
            expandedQuestionId: null,  // 展开预览的题目ID

            // 试卷相关
            papers: [],
            paperPage: 1,
            paperTotal: 0,
            currentPaper: null,
            previewPaper: null,  // 预览的试卷

            // 考试相关
            availableExams: [],
            myRecords: [],
            currentExam: null,
            examAnswers: {},
            remainingTime: 0,
            saveStatus: 'saved', // 保存状态: saved(已保存), saving(保存中), error(错误)
            currentQuestionIndex: 0,  // 当前题目索引（用于键盘导航）

            // 阅卷相关
            pendingRecords: [],
            gradingRecord: null,

            // 错题本和排名
            wrongQuestions: [],
            wrongTotal: 0,
            currentRanking: null,

            // 离线缓存标识
            isOnline: navigator.onLine,

            // 防作弊
            switchCount: 0,
            showCheatWarning: false,

            // 倒计时提醒
            reminded5min: false,
            reminded1min: false
        };

        this._examTimer = null;
        this._saveTimeout = null;

        // 防作弊相关
        this._antiCheatBound = false;
        this._visibilityHandler = null;
        this._blurHandler = null;
        this._copyHandler = null;
        this._contextMenuHandler = null;
        this._keydownHandler = null;

        // 默认权限检查
        this.permissions = user?.permissions || [];
    }

    /**
     * 权限检查辅助方法
     */
    _hasPermission(permission) {
        const user = Store.get('user');
        if (!user) return false;
        if (user.role === 'admin') return true;
        // 如果是 exam.admin 权限，则拥有模块所有权限
        if (user.permissions && user.permissions.includes('exam.admin')) return true;
        return user.permissions && user.permissions.includes(permission);
    }

    async afterMount() {
        this.bindEvents();

        // 检查是否有未完成的考试（断点续做）
        await this._checkInProgressExam();

        await this.loadHomeData();

        // 监听网络状态
        window.addEventListener('online', () => this.setState({ isOnline: true }));
        window.addEventListener('offline', () => this.setState({ isOnline: false }));

        // 绑定全局键盘快捷键
        this._bindKeyboardShortcuts();
    }

    destroy() {
        if (this._examTimer) {
            clearInterval(this._examTimer);
        }
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
        }
        // 移除防作弊监听
        this._disableAntiCheat();
        // 移除键盘快捷键监听
        this._unbindKeyboardShortcuts();
        super.destroy();
    }

    // ==================== 断点续做功能 ====================

    /**
     * 检查是否有未完成的考试
     */
    async _checkInProgressExam() {
        try {
            const res = await Api.get('/exam/records?status=in_progress&page_size=1');
            const inProgress = res.data?.items || [];

            if (inProgress.length > 0) {
                const record = inProgress[0];
                const confirmed = await Modal.confirm(
                    '发现未完成的考试',
                    `您有一场未完成的考试「${Utils.escapeHtml(record.paper_title || '未知试卷')}」，是否继续作答？`,
                    { confirmText: '继续考试', cancelText: '稍后再说' }
                );

                if (confirmed) {
                    await this._resumeExam(record.id);
                }
            }
        } catch (e) {
            // 静默失败，不影响正常使用
            console.warn('检查进行中考试失败:', e);
        }
    }

    /**
     * 恢复未完成的考试
     */
    async _resumeExam(recordId) {
        try {
            const examRes = await Api.get(`/exam/take/${recordId}`);
            const examData = examRes.data;

            this.setState({
                view: 'take',
                currentExam: examData,
                examAnswers: examData.saved_answers || {},
                remainingTime: examData.remaining_seconds || 0,
                saveStatus: 'saved',
                switchCount: 0,
                showCheatWarning: false,
                reminded5min: false,
                reminded1min: false
            });

            // 启用防作弊检测
            this._enableAntiCheat();

            // 启动计时器
            this._startExamTimer();

            Toast.success('已恢复考试进度');
        } catch (e) {
            Toast.error('恢复考试失败');
        }
    }

    // ==================== 键盘快捷键 ====================

    /**
     * 绑定键盘快捷键
     */
    _bindKeyboardShortcuts() {
        this._keyboardHandler = (e) => {
            // 只在考试界面启用快捷键
            if (this.state.view !== 'take') return;

            // 如果焦点在输入框内，不处理
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

            const { currentExam, currentQuestionIndex } = this.state;
            if (!currentExam) return;

            const totalQuestions = currentExam.questions?.length || 0;

            switch (e.key) {
                case 'ArrowUp':
                case 'ArrowLeft':
                    // 上一题
                    e.preventDefault();
                    if (currentQuestionIndex > 0) {
                        this._navigateToQuestion(currentQuestionIndex - 1);
                    }
                    break;
                case 'ArrowDown':
                case 'ArrowRight':
                    // 下一题
                    e.preventDefault();
                    if (currentQuestionIndex < totalQuestions - 1) {
                        this._navigateToQuestion(currentQuestionIndex + 1);
                    }
                    break;
                case 'Enter':
                    // Ctrl+Enter 提交
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.submitExam();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', this._keyboardHandler);
    }

    /**
     * 移除键盘快捷键监听
     */
    _unbindKeyboardShortcuts() {
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
            this._keyboardHandler = null;
        }
    }

    /**
     * 导航到指定题目
     */
    _navigateToQuestion(index) {
        const { currentExam } = this.state;
        if (!currentExam || !currentExam.questions) return;

        const question = currentExam.questions[index];
        if (!question) return;

        this.setState({ currentQuestionIndex: index });

        const target = document.getElementById(`q-${question.id}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 高亮效果
            target.classList.add('question-highlight');
            setTimeout(() => target.classList.remove('question-highlight'), 1000);
        }
    }

    // ==================== 倒计时提醒 ====================

    /**
     * 启动考试计时器
     */
    _startExamTimer() {
        this._examTimer = setInterval(() => {
            const { remainingTime, reminded5min, reminded1min } = this.state;

            if (remainingTime <= 0) {
                this.submitExam();
                return;
            }

            // 5分钟提醒
            if (!reminded5min && remainingTime <= 300 && remainingTime > 60) {
                this._showTimeReminder(5);
                this.setState({ reminded5min: true });
            }

            // 1分钟提醒
            if (!reminded1min && remainingTime <= 60) {
                this._showTimeReminder(1);
                this.setState({ reminded1min: true });
            }

            this.setState({ remainingTime: remainingTime - 1 });
        }, 1000);
    }

    /**
     * 显示时间提醒弹窗
     */
    _showTimeReminder(minutes) {
        // 播放提示音
        this._playReminderSound();

        const isUrgent = minutes <= 1;
        const overlay = document.createElement('div');
        overlay.className = 'time-reminder-overlay';

        const modal = document.createElement('div');
        modal.className = `time-reminder-modal ${isUrgent ? 'danger' : 'warning'}`;
        modal.innerHTML = `
            <div class="reminder-icon">
                <i class="ri-alarm-warning-line"></i>
            </div>
            <h3>${isUrgent ? '⚠️ 时间紧迫！' : '⏰ 时间提醒'}</h3>
            <p>考试还剩 <strong>${Utils.escapeHtml(String(minutes))}</strong> 分钟，请抓紧时间作答！</p>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // 3秒后自动关闭
        setTimeout(() => {
            overlay.remove();
            modal.remove();
        }, 3000);

        // 点击关闭
        overlay.onclick = () => {
            overlay.remove();
            modal.remove();
        };
    }

    /**
     * 播放提醒音效
     */
    _playReminderSound() {
        try {
            // 使用 Web Audio API 生成简单提示音
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            // 音频播放失败时静默处理
        }
    }

    // ==================== 题目预览功能 ====================

    /**
     * 切换题目预览展开状态
     */
    toggleQuestionPreview(questionId) {
        const { expandedQuestionId } = this.state;
        this.setState({
            expandedQuestionId: expandedQuestionId === questionId ? null : questionId
        });
    }

    // ==================== 试卷预览功能 ====================

    /**
     * 预览试卷
     */
    async previewPaper(paperId) {
        try {
            const res = await Api.get(`/exam/papers/${paperId}`);
            this.setState({
                previewPaper: res.data,
                view: 'preview'
            });
        } catch (e) {
            Toast.error('加载试卷预览失败');
        }
    }

    // ==================== 防作弊检测 ====================

    /**
     * 启用防作弊检测
     * 在考试开始时调用
     */
    _enableAntiCheat() {
        if (this._antiCheatBound) return;
        this._antiCheatBound = true;

        // 1. 页面可见性检测（切屏/切标签页）
        this._visibilityHandler = () => {
            if (document.hidden && this.state.view === 'take') {
                this._handleCheatEvent('切换标签页/窗口');
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        // 2. 窗口失焦检测
        this._blurHandler = () => {
            if (this.state.view === 'take') {
                this._handleCheatEvent('窗口失去焦点');
            }
        };
        window.addEventListener('blur', this._blurHandler);

        // 3. 禁止复制
        this._copyHandler = (e) => {
            if (this.state.view === 'take') {
                e.preventDefault();
                Toast.warning('考试中禁止复制');
                this._handleCheatEvent('尝试复制内容', false);
            }
        };
        document.addEventListener('copy', this._copyHandler);
        document.addEventListener('cut', this._copyHandler);

        // 4. 禁止右键菜单
        this._contextMenuHandler = (e) => {
            if (this.state.view === 'take') {
                e.preventDefault();
                Toast.warning('考试中禁止右键操作');
            }
        };
        document.addEventListener('contextmenu', this._contextMenuHandler);

        // 5. 禁止快捷键（F12、Ctrl+U、Ctrl+Shift+I等）
        this._keydownHandler = (e) => {
            if (this.state.view !== 'take') return;

            // F12
            if (e.key === 'F12') {
                e.preventDefault();
                Toast.warning('考试中禁止打开开发者工具');
                this._handleCheatEvent('尝试打开开发者工具', false);
                return;
            }
            // Ctrl+U (查看源代码)
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                return;
            }
            // Ctrl+Shift+I (开发者工具)
            if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                e.preventDefault();
                this._handleCheatEvent('尝试打开开发者工具', false);
                return;
            }
            // Ctrl+Shift+J (控制台)
            if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                e.preventDefault();
                return;
            }
            // Ctrl+C (复制)
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                Toast.warning('考试中禁止复制');
                return;
            }
            // Ctrl+V (粘贴) - 但允许在答题区粘贴
            if (e.ctrlKey && e.key === 'v') {
                const target = e.target;
                if (!target.closest('.exam-answer')) {
                    e.preventDefault();
                }
            }
        };
        document.addEventListener('keydown', this._keydownHandler);


    }

    /**
     * 禁用防作弊检测
     * 在考试结束时调用
     */
    _disableAntiCheat() {
        if (!this._antiCheatBound) return;

        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
        }
        if (this._blurHandler) {
            window.removeEventListener('blur', this._blurHandler);
        }
        if (this._copyHandler) {
            document.removeEventListener('copy', this._copyHandler);
            document.removeEventListener('cut', this._copyHandler);
        }
        if (this._contextMenuHandler) {
            document.removeEventListener('contextmenu', this._contextMenuHandler);
        }
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
        }

        this._antiCheatBound = false;

    }

    /**
     * 处理作弊事件
     * @param {string} action 作弊行为描述
     * @param {boolean} showWarning 是否显示警告横幅
     */
    async _handleCheatEvent(action, showWarning = true) {
        const { currentExam, switchCount } = this.state;
        const newCount = switchCount + 1;

        this.setState({
            switchCount: newCount,
            showCheatWarning: showWarning
        });

        // 3秒后隐藏警告
        if (showWarning) {
            setTimeout(() => {
                this.setState({ showCheatWarning: false });
            }, 3000);
        }

        // 向后端报告作弊行为
        if (currentExam?.record_id) {
            try {
                await Api.post('/exam/cheat-log', {
                    record_id: currentExam.record_id,
                    action: action,
                    count: newCount,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                // 静默失败，不影响考试
            }
        }

        // 超过5次警告提示严重警告
        if (newCount >= 5) {
            Toast.error(`警告：检测到多次异常行为(${newCount}次)，此行为已被记录！`);
        } else if (showWarning) {
            Toast.warning(`检测到${action}，此行为已被记录(${newCount}/${5})`);
        }
    }

    bindEvents() {
        // 导航
        this.delegate('click', '[data-nav]', (e, el) => {
            const view = el.dataset.nav;
            this.navigateTo(view);
        });

        // 题库操作
        this.delegate('click', '[data-action="create-bank"]', () => this.showBankModal());
        this.delegate('click', '[data-action="edit-bank"]', (e, el) => this.showBankModal(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="delete-bank"]', (e, el) => this.deleteBank(parseInt(el.dataset.id)));
        this.delegate('click', '.bank-item', (e, el) => {
            if (!e.target.closest('[data-action]')) {
                this.selectBank(parseInt(el.dataset.id));
            }
        });

        // 题目操作
        this.delegate('click', '[data-action="create-question"]', () => this.showQuestionModal());
        this.delegate('click', '[data-action="edit-question"]', (e, el) => this.showQuestionModal(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="delete-question"]', (e, el) => this.deleteQuestion(parseInt(el.dataset.id)));

        // 试卷操作
        this.delegate('click', '[data-action="create-paper"]', () => this.showPaperModal());
        this.delegate('click', '[data-action="smart-paper"]', () => this.showSmartPaperModal());
        this.delegate('click', '[data-action="edit-paper"]', (e, el) => this.showPaperModal(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="delete-paper"]', (e, el) => this.deletePaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="view-paper"]', (e, el) => this.viewPaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="add-questions"]', () => this.showAddQuestionsModal());
        this.delegate('click', '[data-action="publish-paper"]', (e, el) => this.publishPaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="view-ranking"]', (e, el) => this.loadRanking(parseInt(el.dataset.id)));

        // 题目搜索按钮
        this.delegate('click', '#btn-search-question', () => {
            const input = this.container.querySelector('#questionSearch');
            const value = input ? input.value.trim() : '';
            this.setState({ questionKeyword: value });
            this.loadQuestions(value);
        });

        // 试卷搜索按钮
        this.delegate('click', '#btn-search-paper', () => {
            const input = this.container.querySelector('#paperSearch');
            const value = input ? input.value.trim() : '';
            this.setState({ paperKeyword: value });
            this.loadPapers(value);
        });

        // 题目搜索按键 (Enter)
        this.delegate('keydown', '#questionSearch', (e) => {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                this.setState({ questionKeyword: value });
                this.loadQuestions(value);
            }
        });

        // 试卷搜索按键 (Enter)
        this.delegate('keydown', '#paperSearch', (e) => {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                this.setState({ paperKeyword: value });
                this.loadPapers(value);
            }
        });

        // 考试操作
        this.delegate('click', '[data-action="start-exam"]', (e, el) => this.startExam(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="submit-exam"]', () => this.submitExam());
        this.delegate('input', '.exam-answer input, .exam-answer textarea', (e, el) => this.saveAnswer(el));
        this.delegate('change', '.exam-answer input[type="radio"], .exam-answer input[type="checkbox"]', (e, el) => this.saveAnswer(el));

        // 查看结果
        this.delegate('click', '[data-action="view-result"]', (e, el) => this.viewResult(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="back"]', () => this.navigateTo(
            this.state.view === 'result_detail' ? 'home' :
                (this.state.view === 'grading_detail' ? 'grading' :
                    (this.state.view === 'ranking' ? 'papers' : 'home'))
        ));

        // 错题本操作
        this.delegate('click', '[data-action="delete-wrong"]', (e, el) => this.deleteWrongQuestion(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="clear-wrong"]', () => this.clearWrongQuestions());

        // 答题卡导航
        this.delegate('click', '.answer-sheet-item', (e, el) => {
            const qid = el.dataset.qid;
            const target = document.getElementById(`q-${qid}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // 阅卷
        this.delegate('click', '[data-action="grade-record"]', (e, el) => this.startGrading(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="submit-grade"]', () => this.submitGrade());

        // 题目预览展开
        this.delegate('click', '[data-action="toggle-preview"]', (e, el) => {
            this.toggleQuestionPreview(parseInt(el.dataset.id));
        });

        // 试卷预览
        this.delegate('click', '[data-action="preview-paper"]', (e, el) => this.previewPaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="exit-preview"]', () => this.navigateTo('papers'));

        // 批量导入
        this.delegate('click', '[data-action="import-questions"]', () => this.showImportModal());
    }

    async navigateTo(view) {
        if (this._examTimer) {
            clearInterval(this._examTimer);
            this._examTimer = null;
        }

        this.setState({ view, loading: true, showCheatWarning: false, previewPaper: null });

        switch (view) {
            case 'home':
                await this.loadHomeData();
                break;
            case 'questions':
                await this.loadBanks();
                await this.loadQuestions();
                break;
            case 'wrong_questions':
                await this.loadWrongQuestions();
                break;
            case 'papers':
                await this.loadPapers();
                break;
            case 'grading':
                await this.loadPendingRecords();
                break;
        }

        this.setState({ loading: false });
    }

    // ==================== 数据加载 ====================

    async loadHomeData() {
        this.setState({ loading: true });
        try {
            const [examsRes, recordsRes] = await Promise.all([
                Api.get('/exam/available'),
                Api.get('/exam/records?page_size=5')
            ]);

            this.setState({
                availableExams: examsRes.data?.items || [],
                myRecords: recordsRes.data?.items || [],
                loading: false
            });
        } catch (e) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    async loadBanks() {
        try {
            const res = await Api.get('/exam/banks');
            this.setState({ banks: res.data?.items || [] });
        } catch (e) {
            Toast.error('加载题库失败');
        }
    }

    async loadQuestions(keyword = '') {
        const { currentBankId, questionPage } = this.state;
        try {
            let url = `/exam/questions?page=${questionPage}&page_size=20`;
            if (currentBankId) url += `&bank_id=${currentBankId}`;
            if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;

            const res = await Api.get(url);
            this.setState({
                questions: res.data?.items || [],
                questionTotal: res.data?.total || 0
            });
        } catch (e) {
            Toast.error('加载题目失败');
        }
    }

    async loadPapers(keyword = '') {
        const { paperPage } = this.state;
        try {
            let url = `/exam/papers?page=${paperPage}&page_size=20`;
            if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
            const res = await Api.get(url);
            this.setState({
                papers: res.data?.items || [],
                paperTotal: res.data?.total || 0
            });
        } catch (e) {
            Toast.error('加载试卷失败');
        }
    }

    async loadPendingRecords() {
        try {
            const res = await Api.get('/exam/grading/pending');
            this.setState({ pendingRecords: res.data?.items || [] });
        } catch (e) {
            Toast.error('加载待阅卷列表失败');
        }
    }

    // ==================== 错题本操作 ====================

    async loadWrongQuestions() {
        try {
            const res = await Api.get('/exam/wrong-questions?page_size=50');
            this.setState({
                wrongQuestions: res.data?.items || [],
                wrongTotal: res.data?.total || 0
            });
        } catch (e) {
            Toast.error('加载错题本失败');
        }
    }

    async deleteWrongQuestion(wrongId) {
        if (!await Modal.confirm('移除错题', '确定要从错题本中移除此题吗？')) return;
        try {
            await Api.delete(`/exam/wrong-questions/${wrongId}`);
            Toast.success('已移除');
            await this.loadWrongQuestions();
        } catch (e) {
            Toast.error('移除失败');
        }
    }

    async clearWrongQuestions() {
        if (!await Modal.confirm('清空错题本', '确定要清空所有错题吗？此操作不可恢复。')) return;
        try {
            await Api.delete('/exam/wrong-questions');
            Toast.success('已清空');
            this.setState({ wrongQuestions: [], wrongTotal: 0 });
        } catch (e) {
            Toast.error('清空失败');
        }
    }

    // ==================== 排名查看 ====================

    async loadRanking(paperId) {
        try {
            const res = await Api.get(`/exam/papers/${paperId}/ranking`);
            this.setState({
                currentRanking: res.data,
                view: 'ranking'
            });
        } catch (e) {
            Toast.error('加载排名失败');
        }
    }

    // ==================== 智能组卷 ====================

    async showSmartPaperModal() {
        new Modal({
            title: '🎲 智能组卷',
            width: 600,
            content: `
                <form id="smartPaperForm">
                    <div class="form-group">
                        <label>试卷标题 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="title" required placeholder="请输入试卷标题">
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1">
                            <label>考试时长(分钟)</label>
                            <input type="number" class="form-control" name="duration" value="60">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>及格分</label>
                            <input type="number" class="form-control" name="pass_score" value="60">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>组卷规则</label>
                        <div id="rulesContainer" class="smart-paper-rules">
                            <div class="smart-rule-item">
                                <select name="rule_type">
                                    <option value="single">单选题</option>
                                    <option value="multiple">多选题</option>
                                    <option value="judge">判断题</option>
                                    <option value="fill">填空题</option>
                                    <option value="essay">问答题</option>
                                </select>
                                <input type="number" name="rule_count" value="10" placeholder="数量" min="1">
                                <input type="number" name="rule_score" value="2" placeholder="每题分值" min="0" step="0.5">
                                <button type="button" class="remove-rule" onclick="this.parentElement.remove()">×</button>
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('rulesContainer').insertAdjacentHTML('beforeend', '<div class=smart-rule-item><select name=rule_type><option value=single>单选题</option><option value=multiple>多选题</option><option value=judge>判断题</option><option value=fill>填空题</option><option value=essay>问答题</option></select><input type=number name=rule_count value=5 placeholder=数量 min=1><input type=number name=rule_score value=2 placeholder=每题分值 min=0 step=0.5><button type=button class=remove-rule onclick=this.parentElement.remove()>×</button></div>')">+ 添加规则</button>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="shuffle_questions" checked> 题目乱序
                        </label>
                    </div>
                </form>
            `,
            confirmText: '生成试卷',
            onConfirm: async () => {
                const form = document.getElementById('smartPaperForm');
                if (!form.reportValidity()) return false;

                // 收集规则
                const ruleItems = form.querySelectorAll('.smart-rule-item');
                const rules = [];
                ruleItems.forEach(item => {
                    rules.push({
                        question_type: item.querySelector('[name="rule_type"]').value,
                        count: parseInt(item.querySelector('[name="rule_count"]').value) || 5,
                        score_per_question: parseFloat(item.querySelector('[name="rule_score"]').value) || 2
                    });
                });

                if (rules.length === 0) {
                    Toast.warning('请至少添加一条规则');
                    return false;
                }

                const data = {
                    title: form.title.value.trim(),
                    duration: parseInt(form.duration.value) || 60,
                    pass_score: parseFloat(form.pass_score.value) || 60,
                    shuffle_questions: form.shuffle_questions.checked,
                    rules: rules
                };

                try {
                    await Api.post('/exam/papers/smart', data);
                    Toast.success('智能组卷成功');
                    await this.loadPapers();
                    return true;
                } catch (e) {
                    Toast.error('组卷失败: ' + (e.message || '题目数量不足'));
                    return false;
                }
            }
        }).show();
    }

    // ==================== 题库操作 ====================

    async showBankModal(bankId = null) {
        const bank = bankId ? this.state.banks.find(b => b.id === bankId) : null;

        new Modal({
            title: bank ? '编辑题库' : '创建题库',
            content: `
                <form id="bankForm">
                    <div class="form-group">
                        <label>题库名称 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" value="${bank ? Utils.escapeHtml(bank.name) : ''}" required>
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-control" name="description" rows="3">${bank ? Utils.escapeHtml(bank.description || '') : ''}</textarea>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('bankForm');
                if (!form.reportValidity()) return false;

                const data = {
                    name: form.name.value.trim(),
                    description: form.description.value.trim()
                };

                try {
                    if (bank) {
                        await Api.put(`/exam/banks/${bankId}`, data);
                    } else {
                        await Api.post('/exam/banks', data);
                    }
                    Toast.success('保存成功');
                    await this.loadBanks();
                    return true;
                } catch (e) {
                    Toast.error('保存失败');
                    return false;
                }
            }
        }).show();
    }

    async deleteBank(bankId) {
        const confirmed = await Modal.confirm('删除题库', '确定要删除这个题库吗？题库下的题目不会被删除。');
        if (!confirmed) return;

        try {
            await Api.delete(`/exam/banks/${bankId}`);
            Toast.success('已删除');
            await this.loadBanks();
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    selectBank(bankId) {
        this.setState({ currentBankId: bankId === this.state.currentBankId ? null : bankId, questionPage: 1 });
        this.loadQuestions();
    }

    async startGrading(recordId) {
        try {
            const res = await Api.get(`/exam/records/${recordId}?include_answers=true`);
            const record = res.data;

            // 获取题目详情
            const paperRes = await Api.get(`/exam/papers/${record.paper_id}/questions`);
            record.questions = paperRes.data;

            this.setState({
                view: 'grading_detail',
                gradingRecord: record
            });
        } catch (e) {
            Toast.error('加载试卷失败');
        }
    }

    // ==================== 渲染方法 ====================

    render() {
        const { view, loading } = this.state;

        return `
            <div class="exam-page fade-in">
                ${['take', 'grading_detail', 'result_detail'].includes(view) ? '' : this.renderNav()}
                <div class="exam-content">
                    ${loading ? '<div class="loading-full"><div class="loading-spinner"></div></div>' : this.renderView()}
                </div>
            </div>
        `;
    }

    renderNav() {
        const { view } = this.state;
        return `
            <div class="exam-nav">
                <button class="nav-btn ${view === 'home' ? 'active' : ''}" data-nav="home">
                    <i class="ri-home-4-line"></i> 考试中心
                </button>
                ${this._hasPermission('exam.read') ? `
                    <button class="nav-btn ${view === 'questions' ? 'active' : ''}" data-nav="questions">
                        <i class="ri-question-line"></i> 题库管理
                    </button>
                    <button class="nav-btn ${view === 'papers' ? 'active' : ''}" data-nav="papers">
                        <i class="ri-file-list-3-line"></i> 试卷管理
                    </button>
                ` : ''}
                <button class="nav-btn ${view === 'wrong_questions' ? 'active' : ''}" data-nav="wrong_questions">
                    <i class="ri-error-warning-line"></i> 错题本
                </button>
                ${this._hasPermission('exam.grade') ? `
                    <button class="nav-btn ${view === 'grading' ? 'active' : ''}" data-nav="grading">
                        <i class="ri-edit-box-line"></i> 阅卷
                    </button>
                ` : ''}
                <div class="nav-spacer"></div>
                ${window.ModuleHelp ? window.ModuleHelp.createHelpButton('exam', '在线考试', 'btn-ghost') : ''}
            </div>
        `;
    }

    renderView() {
        const { view } = this.state;
        switch (view) {
            case 'home': return this.renderHome();
            case 'questions': return this.renderQuestions();
            case 'papers': return this.renderPapers();
            case 'take': return this.renderTakeExam();
            case 'result': return this.renderResult();
            case 'result_detail': return this.renderResultDetail();
            case 'grading': return this.renderGrading();
            case 'grading_detail': return this.renderGradingDetail();
            case 'wrong_questions': return this.renderWrongQuestions();
            case 'ranking': return this.renderRanking();
            case 'preview': return this.renderPaperPreview();
            default: return this.renderHome();
        }
    }

    renderHome() {
        const { availableExams, myRecords } = this.state;

        // 计算一些简单的统计
        const totalTaken = myRecords.length;
        const passedExams = myRecords.filter(r => r.is_passed).length;
        const passRate = totalTaken > 0 ? Math.round((passedExams / totalTaken) * 100) : 0;
        const avgScore = totalTaken > 0 ? (myRecords.reduce((sum, r) => sum + (r.score || 0), 0) / totalTaken).toFixed(1) : 0;

        return `
            <div class="exam-home">
                <div class="home-hero">
                    <div class="hero-stats">
                        <div class="stat-card">
                            <div class="stat-value">${totalTaken}</div>
                            <div class="stat-label">累计参与考试</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${passRate}%</div>
                            <div class="stat-label">评估通过率</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${avgScore}</div>
                            <div class="stat-label">平均分数</div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h2 class="section-title"><i class="ri-play-circle-line"></i> 可参加的考试</h2>
                    ${availableExams.length === 0 ? '<p class="empty-text">暂无可参加的考试</p>' : `
                        <div class="exam-grid">
                            ${availableExams.map(exam => `
                                <div class="exam-card">
                                    <div class="exam-card-header">
                                        <h3>${Utils.escapeHtml(exam.title)}</h3>
                                        <span class="tag tag-primary">${Utils.escapeHtml(String(exam.total_score))} 分</span>
                                    </div>
                                    <div class="exam-card-body">
                                        <p><i class="ri-time-line"></i> 时长: ${Utils.escapeHtml(String(exam.duration))} 分钟</p>
                                        <p><i class="ri-file-list-line"></i> ${Utils.escapeHtml(String(exam.question_count))} 道题</p>
                                    </div>
                                    <div class="exam-card-footer">
                                        <button class="btn btn-primary btn-block" data-action="start-exam" data-id="${Utils.escapeHtml(String(exam.id))}">
                                            立即参加
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
                
                <div class="section">
                    <h2 class="section-title"><i class="ri-history-line"></i> 我的考试记录</h2>
                    ${myRecords.length === 0 ? '<p class="empty-text">暂无考试记录</p>' : `
                        <div class="record-list">
                            ${myRecords.map(record => `
                                <div class="record-item">
                                    <div class="record-info">
                                        <span class="record-title">${Utils.escapeHtml(record.paper_title || '未知试卷')}</span>
                                        <span class="record-status status-${record.status}">${this.getStatusText(record.status)}</span>
                                    </div>
                                    <div class="record-score">
                                        ${record.score !== null ? `<span class="${record.is_passed ? 'pass' : 'fail'}">${Utils.escapeHtml(String(record.score))}/${Utils.escapeHtml(String(record.total_score))}</span>` : '-'}
                                    </div>
                                    <div class="record-actions">
                                        ${['graded', 'submitted'].includes(record.status) ? `<button class="btn btn-sm btn-ghost" data-action="view-result" data-id="${Utils.escapeHtml(String(record.id))}">查看详情</button>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    getStatusText(status) {
        const map = { pending: '未开始', in_progress: '进行中', submitted: '待阅卷', graded: '已完成' };
        return map[status] || status;
    }

    renderQuestions() {
        const { banks, currentBankId, questions, expandedQuestionId } = this.state;

        return `
            <div class="questions-view">
                <div class="questions-sidebar">
                    <div class="sidebar-header">
                        <h3>题库分类</h3>
                        ${this._hasPermission('exam.create') ? `
                            <button class="btn btn-sm btn-primary" data-action="create-bank"><i class="ri-add-line"></i></button>
                        ` : ''}
                    </div>
                    <div class="bank-list">
                        <div class="bank-item ${!currentBankId ? 'active' : ''}" data-id="">全部题目</div>
                        ${banks.map(bank => `
                            <div class="bank-item ${currentBankId === bank.id ? 'active' : ''}" data-id="${Utils.escapeHtml(String(bank.id))}">
                                <span>${Utils.escapeHtml(bank.name)}</span>
                                <span class="bank-count">${Utils.escapeHtml(String(bank.question_count))}</span>
                                <div class="bank-actions">
                                    <button data-action="edit-bank" data-id="${Utils.escapeHtml(String(bank.id))}"><i class="ri-edit-line"></i></button>
                                    <button data-action="delete-bank" data-id="${Utils.escapeHtml(String(bank.id))}"><i class="ri-delete-bin-line"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="questions-main">
                    <div class="toolbar">
                        ${this._hasPermission('exam.create') ? `
                            <button class="btn btn-primary" data-action="create-question"><i class="ri-add-line"></i> 新增题目</button>
                            <button class="btn btn-ghost" data-action="import-questions"><i class="ri-upload-2-line"></i> 批量导入</button>
                        ` : ''}
                        <div class="search-group">
                            <input type="text" class="form-input" placeholder="搜索题目内容..." id="questionSearch" value="${Utils.escapeHtml(this.state.questionKeyword || '')}">
                            <button class="btn btn-primary" id="btn-search-question">搜索</button>
                        </div>
                    </div>
                    <div class="question-list">
                        ${questions.length === 0 ? '<p class="empty-text">暂无题目</p>' : questions.map((q, i) => `
                            <div class="question-item ${expandedQuestionId === q.id ? 'expanded' : ''}">
                                <div class="question-header">
                                    <span class="question-type type-${Utils.escapeHtml(String(q.question_type))}">${this.getTypeText(q.question_type)}</span>
                                    <span class="question-score">${Utils.escapeHtml(String(q.score))} 分</span>
                                    <button class="question-expand-btn" data-action="toggle-preview" data-id="${Utils.escapeHtml(String(q.id))}">
                                        <i class="ri-${expandedQuestionId === q.id ? 'arrow-up-s-line' : 'arrow-down-s-line'}"></i>
                                        ${expandedQuestionId === q.id ? '收起' : '预览'}
                                    </button>
                                </div>
                                <div class="question-title">${Utils.escapeHtml(q.title)}</div>
                                ${expandedQuestionId === q.id ? this.renderQuestionPreview(q) : ''}
                                <div class="question-actions">
                                    ${this._hasPermission('exam.update') ? `<button data-action="edit-question" data-id="${Utils.escapeHtml(String(q.id))}"><i class="ri-edit-line"></i></button>` : ''}
                                    ${this._hasPermission('exam.delete') ? `<button data-action="delete-question" data-id="${Utils.escapeHtml(String(q.id))}"><i class="ri-delete-bin-line"></i></button>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染题目预览内容
     */
    renderQuestionPreview(question) {
        const { options, answer, analysis } = question;

        return `
            <div class="question-preview">
                ${options && options.length > 0 ? `
                    <div class="preview-section">
                        <div class="preview-label">选项</div>
                        <div class="options-list">
                            ${options.map(opt => `
                                <div class="option-item">
                                    <strong>${Utils.escapeHtml(String(opt.key))}.</strong> ${Utils.escapeHtml(opt.value)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="preview-section">
                    <div class="preview-label">正确答案</div>
                    <div class="preview-content correct-answer">${Utils.escapeHtml(answer || '未设置')}</div>
                </div>
                ${analysis ? `
                    <div class="preview-section">
                        <div class="preview-label">解析</div>
                        <div class="preview-content">${Utils.escapeHtml(analysis)}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    getTypeText(type) {
        const map = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', essay: '问答' };
        return map[type] || type;
    }

    renderPapers() {
        const { papers, currentPaper } = this.state;

        if (currentPaper) {
            return this.renderPaperDetail();
        }

        return `
            <div class="papers-view">
                <div class="toolbar">
                    ${this._hasPermission('exam.create') ? `
                        <button class="btn btn-primary" data-action="create-paper"><i class="ri-add-line"></i> 创建试卷</button>
                        <button class="btn btn-ghost" data-action="smart-paper"><i class="ri-magic-line"></i> 智能组卷</button>
                    ` : ''}
                    <div class="search-group">
                        <input type="text" class="form-input" placeholder="搜索试卷标题..." id="paperSearch" value="${Utils.escapeHtml(this.state.paperKeyword || '')}">
                        <button class="btn btn-primary" id="btn-search-paper">搜索</button>
                    </div>
                </div>
                <div class="paper-list">
                    ${papers.length === 0 ? '<p class="empty-text">暂无试卷</p>' : papers.map(paper => `
                        <div class="paper-card">
                            <div class="paper-header">
                                <h3>${Utils.escapeHtml(paper.title)}</h3>
                                <span class="tag tag-${Utils.escapeHtml(String(paper.status))}">${paper.status === 'published' ? '已发布' : '草稿'}</span>
                            </div>
                            <div class="paper-info">
                                <span><i class="ri-file-list-line"></i> ${Utils.escapeHtml(String(paper.question_count))} 题</span>
                                <span><i class="ri-time-line"></i> ${Utils.escapeHtml(String(paper.duration))} 分钟</span>
                                <span><i class="ri-medal-line"></i> ${Utils.escapeHtml(String(paper.total_score))} 分</span>
                                ${paper.take_count > 0 ? `<span><i class="ri-user-line"></i> ${Utils.escapeHtml(String(paper.take_count))} 人参考</span>` : ''}
                            </div>
                            <div class="paper-actions">
                                <button class="btn btn-sm btn-ghost" data-action="preview-paper" data-id="${Utils.escapeHtml(String(paper.id))}"><i class="ri-eye-line"></i> 预览</button>
                                ${this._hasPermission('exam.update') ? `<button class="btn btn-sm btn-ghost" data-action="view-paper" data-id="${Utils.escapeHtml(String(paper.id))}">编辑</button>` : ''}
                                ${paper.status === 'published' ? `<button class="btn btn-sm btn-ghost" data-action="view-ranking" data-id="${Utils.escapeHtml(String(paper.id))}"><i class="ri-bar-chart-line"></i> 排名</button>` : ''}
                                ${paper.status === 'draft' && this._hasPermission('exam.update') ? `<button class="btn btn-sm btn-primary" data-action="publish-paper" data-id="${Utils.escapeHtml(String(paper.id))}">发布</button>` : ''}
                                ${this._hasPermission('exam.delete') ? `<button class="btn btn-sm btn-ghost danger" data-action="delete-paper" data-id="${Utils.escapeHtml(String(paper.id))}">删除</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderPaperDetail() {
        const { currentPaper } = this.state;
        if (!currentPaper) return '';

        return `
            <div class="paper-detail">
                <div class="detail-header">
                    <button class="btn btn-ghost" data-action="back"><i class="ri-arrow-left-line"></i> 返回</button>
                    <h2>${Utils.escapeHtml(currentPaper.title)}</h2>
                    <button class="btn btn-primary" data-action="add-questions"><i class="ri-add-line"></i> 添加题目</button>
                </div>
                <div class="detail-questions">
                    ${(currentPaper.questions || []).map((q, i) => `
                        <div class="detail-question">
                            <span class="q-num">${i + 1}</span>
                            <span class="q-type type-${Utils.escapeHtml(String(q.question_type))}">${this.getTypeText(q.question_type)}</span>
                            <span class="q-title">${Utils.escapeHtml(q.title.substring(0, 50))}...</span>
                            <span class="q-score">${Utils.escapeHtml(String(q.paper_score || q.score))} 分</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 渲染试卷预览（模拟考试界面）
     */
    renderPaperPreview() {
        const { previewPaper } = this.state;
        if (!previewPaper) return '<p class="empty-text">加载中...</p>';

        const questions = previewPaper.questions || [];

        return `
            <div class="take-exam paper-preview-mode">
                <div class="exam-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="exit-preview">
                            <i class="ri-arrow-left-line"></i> 退出预览
                        </button>
                        <h2>${Utils.escapeHtml(previewPaper.title)}</h2>
                    </div>
                    <div class="paper-stats-bar">
                        <div class="stat-item">
                            <i class="ri-file-list-line"></i>
                            <span class="stat-value">${Utils.escapeHtml(String(questions.length))}</span>
                            <span class="stat-label">道题</span>
                        </div>
                        <div class="stat-item">
                            <i class="ri-medal-line"></i>
                            <span class="stat-value">${Utils.escapeHtml(String(previewPaper.total_score))}</span>
                            <span class="stat-label">总分</span>
                        </div>
                        <div class="stat-item">
                            <i class="ri-time-line"></i>
                            <span class="stat-value">${Utils.escapeHtml(String(previewPaper.duration))}</span>
                            <span class="stat-label">分钟</span>
                        </div>
                        <div class="stat-item">
                            <i class="ri-trophy-line"></i>
                            <span class="stat-value">${Utils.escapeHtml(String(previewPaper.pass_score))}</span>
                            <span class="stat-label">及格分</span>
                        </div>
                    </div>
                </div>
                <div class="exam-questions">
                    ${questions.length === 0 ? '<p class="empty-text">该试卷暂无题目</p>' : questions.map((q, i) => `
                        <div class="exam-question" id="preview-q-${q.id}">
                            <div class="eq-header">
                                <span class="eq-num">${i + 1}</span>
                                <span class="eq-type">${this.getTypeText(q.question_type)}</span>
                                <span class="eq-score">${Utils.escapeHtml(String(q.paper_score || q.score))} 分</span>
                            </div>
                            <div class="eq-title">${Utils.escapeHtml(q.title)}</div>
                            <div class="exam-answer preview-only">
                                ${this.renderPreviewAnswerInput(q)}
                            </div>
                            <div class="analysis-box">
                                <div class="analysis-label"><i class="ri-key-2-line"></i> 参考答案</div>
                                <div class="analysis-content">${Utils.escapeHtml(q.answer || '未设置')}</div>
                            </div>
                            ${q.analysis ? `
                                <div class="analysis-box">
                                    <div class="analysis-label"><i class="ri-lightbulb-line"></i> 解析</div>
                                    <div class="analysis-content">${Utils.escapeHtml(q.analysis)}</div>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 渲染预览模式的答题输入（只读）
     */
    renderPreviewAnswerInput(question) {
        const { question_type, options } = question;

        if (question_type === 'single' || question_type === 'multiple') {
            return (options || []).map(opt => `
                <label class="${question_type === 'single' ? 'radio' : 'checkbox'}-option" style="pointer-events: none; opacity: 0.7;">
                    <input type="${question_type === 'single' ? 'radio' : 'checkbox'}" disabled>
                    <span>${Utils.escapeHtml(String(opt.key))}. ${Utils.escapeHtml(opt.value)}</span>
                </label>
            `).join('');
        }

        if (question_type === 'judge') {
            return `
                <label class="radio-option" style="pointer-events: none; opacity: 0.7;"><input type="radio" disabled><span>正确</span></label>
                <label class="radio-option" style="pointer-events: none; opacity: 0.7;"><input type="radio" disabled><span>错误</span></label>
            `;
        }

        return `<textarea class="form-control" rows="3" disabled placeholder="(填空/问答题作答区域)"></textarea>`;
    }

    renderTakeExam() {
        const { currentExam, examAnswers, remainingTime, saveStatus, isOnline, showCheatWarning, switchCount } = this.state;
        if (!currentExam) return '<p>加载中...</p>';

        const mins = Math.floor(remainingTime / 60);
        const secs = remainingTime % 60;

        let statusHtml = '';
        if (saveStatus === 'saving') statusHtml = '<span class="status-saving"><i class="ri-loader-4-line spin"></i> 保存中...</span>';
        else if (saveStatus === 'saved') statusHtml = '<span class="status-saved"><i class="ri-check-line"></i> 已保存</span>';
        else if (saveStatus === 'error') statusHtml = '<span class="status-error"><i class="ri-error-warning-line"></i> 保存失败</span>';

        // 作弊警告横幅
        const cheatWarningHtml = showCheatWarning ? `
            <div class="anti-cheat-warning">
                <i class="ri-alarm-warning-line"></i>
                警告：检测到异常行为！请保持在考试页面，此行为已被记录（${switchCount}/5）
            </div>
        ` : '';

        return `
            ${cheatWarningHtml}
            <div class="take-exam">
                <div class="exam-header">
                    <div class="header-left">
                        <h2>${Utils.escapeHtml(currentExam.title)}</h2>
                        ${statusHtml}
                    </div>
                    <div class="exam-timer ${remainingTime < 300 ? 'warning' : ''}">
                        <i class="ri-time-line"></i> ${mins}:${secs.toString().padStart(2, '0')}
                    </div>
                </div>
                <div class="exam-questions">
                    ${currentExam.questions.map((q, i) => `
                        <div class="exam-question" id="q-${Utils.escapeHtml(String(q.id))}">
                            <div class="eq-header">
                                <span class="eq-num">${i + 1}</span>
                                <span class="eq-type">${this.getTypeText(q.question_type)}</span>
                                <span class="eq-score">${Utils.escapeHtml(String(q.score))} 分</span>
                            </div>
                            <div class="eq-title">${Utils.escapeHtml(q.title)}</div>
                            <div class="exam-answer" data-qid="${Utils.escapeHtml(String(q.id))}" data-type="${q.question_type}">
                                ${this.renderAnswerInput(q, examAnswers[q.id])}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="exam-footer">
                    <button class="btn btn-primary btn-lg" data-action="submit-exam">提交试卷</button>
                </div>
            </div>
            ${this.renderAnswerSheet()}
            <div class="keyboard-shortcuts-hint">
                <kbd>↑</kbd><kbd>↓</kbd> 切换题目 | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 提交
            </div>
            <div class="offline-indicator ${isOnline ? 'online' : 'offline'}">
                <i class="ri-${isOnline ? 'wifi-line' : 'wifi-off-line'}"></i> 
                ${isOnline ? '在线' : '离线（答案已缓存）'}
            </div>
        `;
    }

    renderAnswerInput(question, savedAnswer) {
        const { question_type, options } = question;
        savedAnswer = savedAnswer || '';

        if (question_type === 'single') {
            return (options || []).map(opt => `
                <label class="radio-option">
                    <input type="radio" name="q_${Utils.escapeHtml(String(question.id))}" value="${Utils.escapeHtml(String(opt.key))}" ${savedAnswer === opt.key ? 'checked' : ''}>
                    <span>${Utils.escapeHtml(String(opt.key))}. ${Utils.escapeHtml(opt.value)}</span>
                </label>
            `).join('');
        }

        if (question_type === 'multiple') {
            const selected = savedAnswer.split(',');
            return (options || []).map(opt => `
                <label class="checkbox-option">
                    <input type="checkbox" name="q_${Utils.escapeHtml(String(question.id))}" value="${Utils.escapeHtml(String(opt.key))}" ${selected.includes(opt.key) ? 'checked' : ''}>
                    <span>${Utils.escapeHtml(String(opt.key))}. ${Utils.escapeHtml(opt.value)}</span>
                </label>
            `).join('');
        }

        if (question_type === 'judge') {
            return `
                <label class="radio-option"><input type="radio" name="q_${Utils.escapeHtml(String(question.id))}" value="true" ${savedAnswer === 'true' ? 'checked' : ''}><span>正确</span></label>
                <label class="radio-option"><input type="radio" name="q_${Utils.escapeHtml(String(question.id))}" value="false" ${savedAnswer === 'false' ? 'checked' : ''}><span>错误</span></label>
            `;
        }

        return `<textarea class="form-control" name="q_${Utils.escapeHtml(String(question.id))}" rows="4" placeholder="请输入答案">${Utils.escapeHtml(savedAnswer)}</textarea>`;
    }

    renderResultDetail() {
        const { gradingRecord } = this.state;
        if (!gradingRecord) return '';

        const { questions, answers, score, total_score, is_passed } = gradingRecord;
        const answerMap = {};
        (answers || []).forEach(a => answerMap[a.question_id] = a);

        return `
            <div class="take-exam result-mode">
                <div class="exam-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back"><i class="ri-arrow-left-line"></i> 返回</button>
                        <h2>${Utils.escapeHtml(gradingRecord.paper_title)} - 考试结果</h2>
                    </div>
                    <div class="result-score ${is_passed ? 'pass' : 'fail'}">
                        <span>${Utils.escapeHtml(String(score))}</span> <span class="total">/ ${Utils.escapeHtml(String(total_score))} 分</span>
                    </div>
                </div>
                <div class="exam-questions">
                    ${questions.map((q, i) => {
            const ans = answerMap[q.id] || {};
            const isCorrect = ans.is_correct;
            const statusClass = isCorrect === true ? 'correct' : (isCorrect === false ? 'wrong' : 'manual');

            return `
                        <div class="exam-question ${statusClass}">
                            <div class="eq-header">
                                <span class="eq-num">${i + 1}</span>
                                <span class="eq-type">${this.getTypeText(q.question_type)}</span>
                                <span class="eq-status">
                                    ${isCorrect === true ? '<i class="ri-check-line"></i> 正确' :
                    (isCorrect === false ? '<i class="ri-close-line"></i> 错误' : '<i class="ri-edit-circle-line"></i> 待阅/主观')}
                                </span>
                                <span class="eq-score">${Utils.escapeHtml(String(ans.score || 0))} / ${Utils.escapeHtml(String(q.score))} 分</span>
                            </div>
                            <div class="eq-title">${Utils.escapeHtml(q.title)}</div>
                            
                             <div class="result-answer-box">
                                <div class="user-answer-section">
                                    <label>你的答案：</label>
                                    <div class="answer-content">${Utils.escapeHtml(ans.user_answer || '未作答')}</div>
                                </div>
                                <div class="correct-answer-section">
                                    <label>正确答案：</label>
                                    <div class="answer-content">${Utils.escapeHtml(q.answer || '未设置')}</div>
                                </div>
                                ${ans.comment ? `
                                <div class="comment-section">
                                    <label>评语：</label>
                                    <div class="comment-content">${Utils.escapeHtml(ans.comment)}</div>
                                </div>
                                ` : ''}
                            </div>

                            <div class="analysis-box">
                                <div class="analysis-label"><i class="ri-lightbulb-line"></i> 解析</div>
                                <div class="analysis-content">${Utils.escapeHtml(q.analysis || '暂无解析')}</div>
                            </div>
                        </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    renderGrading() {
        const { pendingRecords } = this.state;

        return `
            <div class="grading-view">
                <h2>待阅卷试卷</h2>
                ${pendingRecords.length === 0 ? '<p class="empty-text">暂无待阅卷试卷</p>' : `
                    <div class="record-list">
                        ${pendingRecords.map(r => `
                            <div class="record-item">
                                <div class="record-info">
                                    <span class="record-title">${Utils.escapeHtml(r.paper_title || '未知')}</span>
                                    <span class="record-meta">考生ID: ${r.user_id}</span>
                                    <span class="record-meta">提交时间: ${r.submit_time ? Utils.formatDate(r.submit_time) : '-'}</span>
                                </div>
                                <button class="btn btn-sm btn-primary" data-action="grade-record" data-id="${Utils.escapeHtml(String(r.id))}">开始阅卷</button>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    renderGradingDetail() {
        const { gradingRecord } = this.state;
        if (!gradingRecord) return '';

        const { questions, answers, score, total_score } = gradingRecord;
        const answerMap = {};
        (answers || []).forEach(a => answerMap[a.question_id] = a);

        return `
            <div class="take-exam grading-mode">
                <div class="exam-header">
                    <div class="header-left">
                        <button class="btn btn-ghost" data-action="back"><i class="ri-arrow-left-line"></i> 返回列表</button>
                        <h2>阅卷: ${Utils.escapeHtml(gradingRecord.paper_title)}</h2>
                    </div>
                </div>
                <form id="gradingForm">
                    <div class="exam-questions">
                        ${questions.map((q, i) => {
            const ans = answerMap[q.id] || {};
            const isAutoGraded = ['single', 'multiple', 'judge'].includes(q.question_type);

            return `
                            <div class="exam-question ${isAutoGraded ? (ans.is_correct ? 'correct' : 'wrong') : 'manual-grade'}">
                                <div class="eq-header">
                                    <span class="eq-num">${i + 1}</span>
                                    <span class="eq-type">${this.getTypeText(q.question_type)}</span>
                                    <span class="eq-score">满分: ${Utils.escapeHtml(String(q.score))}</span>
                                </div>
                                <div class="eq-title">${Utils.escapeHtml(q.title)}</div>
                                
                                <div class="grading-answer-box">
                                    <div class="answer-row">
                                        <div class="col">
                                            <label>考生答案</label>
                                            <div class="answer-content ${!ans.user_answer ? 'empty' : ''}">${Utils.escapeHtml(ans.user_answer || '未作答')}</div>
                                        </div>
                                        <div class="col">
                                            <label>参考答案</label>
                                            <div class="answer-content ref">${Utils.escapeHtml(q.answer)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div class="grading-inputs">
                                    <div class="form-group row">
                                        <label>得分:</label>
                                        <input type="number" class="form-control score-input" 
                                            name="score_${Utils.escapeHtml(String(q.id))}" 
                                            value="${ans.score !== undefined ? Utils.escapeHtml(String(ans.score)) : 0}" 
                                            max="${Utils.escapeHtml(String(q.score))}" min="0" step="0.5"
                                            ${isAutoGraded ? '' : 'required'}>
                                    </div>
                                    <div class="form-group row">
                                        <label>评语:</label>
                                        <input type="text" class="form-control" name="comment_${Utils.escapeHtml(String(q.id))}" value="${Utils.escapeHtml(ans.comment || '')}" placeholder="可选评语">
                                    </div>
                                </div>
                            </div>
                            `;
        }).join('')}
                    </div>
                    <div class="exam-footer">
                        <button type="button" class="btn btn-primary btn-lg" data-action="submit-grade">完成阅卷</button>
                    </div>
                </form>
            </div>
        `;
    }

    async submitGrade() {
        const form = document.querySelector('#gradingForm');
        if (!form.reportValidity()) return;

        const { gradingRecord } = this.state;
        const grades = [];

        gradingRecord.questions.forEach(q => {
            const scoreInput = form.querySelector(`[name="score_${q.id}"]`);
            const commentInput = form.querySelector(`[name="comment_${q.id}"]`);

            if (scoreInput) {
                grades.push({
                    question_id: q.id,
                    score: parseFloat(scoreInput.value) || 0,
                    comment: commentInput ? commentInput.value.trim() : null
                });
            }
        });

        try {
            await Api.post(`/exam/grading/${gradingRecord.id}`, { grades });
            Toast.success('阅卷完成');
            this.navigateTo('grading');
        } catch (e) {
            Toast.error('提交失败');
        }
    }

    // ==================== 题目操作 ====================

    async showQuestionModal(questionId = null) {
        const question = questionId ? this.state.questions.find(q => q.id === questionId) : null;
        const { banks } = this.state;

        new Modal({
            title: question ? '编辑题目' : '新增题目',
            width: 600,
            content: `
                <form id="questionForm">
                    <div class="form-row">
                        <div class="form-group" style="flex:1">
                            <label>题目类型</label>
                            <select class="form-control" name="question_type" id="qType">
                                <option value="single" ${question?.question_type === 'single' ? 'selected' : ''}>单选题</option>
                                <option value="multiple" ${question?.question_type === 'multiple' ? 'selected' : ''}>多选题</option>
                                <option value="judge" ${question?.question_type === 'judge' ? 'selected' : ''}>判断题</option>
                                <option value="fill" ${question?.question_type === 'fill' ? 'selected' : ''}>填空题</option>
                                <option value="essay" ${question?.question_type === 'essay' ? 'selected' : ''}>问答题</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>所属题库</label>
                            <select class="form-control" name="bank_id">
                                <option value="">不分类</option>
                                ${banks.map(b => `<option value="${b.id}" ${question?.bank_id === b.id ? 'selected' : ''}>${Utils.escapeHtml(b.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>题干 <span class="required">*</span></label>
                        <textarea class="form-control" name="title" rows="3" required>${question ? Utils.escapeHtml(question.title) : ''}</textarea>
                    </div>
                    <div class="form-group" id="optionsGroup">
                        <label>选项</label>
                        <div id="optionsList"></div>
                        <button type="button" class="btn btn-sm btn-ghost" onclick="this.parentElement.querySelector('#optionsList').innerHTML += '<div class=option-row><input type=text class=form-control placeholder=选项内容><button type=button onclick=this.parentElement.remove()>×</button></div>'">+ 添加选项</button>
                    </div>
                    <div class="form-group">
                        <label>正确答案 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="answer" value="${question ? Utils.escapeHtml(question.answer) : ''}" required placeholder="单选填A，多选填A,B,C">
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1">
                            <label>分值</label>
                            <input type="number" class="form-control" name="score" value="${question?.score || 1}" min="0" step="0.5">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>难度</label>
                            <select class="form-control" name="difficulty">
                                ${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${question?.difficulty === d ? 'selected' : ''}>${'★'.repeat(d)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>解析</label>
                        <textarea class="form-control" name="analysis" rows="2">${question?.analysis ? Utils.escapeHtml(question.analysis) : ''}</textarea>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('questionForm');
                if (!form.reportValidity()) return false;

                const options = [];
                const optionInputs = form.querySelectorAll('#optionsList input');
                optionInputs.forEach((inp, i) => {
                    if (inp.value.trim()) {
                        options.push({ key: String.fromCharCode(65 + i), value: inp.value.trim() });
                    }
                });

                const data = {
                    question_type: form.question_type.value,
                    bank_id: form.bank_id.value ? parseInt(form.bank_id.value) : null,
                    title: form.title.value.trim(),
                    options: options.length > 0 ? options : null,
                    answer: form.answer.value.trim(),
                    score: parseFloat(form.score.value) || 1,
                    difficulty: parseInt(form.difficulty.value) || 1,
                    analysis: form.analysis.value.trim() || null
                };

                try {
                    if (question) {
                        await Api.put(`/exam/questions/${questionId}`, data);
                    } else {
                        await Api.post('/exam/questions', data);
                    }
                    Toast.success('保存成功');
                    await this.loadQuestions();
                    return true;
                } catch (e) {
                    Toast.error('保存失败');
                    return false;
                }
            }
        }).show();
    }

    async deleteQuestion(questionId) {
        if (!await Modal.confirm('删除题目', '确定删除此题目？')) return;
        try {
            await Api.delete(`/exam/questions/${questionId}`);
            Toast.success('已删除');
            await this.loadQuestions();
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    // ==================== 试卷操作 ====================

    async showPaperModal(paperId = null) {
        const paper = paperId ? this.state.papers.find(p => p.id === paperId) : null;

        new Modal({
            title: paper ? '编辑试卷' : '创建试卷',
            content: `
                <form id="paperForm">
                    <div class="form-group">
                        <label>试卷标题 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="title" value="${paper ? Utils.escapeHtml(paper.title) : ''}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1">
                            <label>总分</label>
                            <input type="number" class="form-control" name="total_score" value="${paper?.total_score || 100}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>及格分</label>
                            <input type="number" class="form-control" name="pass_score" value="${paper?.pass_score || 60}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>时长(分钟)</label>
                            <input type="number" class="form-control" name="duration" value="${paper?.duration || 60}">
                        </div>
                    </div>
                </form>
            `,
            confirmText: '保存',
            onConfirm: async () => {
                const form = document.getElementById('paperForm');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    total_score: parseFloat(form.total_score.value) || 100,
                    pass_score: parseFloat(form.pass_score.value) || 60,
                    duration: parseInt(form.duration.value) || 60
                };

                try {
                    if (paper) {
                        await Api.put(`/exam/papers/${paperId}`, data);
                    } else {
                        await Api.post('/exam/papers', data);
                    }
                    Toast.success('保存成功');
                    await this.loadPapers();
                    return true;
                } catch (e) {
                    Toast.error('保存失败');
                    return false;
                }
            }
        }).show();
    }

    async deletePaper(paperId) {
        if (!await Modal.confirm('删除试卷', '确定删除此试卷？')) return;
        try {
            await Api.delete(`/exam/papers/${paperId}`);
            Toast.success('已删除');
            await this.loadPapers();
        } catch (e) {
            Toast.error('删除失败');
        }
    }

    async viewPaper(paperId) {
        try {
            const res = await Api.get(`/exam/papers/${paperId}`);
            this.setState({ currentPaper: res.data });
        } catch (e) {
            Toast.error('加载失败');
        }
    }

    async publishPaper(paperId) {
        if (!await Modal.confirm('发布试卷', '发布后考生可以参加考试，确定发布？')) return;
        try {
            await Api.put(`/exam/papers/${paperId}`, { status: 'published' });
            Toast.success('发布成功');
            await this.loadPapers();
        } catch (e) {
            Toast.error('发布失败');
        }
    }

    async showAddQuestionsModal() {
        const { currentPaper, questions } = this.state;
        if (!currentPaper) return;

        // 简化：加载所有题目供选择
        try {
            const res = await Api.get('/exam/questions?page_size=100');
            const allQuestions = res.data?.items || [];
            const existingIds = (currentPaper.questions || []).map(q => q.id);
            const available = allQuestions.filter(q => !existingIds.includes(q.id));

            new Modal({
                title: '添加题目',
                width: 600,
                content: `
                    <div class="question-select-list">
                        ${available.map(q => `
                            <label class="question-select-item">
                                <input type="checkbox" value="${q.id}">
                                <span class="q-type type-${q.question_type}">${this.getTypeText(q.question_type)}</span>
                                <span>${Utils.escapeHtml(q.title.substring(0, 40))}...</span>
                            </label>
                        `).join('')}
                    </div>
                `,
                confirmText: '添加',
                onConfirm: async () => {
                    const checkboxes = document.querySelectorAll('.question-select-list input:checked');
                    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
                    if (ids.length === 0) {
                        Toast.warning('请选择题目');
                        return false;
                    }
                    try {
                        await Api.post(`/exam/papers/${currentPaper.id}/questions`, { question_ids: ids });
                        Toast.success('添加成功');
                        await this.viewPaper(currentPaper.id);
                        return true;
                    } catch (e) {
                        Toast.error('添加失败');
                        return false;
                    }
                }
            }).show();
        } catch (e) {
            Toast.error('加载题目失败');
        }
    }

    // ==================== 考试操作 ====================

    async startExam(paperId) {
        try {
            const res = await Api.post('/exam/start', { paper_id: paperId });
            const recordId = res.data?.record_id;
            if (!recordId) throw new Error('开始考试失败');

            // 加载试卷
            const examRes = await Api.get(`/exam/take/${recordId}`);
            const examData = examRes.data;

            this.setState({
                view: 'take',
                currentExam: examData,
                examAnswers: examData.saved_answers || {},
                remainingTime: examData.remaining_seconds || 0,
                saveStatus: 'saved',
                switchCount: 0,
                showCheatWarning: false,
                currentQuestionIndex: 0,
                reminded5min: false,
                reminded1min: false
            });

            // 启用防作弊检测
            this._enableAntiCheat();

            // 启动计时器（使用新的统一方法，支持倒计时提醒）
            this._startExamTimer();

        } catch (e) {
            Toast.error(e.message || '开始考试失败');
        }
    }

    saveAnswer(el) {
        const container = el.closest('.exam-answer');
        const qid = parseInt(container.dataset.qid);
        const type = container.dataset.type;

        let answer = '';
        if (type === 'single' || type === 'judge') {
            const checked = container.querySelector('input:checked');
            answer = checked ? checked.value : '';
        } else if (type === 'multiple') {
            const checked = container.querySelectorAll('input:checked');
            answer = Array.from(checked).map(c => c.value).join(',');
        } else {
            answer = el.value;
        }

        const { examAnswers } = this.state;
        examAnswers[qid] = answer;
        this.setState({ examAnswers, saveStatus: 'saving' }); // 立即更新UI状态

        // 防抖处理：延迟保存答案
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            this._doSaveAnswer(qid, answer);
        }, 1000);
    }

    async _doSaveAnswer(qid, answer) {
        const { currentExam } = this.state;
        if (!currentExam) return;

        try {
            await Api.post(`/exam/take/${currentExam.record_id}/save`, { question_id: qid, answer });
            this.setState({ saveStatus: 'saved' });
        } catch (e) {
            this.setState({ saveStatus: 'error' });
            // 静默失败，用户可通过状态指示器查看
        }
    }

    async submitExam() {
        if (this._examTimer) {
            clearInterval(this._examTimer);
            this._examTimer = null;
        }

        // 如果是时间到了，不询问直接提交
        const { remainingTime } = this.state;
        if (remainingTime > 0) {
            const confirmed = await Modal.confirm('提交试卷', '确定要提交试卷吗？提交后不能修改。');
            if (!confirmed) {
                // 恢复计时器
                this._examTimer = setInterval(() => {
                    const { remainingTime } = this.state;
                    if (remainingTime <= 0) this.submitExam();
                    else this.setState({ remainingTime: remainingTime - 1 });
                }, 1000);
                return;
            }
        }

        const { currentExam, examAnswers } = this.state;
        const answers = Object.entries(examAnswers).map(([qid, answer]) => ({
            question_id: parseInt(qid),
            answer: answer
        }));

        this.setState({ loading: true });
        try {
            // 使用增强版提交 API，自动记录错题
            const res = await Api.post(`/exam/take/${currentExam.record_id}/submit-v2`, { answers });

            // 禁用防作弊检测
            this._disableAntiCheat();

            Toast.success('提交成功');

            // 跳转到详情结果页
            await this.viewResult(currentExam.record_id);

        } catch (e) {
            Toast.error('提交失败');
            this.setState({ loading: false });
        }
    }

    async viewResult(recordId) {
        try {
            const res = await Api.get(`/exam/records/${recordId}?include_answers=true`);
            const record = res.data;

            // 获取题目详情，因为record里只有答案引用的question_id，没有题目详情
            // 我们需要获取试卷的完整题目信息
            const paperRes = await Api.get(`/exam/papers/${record.paper_id}/questions`);
            record.questions = paperRes.data;

            this.setState({
                view: 'result_detail',
                gradingRecord: record // 复用这个状态存储 结果详情
            });
        } catch (e) {
            Toast.error('加载结果失败');
        }
    }

    async showGradingModal(recordId) {
        // 现在直接调用 startGrading
        this.startGrading(recordId);
    }

    // ==================== 错题本渲染 ====================

    renderWrongQuestions() {
        const { wrongQuestions, wrongTotal } = this.state;

        return `
            <div class="wrong-questions-view">
                <div class="wrong-questions-header">
                    <h2><i class="ri-error-warning-line"></i> 我的错题本 <span class="record-count">(${Utils.escapeHtml(String(wrongTotal))})</span></h2>
                    ${wrongQuestions.length > 0 ? `
                        <button class="btn btn-ghost danger" data-action="clear-wrong">
                            <i class="ri-delete-bin-line"></i> 清空
                        </button>
                    ` : ''}
                </div>
                ${wrongQuestions.length === 0 ? '<p class="empty-text">🎉 棒棒哒，暂无错题记录！</p>' : `
                    <div class="wrong-question-list">
                        ${wrongQuestions.map((wrong, i) => `
                            <div class="wrong-question-item">
                                <div class="wrong-question-header">
                                    <div class="wrong-question-meta">
                                        <span class="question-type type-${Utils.escapeHtml(String(wrong.question_type))}">${this.getTypeText(wrong.question_type)}</span>
                                        <span class="wrong-count-badge">错 ${Utils.escapeHtml(String(wrong.wrong_count))} 次</span>
                                    </div>
                                    <div class="wrong-question-actions">
                                        <button data-action="delete-wrong" data-id="${Utils.escapeHtml(String(wrong.id))}" title="移除错题">
                                            <i class="ri-close-line"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="eq-title">${Utils.escapeHtml(wrong.title)}</div>
                                <div class="result-answer-box">
                                    <div class="user-answer-section">
                                        <label>你的答案</label>
                                        <div class="answer-content ${!wrong.user_answer ? 'empty' : ''}">${Utils.escapeHtml(wrong.user_answer || '未作答')}</div>
                                    </div>
                                    <div class="correct-answer-section">
                                        <label>正确答案</label>
                                        <div class="answer-content" style="color: var(--color-success);">${Utils.escapeHtml(wrong.correct_answer)}</div>
                                    </div>
                                </div>
                                ${wrong.analysis ? `
                                    <div class="analysis-box">
                                        <div class="analysis-label"><i class="ri-lightbulb-line"></i> 解析</div>
                                        <div class="analysis-content">${Utils.escapeHtml(wrong.analysis)}</div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    // ==================== 排名渲染 ====================

    renderRanking() {
        const { currentRanking } = this.state;
        if (!currentRanking) return '<p class="empty-text">加载中...</p>';

        const { paper_title, total_score, pass_score, take_count, pass_count, pass_rate, avg_score, rankings } = currentRanking;

        return `
            <div class="ranking-view">
                <div class="ranking-header">
                    <button class="btn btn-ghost" data-action="back" style="position:absolute; left:0; top:0;">
                        <i class="ri-arrow-left-line"></i> 返回
                    </button>
                    <h2>📊 ${Utils.escapeHtml(paper_title)}</h2>
                    <p>满分 ${Utils.escapeHtml(String(total_score))} 分 / 及格 ${Utils.escapeHtml(String(pass_score))} 分</p>
                </div>
                
                <div class="ranking-stats">
                    <div class="ranking-stat">
                        <div class="ranking-stat-value">${Utils.escapeHtml(String(take_count))}</div>
                        <div class="ranking-stat-label">参考人数</div>
                    </div>
                    <div class="ranking-stat">
                        <div class="ranking-stat-value">${Utils.escapeHtml(String(pass_count))}</div>
                        <div class="ranking-stat-label">通过人数</div>
                    </div>
                    <div class="ranking-stat">
                        <div class="ranking-stat-value">${Utils.escapeHtml(String(pass_rate))}%</div>
                        <div class="ranking-stat-label">通过率</div>
                    </div>
                    <div class="ranking-stat">
                        <div class="ranking-stat-value">${Utils.escapeHtml(String(avg_score))}</div>
                        <div class="ranking-stat-label">平均分</div>
                    </div>
                </div>

                ${rankings.length === 0 ? '<p class="empty-text">暂无成绩记录</p>' : `
                    <div class="ranking-list">
                        ${rankings.map((r, i) => `
                            <div class="ranking-item">
                                <div class="ranking-position ${i < 3 ? 'top-' + (i + 1) : ''}">${Utils.escapeHtml(String(r.rank))}</div>
                                <div class="ranking-info">
                                    <div class="ranking-user">用户 ${Utils.escapeHtml(String(r.user_id))}</div>
                                    <div class="ranking-time">${r.used_seconds ? Utils.escapeHtml(String(Math.floor(r.used_seconds / 60))) + '分' + Utils.escapeHtml(String(r.used_seconds % 60)) + '秒' : '-'}</div>
                                </div>
                                <div class="ranking-score">${Utils.escapeHtml(String(r.score))}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    // ==================== 答题卡渲染 ====================

    renderAnswerSheet() {
        const { currentExam, examAnswers } = this.state;
        if (!currentExam || !currentExam.questions) return '';

        const questions = currentExam.questions;
        const answeredCount = Object.keys(examAnswers).filter(k => examAnswers[k]).length;

        return `
            <div class="answer-sheet">
                <div class="answer-sheet-title"><i class="ri-layout-grid-line"></i> 答题卡</div>
                <div class="answer-sheet-grid">
                    ${questions.map((q, i) => `
                        <div class="answer-sheet-item ${examAnswers[q.id] ? 'answered' : ''}" 
                             data-qid="${Utils.escapeHtml(String(q.id))}" title="第${i + 1}题">
                            ${i + 1}
                        </div>
                    `).join('')}
                </div>
                <div class="answer-sheet-stats">
                    <div><span>已答:</span><span>${Utils.escapeHtml(String(answeredCount))}/${Utils.escapeHtml(String(questions.length))}</span></div>
                    <div><span>未答:</span><span>${Utils.escapeHtml(String(questions.length - answeredCount))}</span></div>
                </div>
            </div>
        `;
    }

    // ==================== 批量导入 ====================

    async showImportModal() {
        new Modal({
            title: '批量导入题目',
            width: 700,
            content: `
                <div class="import-container">
                    <p class="import-hint">请按照 JSON 格式录入题目数据：</p>
                    <textarea class="form-control" id="importJson" rows="15" placeholder='[
  {
    "question_type": "single",
    "title": "示例题目",
    "option_a": "选项A",
    "option_b": "选项B",
    "option_c": "选项C",
    "option_d": "选项D",
    "answer": "A",
    "score": 2,
    "difficulty": 1
  }
]'></textarea>
                    <div class="import-actions" style="margin-top: 12px;">
                        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('importJson').value = JSON.stringify([{'question_type':'single','title':'','option_a':'','option_b':'','option_c':'','option_d':'','answer':'','score':2,'difficulty':1}], null, 2)">插入模板</button>
                    </div>
                </div>
            `,
            confirmText: '开始导入',
            onConfirm: async () => {
                const jsonText = document.getElementById('importJson').value.trim();
                if (!jsonText) {
                    Toast.warning('请输入题目数据');
                    return false;
                }

                try {
                    const questions = JSON.parse(jsonText);
                    if (!Array.isArray(questions)) throw new Error('数据必须是数组格式');

                    const res = await Api.post('/exam/questions/import', {
                        bank_id: this.state.currentBankId,
                        questions: questions
                    });

                    Toast.success(`导入成功: ${res.data.success_count} 题`);
                    if (res.data.fail_count > 0) {
                        Toast.warning(`失败 ${res.data.fail_count} 题，请检查格式`);
                    }
                    this.loadQuestions();
                    return true;
                } catch (e) {
                    Toast.error('导入失败: ' + (e.message || 'JSON格式错误'));
                    return false;
                }
            }
        }).show();
    }
}

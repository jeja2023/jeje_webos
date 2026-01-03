/**
 * 考试模块页面组件
 * 
 * 功能：题库管理、试卷管理、在线考试、阅卷
 */

class ExamPage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin' || user?.role === 'manager';

        this.state = {
            view: 'home',  // home, questions, papers, take, result, grading
            loading: false,

            // 题库相关
            banks: [],
            currentBankId: null,

            // 题目相关
            questions: [],
            questionPage: 1,
            questionTotal: 0,

            // 试卷相关
            papers: [],
            paperPage: 1,
            paperTotal: 0,
            currentPaper: null,

            // 考试相关
            availableExams: [],
            myRecords: [],
            currentExam: null,
            examAnswers: {},
            remainingTime: 0,

            // 阅卷相关
            pendingRecords: [],
            gradingRecord: null
        };

        this._examTimer = null;
    }

    async afterMount() {
        this.bindEvents();
        await this.loadHomeData();
    }

    destroy() {
        if (this._examTimer) {
            clearInterval(this._examTimer);
        }
        super.destroy();
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
        this.delegate('click', '[data-action="edit-paper"]', (e, el) => this.showPaperModal(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="delete-paper"]', (e, el) => this.deletePaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="view-paper"]', (e, el) => this.viewPaper(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="add-questions"]', () => this.showAddQuestionsModal());
        this.delegate('click', '[data-action="publish-paper"]', (e, el) => this.publishPaper(parseInt(el.dataset.id)));

        // 考试操作
        this.delegate('click', '[data-action="start-exam"]', (e, el) => this.startExam(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="submit-exam"]', () => this.submitExam());
        this.delegate('change', '.exam-answer input, .exam-answer textarea', (e, el) => this.saveAnswer(el));

        // 查看结果
        this.delegate('click', '[data-action="view-result"]', (e, el) => this.viewResult(parseInt(el.dataset.id)));
        this.delegate('click', '[data-action="back"]', () => this.navigateTo('home'));

        // 阅卷
        this.delegate('click', '[data-action="grade-record"]', (e, el) => this.showGradingModal(parseInt(el.dataset.id)));
    }

    async navigateTo(view) {
        if (this._examTimer) {
            clearInterval(this._examTimer);
            this._examTimer = null;
        }

        this.setState({ view, loading: true });

        switch (view) {
            case 'home':
                await this.loadHomeData();
                break;
            case 'questions':
                await this.loadBanks();
                await this.loadQuestions();
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

    async loadQuestions() {
        const { currentBankId, questionPage } = this.state;
        try {
            let url = `/exam/questions?page=${questionPage}&page_size=20`;
            if (currentBankId) url += `&bank_id=${currentBankId}`;

            const res = await Api.get(url);
            this.setState({
                questions: res.data?.items || [],
                questionTotal: res.data?.total || 0
            });
        } catch (e) {
            Toast.error('加载题目失败');
        }
    }

    async loadPapers() {
        const { paperPage } = this.state;
        try {
            const res = await Api.get(`/exam/papers?page=${paperPage}&page_size=20`);
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

    // ==================== 渲染方法 ====================

    render() {
        const { view, loading } = this.state;

        return `
            <div class="exam-page fade-in">
                ${this.renderNav()}
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
                <button class="nav-btn ${view === 'questions' ? 'active' : ''}" data-nav="questions">
                    <i class="ri-question-line"></i> 题库管理
                </button>
                <button class="nav-btn ${view === 'papers' ? 'active' : ''}" data-nav="papers">
                    <i class="ri-file-list-3-line"></i> 试卷管理
                </button>
                ${this.isAdmin ? `
                    <button class="nav-btn ${view === 'grading' ? 'active' : ''}" data-nav="grading">
                        <i class="ri-edit-box-line"></i> 阅卷
                    </button>
                ` : ''}
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
            case 'grading': return this.renderGrading();
            default: return this.renderHome();
        }
    }

    renderHome() {
        const { availableExams, myRecords } = this.state;

        return `
            <div class="exam-home">
                <div class="section">
                    <h2 class="section-title"><i class="ri-play-circle-line"></i> 可参加的考试</h2>
                    ${availableExams.length === 0 ? '<p class="empty-text">暂无可参加的考试</p>' : `
                        <div class="exam-grid">
                            ${availableExams.map(exam => `
                                <div class="exam-card">
                                    <div class="exam-card-header">
                                        <h3>${Utils.escapeHtml(exam.title)}</h3>
                                        <span class="tag tag-primary">${exam.total_score} 分</span>
                                    </div>
                                    <div class="exam-card-body">
                                        <p><i class="ri-time-line"></i> 时长: ${exam.duration} 分钟</p>
                                        <p><i class="ri-file-list-line"></i> ${exam.question_count} 道题</p>
                                    </div>
                                    <div class="exam-card-footer">
                                        <button class="btn btn-primary" data-action="start-exam" data-id="${exam.id}">
                                            开始考试
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
                                        ${record.score !== null ? `<span class="${record.is_passed ? 'pass' : 'fail'}">${record.score}/${record.total_score}</span>` : '-'}
                                    </div>
                                    <div class="record-actions">
                                        ${record.status === 'graded' ? `<button class="btn btn-sm btn-ghost" data-action="view-result" data-id="${record.id}">查看详情</button>` : ''}
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
        const { banks, currentBankId, questions } = this.state;

        return `
            <div class="questions-view">
                <div class="questions-sidebar">
                    <div class="sidebar-header">
                        <h3>题库分类</h3>
                        <button class="btn btn-sm btn-primary" data-action="create-bank"><i class="ri-add-line"></i></button>
                    </div>
                    <div class="bank-list">
                        <div class="bank-item ${!currentBankId ? 'active' : ''}" data-id="">全部题目</div>
                        ${banks.map(bank => `
                            <div class="bank-item ${currentBankId === bank.id ? 'active' : ''}" data-id="${bank.id}">
                                <span>${Utils.escapeHtml(bank.name)}</span>
                                <span class="bank-count">${bank.question_count}</span>
                                <div class="bank-actions">
                                    <button data-action="edit-bank" data-id="${bank.id}"><i class="ri-edit-line"></i></button>
                                    <button data-action="delete-bank" data-id="${bank.id}"><i class="ri-delete-bin-line"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="questions-main">
                    <div class="toolbar">
                        <button class="btn btn-primary" data-action="create-question"><i class="ri-add-line"></i> 新增题目</button>
                    </div>
                    <div class="question-list">
                        ${questions.length === 0 ? '<p class="empty-text">暂无题目</p>' : questions.map((q, i) => `
                            <div class="question-item">
                                <div class="question-header">
                                    <span class="question-type type-${q.question_type}">${this.getTypeText(q.question_type)}</span>
                                    <span class="question-score">${q.score} 分</span>
                                </div>
                                <div class="question-title">${Utils.escapeHtml(q.title)}</div>
                                <div class="question-actions">
                                    <button data-action="edit-question" data-id="${q.id}"><i class="ri-edit-line"></i></button>
                                    <button data-action="delete-question" data-id="${q.id}"><i class="ri-delete-bin-line"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
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
                    <button class="btn btn-primary" data-action="create-paper"><i class="ri-add-line"></i> 创建试卷</button>
                </div>
                <div class="paper-list">
                    ${papers.length === 0 ? '<p class="empty-text">暂无试卷</p>' : papers.map(paper => `
                        <div class="paper-card">
                            <div class="paper-header">
                                <h3>${Utils.escapeHtml(paper.title)}</h3>
                                <span class="tag tag-${paper.status}">${paper.status === 'published' ? '已发布' : '草稿'}</span>
                            </div>
                            <div class="paper-info">
                                <span><i class="ri-file-list-line"></i> ${paper.question_count} 题</span>
                                <span><i class="ri-time-line"></i> ${paper.duration} 分钟</span>
                                <span><i class="ri-medal-line"></i> ${paper.total_score} 分</span>
                            </div>
                            <div class="paper-actions">
                                <button class="btn btn-sm btn-ghost" data-action="view-paper" data-id="${paper.id}">编辑</button>
                                ${paper.status === 'draft' ? `<button class="btn btn-sm btn-primary" data-action="publish-paper" data-id="${paper.id}">发布</button>` : ''}
                                <button class="btn btn-sm btn-ghost danger" data-action="delete-paper" data-id="${paper.id}">删除</button>
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
                            <span class="q-type type-${q.question_type}">${this.getTypeText(q.question_type)}</span>
                            <span class="q-title">${Utils.escapeHtml(q.title.substring(0, 50))}...</span>
                            <span class="q-score">${q.paper_score || q.score} 分</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderTakeExam() {
        const { currentExam, examAnswers, remainingTime } = this.state;
        if (!currentExam) return '<p>加载中...</p>';

        const mins = Math.floor(remainingTime / 60);
        const secs = remainingTime % 60;

        return `
            <div class="take-exam">
                <div class="exam-header">
                    <h2>${Utils.escapeHtml(currentExam.title)}</h2>
                    <div class="exam-timer ${remainingTime < 300 ? 'warning' : ''}">
                        <i class="ri-time-line"></i> ${mins}:${secs.toString().padStart(2, '0')}
                    </div>
                </div>
                <div class="exam-questions">
                    ${currentExam.questions.map((q, i) => `
                        <div class="exam-question" id="q-${q.id}">
                            <div class="eq-header">
                                <span class="eq-num">${i + 1}</span>
                                <span class="eq-type">${this.getTypeText(q.question_type)}</span>
                                <span class="eq-score">${q.score} 分</span>
                            </div>
                            <div class="eq-title">${Utils.escapeHtml(q.title)}</div>
                            <div class="exam-answer" data-qid="${q.id}" data-type="${q.question_type}">
                                ${this.renderAnswerInput(q, examAnswers[q.id])}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="exam-footer">
                    <button class="btn btn-primary btn-lg" data-action="submit-exam">提交试卷</button>
                </div>
            </div>
        `;
    }

    renderAnswerInput(question, savedAnswer) {
        const { question_type, options } = question;
        savedAnswer = savedAnswer || '';

        if (question_type === 'single') {
            return (options || []).map(opt => `
                <label class="radio-option">
                    <input type="radio" name="q_${question.id}" value="${opt.key}" ${savedAnswer === opt.key ? 'checked' : ''}>
                    <span>${opt.key}. ${Utils.escapeHtml(opt.value)}</span>
                </label>
            `).join('');
        }

        if (question_type === 'multiple') {
            const selected = savedAnswer.split(',');
            return (options || []).map(opt => `
                <label class="checkbox-option">
                    <input type="checkbox" name="q_${question.id}" value="${opt.key}" ${selected.includes(opt.key) ? 'checked' : ''}>
                    <span>${opt.key}. ${Utils.escapeHtml(opt.value)}</span>
                </label>
            `).join('');
        }

        if (question_type === 'judge') {
            return `
                <label class="radio-option"><input type="radio" name="q_${question.id}" value="true" ${savedAnswer === 'true' ? 'checked' : ''}><span>正确</span></label>
                <label class="radio-option"><input type="radio" name="q_${question.id}" value="false" ${savedAnswer === 'false' ? 'checked' : ''}><span>错误</span></label>
            `;
        }

        return `<textarea class="form-control" name="q_${question.id}" rows="4" placeholder="请输入答案">${Utils.escapeHtml(savedAnswer)}</textarea>`;
    }

    renderResult() {
        // 简化版结果页面
        return `<div class="result-view"><button class="btn btn-primary" data-action="back">返回首页</button></div>`;
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
                                <span>${Utils.escapeHtml(r.paper_title || '未知')}</span>
                                <span>考生ID: ${r.user_id}</span>
                                <button class="btn btn-sm btn-primary" data-action="grade-record" data-id="${r.id}">阅卷</button>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
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
                remainingTime: examData.remaining_seconds || 0
            });

            // 启动计时器
            this._examTimer = setInterval(() => {
                const { remainingTime } = this.state;
                if (remainingTime <= 0) {
                    this.submitExam();
                } else {
                    this.setState({ remainingTime: remainingTime - 1 });
                }
            }, 1000);

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
        this.setState({ examAnswers });

        // 异步保存到服务器
        const { currentExam } = this.state;
        if (currentExam) {
            Api.post(`/exam/take/${currentExam.record_id}/save`, { question_id: qid, answer }).catch(() => { });
        }
    }

    async submitExam() {
        if (this._examTimer) {
            clearInterval(this._examTimer);
            this._examTimer = null;
        }

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

        const { currentExam, examAnswers } = this.state;
        const answers = Object.entries(examAnswers).map(([qid, answer]) => ({
            question_id: parseInt(qid),
            answer: answer
        }));

        try {
            const res = await Api.post(`/exam/take/${currentExam.record_id}/submit`, { answers });
            Toast.success('提交成功');

            // 显示成绩
            await Modal.alert('考试完成', `
                <div style="text-align:center">
                    <p style="font-size:48px;font-weight:bold;color:${res.data.is_passed ? 'var(--color-success)' : 'var(--color-danger)'}">${res.data.score}</p>
                    <p>${res.data.is_passed ? '恭喜通过！' : '未通过'}</p>
                </div>
            `);

            this.navigateTo('home');
        } catch (e) {
            Toast.error('提交失败');
        }
    }

    async viewResult(recordId) {
        try {
            const res = await Api.get(`/exam/records/${recordId}`);
            // 简化：直接弹窗显示
            const record = res.data;
            await Modal.alert('考试结果', `
                <p>得分: ${record.score} / ${record.total_score}</p>
                <p>结果: ${record.is_passed ? '通过' : '未通过'}</p>
            `);
        } catch (e) {
            Toast.error('加载失败');
        }
    }

    async showGradingModal(recordId) {
        Toast.info('阅卷功能开发中...');
    }
}

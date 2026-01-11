/**
 * 课程学习页面组件
 * 支持课程浏览、学习和管理
 */

class CoursePage extends Component {
    constructor(container) {
        super(container);
        const user = Store.get('user');
        this.isAdmin = user?.role === 'admin';

        this.state = {
            view: 'list', // list, learning, manage, detail, learn
            courses: [],
            myCourses: [],
            myLearning: [],
            stats: null,
            currentCourse: null,
            currentChapter: null,
            loading: true,
            keyword: ''
        };

        // 绑定键盘事件用于退出专注模式
        this._escHandler = (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('focus-mode-active')) {
                this.toggleFocusMode();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    destroy() {
        document.removeEventListener('keydown', this._escHandler);
        // 确保离开页面时退出专注模式
        document.body.classList.remove('focus-mode-active');
        super.destroy();
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const { view } = this.state;

            if (view === 'list') {
                const res = await Api.get('/course/list');
                this.setState({ courses: res.data?.items || [], loading: false });
            } else if (view === 'learning') {
                const [learningRes, statsRes] = await Promise.all([
                    Api.get('/course/learning/my'),
                    Api.get('/course/learning/stats')
                ]);
                this.setState({
                    myLearning: learningRes.data || [],
                    stats: statsRes.data || {},
                    loading: false
                });
            } else if (view === 'manage') {
                const res = await Api.get('/course/my');
                this.setState({ myCourses: res.data || [], loading: false });
            } else {
                this.setState({ loading: false });
            }
        } catch (e) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    async loadCourseDetail(courseId) {
        try {
            const res = await Api.get(`/course/${courseId}`);
            this.setState({ currentCourse: res.data, view: 'detail' });
        } catch (e) {
            Toast.error('加载课程详情失败');
        }
    }

    async loadChapterContent(chapterId) {
        try {
            const res = await Api.get(`/course/chapters/${chapterId}`);
            this.setState({ currentChapter: res.data, view: 'learn' });

            // 保存阅读记录到本地存储
            if (this.state.currentCourse) {
                localStorage.setItem(`lastChapter_${this.state.currentCourse.id}`, chapterId);
                localStorage.setItem(`lastChapterTitle_${this.state.currentCourse.id}`, res.data.title);
            }
        } catch (e) {
            Toast.error('加载章节内容失败');
        }
    }

    render() {
        const { view, loading } = this.state;

        return `
            <div class="course-page">
                <!-- 侧边栏导航 -->
                <aside class="course-sidebar">
                    <div class="sidebar-header">
                        <i class="ri-book-open-line"></i>
                        <span>课程学习</span>
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${view === 'list' ? 'active' : ''}" data-view="list">
                            <i class="ri-compass-3-line"></i>
                            <span>课程中心</span>
                        </div>
                        <div class="nav-item ${view === 'learning' ? 'active' : ''}" data-view="learning">
                            <i class="ri-graduation-cap-line"></i>
                            <span>我的学习</span>
                        </div>
                        <div class="nav-item ${view === 'manage' ? 'active' : ''}" data-view="manage">
                            <i class="ri-settings-3-line"></i>
                            <span>课程管理</span>
                        </div>
                    </nav>
                </aside>

                <!-- 主内容区 -->
                <main class="course-main">
                    ${loading ? this.renderLoading() : this.renderContent()}
                </main>
            </div>
        `;
    }

    renderLoading() {
        const { view } = this.state;
        if (view === 'list' || view === 'manage') {
            return `
                <div class="content-section">
                    <div class="skeleton-grid">
                        ${Array(6).fill(0).map(() => `
                            <div class="skeleton-card">
                                <div class="skeleton-image"></div>
                                <div class="skeleton-content">
                                    <div class="skeleton-line title"></div>
                                    <div class="skeleton-line text"></div>
                                    <div class="skeleton-line short"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        return `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>正在努力加载内容...</p>
            </div>
        `;
    }

    renderContent() {
        const { view } = this.state;

        switch (view) {
            case 'list': return this.renderCourseList();
            case 'learning': return this.renderLearning();
            case 'manage': return this.renderManage();
            case 'detail': return this.renderCourseDetail();
            case 'learn': return this.renderLearnChapter();
            default: return this.renderCourseList();
        }
    }

    renderCourseList() {
        const { courses, keyword } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <div class="header-left">
                        <h2>课程中心</h2>
                        <span class="subtitle">发现优质课程，开启学习之旅</span>
                    </div>
                    <div class="header-right d-flex align-items-center gap-3">
                        <div class="search-box">
                            <i class="ri-search-line"></i>
                            <input type="text" id="course-search" placeholder="搜索课程..." value="${keyword}">
                        </div>
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('course', '课程学习') : ''}
                    </div>
                </div>

                <div class="course-grid">
                    ${courses.length > 0 ? courses.map(course => this.renderCourseCard(course)).join('') : `
                        <div class="empty-state">
                            <div class="empty-icon glass-effect"><i class="ri-book-3-line"></i></div>
                            <p>暂时还没有发布的课程，请稍后再来</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderEnrolledCourseCard(course, lastChapterId, lastChapterTitle) {
        const progress = Math.min(100, Math.max(0, parseInt(course.progress || 0)));

        return `
            <div class="course-card fade-up" data-course-id="${course.id}">
                <div class="course-cover">
                    ${course.cover_image
                ? `<img src="${course.cover_image}" alt="${course.title}">`
                : `<div class="cover-placeholder"><i class="ri-palette-line"></i></div>`
            }
                    <div class="progress-overlay">
                        <div class="progress-text">学习进度 ${progress}%</div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                </div>
                <div class="course-info">
                    <h3 class="course-title" title="${Utils.escapeHtml(course.title)}">${Utils.escapeHtml(course.title)}</h3>
                    
                    ${lastChapterId ? `
                        <div class="continue-learning-tip">
                            <i class="ri-history-line"></i> 
                            <span>上次学到: ${Utils.escapeHtml(lastChapterTitle || '未知章节')}</span>
                        </div>
                    ` : '<p class="course-desc">开始您的学习之旅</p>'}

                </div>
                <div class="card-footer-action" ${lastChapterId ? `onclick="event.stopPropagation(); app.coursePage.continueLearning('${course.id}', '${lastChapterId}')"` : ''}>
                    <span>${lastChapterId ? '继续学习' : '开始学习'}</span>
                    <i class="ri-arrow-right-line"></i>
                </div>
            </div>
        `;
    }

    continueLearning(courseId, chapterId) {
        // 先加载课程详情，再加载章节
        this.openCourseDetail(courseId).then(() => {
            this.loadChapterContent(chapterId);
        });
    }

    renderCourseCard(course) {
        const difficultyMap = {
            'beginner': { label: '🌱 入门', class: 'beginner' },
            'intermediate': { label: '🚀 进阶', class: 'intermediate' },
            'advanced': { label: '🔥 高级', class: 'advanced' }
        };
        const difficulty = difficultyMap[course.difficulty] || difficultyMap.beginner;

        return `
            <div class="course-card fade-up" data-course-id="${course.id}">
                <div class="course-cover">
                    ${course.cover_image
                ? `<img src="${course.cover_image}" alt="${course.title}">`
                : `<div class="cover-placeholder"><i class="ri-palette-line"></i></div>`
            }
                    <span class="difficulty-badge ${difficulty.class}">${difficulty.label}</span>
                </div>
                <div class="course-info">
                    <h3 class="course-title" title="${Utils.escapeHtml(course.title)}">${Utils.escapeHtml(course.title)}</h3>
                    <p class="course-desc">${Utils.escapeHtml(course.description || '发现课程的无限可能，开启您的知识进化之旅。')}</p>
                    <div class="course-meta">
                        <span class="meta-tag"><i class="ri-book-open-line"></i> ${course.chapter_count || 0} 章节</span>
                        <span class="meta-tag"><i class="ri-time-line"></i> ${course.duration_hours || 0}h</span>
                    </div>
                </div>
                <div class="card-footer-action">
                    <span>立即查看</span>
                    <i class="ri-arrow-right-line"></i>
                </div>
            </div>
        `;
    }

    renderLearning() {
        const { myLearning, stats } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <h2>我的学习</h2>
                    ${window.ModuleHelp ? ModuleHelp.createHelpButton('course', '课程学习') : ''}
                </div>

                <!-- 学习统计卡片 -->
                <div class="stats-row">
                    <div class="stat-card">
                        <div class="stat-icon enrolled"><i class="ri-book-mark-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.enrolled_count || 0}</span>
                            <span class="stat-label">已报名</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon progress"><i class="ri-loader-4-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.in_progress_count || 0}</span>
                            <span class="stat-label">学习中</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon completed"><i class="ri-checkbox-circle-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.completed_count || 0}</span>
                            <span class="stat-label">已完成</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon hours"><i class="ri-timer-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.total_learning_hours || 0}</span>
                            <span class="stat-label">学习时长(小时)</span>
                        </div>
                    </div>
                </div>

                <!-- 学习列表 -->
                <div class="learning-list">
                    <h3 class="list-title">正在学习</h3>
                    ${myLearning.length > 0 ? myLearning.map(item => {
            // 读取本地存储的最后学习记录
            const lastChapterId = localStorage.getItem(`lastChapter_${item.course.id}`);
            const lastChapterTitle = localStorage.getItem(`lastChapterTitle_${item.course.id}`);

            return `
                        <div class="learning-item" data-course-id="${item.course.id}">
                            <div class="learning-cover">
                                ${item.course.cover_image
                    ? `<img src="${item.course.cover_image}" alt="">`
                    : `<div class="cover-placeholder small"><i class="ri-book-2-line"></i></div>`
                }
                            </div>
                            <div class="learning-info">
                                <h4>${Utils.escapeHtml(item.course.title)}</h4>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${item.enrollment.progress}%"></div>
                                </div>
                                <span class="progress-text">
                                    ${item.enrollment.progress.toFixed(1)}% 完成
                                    ${lastChapterTitle ? ` • 上次学到: ${Utils.escapeHtml(lastChapterTitle)}` : ''}
                                </span>
                            </div>
                            <button class="btn-continue" 
                                    data-course-id="${item.course.id}" 
                                    ${lastChapterId ? `data-chapter-id="${lastChapterId}"` : ''}>
                                <i class="${lastChapterId ? 'ri-history-line' : 'ri-play-circle-line'}"></i> 
                                ${lastChapterId ? '继续学习' : '开始学习'}
                            </button>
                        </div>
                    `}).join('') : `
                        <div class="empty-state small glass-effect">
                            <i class="ri-compass-discover-line"></i>
                            <p>还没开始学习吗？快去课程中心挑选你的课程吧！</p>
                            <button class="btn btn-primary btn-sm" onclick="app.coursePage.switchToView('list')">探索课程</button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderManage() {
        const { myCourses } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <h2>课程管理</h2>
                    <div class="d-flex align-items-center gap-2">
                        ${window.ModuleHelp ? ModuleHelp.createHelpButton('course', '课程学习') : ''}
                        <button class="btn btn-primary" id="btn-create-course">
                            <i class="ri-add-line"></i> 创建课程
                        </button>
                    </div>
                </div>

                <div class="manage-list">
                    ${myCourses.length > 0 ? myCourses.map(course => `
                        <div class="manage-item">
                            <div class="manage-cover">
                                ${course.cover_image
                ? `<img src="${course.cover_image}" alt="">`
                : `<div class="cover-placeholder small"><i class="ri-book-2-line"></i></div>`
            }
                            </div>
                            <div class="manage-info">
                                <h4>${Utils.escapeHtml(course.title)}</h4>
                                <div class="manage-meta">
                                    <span class="status ${course.is_published ? 'published' : 'draft'}">
                                        ${course.is_published ? '已发布' : '草稿'}
                                    </span>
                                    <span>${course.chapter_count || 0} 章节</span>
                                </div>
                            </div>
                            <div class="manage-actions">
                                <button class="btn-icon" data-edit-course="${course.id}" title="编辑">
                                    <i class="ri-edit-line"></i>
                                </button>
                                <button class="btn-icon" data-manage-chapters="${course.id}" title="管理章节">
                                    <i class="ri-list-ordered"></i>
                                </button>
                                <button class="btn-icon danger" data-delete-course="${course.id}" title="删除">
                                    <i class="ri-delete-bin-line"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="empty-state">
                            <i class="ri-draft-line"></i>
                            <p>您还没有创建课程</p>
                            <button class="btn btn-primary" id="btn-create-first">创建第一个课程</button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderCourseDetail() {
        const { currentCourse } = this.state;
        if (!currentCourse) return '';

        const difficultyMap = {
            'beginner': '入门',
            'intermediate': '进阶',
            'advanced': '高级'
        };

        return `
            <div class="content-section fade-in">
                <div class="detail-header d-flex justify-content-between align-items-center">
                    <button class="btn-back" id="btn-back-list">
                        <i class="ri-arrow-left-line"></i> 返回
                    </button>
                    ${window.ModuleHelp ? ModuleHelp.createHelpButton('course', '课程学习') : ''}
                </div>

                <div class="course-detail">
                    <div class="detail-cover">
                        ${currentCourse.cover_image
                ? `<img src="${currentCourse.cover_image}" alt="">`
                : `<div class="cover-placeholder large"><i class="ri-book-2-line"></i></div>`
            }
                    </div>
                    
                    <div class="detail-info">
                        <h1>${Utils.escapeHtml(currentCourse.title)}</h1>
                        <p class="description">${Utils.escapeHtml(currentCourse.description || '暂无描述')}</p>
                        
                        <div class="detail-meta">
                            <span class="meta-item">
                                <i class="ri-bar-chart-box-line"></i>
                                ${difficultyMap[currentCourse.difficulty] || '入门'}
                            </span>
                            <span class="meta-item">
                                <i class="ri-book-open-line"></i>
                                ${currentCourse.chapter_count || 0} 章节
                            </span>
                            <span class="meta-item">
                                <i class="ri-time-line"></i>
                                ${currentCourse.duration_hours || 0} 小时
                            </span>
                        </div>

                        ${currentCourse.enrolled ? `
                            <div class="enrolled-info">
                                <div class="progress-bar large">
                                    <div class="progress-fill" style="width: ${currentCourse.progress}%"></div>
                                </div>
                                <span>学习进度：${currentCourse.progress.toFixed(1)}%</span>
                            </div>
                        ` : `
                            <button class="btn btn-primary btn-lg" id="btn-enroll">
                                <i class="ri-user-add-line"></i> 立即报名
                            </button>
                        `}
                    </div>
                </div>

                <!-- 章节列表 -->
                <div class="chapter-section">
                    <h3>课程目录</h3>
                    <div class="chapter-list">
                        ${currentCourse.chapters && currentCourse.chapters.length > 0
                ? currentCourse.chapters.map((ch, idx) => `
                                <div class="chapter-item ${currentCourse.enrolled ? 'clickable' : 'locked'}" 
                                     data-chapter-id="${ch.id}">
                                    <span class="chapter-index">${idx + 1}</span>
                                    <div class="chapter-info">
                                        <span class="chapter-title">${Utils.escapeHtml(ch.title)}</span>
                                        <span class="chapter-duration">${ch.duration_minutes || 0} 分钟</span>
                                    </div>
                                    ${currentCourse.enrolled
                        ? '<i class="ri-play-circle-line"></i>'
                        : '<i class="ri-lock-line"></i>'
                    }
                                </div>
                            `).join('')
                : '<div class="empty-state small"><p>暂无章节</p></div>'
            }
                    </div>
                </div>
            </div>
        `;
    }

    renderLearnChapter() {
        const { currentCourse, currentChapter } = this.state;
        if (!currentChapter || !currentCourse) return '';

        // 计算当前章节在目录中的位置
        const chapters = currentCourse.chapters || [];
        const currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
        const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
        const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

        return `
            <div class="content-section fade-in learn-view">
                <div class="learn-header">
                    <button class="btn-back" id="btn-back-detail">
                        <i class="ri-arrow-left-line"></i> 返回课程
                    </button>
                    <h2 class="flex-1">${Utils.escapeHtml(currentChapter.title)}</h2>
                    <button class="btn btn-ghost" id="btn-focus-mode" title="专注模式">
                        <i class="ri-fullscreen-line"></i> 专注
                    </button>
                    ${window.ModuleHelp ? ModuleHelp.createHelpButton('course', '课程学习') : ''}
                </div>

                <div class="learn-content">
                    ${currentChapter.video_url ? `
                        <div class="video-player">
                            <video controls src="${currentChapter.video_url}"></video>
                        </div>
                    ` : ''}
                    
                    <div class="chapter-content markdown-body">
                        ${currentChapter.content ? this.renderMarkdown(currentChapter.content) : '<p>本章节暂无文字内容</p>'}
                    </div>
                </div>

                <div class="learn-footer">
                    <button class="btn btn-primary" id="btn-complete-chapter" data-chapter-id="${currentChapter.id}">
                        <i class="ri-checkbox-circle-line"></i> ${currentChapter.is_completed ? '已完成' : '完成本章'}
                    </button>
                </div>

                <!-- 章节切换导航 -->
                <div class="learn-nav">
                    <button class="btn-nav-chapter prev" ${!prevChapter ? 'disabled' : ''} 
                            data-nav-chapter="${prevChapter?.id}">
                        <i class="ri-arrow-left-s-line"></i>
                        <div class="nav-text">
                            <span class="nav-label">上一章</span>
                            <span class="nav-title">${prevChapter ? Utils.escapeHtml(prevChapter.title) : '没有了'}</span>
                        </div>
                    </button>
                    <button class="btn-nav-chapter next" ${!nextChapter ? 'disabled' : ''} 
                            data-nav-chapter="${nextChapter?.id}">
                        <i class="ri-arrow-right-s-line"></i>
                        <div class="nav-text">
                            <span class="nav-label">下一章</span>
                            <span class="nav-title">${nextChapter ? Utils.escapeHtml(nextChapter.title) : '最后一章'}</span>
                        </div>
                    </button>
                </div>
            </div>
        `;
    }

    renderMarkdown(text) {
        if (!text) return '';
        // 增强的 Markdown 转换
        return text
            .replace(/# (.*)/g, '<h1>$1</h1>')
            .replace(/## (.*)/g, '<h2>$1</h2>')
            .replace(/### (.*)/g, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^- (.*)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
            .replace(/^> (.*)/gm, '<blockquote>$1</blockquote>')
            .replace(/```(.*?)\n([\s\S]*?)```/gs, '<pre><code>$2</code></pre>')
            .replace(/\n/g, '<br>');
    }

    bindEvents() {
        if (this._eventsBinded) return;
        this._eventsBinded = true;

        // 侧边栏导航
        this.delegate('click', '.nav-item', (e, el) => {
            const view = el.dataset.view;
            this.setState({ view, currentCourse: null, currentChapter: null });
            this.loadData();
        });

        // 课程卡片点击
        this.delegate('click', '.course-card', (e, el) => {
            const courseId = el.dataset.courseId;
            this.loadCourseDetail(courseId);
        });

        // 继续学习按钮
        this.delegate('click', '.btn-continue', (e, el) => {
            e.stopPropagation();
            const courseId = el.dataset.courseId;
            const chapterId = el.dataset.chapterId;

            if (chapterId) {
                // 如果有历史记录，先加载课程详情再加载章节
                this.loadCourseDetail(courseId).then(() => {
                    this.loadChapterContent(chapterId);
                });
            } else {
                this.loadCourseDetail(courseId);
            }
        });

        // 学习列表项点击
        this.delegate('click', '.learning-item', (e, el) => {
            if (e.target.closest('.btn-continue')) return;
            const courseId = el.dataset.courseId;
            this.loadCourseDetail(courseId);
        });

        // 返回列表
        this.delegate('click', '#btn-back-list', () => {
            this.setState({ view: 'list', currentCourse: null });
            this.loadData();
        });

        // 返回课程详情
        this.delegate('click', '#btn-back-detail', () => {
            const { currentCourse } = this.state;
            if (currentCourse) {
                this.setState({ view: 'detail', currentChapter: null });
            }
        });

        // 报名课程
        this.delegate('click', '#btn-enroll', async () => {
            const { currentCourse } = this.state;
            if (!currentCourse) return;

            try {
                await Api.post(`/course/${currentCourse.id}/enroll`);
                Toast.success('报名成功！');
                this.loadCourseDetail(currentCourse.id);
            } catch (e) {
                Toast.error('报名失败');
            }
        });

        // 章节点击
        this.delegate('click', '.chapter-item.clickable', (e, el) => {
            const chapterId = el.dataset.chapterId;
            this.loadChapterContent(chapterId);
        });

        // 完成章节
        this.delegate('click', '#btn-complete-chapter', async (e, el) => {
            const chapterId = el.dataset.chapterId;
            try {
                await Api.post('/course/learning/progress', {
                    chapter_id: parseInt(chapterId),
                    is_completed: true,
                    progress_seconds: 0
                });
                Toast.success('章节已完成！');

                // 刷新课程详情
                const { currentCourse } = this.state;
                if (currentCourse) {
                    this.loadCourseDetail(currentCourse.id);
                }
            } catch (e) {
                Toast.error('更新进度失败');
            }
        });

        // 创建课程
        this.delegate('click', '#btn-create-course, #btn-create-first', () => {
            this.showCreateCourseModal();
        });

        // 编辑课程
        this.delegate('click', '[data-edit-course]', async (e, el) => {
            const courseId = el.dataset.editCourse;
            await this.showEditCourseModal(courseId);
        });

        // 管理章节
        this.delegate('click', '[data-manage-chapters]', async (e, el) => {
            const courseId = el.dataset.manageChapters;
            await this.showManageChaptersModal(courseId);
        });

        // 删除课程
        this.delegate('click', '[data-delete-course]', async (e, el) => {
            const courseId = el.dataset.deleteCourse;
            const confirmed = await Modal.confirm('确认删除', '删除后无法恢复，确定要删除此课程吗？');
            if (confirmed) {
                try {
                    await Api.delete(`/course/${courseId}`);
                    Toast.success('课程已删除');
                    this.loadData();
                } catch (e) {
                    Toast.error('删除失败');
                }
            }
        });

        // 搜索
        this.delegate('input', '#course-search', async (e) => {
            const keyword = e.target.value;
            this.setState({ keyword });
            // 防抖搜索
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(async () => {
                try {
                    const res = await Api.get(`/course/list?keyword=${encodeURIComponent(keyword)}`);
                    this.setState({ courses: res.data?.items || [] });
                } catch (err) {
                    console.error('搜索失败', err);
                }
            }, 300);
        });

        // 章节导航点击 (上一章/下一章)
        this.delegate('click', '[data-nav-chapter]', (e, el) => {
            const chapterId = el.dataset.navChapter;
            if (chapterId && chapterId !== 'undefined') {
                this.loadChapterContent(chapterId);
            }
        });

        // 专注模式切换
        this.delegate('click', '#btn-focus-mode', () => {
            this.toggleFocusMode();
        });
    }

    toggleFocusMode() {
        const learnView = this.container.querySelector('.learn-view');
        if (!learnView) return;

        document.body.classList.toggle('focus-mode-active');
        const isFocused = document.body.classList.contains('focus-mode-active');

        const btn = this.container.querySelector('#btn-focus-mode');
        if (btn) {
            btn.innerHTML = isFocused
                ? '<i class="ri-fullscreen-exit-line"></i> 退出'
                : '<i class="ri-fullscreen-line"></i> 专注';
            btn.classList.toggle('active', isFocused);
        }

        if (isFocused) {
            Toast.info('已进入专注模式，按 ESC 可退出');
        }
    }

    async showCreateCourseModal() {
        new Modal({
            title: '创建课程',
            content: `
                <form id="create-course-form">
                    <div class="form-group">
                        <label>课程标题 *</label>
                        <input type="text" class="form-input" name="title" required placeholder="请输入课程标题">
                    </div>
                    <div class="form-group">
                        <label>课程描述</label>
                        <textarea class="form-input" name="description" rows="3" placeholder="简要描述课程内容"></textarea>
                    </div>
                    <div class="form-group">
                        <label>难度等级</label>
                        <select class="form-select" name="difficulty">
                            <option value="beginner">入门</option>
                            <option value="intermediate">进阶</option>
                            <option value="advanced">高级</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>预计学时（小时）</label>
                        <input type="number" class="form-input" name="duration_hours" value="1" min="0" step="0.5">
                    </div>
                </form>
            `,
            confirmText: '创建',
            onConfirm: async () => {
                const form = document.getElementById('create-course-form');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    description: form.description.value.trim(),
                    difficulty: form.difficulty.value,
                    duration_hours: parseFloat(form.duration_hours.value) || 0
                };

                try {
                    await Api.post('/course/create', data);
                    Toast.success('课程创建成功');
                    this.loadData();
                    return true;
                } catch (e) {
                    Toast.error('创建失败: ' + e.message);
                    return false;
                }
            }
        }).show();
    }

    async showEditCourseModal(courseId) {
        try {
            const res = await Api.get(`/course/${courseId}`);
            const course = res.data;

            new Modal({
                title: '编辑课程',
                content: `
                    <form id="edit-course-form">
                        <div class="form-group">
                            <label>课程标题 *</label>
                            <input type="text" class="form-input" name="title" value="${Utils.escapeHtml(course.title)}" required>
                        </div>
                        <div class="form-group">
                            <label>课程描述</label>
                            <textarea class="form-input" name="description" rows="3">${Utils.escapeHtml(course.description || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>难度等级</label>
                            <select class="form-select" name="difficulty">
                                <option value="beginner" ${course.difficulty === 'beginner' ? 'selected' : ''}>入门</option>
                                <option value="intermediate" ${course.difficulty === 'intermediate' ? 'selected' : ''}>进阶</option>
                                <option value="advanced" ${course.difficulty === 'advanced' ? 'selected' : ''}>高级</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>预计学时（小时）</label>
                            <input type="number" class="form-input" name="duration_hours" value="${course.duration_hours}" min="0" step="0.5">
                        </div>
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="is_published" ${course.is_published ? 'checked' : ''}>
                                <span>发布课程</span>
                            </label>
                        </div>
                    </form>
                `,
                confirmText: '保存',
                onConfirm: async () => {
                    const form = document.getElementById('edit-course-form');
                    if (!form.reportValidity()) return false;

                    const data = {
                        title: form.title.value.trim(),
                        description: form.description.value.trim(),
                        difficulty: form.difficulty.value,
                        duration_hours: parseFloat(form.duration_hours.value) || 0,
                        is_published: form.is_published.checked
                    };

                    try {
                        await Api.put(`/course/${courseId}`, data);
                        Toast.success('保存成功');
                        this.loadData();
                        return true;
                    } catch (e) {
                        Toast.error('保存失败');
                        return false;
                    }
                }
            }).show();
        } catch (e) {
            Toast.error('加载课程信息失败');
        }
    }

    async showManageChaptersModal(courseId) {
        try {
            const res = await Api.get(`/course/${courseId}/chapters`);
            const chapters = res.data || [];

            new Modal({
                title: '管理章节',
                width: '600px',
                content: `
                    <div class="chapters-manage">
                        <button class="btn btn-sm btn-primary" id="btn-add-chapter" data-course="${courseId}">
                            <i class="ri-add-line"></i> 添加章节
                        </button>
                        <div class="chapters-list" style="margin-top: 16px; max-height: 400px; overflow-y: auto;">
                            ${chapters.length > 0 ? chapters.map((ch, idx) => `
                                <div class="chapter-manage-item" style="display: flex; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 8px;">
                                    <span style="width: 30px; text-align: center;">${idx + 1}</span>
                                    <span style="flex: 1;">${Utils.escapeHtml(ch.title)}</span>
                                    <button class="btn-icon small" data-edit-chapter="${ch.id}"><i class="ri-edit-line"></i></button>
                                    <button class="btn-icon small danger" data-delete-chapter="${ch.id}"><i class="ri-delete-bin-line"></i></button>
                                </div>
                            `).join('') : '<p style="text-align: center; color: var(--text-tertiary);">暂无章节</p>'}
                        </div>
                    </div>
                `,
                showCancel: false,
                confirmText: '关闭'
            }).show();

            // 绑定章节管理事件
            setTimeout(() => {
                document.querySelector('#btn-add-chapter')?.addEventListener('click', () => {
                    this.showAddChapterModal(courseId);
                });

                document.querySelectorAll('[data-edit-chapter]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const chapterId = e.currentTarget.dataset.editChapter;
                        this.showEditChapterModal(chapterId, courseId);
                    });
                });

                document.querySelectorAll('[data-delete-chapter]').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const chapterId = e.currentTarget.dataset.deleteChapter;
                        if (await Modal.confirm('确认删除', '确定要删除此章节吗？')) {
                            try {
                                await Api.delete(`/course/chapters/${chapterId}`);
                                Toast.success('章节已删除');
                                Modal.closeAll();
                                this.showManageChaptersModal(courseId);
                            } catch (err) {
                                Toast.error('删除失败');
                            }
                        }
                    });
                });
            }, 100);
        } catch (e) {
            Toast.error('加载章节失败');
        }
    }

    async showAddChapterModal(courseId) {
        new Modal({
            title: '添加章节',
            content: `
                <form id="add-chapter-form">
                    <div class="form-group">
                        <label>章节标题 *</label>
                        <input type="text" class="form-input" name="title" required placeholder="请输入章节标题">
                    </div>
                    <div class="form-group">
                        <label>章节内容（支持 Markdown）</label>
                        <textarea class="form-input" name="content" rows="6" placeholder="请输入章节内容"></textarea>
                    </div>
                    <div class="form-group">
                        <label>视频链接</label>
                        <input type="text" class="form-input" name="video_url" placeholder="可选，输入视频 URL">
                    </div>
                    <div class="form-group">
                        <label>时长（分钟）</label>
                        <input type="number" class="form-input" name="duration_minutes" value="10" min="0">
                    </div>
                </form>
            `,
            confirmText: '添加',
            onConfirm: async () => {
                const form = document.getElementById('add-chapter-form');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    content: form.content.value.trim(),
                    video_url: form.video_url.value.trim() || null,
                    duration_minutes: parseInt(form.duration_minutes.value) || 0
                };

                try {
                    await Api.post(`/course/${courseId}/chapters`, data);
                    Toast.success('章节添加成功');
                    Modal.closeAll();
                    this.showManageChaptersModal(courseId);
                    return true;
                } catch (e) {
                    Toast.error('添加失败');
                    return false;
                }
            }
        }).show();
    }

    async showEditChapterModal(chapterId, courseId) {
        try {
            const res = await Api.get(`/course/chapters/${chapterId}`);
            const chapter = res.data;

            new Modal({
                title: '编辑章节',
                content: `
                    <form id="edit-chapter-form">
                        <div class="form-group">
                            <label>章节标题 *</label>
                            <input type="text" class="form-input" name="title" value="${Utils.escapeHtml(chapter.title)}" required>
                        </div>
                        <div class="form-group">
                            <label>章节内容（支持 Markdown）</label>
                            <textarea class="form-input" name="content" rows="6">${Utils.escapeHtml(chapter.content || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>视频链接</label>
                            <input type="text" class="form-input" name="video_url" value="${chapter.video_url || ''}">
                        </div>
                        <div class="form-group">
                            <label>时长（分钟）</label>
                            <input type="number" class="form-input" name="duration_minutes" value="${chapter.duration_minutes}" min="0">
                        </div>
                    </form>
                `,
                confirmText: '保存',
                onConfirm: async () => {
                    const form = document.getElementById('edit-chapter-form');
                    if (!form.reportValidity()) return false;

                    const data = {
                        title: form.title.value.trim(),
                        content: form.content.value.trim(),
                        video_url: form.video_url.value.trim() || null,
                        duration_minutes: parseInt(form.duration_minutes.value) || 0
                    };

                    try {
                        await Api.put(`/course/chapters/${chapterId}`, data);
                        Toast.success('保存成功');
                        Modal.closeAll();
                        this.showManageChaptersModal(courseId);
                        return true;
                    } catch (e) {
                        Toast.error('保存失败');
                        return false;
                    }
                }
            }).show();
        } catch (e) {
            Toast.error('加载章节信息失败');
        }
    }

    async afterMount() {
        this.bindEvents();
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
        await this.loadData();
    }

    afterUpdate() {
        // 绑定帮助按钮事件
        if (window.ModuleHelp) {
            ModuleHelp.bindHelpButtons(this.container);
        }
    }
}

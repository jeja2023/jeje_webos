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
        // 清理视频事件
        const video = this.container?.querySelector('#course-video');
        if (video && video._cleanup) {
            video._cleanup();
        }

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
                const { keyword } = this.state;
                const res = await Api.get(`/course/list?keyword=${encodeURIComponent(keyword || '')}`);
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

    async handleSearch() {
        // 直接从输入框读取关键词
        const searchInput = this.container?.querySelector('#course-search');
        const keyword = searchInput?.value || '';
        this.state.keyword = keyword;  // 直接更新状态，不触发重新渲染
        await this.loadData();
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
                        <div class="search-group">
                            <input type="text" class="form-input" id="course-search" placeholder="搜索课程..." value="${keyword}">
                            <button class="btn btn-primary" id="btn-search-course">
                                <i class="ri-search-line"></i> 搜索
                            </button>
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

        // 处理视频URL - 如果有视频则使用流式API
        const videoUrl = currentChapter.video_url
            ? `/api/v1/course/video/${currentChapter.id}/stream?token=${Store.get('token')}`
            : null;

        // 获取保存的视频播放进度
        const savedVideoProgress = localStorage.getItem(`videoProgress_${currentChapter.id}`);
        const savedProgressTime = savedVideoProgress ? parseInt(savedVideoProgress) : 0;

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
                    ${videoUrl ? `
                        <div class="video-player-container">
                            <div class="video-player">
                                <div class="video-loading" id="video-loading">
                                    <i class="ri-loader-4-line"></i>
                                    <span>视频加载中...</span>
                                </div>
                                <video id="course-video" controls preload="metadata" 
                                       data-chapter-id="${currentChapter.id}"
                                       data-saved-progress="${savedProgressTime}"
                                       poster="">
                                    <source src="${videoUrl}" type="video/mp4">
                                    您的浏览器不支持视频播放
                                </video>
                            </div>
                            ${savedProgressTime > 10 ? `
                                <div class="video-progress-tip" id="video-progress-tip">
                                    <span>
                                        <i class="ri-history-line"></i>
                                        上次观看到 ${this.formatVideoTime(savedProgressTime)}
                                    </span>
                                    <button class="btn-jump" id="btn-jump-progress">跳转继续</button>
                                </div>
                            ` : ''}
                            <div class="video-controls">
                                <div class="video-info">
                                    <i class="ri-video-line"></i>
                                    <span>视频课程</span>
                                    ${currentChapter.duration_minutes > 0 ? `
                                        <span class="video-duration">
                                            <i class="ri-time-line"></i> 
                                            ${currentChapter.duration_minutes} 分钟
                                        </span>
                                    ` : ''}
                                </div>
                                <div class="video-speed">
                                    <span>播放速度:</span>
                                    <select id="video-speed-select">
                                        <option value="0.5">0.5x</option>
                                        <option value="0.75">0.75x</option>
                                        <option value="1" selected>1x</option>
                                        <option value="1.25">1.25x</option>
                                        <option value="1.5">1.5x</option>
                                        <option value="2">2x</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="chapter-content markdown-body">
                        ${currentChapter.content ? this.renderMarkdown(currentChapter.content) : (videoUrl ? '' : '<p>本章节暂无文字内容</p>')}
                    </div>
                </div>

                <div class="learn-footer">
                    <button class="btn btn-primary ${currentChapter.is_completed ? 'completed' : ''}" 
                            id="btn-complete-chapter" 
                            data-chapter-id="${currentChapter.id}">
                        <i class="ri-checkbox-circle-line"></i> ${currentChapter.is_completed ? '已完成学习' : '完成本章'}
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

    formatVideoTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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

        // 注意：不在 input 事件中更新状态，避免触发重新渲染
        // 搜索关键词在 handleSearch 时直接从输入框读取

        // 搜索按钮点击
        this.delegate('click', '#btn-search-course', () => {
            this.handleSearch();
        });

        // 搜索输入框回车键触发搜索
        this.delegate('keydown', '#course-search', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSearch();
            }
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
        const modal = new Modal({
            title: '添加章节',
            width: '550px',
            content: `
                <form id="add-chapter-form">
                    <div class="form-group">
                        <label>章节标题 *</label>
                        <input type="text" class="form-input" name="title" required placeholder="请输入章节标题">
                    </div>
                    <div class="form-group">
                        <label>章节内容（支持 Markdown）</label>
                        <textarea class="form-input" name="content" rows="5" placeholder="请输入章节内容，支持 Markdown 语法"></textarea>
                    </div>
                    
                    <!-- 视频上传区域 -->
                    <div class="form-group">
                        <label>章节视频</label>
                        <div class="video-upload-area" id="add-video-upload-area">
                            <div class="video-upload-placeholder" id="add-video-placeholder">
                                <i class="ri-upload-cloud-line"></i>
                                <span>点击或拖拽上传视频</span>
                                <small>支持 MP4、WebM、MOV 等格式，最大 500MB</small>
                            </div>
                            <input type="file" id="add-video-file-input" accept="video/*" style="display: none;">
                        </div>
                        <div class="upload-progress" id="add-upload-progress" style="display: none;">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" id="add-progress-fill" style="width: 0%"></div>
                            </div>
                            <span id="add-progress-text">上传中...</span>
                        </div>
                        <div class="video-selected" id="add-video-selected" style="display: none;">
                            <i class="ri-video-fill"></i>
                            <span id="add-video-filename">已选择视频</span>
                            <button type="button" class="btn btn-sm btn-secondary" id="add-video-remove">
                                <i class="ri-close-line"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>时长（分钟）</label>
                        <input type="number" class="form-input" name="duration_minutes" value="10" min="0">
                    </div>
                </form>
            `,
            confirmText: '添加章节',
            onConfirm: async () => {
                const form = document.getElementById('add-chapter-form');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    content: form.content.value.trim(),
                    duration_minutes: parseInt(form.duration_minutes.value) || 0
                };

                try {
                    // 1. 先创建章节
                    const res = await Api.post(`/course/${courseId}/chapters`, data);
                    const newChapterId = res.data?.id;

                    // 2. 如果有选择视频文件，则上传视频
                    const videoFile = this._pendingVideoFile;
                    if (videoFile && newChapterId) {
                        Toast.info('正在上传视频...');
                        const formData = new FormData();
                        formData.append('file', videoFile);

                        try {
                            await fetch(`/api/v1/course/chapters/${newChapterId}/video`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${Store.get('token')}`
                                },
                                body: formData
                            });
                            Toast.success('章节和视频添加成功！');
                        } catch (uploadErr) {
                            Toast.warning('章节已创建，但视频上传失败，请在编辑中重新上传');
                        }
                    } else {
                        Toast.success('章节添加成功');
                    }

                    this._pendingVideoFile = null;
                    Modal.closeAll();
                    this.showManageChaptersModal(courseId);
                    return true;
                } catch (e) {
                    Toast.error('添加失败');
                    return false;
                }
            }
        });

        modal.show();
        this._pendingVideoFile = null;

        // 绑定视频上传事件
        setTimeout(() => {
            const fileInput = document.getElementById('add-video-file-input');
            const placeholder = document.getElementById('add-video-placeholder');
            const uploadArea = document.getElementById('add-video-upload-area');
            const selectedDiv = document.getElementById('add-video-selected');
            const filenameSpan = document.getElementById('add-video-filename');
            const removeBtn = document.getElementById('add-video-remove');

            // 点击上传
            if (placeholder) {
                placeholder.addEventListener('click', () => fileInput.click());
            }

            // 拖拽上传
            if (uploadArea) {
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadArea.classList.add('drag-over');
                });
                uploadArea.addEventListener('dragleave', () => {
                    uploadArea.classList.remove('drag-over');
                });
                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadArea.classList.remove('drag-over');
                    const files = e.dataTransfer.files;
                    if (files.length > 0 && files[0].type.startsWith('video/')) {
                        selectVideo(files[0]);
                    }
                });
            }

            // 文件选择
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        selectVideo(e.target.files[0]);
                    }
                });
            }

            // 选择视频函数
            const selectVideo = (file) => {
                if (file.size > 500 * 1024 * 1024) {
                    Toast.error('视频文件过大，最大支持 500MB');
                    return;
                }
                this._pendingVideoFile = file;
                placeholder.style.display = 'none';
                selectedDiv.style.display = 'flex';
                filenameSpan.textContent = file.name;
            };

            // 移除视频
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this._pendingVideoFile = null;
                    placeholder.style.display = 'flex';
                    selectedDiv.style.display = 'none';
                    fileInput.value = '';
                });
            }
        }, 100);
    }

    async showEditChapterModal(chapterId, courseId) {
        try {
            const res = await Api.get(`/course/chapters/${chapterId}`);
            const chapter = res.data;
            const hasVideo = !!chapter.video_url;

            const modal = new Modal({
                title: '编辑章节',
                width: '600px',
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
                        
                        <!-- 视频上传区域 -->
                        <div class="form-group">
                            <label>章节视频</label>
                            <div class="video-upload-area" id="video-upload-area">
                                ${hasVideo ? `
                                    <div class="video-exists">
                                        <i class="ri-video-fill"></i>
                                        <span>已上传视频</span>
                                        <button type="button" class="btn btn-sm btn-secondary" id="btn-preview-video">
                                            <i class="ri-play-circle-line"></i> 预览
                                        </button>
                                        <button type="button" class="btn btn-sm btn-danger" id="btn-delete-video">
                                            <i class="ri-delete-bin-line"></i> 删除
                                        </button>
                                    </div>
                                ` : `
                                    <div class="video-upload-placeholder" id="video-placeholder">
                                        <i class="ri-upload-cloud-line"></i>
                                        <span>点击或拖拽上传视频</span>
                                        <small>支持 MP4、WebM、MOV 等格式，最大 500MB</small>
                                    </div>
                                `}
                                <input type="file" id="video-file-input" accept="video/*" style="display: none;">
                            </div>
                            <div class="upload-progress" id="upload-progress" style="display: none;">
                                <div class="progress-bar-bg">
                                    <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
                                </div>
                                <span id="progress-text">上传中...</span>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>时长（分钟）</label>
                                <input type="number" class="form-input" name="duration_minutes" value="${chapter.duration_minutes}" min="0">
                            </div>
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
            });

            modal.show();

            // 绑定视频上传事件
            setTimeout(() => {
                const fileInput = document.getElementById('video-file-input');
                const placeholder = document.getElementById('video-placeholder');
                const uploadArea = document.getElementById('video-upload-area');
                const progressDiv = document.getElementById('upload-progress');
                const progressFill = document.getElementById('progress-fill');
                const progressText = document.getElementById('progress-text');

                // 点击上传
                if (placeholder) {
                    placeholder.addEventListener('click', () => fileInput.click());
                }

                // 拖拽上传
                if (uploadArea) {
                    uploadArea.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        uploadArea.classList.add('drag-over');
                    });
                    uploadArea.addEventListener('dragleave', () => {
                        uploadArea.classList.remove('drag-over');
                    });
                    uploadArea.addEventListener('drop', (e) => {
                        e.preventDefault();
                        uploadArea.classList.remove('drag-over');
                        const files = e.dataTransfer.files;
                        if (files.length > 0 && files[0].type.startsWith('video/')) {
                            uploadVideo(files[0]);
                        }
                    });
                }

                // 文件选择
                if (fileInput) {
                    fileInput.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            uploadVideo(e.target.files[0]);
                        }
                    });
                }

                // 上传视频函数
                const uploadVideo = async (file) => {
                    if (file.size > 500 * 1024 * 1024) {
                        Toast.error('视频文件过大，最大支持 500MB');
                        return;
                    }

                    const formData = new FormData();
                    formData.append('file', file);

                    progressDiv.style.display = 'block';
                    progressText.textContent = '上传中...';
                    progressFill.style.width = '0%';

                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `/api/v1/course/chapters/${chapterId}/video`);
                        xhr.setRequestHeader('Authorization', `Bearer ${Store.get('token')}`);

                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const percent = Math.round((e.loaded / e.total) * 100);
                                progressFill.style.width = percent + '%';
                                progressText.textContent = `上传中 ${percent}%`;
                            }
                        };

                        xhr.onload = () => {
                            progressDiv.style.display = 'none';
                            if (xhr.status === 200) {
                                const result = JSON.parse(xhr.responseText);
                                if (result.code === 0) {
                                    Toast.success('视频上传成功');
                                    // 刷新模态框
                                    Modal.closeAll();
                                    this.showEditChapterModal(chapterId, courseId);
                                } else {
                                    Toast.error(result.message || '上传失败');
                                }
                            } else {
                                Toast.error('上传失败');
                            }
                        };

                        xhr.onerror = () => {
                            progressDiv.style.display = 'none';
                            Toast.error('上传失败，请检查网络');
                        };

                        xhr.send(formData);
                    } catch (e) {
                        progressDiv.style.display = 'none';
                        Toast.error('上传失败: ' + e.message);
                    }
                };

                // 删除视频
                const deleteBtn = document.getElementById('btn-delete-video');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async () => {
                        if (!await Modal.confirm('确认删除', '确定要删除该章节的视频吗？')) return;

                        try {
                            await Api.delete(`/course/chapters/${chapterId}/video`);
                            Toast.success('视频已删除');
                            Modal.closeAll();
                            this.showEditChapterModal(chapterId, courseId);
                        } catch (e) {
                            Toast.error('删除失败');
                        }
                    });
                }

                // 预览视频
                const previewBtn = document.getElementById('btn-preview-video');
                if (previewBtn) {
                    previewBtn.addEventListener('click', () => {
                        const videoUrl = `/api/v1/course/video/${chapterId}/stream?token=${Store.get('token')}`;
                        new Modal({
                            title: '视频预览',
                            width: '800px',
                            content: `
                                <video controls style="width: 100%; max-height: 450px;" autoplay>
                                    <source src="${videoUrl}" type="video/mp4">
                                </video>
                            `,
                            showCancel: false,
                            confirmText: '关闭'
                        }).show();
                    });
                }
            }, 100);
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

        // 绑定视频播放器事件
        this.initVideoPlayer();
    }

    // 初始化视频播放器
    initVideoPlayer() {
        const video = this.container.querySelector('#course-video');
        if (!video || video._eventsInitialized) return;
        video._eventsInitialized = true;

        const chapterId = video.dataset.chapterId;
        const savedProgress = parseInt(video.dataset.savedProgress) || 0;
        const loadingEl = this.container.querySelector('#video-loading');
        const progressTipEl = this.container.querySelector('#video-progress-tip');
        const speedSelect = this.container.querySelector('#video-speed-select');
        const jumpBtn = this.container.querySelector('#btn-jump-progress');

        // 恢复上次的播放速度
        const savedSpeed = localStorage.getItem('videoPlaybackSpeed') || '1';
        if (speedSelect) {
            speedSelect.value = savedSpeed;
            video.playbackRate = parseFloat(savedSpeed);
        }

        // 视频加载事件
        video.addEventListener('loadeddata', () => {
            if (loadingEl) loadingEl.style.display = 'none';
        });

        video.addEventListener('waiting', () => {
            if (loadingEl) loadingEl.style.display = 'flex';
        });

        video.addEventListener('playing', () => {
            if (loadingEl) loadingEl.style.display = 'none';
        });

        video.addEventListener('canplay', () => {
            if (loadingEl) loadingEl.style.display = 'none';
        });

        video.addEventListener('error', () => {
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <i class="ri-error-warning-line" style="animation: none;"></i>
                    <span>视频加载失败</span>
                `;
            }
        });

        // 播放速度控制
        if (speedSelect) {
            speedSelect.addEventListener('change', (e) => {
                const speed = parseFloat(e.target.value);
                video.playbackRate = speed;
                localStorage.setItem('videoPlaybackSpeed', speed.toString());
            });
        }

        // 跳转到上次进度
        if (jumpBtn && savedProgress > 0) {
            jumpBtn.addEventListener('click', () => {
                video.currentTime = savedProgress;
                video.play();
                if (progressTipEl) {
                    progressTipEl.style.display = 'none';
                }
            });
        }

        // 自动保存播放进度（每5秒保存一次）
        let lastSaveTime = 0;
        video.addEventListener('timeupdate', () => {
            const currentTime = Math.floor(video.currentTime);
            // 每5秒保存一次，避免频繁写入
            if (currentTime - lastSaveTime >= 5) {
                lastSaveTime = currentTime;
                localStorage.setItem(`videoProgress_${chapterId}`, currentTime.toString());
            }
        });

        // 视频暂停时保存进度
        video.addEventListener('pause', () => {
            const currentTime = Math.floor(video.currentTime);
            localStorage.setItem(`videoProgress_${chapterId}`, currentTime.toString());
        });

        // 视频播放结束处理
        video.addEventListener('ended', async () => {
            // 清除保存的进度（视频已看完）
            localStorage.removeItem(`videoProgress_${chapterId}`);

            // 自动标记章节完成
            const completeBtn = this.container.querySelector('#btn-complete-chapter');
            if (completeBtn && !completeBtn.classList.contains('completed')) {
                try {
                    await Api.post('/course/learning/progress', {
                        chapter_id: parseInt(chapterId),
                        is_completed: true,
                        progress_seconds: Math.floor(video.duration || 0)
                    });

                    Toast.success('🎉 视频学习完成！');

                    // 更新按钮状态
                    completeBtn.classList.add('completed');
                    completeBtn.innerHTML = '<i class="ri-checkbox-circle-line"></i> 已完成学习';

                    // 刷新课程详情获取最新进度
                    const { currentCourse } = this.state;
                    if (currentCourse) {
                        const res = await Api.get(`/course/${currentCourse.id}`);
                        this.setState({ currentCourse: res.data }, false);
                    }
                } catch (e) {
                    console.error('自动标记完成失败:', e);
                }
            }
        });

        // 全屏变化事件
        video.addEventListener('fullscreenchange', () => {
            // 全屏时可以做一些特殊处理
        });

        // 键盘快捷键
        const handleKeydown = (e) => {
            if (document.activeElement === video ||
                this.container.querySelector('.learn-view')?.contains(document.activeElement)) {
                switch (e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        video.currentTime = Math.max(0, video.currentTime - 5);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        video.currentTime = Math.min(video.duration, video.currentTime + 5);
                        break;
                    case ' ':
                        if (document.activeElement === video ||
                            !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                            e.preventDefault();
                            if (video.paused) {
                                video.play();
                            } else {
                                video.pause();
                            }
                        }
                        break;
                }
            }
        };

        document.addEventListener('keydown', handleKeydown);

        // 保存清理函数
        video._cleanup = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    }
}

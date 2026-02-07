/**
 * 日程管理页面组件
 * 支持日历视图、日程列表和提醒管理
 */

class SchedulePage extends Component {
    constructor(container) {
        super(container);

        const today = new Date();
        this.state = {
            view: 'calendar', // 日历, 列表, 提醒
            currentYear: today.getFullYear(),
            currentMonth: today.getMonth() + 1,
            events: [],
            eventDates: [],
            todayEvents: [],
            upcomingEvents: [],
            reminders: [],
            stats: null,
            selectedDate: null,
            selectedEvent: null,
            loading: true,
            // 新增状态
            _eventsBound: false, // 防止事件重复绑定
            searchQuery: '',      // 搜索关键词
            categories: [],       // 用户分类
            selectedCategory: '', // 选中的分类筛选
            filteredEvents: []    // 筛选后的日程
        };
    }

    async loadData() {
        this.setState({ loading: true });
        try {
            const { view, currentYear, currentMonth } = this.state;

            // 始终加载分类数据
            const categoriesRes = await Api.get('/schedule/categories').catch(() => ({ data: [] }));

            if (view === 'calendar') {
                // 缓存键
                const cacheKey = `${currentYear}-${currentMonth}`;

                // 检查缓存（5分钟有效期）
                if (!this._monthCache) this._monthCache = {};
                const cached = this._monthCache[cacheKey];
                const now = Date.now();

                let monthData;
                if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
                    // 使用缓存数据
                    monthData = cached.data;
                } else {
                    // 请求新数据并缓存
                    const monthRes = await Api.get(`/schedule/events/month?year=${currentYear}&month=${currentMonth}`);
                    monthData = monthRes.data;
                    this._monthCache[cacheKey] = { data: monthData, timestamp: now };
                }

                const statsRes = await Api.get('/schedule/stats');
                this.setState({
                    events: monthData?.events || [],
                    eventDates: monthData?.event_dates || [],
                    stats: statsRes.data || {},
                    categories: categoriesRes.data || [],
                    loading: false
                });
            } else if (view === 'list') {
                const [todayRes, upcomingRes, statsRes] = await Promise.all([
                    Api.get('/schedule/events/today'),
                    Api.get('/schedule/events/upcoming?days=7'),
                    Api.get('/schedule/stats')
                ]);
                this.setState({
                    todayEvents: todayRes.data || [],
                    upcomingEvents: upcomingRes.data || [],
                    stats: statsRes.data || {},
                    categories: categoriesRes.data || [],
                    loading: false
                });
            } else if (view === 'reminders') {
                const res = await Api.get('/schedule/reminders');
                this.setState({
                    reminders: res.data || [],
                    categories: categoriesRes.data || [],
                    loading: false
                });
            }
        } catch (e) {
            Toast.error('加载数据失败');
            this.setState({ loading: false });
        }
    }

    render() {
        const { view, loading, searchQuery, categories, selectedCategory } = this.state;

        return `
            <div class="schedule-page">
                <!-- 侧边栏 -->
                <aside class="schedule-sidebar">
                    <div class="sidebar-header">
                        <div class="header-title">
                            <i class="ri-calendar-schedule-line"></i>
                            <span>日程管理</span>
                        </div>
                        <div class="header-actions">
                            ${window.ModuleHelp ? ModuleHelp.createHelpButton('schedule', '日程管理') : ''}
                        </div>
                    </div>
                    
                    <div class="sidebar-search">
                        <div class="search-group">
                            <input type="text" class="form-input" id="schedule-search" placeholder="搜索日程..." value="${Utils.escapeHtml(searchQuery)}">
                            <button class="btn btn-primary btn-sm" id="btn-search-schedule">
                                <i class="ri-search-line"></i>
                            </button>
                        </div>
                    </div>
                    
                    <nav class="sidebar-nav">
                        <div class="nav-item ${view === 'calendar' ? 'active' : ''}" data-view="calendar">
                            <i class="ri-calendar-2-line"></i>
                            <span>日历视图</span>
                        </div>
                        <div class="nav-item ${view === 'list' ? 'active' : ''}" data-view="list">
                            <i class="ri-list-check-2"></i>
                            <span>我的日程</span>
                        </div>
                        <div class="nav-item ${view === 'reminders' ? 'active' : ''}" data-view="reminders">
                            <i class="ri-notification-3-line"></i>
                            <span>提醒中心</span>
                        </div>
                    </nav>
                    
                    <!-- 分类筛选 -->
                    ${categories.length > 0 ? `
                        <div class="sidebar-categories">
                            <div class="category-header">
                                <span>我的分类</span>
                                <button class="btn-icon-sm" id="btn-manage-categories" title="管理分类">
                                    <i class="ri-settings-3-line"></i>
                                </button>
                            </div>
                            <div class="category-list">
                                <div class="category-item ${!selectedCategory ? 'active' : ''}" data-category="">
                                    <span class="category-color" style="background: var(--accent-color)"></span>
                                    <span>全部</span>
                                </div>
                                ${categories.map(c => `
                                    <div class="category-item ${selectedCategory === c.id.toString() ? 'active' : ''}" data-category="${c.id}">
                                        <span class="category-color" style="background: ${c.color}"></span>
                                        <span>${Utils.escapeHtml(c.name)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- 快捷操作 -->
                    <div class="sidebar-actions">
                        <button class="btn btn-primary btn-block" id="btn-add-event">
                            <i class="ri-add-line"></i> 新建日程
                        </button>
                    </div>
                </aside>

                <!-- 主内容区 -->
                <main class="schedule-main">
                    ${loading ? this.renderLoading() : this.renderContent()}
                </main>
            </div>
        `;
    }

    renderLoading() {
        return `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>加载中...</p>
            </div>
        `;
    }

    renderContent() {
        const { view } = this.state;

        switch (view) {
            case 'calendar': return this.renderCalendar();
            case 'list': return this.renderList();
            case 'reminders': return this.renderReminders();
            case 'search': return this.renderSearchResults();
            default: return this.renderCalendar();
        }
    }

    renderCalendar() {
        const { currentYear, currentMonth, events, eventDates, stats, selectedDate } = this.state;

        const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
            '七月', '八月', '九月', '十月', '十一月', '十二月'];
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

        // 生成日历网格
        const firstDay = new Date(currentYear, currentMonth - 1, 1);
        const lastDay = new Date(currentYear, currentMonth, 0);
        const startWeekDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        let calendarDays = [];

        // 上月填充
        const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
        for (let i = startWeekDay - 1; i >= 0; i--) {
            calendarDays.push({ day: prevMonthLastDay - i, isOtherMonth: true });
        }

        // 本月
        for (let i = 1; i <= totalDays; i++) {
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            // 计算当天的事件数量
            const dayEvents = events.filter(e =>
                e.start_date === dateStr ||
                (e.start_date <= dateStr && e.end_date >= dateStr)
            );
            calendarDays.push({
                day: i,
                isToday: dateStr === todayStr,
                isSelected: dateStr === selectedDate,
                hasEvent: dayEvents.length > 0,
                eventCount: dayEvents.length,
                dateStr: dateStr
            });
        }

        // 下月填充
        const remainingDays = 42 - calendarDays.length;
        for (let i = 1; i <= remainingDays; i++) {
            calendarDays.push({ day: i, isOtherMonth: true });
        }

        // 获取选中日期的日程
        const selectedEvents = selectedDate
            ? events.filter(e => e.start_date === selectedDate || (e.start_date <= selectedDate && e.end_date >= selectedDate))
            : [];

        return `
            <div class="content-section fade-in">
                <!-- 顶部统计卡片 -->
                <div class="stats-mini">
                    <div class="stat-item">
                        <span class="stat-num">${stats?.today_events || 0}</span>
                        <span class="stat-text">今日</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-num">${stats?.upcoming_events || 0}</span>
                        <span class="stat-text">本周</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-num">${stats?.overdue_events || 0}</span>
                        <span class="stat-text">逾期</span>
                    </div>
                </div>

                <!-- 双栏布局：日历 + 日程详情 -->
                <div class="calendar-layout">
                    <!-- 左侧：日历 -->
                    <div class="calendar-container">
                        <div class="calendar-header">
                            <button class="btn-nav" id="btn-prev-month"><i class="ri-arrow-left-s-line"></i></button>
                            <h2>${currentYear}年 ${monthNames[currentMonth - 1]}</h2>
                            <button class="btn-nav" id="btn-next-month"><i class="ri-arrow-right-s-line"></i></button>
                            <button class="btn-today" id="btn-goto-today">今天</button>
                        </div>

                        <div class="calendar-weekdays">
                            ${weekDays.map(d => `<div class="weekday">${d}</div>`).join('')}
                        </div>

                        <div class="calendar-grid">
                            ${calendarDays.map(d => `
                                <div class="calendar-day ${d.isOtherMonth ? 'other-month' : ''} ${d.isToday ? 'today' : ''} ${d.isSelected ? 'selected' : ''} ${d.hasEvent ? 'has-event' : ''}"
                                     ${d.dateStr ? `data-date="${d.dateStr}"` : ''}>
                                    <span class="day-num">${d.day}</span>
                                    ${d.eventCount > 0 ? `<span class="event-badge">${d.eventCount > 9 ? '9+' : d.eventCount}</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 右侧：日程详情 -->
                    <div class="day-events-panel">
                        <h3><i class="ri-calendar-event-line"></i> ${selectedDate ? selectedDate : '选择日期查看日程'}</h3>
                        ${selectedDate ? `
                            ${selectedEvents.length > 0 ? `
                                <div class="event-list">
                                    ${selectedEvents.map(e => this.renderEventItem(e)).join('')}
                                </div>
                            ` : `
                                <div class="empty-hint">
                                    <i class="ri-calendar-line"></i>
                                    <p>这一天没有日程</p>
                                    <button class="btn btn-sm btn-primary" data-add-date="${selectedDate}">添加日程</button>
                                </div>
                            `}
                        ` : `
                            <div class="empty-hint">
                                <i class="ri-cursor-line"></i>
                                <p>点击日历选择日期</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    renderList() {
        const { todayEvents, upcomingEvents, stats } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <h2>我的日程</h2>
                </div>

                <!-- 统计卡片 -->
                <div class="stats-row">
                    <div class="stat-card today">
                        <div class="stat-icon"><i class="ri-calendar-check-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.today_events || 0}</span>
                            <span class="stat-label">今日日程</span>
                        </div>
                    </div>
                    <div class="stat-card upcoming">
                        <div class="stat-icon"><i class="ri-calendar-todo-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.upcoming_events || 0}</span>
                            <span class="stat-label">本周待办</span>
                        </div>
                    </div>
                    <div class="stat-card completed">
                        <div class="stat-icon"><i class="ri-checkbox-circle-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.completed_events || 0}</span>
                            <span class="stat-label">已完成</span>
                        </div>
                    </div>
                    <div class="stat-card overdue">
                        <div class="stat-icon"><i class="ri-error-warning-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-value">${stats?.overdue_events || 0}</span>
                            <span class="stat-label">已逾期</span>
                        </div>
                    </div>
                </div>

                <!-- 今日日程 -->
                <div class="event-section">
                    <h3><i class="ri-sun-line"></i> 今日日程</h3>
                    ${todayEvents.length > 0 ? `
                        <div class="event-list">
                            ${todayEvents.map(e => this.renderEventItem(e)).join('')}
                        </div>
                    ` : `
                        <div class="empty-hint">
                            <p>今天没有安排</p>
                        </div>
                    `}
                </div>

                <!-- 近期日程 -->
                <div class="event-section">
                    <h3><i class="ri-calendar-line"></i> 未来7天</h3>
                    ${upcomingEvents.length > 0 ? `
                        <div class="event-list">
                            ${upcomingEvents.map(e => this.renderEventItem(e)).join('')}
                        </div>
                    ` : `
                        <div class="empty-hint">
                            <p>近期没有安排</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderEventItem(event) {
        const typeColors = {
            'meeting': '#3b82f6',
            'task': '#22c55e',
            'reminder': '#f59e0b',
            'birthday': '#ec4899',
            'holiday': '#8b5cf6',
            'other': '#6b7280'
        };
        const color = event.color || typeColors[event.event_type] || typeColors.other;

        const typeLabels = {
            'meeting': '会议',
            'task': '任务',
            'reminder': '提醒',
            'birthday': '生日',
            'holiday': '节假日',
            'other': '其他'
        };

        return `
            <div class="event-item ${event.is_completed ? 'completed' : ''}" 
                 data-event-id="${event.id}"
                 style="--event-color: ${color}">
                <div class="event-color-bar"></div>
                <div class="event-content">
                    <div class="event-header">
                        <span class="event-title">${Utils.escapeHtml(event.title)}</span>
                        <span class="event-type">${typeLabels[event.event_type] || '其他'}</span>
                    </div>
                    <div class="event-meta">
                        ${event.is_all_day ? `
                            <span><i class="ri-time-line"></i> 全天</span>
                        ` : event.start_time ? `
                            <span><i class="ri-time-line"></i> ${event.start_time}</span>
                        ` : ''}
                        ${event.location ? `
                            <span><i class="ri-map-pin-line"></i> ${Utils.escapeHtml(event.location)}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="event-actions">
                    ${!event.is_completed ? `
                        <button class="btn-icon" data-complete-event="${event.id}" title="完成">
                            <i class="ri-checkbox-circle-line"></i>
                        </button>
                    ` : ''}
                    <button class="btn-icon" data-edit-event="${event.id}" title="编辑">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="btn-icon danger" data-delete-event="${event.id}" title="删除">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderReminders() {
        const { reminders } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <h2>提醒中心</h2>
                </div>

                <div class="reminder-list">
                    ${reminders.length > 0 ? reminders.map(item => `
                        <div class="reminder-item">
                            <div class="reminder-icon">
                                <i class="ri-notification-3-fill"></i>
                            </div>
                            <div class="reminder-content">
                                <h4>${Utils.escapeHtml(item.event.title)}</h4>
                                <p>提醒时间：${new Date(item.reminder.remind_time).toLocaleString('zh-CN')}</p>
                                <p>日程时间：${item.event.start_date} ${item.event.start_time || '全天'}</p>
                            </div>
                            <div class="reminder-status ${item.reminder.is_sent ? 'sent' : 'pending'}">
                                ${item.reminder.is_sent ? '已提醒' : '待提醒'}
                            </div>
                        </div>
                    `).join('') : `
                        <div class="empty-state">
                            <i class="ri-notification-off-line"></i>
                            <p>暂无提醒</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * 渲染搜索结果
     */
    renderSearchResults() {
        const { filteredEvents, searchQuery } = this.state;

        return `
            <div class="content-section fade-in">
                <div class="section-header">
                    <h2><i class="ri-search-line"></i> 搜索结果</h2>
                    <p class="search-info">找到 ${filteredEvents.length} 条与 "${Utils.escapeHtml(searchQuery)}" 相关的日程</p>
                </div>

                <div class="event-section">
                    ${filteredEvents.length > 0 ? `
                        <div class="event-list">
                            ${filteredEvents.map(e => this.renderEventItem(e)).join('')}
                        </div>
                    ` : `
                        <div class="empty-state">
                            <i class="ri-search-line"></i>
                            <p>未找到匹配的日程</p>
                            <p class="sub-text">尝试使用其他关键词搜索</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    bindEvents() {
        // 防止重复绑定
        if (this.state._eventsBound) return;
        this.state._eventsBound = true;

        // 侧边栏导航
        this.delegate('click', '.nav-item', (e, el) => {
            const view = el.dataset.view;
            this.setState({ view, searchQuery: '' });
            this.loadData();
        });

        // 新建日程
        this.delegate('click', '#btn-add-event', () => {
            this.showEventModal();
        });

        // 搜索功能
        this.delegate('click', '#btn-search-schedule', () => {
            const input = this.container.querySelector('#schedule-search');
            if (input) {
                this.setState({ searchQuery: input.value.trim() });
                this.handleSearch();
            }
        });

        this.delegate('keydown', '#schedule-search', (e) => {
            if (e.key === 'Enter') {
                this.setState({ searchQuery: e.target.value.trim() });
                this.handleSearch();
            }
        });

        // 分类筛选
        this.delegate('click', '.category-item', (e, el) => {
            const categoryId = el.dataset.category;
            this.setState({ selectedCategory: categoryId });
            // 如果有搜索结果，则筛选搜索结果；否则重新加载
            if (this.state.searchQuery) {
                this.handleSearch();
            }
        });

        // 管理分类
        this.delegate('click', '#btn-manage-categories', () => {
            this.showCategoryManager();
        });

        // 上一月
        this.delegate('click', '#btn-prev-month', () => {
            let { currentYear, currentMonth } = this.state;
            currentMonth--;
            if (currentMonth < 1) {
                currentMonth = 12;
                currentYear--;
            }
            this.setState({ currentYear, currentMonth, selectedDate: null });
            this.loadData();
        });

        // 下一月
        this.delegate('click', '#btn-next-month', () => {
            let { currentYear, currentMonth } = this.state;
            currentMonth++;
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear++;
            }
            this.setState({ currentYear, currentMonth, selectedDate: null });
            this.loadData();
        });

        // 回到今天
        this.delegate('click', '#btn-goto-today', () => {
            const today = new Date();
            this.setState({
                currentYear: today.getFullYear(),
                currentMonth: today.getMonth() + 1,
                selectedDate: today.toISOString().split('T')[0]
            });
            this.loadData();
        });

        // 选择日期
        this.delegate('click', '.calendar-day:not(.other-month)', (e, el) => {
            const dateStr = el.dataset.date;
            if (dateStr) {
                this.setState({ selectedDate: dateStr });
            }
        });

        // 从空日期添加日程
        this.delegate('click', '[data-add-date]', (e, el) => {
            const dateStr = el.dataset.addDate;
            this.showEventModal(null, dateStr);
        });

        // 完成日程
        this.delegate('click', '[data-complete-event]', async (e, el) => {
            e.stopPropagation();
            const eventId = el.dataset.completeEvent;
            try {
                await Api.post(`/schedule/events/${eventId}/complete`);
                Toast.success('日程已完成');
                this.loadData();
            } catch (err) {
                Toast.error('操作失败');
            }
        });

        // 编辑日程
        this.delegate('click', '[data-edit-event]', async (e, el) => {
            e.stopPropagation();
            const eventId = el.dataset.editEvent;
            try {
                const res = await Api.get(`/schedule/events/${eventId}`);
                this.showEventModal(res.data);
            } catch (err) {
                Toast.error('加载日程失败');
            }
        });

        // 删除日程
        this.delegate('click', '[data-delete-event]', async (e, el) => {
            e.stopPropagation();
            const eventId = el.dataset.deleteEvent;
            const confirmed = await Modal.confirm('确认删除', '确定要删除这个日程吗？');
            if (confirmed) {
                try {
                    await Api.delete(`/schedule/events/${eventId}`);
                    Toast.success('日程已删除');
                    this.loadData();
                } catch (err) {
                    Toast.error('删除失败');
                }
            }
        });

        // 键盘快捷键支持
        this._keyboardHandler = (e) => {
            // 如果正在输入框中，不触发快捷键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const { view } = this.state;

            switch (e.key) {
                case 'ArrowLeft':
                    // 上一月
                    if (view === 'calendar') {
                        let { currentYear, currentMonth } = this.state;
                        currentMonth--;
                        if (currentMonth < 1) {
                            currentMonth = 12;
                            currentYear--;
                        }
                        this.setState({ currentYear, currentMonth, selectedDate: null });
                        this.loadData();
                    }
                    break;
                case 'ArrowRight':
                    // 下一月
                    if (view === 'calendar') {
                        let { currentYear, currentMonth } = this.state;
                        currentMonth++;
                        if (currentMonth > 12) {
                            currentMonth = 1;
                            currentYear++;
                        }
                        this.setState({ currentYear, currentMonth, selectedDate: null });
                        this.loadData();
                    }
                    break;
                case 'n':
                case 'N':
                    // 新建日程
                    this.showEventModal();
                    break;
                case 't':
                case 'T':
                    // 回到今天
                    if (view === 'calendar') {
                        const today = new Date();
                        this.setState({
                            currentYear: today.getFullYear(),
                            currentMonth: today.getMonth() + 1,
                            selectedDate: today.toISOString().split('T')[0]
                        });
                        this.loadData();
                    }
                    break;
            }
        };
        this.addDocumentEvent('keydown', this._keyboardHandler);
    }

    /**
     * 防抖搜索
     */
    _debounceSearch() {
        if (this._searchTimer) clearTimeout(this._searchTimer);
        this._searchTimer = this.setTimeout(() => {
            this.handleSearch();
        }, 300);
    }

    /**
     * 执行搜索
     */
    async handleSearch() {
        const query = this.state.searchQuery.trim();
        if (!query) {
            this.setState({ filteredEvents: [], view: 'calendar' });
            return;
        }

        try {
            // 使用后端搜索接口
            const res = await Api.get(`/schedule/events/search?q=${encodeURIComponent(query)}`);
            const filtered = res.data || [];

            // 应用分类筛选
            const finalFiltered = this.state.selectedCategory
                ? filtered.filter(e => e.category_id?.toString() === this.state.selectedCategory)
                : filtered;

            this.setState({
                filteredEvents: finalFiltered,
                view: 'search'  // 切换到搜索结果视图
            });

            if (finalFiltered.length === 0) {
                Toast.info('未找到匹配的日程');
            }
        } catch (e) {
            console.error('搜索失败', e);
            Toast.error('搜索失败');
        }
    }

    /**
     * 显示分类管理弹窗
     */
    showCategoryManager() {
        const { categories } = this.state;

        new Modal({
            title: '管理分类',
            width: '500px',
            content: `
                <div class="category-manager">
                    <div class="category-manager-list">
                        ${categories.length > 0 ? categories.map(c => `
                            <div class="category-manager-item" data-id="${c.id}">
                                <span class="category-color" style="background: ${c.color}"></span>
                                <span class="category-name">${Utils.escapeHtml(c.name)}</span>
                                <div class="category-actions">
                                    <button class="btn-icon-sm" data-edit-category="${c.id}" title="编辑">
                                        <i class="ri-edit-line"></i>
                                    </button>
                                    <button class="btn-icon-sm danger" data-delete-category="${c.id}" title="删除">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('') : '<p class="empty-hint">暂无分类，点击下方按钮创建</p>'}
                    </div>
                    <div class="category-add-form">
                        <input type="text" class="form-input" id="new-category-name" placeholder="新分类名称">
                        <input type="color" class="form-input form-color" id="new-category-color" value="#3b82f6">
                        <button class="btn btn-primary" id="btn-add-category">
                            <i class="ri-add-line"></i>
                        </button>
                    </div>
                </div>
            `,
            showFooter: false,
            onMount: (modalEl) => {
                // 添加分类
                modalEl.querySelector('#btn-add-category')?.addEventListener('click', async () => {
                    const name = modalEl.querySelector('#new-category-name').value.trim();
                    const color = modalEl.querySelector('#new-category-color').value;
                    if (!name) {
                        Toast.warning('请输入分类名称');
                        return;
                    }
                    try {
                        await Api.post('/schedule/categories', { name, color });
                        Toast.success('分类创建成功');
                        this.loadData();
                        Modal.closeAll();
                        this.setTimeout(() => this.showCategoryManager(), 300);
                    } catch (e) {
                        Toast.error('创建失败');
                    }
                });

                // 删除分类
                modalEl.querySelectorAll('[data-delete-category]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.dataset.deleteCategory;
                        if (await Modal.confirm('确认删除', '确定要删除这个分类吗？')) {
                            try {
                                await Api.delete(`/schedule/categories/${id}`);
                                Toast.success('分类已删除');
                                this.loadData();
                                Modal.closeAll();
                                this.setTimeout(() => this.showCategoryManager(), 300);
                            } catch (e) {
                                Toast.error('删除失败');
                            }
                        }
                    });
                });
            }
        }).show();
    }

    showEventModal(event = null, defaultDate = null) {
        const isEdit = !!event;
        const today = defaultDate || new Date().toISOString().split('T')[0];

        new Modal({
            title: isEdit ? '编辑日程' : '新建日程',
            content: `
                <form id="event-form">
                    <div class="form-group">
                        <label>标题 *</label>
                        <input type="text" class="form-input" name="title" value="${event?.title || ''}" required placeholder="请输入日程标题">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>开始日期 *</label>
                            <input type="date" class="form-input" name="start_date" value="${event?.start_date || today}" required>
                        </div>
                        <div class="form-group">
                            <label>开始时间</label>
                            <input type="time" class="form-input" name="start_time" value="${event?.start_time || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>结束日期</label>
                            <input type="date" class="form-input" name="end_date" value="${event?.end_date || ''}">
                        </div>
                        <div class="form-group">
                            <label>结束时间</label>
                            <input type="time" class="form-input" name="end_time" value="${event?.end_time || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="is_all_day" ${event?.is_all_day ? 'checked' : ''}>
                            <span>全天事件</span>
                        </label>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>类型</label>
                            <select class="form-select" name="event_type">
                                <option value="other" ${event?.event_type === 'other' ? 'selected' : ''}>其他</option>
                                <option value="meeting" ${event?.event_type === 'meeting' ? 'selected' : ''}>会议</option>
                                <option value="task" ${event?.event_type === 'task' ? 'selected' : ''}>任务</option>
                                <option value="reminder" ${event?.event_type === 'reminder' ? 'selected' : ''}>提醒</option>
                                <option value="birthday" ${event?.event_type === 'birthday' ? 'selected' : ''}>生日</option>
                                <option value="holiday" ${event?.event_type === 'holiday' ? 'selected' : ''}>节假日</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>颜色</label>
                            <input type="color" class="form-input form-color" name="color" value="${event?.color || '#3b82f6'}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>地点</label>
                        <input type="text" class="form-input" name="location" value="${event?.location || ''}" placeholder="可选">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea class="form-input" name="description" rows="2" placeholder="可选">${event?.description || ''}</textarea>
                    </div>
                    
                    <!-- 重复设置 -->
                    <div class="form-row">
                        <div class="form-group">
                            <label>重复</label>
                            <select class="form-select" name="repeat_type" id="repeat-type-select">
                                <option value="none" ${(!event?.repeat_type || event?.repeat_type === 'none') ? 'selected' : ''}>不重复</option>
                                <option value="daily" ${event?.repeat_type === 'daily' ? 'selected' : ''}>每天</option>
                                <option value="weekly" ${event?.repeat_type === 'weekly' ? 'selected' : ''}>每周</option>
                                <option value="monthly" ${event?.repeat_type === 'monthly' ? 'selected' : ''}>每月</option>
                                <option value="yearly" ${event?.repeat_type === 'yearly' ? 'selected' : ''}>每年</option>
                            </select>
                        </div>
                        <div class="form-group" id="repeat-end-group" style="display: ${event?.repeat_type && event?.repeat_type !== 'none' ? 'block' : 'none'}">
                            <label>重复截止</label>
                            <input type="date" class="form-input" name="repeat_end_date" value="${event?.repeat_end_date || ''}">
                        </div>
                    </div>
                    
                    ${!isEdit ? `
                        <div class="form-group">
                            <label>提醒</label>
                            <select class="form-select" name="remind_before_minutes">
                                <option value="">不提醒</option>
                                <option value="0">事件开始时</option>
                                <option value="5">提前5分钟</option>
                                <option value="15" selected>提前15分钟</option>
                                <option value="30">提前30分钟</option>
                                <option value="60">提前1小时</option>
                                <option value="1440">提前1天</option>
                            </select>
                        </div>
                    ` : ''}
                </form>
            `,
            confirmText: isEdit ? '保存' : '创建',
            onMount: () => {
                // 重复类型切换时显示/隐藏截止日期
                const repeatSelect = document.getElementById('repeat-type-select');
                const repeatEndGroup = document.getElementById('repeat-end-group');
                if (repeatSelect && repeatEndGroup) {
                    repeatSelect.addEventListener('change', (e) => {
                        repeatEndGroup.style.display = e.target.value !== 'none' ? 'block' : 'none';
                    });
                }
            },
            onConfirm: async () => {
                const form = document.getElementById('event-form');
                if (!form.reportValidity()) return false;

                const data = {
                    title: form.title.value.trim(),
                    start_date: form.start_date.value,
                    start_time: form.start_time.value || null,
                    end_date: form.end_date.value || null,
                    end_time: form.end_time.value || null,
                    is_all_day: form.is_all_day.checked,
                    event_type: form.event_type.value,
                    color: form.color.value,
                    location: form.location.value.trim() || null,
                    description: form.description.value.trim() || null,
                    repeat_type: form.repeat_type.value,
                    repeat_end_date: form.repeat_end_date?.value || null
                };

                if (!isEdit && form.remind_before_minutes) {
                    const remind = form.remind_before_minutes.value;
                    if (remind !== '') {
                        data.remind_before_minutes = parseInt(remind);
                    }
                }

                try {
                    if (isEdit) {
                        await Api.put(`/schedule/events/${event.id}`, data);
                        Toast.success('日程已更新');
                    } else {
                        await Api.post('/schedule/events', data);
                        Toast.success('日程已创建');
                    }
                    // 清除缓存以刷新数据
                    this._monthCache = {};
                    this.loadData();
                    return true;
                } catch (e) {
                    Toast.error(isEdit ? '更新失败' : '创建失败');
                    return false;
                }
            }
        }).show();
    }

    async afterMount() {
        this.bindEvents();  // 绑定事件
        await this.loadData();
    }

    destroy() {
        super.destroy();
    }
}

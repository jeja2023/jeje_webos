/**
 * 使用帮助页面
 * 提供系统使用指南和常见问题解答
 */

class HelpPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            activeSection: 'getting-started',
            searchQuery: ''
        };
        this.generateHelpSections();
    }

    generateHelpSections() {
        // 只保留系统帮助内容，模块帮助应在各自模块中显示
        this.helpSections = [
            {
                id: 'getting-started',
                title: '快速入门',
                icon: 'ri-rocket-line',
                content: this.getGettingStartedContent()
            },
            {
                id: 'desktop',
                title: '桌面环境',
                icon: 'ri-computer-line',
                content: this.getDesktopContent()
            },
            {
                id: 'user-management',
                title: '用户管理',
                icon: 'ri-group-line',
                content: this.getUserManagementContent()
            },
            {
                id: 'system-settings',
                title: '系统设置',
                icon: 'ri-settings-3-line',
                content: this.getSystemSettingsContent()
            },
            {
                id: 'security',
                title: '安全与权限',
                icon: 'ri-shield-keyhole-line',
                content: this.getSecurityContent()
            },
            {
                id: 'shortcuts',
                title: '快捷键',
                icon: 'ri-keyboard-line',
                content: this.getShortcutsContent()
            },
            {
                id: 'faq',
                title: '常见问题',
                icon: 'ri-question-line',
                content: this.getFAQContent()
            },
            {
                id: 'system-theme',
                title: '系统主题',
                icon: 'ri-palette-line',
                content: this.getSystemThemeContent()
            }
        ];
    }

    getGettingStartedContent() {
        return `
            <h3>欢迎使用 JeJe WebOS</h3>
            <p>JeJe WebOS 是一个基于微内核架构的个人工作平台，提供现代化的桌面操作体验。</p>
            
            <h4><i class="ri-focus-3-line"></i> 核心特性</h4>
            <ul>
                <li><strong>桌面化体验</strong> - 精美的桌面布局，直观易用</li>
                <li><strong>模块化设计</strong> - 按需加载功能模块，灵活扩展</li>
                <li><strong>多任务处理</strong> - 支持应用窗口化运行，数据透镜等特定模块支持多窗口并存</li>
                <li><strong>实时通知</strong> - WebSocket 实时消息推送</li>
                <li><strong>数据安全</strong> - JWT 认证 + 数据加密</li>
            </ul>
            
            <h4><i class="ri-flag-line"></i> 快速开始</h4>
            <ol>
                <li><strong>登录系统</strong> - 使用管理员分配的账号登录</li>
                <li><strong>熟悉桌面</strong> - 底部是 Dock 栏，左上角是开始菜单</li>
                <li><strong>查看状态</strong> - 顶部状态栏显示时间、日期和系统信息</li>
                <li><strong>打开应用</strong> - 点击 Dock 图标或开始菜单项启动应用</li>
            </ol>
            
            <h4><i class="ri-layout-bottom-line"></i> 界面布局</h4>
            <div class="help-layout-diagram">
                <div class="layout-item header">顶部栏 - 系统状态、时间、控制中心</div>
                <div class="layout-row">
                    <div class="layout-item main">桌面区域<br>应用窗口 & 小部件</div>
                </div>
                <div class="layout-item footer">Dock 栏 - 常用应用快捷入口</div>
            </div>
        `;
    }

    getDesktopContent() {
        return `
            <h3>桌面环境</h3>
            <p>登录后您将进入 JeJe WebOS 桌面，这里是您的工作中心。</p>
            
            <h4><i class="ri-computer-line"></i> 桌面组件</h4>
            <ul>
                <li><strong>Dock 栏</strong> - 位于屏幕底部，放置常用应用图标，支持悬停放大效果。</li>
                <li><strong>顶部栏 (Top Bar)</strong> - 显示当前活动应用名称、系统时间以及状态图标。</li>
                <li><strong>开始菜单</strong> - 点击顶部栏或 Dock 最左侧的图标可打开，提供系统的完整功能导航。</li>
                <li><strong>桌面小部件</strong> - 桌面背景显示实时时钟、日期和个性化问候语。</li>
            </ul>
            
            <h4><i class="ri-window-line"></i> 窗口操作</h4>
            <p>应用以窗口形式运行，支持以下操作：</p>
            <ul>
                <li><strong>最小化</strong> - 点击窗口标题栏的黄色按钮，应用将隐藏至后台。</li>
                <li><strong>最大化</strong> - 点击绿色按钮，窗口充满屏幕（或恢复原状）。</li>
                <li><strong>关闭</strong> - 点击红色按钮退出应用，返回桌面。</li>
            </ul>
            
            <h4><i class="ri-lightbulb-line"></i> 提示</h4>
            <ul>
                <li>按 <kbd>Esc</kbd> 键通常可以关闭当前的模态窗口或返回。</li>
                <li>点击桌面空白处可以隐藏某些浮层菜单。</li>
            </ul>
        `;
    }


    getUserManagementContent() {
        return `
            <h3>用户管理</h3>
            <p>管理员可以在此管理系统用户。位于「系统管理」->「用户与权限」。</p>
            
            <h4><i class="ri-user-line"></i> 用户角色</h4>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>角色</th>
                        <th>权限说明</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>admin</strong></td>
                        <td>系统管理员，拥有所有权限</td>
                    </tr>
                    <tr>
                        <td><strong>manager</strong></td>
                        <td>管理员，可管理普通用户和访客</td>
                    </tr>
                    <tr>
                        <td><strong>user</strong></td>
                        <td>普通用户，使用已分配的功能</td>
                    </tr>
                    <tr>
                        <td><strong>guest</strong></td>
                        <td>访客，仅有只读权限</td>
                    </tr>
                </tbody>
            </table>
            
            <h4><i class="ri-tools-line"></i> 用户操作</h4>
            <ul>
                <li><strong>新建用户</strong> - 创建新的系统用户</li>
                <li><strong>编辑用户</strong> - 修改用户信息和角色</li>
                <li><strong>审核用户</strong> - 审批待审核的新注册用户</li>
                <li><strong>禁用/启用</strong> - 控制用户账号状态</li>
            </ul>
            
            <h4><i class="ri-group-line"></i> 用户组</h4>
            <p>用户组定义权限模板，用户可以继承用户组的权限设置。</p>
        `;
    }

    getSystemSettingsContent() {
        return `
            <h3>系统设置</h3>
            <p>管理员可以在此配置系统参数。大多数管理工具现已归类于「系统管理」分组下。</p>
            
            <h4><i class="ri-settings-3-line"></i> 基础设置</h4>
            <p>位于「系统管理」->「系统设置」。</p>
            <ul>
                <li><strong>主题模式</strong> - 切换系统显示风格（日出印象/星夜霓虹）</li>
                <li><strong>安全策略</strong> - 配置密码长度、登录失败锁定等安全参数</li>
                <li><strong>API 限制</strong> - 配置接口访问速率限制</li>
            </ul>
            
            <h4><i class="ri-archive-line"></i> 应用中心</h4>
            <p>位于「系统管理」->「应用中心」，是管理所有应用模块的门户。</p>
            <ul>
                <li><strong>应用管理</strong> - 查看已安装模块，启用或禁用特定功能</li>
                <li><strong>应用市场</strong> - 查看可安装的模块，点击「安装」添加到系统</li>
                <li><strong>开发套件</strong> - 开发者工具，支持创建、删除和离线安装模块</li>
            </ul>
            
            <h4><i class="ri-store-2-line"></i> 应用市场</h4>
            <p>应用市场展示所有可用和已安装的模块。</p>
            <ul>
                <li><strong>可安装应用</strong> - 尚未安装的模块，点击「安装」后可在应用管理中启用</li>
                <li><strong>已安装应用</strong> - 已安装的模块列表，可卸载或跳转管理</li>
            </ul>
            
            <h4><i class="ri-hammer-line"></i> 开发套件</h4>
            <p>为开发者提供的模块管理工具。</p>
            <ul>
                <li><strong>创建应用</strong> - 一键生成模块模板，自动创建后端和前端代码</li>
                <li><strong>离线安装</strong> - 上传 .jwapp 离线包安装第三方模块</li>
                <li><strong>删除应用</strong> - 删除未安装的模块代码和可选的数据库表</li>
            </ul>
            
            <h4><i class="ri-install-line"></i> 离线安装流程</h4>
            <ol>
                <li>在「开发套件」中点击「离线安装」</li>
                <li>选择 .jwapp 或 .zip 格式的离线包</li>
                <li>上传成功后，模块处于"待安装"状态</li>
                <li>进入「应用市场」，找到该模块并点击「安装」</li>
                <li>进入「应用管理」，启用该模块</li>
                <li>刷新页面后即可使用新应用</li>
            </ol>
            
            <h4><i class="ri-save-line"></i> 数据备份</h4>
            <p>位于「系统管理」->「数据备份」。</p>
            <ul>
                <li>创建系统快照备份</li>
                <li>下载备份文件到本地</li>
                <li>从备份恢复数据</li>
            </ul>
            
            <h4><i class="ri-line-chart-line"></i> 系统监控</h4>
            <p>位于「系统管理」->「系统监控」。</p>
            <ul>
                <li>查看服务器 CPU 和内存实时使用率</li>
                <li>监控磁盘空间占用</li>
                <li>查看关键系统进程信息</li>
            </ul>
            
            <h4><i class="ri-file-list-line"></i> 系统日志</h4>
            <p>位于「系统管理」->「系统日志」。</p>
            <ul>
                <li>查看用户操作审计日志</li>
                <li>按时间、模块、动作、级别筛选日志</li>
                <li>追踪系统异常和安全事件</li>
            </ul>
        `;
    }

    getSecurityContent() {
        return `
            <h3>安全与权限</h3>
            <p>了解系统的安全机制和权限管理。</p>
            
            <h4><i class="ri-key-line"></i> 认证机制</h4>
            <ul>
                <li><strong>JWT Token</strong> - 采用 JWT 进行身份认证</li>
                <li><strong>Token 有效期</strong> - 默认 7 天，可配置</li>
                <li><strong>自动轮换</strong> - 密钥定期自动轮换</li>
            </ul>
            
            <h4><i class="ri-shield-line"></i> 安全特性</h4>
            <ul>
                <li><strong>密码加密</strong> - BCrypt 哈希存储</li>
                <li><strong>速率限制</strong> - 防止暴力破解</li>
                <li><strong>CORS 保护</strong> - 跨域请求控制</li>
                <li><strong>XSS 防护</strong> - 输入内容过滤</li>
            </ul>
            
            <h4><i class="ri-shield-key-line"></i> 权限控制</h4>
            <ul>
                <li><strong>角色权限</strong> - 基于角色的访问控制 (RBAC)</li>
                <li><strong>模块权限</strong> - 按模块分配功能权限</li>
                <li><strong>操作权限</strong> - 细粒度的 CRUD 权限</li>
            </ul>
            
            <h4><i class="ri-edit-line"></i> 审计日志</h4>
            <p>系统自动记录用户的操作行为，便于安全审计和问题追溯。</p>
        `;
    }

    getShortcutsContent() {
        return `
            <h3>快捷键</h3>
            <p>使用快捷键可以提高操作效率。</p>
            
            <h4><i class="ri-global-line"></i> 全局快捷键</h4>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>快捷键</th>
                        <th>功能</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>K</kbd></td>
                        <td>打开搜索框</td>
                    </tr>

                    <tr>
                        <td><kbd>Esc</kbd></td>
                        <td>关闭弹窗/对话框</td>
                    </tr>
                </tbody>
            </table>
            
            <h4><i class="ri-edit-line"></i> 编辑器快捷键</h4>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>快捷键</th>
                        <th>功能</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>S</kbd></td>
                        <td>保存</td>
                    </tr>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td>
                        <td>撤销</td>
                    </tr>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td>
                        <td>重做</td>
                    </tr>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>B</kbd></td>
                        <td>加粗文本</td>
                    </tr>
                    <tr>
                        <td><kbd>Ctrl</kbd> + <kbd>I</kbd></td>
                        <td>斜体文本</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    getFAQContent() {
        return `
            <h3>常见问题</h3>
            
            <div class="faq-item">
                <h4>Q: 忘记密码怎么办？</h4>
                <p>A: 请联系系统管理员重置密码，或使用「忘记密码」功能（如已启用）。</p>
            </div>
            
            <div class="faq-item">
                <h4>Q: 为什么某些功能无法访问？</h4>
                <p>A: 可能是以下原因：</p>
                <ul>
                    <li>您的账号没有该功能的访问权限</li>
                    <li>该功能模块已被管理员禁用</li>
                    <li>您的账号已被禁用或过期</li>
                </ul>
            </div>
            
            <div class="faq-item">
                <h4>Q: 如何修改个人信息？</h4>
                <p>A: 点击右上角头像 → 选择「个人中心」即可修改个人资料和密码。</p>
            </div>
            
            <div class="faq-item">
                <h4>Q: 通知消息如何清除？</h4>
                <p>A: 在通知中心可以将消息标记为已读，或点击「全部已读」清除所有未读通知。</p>
            </div>
            
            <div class="faq-item">
                <h4>Q: 系统支持哪些浏览器？</h4>
                <p>A: 推荐使用最新版本的 Chrome、Firefox、Edge 或 Safari 浏览器。不支持 IE 浏览器。</p>
            </div>
            
            <div class="faq-item">
                <h4>Q: 数据会自动保存吗？</h4>
                <p>A: 大部分表单需要手动点击保存按钮。编辑器类功能可能支持自动保存草稿。</p>
            </div>
            
            <div class="faq-item">
                <h4>Q: 如何联系技术支持？</h4>
                <p>A: 请联系您的系统管理员，或发送邮件至技术支持邮箱。</p>
            </div>
        `;
    }

    // 模块帮助内容已移除，各模块应在自己的页面中显示帮助内容

    getSystemThemeContent() {
        return `
            <h3>系统主题指南</h3>
            <p>系统主题让您可以个性化定制系统的外观。点击右上角用户菜单 ->「系统主题」即可访问。</p>
            
            <h4><i class="ri-palette-line"></i> 预设主题</h4>
            <p>系统提供 2 套精心设计的预设主题：</p>
            <ul>
                <li><strong>日出印象</strong> - 温暖的晨曦渐变色调，适合日间使用</li>
                <li><strong>星夜霓虹</strong> - 赛博朋克风格的深蓝霓虹，护眼且沉浸</li>
            </ul>
            
            <h4><i class="ri-lightbulb-line"></i> 使用技巧</h4>
            <ul>
                <li>在右上角的主题选择器中可以快速切换主题</li>
                <li>主题选择会实时应用，无需刷新页面</li>
                <li>主题偏好会保存在浏览器本地，下次访问时自动应用</li>
                <li>也可以通过右上角用户菜单 ->「系统主题」进入主题选择页面</li>
            </ul>
        `;
    }

    // 模块帮助内容已移除，各模块应在自己的页面中显示帮助内容

    setActiveSection(sectionId) {
        this.setState({ activeSection: sectionId });
    }

    handleSearch(query) {
        this.setState({ searchQuery: query.toLowerCase() });
    }

    getFilteredSections() {
        const { searchQuery } = this.state;
        if (!searchQuery) return this.helpSections;

        return this.helpSections.filter(section => {
            return section.title.toLowerCase().includes(searchQuery) ||
                section.content.toLowerCase().includes(searchQuery);
        });
    }

    render() {
        const { activeSection, searchQuery } = this.state;
        const filteredSections = this.getFilteredSections();
        const currentSection = this.helpSections.find(s => s.id === activeSection);

        return `
            <div class="page fade-in help-page">
                <div class="page-header">
                    <h1 class="page-title"><i class="ri-book-open-line"></i> 使用帮助</h1>
                    <p class="page-desc">了解如何使用 JeJe WebOS 的各项功能</p>
                </div>
                
                <div class="help-container">
                    <!-- 侧边导航 -->
                    <div class="help-sidebar">
                        <div class="help-search">
                            <input type="text" 
                                   class="form-input" 
                                   placeholder="搜索帮助内容..." 
                                   value="${Utils.escapeHtml(searchQuery)}"
                                   id="helpSearchInput">
                        </div>
                        <nav class="help-nav">
                            ${filteredSections.map(section => `
                                <a href="javascript:void(0)" 
                                   class="help-nav-item ${activeSection === section.id ? 'active' : ''}"
                                   data-section="${section.id}">
                                    <span class="help-nav-icon"><i class="${section.icon}"></i></span>
                                    <span class="help-nav-title">${section.title}</span>
                                </a>
                            `).join('')}
                        </nav>
                    </div>
                    
                    <!-- 内容区域 -->
                    <div class="help-content">
                        <div class="help-article">
                            ${currentSection ? currentSection.content : '<p>请从左侧选择帮助主题</p>'}
                        </div>
                        
                        <!-- 底部导航 -->
                        <div class="help-footer">
                            ${this.renderNavigation()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderNavigation() {
        const { activeSection } = this.state;
        const currentIndex = this.helpSections.findIndex(s => s.id === activeSection);
        const prevSection = currentIndex > 0 ? this.helpSections[currentIndex - 1] : null;
        const nextSection = currentIndex < this.helpSections.length - 1 ? this.helpSections[currentIndex + 1] : null;

        return `
            <div class="help-nav-buttons">
                ${prevSection ? `
                    <a href="javascript:void(0)" class="help-nav-btn prev" data-section="${prevSection.id}">
                        <span class="nav-arrow">←</span>
                        <span class="nav-text">
                            <span class="nav-label">上一篇</span>
                            <span class="nav-title">${prevSection.title}</span>
                        </span>
                    </a>
                ` : '<div></div>'}
                ${nextSection ? `
                    <a href="javascript:void(0)" class="help-nav-btn next" data-section="${nextSection.id}">
                        <span class="nav-text">
                            <span class="nav-label">下一篇</span>
                            <span class="nav-title">${nextSection.title}</span>
                        </span>
                        <span class="nav-arrow">→</span>
                    </a>
                ` : '<div></div>'}
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
        // 搜索框
        const searchInput = this.container.querySelector('#helpSearchInput');
        if (searchInput && !searchInput._bindedHelp) {
            searchInput._bindedHelp = true;
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // 导航项点击
        this.delegate('click', '.help-nav-item, .help-nav-btn', (e, target) => {
            const sectionId = target.dataset.section;
            if (sectionId) {
                this.setActiveSection(sectionId);
                // 滚动到顶部
                const content = this.container.querySelector('.help-content');
                if (content) content.scrollTop = 0;
            }
        });
    }
    // 模块帮助内容已移除，各模块应在自己的页面中显示帮助内容
}



// 将 HelpPage 导出到全局作用域以支持动态加载
window.HelpPage = HelpPage;
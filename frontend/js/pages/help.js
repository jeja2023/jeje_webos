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
        
        // 帮助内容
        this.helpSections = [
            {
                id: 'getting-started',
                title: '快速入门',
                icon: '🚀',
                content: this.getGettingStartedContent()
            },
            {
                id: 'dashboard',
                title: '仪表盘',
                icon: '📊',
                content: this.getDashboardContent()
            },
            {
                id: 'modules',
                title: '功能模块',
                icon: '📦',
                content: this.getModulesContent()
            },
            {
                id: 'user-management',
                title: '用户管理',
                icon: '👥',
                content: this.getUserManagementContent()
            },
            {
                id: 'system-settings',
                title: '系统设置',
                icon: '⚙️',
                content: this.getSystemSettingsContent()
            },
            {
                id: 'security',
                title: '安全与权限',
                icon: '🔐',
                content: this.getSecurityContent()
            },
            {
                id: 'shortcuts',
                title: '快捷键',
                icon: '⌨️',
                content: this.getShortcutsContent()
            },
            {
                id: 'faq',
                title: '常见问题',
                icon: '❓',
                content: this.getFAQContent()
            }
        ];
    }
    
    getGettingStartedContent() {
        return `
            <h3>欢迎使用 JeJe WebOS</h3>
            <p>JeJe WebOS 是一个基于微内核架构的个人工作平台，提供模块化的功能扩展能力。</p>
            
            <h4>🎯 核心特性</h4>
            <ul>
                <li><strong>模块化设计</strong> - 按需加载功能模块，灵活扩展</li>
                <li><strong>响应式界面</strong> - 适配桌面和移动设备</li>
                <li><strong>权限管理</strong> - 细粒度的用户权限控制</li>
                <li><strong>实时通知</strong> - WebSocket 实时消息推送</li>
                <li><strong>数据安全</strong> - JWT 认证 + 数据加密</li>
            </ul>
            
            <h4>🏁 快速开始</h4>
            <ol>
                <li><strong>登录系统</strong> - 使用管理员分配的账号登录</li>
                <li><strong>熟悉界面</strong> - 左侧是导航菜单，顶部是用户操作区</li>
                <li><strong>查看仪表盘</strong> - 了解系统整体状态</li>
                <li><strong>探索功能</strong> - 根据需要使用各个功能模块</li>
            </ol>
            
            <h4>📱 界面布局</h4>
            <div class="help-layout-diagram">
                <div class="layout-item header">顶部栏 - 搜索、通知、用户菜单</div>
                <div class="layout-row">
                    <div class="layout-item sidebar">侧边栏<br>导航菜单</div>
                    <div class="layout-item main">主内容区<br>功能页面</div>
                </div>
            </div>
        `;
    }
    
    getDashboardContent() {
        return `
            <h3>仪表盘</h3>
            <p>仪表盘是您登录后的首页，展示系统概览和常用入口。</p>
            
            <h4>📈 统计卡片</h4>
            <ul>
                <li><strong>已安装模块</strong> - 当前系统已加载的功能模块数量</li>
                <li><strong>用户总数</strong> - 系统注册用户数（管理员可见）</li>
                <li><strong>系统版本</strong> - 当前系统版本号</li>
            </ul>
            
            <h4>🚪 快捷入口</h4>
            <p>仪表盘提供常用功能的快捷入口，点击即可快速访问对应模块。</p>
            
            <h4>💡 提示</h4>
            <ul>
                <li>普通用户只能看到有权限的模块统计</li>
                <li>管理员可以看到完整的系统统计信息</li>
            </ul>
        `;
    }
    
    getModulesContent() {
        // 动态获取已安装的模块信息
        const modules = Store.get('modules') || [];
        const enabledModules = modules.filter(m => m.enabled && m.visible);
        
        let modulesHtml = `
            <h3>功能模块</h3>
            <p>JeJe WebOS 采用模块化架构，功能以独立模块的形式提供。</p>
            <p><strong>当前已启用 ${enabledModules.length} 个模块</strong></p>
        `;
        
        if (enabledModules.length === 0) {
            modulesHtml += '<p class="help-note">暂无已启用的功能模块。管理员可以在「应用中心」启用模块。</p>';
        } else {
            enabledModules.forEach(module => {
                const icon = module.icon || '📦';
                modulesHtml += `
                    <div class="help-module-card">
                        <h4>${icon} ${module.name || module.id}</h4>
                        ${module.description ? `<p class="module-desc">${module.description}</p>` : ''}
                        <ul class="module-features">
                            <li>模块ID: <code>${module.id}</code></li>
                            <li>版本: <code>${module.version || 'N/A'}</code></li>
                            ${module.router_prefix ? `<li>路由前缀: <code>${module.router_prefix}</code></li>` : ''}
                        </ul>
                    </div>
                `;
            });
        }
        
        modulesHtml += `
            <h4>💡 管理员提示</h4>
            <p>在「应用中心」可以启用或禁用功能模块。模块启用后，具有相应权限的用户即可使用该模块的功能。</p>
        `;
        
        return modulesHtml;
    }
    
    getUserManagementContent() {
        return `
            <h3>用户管理</h3>
            <p>管理员可以在此管理系统用户。</p>
            
            <h4>👤 用户角色</h4>
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
            
            <h4>🔧 用户操作</h4>
            <ul>
                <li><strong>新建用户</strong> - 创建新的系统用户</li>
                <li><strong>编辑用户</strong> - 修改用户信息和角色</li>
                <li><strong>审核用户</strong> - 审批待审核的新注册用户</li>
                <li><strong>禁用/启用</strong> - 控制用户账号状态</li>
            </ul>
            
            <h4>👥 用户组</h4>
            <p>用户组定义权限模板，用户可以继承用户组的权限设置。</p>
        `;
    }
    
    getSystemSettingsContent() {
        return `
            <h3>系统设置</h3>
            <p>管理员可以在此配置系统参数。</p>
            
            <h4>⚙️ 基础设置</h4>
            <ul>
                <li><strong>系统名称</strong> - 自定义系统显示名称</li>
                <li><strong>系统描述</strong> - 系统简介说明</li>
            </ul>
            
            <h4>📦 应用中心</h4>
            <ul>
                <li>查看已安装的功能模块</li>
                <li>启用或禁用模块</li>
                <li>查看模块健康状态</li>
            </ul>
            
            <h4>💾 数据备份</h4>
            <ul>
                <li>创建系统数据备份</li>
                <li>下载备份文件</li>
                <li>恢复历史备份</li>
            </ul>
            
            <h4>📊 系统监控</h4>
            <ul>
                <li>CPU 和内存使用情况</li>
                <li>磁盘空间监控</li>
                <li>进程信息查看</li>
            </ul>
            
            <h4>📋 系统日志</h4>
            <ul>
                <li>查看操作审计日志</li>
                <li>按时间和类型筛选</li>
                <li>导出日志数据</li>
            </ul>
        `;
    }
    
    getSecurityContent() {
        return `
            <h3>安全与权限</h3>
            <p>了解系统的安全机制和权限管理。</p>
            
            <h4>🔑 认证机制</h4>
            <ul>
                <li><strong>JWT Token</strong> - 采用 JWT 进行身份认证</li>
                <li><strong>Token 有效期</strong> - 默认 7 天，可配置</li>
                <li><strong>自动轮换</strong> - 密钥定期自动轮换</li>
            </ul>
            
            <h4>🛡️ 安全特性</h4>
            <ul>
                <li><strong>密码加密</strong> - BCrypt 哈希存储</li>
                <li><strong>速率限制</strong> - 防止暴力破解</li>
                <li><strong>CORS 保护</strong> - 跨域请求控制</li>
                <li><strong>XSS 防护</strong> - 输入内容过滤</li>
            </ul>
            
            <h4>🔐 权限控制</h4>
            <ul>
                <li><strong>角色权限</strong> - 基于角色的访问控制 (RBAC)</li>
                <li><strong>模块权限</strong> - 按模块分配功能权限</li>
                <li><strong>操作权限</strong> - 细粒度的 CRUD 权限</li>
            </ul>
            
            <h4>📝 审计日志</h4>
            <p>系统自动记录用户的操作行为，便于安全审计和问题追溯。</p>
        `;
    }
    
    getShortcutsContent() {
        return `
            <h3>快捷键</h3>
            <p>使用快捷键可以提高操作效率。</p>
            
            <h4>🌐 全局快捷键</h4>
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
                        <td><kbd>Ctrl</kbd> + <kbd>B</kbd></td>
                        <td>折叠/展开侧边栏</td>
                    </tr>
                    <tr>
                        <td><kbd>Esc</kbd></td>
                        <td>关闭弹窗/对话框</td>
                    </tr>
                </tbody>
            </table>
            
            <h4>📝 编辑器快捷键</h4>
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
                    <h1 class="page-title">📖 使用帮助</h1>
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
                                    <span class="help-nav-icon">${section.icon}</span>
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
}


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
        // Core sections
        this.helpSections = [
            {
                id: 'getting-started',
                title: '快速入门',
                icon: '🚀',
                content: this.getGettingStartedContent()
            },
            {
                id: 'desktop',
                title: '桌面环境',
                icon: '🖥️',
                content: this.getDesktopContent()
            },
            {
                id: 'modules',
                title: '功能模块',
                icon: '📦',
                content: this.getModulesContent()
            }
        ];

        // Dynamic module sections - 整合到"功能模块"章节中
        const modules = Store.get('modules') || [];
        const enabledIds = modules.filter(m => m.enabled && m.visible !== false).map(m => m.id);
        this.enabledModuleIds = enabledIds; // 保存供 getModulesContent 使用

        // 公告管理保留为独立章节（属于系统管理类）
        if (enabledIds.includes('announcement')) {
            this.helpSections.push({
                id: 'announcement-help',
                title: '公告管理',
                icon: '📢',
                content: this.getAnnouncementHelpContent()
            });
        }

        // Standard system sections
        this.helpSections.push(
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
        );

        // 添加主题编辑器帮助（属于系统管理类）
        this.helpSections.push({
            id: 'theme-editor',
            title: '主题编辑器',
            icon: '🎨',
            content: this.getThemeEditorContent()
        });
    }

    getGettingStartedContent() {
        return `
            <h3>欢迎使用 JeJe WebOS</h3>
            <p>JeJe WebOS 是一个基于微内核架构的个人工作平台，提供现代化的桌面操作体验。</p>
            
            <h4>🎯 核心特性</h4>
            <ul>
                <li><strong>桌面化体验</strong> - 精美的桌面布局，直观易用</li>
                <li><strong>模块化设计</strong> - 按需加载功能模块，灵活扩展</li>
                <li><strong>多任务处理</strong> - 支持应用窗口化运行（当前版本为单窗口模式）</li>
                <li><strong>实时通知</strong> - WebSocket 实时消息推送</li>
                <li><strong>数据安全</strong> - JWT 认证 + 数据加密</li>
            </ul>
            
            <h4>🏁 快速开始</h4>
            <ol>
                <li><strong>登录系统</strong> - 使用管理员分配的账号登录</li>
                <li><strong>熟悉桌面</strong> - 底部是 Dock 栏，左上角是开始菜单</li>
                <li><strong>查看状态</strong> - 顶部状态栏显示时间、日期和系统信息</li>
                <li><strong>打开应用</strong> - 点击 Dock 图标或开始菜单项启动应用</li>
            </ol>
            
            <h4>📱 界面布局</h4>
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
            
            <h4>🖥️ 桌面组件</h4>
            <ul>
                <li><strong>Dock 栏</strong> - 位于屏幕底部，放置常用应用图标，支持悬停放大效果。</li>
                <li><strong>顶部栏 (Top Bar)</strong> - 显示当前活动应用名称、系统时间以及状态图标。</li>
                <li><strong>开始菜单</strong> - 点击顶部栏或 Dock 最左侧的图标可打开，提供系统的完整功能导航。</li>
                <li><strong>桌面小部件</strong> - 桌面背景显示实时时钟、日期和个性化问候语。</li>
            </ul>
            
            <h4>🪟 窗口操作</h4>
            <p>应用以窗口形式运行，支持以下操作：</p>
            <ul>
                <li><strong>最小化</strong> - 点击窗口标题栏的黄色按钮，应用将隐藏至后台。</li>
                <li><strong>最大化</strong> - 点击绿色按钮，窗口充满屏幕（或恢复原状）。</li>
                <li><strong>关闭</strong> - 点击红色按钮退出应用，返回桌面。</li>
            </ul>
            
            <h4>💡 提示</h4>
            <ul>
                <li>按 <kbd>Esc</kbd> 键通常可以关闭当前的模态窗口或返回。</li>
                <li>点击桌面空白处可以隐藏某些浮层菜单。</li>
            </ul>
        `;
    }

    getModulesContent() {
        // 动态获取已安装的模块信息
        const modules = Store.get('modules') || [];
        const enabledModules = modules.filter(m => m.enabled && m.visible !== false);
        const enabledIds = this.enabledModuleIds || enabledModules.map(m => m.id);

        let modulesHtml = `
            <h3>功能模块</h3>
            <p>JeJe WebOS 采用模块化架构，所有功能均以 App 的形式存在。</p>
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
                        </ul>
                    </div>
                `;
            });
        }

        modulesHtml += `
            <h4>💡 管理员提示</h4>
            <p>在「系统管理」->「应用中心」中可以管理所有功能模块。</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid var(--color-border);">
        `;

        // 添加各模块详细使用指南
        if (enabledIds.includes('notes')) {
            modulesHtml += this.getNotesHelpContent();
            modulesHtml += '<hr style="margin: 30px 0; border: none; border-top: 1px solid var(--color-border);">';
        }

        if (enabledIds.includes('blog') || enabledIds.includes('cms')) {
            modulesHtml += this.getBlogHelpContent();
            modulesHtml += '<hr style="margin: 30px 0; border: none; border-top: 1px solid var(--color-border);">';
        }

        if (enabledIds.includes('feedback')) {
            modulesHtml += this.getFeedbackHelpContent();
            modulesHtml += '<hr style="margin: 30px 0; border: none; border-top: 1px solid var(--color-border);">';
        }

        // 文件管理（内置模块，始终显示）
        modulesHtml += this.getFileManagerContent();
        modulesHtml += '<hr style="margin: 30px 0; border: none; border-top: 1px solid var(--color-border);">';

        if (enabledIds.includes('transfer')) {
            modulesHtml += this.getTransferHelpContent();
        }

        return modulesHtml;
    }

    getUserManagementContent() {
        return `
            <h3>用户管理</h3>
            <p>管理员可以在此管理系统用户。位于「系统管理」->「用户与权限」。</p>
            
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
            <p>管理员可以在此配置系统参数。大多数管理工具现已归类于「系统管理」分组下。</p>
            
            <h4>⚙️ 基础设置</h4>
            <p>位于「系统管理」->「系统设置」。</p>
            <ul>
                <li><strong>主题模式</strong> - 切换系统显示风格（浅色/深色/日出印象/星夜霓虹/仲夏之夜/冬日暖阳/春意盎然/秋日私语）</li>
                <li><strong>安全策略</strong> - 配置密码长度、登录失败锁定等安全参数</li>
                <li><strong>API 限制</strong> - 配置接口访问速率限制</li>
            </ul>
            
            <h4>📦 应用中心</h4>
            <p>位于「系统管理」->「应用中心」，是管理所有应用模块的门户。</p>
            <ul>
                <li><strong>应用管理</strong> - 查看已安装模块，启用或禁用特定功能</li>
                <li><strong>应用市场</strong> - 查看可安装的模块，点击「安装」添加到系统</li>
                <li><strong>开发套件</strong> - 开发者工具，支持创建、删除和离线安装模块</li>
            </ul>
            
            <h4>🏪 应用市场</h4>
            <p>应用市场展示所有可用和已安装的模块。</p>
            <ul>
                <li><strong>可安装应用</strong> - 尚未安装的模块，点击「安装」后可在应用管理中启用</li>
                <li><strong>已安装应用</strong> - 已安装的模块列表，可卸载或跳转管理</li>
            </ul>
            
            <h4>🛠️ 开发套件</h4>
            <p>为开发者提供的模块管理工具。</p>
            <ul>
                <li><strong>创建应用</strong> - 一键生成模块模板，自动创建后端和前端代码</li>
                <li><strong>离线安装</strong> - 上传 .jwapp 离线包安装第三方模块</li>
                <li><strong>删除应用</strong> - 删除未安装的模块代码和可选的数据库表</li>
            </ul>
            
            <h4>📤 离线安装流程</h4>
            <ol>
                <li>在「开发套件」中点击「离线安装」</li>
                <li>选择 .jwapp 或 .zip 格式的离线包</li>
                <li>上传成功后，模块处于"待安装"状态</li>
                <li>进入「应用市场」，找到该模块并点击「安装」</li>
                <li>进入「应用管理」，启用该模块</li>
                <li>刷新页面后即可使用新应用</li>
            </ol>
            
            <h4>💾 数据备份</h4>
            <p>位于「系统管理」->「数据备份」。</p>
            <ul>
                <li>创建系统快照备份</li>
                <li>下载备份文件到本地</li>
                <li>从备份恢复数据</li>
            </ul>
            
            <h4>📊 系统监控</h4>
            <p>位于「系统管理」->「系统监控」。</p>
            <ul>
                <li>查看服务器 CPU 和内存实时使用率</li>
                <li>监控磁盘空间占用</li>
                <li>查看关键系统进程信息</li>
            </ul>
            
            <h4>📋 系统日志</h4>
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

    getNotesHelpContent() {
        return `
            <h3>笔记指南</h3>
            <p>笔记 (Notes) 是一个轻量级的个人笔记应用，支持 Markdown 格式。</p>
            
            <h4>📝 核心功能</h4>
            <ul>
                <li><strong>新建笔记与文件夹</strong> - 位于页面头部右侧的操作按钮，可快速创建内容。</li>
                <li><strong>高效导航</strong> - 左侧边栏集成「所有笔记」、「我的收藏」与「标签管理」，下方显示文件夹目录树。</li>
                <li><strong>Markdown 编辑</strong> - 支持语法高亮与实时预览，支持自动保存。</li>
                <li><strong>文件夹列表</strong> - 支持多级目录整理，通过右键或头部按钮管理文件夹。</li>
            </ul>
        `;
    }

    getBlogHelpContent() {
        return `
            <h3>博客指南</h3>
            <p>博客模块用于发布长篇技术文章或系统公告。</p>
            <ul>
                <li><strong>文章管理</strong> - 支持富文本编辑和封面上传</li>
                <li><strong>分类别</strong> - 自定义文章分类树</li>
                <li><strong>状态流转</strong> - 草稿、已发布、隐藏等状态管理</li>
            </ul>
        `;
    }

    getFeedbackHelpContent() {
        return `
            <h3>反馈指南</h3>
            <p>用户与管理员沟通的桥梁。</p>
            <ul>
                <li><strong>提交反馈</strong> - 用户可提交 Bug 报告或功能建议</li>
                <li><strong>状态追踪</strong> - 查看反馈的处理进度（待处理、处理中、已完成）</li>
                <li><strong>管理员回复</strong> - 管理员可针对反馈进行回复和状态更新</li>
            </ul>
        `;
    }

    getAnnouncementHelpContent() {
        return `
            <h3>公告管理指南</h3>
            <p>发布系统重要通知。</p>
            <ul>
                <li><strong>发布公告</strong> - 支持富文本公告内容</li>
                <li><strong>置顶功能</strong> - 将重要公告置顶显示</li>
                <li><strong>有效期</strong> - 设置公告的过期时间</li>
            </ul>
        `;
    }

    getThemeEditorContent() {
        return `
            <h3>主题编辑器指南</h3>
            <p>主题编辑器让您可以个性化定制系统的外观。位于「系统管理」->「主题编辑器」。</p>
            
            <h4>🎨 预设主题</h4>
            <p>系统提供 8 套精心设计的预设主题：</p>
            <ul>
                <li><strong>浅色模式</strong> - 经典白色背景，适合日间使用</li>
                <li><strong>深色模式</strong> - 深灰黑色背景，护眼且沉浸</li>
                <li><strong>日出印象</strong> - 温暖的晨曦渐变色调</li>
                <li><strong>星夜霓虹</strong> - 赛博朋克风格的深蓝霓虹</li>
                <li><strong>仲夏之夜</strong> - 神秘的星空与萤火虫效果</li>
                <li><strong>冬日暖阳</strong> - 雪景背景配暖橙色强调</li>
                <li><strong>春意盎然</strong> - 柳绿迎春的清新绿色</li>
                <li><strong>秋日私语</strong> - 枫叶金黄的秋季色彩</li>
            </ul>
            
            <h4>🔧 自定义主题</h4>
            <p>选择「自定义」模式后，您可以调整以下颜色变量：</p>
            <ul>
                <li><strong>背景色彩</strong> - 全局背景、主要容器、次要容器、输入框背景、悬停背景</li>
                <li><strong>强调色彩</strong> - 主色调、浅色调、深色调</li>
                <li><strong>文字色彩</strong> - 主要文字、次要文字、提示文字、反色文字</li>
                <li><strong>边框与状态</strong> - 边框颜色、成功/错误/警告状态色</li>
            </ul>
            
            <h4>📤 导入/导出</h4>
            <ul>
                <li><strong>导出配置</strong> - 将当前自定义配置导出为 JSON 文件，方便备份或分享</li>
                <li><strong>导入配置</strong> - 导入之前导出的 JSON 配置文件</li>
                <li><strong>重置默认</strong> - 清除所有自定义配置，恢复默认值</li>
            </ul>
            
            <h4>💡 使用技巧</h4>
            <ul>
                <li>调整颜色时，效果会实时预览在「效果预览」区域</li>
                <li>使用颜色选择器或直接输入 HEX 颜色值（如 #2563eb）</li>
                <li>主题配置保存在浏览器本地，不同设备需要单独配置</li>
                <li>如需在多设备间同步主题，可导出后通过其他方式传输并导入</li>
            </ul>
        `;
    }

    getFileManagerContent() {
        return `
            <h3>文件管理指南</h3>
            <p>文件管理是一个功能完整的云端文件管理工具，让您可以轻松管理个人文件。</p>
            
            <h4>📁 基本功能</h4>
            <ul>
                <li><strong>浏览文件</strong> - 以网格或列表视图浏览文件和文件夹</li>
                <li><strong>存储监控</strong> - 侧边栏实时显示存储配额进度条，颜色提示使用状态（绿/黄/红）</li>
                <li><strong>创建文件夹</strong> - 点击「新建文件夹」按钮创建目录结构</li>
                <li><strong>上传文件</strong> - 点击「上传文件」按钮或直接拖拽文件到窗口中</li>
            </ul>
            
            <h4>🔧 快捷操作</h4>
            <p>系统支持丰富的鼠标操作，提高管理效率：</p>
            <ul>
                <li><strong>右键菜单</strong> - 在文件或文件夹上点击右键，呼出快捷菜单进行操作</li>
                <li><strong>拖拽移动</strong> - 将文件拖拽到文件夹图标或侧边栏树节点上，即可快速移动</li>
                <li><strong>多选操作</strong> - 按住 Ctrl 或 Shift 键点击文件进行多选</li>
            </ul>

            <h4>👀 文件预览</h4>
            <p>支持多种格式文件的在线预览，无需下载：</p>
            <ul>
                <li><strong>媒体文件</strong> - 直接播放图片、音频和视频文件</li>
                <li><strong>文档预览</strong> - 支持 PDF 文档在线阅读</li>
                <li><strong>代码文本</strong> - 支持预览 JSON、XML、JS、PY 等文本/代码文件</li>
                <li><strong>其他格式</strong> - 不支持预览的文件将自动下载</li>
            </ul>
            
            <h4>⚙️ 文件动作</h4>
            <ul>
                <li><strong>重命名</strong> - 右键选择或选中后点击重命名按钮</li>
                <li><strong>移动到</strong> - 右键选择「移动到...」打开目录树选择目标位置</li>
                <li><strong>删除</strong> - 支持批量删除文件/文件夹</li>
                <li><strong>收藏</strong> - 将常用文件标记为星标，在「我的收藏」中快速访问</li>
            </ul>
            
            <h4>🔍 搜索与导航</h4>
            <ul>
                <li><strong>面包屑导航</strong> - 点击路径中的任意层级快速跳转</li>
                <li><strong>文件夹树</strong> - 左侧边栏显示完整的文件夹结构，支持拖拽投送</li>
                <li><strong>全局搜索</strong> - 输入关键词搜索文件和文件夹</li>
            </ul>
            
            <h4>💡 使用技巧</h4>
            <ul>
                <li>将文件直接拖入浏览器窗口即可上传</li>
                <li>右键菜单会自动根据文件类型显示可用选项</li>
                <li>存储空间不足 10% 时，进度条会变红示警</li>
            </ul>
        `;
    }

    getTransferHelpContent() {
        return `
            <h3>快传指南</h3>
            <p>快传是一个跨设备文件传输工具，让您可以在局域网内的不同设备间快速传输文件。</p>
            
            <h4>📤 发送文件</h4>
            <ol>
                <li><strong>选择文件</strong> - 点击拖拽区域或直接将文件拖入窗口</li>
                <li><strong>生成传输码</strong> - 点击「生成传输码」按钮，系统会生成 6 位数字码</li>
                <li><strong>分享传输码</strong> - 将传输码告知接收方（有效期 10 分钟）</li>
                <li><strong>等待连接</strong> - 接收方输入传输码后，点击「开始传输」</li>
                <li><strong>完成</strong> - 传输完成后会收到提示</li>
            </ol>
            
            <h4>📥 接收文件</h4>
            <ol>
                <li><strong>切换到接收</strong> - 点击顶部「接收」标签</li>
                <li><strong>输入传输码</strong> - 输入发送方提供的 6 位数字码</li>
                <li><strong>连接</strong> - 点击「连接」按钮等待发送方开始传输</li>
                <li><strong>自动下载</strong> - 传输完成后，文件会自动下载到本地</li>
            </ol>
            
            <h4>📊 传输历史</h4>
            <ul>
                <li><strong>查看记录</strong> - 点击「历史」标签查看所有传输记录</li>
                <li><strong>筛选</strong> - 可按「全部/发送/接收」筛选记录</li>
                <li><strong>统计信息</strong> - 右上角显示发送/接收次数和成功率</li>
                <li><strong>删除记录</strong> - 鼠标悬停在记录上，点击删除按钮清除</li>
            </ul>
            
            <h4>💡 注意事项</h4>
            <ul>
                <li>传输码有效期为 <strong>10 分钟</strong>，过期需重新生成</li>
                <li>单个文件最大支持 <strong>1GB</strong></li>
                <li>发送方和接收方需在同一网络环境下</li>
                <li>传输过程中请保持页面打开，避免刷新或关闭</li>
                <li>如遇连接问题，可尝试刷新页面重新操作</li>
            </ul>
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


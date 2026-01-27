/**
 * 模块帮助内容定义
 * 各模块的帮助信息
 */

const ModuleHelpContents = {
    /**
     * Markdown 编辑器帮助
     */
    markdown: () => `
        <h3>Markdown 编辑器使用指南</h3>
        <p>Markdown 编辑器是一款专业的文档创作工具，提供所见即所得的编辑体验，自动保存您的每一份心血。</p>
        
        <h4>📝 核心功能</h4>
        <ul>
            <li><strong>所见即所得</strong> - 富文本编辑体验，边写边预览，无需切换模式。</li>
            <li><strong>自动保存</strong> - 停止编辑 3 秒后自动保存，永不丢失内容。</li>
            <li><strong>文档管理</strong> - 创建、编辑、收藏、公开分享您的文档。</li>
            <li><strong>大纲导航</strong> - 右侧大纲面板自动提取标题，快速跳转。</li>
        </ul>
        
        <h4>🛠️ 工具栏格式</h4>
        <ul>
            <li><strong>标题</strong> - H1、H2、H3 三级标题快速插入。</li>
            <li><strong>文本样式</strong> - 粗体、斜体、删除线、行内代码。</li>
            <li><strong>列表</strong> - 无序列表、有序列表、任务清单。</li>
            <li><strong>引用</strong> - 块引用、代码块。</li>
            <li><strong>链接与图片</strong> - 插入超链接、图片。</li>
            <li><strong>表格与分割线</strong> - 快速插入表格和水平分割线。</li>
        </ul>
        
        <h4>⌨️ 快捷键</h4>
        <ul>
            <li><kbd>Ctrl+B</kbd> - 加粗</li>
            <li><kbd>Ctrl+I</kbd> - 斜体</li>
            <li><kbd>Ctrl+K</kbd> - 插入链接</li>
            <li><kbd>Ctrl+\`</kbd> - 行内代码</li>
            <li><kbd>Ctrl+Z</kbd> - 撤销</li>
            <li><kbd>Ctrl+Y</kbd> - 重做</li>
            <li><kbd>Ctrl+S</kbd> - 手动保存</li>
        </ul>
        
        <h4>📁 文档列表</h4>
        <ul>
            <li><strong>所有文档</strong> - 查看您创建的全部文档。</li>
            <li><strong>我的收藏</strong> - 快速访问已收藏的重要文档。</li>
            <li><strong>公开文档</strong> - 您设置为公开的文档，其他用户也可查看。</li>
        </ul>
        
        <h4>⭐ 文档操作</h4>
        <ul>
            <li><strong>收藏</strong> - 点击星标图标收藏重要文档。</li>
            <li><strong>公开</strong> - 勾选「公开」选项可让其他用户查看。</li>
            <li><strong>编辑</strong> - 点击编辑按钮或直接点击文档卡片进入编辑。</li>
            <li><strong>删除</strong> - 点击删除按钮移除文档（不可恢复）。</li>
        </ul>
        
        <h4>📑 快速模板</h4>
        <ul>
            <li>工具栏右侧提供「快速模板」下拉菜单。</li>
            <li>选择模板后会自动插入预设的文档结构。</li>
            <li>适合快速创建会议记录、技术文档、日报等常用格式。</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>左侧边栏可折叠，点击箭头按钮切换显示/隐藏。</li>
            <li>右侧大纲面板方便长文档快速导航。</li>
            <li>输入首行标题，编辑器会自动同步为文档标题。</li>
            <li>状态栏实时显示字数统计和保存状态。</li>
        </ul>
    `,

    /**
     * 数据透镜帮助
     */
    datalens: () => `
        <h3>数据透镜使用指南</h3>
        <p>数据透镜是系统的万能视窗，支持连接多种数据源并创建可视化视图。</p>
        
        <h4>🔗 数据源连接</h4>
        <ul>
            <li><strong>数据库</strong> - 支持 MySQL、PostgreSQL、SQL Server、Oracle、SQLite</li>
            <li><strong>文件</strong> - 支持 CSV、Excel 文件导入</li>
            <li><strong>API</strong> - 支持 RESTful API 数据源</li>
        </ul>
        
        <h4>📊 创建视图</h4>
        <ol>
            <li>点击「新建视图」按钮</li>
            <li>选择数据源类型</li>
            <li>配置连接信息</li>
            <li>编写 SQL 查询或选择表</li>
            <li>保存视图</li>
        </ol>
        
        <h4>⭐ 功能特性</h4>
        <ul>
            <li><strong>收藏视图</strong> - 点击星标图标收藏常用视图</li>
            <li><strong>固定到开始菜单</strong> - 点击图钉图标将视图固定到开始菜单</li>
            <li><strong>分类管理</strong> - 创建分类组织视图</li>
            <li><strong>数据导出</strong> - 支持导出为 CSV、Excel 格式</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用搜索框快速查找视图</li>
            <li>通过侧边栏分类筛选视图</li>
            <li>右键视图卡片可进行编辑、删除等操作</li>
            <li>固定到开始菜单的视图可在开始菜单中快速访问</li>
        </ul>
    `,

    /**
     * 数据分析帮助
     */
    analysis: () => `
        <h3>数据分析模块使用指南</h3>
        <p>数据分析模块提供强大的数据处理、清洗、建模和可视化功能。</p>
        
        <h4>📥 数据导入</h4>
        <ul>
            <li><strong>文件导入</strong> - 支持 CSV、Excel 文件上传</li>
            <li><strong>数据库导入</strong> - 连接数据库直接导入表数据</li>
            <li><strong>批量导入</strong> - 支持一次导入多个文件</li>
        </ul>
        
        <h4>🧹 数据清洗</h4>
        <ul>
            <li>处理缺失值</li>
            <li>数据类型转换</li>
            <li>数据去重</li>
            <li>异常值处理</li>
        </ul>
        
        <h4>📈 数据建模</h4>
        <ul>
            <li><strong>统计分析</strong> - 描述性统计、相关性分析</li>
            <li><strong>SQL 建模</strong> - 使用 SQL 进行复杂数据转换</li>
            <li><strong>ETL 流程</strong> - 可视化 ETL 流程设计</li>
        </ul>
        
        <h4>📊 可视化</h4>
        <ul>
            <li>创建各种图表（柱状图、折线图、饼图等）</li>
            <li>BI 仪表盘设计</li>
            <li>智能表格</li>

        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用数据比对功能对比不同数据集</li>
            <li>保存常用查询为模型，方便复用</li>
            <li>使用智能表格进行交互式数据分析</li>
        </ul>
    `,

    /**
     * 博客帮助
     */
    blog: () => `
        <h3>博客模块使用指南</h3>
        <p>博客模块用于发布和管理文章内容。</p>
        
        <h4>✍️ 创建文章</h4>
        <ol>
            <li>点击「新建文章」按钮</li>
            <li>填写标题和内容</li>
            <li>选择分类和标签</li>
            <li>设置发布状态</li>
            <li>保存或发布</li>
        </ol>
        
        <h4>📝 编辑功能</h4>
        <ul>
            <li>支持 Markdown 格式</li>
            <li>实时预览</li>
            <li>图片上传</li>
            <li>草稿保存</li>
        </ul>
        
        <h4>🏷️ 分类和标签</h4>
        <ul>
            <li>创建分类组织文章</li>
            <li>使用标签标记文章主题</li>
            <li>支持多标签</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用搜索功能快速查找文章</li>
            <li>通过分类和标签筛选文章</li>
            <li>保存为草稿可随时继续编辑</li>
        </ul>
    `,

    /**
     * 笔记帮助
     */
    notes: () => `
        <h3>笔记模块使用指南</h3>
        <p>笔记模块用于记录和管理个人笔记。</p>
        
        <h4>📝 创建笔记</h4>
        <ol>
            <li>点击「新建笔记」按钮</li>
            <li>选择文件夹（可选）</li>
            <li>编写笔记内容</li>
            <li>添加标签（可选）</li>
            <li>保存笔记</li>
        </ol>
        
        <h4>📁 文件夹管理</h4>
        <ul>
            <li>创建文件夹组织笔记</li>
            <li>支持多级文件夹</li>
            <li>拖拽移动笔记到不同文件夹</li>
        </ul>
        
        <h4>⭐ 收藏和置顶</h4>
        <ul>
            <li>点击星标收藏重要笔记</li>
            <li>点击图钉置顶笔记</li>
            <li>在侧边栏快速访问收藏和置顶笔记</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用搜索功能快速查找笔记</li>
            <li>通过标签筛选笔记</li>
            <li>使用文件夹分类管理笔记</li>
        </ul>
    `,

    /**
     * 反馈帮助
     */
    feedback: () => `
        <h3>反馈模块使用指南</h3>
        <p>反馈模块用于提交问题反馈和建议。</p>
        
        <h4>📮 提交反馈</h4>
        <ol>
            <li>点击「提交反馈」按钮</li>
            <li>选择反馈类型（问题/建议）</li>
            <li>填写标题和详细描述</li>
            <li>上传附件（可选）</li>
            <li>提交反馈</li>
        </ol>
        
        <h4>📋 查看反馈</h4>
        <ul>
            <li>在「我的反馈」中查看自己提交的反馈</li>
            <li>查看反馈状态（待处理/处理中/已解决）</li>
            <li>查看管理员回复</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>详细描述问题有助于快速解决</li>
            <li>上传截图或日志文件可帮助定位问题</li>
            <li>及时查看管理员回复</li>
        </ul>
    `,

    /**
     * 公告帮助
     */
    announcement: () => `
        <h3>公告模块使用指南</h3>
        <p>公告模块用于发布和管理系统公告。</p>
        
        <h4>📢 发布公告</h4>
        <ol>
            <li>点击「发布公告」按钮</li>
            <li>填写标题和内容</li>
            <li>设置发布时间</li>
            <li>选择目标用户（全部/特定角色）</li>
            <li>发布公告</li>
        </ol>
        
        <h4>👀 查看公告</h4>
        <ul>
            <li>在公告列表中查看所有公告</li>
            <li>点击公告查看详细内容</li>
            <li>查看已读/未读状态</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>重要公告建议置顶显示</li>
            <li>使用富文本编辑器美化公告内容</li>
            <li>设置定时发布可在指定时间自动发布</li>
        </ul>
    `,

    /**
     * 文件管理帮助
     */
    filemanager: () => `
        <h3>文件管理使用指南</h3>
        <p>文件管理模块用于管理系统的文件和文件夹。</p>
        
        <h4>📁 文件操作</h4>
        <ul>
            <li><strong>上传文件</strong> - 点击上传按钮或拖拽文件到上传区域</li>
            <li><strong>创建文件夹</strong> - 点击新建文件夹按钮</li>
            <li><strong>重命名</strong> - 右键文件/文件夹选择重命名，或按 F2</li>
            <li><strong>删除</strong> - 选中文件后按 Delete 键或点击删除按钮</li>
            <li><strong>下载</strong> - 右键文件选择下载</li>
        </ul>
        
        <h4>⌨️ 快捷键</h4>
        <ul>
            <li><strong>Enter</strong> - 打开选中项</li>
            <li><strong>Delete</strong> - 删除选中项</li>
            <li><strong>F2</strong> - 重命名</li>
            <li><strong>Ctrl+C</strong> - 复制</li>
            <li><strong>Ctrl+V</strong> - 粘贴</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>支持多选文件进行操作</li>
            <li>使用搜索功能快速查找文件</li>
            <li>通过文件类型筛选文件</li>
        </ul>
    `,

    /**
     * 快传帮助
     */
    transfer: () => `
        <h3>快传使用指南</h3>
        <p>快传模块用于快速传输文件。</p>
        
        <h4>📤 发送文件</h4>
        <ol>
            <li>选择要发送的文件</li>
            <li>选择接收用户</li>
            <li>添加备注（可选）</li>
            <li>点击发送</li>
        </ol>
        
        <h4>📥 接收文件</h4>
        <ul>
            <li>在「接收的文件」中查看收到的文件</li>
            <li>点击下载按钮下载文件</li>
            <li>查看发送者备注</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>支持一次发送多个文件</li>
            <li>大文件会自动分片传输</li>
            <li>传输进度实时显示</li>
        </ul>
    `,

    /**
     * 用户管理帮助
     */
    users: () => `
        <h3>用户管理使用指南</h3>
        <p>用户管理模块用于管理系统用户。</p>
        
        <h4>➕ 创建用户</h4>
        <ol>
            <li>点击「添加用户」按钮</li>
            <li>填写用户信息（用户名、密码等）</li>
            <li>选择用户角色</li>
            <li>设置权限</li>
            <li>保存</li>
        </ol>
        
        <h4>👤 用户操作</h4>
        <ul>
            <li><strong>编辑</strong> - 修改用户信息</li>
            <li><strong>重置密码</strong> - 重置用户密码</li>
            <li><strong>启用/禁用</strong> - 控制用户账户状态</li>
            <li><strong>删除</strong> - 删除用户账户</li>
        </ul>
        
        <h4>⏳ 待审核用户</h4>
        <ul>
            <li>查看新注册待审核的用户</li>
            <li>审核通过或拒绝</li>
            <li>批量审核</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用搜索功能快速查找用户</li>
            <li>通过角色筛选用户</li>
            <li>批量操作可提高效率</li>
        </ul>
    `,

    /**
     * 角色管理帮助
     */
    roles: () => `
        <h3>角色管理使用指南</h3>
        <p>角色管理模块用于创建和管理用户角色及权限。</p>
        
        <h4>➕ 创建角色</h4>
        <ol>
            <li>点击「创建角色」按钮</li>
            <li>填写角色名称和描述</li>
            <li>选择权限</li>
            <li>保存角色</li>
        </ol>
        
        <h4>🔐 权限管理</h4>
        <ul>
            <li>为角色分配模块权限</li>
            <li>支持细粒度权限控制</li>
            <li>权限继承机制</li>
        </ul>
        
        <h4>👥 用户分配</h4>
        <ul>
            <li>查看角色下的用户列表</li>
            <li>添加用户到角色</li>
            <li>从角色中移除用户</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>合理设计角色权限结构</li>
            <li>使用角色模板快速创建相似角色</li>
            <li>定期审查角色权限</li>
        </ul>
    `,

    /**
     * 系统设置帮助
     */
    system: () => `
        <h3>系统设置使用指南</h3>
        <p>系统设置模块用于配置系统全局参数。</p>
        
        <h4>⚙️ 系统配置</h4>
        <ul>
            <li><strong>主题模式</strong> - 设置系统默认主题</li>
            <li><strong>密码策略</strong> - 配置密码最小长度等规则</li>
            <li><strong>JWT 设置</strong> - 配置 Token 过期时间</li>
            <li><strong>登录安全</strong> - 配置登录失败锁定策略</li>
        </ul>
        
        <h4>📦 模块管理</h4>
        <ul>
            <li>启用/禁用功能模块</li>
            <li>查看模块状态</li>
            <li>模块健康检查</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>修改设置后需要保存才能生效</li>
            <li>某些设置修改后可能需要重启服务</li>
            <li>建议定期备份系统配置</li>
        </ul>
    `,

    /**
     * 备份帮助
     */
    backup: () => `
        <h3>备份模块使用指南</h3>
        <p>备份模块用于创建和管理系统备份。</p>
        
        <h4>💾 创建备份</h4>
        <ol>
            <li>选择备份类型（完整备份/增量备份）</li>
            <li>选择要备份的数据</li>
            <li>点击「创建备份」</li>
            <li>等待备份完成</li>
        </ol>
        
        <h4>📥 恢复备份</h4>
        <ul>
            <li>在备份列表中选择要恢复的备份</li>
            <li>点击「恢复」按钮</li>
            <li>确认恢复操作</li>
            <li>等待恢复完成</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>定期创建备份确保数据安全</li>
            <li>恢复前建议先创建当前数据备份</li>
            <li>备份文件可下载到本地保存</li>
        </ul>
    `,

    /**
     * 监控帮助
     */
    monitor: () => `
        <h3>系统监控使用指南</h3>
        <p>系统监控模块用于实时监控系统运行状态。</p>
        
        <h4>📊 监控指标</h4>
        <ul>
            <li><strong>系统资源</strong> - CPU、内存、磁盘使用率</li>
            <li><strong>进程信息</strong> - 运行中的进程列表</li>
            <li><strong>性能指标</strong> - 响应时间、吞吐量等</li>
        </ul>
        
        <h4>📈 图表展示</h4>
        <ul>
            <li>实时数据图表</li>
            <li>历史数据趋势</li>
            <li>自定义时间范围</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>定期查看系统资源使用情况</li>
            <li>关注异常指标及时处理</li>
            <li>导出监控数据用于分析</li>
        </ul>
    `,

    /**
     * 应用市场帮助
     */
    market: () => `
        <h3>应用市场使用指南</h3>
        <p>应用市场用于浏览、安装和管理应用模块。</p>
        
        <h4>🛍️ 浏览应用</h4>
        <ul>
            <li>在应用列表中浏览可用应用</li>
            <li>查看应用详情和说明</li>
            <li>搜索应用</li>
        </ul>
        
        <h4>📦 安装应用</h4>
        <ol>
            <li>找到要安装的应用</li>
            <li>点击「安装」按钮</li>
            <li>等待安装完成</li>
            <li>在模块管理中启用应用</li>
        </ol>
        
        <h4>📤 上传离线包</h4>
        <ul>
            <li>点击「上传离线包」</li>
            <li>选择模块包文件</li>
            <li>等待上传和安装完成</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>安装前查看应用要求和依赖</li>
            <li>定期更新已安装的应用</li>
            <li>卸载不需要的应用释放资源</li>
        </ul>
    `,

    /**
     * AI助手帮助
     */
    ai: () => `
        <h3>AI 助手使用指南</h3>
        <p>AI 助手是您的智能对话伙伴，支持本地和在线大语言模型。</p>
        
        <h4>🤖 开始对话</h4>
        <ol>
            <li>在输入框中输入您的问题或指令</li>
            <li>按回车键或点击发送按钮</li>
            <li>等待 AI 生成回复</li>
            <li>继续对话或开启新会话</li>
        </ol>
        
        <h4>⚙️ 模型配置</h4>
        <ul>
            <li><strong>本地模型</strong> - 使用本地部署的 GGUF 模型，无需联网</li>
            <li><strong>在线模型</strong> - 配置 OpenAI 等在线 API</li>
            <li><strong>模型切换</strong> - 点击顶部下拉菜单切换模型</li>
            <li><strong>参数调节</strong> - 调整温度、最大长度等生成参数</li>
        </ul>
        
        <h4>💬 会话管理</h4>
        <ul>
            <li><strong>新建会话</strong> - 点击「新建对话」开始新主题</li>
            <li><strong>历史记录</strong> - 左侧边栏查看历史会话</li>
            <li><strong>重命名会话</strong> - 双击会话名称进行修改</li>
            <li><strong>删除会话</strong> - 右键会话选择删除</li>
        </ul>
        
        <h4>📋 消息操作</h4>
        <ul>
            <li><strong>复制回复</strong> - 点击消息右侧复制按钮</li>
            <li><strong>重新生成</strong> - 点击重新生成按钮获取新回复</li>
            <li><strong>停止生成</strong> - 生成过程中点击停止按钮</li>
        </ul>
        
        <h4>🔧 高级功能</h4>
        <ul>
            <li><strong>系统提示词</strong> - 设置对话的角色和上下文</li>
            <li><strong>知识库关联</strong> - 关联知识库进行 RAG 检索增强</li>
            <li><strong>代码高亮</strong> - 自动识别并高亮代码块</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>清晰具体的问题能获得更好的回答</li>
            <li>使用系统提示词定制 AI 行为</li>
            <li>本地模型无需联网，更加私密安全</li>
            <li>长对话建议新建会话保持上下文清晰</li>
        </ul>
    `,

    /**
     * 智能地图帮助
     */
    map: () => `
        <h3>智能地图使用指南</h3>
        <p>智能地图是一款功能极其强大的地理分析工具，支持离线与在线双模式，整合了轨迹分析、精确测距、地理标记和实时定位等核心功能。</p>
        
        <h4>🗺️ 基础操作</h4>
        <ul>
            <li><strong>地图导航</strong> - 滚动鼠标滚轮缩放，按住左键拖拽平移。</li>
            <li><strong>缩放联动</strong> - 针对大数据量轨迹，缩放后会自动重渲染可见点，确保细节清晰。</li>
            <li><strong>全屏切换</strong> - 点击右上角全屏按钮可获得更广阔的视野。</li>
            <li><strong>坐标显示</strong> - 左上角实时显示当前缩放级别。</li>
        </ul>
        
        <h4>🛤️ 轨迹分析与管理</h4>
        <ul>
            <li><strong>轨迹载入</strong> - 支持 GPX、CSV、Excel 格式。侧边栏可以直接从云端库批量载入文件夹内的轨迹。</li>
            <li><strong>实时统计</strong> - 图层列表实时计算并显示每条轨迹的<strong>总点数</strong>和<strong>行驶里程</strong>。</li>
            <li><strong>详情分析</strong> - 点击轨迹旁的 ⓘ 按钮，查看包括<strong>时间跨度、平均时速、地理范围范围</strong>在内的深度分析报告。</li>
            <li><strong>样式自定义</strong> - 点击色块可实时修改轨迹颜色，勾选复选框可快速隐藏/显示图层。</li>
            <li><strong>批量操作</strong> - 使用列表顶部的 <strong>「适配全部」</strong> 快速缩放以看清所有轨迹；使用 <strong>「清除全部」</strong> 一键清空地图图层。</li>
        </ul>
        
        <h4>📏 测量工具与热力图</h4>
        <ul>
            <li><strong>精确测距</strong> - 点击尺子图标开启。点击地图添加测量点，系统会实时计算并显示各段距离及<strong>累计总里程</strong>。</li>
            <li><strong>清除重测</strong> - 在测量模式下，点击提示条中的「清除重测」可清空当前测量点而不关闭工具。</li>
            <li><strong>热力分析</strong> - 点击火苗图标将当前可见轨迹转换为热力图模式，分析活动密度。</li>
        </ul>
        
        <h4>📍 定位与标记</h4>
        <ul>
            <li><strong>实时定位</strong> - 点击悬浮工具栏的瞄准图标，通过浏览器 Geolocation 获取您的<strong>当前 GPS 位置</strong>。</li>
            <li><strong>精度显示</strong> - 定位后会显示蓝色脉冲气泡和透明的精度覆盖圈。</li>
            <li><strong>自定义标记</strong> - 右键点击地图可添加标记点。</li>
            <li><strong>高级编辑</strong> - 点击标记点气泡中的「编辑」按钮，可修改标记名称、详细描述以及图标颜色。</li>
        </ul>
        
        <h4>🌐 地图源管理</h4>
        <ul>
            <li><strong>在线模式</strong> - 支持高德、腾讯、OSM 等主流 XYZ 瓦片服务。可在配置中心自定义 URL 模板。</li>
            <li><strong>离线模式</strong> - 使用本地 /map/map_tiles 目录下的瓦片资源。适合内网或偏远地区使用。</li>
            <li><strong>配置中心</strong> - 点击齿轮图标可管理本地瓦片包、删除旧源、切换默认底图。</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li><strong>导出功能</strong> - 加载到地图上的任何轨迹（包括解析后的 CSV）都可一键导出为标准 GPX 文件。</li>
            <li><strong>快速定位</strong> - 双击侧边栏的标记点或轨迹定位按钮，可快速闪现到目标区域。</li>
            <li><strong>离线优先</strong> - 建议在常用区域使用离线瓦片，加载速度更快且保护隐私。</li>
        </ul>
    `,

    /**
     * 即时通讯帮助
     */
    im: () => `
        <h3>即时通讯使用指南</h3>
        <p>即时通讯模块提供实时聊天功能，支持私聊和群组。</p>
        
        <h4>💬 开始聊天</h4>
        <ol>
            <li>在联系人列表中选择用户</li>
            <li>点击「发起私聊」按钮</li>
            <li>在输入框中输入消息</li>
            <li>按回车或点击发送按钮</li>
        </ol>
        
        <h4>👥 群组功能</h4>
        <ul>
            <li><strong>创建群组</strong> - 点击「新建群组」按钮</li>
            <li><strong>邀请成员</strong> - 在群设置中添加成员</li>
            <li><strong>群管理</strong> - 群主可管理成员和群设置</li>
            <li><strong>退出群组</strong> - 在群设置中选择退出</li>
        </ul>
        
        <h4>📎 消息类型</h4>
        <ul>
            <li><strong>文本消息</strong> - 普通文字聊天</li>
            <li><strong>图片消息</strong> - 点击图片按钮发送图片</li>
            <li><strong>文件消息</strong> - 点击文件按钮发送文件</li>
            <li><strong>表情</strong> - 点击表情按钮选择表情</li>
        </ul>
        
        <h4>🔔 消息通知</h4>
        <ul>
            <li>新消息会在桌面显示通知</li>
            <li>未读消息会显示红色角标</li>
            <li>可在设置中配置通知偏好</li>
        </ul>
        
        <h4>📋 会话管理</h4>
        <ul>
            <li><strong>置顶会话</strong> - 右键会话选择置顶</li>
            <li><strong>静音会话</strong> - 右键会话选择静音</li>
            <li><strong>删除会话</strong> - 右键会话选择删除</li>
            <li><strong>清空记录</strong> - 在会话设置中清空聊天记录</li>
        </ul>
        
        <h4>🔍 搜索功能</h4>
        <ul>
            <li>搜索联系人和群组</li>
            <li>搜索历史聊天记录</li>
            <li>快速定位消息</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用 @ 符号在群组中提及特定成员</li>
            <li>拖拽文件到聊天窗口快速发送</li>
            <li>双击消息可快速回复</li>
            <li>长按消息可进行复制、转发等操作</li>
        </ul>
    `,

    /**
     * 日程管理帮助
     */
    schedule: () => `
        <h3>日程管理使用指南</h3>
        <p>日程管理模块帮助您安排和追踪各类事项，支持日历视图和提醒功能。</p>
        
        <h4>📅 日历视图</h4>
        <ul>
            <li><strong>月历导航</strong> - 使用左右箭头切换月份</li>
            <li><strong>今天按钮</strong> - 快速返回当前日期</li>
            <li><strong>选择日期</strong> - 点击日期查看当日日程</li>
            <li><strong>日程标记</strong> - 有日程的日期会显示小圆点</li>
        </ul>
        
        <h4>➕ 创建日程</h4>
        <ol>
            <li>点击「新建日程」按钮</li>
            <li>填写日程标题（必填）</li>
            <li>设置开始日期和时间</li>
            <li>选择日程类型和颜色</li>
            <li>配置提醒时间（可选）</li>
            <li>点击「创建」保存</li>
        </ol>
        
        <h4>🏷️ 日程类型</h4>
        <ul>
            <li><strong>会议</strong> - 工作会议、讨论等</li>
            <li><strong>任务</strong> - 待办事项</li>
            <li><strong>提醒</strong> - 重要事项提醒</li>
            <li><strong>生日</strong> - 生日纪念日</li>
            <li><strong>节假日</strong> - 节日假期</li>
            <li><strong>其他</strong> - 其他类型事项</li>
        </ul>
        
        <h4>✅ 日程操作</h4>
        <ul>
            <li><strong>完成</strong> - 点击勾选图标标记完成</li>
            <li><strong>编辑</strong> - 点击编辑图标修改日程</li>
            <li><strong>删除</strong> - 点击删除图标移除日程</li>
        </ul>
        
        <h4>🔔 提醒功能</h4>
        <ul>
            <li>创建日程时可设置提醒时间</li>
            <li>支持：事件开始时、提前5/15/30/60分钟、提前1天</li>
            <li>在「提醒中心」查看所有待提醒事项</li>
        </ul>
        
        <h4>📊 统计面板</h4>
        <ul>
            <li>查看今日、本周、已完成、逾期日程数量</li>
            <li>快速了解日程安排情况</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用不同颜色区分不同类型的日程</li>
            <li>全天事件可不设置具体时间</li>
            <li>在日历空白日期点击可快速添加当日日程</li>
            <li>切换到「我的日程」查看列表形式</li>
        </ul>
    `,

    /**
     * 相册帮助
     */
    album: () => `
        <h3>相册使用指南</h3>
        <p>相册模块为您提供沉浸式、旗舰级的照片管理体验，通过“相册集”的方式整理您的每一份回忆。</p>
        
        <h4>📸 核心操作</h4>
        <ul>
            <li><strong>创建相册</strong> - 在主页点击“创建相册”开始分类。</li>
            <li><strong>上传照片</strong> - 进入相册后，可点击“上传照片”或直接将图片文件<strong>拖拽</strong>到页面区域。</li>
            <li><strong>批量管理</strong> - 点击“管理”进入多选模式，支持批量删除和批量下载照片。</li>
            <li><strong>封面设置</strong> - 在照片卡片悬浮层点击“书签”图标，可将该照片设为该相册的封面。</li>
            <li><strong>排序调整</strong> - 在非管理模式下，直接<strong>拖拽照片卡片</strong>即可调整照片在相册中的显示顺序。</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>大图模式下支持使用方向键 <kbd>←</kbd> <kbd>→</kbd> 进行预览。</li>
            <li>单张照片编辑支持自定义标题和描述，方便搜索。</li>
            <li>支持 JPG, PNG, WebP, GIF 等主流图片格式，单张限制 20MB。</li>
        </ul>
    `,

    /**
     * 视频帮助
     */
    video: () => `
        <h3>视频库使用指南</h3>
        <p>视频模块为您提供优雅的私有视频库管理功能，支持流式播放、批量维护视频集。</p>
        
        <h4>🎬 核心操作</h4>
        <ul>
            <li><strong>创建视频集</strong> - 在首页点击“创建视频集”来分类您的视频。</li>
            <li><strong>上传视频</strong> - 进入合集后，点击“上传视频”或直接将视频文件<strong>拖拽</strong>到页面区域。</li>
            <li><strong>批量管理</strong> - 点击“管理”可进行多选批量删除操作。</li>
            <li><strong>封面设置</strong> - 点击视频卡片上的“书签”图标，可将该视频的画面设为合集封面。</li>
            <li><strong>播放控制</strong> - 点击视频打开播放器，支持 0.5x 到 2.0x 的<strong>倍速调节</strong>，支持键盘左右方向键切换视频。</li>
        </ul>
        
        <h4>⚠️ 注意事项</h4>
        <ul>
            <li><strong>格式支持</strong> - 推荐使用 H.264 编码的标准 MP4 文件，以获得最佳浏览器兼容性。</li>
            <li><strong>监控格式</strong> - 部分海康/乐橙等监控格式（IMKH）可能因编码特殊无法直接在浏览器播放，建议转码后上传。</li>
            <li><strong>环境依赖</strong> - 服务器需安装 FFmpeg 环境方可自动识别视频时长并生成封面预览。</li>
        </ul>
    `,

    /**
     * 课程学习帮助
     */
    course: () => `
        <h3>课程学习中心指南</h3>
        <p>欢迎来到课程学习模块！这里是您的私人知识库，支持课程浏览、在线学习以及自主课程创作。</p>
        
        <h4>🧭 核心功能区</h4>
        <ul>
            <li><strong>课程中心</strong> - 发现和报名感兴趣的新课程，您可以按标题快速搜索。</li>
            <li><strong>我的学习</strong> - 查看已报名课程。系统会<strong>自动记忆</strong>您的阅读位置，点击“继续学习”即可一键跳转至上次阅读的章节。</li>
            <li><strong>课程管理</strong> - 仅面向具有权限的用户，支持创建新课程、编排章节目录以及上传教学视频。</li>
        </ul>
        
        <h4>📖 学习流程</h4>
        <ol>
            <li>在<strong>课程中心</strong>挑选课程并点击“立即报名”。</li>
            <li>点击“开始学习”进入课程详情。</li>
            <li>进入章节学习。系统支持 <strong>Markdown 格式</strong>的教程和<strong>高清视频</strong>播放。</li>
            <li>学习完本章后，点击“完成本章”以更新您的学习进度。</li>
        </ol>
        
        <h4>🛠️ 创作与管理</h4>
        <ul>
            <li><strong>创建课程</strong> - 点击“创建课程”按钮，填写标题、描述和难度。</li>
            <li><strong>章节编排</strong> - 在课程管理列表中点击“管理章节”，您可以添加、编辑或删除特定章节。</li>
            <li><strong>发布控制</strong> - 课程在草稿状态下仅自己可见，发布后其他用户方可在课程中心看到。</li>
        </ul>
        
        <h4>💡 独家体验技巧</h4>
        <ul>
            <li><strong>专注模式</strong> - 在学习界面点击右上角的“专注”按钮（或全屏图标），可隐藏侧边栏和无关元素，享受<strong>沉浸式阅读</strong>体验。按 <kbd>Esc</kbd> 键快速退出。</li>
            <li><strong>智能导航</strong> - 底部设有“上一章/下一章”快速导航，方便连贯学习。</li>
            <li><strong>进度追踪</strong> - 统计面板实时展示您的学习时长和进度，助您更好地管理学习计划。</li>
        </ul>
    `,

    /**
     * 知识库帮助
     */
    knowledge: () => `
        <h3>知识库使用指南</h3>
        <p>知识库模块是系统的“第二大脑”，集成了最前沿的 AI 检索与图谱分析技术。</p>
        
        <h4>🔍 极致搜索 (Hybrid Search)</h4>
        <ul>
            <li><strong>混合搜索</strong> - 系统同时进行语义向量检索、关键词检索和视觉检索。</li>
            <li><strong>视觉检索</strong> - 支持“以文搜图”，AI 能理解图片内容。</li>
            <li><strong>精细重排 (Rerank)</strong> - 检索结果经过 Cross-Encoder 模型深度打分，最相关的内容始终排在首位。</li>
            <li><strong>多维过滤</strong> - 支持按文档、图片等类型进行过滤。</li>
        </ul>
        
        <h4>🕸️ 知识图谱 (Knowledge Graph)</h4>
        <ul>
            <li><strong>自动提取</strong> - 系统在解析文档时会自动提取关键实体（人物、地点、技术、概念等）及其关联。</li>
            <li><strong>可视化分析</strong> - 点击侧边栏顶部的🕸️图标切换到图谱模式，直观查看知识点的逻辑关联。</li>
            <li><strong>交互探索</strong> - 图谱支持拖拽和缩放，帮助您发现隐藏的知识脉络。</li>
        </ul>
        
        <h4>📄 文档管理</h4>
        <ul>
            <li><strong>多格式支持</strong> - 支持 PDF, Word, Excel, Markdown 及各类图片。</li>
            <li><strong>OCR 识别</strong> - 图片中的文字会被自动识别并索引。</li>
            <li><strong>Markdown 编辑</strong> - 文档支持在线 Markdown 编辑和实时保存。</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>直接<strong>拖拽文件</strong>到右侧空白区即可快速上传。</li>
            <li>在侧边栏右键点击文件夹可以进行子文档的创建和批量上传。</li>
            <li>使用过滤器切换功能（⚙️）可以快速定位特定类型的文件。</li>
        </ul>
    `,

    /**
     * 图文识别帮助
     */
    ocr: () => `
        <h3>图文识别使用指南</h3>
        <p>图文识别模块基于 RapidOCR 提供强大的离线文字识别能力，支持图片和 PDF 文档识别。</p>
        
        <h4>📷 上传方式</h4>
        <ul>
            <li><strong>点击上传</strong> - 点击上传区域选择本地图片或 PDF 文件</li>
            <li><strong>拖拽上传</strong> - 直接将文件拖拽到上传区域</li>
            <li><strong>粘贴图片</strong> - 使用 <kbd>Ctrl+V</kbd> 粘贴剪贴板中的截图或图片</li>
        </ul>
        
        <h4>🌍 支持的语言</h4>
        <ul>
            <li><strong>简体中文</strong> - 适用于中文文档（默认）</li>
            <li><strong>中英混合</strong> - 适用于中英文混合的文档、网页截图等</li>
            <li><strong>纯英文</strong> - 适用于英文文档，识别更精准</li>
        </ul>
        
        <h4>📄 PDF 识别</h4>
        <ul>
            <li>支持多页 PDF 文档识别</li>
            <li>自动将每页转换为图片进行识别</li>
            <li>识别过程中显示当前页数进度</li>
            <li>可随时点击「停止」按钮终止识别</li>
        </ul>
        
        <h4>🔲 识别框可视化</h4>
        <ul>
            <li>勾选「显示识别框」可在图片上叠加显示识别区域</li>
            <li>每个识别到的文本块会用边框高亮标记</li>
            <li>便于检查识别范围是否准确</li>
        </ul>
        
        <h4>📋 结果操作</h4>
        <ul>
            <li><strong>复制文字</strong> - 点击复制按钮将识别结果复制到剪贴板</li>
            <li><strong>下载保存</strong> - 点击下载按钮将结果保存为 TXT 文件</li>
            <li><strong>清空结果</strong> - 点击清空按钮重置结果区域</li>
            <li><strong>查看详情</strong> - 展开可查看每个文本块的置信度</li>
        </ul>
        
        <h4>📊 识别统计</h4>
        <ul>
            <li><strong>字符数</strong> - 识别到的总字符数量</li>
            <li><strong>行数</strong> - 识别到的文本行数</li>
            <li><strong>置信度</strong> - 识别结果的平均可信程度</li>
            <li><strong>耗时</strong> - 识别处理花费的时间</li>
        </ul>
        
        <h4>🕐 识别历史</h4>
        <ul>
            <li>点击右上角「历史」按钮查看识别记录</li>
            <li>自动保存最近 10 条识别结果摘要</li>
            <li>记录包含时间、语言、字符数和置信度</li>
            <li>支持一键清空历史记录</li>
        </ul>
        
        <h4>⚠️ 注意事项</h4>
        <ul>
            <li>支持 JPG、PNG、WEBP 等图片格式和 PDF 文档</li>
            <li>单个文件大小限制为 20MB</li>
            <li>首次使用时会自动下载 OCR 模型，请耐心等待</li>
            <li>图片清晰度越高，识别准确率越高</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>截图后可直接 <kbd>Ctrl+V</kbd> 粘贴识别，无需保存</li>
            <li>长文档建议使用 PDF 格式，可一次识别多页</li>
            <li>表格类图片识别后建议手动整理格式</li>
            <li>手写字体识别准确率可能较低，建议使用清晰的印刷体</li>
        </ul>
    `,

    /**
     * 在线考试帮助
     */
    exam: () => `
        <h3>在线考试使用指南</h3>
        <p>在线考试模块提供完整的题库管理、试卷组卷、在线答题和阅卷评分功能，支持多种题型和智能防作弊。</p>
        
        <h4>📋 考试中心</h4>
        <ul>
            <li><strong>可参加考试</strong> - 显示当前已发布的可参加考试列表</li>
            <li><strong>考试记录</strong> - 查看历次考试成绩和详情</li>
            <li><strong>断点续考</strong> - 考试中断后可自动恢复进度继续作答</li>
        </ul>
        
        <h4>📝 题库管理</h4>
        <ul>
            <li><strong>题库分类</strong> - 创建题库分类，便于管理大量题目</li>
            <li><strong>题型支持</strong> - 支持单选题、多选题、判断题、填空题和问答题</li>
            <li><strong>题目预览</strong> - 点击"预览"可展开查看题目详情、答案和解析</li>
            <li><strong>难度设置</strong> - 为题目设置 1-5 星难度级别</li>
        </ul>
        
        <h4>📄 试卷管理</h4>
        <ul>
            <li><strong>创建试卷</strong> - 手动创建试卷并从题库中选择题目</li>
            <li><strong>智能组卷</strong> - 按题型、数量、分值自动随机抽取题目组成试卷</li>
            <li><strong>试卷预览</strong> - 发布前预览试卷内容，查看完整答案和解析</li>
            <li><strong>发布考试</strong> - 发布后考生即可参加考试</li>
            <li><strong>排名统计</strong> - 查看考试参与人数、通过率、平均分和成绩排名</li>
        </ul>
        
        <h4>✍️ 在线考试</h4>
        <ul>
            <li><strong>倒计时</strong> - 实时显示剩余时间，5分钟和1分钟时会有提醒</li>
            <li><strong>答题卡</strong> - 右侧答题卡可快速跳转到指定题目</li>
            <li><strong>自动保存</strong> - 答案自动保存，意外断开后可恢复</li>
            <li><strong>防作弊</strong> - 检测切屏、窗口切换等行为并记录</li>
        </ul>
        
        <h4>⌨️ 快捷键</h4>
        <ul>
            <li><kbd>↑</kbd> <kbd>←</kbd> - 上一题</li>
            <li><kbd>↓</kbd> <kbd>→</kbd> - 下一题</li>
            <li><kbd>Ctrl+Enter</kbd> - 提交试卷</li>
        </ul>
        
        <h4>📕 错题本</h4>
        <ul>
            <li><strong>自动记录</strong> - 考试中答错的题目自动加入错题本</li>
            <li><strong>错题统计</strong> - 显示每道题的错误次数，便于针对性复习</li>
            <li><strong>查看解析</strong> - 查看正确答案和题目解析</li>
            <li><strong>移除错题</strong> - 掌握后可从错题本中移除</li>
        </ul>
        
        <h4>✅ 阅卷评分</h4>
        <ul>
            <li><strong>自动阅卷</strong> - 客观题（单选、多选、判断）自动评分</li>
            <li><strong>人工阅卷</strong> - 主观题（填空、问答）需管理员手动评分</li>
            <li><strong>评语反馈</strong> - 可为每道题添加评语</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>考前确保网络稳定，避免断开影响答题</li>
            <li>使用智能组卷功能快速生成随机试卷</li>
            <li>定期复习错题本，提升薄弱知识点</li>
            <li>考试时使用答题卡快速定位未答题目</li>
        </ul>
    `,

    /**
     * 密码箱帮助
     */
    vault: () => `
        <h3>密码箱使用指南</h3>
        <p>密码箱是一个安全的密码管理工具，采用 AES-256 加密保护您的敏感信息。</p>
        
        <h4>🔐 首次使用</h4>
        <ol>
            <li>设置主密码（至少8位，包含大小写字母和数字）</li>
            <li><strong>务必保存恢复码</strong>，这是忘记密码后恢复数据的唯一方式</li>
            <li>主密码设置成功后即可开始使用</li>
        </ol>
        
        <h4>🔑 密码管理</h4>
        <ul>
            <li><strong>添加密码</strong> - 点击右上角「添加密码」按钮</li>
            <li><strong>分类管理</strong> - 创建分类整理您的密码</li>
            <li><strong>收藏功能</strong> - 点击星标收藏常用密码</li>
            <li><strong>搜索</strong> - 在搜索框输入关键词快速查找</li>
        </ul>
        
        <h4>🛡️ 安全特性</h4>
        <ul>
            <li><strong>AES-256 加密</strong> - 所有敏感数据端到端加密</li>
            <li><strong>自动锁定</strong> - 5分钟无操作自动锁定，保护隐私</li>
            <li><strong>隐私保护</strong> - 密码明文显示 <strong>30秒后自动隐藏</strong>，防止屏幕窥探</li>
            <li><strong>剪贴板安全</strong> - 复制敏感信息 <strong>30秒后自动清除</strong>，防止误粘贴泄露</li>
            <li><strong>恢复码机制</strong> - 忘记主密码时可通过恢复码重置</li>
        </ul>
        
        <h4>📦 导入/导出</h4>
        <ul>
            <li><strong>导出数据</strong> - 点击侧边栏「导出数据」备份所有密码</li>
            <li><strong>导入数据</strong> - 点击「导入数据」恢复备份的密码</li>
            <li>导出的 JSON 文件可用于迁移或备份</li>
        </ul>
        
        <h4>⚠️ 重要提示</h4>
        <ul>
            <li>主密码<strong>无法找回</strong>，请牢记并妥善保管恢复码</li>
            <li>刷新页面后需重新输入主密码解锁</li>
            <li>定期备份数据，防止意外丢失</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>使用内置的密码生成器创建强密码</li>
            <li>为不同类型的账户创建分类</li>
            <li>点击用户名或密码可快速复制（支持自动清除）</li>
            <li>修改主密码时会自动重新加密所有数据</li>
        </ul>
    `
    ,

    /**
     * PDF 工具帮助
     */
    pdf: () => `
        <h3>PDF 工具箱使用指南</h3>
        <p>PDF 工具箱是一个全能的 PDF 处理中心，支持阅读、编辑、转换和安全加固，满足您的所有 PDF 处理需求。</p>
        
        <h4>📂 文档管理</h4>
        <ul>
            <li><strong>我的文档</strong> - 集中管理您上传的原始文件和系统生成的处理成果。</li>
            <li><strong>开卷阅读</strong> - 直接点击文档卡片即可进入沉浸式阅读模式。</li>
            <li><strong>文件上传</strong> - 点击左侧「上传文件」按钮，支持 PDF、Word、Excel、图片等多种格式。</li>
        </ul>
        
        <h4>🛠️ 任务工作台</h4>
        <ul>
            <li><strong>精准挑选</strong> - 进入「工具箱」，优先从文档库中挑选待处理文件到工作台。</li>
            <li><strong>一键处理</strong> - 准备好文件后，直接选择下方的功能工具即可开始任务。</li>
            <li><strong>批量合并</strong> - 合并工具支持同时选取多份文档，一键合成长卷。</li>
            <li><strong>历史记录</strong> - 所有处理操作都会记录在历史列表中，方便追溯。</li>
        </ul>
        
        <h4>📄 页面编辑</h4>
        <ul>
            <li><strong>页面旋转</strong> - 支持 90°、180°、270° 旋转，可指定页码或全部旋转。</li>
            <li><strong>页面提取</strong> - 从文档中提取指定页码范围，生成新的 PDF。</li>
            <li><strong>页面删除</strong> - 删除不需要的页面，如广告页、空白页。</li>
            <li><strong>页面反转</strong> - 将整个文档的页面顺序完全颠倒。</li>
            <li><strong>页面重排</strong> - 自定义页面的排列顺序。</li>
            <li><strong>添加页码</strong> - 为文档添加页码，支持自定义位置和格式。</li>
        </ul>
        
        <h4>🔄 格式转换</h4>
        <ul>
            <li><strong>PDF → Word</strong> - 将 PDF 转换为可编辑的 Word 文档 (.docx)。</li>
            <li><strong>PDF → Excel</strong> - 智能提取 PDF 中的表格数据，生成 Excel 文件。</li>
            <li><strong>PDF → 图片</strong> - 将 PDF 每页导出为高清 PNG/JPG 图片压缩包。</li>
            <li><strong>Word → PDF</strong> - 将 Word 文档转换为 PDF 格式。</li>
            <li><strong>Excel → PDF</strong> - 将 Excel 表格转换为 PDF 格式。</li>
            <li><strong>图片 → PDF</strong> - 将多张图片合并转换为一个 PDF 文档。</li>
        </ul>
        
        <h4>📦 合并与拆分</h4>
        <ul>
            <li><strong>合并 PDF</strong> - 将多个 PDF 文件按顺序合并为一个文档。</li>
            <li><strong>拆分 PDF</strong> - 按页码范围将文档拆分为多个独立文件。</li>
            <li><strong>压缩瘦身</strong> - 提供 0-4 级自定义压缩，显著降低文档存储体积。</li>
        </ul>
        
        <h4>🔐 安全防护</h4>
        <ul>
            <li><strong>文档加密</strong> - 使用 AES-256 加密保护文档，设置打开密码。</li>
            <li><strong>移除密码</strong> - 输入正确密码后，可移除文档的密码保护。</li>
            <li><strong>添加水印</strong> - 添加自定义文字水印，支持调整透明度、位置和颜色。</li>
            <li><strong>去除水印</strong> - 尝试智能识别并移除文档中的水印（效果视水印类型而定）。</li>
            <li><strong>签名盖章</strong> - 在指定页面位置添加签名或印章图片。</li>
        </ul>
        
        <h4>📝 文本操作</h4>
        <ul>
            <li><strong>提取文本</strong> - 一键提取 PDF 全文内容，可复制或下载为文本文件。</li>
            <li><strong>保存文本</strong> - 将提取的文本保存为 .txt 文件到输出目录。</li>
        </ul>
        
        <h4>📖 阅读体验</h4>
        <ul>
            <li><strong>缩放控制</strong> - 阅读器底部控制栏支持 50% 到 300% 的无级缩放。</li>
            <li><strong>快速翻页</strong> - 侧向箭头导航，支持显示当前进度。</li>
            <li><strong>退出阅读</strong> - 阅读完成后，点击顶部「退出阅读」即可返回管理库。</li>
        </ul>
        
        <h4>💡 使用技巧</h4>
        <ul>
            <li>处理后的文件会自动存入「处理成果」分类下，方便二次编辑。</li>
            <li>建议先将常用的 PDF 统一上传，再到工具箱集中处理，效率更高。</li>
            <li>对于包含敏感信息的文档，处理完后建议立即使用加密功能加固。</li>
            <li>批量操作时，可多选文件一起处理，节省操作时间。</li>
        </ul>
        
        <h4>⚠️ 注意事项</h4>
        <ul>
            <li><strong>扫描件转换</strong> - 扫描图片类型的 PDF 转 Word/Excel 效果有限，建议配合 OCR 模块使用。</li>
            <li><strong>加密文档</strong> - 处理加密文档前需先使用「解密」功能输入正确密码。</li>
            <li><strong>文件大小</strong> - 超大型 PDF（500 页以上）处理可能需要较长时间，请耐心等待。</li>
        </ul>
    `
};

// 暴露到全局
window.ModuleHelpContents = ModuleHelpContents;

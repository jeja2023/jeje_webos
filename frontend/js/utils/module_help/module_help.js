/**
 * 模块帮助工具
 * 提供统一的模块帮助信息显示功能
 */

const ModuleHelp = {
    /**
     * 显示模块帮助
     * @param {string} moduleId - 模块ID
     * @param {string} title - 帮助标题（可选，默认使用模块ID）
     * @param {string|Function} content - 帮助内容（可选，默认从 ModuleHelpContents 获取）
     */
    show(moduleId, title = null, content = null) {
        // 如果没有提供标题，使用模块ID
        const helpTitle = title || moduleId;

        // 如果没有提供内容，从全局帮助内容中获取
        let helpContent = content;
        if (!helpContent && window.ModuleHelpContents && window.ModuleHelpContents[moduleId]) {
            helpContent = window.ModuleHelpContents[moduleId];
        }

        if (!helpContent) {
            Toast.error('该模块暂无帮助信息');
            return;
        }

        // 如果 content 是函数，调用它获取内容
        const finalContent = typeof helpContent === 'function' ? helpContent() : helpContent;

        Modal.show({
            title: `📖 ${helpTitle} - 使用帮助`,
            width: '700px',
            content: `
                <div class="module-help-content">
                    ${finalContent}
                </div>
            `,
            footer: false
        });
    },

    /**
     * 创建帮助按钮HTML
     * @param {string} moduleId - 模块ID
     * @param {string} title - 帮助标题（可选）
     * @param {string} className - 额外的CSS类名
     * @returns {string} 帮助按钮HTML
     */
    createHelpButton(moduleId, title = null, className = '') {
        const helpTitle = title || moduleId;
        // 使用 onclick 直接绑定，避免需要额外的事件绑定
        const moduleIdEscaped = Utils.escapeHtml(moduleId);
        const titleEscaped = Utils.escapeHtml(helpTitle);
        return `
            <button class="btn-help ${className}" 
                    data-help-module="${moduleIdEscaped}"
                    data-help-title="${titleEscaped}"
                    title="查看帮助"
                    onclick="if(window.ModuleHelp){window.ModuleHelp.show('${moduleIdEscaped}','${titleEscaped}');}">
                <i class="ri-question-line"></i><span class="help-text"> 帮助</span>
            </button>
        `;
    },

    /**
     * 绑定帮助按钮事件（用于动态生成的按钮）
     * @param {HTMLElement} container - 容器元素
     */
    bindHelpButtons(container) {
        if (!container) return;

        container.querySelectorAll('.btn-help[data-help-module]').forEach(btn => {
            // 避免重复绑定
            if (btn._helpBound) return;
            btn._helpBound = true;

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const moduleId = btn.dataset.helpModule;
                const title = btn.dataset.helpTitle;
                this.show(moduleId, title);
            });
        });
    }
};

// 暴露到全局
window.ModuleHelp = ModuleHelp;

// 全局事件委托：监听所有帮助按钮点击（作为备用方案）
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-help[data-help-module]');
    if (btn && window.ModuleHelp) {
        e.preventDefault();
        e.stopPropagation();
        const moduleId = btn.dataset.helpModule;
        const title = btn.dataset.helpTitle;
        ModuleHelp.show(moduleId, title);
    }
}, true);


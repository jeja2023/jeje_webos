/**
 * 快捷键帮助面板
 * 按下 ? 或 F1 显示所有可用的键盘快捷键
 */
const ShortcutsHelp = {
    isOpen: false,
    element: null,

    // 快捷键定义
    shortcuts: [
        {
            group: '通用', items: [
                { keys: ['?', 'F1'], desc: '显示快捷键帮助' },
                { keys: ['Esc'], desc: '关闭弹窗/取消操作' },
                { keys: ['Ctrl', 'K'], desc: '打开全局搜索 (Spotlight)' },
                { keys: ['Ctrl', 'Space'], desc: '打开全局搜索 (备用)' },
            ]
        },
        {
            group: '窗口管理', items: [
                { keys: ['点击标题栏'], desc: '拖拽移动窗口' },
                { keys: ['双击标题栏'], desc: '最大化/还原窗口' },
                { keys: ['点击窗口'], desc: '激活并置顶窗口' },
            ]
        },
        {
            group: '文件管理器', items: [
                { keys: ['Enter'], desc: '打开选中项' },
                { keys: ['Delete'], desc: '删除选中项' },
                { keys: ['F2'], desc: '重命名' },
                { keys: ['Ctrl', 'C'], desc: '复制' },
                { keys: ['Ctrl', 'V'], desc: '粘贴' },
            ]
        },
        {
            group: '编辑器', items: [
                { keys: ['Ctrl', 'S'], desc: '保存' },
                { keys: ['Ctrl', 'B'], desc: '加粗 (Markdown)' },
                { keys: ['Ctrl', 'I'], desc: '斜体 (Markdown)' },
            ]
        },
        {
            group: 'Dock 栏', items: [
                { keys: ['点击图标'], desc: '打开/聚焦应用' },
                { keys: ['右键图标'], desc: '显示上下文菜单' },
            ]
        },
    ],

    init() {
        this.createElement();
        this.bindGlobalKeys();
    },

    createElement() {
        const overlay = document.createElement('div');
        overlay.className = 'shortcuts-help-overlay';
        overlay.innerHTML = `
            <div class="shortcuts-help-panel">
                <div class="shortcuts-help-header">
                    <h2>⌨️ 键盘快捷键</h2>
                    <button class="shortcuts-help-close" title="关闭">&times;</button>
                </div>
                <div class="shortcuts-help-body">
                    ${this.shortcuts.map(group => `
                        <div class="shortcuts-group">
                            <h3 class="shortcuts-group-title">${group.group}</h3>
                            <div class="shortcuts-list">
                                ${group.items.map(item => `
                                    <div class="shortcuts-item">
                                        <div class="shortcuts-keys">
                                            ${item.keys.map(k => `<kbd>${k}</kbd>`).join(' + ')}
                                        </div>
                                        <div class="shortcuts-desc">${item.desc}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="shortcuts-help-footer">
                    按 <kbd>Esc</kbd> 或点击空白处关闭
                </div>
            </div>
        `;

        // 点击遮罩层关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        // 关闭按钮
        overlay.querySelector('.shortcuts-help-close').addEventListener('click', () => {
            this.close();
        });

        document.body.appendChild(overlay);
        this.element = overlay;
    },

    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            // ? 或 F1 打开帮助
            if ((e.key === '?' && !e.ctrlKey && !e.altKey) || e.key === 'F1') {
                // 排除在输入框中按 ?
                const tagName = document.activeElement?.tagName?.toLowerCase();
                if (tagName === 'input' || tagName === 'textarea') {
                    if (e.key === '?') return; // 输入框中不触发
                }
                e.preventDefault();
                this.toggle();
            }

            // ESC 关闭
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    },

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.element.classList.add('active');
    },

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.element.classList.remove('active');
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
};

// 导出
window.ShortcutsHelp = ShortcutsHelp;

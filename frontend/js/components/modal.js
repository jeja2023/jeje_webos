/**
 * 模态框组件 (Class-based)
 */

class Modal {
    constructor(options = {}) {
        this.options = {
            title: '',
            content: '',
            footer: null, // 如果为 null，会自动生成确认/取消按钮；如果为 false，不显示；如果为字符串，自定义
            width: '500px',
            closable: true,
            confirmText: '确定',
            cancelText: '取消',
            onConfirm: null, // async function, return true to close, false to keep open
            onCancel: null,
            ...options
        };

        this.id = Utils.uniqueId('modal-');
        this.overlay = null;
        this.init();
    }

    init() {
        // 全局容器
        let container = document.getElementById('modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'modal-container';
            document.body.appendChild(container);
        }
        this.container = container;
    }

    render() {
        const { title, content, footer, width, closable, confirmText, cancelText } = this.options;

        let footerHtml = '';
        if (footer === null) {
            footerHtml = `
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                    <button class="btn btn-primary" data-action="confirm">${confirmText}</button>
                </div>
            `;
        } else if (footer !== false) {
            footerHtml = `<div class="modal-footer">${footer}</div>`;
        }

        return `
            <div class="modal-overlay active" id="${this.id}">
                <div class="modal" style="max-width: ${width}">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        ${closable ? `<button class="modal-close" data-action="close">&times;</button>` : ''}
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${footerHtml}
                </div>
            </div>
        `;
    }

    show() {
        this.container.insertAdjacentHTML('beforeend', this.render());
        this.overlay = document.getElementById(this.id);
        this.bindEvents();

        // 自动聚焦第一个输入框
        const input = this.overlay.querySelector('input');
        if (input) setTimeout(() => input.focus(), 100);

        return this;
    }

    close() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            this.overlay.addEventListener('transitionend', () => {
                this.overlay.remove();
                this.overlay = null;
            }, { once: true });

            // 如果 transitionend 事件未触发，执行兜底处理
            setTimeout(() => {
                if (this.overlay) this.overlay.remove();
            }, 300);
        }
    }

    setLoading(loading) {
        if (!this.overlay) return;
        const btn = this.overlay.querySelector('[data-action="confirm"]');
        if (btn) {
            if (loading) {
                btn.classList.add('loading');
                btn.disabled = true;
                btn.dataset.originalText = btn.innerText;
                btn.innerText = '处理中...';
            } else {
                btn.classList.remove('loading');
                btn.disabled = false;
                btn.innerText = btn.dataset.originalText || this.options.confirmText;
            }
        }
    }

    bindEvents() {
        if (!this.overlay) return;

        // 点击关闭按钮
        this.overlay.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.onclick = () => {
                this.close();
                if (this.options.onCancel) this.options.onCancel();
            };
        });

        // 点击遮罩
        this.overlay.onclick = (e) => {
            // 用户要求：点击遮罩不关闭，必须点击关闭按钮
            if (e.target === this.overlay) {
                // e.stopPropagation();
            }
        };

        // 默认取消按钮
        const cancelBtn = this.overlay.querySelector('[data-action="cancel"]');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.close();
                if (this.options.onCancel) this.options.onCancel();
            };
        }

        // 默认确定按钮
        const confirmBtn = this.overlay.querySelector('[data-action="confirm"]');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                if (this.options.onConfirm) {
                    try {
                        // 防止重复点击
                        if (confirmBtn.disabled) return;

                        // 设置加载状态
                        const originalText = confirmBtn.innerText;
                        confirmBtn.classList.add('loading');
                        confirmBtn.disabled = true;
                        confirmBtn.innerText = '处理中...';

                        const shouldClose = await this.options.onConfirm();
                        if (shouldClose !== false) {
                            this.close();
                        } else {
                            // 如果返回 false，说明验证失败，恢复按钮状态
                            confirmBtn.classList.remove('loading');
                            confirmBtn.disabled = false;
                            confirmBtn.innerText = originalText;
                        }
                    } catch (e) {

                        console.error(e);
                        // 显示错误信息
                        const msg = e.message || e.toString();
                        if (msg !== 'false') { // 忽略主动返回false的情况
                            alert(`❌ 操作失败: ${msg}`);
                        }

                        // 发生错误时恢复按钮状态
                        confirmBtn.classList.remove('loading');
                        confirmBtn.disabled = false;
                        confirmBtn.innerText = originalText;
                    }
                } else {
                    this.close();
                }
            };
        }

        // ESC键
        const escHandler = (e) => {
            if (e.key === 'Escape' && this.options.closable) {
                this.close();
                if (this.options.onCancel) this.options.onCancel();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // 静态快捷方法
    static confirm(title, message, onConfirmCallback) {
        // 如果提供了回调函数，直接使用回调模式
        if (typeof onConfirmCallback === 'function') {
            new Modal({
                title,
                content: `<p>${message}</p>`,
                onConfirm: async () => {
                    await onConfirmCallback();
                    return true;
                }
            }).show();
            return;
        }

        // 否则返回 Promise
        return new Promise((resolve) => {
            new Modal({
                title,
                content: `<p>${message}</p>`,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            }).show();
        });
    }

    static alert(title, message) {
        return new Promise((resolve) => {
            new Modal({
                title,
                content: `<p>${message}</p>`,
                footer: `<div class="modal-footer"><button class="btn btn-primary" data-action="confirm">确定</button></div>`,
                onConfirm: () => resolve(true)
            }).show();
        });
    }

    /**
     * 带输入框的提示框
     * @param {string} title 标题
     * @param {string} message 描述
     * @param {string} placeholder 占位文本
     * @param {string} defaultValue 默认值
     * @returns {Promise<string|null>} 用户输入，取消时返回 null
     */
    static prompt(title, message = '', placeholder = '', defaultValue = '') {
        return new Promise((resolve) => {
            let inputEl;
            const modal = new Modal({
                title,
                content: `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${message ? `<p>${message}</p>` : ''}
                        <input type="text" class="form-input" id="modalPromptInput"
                               placeholder="${placeholder || '请输入'}"
                               value="${defaultValue || ''}">
                    </div>
                `,
                onConfirm: () => {
                    const value = inputEl?.value ?? '';
                    resolve(value);
                    return true;
                },
                onCancel: () => {
                    resolve(null);
                }
            });
            modal.show();
            inputEl = modal.overlay?.querySelector('#modalPromptInput');
            if (inputEl) {
                setTimeout(() => inputEl.focus(), 50);
            }
        });
    }

    /**
     * 静态方法：显示自定义模态框
     * @param {Object} options - 模态框配置
     * @returns {Object} { overlay, close } - 返回模态框元素和关闭函数
     */
    static show(options) {
        const modal = new Modal({
            ...options,
            footer: options.footer !== undefined ? options.footer : null
        });
        modal.show();

        // 绑定 data-close 按钮的关闭功能
        if (modal.overlay) {
            modal.overlay.querySelectorAll('[data-close]').forEach(btn => {
                btn.onclick = () => modal.close();
            });
        }

        return {
            overlay: modal.overlay,
            close: () => modal.close()
        };
    }

    /**
     * 静态方法：关闭所有模态框
     */
    static closeAll() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            });
        }
    }
}

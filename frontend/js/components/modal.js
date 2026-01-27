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
                    const originalText = confirmBtn.innerText; // 移到 try 外面
                    try {
                        // 防止重复点击
                        if (confirmBtn.disabled) return;

                        // 设置加载状态
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
                            // Modal.alert('❌ 操作失败', msg); 
                            // 或者直接 alert，只要不卡死就行
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
     * 支持两种调用方式：
     * 1. positional: Modal.prompt(title, message, placeholder, defaultValue)
     * 2. options: Modal.prompt({ title, message, label, placeholder, defaultValue, onConfirm, onCancel })
     */
    static prompt(titleOrOptions, message = '', placeholder = '', defaultValue = '') {
        const isOptions = typeof titleOrOptions === 'object' && titleOrOptions !== null;
        const options = isOptions ? titleOrOptions : {
            title: titleOrOptions,
            message: message,
            placeholder: placeholder,
            defaultValue: defaultValue
        };

        // 兼容 map.js 中使用的 'label' 作为 'message'
        const displayMessage = options.message || options.label || '';

        return new Promise((resolve) => {
            let inputEl;
            const modal = new Modal({
                title: options.title || '提示',
                content: `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${displayMessage ? `<p>${displayMessage}</p>` : ''}
                        <input type="text" class="form-input" id="modalPromptInput"
                               placeholder="${options.placeholder || '请输入'}"
                               value="${options.defaultValue || ''}">
                    </div>
                `,
                onConfirm: async () => {
                    const value = inputEl?.value ?? '';

                    // 如果提供了 onConfirm 回调（如 map.js 中那样）
                    if (typeof options.onConfirm === 'function') {
                        const result = await options.onConfirm(value);
                        // 如果回调返回 false，则不关闭弹窗
                        if (result === false) return false;
                    }

                    resolve(value);
                    return true;
                },
                onCancel: () => {
                    if (typeof options.onCancel === 'function') {
                        options.onCancel();
                    }
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
     * 静态方法：快速创建表单模态框
     * @param {Object} options 
     */
    static form(options = {}) {
        const { fields = [], onSubmit, ...modalOptions } = options;

        const formId = Utils.uniqueId('modal-form-');
        const content = `
            <form id="${formId}">
                ${fields.map(field => {
            const id = Utils.uniqueId('field-');
            const label = field.label || field.text || field.name;
            const type = field.type || 'text';
            const required = field.required ? 'required' : '';
            const placeholder = field.placeholder || '';
            const value = field.value || '';

            if (type === 'checkbox') {
                return `
                            <div class="form-group">
                                <label class="checkbox" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" name="${field.name}" ${value ? 'checked' : ''}>
                                    <span>${label}</span>
                                </label>
                            </div>
                        `;
            }

            if (type === 'textarea') {
                return `
                    <div class="form-group">
                        <label class="form-label" for="${id}">${label}</label>
                        <textarea class="form-input" id="${id}" name="${field.name}" 
                                  placeholder="${placeholder}" ${required}>${value}</textarea>
                    </div>
                `;
            }

            if (type === 'select') {
                const optionsHtml = (field.options || []).map(opt => `
                    <option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.text || opt.label || opt.value}</option>
                `).join('');
                return `
                    <div class="form-group">
                        <label class="form-label" for="${id}">${label}</label>
                        <select class="form-input" id="${id}" name="${field.name}" ${required}>
                            ${optionsHtml}
                        </select>
                    </div>
                `;
            }

            return `
                <div class="form-group">
                    <label class="form-label" for="${id}">${label}</label>
                    <input type="${type}" class="form-input" id="${id}" name="${field.name}" 
                           value="${value}" placeholder="${placeholder}" ${required}>
                </div>
            `;
        }).join('')}
            </form>
        `;

        return new Modal({
            ...modalOptions,
            content,
            onConfirm: async () => {
                const form = document.getElementById(formId);
                if (!form.reportValidity()) return false;

                const formData = new FormData(form);
                const data = {};
                fields.forEach(f => {
                    if (f.type === 'checkbox') {
                        data[f.name] = formData.has(f.name);
                    } else if (f.type === 'number') {
                        data[f.name] = Number(formData.get(f.name));
                    } else {
                        data[f.name] = formData.get(f.name);
                    }
                });

                if (onSubmit) {
                    await onSubmit(data);
                }
                return true;
            }
        }).show();
    }

    /**
     * 静态方法：显示选择对话框
     * @param {Object} options { title, content, options: [{label, value}] }
     * @returns {Promise<any>}
     */
    static select(options = {}) {
        return new Promise((resolve) => {
            const { title, content = '', options: selectOptions = [] } = options;
            const containerId = Utils.uniqueId('modal-select-');

            const modalContent = `
                <div id="${containerId}" class="modal-select-container">
                    ${content ? `<p style="margin-bottom: 12px; color: var(--color-text-secondary);">${content}</p>` : ''}
                    <div class="list-group">
                        ${selectOptions.map(opt => `
                            <div class="list-item list-item-clickable" data-value="${opt.value}">
                                <div class="list-item-content">
                                    <div class="list-item-title">${opt.label}</div>
                                </div>
                                <i class="ri-arrow-right-s-line"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            const modal = new Modal({
                title,
                content: modalContent,
                footer: false // 不显示页脚按钮
            });

            modal.show();

            const container = document.getElementById(containerId);
            if (container) {
                container.querySelectorAll('.list-item').forEach(item => {
                    item.onclick = () => {
                        const value = item.dataset.value;
                        modal.close();
                        resolve(value);
                    };
                });
            }

            // esc 或点击关闭按钮处理
            modal.options.onCancel = () => resolve(null);
        });
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

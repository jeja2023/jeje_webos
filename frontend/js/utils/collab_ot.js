/**
 * 协同编辑操作转换(OT)引擎
 * 纯JavaScript实现，不依赖外部库
 * 支持文本插入、删除、替换的冲突解决
 */

class CollabOT {
    constructor() {
        // 操作历史
        this.history = [];
        // 当前版本号
        this.version = 0;
        // 待发送的本地操作队列
        this.pendingOps = [];
        // 是否正在同步
        this.syncing = false;
        // 回调函数
        this.onRemoteOp = null;
        this.onVersionChange = null;
    }

    /**
     * 操作类型定义
     */
    static OP_TYPE = {
        INSERT: 'insert',    // 插入文本
        DELETE: 'delete',    // 删除文本
        REPLACE: 'replace',  // 替换文本
        RETAIN: 'retain'     // 保持位置
    };

    /**
     * 创建插入操作
     * @param {number} pos - 插入位置
     * @param {string} text - 插入文本
     * @param {number} clientVersion - 客户端版本
     */
    createInsertOp(pos, text, clientVersion) {
        return {
            type: CollabOT.OP_TYPE.INSERT,
            pos,
            text,
            len: text.length,
            version: clientVersion,
            timestamp: Date.now(),
            id: this.generateOpId()
        };
    }

    /**
     * 创建删除操作
     * @param {number} pos - 删除起始位置
     * @param {number} len - 删除长度
     * @param {string} deletedText - 被删除的文本（用于撤销）
     * @param {number} clientVersion - 客户端版本
     */
    createDeleteOp(pos, len, deletedText, clientVersion) {
        return {
            type: CollabOT.OP_TYPE.DELETE,
            pos,
            len,
            deletedText,
            version: clientVersion,
            timestamp: Date.now(),
            id: this.generateOpId()
        };
    }

    /**
     * 创建替换操作
     * @param {number} pos - 替换起始位置
     * @param {number} len - 被替换文本长度
     * @param {string} text - 新文本
     * @param {string} oldText - 旧文本
     * @param {number} clientVersion - 客户端版本
     */
    createReplaceOp(pos, len, text, oldText, clientVersion) {
        return {
            type: CollabOT.OP_TYPE.REPLACE,
            pos,
            len,
            text,
            oldText,
            version: clientVersion,
            timestamp: Date.now(),
            id: this.generateOpId()
        };
    }

    /**
     * 生成唯一操作ID
     */
    generateOpId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 操作转换核心算法
     * 将远程操作转换为可以应用到本地文档的操作
     * @param {Object} remoteOp - 远程操作
     * @param {Object} localOp - 本地操作
     * @returns {Object} - 转换后的远程操作
     */
    transform(remoteOp, localOp) {
        // 如果操作ID相同，跳过（重复操作）
        if (remoteOp.id === localOp.id) {
            return null;
        }

        const transformedOp = { ...remoteOp };

        // 根据操作类型进行转换
        if (localOp.type === CollabOT.OP_TYPE.INSERT) {
            // 本地插入操作影响远程操作位置
            if (remoteOp.pos >= localOp.pos) {
                transformedOp.pos += localOp.len;
            }
        } else if (localOp.type === CollabOT.OP_TYPE.DELETE) {
            // 本地删除操作影响远程操作位置
            if (remoteOp.pos >= localOp.pos + localOp.len) {
                // 远程位置在删除区域之后
                transformedOp.pos -= localOp.len;
            } else if (remoteOp.pos >= localOp.pos) {
                // 远程位置在删除区域内
                transformedOp.pos = localOp.pos;

                // 如果远程操作也是删除，需要调整长度
                if (remoteOp.type === CollabOT.OP_TYPE.DELETE) {
                    const overlap = Math.min(
                        remoteOp.pos + remoteOp.len,
                        localOp.pos + localOp.len
                    ) - remoteOp.pos;
                    if (overlap > 0) {
                        transformedOp.len = Math.max(0, remoteOp.len - overlap);
                    }
                }
            }
        } else if (localOp.type === CollabOT.OP_TYPE.REPLACE) {
            // 替换 = 删除 + 插入
            const netChange = localOp.text.length - localOp.len;
            if (remoteOp.pos >= localOp.pos + localOp.len) {
                transformedOp.pos += netChange;
            } else if (remoteOp.pos >= localOp.pos) {
                transformedOp.pos = localOp.pos + localOp.text.length;
            }
        }

        return transformedOp;
    }

    /**
     * 应用操作到文本
     * @param {string} text - 原始文本
     * @param {Object} op - 操作
     * @returns {string} - 新文本
     */
    applyOp(text, op) {
        if (!op) return text;

        switch (op.type) {
            case CollabOT.OP_TYPE.INSERT:
                return text.slice(0, op.pos) + op.text + text.slice(op.pos);

            case CollabOT.OP_TYPE.DELETE:
                return text.slice(0, op.pos) + text.slice(op.pos + op.len);

            case CollabOT.OP_TYPE.REPLACE:
                return text.slice(0, op.pos) + op.text + text.slice(op.pos + op.len);

            default:
                return text;
        }
    }

    /**
     * 接收远程操作并应用
     * @param {Object} remoteOp - 远程操作
     * @param {string} currentText - 当前文本
     * @returns {Object} - { text: 新文本, op: 转换后的操作 }
     */
    receiveRemoteOp(remoteOp, currentText) {
        // 对待发送的本地操作进行转换
        let transformedOp = remoteOp;

        for (const localOp of this.pendingOps) {
            transformedOp = this.transform(transformedOp, localOp);
            if (!transformedOp) {
                return { text: currentText, op: null };
            }
        }

        // 应用转换后的操作
        const newText = this.applyOp(currentText, transformedOp);

        // 更新版本
        this.version = Math.max(this.version, remoteOp.version) + 1;

        // 记录历史
        this.history.push({
            ...transformedOp,
            appliedAt: Date.now()
        });

        // 触发回调
        if (this.onRemoteOp) {
            this.onRemoteOp(transformedOp, newText);
        }

        return { text: newText, op: transformedOp };
    }

    /**
     * 添加本地操作到队列
     * @param {Object} op - 本地操作
     */
    addLocalOp(op) {
        op.version = this.version;
        this.pendingOps.push(op);
        this.history.push(op);
        this.version++;

        if (this.onVersionChange) {
            this.onVersionChange(this.version);
        }
    }

    /**
     * 确认操作已发送成功
     * @param {string} opId - 操作ID
     */
    confirmOp(opId) {
        const index = this.pendingOps.findIndex(op => op.id === opId);
        if (index !== -1) {
            this.pendingOps.splice(index, 1);
        }
    }

    /**
     * 获取待发送的操作
     */
    getPendingOps() {
        return [...this.pendingOps];
    }

    /**
     * 清空待发送队列
     */
    clearPendingOps() {
        this.pendingOps = [];
    }

    /**
     * 重置状态
     */
    reset() {
        this.history = [];
        this.version = 0;
        this.pendingOps = [];
        this.syncing = false;
    }

    /**
     * 获取操作历史
     * @param {number} limit - 返回条数限制
     */
    getHistory(limit = 50) {
        return this.history.slice(-limit);
    }
}


/**
 * 协同编辑器包装类
 * 将OT引擎与DOM编辑器绑定
 */
class CollabEditor {
    constructor(editorElement, options = {}) {
        this.editor = editorElement;
        this.ot = new CollabOT();
        this.ws = null;
        this.documentId = options.documentId;
        this.userId = options.userId;
        this.userName = options.userName || '匿名用户';

        // 上一次的文本内容（用于计算差异）
        this.lastText = '';

        // 防抖定时器
        this.syncTimer = null;
        this.syncDelay = options.syncDelay || 300;

        // 是否启用协同
        this.enabled = false;

        // 绑定事件
        this.bindEvents();
    }

    /**
     * 绑定编辑器事件
     */
    bindEvents() {
        // 输入事件
        this.editor.addEventListener('input', (e) => {
            if (!this.enabled) return;
            this.handleInput(e);
        });

        // 粘贴事件
        this.editor.addEventListener('paste', (e) => {
            if (!this.enabled) return;
            // 延迟处理以获取粘贴后的内容
            setTimeout(() => this.handleInput(e), 0);
        });

        // 剪切事件
        this.editor.addEventListener('cut', (e) => {
            if (!this.enabled) return;
            setTimeout(() => this.handleInput(e), 0);
        });
    }

    /**
     * 处理输入事件，计算操作差异
     */
    handleInput(e) {
        // 清除之前的定时器
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }

        // 防抖同步
        this.syncTimer = setTimeout(() => {
            this.syncChanges();
        }, this.syncDelay);
    }

    /**
     * 同步本地变更
     */
    syncChanges() {
        const currentText = this.editor.innerText || '';

        if (currentText === this.lastText) {
            return;
        }

        // 计算差异（简化版：使用最长公共子序列）
        const ops = this.computeDiff(this.lastText, currentText);

        // 发送操作
        for (const op of ops) {
            this.ot.addLocalOp(op);
            this.sendOp(op);
        }

        this.lastText = currentText;
    }

    /**
     * 计算文本差异
     * @param {string} oldText - 旧文本
     * @param {string} newText - 新文本
     * @returns {Array} - 操作数组
     */
    computeDiff(oldText, newText) {
        const ops = [];

        // 找到公共前缀长度
        let prefixLen = 0;
        while (prefixLen < oldText.length &&
            prefixLen < newText.length &&
            oldText[prefixLen] === newText[prefixLen]) {
            prefixLen++;
        }

        // 找到公共后缀长度
        let suffixLen = 0;
        while (suffixLen < oldText.length - prefixLen &&
            suffixLen < newText.length - prefixLen &&
            oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
            suffixLen++;
        }

        // 计算变化部分
        const deleteLen = oldText.length - prefixLen - suffixLen;
        const insertText = newText.slice(prefixLen, newText.length - suffixLen);

        if (deleteLen > 0 && insertText.length > 0) {
            // 替换操作
            ops.push(this.ot.createReplaceOp(
                prefixLen,
                deleteLen,
                insertText,
                oldText.slice(prefixLen, prefixLen + deleteLen),
                this.ot.version
            ));
        } else if (deleteLen > 0) {
            // 删除操作
            ops.push(this.ot.createDeleteOp(
                prefixLen,
                deleteLen,
                oldText.slice(prefixLen, prefixLen + deleteLen),
                this.ot.version
            ));
        } else if (insertText.length > 0) {
            // 插入操作
            ops.push(this.ot.createInsertOp(
                prefixLen,
                insertText,
                this.ot.version
            ));
        }

        return ops;
    }

    /**
     * 发送操作到服务器
     */
    sendOp(op) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'content',
            data: {
                op,
                user_id: this.userId,
                user_name: this.userName,
                document_id: this.documentId
            }
        }));
    }

    /**
     * 接收远程操作
     */
    receiveOp(remoteOp) {
        if (!this.enabled) return;

        const currentText = this.editor.innerText || '';
        const { text: newText, op } = this.ot.receiveRemoteOp(remoteOp, currentText);

        if (op && newText !== currentText) {
            // 保存光标位置
            const selection = window.getSelection();
            const cursorPos = this.getCursorPosition();

            // 应用更改
            this.editor.innerText = newText;
            this.lastText = newText;

            // 恢复光标位置（考虑操作影响）
            this.restoreCursorPosition(cursorPos, op);
        }
    }

    /**
     * 获取当前光标位置
     */
    getCursorPosition() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return 0;

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return preCaretRange.toString().length;
    }

    /**
     * 恢复光标位置
     */
    restoreCursorPosition(oldPos, op) {
        let newPos = oldPos;

        // 根据操作调整光标位置
        if (op) {
            if (op.type === CollabOT.OP_TYPE.INSERT && op.pos <= oldPos) {
                newPos += op.len;
            } else if (op.type === CollabOT.OP_TYPE.DELETE && op.pos < oldPos) {
                newPos = Math.max(op.pos, oldPos - op.len);
            } else if (op.type === CollabOT.OP_TYPE.REPLACE && op.pos < oldPos) {
                const netChange = op.text.length - op.len;
                if (oldPos >= op.pos + op.len) {
                    newPos += netChange;
                } else {
                    newPos = op.pos + op.text.length;
                }
            }
        }

        // 设置光标位置
        this.setCursorPosition(newPos);
    }

    /**
     * 设置光标位置
     */
    setCursorPosition(pos) {
        const selection = window.getSelection();
        const range = document.createRange();

        let currentPos = 0;
        let found = false;

        const traverse = (node) => {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const len = node.textContent.length;
                if (currentPos + len >= pos) {
                    range.setStart(node, pos - currentPos);
                    range.collapse(true);
                    found = true;
                    return;
                }
                currentPos += len;
            } else {
                for (const child of node.childNodes) {
                    traverse(child);
                }
            }
        };

        traverse(this.editor);

        if (found) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    /**
     * 启用协同编辑
     */
    enable(ws) {
        this.ws = ws;
        this.enabled = true;
        this.lastText = this.editor.innerText || '';
        this.ot.reset();
    }

    /**
     * 禁用协同编辑
     */
    disable() {
        this.enabled = false;
        this.ws = null;
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
    }

    /**
     * 设置初始内容
     */
    setContent(text) {
        this.editor.innerText = text;
        this.lastText = text;
    }

    /**
     * 获取当前内容
     */
    getContent() {
        return this.editor.innerText || '';
    }
}

// 导出
window.CollabOT = CollabOT;
window.CollabEditor = CollabEditor;

/**
 * Markdown 编辑器 (专业增强版)
 * 适配主流 Markdown 语法
 */
class MarkdownWysiwygEditor {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.options = {
            placeholder: '开始编写...',
            autofocus: true,
            readOnly: false,
            onChange: null,
            onTitleSync: null, // 标题同步回调
            onSaveStatus: null, // 保存状态回调
            ...options
        };

        this.editor = null;
        this.isComposing = false;

        // 历史记录堆栈
        this.history = [];
        this.historyIndex = -1;
        this.historyLimit = 50;
        this.saveTimer = null;

        this.init();
    }

    init() {
        this.createEditor();
        this.bindEvents();
        this.setContent(this.options.initialValue || '');
        if (this.options.autofocus) {
            setTimeout(() => {
                this.editor.focus();
                // 将光标移至末尾
                const range = document.createRange();
                range.selectNodeContents(this.editor);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }, 100);
        }
    }

    createEditor() {
        this.container.innerHTML = '';
        this.editor = document.createElement('div');
        this.editor.className = 'markdown-wysiwyg-editor' + (this.options.readOnly ? ' read-only' : '');
        this.editor.contentEditable = !this.options.readOnly;
        if (!this.options.readOnly) {
            this.editor.setAttribute('data-placeholder', this.options.placeholder);
        }
        this.container.appendChild(this.editor);
    }

    bindEvents() {
        this.editor.addEventListener('input', (e) => {
            if (!this.isComposing) {
                this.handleInput(e);
                this.debouncedSaveHistory();
            }
        });
        this.editor.addEventListener('compositionstart', () => this.isComposing = true);
        this.editor.addEventListener('compositionend', (e) => {
            this.isComposing = false;
            this.handleInput(e);
            this.safeSaveHistory(); // 输入结束立即保存
        });
        this.editor.addEventListener('keydown', (e) => {
            // 处理回车
            if (e.key === 'Enter') {
                if (e.ctrlKey) {
                    // Ctrl+Enter 提交或换行
                    return;
                }
                e.preventDefault();
                this.handleEnter();
            }

            // 快捷键支持
            if (e.ctrlKey || e.metaKey) {
                // Undo/Redo
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) this.redo();
                    else this.undo();
                    return;
                }
                if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    this.redo();
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.toggleFormat('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.toggleFormat('italic');
                        break;
                    case 'k':
                        e.preventDefault();
                        this.insertLink();
                        break;
                    case '`':
                        e.preventDefault();
                        this.toggleFormat('code');
                        break;
                    case 'h':
                        // 循环切换 H1-H3
                        e.preventDefault();
                        this.handleHeadingShortcut();
                        break;
                }
            }

            // Tab 缩进
            if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTab(e.shiftKey);
            }
        });

        // 点击任务列表复选框
        this.editor.addEventListener('click', (e) => {
            if (e.target.classList.contains('md-task-checkbox')) {
                this.toggleTask(e.target);
            }
        });

        // 监听光标移动，高亮当前行
        this.editor.addEventListener('click', () => this.updateActiveLine());
        this.editor.addEventListener('keyup', () => this.updateActiveLine());

        // 新增：粘贴处理 (支持图片上传)
        this.editor.addEventListener('paste', (e) => this.handlePaste(e));

        // 新增：拖拽上传
        this.editor.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.editor.classList.add('drag-over');
        });
        this.editor.addEventListener('dragleave', () => {
            this.editor.classList.remove('drag-over');
        });
        this.editor.addEventListener('drop', (e) => {
            e.preventDefault();
            this.editor.classList.remove('drag-over');
            this.handleDrop(e);
        });
    }

    async handlePaste(e) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        // 1. 优先处理图片上传
        const items = clipboardData.items;
        if (items) {
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        await this.uploadAndInsertImage(file);
                        return;
                    }
                }
            }
        }

        // 2. 处理文本粘贴 (关键修复：支持 Markdown 源码粘贴并即时渲染)
        const text = clipboardData.getData('text/plain');
        if (text) {
            e.preventDefault();
            this.insertMarkdownAtCursor(text);
        }
    }

    /**
     * 在光标处插入 Markdown 文本并重绘样式
     */
    insertMarkdownAtCursor(text) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        let line = this.getLineElement(range.startContainer);

        // 如果光标不在 md-line 内（比如编辑器为空或在间隙），则创建一个新行
        if (!line) {
            line = document.createElement('div');
            line.className = 'md-line';
            line.innerHTML = '<br>';
            this.editor.appendChild(line);
            const newRange = document.createRange();
            newRange.setStart(line, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }

        const lines = text.split(/\r?\n/);
        const currentRaw = (line.getAttribute('data-raw') || line.innerText || '').replace(/\s+$/, '');
        const offset = this.getCaretOffsetInLine(line);

        if (lines.length === 1) {
            // 单行粘贴：直接插入到当前光标位置
            const newRaw = currentRaw.substring(0, offset) + text + currentRaw.substring(offset);
            line.innerText = newRaw;
            this.processLine(line);
            this.setCaretOffsetInLine(line, offset + text.length);
        } else {
            // 多行粘贴：拆分当前行，中间插入新行
            const headRaw = currentRaw.substring(0, offset);
            const tailRaw = currentRaw.substring(offset);

            // 修改当前行 (第一部分)
            line.innerText = headRaw + lines[0];
            this.processLine(line);

            let lastLine = line;
            // 插入中间行
            for (let i = 1; i < lines.length - 1; i++) {
                const newLine = document.createElement('div');
                newLine.className = 'md-line';
                newLine.innerText = lines[i];
                lastLine.after(newLine);
                this.processLine(newLine);
                lastLine = newLine;
            }

            // 插入最后一行（合并尾部剩余内容）
            const finalLine = document.createElement('div');
            finalLine.className = 'md-line';
            finalLine.innerText = lines[lines.length - 1] + tailRaw;
            lastLine.after(finalLine);
            this.processLine(finalLine);

            // 光标定位到最后一行粘贴内容的末尾
            this.setCaretOffsetInLine(finalLine, lines[lines.length - 1].length);
        }

        this.updateCodeBlocks();
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
        this.updateActiveLine();
        this.debouncedSaveHistory();
    }

    async handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            for (const file of files) {
                if (file.type.indexOf('image') !== -1) {
                    await this.uploadAndInsertImage(file);
                }
            }
        }
    }

    async uploadAndInsertImage(file) {
        try {
            if (window.Toast) window.Toast.info('正在上传图片...');

            // 使用系统通用的 StorageApi
            const res = await window.StorageApi.upload(file);

            const data = res.data;
            if (data && data.url) {
                let imageUrl = data.url;

                // 补全基础路径
                if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
                    const apiBase = (window.Config?.apiBase || '/api/v1');
                    imageUrl = apiBase + (imageUrl.startsWith('/') ? '' : '/') + imageUrl;
                }

                // 对于私有存储，必须附加 Token 才能通过浏览器 <img> 标签加载
                if (Utils.getToken()) {
                    imageUrl = Utils.withToken(imageUrl);
                }

                this.insertImage(imageUrl, file.name);
                if (window.Toast) window.Toast.success('图片上传成功');
            } else {
                throw new Error('响应格式错误：缺失 URL');
            }
        } catch (error) {
            if (window.Toast) window.Toast.error('图片上传失败: ' + (error.message || '网络错误'));
        }
    }

    updateActiveLine() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const activeLine = this.getLineElement(range.startContainer);

        this.editor.querySelectorAll('.md-line.active').forEach(line => {
            if (line !== activeLine) line.classList.remove('active');
        });

        if (activeLine) activeLine.classList.add('active');
    }

    handleInput() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const line = this.getLineElement(range.startContainer);
        if (line && line.isConnected) {
            const offset = this.getCaretOffsetInLine(line);
            this.processLine(line);
            this.updateCodeBlocks(); // 重新计算全局代码块状态
            this.setCaretOffsetInLine(line, offset);

            // 智能标题同步：寻找文档中的第一个一级标题
            this.checkTitleSync();
        }
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
        this.updateActiveLine();
    }

    handleEnter() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const currentLine = this.getLineElement(range.startContainer);
        const newLine = document.createElement('div');
        newLine.className = 'md-line';
        newLine.innerHTML = '<br>';

        if (currentLine) {
            const raw = currentLine.getAttribute('data-raw') || '';
            const isCodeFence = currentLine.classList.contains('md-code-fence');
            const isCodeLine = currentLine.classList.contains('md-code-block-line');
            // 使用 md-code-block-end 类来正确判断是否是结束围栏
            const isEndFence = currentLine.classList.contains('md-code-block-end');
            // 判断是否是开始围栏（有 md-code-fence 但没有 md-code-block-end）
            const isStartFence = isCodeFence && !isEndFence;

            // 在结束围栏回车 → 跳出代码块，创建普通行
            if (isEndFence) {
                currentLine.after(newLine);
                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                this.updateCodeBlocks();
                if (this.options.onChange) this.options.onChange(this.getMarkdown());
                this.updateActiveLine();
                return;
            }

            // 在开始围栏回车 → 进入代码块，创建代码内容行
            if (isStartFence) {
                newLine.className = 'md-line md-code-block-line';
                newLine.setAttribute('data-raw', '');
                currentLine.after(newLine);
                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                this.updateCodeBlocks();
                if (this.options.onChange) this.options.onChange(this.getMarkdown());
                this.updateActiveLine();
                return;
            }

            // 在代码内容行回车
            if (isCodeLine) {
                const currentRaw = currentLine.getAttribute('data-raw') || '';

                // 如果当前代码行是空的，跳出代码块
                if (!currentRaw.trim()) {
                    // 找到当前代码块的结束围栏（从当前位置往后找最近的一个）
                    let endFence = null;
                    let sibling = currentLine.nextSibling;
                    while (sibling) {
                        if (sibling.classList && sibling.classList.contains('md-code-block-end')) {
                            endFence = sibling;
                            break;
                        }
                        sibling = sibling.nextSibling;
                    }

                    // 移除当前空行
                    currentLine.remove();

                    // 在结束围栏后创建新的普通行
                    if (endFence) {
                        endFence.after(newLine);
                    } else {
                        // 兜底：如果没找到结束围栏，可能是在编辑器末尾
                        this.editor.appendChild(newLine);
                    }

                    const newRange = document.createRange();
                    newRange.setStart(newLine, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    this.updateCodeBlocks();
                    if (this.options.onChange) this.options.onChange(this.getMarkdown());
                    this.updateActiveLine();
                    return;
                }

                // 否则继续创建代码块内的新行
                newLine.className = 'md-line md-code-block-line';
                newLine.setAttribute('data-raw', '');
                currentLine.after(newLine);
                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                this.updateCodeBlocks();
                if (this.options.onChange) this.options.onChange(this.getMarkdown());
                this.updateActiveLine();
                return;
            }

            // 处理列表自动延续（非代码区域）
            const listMatch = raw.match(/^(\s*([-*+]|\d+\.))\s+/);
            if (listMatch && raw.trim().length > listMatch[1].length) {
                let marker = listMatch[2];
                if (/\d+\./.test(marker)) {
                    marker = (parseInt(marker) + 1) + '.';
                }
                const indent = listMatch[1].replace(listMatch[2], marker);
                newLine.innerText = indent + ' ';
            } else if (listMatch && raw.trim().length === listMatch[1].trim().length) {
                currentLine.innerText = '';
                this.processLine(currentLine);
                return;
            }
            currentLine.after(newLine);
        } else {
            this.editor.appendChild(newLine);
        }

        const newRange = document.createRange();
        newRange.setStart(newLine, newLine.childNodes.length > 0 ? (newLine.innerText === '' ? 0 : 1) : 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        if (newLine.innerText.trim()) {
            this.processLine(newLine);
        }

        this.updateCodeBlocks();
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
        this.updateActiveLine();
    }

    handleTab(isShift) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const line = this.getLineElement(range.startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || line.innerText;
        if (isShift) {
            if (raw.startsWith('    ')) raw = raw.substring(4);
            else if (raw.startsWith('\t')) raw = raw.substring(1);
        } else {
            raw = '    ' + raw;
        }

        const offset = this.getCaretOffsetInLine(line);
        line.innerText = raw;
        this.processLine(line);
        this.setCaretOffsetInLine(line, isShift ? Math.max(0, offset - 4) : offset + 4);
    }

    handleHeadingShortcut() {
        const selection = window.getSelection();
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || '';
        const match = raw.match(/^(#{1,6})\s/);
        let level = match ? match[1].length : 0;

        level = (level + 1) % 4; // 0, 1, 2, 3 循环
        this.insertHeading(level);
    }

    // --- 代码块状态管理 ---
    updateCodeBlocks() {
        const lines = Array.from(this.editor.childNodes);
        let inBlock = false;
        let currentLang = '';

        lines.forEach((line, index) => {
            if (!(line instanceof HTMLElement)) return;

            // 优先使用 data-raw，其次 textContent (更可靠)，最后 innerText
            // 对于 font-size: 0 的元素，innerText 可能为空，textContent 能正确获取内容
            const text = (line.getAttribute('data-raw') || line.textContent || line.innerText || '').trim();

            if (text.startsWith('```')) {
                if (!inBlock) {
                    // 代码块开始
                    inBlock = true;
                    // 保存语言标识，但去除反引号
                    currentLang = text.substring(3).trim();
                    line.className = 'md-line md-code-fence';
                    line.setAttribute('data-lang', currentLang);
                } else {
                    // 代码块结束
                    inBlock = false;
                    line.className = 'md-line md-code-fence md-code-block-end';
                    line.removeAttribute('data-lang');
                }
                // 确保围栏行有正确的内容（即使隐藏）
                if (line.innerHTML !== this.escapeHtml(text)) {
                    line.innerHTML = this.escapeHtml(text);
                }
            } else if (inBlock) {
                // 代码块内部行 - 只设置类，不改变内容
                line.className = 'md-line md-code-block-line';
                // 确保内容以纯文本显示
                const rawText = line.getAttribute('data-raw') || line.innerText || '';
                if (line.innerHTML !== this.escapeHtml(rawText)) {
                    line.innerHTML = this.escapeHtml(rawText) || '<br>';
                }
            } else {
                // 普通行 - 如果之前被错误标记为代码块，清除并重新处理
                if (line.classList.contains('md-code-block-line') || line.classList.contains('md-code-fence')) {
                    line.className = 'md-line';
                    this.processLine(line);
                }
            }
        });
    }

    findFirstHeading(level = 1) {
        const lines = Array.from(this.editor.childNodes);
        const prefix = '#'.repeat(level) + ' ';
        for (const line of lines) {
            if (!(line instanceof HTMLElement)) continue;
            const text = (line.getAttribute('data-raw') || line.innerText || '').trim();
            if (text.startsWith(prefix)) {
                return text.substring(prefix.length).trim();
            }
            // 如果遇到非空行且不是标题，Typora 通常只看开头几个非空行
            if (text.length > 0 && !text.startsWith('#')) {
                // 如果前几行就有了实质内容但没标题，通常就不找了，或者只找前3行
                // 这里我们稍微宽容点，找前20行
                if (lines.indexOf(line) > 20) break;
            }
        }
        return null;
    }

    // --- 工具栏操作方法 ---

    insertHeading(level) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const line = this.getLineElement(range.startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || line.innerText;
        // 移除现有标题标识
        raw = raw.replace(/^#{1,6}\s/, '');

        if (level > 0) {
            raw = '#'.repeat(level) + ' ' + raw;
        }

        line.innerText = raw;
        this.processLine(line);
        this.setCaretOffsetInLine(line, level > 0 ? level + 1 : 0);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
        this.checkTitleSync();
    }

    toggleFormat(type) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        let syntax = '';
        switch (type) {
            case 'bold': syntax = '**'; break;
            case 'italic': syntax = '*'; break;
            case 'strikethrough': syntax = '~~'; break;
            case 'code': syntax = '`'; break;
        }

        if (selectedText) {
            // 对选中文段进行加减语法
            const parent = range.commonAncestorContainer;
            const line = this.getLineElement(parent);
            if (!line) return;

            let raw = line.getAttribute('data-raw') || line.innerText;
            const offset = this.getCaretOffsetInLine(line);
            const start = offset - selectedText.length;

            // 简单的包裹逻辑
            const before = raw.substring(0, start);
            const middle = raw.substring(start, offset);
            const after = raw.substring(offset);

            let newRaw;
            if (middle.startsWith(syntax) && middle.endsWith(syntax)) {
                newRaw = before + middle.substring(syntax.length, middle.length - syntax.length) + after;
            } else {
                newRaw = before + syntax + middle + syntax + after;
            }

            line.innerText = newRaw;
            this.processLine(line);
            this.setCaretOffsetInLine(line, offset + syntax.length);
        } else {
            // 在当前位置插入语法符号
            const textNode = document.createTextNode(syntax + syntax);
            range.insertNode(textNode);
            range.setStart(textNode, syntax.length);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            const line = this.getLineElement(textNode);
            if (line) this.processLine(line);
        }
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertList(type) {
        const selection = window.getSelection();
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || line.innerText;
        raw = raw.replace(/^(\s*([-*+]|\d+\.))\s+/, '');

        const prefix = type === 'ol' ? '1. ' : '- ';
        line.innerText = prefix + raw;
        this.processLine(line);
        this.setCaretOffsetInLine(line, prefix.length);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertTask() {
        const selection = window.getSelection();
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || line.innerText;
        raw = raw.replace(/^(\s*([-*+]|\d+\.))\s+/, '');

        const prefix = '- [ ] ';
        line.innerText = prefix + raw;
        this.processLine(line);
        this.setCaretOffsetInLine(line, prefix.length);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertBlockquote() {
        const selection = window.getSelection();
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        let raw = line.getAttribute('data-raw') || line.innerText;
        if (raw.startsWith('> ')) {
            raw = raw.substring(2);
        } else {
            raw = '> ' + raw;
        }

        line.innerText = raw;
        this.processLine(line);
        this.setCaretOffsetInLine(line, raw.startsWith('> ') ? 2 : 0);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertCodeBlock() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        // 创建三行结构：开始围栏 + 内容行 + 结束围栏
        const startLine = document.createElement('div');
        startLine.className = 'md-line md-code-fence';
        startLine.innerText = '```';
        startLine.setAttribute('data-raw', '```');

        const contentLine = document.createElement('div');
        contentLine.className = 'md-line md-code-block-line';
        contentLine.innerHTML = '<br>';
        contentLine.setAttribute('data-raw', '');

        const endLine = document.createElement('div');
        endLine.className = 'md-line md-code-fence';
        endLine.innerText = '```';
        endLine.setAttribute('data-raw', '```');

        line.after(endLine);
        line.after(contentLine);
        line.after(startLine);

        this.processLine(startLine);
        this.processLine(endLine);
        this.updateCodeBlocks();

        // 将光标放在内容行，便于用户立即输入代码
        const range = document.createRange();
        range.setStart(contentLine, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        this.updateActiveLine();

        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertLink() {
        const url = prompt('请输入链接地址:', 'https://');
        if (!url) return;

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const text = range.toString() || '链接描述';

        const linkMarkdown = `[${text}](${url})`;
        const textNode = document.createTextNode(linkMarkdown);
        range.deleteContents();
        range.insertNode(textNode);

        const line = this.getLineElement(textNode);
        if (line) this.processLine(line);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertImage(url, title = '图片描述') {
        if (!url) {
            url = prompt('请输入图片地址:', 'https://');
            if (!url) return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const imgMarkdown = `![${title}](${url})`;
        const textNode = document.createTextNode(imgMarkdown);
        range.deleteContents();
        range.insertNode(textNode);

        const line = this.getLineElement(textNode);
        if (line) this.processLine(line);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }



    insertHr() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        const hrLine = document.createElement('div');
        hrLine.className = 'md-line';
        hrLine.innerText = '---';
        line.after(hrLine);
        this.processLine(hrLine);

        // 在分割线后创建一个新空行，方便用户继续输入
        const newLine = document.createElement('div');
        newLine.className = 'md-line';
        newLine.innerHTML = '<br>';
        hrLine.after(newLine);

        // 将光标移到新行
        const range = document.createRange();
        range.setStart(newLine, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        this.updateActiveLine();

        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    insertTable() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const line = this.getLineElement(selection.getRangeAt(0).startContainer);
        if (!line) return;

        const tableLines = [
            '| 标题1 | 标题2 |',
            '| --- | --- |',
            '| 内容1 | 内容2 |'
        ];

        let lastLine = line;
        tableLines.forEach(text => {
            const l = document.createElement('div');
            l.className = 'md-line';
            l.innerText = text;
            lastLine.after(l);
            this.processLine(l);
            lastLine = l;
        });

        // 将光标移到表格最后一行末尾
        const range = document.createRange();
        range.selectNodeContents(lastLine);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        this.updateActiveLine();

        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    toggleTask(checkbox) {
        const line = this.getLineElement(checkbox);
        if (!line) return;
        let raw = line.getAttribute('data-raw') || '';
        if (raw.includes('[ ]')) raw = raw.replace('[ ]', '[x]');
        else raw = raw.replace(/\[[xX]\]/, '[ ]');
        line.innerText = raw;
        this.processLine(line);
        if (this.options.onChange) this.options.onChange(this.getMarkdown());
    }

    processLine(line) {
        let text = line.innerText || line.textContent;
        // 某些浏览器 textContent 包含换行符，需清理
        text = text.replace(/[\n\r]+$/, '');
        line.setAttribute('data-raw', text);

        // 清除所有非代码块相关的类，以便重新判断
        line.classList.remove('md-heading', 'md-h1', 'md-h2', 'md-h3', 'md-h4', 'md-h5', 'md-h6',
            'md-blockquote', 'md-hr', 'md-list', 'md-task-item', 'md-task-checked', 'md-table-line');

        if (!text.trim() && !line.classList.contains('md-code-block-line')) {
            line.innerHTML = '<br>';
            return;
        }

        // 如果是代码块内部行，跳过多余渲染
        if (line.classList.contains('md-code-block-line')) {
            line.innerHTML = this.escapeHtml(text);
            return;
        }

        let html = this.escapeHtml(text);

        if (this.options.readOnly) {
            // 只读模式：纯净渲染，移除所有语法标记
            if (text.match(/^#{1,6}\s/)) {
                const level = text.match(/^(#{1,6})\s/)[1].length;
                line.classList.add('md-heading', `md-h${level}`);
                // 直接只保留内容部分
                html = html.replace(/^#{1,6}\s+(.*)/, '$1');
            }
            else if (text.startsWith('> ')) {
                line.classList.add('md-blockquote');
                html = html.replace(/^>\s+(.*)/, '$1');
            }
            else if (text.match(/^(\-{3,}|\*{3,}|\_{3,})$/)) {
                line.classList.add('md-hr');
                html = '<hr>';
            }
            else if (text.match(/^\s*([-*+]|\d+\.)\s/)) {
                line.classList.add('md-list');
                const taskMatch = text.match(/^(\s*([-*+]|\d+\.)\s)\[([ xX])\]\s(.*)/);
                if (taskMatch) {
                    const checked = taskMatch[3].toLowerCase() === 'x';
                    line.classList.add('md-task-item');
                    if (checked) line.classList.add('md-task-checked');
                    html = html.replace(/^(\s*([-*+]|\d+\.))\s+\[([ xX])\]\s+(.*)/,
                        (m, p1, p2, p3, p4) => `<span class="md-task-checkbox" data-checked="${checked}">${checked ? '☑' : '☐'}</span> ${this.escapeHtml(p4)}`);
                } else {
                    html = html.replace(/^(\s*([-*+]|\d+\.)\s)(.*)/, (m, p1, p2, p3) => `${p1}${this.escapeHtml(p3)}`);
                }
            }

            // 行内渲染 (只读) — 所有插入 HTML 的捕获组均转义防 XSS
            if (!line.classList.contains('md-code-fence')) {
                html = html.replace(/(\*\*\*|___)(.*?)\1/g, (m, p1, p2) => `<strong><em>${this.escapeHtml(p2)}</em></strong>`);
                html = html.replace(/(\*\*|__)(.*?)\1/g, (m, p1, p2) => `<strong>${this.escapeHtml(p2)}</strong>`);
                html = html.replace(/(\*|_)(.*?)\1/g, (m, p1, p2) => `<em>${this.escapeHtml(p2)}</em>`);
                html = html.replace(/~~(.*?)~~/g, (m, p1) => `<del>${this.escapeHtml(p1)}</del>`);
                html = html.replace(/`(.*?)`/g, (m, p1) => `<code class="md-inline-code">${this.escapeHtml(p1)}</code>`);
                html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
                    const safeUrl = /^\s*(javascript|vbscript|data):/i.test(url) ? '' : url;
                    if (!safeUrl) return '';
                    const escapedAlt = this.escapeAttr(alt);
                    const escapedUrl = this.escapeAttr(safeUrl);
                    return `<img src="${escapedUrl}" alt="${escapedAlt}" title="${escapedAlt}" loading="eager">`;
                });
                html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
                    const safeUrl = /^\s*(javascript|vbscript|data):/i.test(url) ? '' : url;
                    const escapedText = this.escapeHtml(text);
                    if (!safeUrl) return escapedText;
                    const escapedUrl = this.escapeAttr(safeUrl);
                    return `<a href="${escapedUrl}" target="_blank" class="md-link">${escapedText}</a>`;
                });
                html = html.replace(/==(.*?)==/g, (m, p1) => `<mark>${this.escapeHtml(p1)}</mark>`);
            }
        } else {
            // 编辑模式：保留语法高亮 — 插入 HTML 的捕获组均转义防 XSS
            if (text.match(/^#{1,6}\s/)) {
                const level = text.match(/^(#{1,6})\s/)[1].length;
                line.classList.add('md-heading', `md-h${level}`);
                html = html.replace(/^(#{1,6}\s)(.*)/, (m, p1, p2) => `<span class="md-syntax">${p1}</span>${this.escapeHtml(p2)}`);
            }
            else if (text.startsWith('> ')) {
                line.classList.add('md-blockquote');
                html = html.replace(/^(>\s)(.*)/, (m, p1, p2) => `<span class="md-syntax">${p1}</span><span class="md-blockquote-content">${this.escapeHtml(p2)}</span>`);
            }
            else if (text.startsWith('```')) {
                line.classList.add('md-code-fence');
                const lang = text.substring(3).trim();
                html = `<span class="md-syntax">\`\`\`</span>${this.escapeHtml(lang)}`;
            }
            else if (text.match(/^(\-{3,}|\*{3,}|\_{3,})$/)) {
                line.classList.add('md-hr');
                html = `<span class="md-syntax">${html}</span><hr>`;
            }
            else if (text.match(/^\s*([-*+]|\d+\.)\s/)) {
                line.classList.add('md-list');
                const taskMatch = text.match(/^(\s*([-*+]|\d+\.)\s)\[([ xX])\]\s(.*)/);
                if (taskMatch) {
                    const checked = taskMatch[3].toLowerCase() === 'x';
                    line.classList.add('md-task-item');
                    if (checked) line.classList.add('md-task-checked');
                    html = html.replace(/^(\s*([-*+]|\d+\.))\s+\[([ xX])\]\s+(.*)/,
                        (m, p1, p2, p3, p4) => `<span class="md-syntax">${this.escapeHtml(p1)}</span> <span class="md-task-checkbox" data-checked="${checked}">${checked ? '☑' : '☐'}</span> ${this.escapeHtml(p4)}`);
                } else {
                    html = html.replace(/^(\s*([-*+]|\d+\.)\s)(.*)/, (m, p1, p2, p3) => `<span class="md-syntax">${this.escapeHtml(p1)}</span>${this.escapeHtml(p3)}`);
                }
            }
            else if (text.startsWith('|') && text.endsWith('|')) {
                line.classList.add('md-table-line');
                html = html.replace(/\|/g, '<span class="md-syntax">|</span>');
            }

            // 行内渲染 (编辑)
            if (!line.classList.contains('md-code-fence')) {
                html = html.replace(/(\*\*\*|___)(.*?)\1/g, (m, p1, p2) => `<strong><em><span class="md-syntax">${this.escapeHtml(p1)}</span>${this.escapeHtml(p2)}<span class="md-syntax">${this.escapeHtml(p1)}</span></em></strong>`);
                html = html.replace(/(\*\*|__)(.*?)\1/g, (m, p1, p2) => `<strong><span class="md-syntax">${this.escapeHtml(p1)}</span>${this.escapeHtml(p2)}<span class="md-syntax">${this.escapeHtml(p1)}</span></strong>`);
                html = html.replace(/(\*|_)(.*?)\1/g, (m, p1, p2) => `<em><span class="md-syntax">${this.escapeHtml(p1)}</span>${this.escapeHtml(p2)}<span class="md-syntax">${this.escapeHtml(p1)}</span></em>`);
                html = html.replace(/~~(.*?)~~/g, (m, p1) => `<del><span class="md-syntax">~~</span>${this.escapeHtml(p1)}<span class="md-syntax">~~</span></del>`);
                html = html.replace(/`(.*?)`/g, (m, p1) => `<code class="md-inline-code"><span class="md-syntax">${'`'}</span>${this.escapeHtml(p1)}<span class="md-syntax">${'`'}</span></code>`);
                html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
                    const safeUrl = /^\s*(javascript|vbscript|data):/i.test(url) ? '' : url;
                    // 对 alt 和 url 进行二次转义确保属性安全
                    const displayAlt = this.escapeHtml(alt);
                    const displayUrl = this.escapeHtml(url);
                    const attrAlt = this.escapeAttr(alt);
                    const attrUrl = this.escapeAttr(safeUrl);
                    return `<span class="md-image"><span class="md-syntax">![</span>${displayAlt}<span class="md-syntax">](</span><span class="md-url">${displayUrl}</span><span class="md-syntax">)</span><img src="${attrUrl}" alt="${attrAlt}" loading="eager"></span>`;
                });
                html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
                    const escapedText = this.escapeHtml(text);
                    const escapedUrl = this.escapeHtml(url);
                    return `<span class="md-link"><span class="md-syntax">[</span>${escapedText}<span class="md-syntax">](</span><span class="md-url">${escapedUrl}</span><span class="md-syntax">)</span></span>`;
                });
                html = html.replace(/==(.*?)==/g, (m, p1) => `<mark><span class="md-syntax">==</span>${this.escapeHtml(p1)}<span class="md-syntax">==</span></mark>`);
            }
        }

        line.innerHTML = html;
        if (line.classList.contains('active')) {
            // 保持 active 状态
        }
    }

    // --- 光标控制核心逻辑 (增强版：支持隐藏元素的光标计算) ---
    getCaretOffsetInLine(line) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return 0;
        const range = selection.getRangeAt(0);

        // 确保选区在当前行内
        if (!line.contains(range.startContainer)) return 0;

        try {
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(line);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            return preCaretRange.toString().length;
        } catch (e) {
            // 边缘情况处理：如果 range 异常，回退到 0
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('getCaretOffsetInLine failed:', e);
            return 0;
        }
    }

    setCaretOffsetInLine(line, offset) {
        const selection = window.getSelection();
        const range = document.createRange();
        let currentOffset = 0;
        let found = false;

        const traverse = (node) => {
            if (found) return;
            if (node.nodeType === Node.TEXT_NODE) {
                if (currentOffset + node.length >= offset) {
                    range.setStart(node, offset - currentOffset);
                    range.collapse(true);
                    found = true;
                    return;
                }
                currentOffset += node.length;
            } else {
                for (let child of node.childNodes) traverse(child);
            }
        };

        traverse(line);
        if (!found) {
            // 如果没找到（可能在末尾），定位到最后一个文本节点或行尾
            range.selectNodeContents(line);
            range.collapse(false);
        }

        try {
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (e) {
            (typeof Config !== 'undefined' && Config.warn) && Config.warn('setCaretOffsetInLine failed:', e);
        }
    }

    getLineElement(node) {
        while (node && node !== this.editor) {
            if (node.classList && node.classList.contains('md-line')) return node;
            node = node.parentNode;
        }
        return null;
    }

    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    escapeAttr(text) {
        return this.escapeHtml(text)
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    setContent(markdown) {
        this.editor.innerHTML = '';
        const lines = (markdown || '').split('\n');
        lines.forEach(text => {
            const div = document.createElement('div');
            div.className = 'md-line';
            div.textContent = text;
            this.editor.appendChild(div);
            this.processLine(div);
        });
        if (this.editor.children.length === 0) this.editor.innerHTML = '<div class="md-line"><br></div>';
        this.updateCodeBlocks(); // 确保代码块状态正确
        this.updateActiveLine();
    }

    getMarkdown() {
        return Array.from(this.editor.childNodes)
            .map(line => line.getAttribute?.('data-raw') || line.innerText || '')
            .join('\n');
    }

    focus() {
        this.editor.focus();
    }

    // --- 历史记录管理 ---

    debouncedSaveHistory() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.safeSaveHistory();
        }, 500);
    }

    safeSaveHistory() {
        const currentHtml = this.editor.innerHTML;
        // 如果和最后一次记录相同，则不保存
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === currentHtml) {
            return;
        }

        // 截断重做栈
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(currentHtml);
        this.historyIndex++;

        // 限制长度
        if (this.history.length > this.historyLimit) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    undo() {
        if (this.historyIndex <= 0) return; // 至少保留一个状态
        this.historyIndex--;
        this.restoreHistory();
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        this.restoreHistory();
    }

    restoreHistory() {
        const html = this.history[this.historyIndex];
        if (html !== undefined) {
            this.editor.innerHTML = html;
            this.updateCodeBlocks(); // 恢复后重新绑定状态
            this.updateActiveLine();

            // 恢复光标到末尾 (简化处理)
            const range = document.createRange();
            range.selectNodeContents(this.editor);
            range.collapse(false);
            const sel = window.getSelection();
            try {
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {
                (typeof Config !== 'undefined' && Config.warn) && Config.warn('restoreHistory selection failed:', e);
            }

            if (this.options.onChange) this.options.onChange(this.getMarkdown());
            this.checkTitleSync();
        }
    }

    checkTitleSync() {
        if (this.options.onTitleSync && !this.isComposing) {
            const firstH1 = this.findFirstHeading(1);
            if (firstH1) {
                this.options.onTitleSync(firstH1);
            }
        }
    }
}
window.MarkdownWysiwygEditor = MarkdownWysiwygEditor;


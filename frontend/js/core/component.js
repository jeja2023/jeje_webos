/**
 * 组件基类
 * 提供基础的渲染和生命周期管理
 */

class Component {
    constructor(container) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.state = {};
        this.props = {};
        this._mounted = false;  // 标记是否已挂载
        this._listeners = [];   // 存储绑定的事件监听器以便销毁
    }

    /**
     * 设置状态并重新渲染
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.update();
    }

    /**
     * 设置属性
     */
    setProps(props) {
        this.props = { ...this.props, ...props };
    }

    /**
     * 渲染HTML模板
     */
    render() {
        return '';
    }

    /**
     * 挂载到DOM（首次挂载）
     */
    mount() {
        if (this.container) {
            this.container.innerHTML = this.render();
            if (!this._mounted) {
                this._mounted = true;
                this.afterMount();  // 仅首次挂载时调用
            }
            this.afterUpdate();  // 每次更新后调用
        }
    }

    /**
     * 更新DOM（状态变化时）
     */
    update() {
        if (this.container) {
            this.container.innerHTML = this.render();
            this.afterUpdate();  // 仅调用更新钩子，不调用afterMount
        }
    }

    /**
     * 首次挂载后的钩子（仅调用一次）
     */
    afterMount() { }

    /**
     * 每次更新后的钩子
     */
    afterUpdate() { }

    /**
     * 销毁组件
     */
    destroy() {
        // 移除所有绑定的事件监听器
        if (this._listeners) {
            this._listeners.forEach(({ element, event, handler }) => {
                element?.removeEventListener(event, handler);
            });
            this._listeners = [];
        }

        if (this.container) {
            this.container.innerHTML = '';
            // 清除自定义属性绑定标记，允许重建
            const keys = Object.keys(this.container).filter(k => k.startsWith('_bind'));
            keys.forEach(k => delete this.container[k]);
        }
    }

    /**
     * 查询元素
     */
    $(selector) {
        return this.container?.querySelector(selector);
    }

    /**
     * 查询多个元素
     */
    $$(selector) {
        return this.container?.querySelectorAll(selector);
    }

    /**
     * 绑定事件
     */
    on(selector, event, handler) {
        const elements = typeof selector === 'string'
            ? this.$$(selector)
            : [selector];
        elements.forEach(el => {
            if (el) {
                el.addEventListener(event, handler);
                // 记录监听器以便销毁
                this._listeners.push({ element: el, event, handler });
            }
        });
    }

    /**
     * 事件委托
     */
    delegate(event, selector, handler) {
        if (!this.container) return;

        const wrapper = (e) => {
            const target = e.target.closest(selector);
            if (target && this.container.contains(target)) {
                handler.call(target, e, target);
            }
        };

        this.container.addEventListener(event, wrapper);
        // 记录到 _listeners 以便销毁
        this._listeners.push({ element: this.container, event, handler: wrapper });
    }
}

/**
 * 工具函数
 */
const Utils = {
    /**
     * 加载外部脚本
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    /**
     * 防抖
     */
    debounce(fn, delay = 300) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 节流
     */
    throttle(fn, delay = 300) {
        let last = 0;
        return function (...args) {
            const now = Date.now();
            if (now - last >= delay) {
                last = now;
                fn.apply(this, args);
            }
        };
    },

    /**
     * 格式化日期
     */
    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        if (!date) return '';
        const d = new Date(date);
        const pad = n => String(n).padStart(2, '0');

        return format
            .replace('YYYY', d.getFullYear())
            .replace('MM', pad(d.getMonth() + 1))
            .replace('DD', pad(d.getDate()))
            .replace('HH', pad(d.getHours()))
            .replace('mm', pad(d.getMinutes()))
            .replace('ss', pad(d.getSeconds()));
    },

    /**
     * 相对时间
     */
    timeAgo(date) {
        if (!date) return '';
        const now = Date.now();
        const diff = now - new Date(date).getTime();

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const week = 7 * day;
        const month = 30 * day;

        if (diff < minute) return '刚刚';
        if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
        if (diff < day) return `${Math.floor(diff / hour)}小时前`;
        if (diff < week) return `${Math.floor(diff / day)}天前`;
        if (diff < month) return `${Math.floor(diff / week)}周前`;

        return this.formatDate(date, 'YYYY-MM-DD');
    },

    /**
     * 转义HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * 生成唯一ID
     */
    uniqueId(prefix = '') {
        return prefix + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 深拷贝
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 截取字符串
     */
    truncate(str, length, suffix = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length) + suffix;
    },

    /**
     * 渲染分页组件
     * @param {number} page - 当前页码
     * @param {number} totalPages - 总页数
     * @param {object} options - 配置选项
     * @returns {string} 分页HTML
     */
    renderPagination(page, totalPages, options = {}) {
        if (totalPages <= 1) return '';

        const {
            maxVisible = 5,  // 最多显示的页码数
            showFirstLast = true,  // 是否显示首页/末页
            firstText = '«',
            lastText = '»',
            prevText = '‹',
            nextText = '›'
        } = options;

        let buttons = [];

        // 首页按钮
        if (showFirstLast) {
            buttons.push(`<button class="pagination-btn pagination-first" ${page <= 1 ? 'disabled' : ''} data-page="1" title="首页">${firstText}</button>`);
        }

        // 上一页按钮
        buttons.push(`<button class="pagination-btn pagination-prev" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" title="上一页">${prevText}</button>`);

        // 计算显示的页码范围
        let startPage = 1;
        let endPage = totalPages;

        if (totalPages > maxVisible) {
            const half = Math.floor(maxVisible / 2);
            startPage = Math.max(1, page - half);
            endPage = Math.min(totalPages, startPage + maxVisible - 1);

            // 调整起始页，确保显示足够的页码
            if (endPage - startPage + 1 < maxVisible) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }
        }

        // 显示省略号和第一页
        if (startPage > 1) {
            buttons.push(`<button class="pagination-btn" data-page="1">1</button>`);
            if (startPage > 2) {
                buttons.push(`<span class="pagination-ellipsis">...</span>`);
            }
        }

        // 页码按钮
        for (let i = startPage; i <= endPage; i++) {
            if (i === 1 && startPage > 1) continue; // 已经显示了第一页
            if (i === totalPages && endPage < totalPages) continue; // 将显示最后一页
            buttons.push(`<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
        }

        // 显示省略号和最后一页
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                buttons.push(`<span class="pagination-ellipsis">...</span>`);
            }
            buttons.push(`<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`);
        }

        // 下一页按钮
        buttons.push(`<button class="pagination-btn pagination-next" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}" title="下一页">${nextText}</button>`);

        // 末页按钮
        if (showFirstLast) {
            buttons.push(`<button class="pagination-btn pagination-last" ${page >= totalPages ? 'disabled' : ''} data-page="${totalPages}" title="末页">${lastText}</button>`);
        }

        return `<div class="pagination">${buttons.join('')}</div>`;
    },

    /**
     * 统一获取认证 Token
     * 优先从 Store 获取，其次从 localStorage
     * @returns {string|null} Token 或 null
     */
    getToken() {
        return Store.get('token')
            || localStorage.getItem(Config.storageKeys.token)
            || null;
    },

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    },

    /**
     * 格式化数字 (添加千分位)
     */
    formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return num.toLocaleString();
    },

    /**
     * 导出数据为 CSV
     */
    exportToCSV(data, fileName) {
        if (!data || !data.length) return;
        const keys = Object.keys(data[0]);
        const csvContent = [
            keys.join(','),
            ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    },

    /**
     * 导出数据为 Excel (兼容模式)
     */
    exportToExcel(data, fileName) {
        // 对于简单需求，带 BOM 的 CSV 即可被 Excel 完美识别并正确处理中文
        this.exportToCSV(data, fileName);
    },

    /**
     * 数据聚合处理（性能优化版）
     * 用于图表分析和 BI 仪表盘的数据聚合
     * @param {Array} data - 原始数据数组
     * @param {string} xField - X轴分类字段
     * @param {string} yField - Y轴数值字段
     * @param {string} aggregateType - 聚合类型: none, count, sum, avg, max, min, value
     * @param {Object} options - 可选配置
     *   - maxItems: 最大返回数量，默认 20
     *   - nullLabel: 空值标签，默认 '空值'
     *   - sortField: 排序字段 ('name' 或 'value')
     *   - sortOrder: 排序方式 ('asc' 或 'desc')
     *   - originalYField: 原始 Y 轴字段名，用于判断是否对聚合值排序
     * @returns {Array} 聚合后的数据 [{ name, value }, ...]
     */
    aggregateData(data, xField, yField, aggregateType, options = {}) {
        const {
            maxItems = 20,
            nullLabel = '空值',
            sortField = null,
            sortOrder = null,
            originalYField = null
        } = options;

        if (!data || data.length === 0) {
            return [];
        }

        // 不聚合模式：直接返回前 N 条明细
        if (aggregateType === 'none') {
            const result = data.slice(0, maxItems).map(row => ({
                name: row[xField] ?? nullLabel,
                value: row[yField] ? parseFloat(row[yField]) : 0
            }));
            // 应用排序
            if (sortField && sortOrder) {
                this._sortAggregatedData(result, sortField, sortOrder, yField, originalYField);
            }
            return result;
        }

        // 使用 Map 进行分组统计（性能优化）
        const groups = new Map();

        for (const row of data) {
            const key = String(row[xField] ?? nullLabel);

            if (!groups.has(key)) {
                groups.set(key, { values: [], count: 0, sum: 0 });
            }

            const group = groups.get(key);
            group.count++;

            if (yField && row[yField] !== null && row[yField] !== undefined) {
                const num = parseFloat(row[yField]);
                if (!isNaN(num)) {
                    group.values.push(num);
                    group.sum += num;  // 预计算 sum，避免后续 reduce
                }
            }
        }

        // 计算聚合值
        const result = [];

        for (const [name, group] of groups) {
            let value = 0;

            switch (aggregateType) {
                case 'value':
                    // 原值：取第一个值（适合每个X只有一条记录的场景）
                    value = group.values.length > 0 ? group.values[0] : group.count;
                    break;
                case 'count':
                    value = group.count;
                    break;
                case 'sum':
                    value = group.sum;  // 使用预计算的 sum
                    break;
                case 'avg':
                    value = group.values.length > 0 ? group.sum / group.values.length : 0;
                    break;
                case 'max':
                    value = group.values.length > 0 ? Math.max(...group.values) : 0;
                    break;
                case 'min':
                    value = group.values.length > 0 ? Math.min(...group.values) : 0;
                    break;
            }

            result.push({ name, value: Math.round(value * 100) / 100 });
        }

        // 应用排序（如果配置了）
        if (sortField && sortOrder) {
            this._sortAggregatedData(result, sortField, sortOrder, yField, originalYField);
        }

        // 限制数量
        return result.slice(0, maxItems);
    },

    /**
     * 对聚合后的数据进行排序（统一排序逻辑）
     * @param {Array} data - 聚合后的数据 [{ name, value }, ...]
     * @param {string} sortField - 排序字段
     * @param {string} sortOrder - 排序方式 ('asc' 或 'desc')
     * @param {string} yField - 当前 Y 轴字段
     * @param {string} originalYField - 原始 Y 轴字段（用于判断是否对值排序）
     */
    _sortAggregatedData(data, sortField, sortOrder, yField, originalYField) {
        if (!data || data.length === 0 || !sortOrder) return;

        const order = sortOrder === 'desc' ? -1 : 1;

        // 判断是否对值字段排序
        const sortByValue = sortField === 'value' ||
            sortField === yField ||
            sortField === originalYField ||
            sortField === 'yField';

        data.sort((a, b) => {
            const valA = sortByValue ? a.value : a.name;
            const valB = sortByValue ? b.value : b.name;

            // 处理 null/undefined
            if (valA == null && valB == null) return 0;
            if (valA == null) return order;
            if (valB == null) return -order;

            // 数值比较
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * order;
            }

            // 字符串比较
            return String(valA).localeCompare(String(valB), undefined, {
                numeric: true,
                sensitivity: 'base'
            }) * order;
        });
    },

    /**
     * 将原始数据转换为图表数据格式
     * 用于无聚合模式下的数据格式化
     * @param {Array} data - 原始数据
     * @param {string} xField - X轴字段
     * @param {string} yField - Y轴字段
     * @param {Object} options - 可选配置
     * @returns {Array} [{ name, value }, ...]
     */
    convertToChartData(data, xField, yField, options = {}) {
        const { maxItems = null, nullLabel = '空值' } = options;

        if (!data || data.length === 0) {
            return [];
        }

        let result = data.map(row => ({
            name: row[xField] ?? nullLabel,
            value: parseFloat(row[yField]) || 0
        })).filter(d => d.name != null);

        if (maxItems && result.length > maxItems) {
            result = result.slice(0, maxItems);
        }

        return result;
    },

    /**
     * 智能推荐图表类型
     * 根据数据特征推荐最适合的图表类型
     * @param {Array} data - 数据
     * @param {Object} fieldInfo - 字段信息 { xField, yField, fields }
     * @returns {Array} 推荐的图表类型列表（按优先级排序）
     */
    recommendChartType(data, fieldInfo = {}) {
        if (!data || data.length === 0) {
            return ['bar'];
        }

        const { xField, yField, fields = [] } = fieldInfo;
        const sampleSize = Math.min(100, data.length);
        const sample = data.slice(0, sampleSize);

        const recommendations = [];

        // 分析 X 轴字段特征
        if (xField) {
            const xValues = sample.map(row => row[xField]);
            const uniqueX = new Set(xValues).size;
            const isDateLike = xValues.some(v => {
                if (!v) return false;
                const str = String(v);
                return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str) ||
                    /^\d{4}年/.test(str) ||
                    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(str);
            });

            // 时间序列 → 推荐折线图
            if (isDateLike) {
                recommendations.push('line', 'bar');
            }
            // 少量分类 → 饼图/柱状图
            else if (uniqueX <= 8) {
                recommendations.push('pie', 'bar');
            }
            // 中等分类 → 柱状图
            else if (uniqueX <= 20) {
                recommendations.push('bar', 'line');
            }
            // 大量分类 → 柱状图（带滚动）
            else {
                recommendations.push('bar', 'scatter');
            }
        }

        // 分析 Y 轴字段特征
        if (yField) {
            const yValues = sample.map(row => parseFloat(row[yField])).filter(v => !isNaN(v));

            // 只有一个值或全部相同 → 仪表盘
            if (new Set(yValues).size === 1) {
                recommendations.unshift('gauge');
            }
        }

        // 多数值字段 → 热力图
        if (fields && fields.length >= 3) {
            const numericFields = fields.filter(f => {
                const values = sample.map(row => row[f]);
                return values.some(v => !isNaN(parseFloat(v)));
            });

            if (numericFields.length >= 3) {
                recommendations.push('heatmap');
            }
        }

        // 如果没有推荐，默认柱状图
        if (recommendations.length === 0) {
            recommendations.push('bar', 'line', 'pie');
        }

        // 去重
        return [...new Set(recommendations)];
    }
};

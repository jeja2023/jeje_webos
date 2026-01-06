/**
 * 图表渲染缓存工具类（LRU 策略增强版）
 * 用于缓存图表渲染结果，提升报告生成性能
 */
class ChartRenderCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存有效期
        this.maxCacheSize = 50; // 最大缓存数量

        // 缓存统计
        this._stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * 生成缓存键
     * @param {number} chartId - 图表ID
     * @param {string} dataHash - 数据哈希值（用于检测数据变化）
     * @returns {string} 缓存键
     */
    _getCacheKey(chartId, dataHash) {
        return `chart_${chartId}_${dataHash}`;
    }

    /**
     * 计算数据哈希值（优化采样策略）
     * @param {Array} data - 图表数据
     * @returns {string} 数据哈希值
     */
    _hashData(data) {
        if (!data || data.length === 0) return 'empty';

        // 采样策略：首尾 + 均匀抽样，覆盖更多数据变化场景
        const sampleSize = Math.min(50, data.length);
        const sample = [];

        // 始终包含首尾
        sample.push(data[0]);
        if (data.length > 1) {
            sample.push(data[data.length - 1]);
        }

        // 均匀抽样中间数据
        if (sampleSize > 2 && data.length > 2) {
            const step = Math.floor((data.length - 2) / (sampleSize - 2));
            for (let i = 1; i < data.length - 1 && sample.length < sampleSize; i += Math.max(1, step)) {
                sample.push(data[i]);
            }
        }

        // 同时包含数据总量以检测数据量变化
        const str = JSON.stringify({ len: data.length, sample });

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 获取缓存的图表图片（LRU 访问会更新顺序）
     * @param {number} chartId - 图表ID
     * @param {Array} data - 图表数据
     * @returns {string|null} base64图片数据，如果缓存不存在则返回null
     */
    get(chartId, data) {
        const dataHash = this._hashData(data);
        const key = this._getCacheKey(chartId, dataHash);
        const cached = this.cache.get(key);

        if (cached) {
            // 检查是否过期
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                // LRU: 删除并重新插入，将其移动到 Map 末尾（最近使用）
                this.cache.delete(key);
                this.cache.set(key, {
                    ...cached,
                    lastAccess: Date.now() // 记录最后访问时间
                });
                this._stats.hits++;
                return cached.imageData;
            } else {
                // 缓存过期，删除
                this.cache.delete(key);
            }
        }

        this._stats.misses++;
        return null;
    }

    /**
     * 设置缓存（LRU 淘汰策略）
     * @param {number} chartId - 图表ID
     * @param {Array} data - 图表数据
     * @param {string} imageData - base64图片数据
     */
    set(chartId, data, imageData) {
        // 如果缓存已满，删除最久未访问的缓存（LRU）
        while (this.cache.size >= this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this._stats.evictions++;
        }

        const dataHash = this._hashData(data);
        const key = this._getCacheKey(chartId, dataHash);
        this.cache.set(key, {
            imageData,
            timestamp: Date.now(),
            lastAccess: Date.now()
        });
    }

    /**
     * 检查是否命中缓存（不改变 LRU 顺序）
     * @param {number} chartId - 图表ID
     * @param {Array} data - 图表数据
     * @returns {boolean} 是否存在有效缓存
     */
    has(chartId, data) {
        const dataHash = this._hashData(data);
        const key = this._getCacheKey(chartId, dataHash);
        const cached = this.cache.get(key);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return true;
        }
        return false;
    }

    /**
     * 清除指定图表的缓存
     * @param {number} chartId - 图表ID
     */
    clearChart(chartId) {
        for (const [key] of this.cache) {
            if (key.startsWith(`chart_${chartId}_`)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 清除所有缓存
     */
    clear() {
        this.cache.clear();
        this._stats = { hits: 0, misses: 0, evictions: 0 };
    }

    /**
     * 清理过期缓存
     */
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache) {
            if (now - value.timestamp >= this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 获取缓存统计信息
     * @returns {Object} 统计数据
     */
    getStats() {
        const hitRate = this._stats.hits + this._stats.misses > 0
            ? (this._stats.hits / (this._stats.hits + this._stats.misses) * 100).toFixed(1)
            : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            hits: this._stats.hits,
            misses: this._stats.misses,
            evictions: this._stats.evictions,
            hitRate: `${hitRate}%`
        };
    }
}

// 创建全局单例
window.ChartRenderCache = new ChartRenderCache();

// 定期清理过期缓存（每10分钟）
setInterval(() => {
    window.ChartRenderCache.cleanup();
}, 10 * 60 * 1000);








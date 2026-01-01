/**
 * 图表渲染缓存工具类
 * 用于缓存图表渲染结果，提升报告生成性能
 */
class ChartRenderCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存有效期
        this.maxCacheSize = 50; // 最大缓存数量
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
     * 计算数据哈希值
     * @param {Array} data - 图表数据
     * @returns {string} 数据哈希值
     */
    _hashData(data) {
        if (!data || data.length === 0) return 'empty';
        // 使用前100条数据计算哈希（避免大数据量计算耗时）
        const sample = data.slice(0, 100);
        const str = JSON.stringify(sample);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 获取缓存的图表图片
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
                return cached.imageData;
            } else {
                // 缓存过期，删除
                this.cache.delete(key);
            }
        }
        
        return null;
    }

    /**
     * 设置缓存
     * @param {number} chartId - 图表ID
     * @param {Array} data - 图表数据
     * @param {string} imageData - base64图片数据
     */
    set(chartId, data, imageData) {
        // 如果缓存已满，删除最旧的缓存
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        const dataHash = this._hashData(data);
        const key = this._getCacheKey(chartId, dataHash);
        this.cache.set(key, {
            imageData,
            timestamp: Date.now()
        });
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
}

// 创建全局单例
window.ChartRenderCache = new ChartRenderCache();

// 定期清理过期缓存（每10分钟）
setInterval(() => {
    window.ChartRenderCache.cleanup();
}, 10 * 60 * 1000);


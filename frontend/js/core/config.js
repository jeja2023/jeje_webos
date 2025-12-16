/**
 * 全局配置
 */

const Config = {
    // API基础路径
    apiBase: '/api/v1',

    // 应用信息（启动时从后端获取）
    appName: 'JeJe WebOS',
    version: '',

    // 存储键名
    storageKeys: {
        token: 'jeje_token',
        user: 'jeje_user',
        theme: 'jeje_theme',
        sidebarCollapsed: 'jeje_sidebar_collapsed'
    },

    // 分页默认值
    pagination: {
        defaultPage: 1,
        defaultSize: 10,
        pageSizes: [10, 20, 50, 100]
    },

    // 调试模式
    debug: true,

    // 日志
    log(...args) {
        if (this.debug) {
            console.log('[JeJe]', ...args);
        }
    },

    error(...args) {
        console.error('[JeJe Error]', ...args);
    }
};

// 冻结配置
Object.freeze(Config.storageKeys);
Object.freeze(Config.pagination);




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
        refreshToken: 'jeje_refresh_token',
        user: 'jeje_user',
        theme: 'jeje_theme',
        sidebarCollapsed: 'jeje_sidebar_collapsed',

        // 模块配置
        pinnedApps: 'jeje_pinned_apps', // 固定的应用列表
        mapConfig: 'jeje_map_config', // 地图配置
        mapActiveDatasets: 'jeje_map_active_datasets', // 地图激活数据集
        videoPlaybackSpeed: 'videoPlaybackSpeed', // 视频播放速度
        aiSessions: 'jeje_ai_sessions', // AI 会话历史
        aiConfig: 'jeje_ai_config_public', // AI 公共配置
        aiModel: 'jeje_ai_selected_model', // AI 选定模型

        // 课程进度
        courseLastChapter: 'lastChapter_',
        courseLastChapterTitle: 'lastChapterTitle_',
        videoProgress: 'videoProgress_'
    },

    // 分页默认值
    pagination: {
        defaultPage: 1,
        defaultSize: 10,
        pageSizes: [10, 20, 50, 100]
    },

    // 是否使用 HttpOnly Cookie 存 Token（由 /system/init 返回，可防 XSS 窃取 Token）
    useHttpOnlyCookie: false,

    // 调试模式，生产环境默认关闭，可通过 URL 参数 ?debug=1 临时开启
    debug: new URLSearchParams(window.location.search).get('debug') === '1',

    // 日志
    log(...args) {
        if (this.debug) {
            console.log('[JeJe]', ...args);
        }
    },

    info(...args) {
        if (this.debug) {
            console.info('[JeJe Info]', ...args);
        }
    },

    warn(...args) {
        console.warn('[JeJe Warn]', ...args);
    },

    error(...args) {
        console.error('[JeJe Error]', ...args);
    }
};

// 冻结配置
Object.freeze(Config.storageKeys);
Object.freeze(Config.pagination);




/**
 * DataLens API 模块 - 封装所有与后端的通信接口
 */

const LensApi = {
    // Hub 概览
    getOverview: () => Api.get('/lens/hub'),

    // 数据源管理
    getSources: () => Api.get('/lens/sources'),
    getSource: (id) => Api.get(`/lens/sources/${id}`),
    createSource: (data) => Api.post('/lens/sources', data),
    updateSource: (id, data) => Api.put(`/lens/sources/${id}`, data),
    deleteSource: (id) => Api.delete(`/lens/sources/${id}`),
    testSource: (data) => Api.post('/lens/sources/test', data),
    getSourceTables: (id) => Api.get(`/lens/sources/${id}/tables`),
    getSourceColumns: (id, tableName) => Api.get(`/lens/sources/${id}/columns`, { table_name: tableName }),

    // 分类管理
    getCategories: () => Api.get('/lens/categories'),
    createCategory: (data) => Api.post('/lens/categories', data),
    updateCategory: (id, data) => Api.put(`/lens/categories/${id}`, data),
    deleteCategory: (id) => Api.delete(`/lens/categories/${id}`),

    // 视图管理
    getViews: (params) => Api.get('/lens/views', params),
    getView: (id) => Api.get(`/lens/views/${id}`),
    createView: (data) => Api.post('/lens/views', data),
    updateView: (id, data) => Api.put(`/lens/views/${id}`, data),
    deleteView: (id) => Api.delete(`/lens/views/${id}`),
    getViewData: (id, data) => Api.post(`/lens/views/${id}/data`, data),
    executePreview: (data) => Api.post('/lens/execute/preview', data),

    // 收藏管理
    getFavorites: () => Api.get('/lens/favorites'),
    addFavorite: (viewId) => Api.post(`/lens/favorites/${viewId}`),
    removeFavorite: (viewId) => Api.delete(`/lens/favorites/${viewId}`),

    // 最近访问
    getRecent: (limit = 10) => Api.get('/lens/recent', { limit }),

    // 文件上传
    uploadFile: (formData) => Api.upload('/lens/upload', formData)
};

// 暴露给全局以便其他模块调用
window.LensApi = LensApi;

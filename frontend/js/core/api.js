/**
 * API请求封装
 * 统一处理请求、响应、错误
 */

const Api = {
    /**
     * 基础请求方法
     */
    async request(url, options = {}) {
        const token = localStorage.getItem(Config.storageKeys.token);

        const defaultHeaders = {
            'Content-Type': 'application/json'
        };

        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
        }
        
        // 添加 CSRF Token（对于状态变更操作）
        const csrfToken = Store.get('csrfToken');
        if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
            defaultHeaders['X-CSRF-Token'] = csrfToken;
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        // 完整URL
        const fullUrl = url.startsWith('http') ? url : `${Config.apiBase}${url}`;

        Config.log(`API ${config.method || 'GET'} ${fullUrl}`);

        try {
            const response = await fetch(fullUrl, config);
            const data = await response.json();

            // 处理 HTTP 错误状态码
            if (!response.ok) {
                let errorMessage = '请求失败';

                // FastAPI HTTPException 返回 detail 字段
                if (data.detail) {
                    // Pydantic 验证错误返回数组
                    if (Array.isArray(data.detail)) {
                        // 提取第一个错误的消息
                        const firstError = data.detail[0];
                        if (firstError.msg) {
                            // 字段验证错误
                            const field = firstError.loc?.[firstError.loc.length - 1] || '';
                            const fieldNames = {
                                'username': '用户名',
                                'password': '密码',
                                'confirm_password': '确认密码',
                                'phone': '手机号码',
                                'nickname': '昵称'
                            };
                            const fieldName = fieldNames[field] || field;
                            errorMessage = firstError.msg.replace('Value error, ', '');
                            if (fieldName && !errorMessage.includes(fieldName)) {
                                errorMessage = `${fieldName}: ${errorMessage}`;
                            }
                        }
                    } else {
                        errorMessage = data.detail;
                    }
                }

                // 处理 401 未授权
                if (response.status === 401) {
                    Store.clearAuth();
                    Router.push('/login');
                    throw new Error(errorMessage || '登录已过期，请重新登录');
                }

                throw new Error(errorMessage);
            }

            // 处理业务错误（自定义响应格式）
            if (data.code && data.code !== 200) {
                throw new Error(data.message || '请求失败');
            }

            return data;
        } catch (error) {
            Config.error('请求失败:', error);
            throw error;
        }
    },

    /**
     * GET请求
     */
    async get(url, params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') return;
            qs.append(k, v);
        });
        const queryString = qs.toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        return this.request(fullUrl, { method: 'GET' });
    },

    /**
     * POST请求
     */
    async post(url, data = {}) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    /**
     * PUT请求
     */
    async put(url, data = {}) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    /**
     * DELETE请求
     */
    async delete(url) {
        return this.request(url, { method: 'DELETE' });
    },

    /**
     * 上传文件
     */
    async upload(url, file, fieldName = 'file') {
        const token = localStorage.getItem(Config.storageKeys.token);
        const formData = new FormData();
        formData.append(fieldName, file);

        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // 添加 CSRF Token
        const csrfToken = Store.get('csrfToken');
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const response = await fetch(`${Config.apiBase}${url}`, {
            method: 'POST',
            headers,
            body: formData
        });

        return response.json();
    }
};

// API模块快捷方法
const AuthApi = {
    login: (data) => Api.post('/auth/login', data),
    register: (data) => Api.post('/auth/register', data),
    logout: () => Api.post('/auth/logout'),
    profile: () => Api.get('/auth/me'),
    getMe: () => Api.get('/auth/me'),
    changePassword: (data) => Api.put('/auth/password', data)
};

const SystemApi = {
    init: (token) => Api.get('/system/init', token ? { token } : {}),
    getModules: () => Api.get('/system/modules'),
    toggleModule: (id, enabled) => Api.put(`/system/modules/${id}`, { enabled }),
    healthModule: (id) => Api.get(`/system/modules/${id}/health`),
    getStats: () => Api.get('/system/stats'),
    getSettings: () => Api.get('/system/settings'),
    updateSettings: (data) => Api.put('/system/settings', data),
    updateSettings: (data) => Api.put('/system/settings', data),
    getAuditLogs: (params) => Api.get('/audit', params),
    createModule: (data) => Api.post('/system/modules', data),
    deleteModule: (id, params) => Api.delete(`/system/modules/${id}` + (params ? '?' + new URLSearchParams(params).toString() : ''))
};

const BlogApi = {
    // 分类
    getCategories: () => Api.get('/blog/categories'),
    createCategory: (data) => Api.post('/blog/categories', data),
    updateCategory: (id, data) => Api.put(`/blog/categories/${id}`, data),
    deleteCategory: (id) => Api.delete(`/blog/categories/${id}`),

    // 标签
    getTags: () => Api.get('/blog/tags'),
    createTag: (data) => Api.post('/blog/tags', data),

    // 文章
    getPosts: (params) => Api.get('/blog/posts', params),
    getMyPosts: (params) => Api.get('/blog/posts/my', params),
    getPost: (id) => Api.get(`/blog/posts/${id}`),
    getPostBySlug: (slug) => Api.get(`/blog/posts/slug/${slug}`),
    createPost: (data) => Api.post('/blog/posts', data),
    updatePost: (id, data) => Api.put(`/blog/posts/${id}`, data),
    deletePost: (id) => Api.delete(`/blog/posts/${id}`)
};

const UserApi = {
    // 用户列表
    getUsers: (params) => Api.get('/users', params),
    // 待审核用户
    getPendingUsers: () => Api.get('/users/pending'),
    // 审核用户
    auditUser: (id, data) => Api.put(`/users/${id}/audit`, data),
    // 启用/禁用用户
    toggleUserStatus: (id, isActive) => Api.put(`/users/${id}/status?is_active=${isActive}`),
    // 删除用户
    deleteUser: (id) => Api.delete(`/users/${id}`),
    // 更新权限
    updatePermissions: (id, payload) => Api.put(`/users/${id}/permissions`, payload),
    // 更新基础角色（仅 admin）
    updateRole: (id, role) => Api.put(`/users/${id}/role?role=${role}`),
    // 更新个人资料
    updateProfile: (data) => Api.put('/users/profile', data),
    // 修改密码
    changePassword: (data) => Api.put('/auth/password', data)
};

const GroupApi = {
    list: () => Api.get('/roles'),
    create: (data) => Api.post('/roles', data),
    update: (id, data) => Api.put(`/roles/${id}`, data),
    remove: (id) => Api.delete(`/roles/${id}`),
    users: (id) => Api.get(`/roles/${id}/users`)
};
// 兼容旧命名
const RoleApi = GroupApi;

const NotesApi = {
    // 文件夹
    getFolders: (parentId) => Api.get('/notes/folders', parentId ? { parent_id: parentId } : {}),
    getFolderTree: () => Api.get('/notes/folders/tree'),
    getFolder: (id) => Api.get(`/notes/folders/${id}`),
    createFolder: (data) => Api.post('/notes/folders', data),
    updateFolder: (id, data) => Api.put(`/notes/folders/${id}`, data),
    deleteFolder: (id) => Api.delete(`/notes/folders/${id}`),

    // 笔记
    getNotes: (params) => Api.get('/notes/notes', params),
    getStarredNotes: (params) => Api.get('/notes/notes/starred', params),
    getNote: (id) => Api.get(`/notes/notes/${id}`),
    createNote: (data) => Api.post('/notes/notes', data),
    updateNote: (id, data) => Api.put(`/notes/notes/${id}`, data),
    moveNote: (id, folderId) => Api.put(`/notes/notes/${id}/move`, { folder_id: folderId }),
    toggleStar: (id) => Api.put(`/notes/notes/${id}/star`),
    togglePin: (id) => Api.put(`/notes/notes/${id}/pin`),
    deleteNote: (id) => Api.delete(`/notes/notes/${id}`),

    // 标签
    getTags: () => Api.get('/notes/tags'),
    createTag: (data) => Api.post('/notes/tags', data),
    updateTag: (id, data) => Api.put(`/notes/tags/${id}`, data),
    deleteTag: (id) => Api.delete(`/notes/tags/${id}`),

    // 统计
    getStats: () => Api.get('/notes/stats')
};

// ========== 新功能 API ==========

// 文件存储 API
const StorageApi = {
    upload: (file) => Api.upload('/storage/upload', file),
    download: (fileId) => `${Config.apiBase}/storage/download/${fileId}`,
    list: (params) => Api.get('/storage/list', params),
    info: (fileId) => Api.get(`/storage/info/${fileId}`),
    delete: (fileId) => Api.delete(`/storage/${fileId}`)
};

// 数据备份 API
const BackupApi = {
    create: (type) => Api.post('/backup/create', { backup_type: type }),
    list: (params) => Api.get('/backup/list', params),
    info: (backupId) => Api.get(`/backup/${backupId}`),
    restore: (backupId) => Api.post('/backup/restore', { backup_id: backupId }),
    delete: (backupId) => Api.delete(`/backup/${backupId}`),
    download: (backupId) => `${Config.apiBase}/backup/${backupId}/download`
};

// 系统监控 API
const MonitorApi = {
    getSystem: () => Api.get('/monitor/system'),
    getProcess: () => Api.get('/monitor/process'),
    recordMetric: (data) => Api.post('/monitor/metric', data),
    getMetrics: (params) => Api.get('/monitor/metrics', params),
    getStats: () => Api.get('/monitor/stats')
};

// 通知系统 API
const NotificationApi = {
    create: (data) => Api.post('/notifications', data),
    list: (params) => Api.get('/notifications', params),
    unreadCount: () => Api.get('/notifications/unread-count'),
    markRead: (id) => Api.put(`/notifications/${id}/read`),
    markAllRead: () => Api.put('/notifications/read-all'),
    delete: (id) => Api.delete(`/notifications/${id}`),
    deleteAll: () => Api.delete('/notifications')
};

// 数据导入导出 API
const ExportApi = {
    exportUsers: (format = 'csv') => `${Config.apiBase}/export/users?format=${format}`,
    exportNotifications: (format = 'csv') => `${Config.apiBase}/export/notifications?format=${format}`,
    exportFiles: (format = 'csv') => `${Config.apiBase}/export/files?format=${format}`,
    importUsers: (file) => Api.upload('/export/import/users', file)
};

// 国际化 API
const I18nApi = {
    getLanguages: () => Api.get('/i18n/languages'),
    translate: (key, lang) => Api.get('/i18n/translate', { key, lang }),
    setLanguage: (lang) => Api.post('/i18n/set-language', { language: lang })
};

// 公告 API
const AnnouncementApi = {
    list: (params) => Api.get('/announcements', params),
    getPublished: (limit) => Api.get('/announcements/published', { limit }),
    get: (id) => Api.get(`/announcements/${id}`),
    create: (data) => Api.post('/announcements', data),
    update: (id, data) => Api.put(`/announcements/${id}`, data),
    delete: (id) => Api.delete(`/announcements/${id}`),
    view: (id) => Api.post(`/announcements/${id}/view`)
};



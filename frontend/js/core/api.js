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
            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');

            // JSON 响应
            if (isJson) {
                const data = await response.json();

                // 处理 HTTP 错误状态码（JSON）
                if (!response.ok) {
                    let errorMessage = '请求失败';

                    if (data.detail) {
                        if (Array.isArray(data.detail)) {
                            const firstError = data.detail[0];
                            if (firstError.msg) {
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

                    if (response.status === 401) {
                        Store.clearAuth();
                        Router.push('/login');
                        throw new Error(errorMessage || '登录已过期，请重新登录');
                    }

                    throw new Error(errorMessage);
                }

                // 业务错误（自定义响应格式）
                if (data.code && data.code !== 200) {
                    throw new Error(data.message || '请求失败');
                }

                return data;
            }

            // 非 JSON 响应（如文件流）
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || '请求失败');
            }

            return await response.blob();
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
    async upload(url, fileOrFormData, fieldName = 'file') {
        const token = localStorage.getItem(Config.storageKeys.token);

        let body;
        if (fileOrFormData instanceof FormData) {
            body = fileOrFormData;
        } else {
            const formData = new FormData();
            formData.append(fieldName, fileOrFormData);
            body = formData;
        }

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
            body
        });

        const data = await response.json();

        // 对于 409 冲突，返回包含状态码的响应，让调用方处理
        if (response.status === 409) {
            return { status: 409, ...data };
        }

        // 其他非 200 状态，抛出错误
        if (!response.ok && response.status !== 409) {
            const errorMsg = data.detail?.message || data.detail || data.message || '上传失败';
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        }

        return data;
    },

    /**
     * 下载文件（返回 Blob 与推断的文件名）
     * 注意：不走 JSON 流程，避免二进制解析异常
     */
    async download(url, options = {}) {
        const token = localStorage.getItem(Config.storageKeys.token);
        const fullUrl = url.startsWith('http') ? url : `${Config.apiBase}${url}`;

        const headers = {
            ...options.headers
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(fullUrl, {
            ...options,
            headers
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || '下载失败');
        }

        const disposition = response.headers.get('content-disposition') || '';
        let filename = options.filename;
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        if (!filename && match && match[1]) {
            try {
                filename = decodeURIComponent(match[1].trim().replace(/(^"|"$)/g, ''));
            } catch (_) {
                filename = match[1].trim().replace(/(^"|"$)/g, '');
            }
        }

        const blob = await response.blob();
        return { blob, filename };
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
    getAuditLogs: (params) => Api.get('/audit', params),
    createModule: (data) => Api.post('/system/modules', data),
    deleteModule: (id, params) => Api.delete(`/system/modules/${id}` + (params ? '?' + new URLSearchParams(params).toString() : ''))
};

const MarketApi = {
    list: () => Api.get('/system/market/list'),
    install: (id) => Api.post(`/system/market/install/${id}`),
    uninstall: (id) => Api.post(`/system/market/uninstall/${id}`),
    /**
     * 上传离线包
     * @param {File} file - 要上传的文件
     * @param {boolean} force - 是否强制覆盖已存在的模块
     */
    upload: (file, force = false) => {
        const url = force ? '/system/market/upload?force=true' : '/system/market/upload';
        return Api.upload(url, file);
    }
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
    // 更新用户信息（管理员）
    updateUser: (id, data) => Api.put(`/users/${id}`, data),
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

// 反馈
const FeedbackApi = {
    // 用户视角
    list: (params) => Api.get('/feedback', params),
    listMy: (params) => Api.get('/feedback/my', params),
    get: (id) => Api.get(`/feedback/${id}`),
    create: (data) => Api.post('/feedback', data),
    update: (id, data) => Api.put(`/feedback/${id}`, data),
    remove: (id) => Api.delete(`/feedback/${id}`),

    // 管理员
    adminList: (params) => Api.get('/feedback/admin/all', params),
    reply: (id, data) => Api.post(`/feedback/${id}/reply`, data),
    adminUpdate: (id, data) => Api.put(`/feedback/${id}/admin`, data),
    statistics: () => Api.get('/feedback/admin/statistics')
};

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
const MessageApi = {
    create: (data) => Api.post('/message', data),
    list: (params) => Api.get('/message', params),
    unreadCount: () => Api.get('/message/unread-count'),
    markRead: (id) => Api.put(`/message/${id}/read`),
    markAllRead: () => Api.put('/message/read-all'),
    delete: (id) => Api.delete(`/message/${id}`),
    deleteAll: () => Api.delete('/message')
};

// 数据导入导出 API
const ExportApi = {
    exportUsers: (format = 'csv') => `${Config.apiBase}/export/users?format=${format}`,
    exportMessages: (format = 'csv') => `${Config.apiBase}/export/message?format=${format}`,
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

// 暴露到全局对象
window.Api = Api;
window.AuthApi = AuthApi;
window.UserApi = UserApi;
window.SystemApi = SystemApi;
window.BlogApi = BlogApi;
window.NotesApi = NotesApi;
window.FeedbackApi = FeedbackApi;
window.StorageApi = StorageApi;
window.BackupApi = BackupApi;
window.MonitorApi = MonitorApi;
window.MessageApi = MessageApi;
window.ExportApi = ExportApi;
window.I18nApi = I18nApi;
window.AnnouncementApi = AnnouncementApi;
window.GroupApi = GroupApi;
window.RoleApi = RoleApi;
window.MarketApi = MarketApi;


const CACHE_NAME = 'jeje-webos-cache';

// 需要预缓存的核心资源
const PRECACHE_ASSETS = [
    // ========== 入口页面 ==========
    '/',
    '/manifest.json',
    '/favicon.ico',

    // ========== 核心图片资源 ==========
    '/static/images/logo.png',
    '/static/images/logo.ico',
    '/static/images/default-avatar.png',

    // ========== 核心 CSS ==========
    '/static/css/core/variables.css',
    '/static/css/core/reset.css',
    '/static/css/core/utils.css',
    '/static/css/core/button.css',
    '/static/css/core/card.css',
    '/static/css/core/form.css',
    '/static/css/core/search.css',
    '/static/css/core/table.css',
    '/static/css/core/tag.css',
    '/static/css/core/pagination.css',
    '/static/css/core/lazy.css',

    // ========== 组件 CSS ==========
    '/static/css/components/modal.css',
    '/static/css/components/toast.css',
    '/static/css/components/sidebar.css',
    '/static/css/components/header.css',
    '/static/css/components/spotlight.css',
    '/static/css/components/dock.css',
    '/static/css/components/topbar.css',
    '/static/css/components/start_menu.css',

    // ========== 页面 CSS ==========
    '/static/css/pages/layout.css',
    '/static/css/pages/desktop.css',
    '/static/css/pages/login.css',

    // ========== 核心 JS ==========
    '/static/js/core/config.js',
    '/static/js/core/api.js',
    '/static/js/core/store.js',
    '/static/js/core/router.js',
    '/static/js/core/component.js',
    '/static/js/core/loader.js',
    '/static/js/core/window_manager.js',
    '/static/js/core/websocket.js',
    '/static/js/core/notification.js',

    // ========== 核心工具 JS ==========
    '/static/js/core/lazy_loader.js',
    '/static/js/core/shortcut_manager.js',

    // ========== 组件 JS ==========
    '/static/js/components/modal.js',
    '/static/js/components/toast.js',
    '/static/js/components/dock.js',
    '/static/js/components/topbar.js',
    '/static/js/components/start_menu.js',
    '/static/js/components/spotlight.js',

    // ========== 页面 JS ==========
    '/static/js/pages/login.js',
    '/static/js/pages/desktop.js',
    '/static/js/pages/app.js',

    // ========== 第三方库 ==========
    '/static/libs/remixicon/remixicon.css',
    '/static/libs/remixicon/remixicon.woff2?t=1708865856766',
    '/static/libs/remixicon/remixicon.woff?t=1708865856766'
];

// 安装阶段：预缓存核心资源
self.addEventListener('install', (event) => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {

                // 尝试缓存核心资源，即使某些失败也不阻断安装
                return cache.addAll(PRECACHE_ASSETS).catch(err => {
                    console.warn('[Service Worker] 预缓存失败，继续执行:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {

    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {

                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. 对于 API 请求，始终使用网络 (仅网络)
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // 2. 对于静态资源 (CSS, JS, Images, Fonts)
    // 第三方库和字体使用 Cache First（不常更新）
    // 业务代码使用 Network First（保证获取最新版本）
    if (url.pathname.startsWith('/static/')) {
        // 第三方库资源：Cache First（变更频率低，优先使用缓存提升性能）
        const isCacheable = url.pathname.startsWith('/static/libs/') || 
                           url.pathname.match(/\.(woff2?|ttf|eot)$/);
        
        if (isCacheable) {
            event.respondWith(
                caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    });
                })
            );
        } else {
            // 业务代码：Network First（保证更新及时）
            event.respondWith(
                fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        return caches.match(event.request);
                    })
            );
        }
        return;
    }

    // 3. 对于页面访问 (HTML)，使用 Network First
    // 保证用户获得最新版本，离线时回退到缓存
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // 缓存成功的导航响应
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // 离线且无缓存时返回根页面（SPA 回退）
                            return caches.match('/');
                        });
                })
        );
        return;
    }
});

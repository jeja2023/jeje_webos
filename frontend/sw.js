const CACHE_NAME = 'jeje-webos-cache';

// 需要预缓存的核心资源
const PRECACHE_ASSETS = [
    '/',
    '/static/css/core/variables.css',
    '/static/css/core/reset.css',
    '/static/css/core/utils.css',
    '/static/js/core/config.js',
    '/static/js/core/api.js'
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

    // 1. 对于 API 请求，始终使用网络 (Network Only)
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // 2. 对于静态资源 (CSS, JS, Images, Fonts) 
    // 改为：网络优先 (Network First) - 适合开发和频繁更新
    // 逻辑：优先获取最新文件并更新缓存，网络断开时才用旧缓存
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // 如果网络请求成功，克隆一份存入缓存，然后返回最新内容
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // 如果断网，则回退到缓存
                    return caches.match(event.request);
                })
        );
        return;
    }

    // 3. 对于页面访问 (HTML)，使用网络优先 (Network First)
    // 这样可以保证用户获得最新版本，离线时回退到缓存
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // 如果离线且缓存也没有，可以返回一个离线页面（如果有）
                            // return caches.match('/offline.html');
                        });
                })
        );
        return;
    }
});

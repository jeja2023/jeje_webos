/**
 * 智能地图组件
 * 支持离线瓦片和 GPS 轨迹多图层展示
 */

class MapPage extends Component {
    constructor(container) {
        super(container);
        this.state = {
            datasets: [], // { id, name, points, color, visible }
            trailFiles: [], // { id, filename, size, created_at }
            mapMode: 'offline', // offline | online
            tileSource: 'amap_offline',
            onlineTileUrl: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            loading: false,
            _eventsBound: false,
            searchQuery: '',
            searchResults: [],
            markers: [], // { id, name, lat, lng, color, icon, description }
            isMarkersVisible: true
        };
        this.map = null;
        this.searchResultsLayer = null; // 搜索结果图层
        this.rulerLayer = null; // 测量图层
        this.heatLayer = null; // 热力图层
        this.rulerPoints = []; // 测量点
        this.state.isRulerMode = false;
        this.state.isHeatmapMode = false;
        this.layers = {};
        this.tileLayer = null;
        this.colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        this.mapContainer = null; // 引用地图DOM元素
        this._zoomRenderTimer = null; // 缩放渲染防抖计时器
    }

    /** 计算轨迹总距离 (km) **/
    calculateDistance(points) {
        if (!points || points.length < 2) return 0;
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1], p2 = points[i];
            if (p1.lat && p1.lng && p2.lat && p2.lng) {
                total += this.haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            }
        }
        return total;
    }

    /** Haversine 公式计算两点距离 (km) **/
    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // 地球半径 km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }


    async fetchMarkers() {
        try {
            const res = await Api.get('/map/markers/list');
            if (res.code === 200) {
                this.setState({ markers: res.data });
            }
        } catch (e) { }
    }

    async fetchTrailFiles() {
        try {
            const res = await Api.get('/map/gps/list');
            if (res.code === 200) {
                this.setState({ trailFiles: res.data });
            }
        } catch (e) { }
    }

    saveMapConfig() {
        const config = {
            tileSource: this.state.tileSource,
            onlineTileUrl: this.state.onlineTileUrl,
            mapMode: this.state.mapMode
        };
        try {
            localStorage.setItem('jeje_map_config', JSON.stringify(config));
        } catch (e) { }
    }

    render() {
        try {
            const { datasets, mapMode, searchQuery, searchResults, markers, isMarkersVisible } = this.state;
            const escape = (str) => (window.Utils && window.Utils.escapeHtml) ? window.Utils.escapeHtml(str) : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

            const renderTrailTree = (items, level = 0) => {
                if (!items || items.length === 0) return `<div class="empty-hint" style="padding: 10px 0; font-size: 11px; opacity: 0.5;">此目录为空</div>`;
                return items.map(item => {
                    const paddingLeft = level * 16 + 12;
                    if (item.type === 'directory') {
                        return `
                            <div class="trail-folder-container" data-id="${escape(item.id)}">
                                <div class="trail-folder-item" style="padding-left: ${paddingLeft}px;">
                                    <div class="folder-info">
                                        <i class="ri-folder-3-fill" style="color: #f59e0b;"></i>
                                        <span class="folder-name text-truncate">${escape(item.filename)}</span>
                                    </div>
                                    <div class="folder-actions">
                                        <button class="btn-icon btn-load-folder" data-id="${escape(item.id)}" title="加载此目录全部"><i class="ri-download-cloud-2-line"></i></button>
                                        <i class="ri-arrow-down-s-line folder-toggle"></i>
                                    </div>
                                </div>
                                <div class="folder-children" style="display: block;">
                                    ${renderTrailTree(item.children, level + 1)}
                                </div>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="trail-file-item" data-id="${escape(item.id)}" style="padding-left: ${paddingLeft}px;">
                                <div class="file-info">
                                    <i class="ri-file-search-line"></i>
                                    <div class="file-text">
                                        <div class="file-name text-truncate" title="${escape(item.filename)}">${escape(item.filename)}</div>
                                        <div class="file-meta">${(item.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                </div>
                                <button class="btn-icon btn-load-trail" data-id="${escape(item.id)}" title="加载轨迹"><i class="ri-download-2-line"></i></button>
                            </div>
                        `;
                    }
                }).join('');
            };

            return `
                <div class="page map-layout fade-in">
                    <div class="map-sidebar">
                        <div class="sidebar-header">
                            <div class="brand-row">
                                <div class="brand-info">
                                    <i class="ri-map-2-fill"></i>
                                    <div class="brand-text">
                                        <div class="brand-title">智能地图</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="map-search-container">
                                <div class="search-group">
                                    <input type="text" class="form-input" id="mapSearchInput" placeholder="查找地点或坐标..." value="${escape(searchQuery || '')}">
                                    <button class="btn btn-primary" id="btnMapSearch">查找</button>
                                </div>
                                ${searchResults && searchResults.length > 0 ? `
                                    <div class="search-dropdown">
                                        ${searchResults.map((res, i) => `
                                            <div class="search-item" data-index="${i}">
                                                <i class="ri-map-pin-2-line"></i>
                                                <span class="text-truncate" title="${escape(res.display_name)}">${escape(res.display_name)}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <div class="dataset-list">
                            <div class="list-section">
                                <div class="section-title">
                                    <span>当前已载入 图层 (${datasets.length})</span>
                                    <div class="section-actions">
                                        ${datasets.length > 0 ? `
                                            <button class="btn-text-only" id="btnFitAll" title="适配全部轨迹"><i class="ri-fullscreen-line"></i></button>
                                            <button class="btn-text-only" id="btnClearAll" title="清除所有图层" style="color: var(--color-error);"><i class="ri-delete-bin-7-line"></i></button>
                                        ` : ''}
                                        <button class="btn-text-only" id="btnUploadGps" style="font-size: 18px;" title="上传新轨迹">
                                            <i class="ri-add-circle-line"></i>
                                        </button>
                                    </div>
                                    <input type="file" id="gpsFileInput" style="display:none" accept=".csv,.xlsx,.xls,.gpx">
                                </div>
                                ${datasets.length === 0 ? `
                                    <div class="empty-hint" style="padding: 20px 0;">
                                        <p style="font-size: 11px; opacity: 0.5;">地图上暂无轨迹图层</p>
                                    </div>
                                ` : datasets.map(ds => {
                const dist = this.calculateDistance(ds.points);
                const distStr = dist >= 1 ? `${dist.toFixed(2)} km` : `${(dist * 1000).toFixed(0)} m`;
                return `
                                    <div class="dataset-item" data-id="${ds.id}">
                                        <div class="ds-info">
                                            <input type="checkbox" class="ds-toggle" data-id="${ds.id}" ${ds.visible ? 'checked' : ''}>
                                            <span class="ds-color-dot" data-id="${ds.id}" style="background:${ds.color}; cursor: pointer;" title="点击修改颜色"></span>
                                            <div class="ds-text">
                                                <span class="ds-name text-truncate" title="${escape(ds.name)}">${escape(ds.name)}</span>
                                                <span class="ds-meta">${ds.points.length} 点 · ${distStr}</span>
                                            </div>
                                        </div>
                                        <div class="ds-actions">
                                            <button class="btn-icon ds-info-btn" data-id="${ds.id}" title="详情"><i class="ri-information-line"></i></button>
                                            <button class="btn-icon ds-export" data-id="${ds.id}" title="导出 GPX"><i class="ri-download-cloud-line"></i></button>
                                            <button class="btn-icon ds-locate" data-id="${ds.id}" title="定位"><i class="ri-focus-3-line"></i></button>
                                            <button class="btn-icon ds-remove" data-id="${ds.id}" title="移除"><i class="ri-close-line"></i></button>
                                        </div>
                                    </div>
                                `}).join('')}
                            </div>

                            <div class="list-section" style="border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 15px;">
                                <div class="section-title">
                                    <span>位置标记 (${markers.length})</span>
                                    <div class="section-actions">
                                        <button class="btn-text-only" id="btnToggleMarkers" title="${isMarkersVisible ? '隐藏全部' : '显示全部'}">
                                            <i class="ri-eye-${isMarkersVisible ? 'line' : 'off-line'}"></i>
                                        </button>
                                        <button class="btn-text-only" id="btnAddMarker" title="添加新标记"><i class="ri-map-pin-add-line"></i></button>
                                    </div>
                                </div>
                                <div class="marker-list" style="max-height: 200px; overflow-y: auto;">
                                    ${markers.length === 0 ? `
                                        <div class="empty-hint" style="padding: 10px 0; font-size: 11px; opacity: 0.5;">暂无本地标记点</div>
                                    ` : markers.map(m => `
                                        <div class="dataset-item marker-item">
                                            <div class="ds-info marker-info">
                                                <i class="ri-map-pin-fill" style="color: ${m.color || '#ef4444'}"></i>
                                                <span class="ds-name text-truncate" title="${escape(m.name)}">${escape(m.name)}</span>
                                            </div>
                                            <div class="ds-actions">
                                                <button class="btn-icon marker-locate" data-id="${m.id}" title="定位"><i class="ri-focus-3-line"></i></button>
                                                <button class="btn-icon marker-delete" data-id="${m.id}" title="删除"><i class="ri-delete-bin-line"></i></button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="list-section" style="border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 15px;">
                                <div class="section-title">
                                    <span>轨迹资源库 (云端)</span>
                                    <div class="section-actions">
                                        <button class="btn-text-only" id="btnCreateFolder" title="新建文件夹"><i class="ri-folder-add-line"></i></button>
                                        <button class="btn-text-only" id="btnRefreshTrails" title="刷新"><i class="ri-refresh-line"></i></button>
                                    </div>
                                </div>
                                <div class="trail-files-tree">
                                    ${renderTrailTree(this.state.trailFiles)}
                                </div>
                            </div>
                        </div >

            <div class="sidebar-footer">
                <div class="mode-switch-group">
                    <div class="switch-label">底图渲染服务器</div>
                    <div class="mode-tabs">
                        <div class="mode-tab ${mapMode === 'offline' ? 'active' : ''}" data-mode="offline">
                            <i class="ri-database-2-line"></i> 本地离线
                        </div>
                        <div class="mode-tab ${mapMode === 'online' ? 'active' : ''}" data-mode="online">
                            <i class="ri-cloud-line"></i> 在线遥感
                        </div>
                    </div>
                </div>
                <div class="footer-extra" style="margin-top: 16px; display: flex; justify-content: flex-start;">
                    ${window.ModuleHelp ? ModuleHelp.createHelpButton('map', '智能地图') : ''}
                </div>
            </div>
                    </div >

                    <div class="map-main">
                        <div class="map-canvas"></div>
                        
                        <!-- 悬浮工具栏 -->
                        <div class="map-floating-tools">
                            <button class="tool-btn" id="btnMapLocate" title="定位当前位置"><i class="ri-crosshair-2-line"></i></button>
                            <button class="tool-btn" id="btnMapHeatmap" title="热力图分析"><i class="ri-fire-line"></i></button>
                            <button class="tool-btn" id="btnMapRuler" title="测量工具"><i class="ri-ruler-2-line"></i></button>
                            <button class="tool-btn" id="btnMapConfig" title="配置中心"><i class="ri-settings-4-line"></i></button>
                        </div>

                        <div class="zoom-indicator">缩放: 12</div>
                        <div id="ruler-hint" style="display:none; position:absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.73); backdrop-filter: blur(8px); color: white; padding: 10px 20px; border-radius: 20px; z-index: 1000; font-size: 13px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            测量模式: 点击地图添加测量点，再次点击测量按钮退出
                        </div>
                    </div>
                </div >
            `;
        } catch (e) {
            console.error('地图渲染错误', e);
            return `<div style="padding:20px;color:red;">地图渲染错误: ${e.message}</div>`;
        }
    }

    async afterMount() {
        this.bindEvents();
        window._currentMap = this;

        // 监听容器大小变化
        if (this.container) {
            this.container.classList.add('map-window-body');
            this._resizeObserver = new ResizeObserver(() => {
                if (this.map) {
                    if (this._invalidateTimer) clearTimeout(this._invalidateTimer);
                    this._invalidateTimer = setTimeout(() => {
                        if (this.map) this.map.invalidateSize();
                    }, 100);
                }
            });
            this._resizeObserver.observe(this.container);
        }

        // 先加载配置，再初始化地图（确保使用正确的配置值）
        await this.loadMapConfig();
        this.initMap();

        // 异步加载其他数据
        this.fetchTrailFiles();
        this.fetchMarkers();
    }

    /** 加载地图配置（不触发渲染）**/
    async loadMapConfig() {
        // [动态加载] 热力图库
        if (typeof L.heatLayer === 'undefined' && !this._heatLibLoading) {
            this._heatLibLoading = true;
            const script = document.createElement('script');
            script.src = '/static/libs/leaflet/leaflet-heat.js';
            script.onload = () => { this._heatLibLoaded = true; };
            document.head.appendChild(script);
        }

        try {
            const res = await Api.get('/map/config');
            if (res.code === 200 && res.data) {
                const config = res.data;
                this.state.mapMode = config.map_mode || 'offline';
                this.state.tileSource = config.tile_source || 'amap_offline';
                this.state.onlineTileUrl = config.online_tile_url || this.state.onlineTileUrl;
                this.state.lastCenter = config.last_center;
                this.state.lastZoom = config.last_zoom;
            }
        } catch (e) {
            let savedMapConfig;
            try { savedMapConfig = localStorage.getItem('jeje_map_config'); } catch (e) { }
            if (savedMapConfig) {
                try {
                    const config = JSON.parse(savedMapConfig);
                    if (config.tileSource) this.state.tileSource = config.tileSource;
                    if (config.onlineTileUrl) this.state.onlineTileUrl = config.onlineTileUrl;
                    if (config.mapMode) this.state.mapMode = config.mapMode;
                } catch (e) { }
            }
        }

        // 关键：配置加载后，如果地图已初始化，更新瓦片层
        if (this.map) {
            this.updateTileLayer();
        }
    }

    /**
     * 重写 update 方法，避免销毁 Leaflet 实例
     * 只更新侧边栏的动态部分，不触碰地图区域
     */
    update() {
        if (!this.container || !this.map) {
            // 如果地图还未初始化，使用默认的完整渲染
            if (this.container) {
                this.container.innerHTML = this.render();
                this.afterUpdate();
            }
            return;
        }

        // 局部更新：只刷新数据集列表、标记点列表、轨迹资源树
        this.updateSidebarContent();
    }

    /**
     * 局部刷新侧边栏内容
     */
    updateSidebarContent() {
        const { datasets, markers, isMarkersVisible, searchResults, searchQuery } = this.state;
        const escape = (str) => (window.Utils && window.Utils.escapeHtml) ? window.Utils.escapeHtml(str) : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

        // 更新搜索框和搜索结果
        const searchContainer = this.container?.querySelector('.map-search-container');
        if (searchContainer) {
            const input = searchContainer.querySelector('#mapSearchInput');
            if (input && input.value !== searchQuery) {
                input.value = searchQuery || '';
            }

            // 更新下拉列表
            let dropdown = searchContainer.querySelector('.search-dropdown');
            if (searchResults && searchResults.length > 0) {
                const dropdownHtml = `
                    <div class="search-dropdown">
                        ${searchResults.map((res, i) => `
                            <div class="search-item" data-index="${i}">
                                <i class="ri-map-pin-2-line"></i>
                                <span class="text-truncate" title="${escape(res.display_name)}">${escape(res.display_name)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                if (dropdown) {
                    dropdown.outerHTML = dropdownHtml;
                } else {
                    searchContainer.insertAdjacentHTML('beforeend', dropdownHtml);
                }
            } else if (dropdown) {
                dropdown.remove();
            }
        }

        // 更新图层列表
        const datasetSection = this.container.querySelector('.dataset-list .list-section:first-child');
        if (datasetSection) {
            const titleSpan = datasetSection.querySelector('.section-title span');
            if (titleSpan) titleSpan.textContent = `当前已载入 图层 (${datasets.length})`;

            const actionsDiv = datasetSection.querySelector('.section-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = `
                    ${datasets.length > 0 ? `
                        <button class="btn-text-only" id="btnFitAll" title="适配全部轨迹"><i class="ri-fullscreen-line"></i></button>
                        <button class="btn-text-only" id="btnClearAll" title="清除所有图层" style="color: var(--color-error);"><i class="ri-delete-bin-7-line"></i></button>
                    ` : ''}
                    <button class="btn-text-only" id="btnUploadGps" style="font-size: 18px;" title="上传新轨迹">
                        <i class="ri-add-circle-line"></i>
                    </button>
                `;
            }

            // 更新数据集列表内容
            let datasetListHtml = '';
            if (datasets.length === 0) {
                datasetListHtml = `<div class="empty-hint" style="padding: 20px 0;"><p style="font-size: 11px; opacity: 0.5;">地图上暂无轨迹图层</p></div>`;
            } else {
                datasetListHtml = datasets.map(ds => {
                    const dist = this.calculateDistance(ds.points);
                    const distStr = dist >= 1 ? `${dist.toFixed(2)} km` : `${(dist * 1000).toFixed(0)} m`;
                    return `
                        <div class="dataset-item" data-id="${ds.id}">
                            <div class="ds-info">
                                <input type="checkbox" class="ds-toggle" data-id="${ds.id}" ${ds.visible ? 'checked' : ''}>
                                <span class="ds-color-dot" data-id="${ds.id}" style="background:${ds.color}; cursor: pointer;" title="点击修改颜色"></span>
                                <div class="ds-text">
                                    <span class="ds-name text-truncate" title="${escape(ds.name)}">${escape(ds.name)}</span>
                                    <span class="ds-meta">${ds.points.length} 点 · ${distStr}</span>
                                </div>
                            </div>
                            <div class="ds-actions">
                                <button class="btn-icon ds-info-btn" data-id="${ds.id}" title="详情"><i class="ri-information-line"></i></button>
                                <button class="btn-icon ds-export" data-id="${ds.id}" title="导出 GPX"><i class="ri-download-cloud-line"></i></button>
                                <button class="btn-icon ds-locate" data-id="${ds.id}" title="定位"><i class="ri-focus-3-line"></i></button>
                                <button class="btn-icon ds-remove" data-id="${ds.id}" title="移除"><i class="ri-close-line"></i></button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // 找到数据集列表容器并更新
            const titleEl = datasetSection.querySelector('.section-title');
            if (titleEl && titleEl.nextElementSibling) {
                // 移除旧的列表项
                while (titleEl.nextElementSibling) {
                    titleEl.nextElementSibling.remove();
                }
            }
            // 插入新内容
            if (titleEl) {
                titleEl.insertAdjacentHTML('afterend', datasetListHtml);
            }
        }

        // 更新标记点列表
        const markerList = this.container.querySelector('.marker-list');
        if (markerList) {
            if (markers.length === 0) {
                markerList.innerHTML = `<div class="empty-hint" style="padding: 10px 0; font-size: 11px; opacity: 0.5;">暂无本地标记点</div>`;
            } else {
                markerList.innerHTML = markers.map(m => `
                    <div class="dataset-item marker-item">
                        <div class="ds-info marker-info">
                            <i class="ri-map-pin-fill" style="color: ${m.color || '#ef4444'}"></i>
                            <span class="ds-name text-truncate" title="${escape(m.name)}">${escape(m.name)}</span>
                        </div>
                        <div class="ds-actions">
                            <button class="btn-icon marker-locate" data-id="${m.id}" title="定位"><i class="ri-focus-3-line"></i></button>
                            <button class="btn-icon marker-delete" data-id="${m.id}" title="删除"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 更新标记点显示切换按钮
        const toggleBtn = this.container.querySelector('#btnToggleMarkers');
        if (toggleBtn) {
            toggleBtn.title = isMarkersVisible ? '隐藏全部' : '显示全部';
            toggleBtn.innerHTML = `<i class="ri-eye-${isMarkersVisible ? 'line' : 'off-line'}"></i>`;
        }

        // 更新轨迹资源树
        this.updateTrailFilesTree();
    }

    /**
     * 更新轨迹资源树
     */
    updateTrailFilesTree() {
        const treeContainer = this.container.querySelector('.trail-files-tree');
        if (!treeContainer) return;

        const escape = (str) => (window.Utils && window.Utils.escapeHtml) ? window.Utils.escapeHtml(str) : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

        const renderTrailTree = (items, level = 0) => {
            if (!items || items.length === 0) return `<div class="empty-hint" style="padding: 10px 0; font-size: 11px; opacity: 0.5;">此目录为空</div>`;
            return items.map(item => {
                const paddingLeft = level * 16 + 12;
                if (item.type === 'directory') {
                    return `
                        <div class="trail-folder-container" data-id="${escape(item.id)}">
                            <div class="trail-folder-item" style="padding-left: ${paddingLeft}px;">
                                <div class="folder-info">
                                    <i class="ri-folder-3-fill" style="color: #f59e0b;"></i>
                                    <span class="folder-name text-truncate">${escape(item.filename)}</span>
                                </div>
                                <div class="folder-actions">
                                    <button class="btn-icon btn-load-folder" data-id="${escape(item.id)}" title="加载此目录全部"><i class="ri-download-cloud-2-line"></i></button>
                                    <i class="ri-arrow-down-s-line folder-toggle"></i>
                                </div>
                            </div>
                            <div class="folder-children" style="display: block;">
                                ${renderTrailTree(item.children, level + 1)}
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="trail-file-item" data-id="${escape(item.id)}" style="padding-left: ${paddingLeft}px;">
                            <div class="file-info">
                                <i class="ri-file-search-line"></i>
                                <div class="file-text">
                                    <div class="file-name text-truncate" title="${escape(item.filename)}">${escape(item.filename)}</div>
                                    <div class="file-meta">${(item.size / 1024).toFixed(1)} KB</div>
                                </div>
                            </div>
                            <button class="btn-icon btn-load-trail" data-id="${escape(item.id)}" title="加载轨迹"><i class="ri-download-2-line"></i></button>
                        </div>
                    `;
                }
            }).join('');
        };

        treeContainer.innerHTML = renderTrailTree(this.state.trailFiles);
    }

    destroy() {
        if (this._invalidateTimer) clearTimeout(this._invalidateTimer);
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this.container) {
            this.container.classList.remove('map-window-body');
        }
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }
        super.destroy();
    }

    initMap() {
        // 防止重复初始化
        if (this._mapInitializing) return;

        if (typeof L === 'undefined') {
            console.error('Leaflet (L) 未定义，请检查资源加载');
            return;
        }

        const container = this.container ? this.container.querySelector('.map-canvas') : null;
        if (!container) {
            console.warn('地图容器 .map-canvas 未找到');
            return;
        }

        // 检测容器高度，若为 0 则延迟重试
        if (container.clientHeight === 0) {
            if ((this._initRetryCount || 0) > 10) {
                console.error('地图容器高度持续为 0，停止重试');
                return;
            }
            this._initRetryCount = (this._initRetryCount || 0) + 1;
            setTimeout(() => this.initMap(), 200);
            return;
        }
        this._initRetryCount = 0;

        // 如果地图已存在且容器相同，仅刷新
        if (this.map) {
            try {
                if (this.map.getContainer() === container) {
                    this.map.invalidateSize();
                    this.updateTileLayer(); // 即使存在也要确保瓦片层正确
                    return;
                }
            } catch (e) { }
            // 容器变化，移除旧地图
            try { this.map.remove(); } catch (e) { }
            this.map = null;
        }

        this._mapInitializing = true;

        const center = this.state.lastCenter || [34.3, 118.5];
        const zoom = this.state.lastZoom || 12;

        try {
            this.map = L.map(container, {
                center: center,
                zoom: zoom,
                zoomControl: false,
                attributionControl: false
            });

            setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 100);
            setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
            setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 1500);

            // 如果处于不可见状态，持续尝试直到可见
            const checkVisibility = setInterval(() => {
                if (!this.map) { clearInterval(checkVisibility); return; }
                const container = this.map.getContainer();
                if (container && container.clientHeight > 0) {
                    this.map.invalidateSize();
                    clearInterval(checkVisibility);
                }
            }, 1000);
            setTimeout(() => clearInterval(checkVisibility), 5000);

            L.control.zoom({ position: 'bottomright' }).addTo(this.map);
            L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(this.map);

            this.updateTileLayer();

            this.map.on('zoomend', () => {
                const el = this.container.querySelector('.zoom-indicator');
                if (el) el.innerText = `缩放: ${this.map.getZoom()} `;

                if (this._zoomRenderTimer) clearTimeout(this._zoomRenderTimer);
                this._zoomRenderTimer = setTimeout(() => {
                    this.state.datasets.forEach(ds => {
                        if (ds.visible && ds.points.length > 500) this.renderDataset(ds);
                    });
                }, 300);
            });

            this.map.on('moveend', () => this.syncMapConfig());

            this.state.datasets.forEach(ds => {
                if (ds.visible) this.renderDataset(ds);
            });
            this.renderMarkers();

            if (!this._initialDatasetsLoaded) {
                this._initialDatasetsLoaded = true;
                this.restoreDatasets();
            }
        } catch (e) {
            console.error('创建地图实例失败:', e);
        } finally {
            this._mapInitializing = false;
        }
    }

    async updateTileLayer(isUserSwitch = false) {
        if (!this.map) return;

        const { mapMode, tileSource, onlineTileUrl } = this.state;
        let url = "";

        if (mapMode === 'offline') {
            if (!tileSource) return;
            url = `/static/storage/modules/map/map_tiles/${tileSource}/{z}/{x}/{y}.png`;
        } else {
            // 在线模式：直接使用瓦片源URL（高德等第三方服务通常支持跨域）
            const baseUrl = onlineTileUrl || 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
            url = baseUrl;
        }

        if (!url) return;

        // 如果层已存在且 URL 相同，则无需重新创建
        if (this.tileLayer && this.tileLayer._url === url) return;

        if (this.tileLayer) {
            this.map.removeLayer(this.tileLayer);
        }

        // 瓦片层配置
        const tileOptions = {
            maxZoom: 18,
            minZoom: 1,
            errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABzy+wvAAAABlBMVEXMzMyWlpYU2uzLAAAAGUlEQVRIx2NgGAWjYBSMglEwCkbBSAcACBAAAegP9zsAAAAASUVORK5CYII='
        };

        this.tileLayer = L.tileLayer(url, tileOptions);
        this.tileLayer.addTo(this.map);

        if (isUserSwitch && mapMode === 'offline' && this.state.sources) {
            const sInfo = this.state.sources.find(s => s.name === tileSource);
            if (sInfo && sInfo.center) {
                this.map.flyTo(sInfo.center, sInfo.default_zoom || 12);
            }
        }
    }

    bindEvents() {
        if (this.state._eventsBound) return;
        this.state._eventsBound = true;

        this.delegate('click', '#btnUploadGps', () => {
            const el = this.container.querySelector('#gpsFileInput');
            if (el) el.click();
        });

        this.delegate('change', '#gpsFileInput', (e, el) => {
            if (el && el.files[0]) this.handleFileUpload(el.files[0]);
        });

        // 轨迹仓库增强事件
        this.delegate('click', '#btnRefreshTrails', () => this.fetchTrailFiles());

        this.delegate('click', '.folder-toggle', (e, el) => {
            const container = el.closest('.trail-folder-container');
            container.classList.toggle('collapsed');
        });

        this.delegate('click', '#btnCreateFolder', () => this.handleCreateFolder());

        this.delegate('click', '.btn-load-trail', (e, el) => {
            this.loadTrailFile(el.dataset.id);
        });

        this.delegate('click', '.btn-load-folder', (e, el) => {
            this.loadFolderTrails(el.dataset.id);
        });

        // 当前位置定位
        this.delegate('click', '#btnMapLocate', () => this.locateCurrentPosition());

        // 热力图开关
        this.delegate('click', '#btnMapHeatmap', (e, el) => {
            this.toggleHeatmap();
            el.classList.toggle('active', this.state.isHeatmapMode);
        });

        // 测量工具
        this.delegate('click', '#btnMapRuler', (e, el) => {
            this.toggleRuler();
            el.classList.toggle('active', this.state.isRulerMode);
        });

        // 导出功能
        this.delegate('click', '.ds-export', (e, el) => {
            this.exportToGPX(el.dataset.id);
        });

        // [新增] 轨迹颜色修改
        this.delegate('click', '.ds-color-dot', (e, el) => {
            const dsId = el.dataset.id;
            const currentDs = this.state.datasets.find(d => d.id === dsId);
            if (!currentDs) return;

            const picker = document.createElement('input');
            picker.type = 'color';
            picker.value = currentDs.color;
            picker.onchange = (ev) => this.handleColorChange(dsId, ev.target.value);
            picker.click();
        });

        // 搜索事件
        this.delegate('click', '#btnMapSearch', () => this.handleSearch());
        this.delegate('keydown', '#mapSearchInput', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        this.delegate('click', '.search-item', (e, el) => {
            const res = this.state.searchResults[el.dataset.index];
            if (res) this.goToSearchResult(res);
        });

        this.delegate('click', '#btnMapConfig', (e) => {
            e.stopPropagation();
            this.showMapConfig();
        });

        this.delegate('click', '.mode-tab', (e, el) => {
            const mode = el.dataset.mode;
            if (this.state.mapMode === mode) return;
            this.container.querySelectorAll('.mode-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
            this.state.mapMode = mode;
            Toast.info(`已切换至 ${mode === 'online' ? '在线遥感模式' : '离线存储模式'}`);
            this.updateTileLayer();
            this.saveMapConfig();
            this.syncMapConfig();
        });

        this.delegate('change', '.ds-toggle', (e, el) => {
            const ds = this.state.datasets.find(d => d.id === el.dataset.id);
            if (ds) { ds.visible = el.checked; this.renderDataset(ds); }
        });

        this.delegate('click', '.ds-locate', (e, el) => this.locateDataset(el.dataset.id));
        this.delegate('click', '.ds-remove', (e, el) => this.removeDataset(el.dataset.id));
        this.delegate('click', '.ds-info-btn', (e, el) => this.showDatasetInfo(el.dataset.id));

        // 批量操作
        this.delegate('click', '#btnFitAll', () => this.fitAllDatasets());
        this.delegate('click', '#btnClearAll', () => this.clearAllDatasets());

        // --- 标记点事件 ---
        this.delegate('click', '#btnToggleMarkers', () => {
            this.setState({ isMarkersVisible: !this.state.isMarkersVisible });
            this.renderMarkers();
        });

        this.delegate('click', '#btnAddMarker', () => this.handleCreateMarker());

        this.delegate('click', '.marker-locate', (e, el) => {
            const marker = this.state.markers.find(m => m.id === parseInt(el.dataset.id));
            if (marker) this.map.setView([marker.lat, marker.lng], 16);
        });

        // 侧边栏标记点删除按钮
        this.delegate('click', '.marker-delete', (e, el) => {
            this.removeMarker(parseInt(el.dataset.id));
        });

        // 点击外部隐藏搜索结果
        this._outsideClickHandler = (e) => {
            if (!this.state.searchResults || this.state.searchResults.length === 0) return;
            const container = this.container?.querySelector('.map-search-container');
            if (container && !container.contains(e.target)) {
                this.setState({ searchResults: [] });
            }
        };
        document.addEventListener('click', this._outsideClickHandler);
    }

    /** 创建标记点引导 **/
    handleCreateMarker() {
        const center = this.map.getCenter();
        Modal.prompt({
            title: '在当前位置添加标记',
            label: '标记名称',
            placeholder: '输入地点名称，如：我的秘密基地',
            onConfirm: async (name) => {
                if (!name) return false;
                try {
                    const res = await Api.post('/map/markers/add', {
                        name: name,
                        lat: center.lat,
                        lng: center.lng,
                        color: this.colors[this.state.markers.length % this.colors.length],
                        icon: 'ri-map-pin-2-fill'
                    });
                    if (res.code === 200) {
                        Toast.success('标记点已保存');
                        await this.fetchMarkers();
                        this.renderMarkers();
                        return true;
                    }
                } catch (e) { Toast.error('保存失败'); }
                return false;
            }
        });
    }

    /** 测量工具逻辑 **/
    toggleRuler() {
        this.state.isRulerMode = !this.state.isRulerMode;
        const hint = this.container.querySelector('#ruler-hint');

        if (this.state.isRulerMode) {
            hint.style.display = 'block';
            this.map.getContainer().style.cursor = 'crosshair';
            if (!this.rulerLayer) this.rulerLayer = L.layerGroup().addTo(this.map);
            // 保存事件处理器引用，方便后续移除
            this._rulerClickHandler = this.onMapClickRuler.bind(this);
            this.map.on('click', this._rulerClickHandler);
        } else {
            hint.style.display = 'none';
            this.map.getContainer().style.cursor = '';
            if (this.rulerLayer) {
                this.rulerLayer.clearLayers();
                this.rulerPoints = [];
            }
            // 只移除测量专用的点击事件，避免影响其他功能
            if (this._rulerClickHandler) {
                this.map.off('click', this._rulerClickHandler);
                this._rulerClickHandler = null;
            }
        }
    }

    onMapClickRuler(e) {
        if (!this.state.isRulerMode) return;
        const latlng = e.latlng;
        this.rulerPoints.push(latlng);

        L.circleMarker(latlng, { radius: 5, color: '#ef4444', fillOpacity: 1 }).addTo(this.rulerLayer);

        if (this.rulerPoints.length > 1) {
            const prev = this.rulerPoints[this.rulerPoints.length - 2];
            const dist = this.map.distance(prev, latlng);
            L.polyline([prev, latlng], { color: '#ef4444', weight: 3, dashArray: '5, 8' }).addTo(this.rulerLayer);

            const midPoint = [(prev.lat + latlng.lat) / 2, (prev.lng + latlng.lng) / 2];
            const distText = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(0)} m`;
            L.tooltip({ permanent: true, direction: 'top', className: 'ruler-tooltip' })
                .setLatLng(midPoint)
                .setContent(distText)
                .addTo(this.rulerLayer);

            // 更新总距离提示
            this.updateRulerTotal();
        }
    }

    /** 更新测量总距离 **/
    updateRulerTotal() {
        if (this.rulerPoints.length < 2) return;

        let total = 0;
        for (let i = 1; i < this.rulerPoints.length; i++) {
            total += this.map.distance(this.rulerPoints[i - 1], this.rulerPoints[i]);
        }

        const totalStr = total > 1000 ? `${(total / 1000).toFixed(2)} km` : `${total.toFixed(0)} m`;
        const hint = this.container.querySelector('#ruler-hint');
        if (hint) {
            hint.innerHTML = `测量模式: 已添加 ${this.rulerPoints.length} 个点，总距离 <b style="color:#ef4444;">${totalStr}</b>　|　<span style="cursor:pointer;text-decoration:underline;" onclick="window._currentMap.clearRulerPoints()">清除重测</span>　|　再次点击按钮退出`;
        }
    }

    /** 清除测量点 **/
    clearRulerPoints() {
        if (this.rulerLayer) {
            this.rulerLayer.clearLayers();
            this.rulerPoints = [];
        }
        const hint = this.container.querySelector('#ruler-hint');
        if (hint) {
            hint.innerHTML = '测量模式: 点击地图添加测量点，再次点击测量按钮退出';
        }
    }

    /** 定位到当前位置 **/
    locateCurrentPosition() {
        if (!navigator.geolocation) {
            Toast.error('您的浏览器不支持地理定位');
            return;
        }

        Toast.info('正在获取位置信息...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                // 移动到当前位置
                this.map.flyTo([latitude, longitude], 15);

                // 移除之前的定位标记
                if (this._locationMarker) {
                    this.map.removeLayer(this._locationMarker);
                    this.map.removeLayer(this._locationCircle);
                }

                // 添加定位标记
                this._locationMarker = L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        className: 'location-marker',
                        html: '<div style="width: 20px; height: 20px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(this.map);

                // 添加精度圈
                this._locationCircle = L.circle([latitude, longitude], {
                    radius: accuracy,
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.1,
                    weight: 1
                }).addTo(this.map);

                Toast.success(`定位成功 (精度: ${accuracy.toFixed(0)}m)`);
            },
            (error) => {
                const msgs = {
                    1: '定位权限被拒绝',
                    2: '无法获取位置信息',
                    3: '定位请求超时'
                };
                Toast.error(msgs[error.code] || '定位失败');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }

    /** 文件夹操作 **/
    handleCreateFolder() {
        Modal.prompt({
            title: '新建资源文件夹',
            label: '文件夹名称',
            placeholder: '输入名称...',
            onConfirm: async (val) => {
                if (!val) return false;
                try {
                    const res = await Api.post(`/map/gps/mkdir?dir_name=${encodeURIComponent(val)}`);
                    if (res.code === 200) {
                        Toast.success('文件夹创建成功');
                        this.fetchTrailFiles();
                        return true;
                    }
                } catch (e) { Toast.error('创建失败'); }
                return false;
            }
        });
    }

    /** 批量加载文件夹 **/
    async loadFolderTrails(folderId) {
        const findFolder = (items, id) => {
            for (const item of items) {
                if (item.id === id) return item;
                if (item.children) {
                    const res = findFolder(item.children, id);
                    if (res) return res;
                }
            }
        };

        const folder = findFolder(this.state.trailFiles, folderId);
        if (!folder || !folder.children) return;

        const files = folder.children.filter(f => f.type === 'file');
        if (files.length === 0) {
            Toast.info('该文件夹暂无文件');
            return;
        }

        Toast.info(`正在加载目录 "${folder.filename}" 下的 ${files.length} 个轨迹...`);
        let loadedCount = 0;
        for (const file of files) {
            if (this.state.datasets.some(ds => ds.id === file.id)) continue;
            try {
                const res = await Api.get(`/map/gps/load?file_id=${encodeURIComponent(file.id)}`);
                if (res.code === 200) {
                    this.state.datasets.push({
                        id: res.data.id,
                        name: res.data.filename,
                        points: res.data.points,
                        color: this.colors[this.state.datasets.length % this.colors.length],
                        visible: true
                    });
                    loadedCount++;
                }
            } catch (e) { }
        }

        if (loadedCount > 0) {
            this.setState({ datasets: [...this.state.datasets] });
            Toast.success(`成功加载 ${loadedCount} 条轨迹`);
        } else {
            Toast.info('资源均已载入');
        }
    }

    async handleSearch() {
        const input = this.container.querySelector('#mapSearchInput');
        const query = input ? input.value.trim() : '';
        if (!query) return;

        // [优化] 支持直接输入坐标跳转 (支持格式: lat,lng 或 lat lng)
        const coordMatch = query.match(/^([+-]?\d+\.?\d*)\s*[,，\s]\s*([+-]?\d+\.?\d*)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                if (this.map) {
                    this.map.flyTo([lat, lng], 14);
                    Toast.success(`正在跳转至坐标: ${lat}, ${lng}`);
                    return;
                }
            }
        }

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            this.setState({ searchResults: data, searchQuery: query });
        } catch (e) { Toast.error('地点搜索失败'); }
    }

    goToSearchResult(res) {
        if (!this.map) return;
        const lat = parseFloat(res.lat), lon = parseFloat(res.lon);
        if (this.searchResultsLayer) this.map.removeLayer(this.searchResultsLayer);
        this.searchResultsLayer = L.layerGroup().addTo(this.map);
        L.marker([lat, lon]).addTo(this.searchResultsLayer).bindPopup(res.display_name).openPopup();
        this.map.flyTo([lat, lon], 14);
        this.setState({ searchResults: [] });
    }

    afterUpdate() {
        // 仅在地图不存在时初始化，否则只刷新尺寸
        setTimeout(() => {
            if (!this.map) {
                this.initMap();
            } else {
                this.map.invalidateSize();
            }
        }, 50);
    }

    async handleFileUpload(file) {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        Toast.info('数据解析中...');
        try {
            const res = await Api.upload('/map/upload', formData);
            if (res.code === 200) {
                const newDs = {
                    id: res.data.id,
                    name: res.data.filename,
                    points: res.data.points,
                    color: res.data.color || this.colors[this.state.datasets.length % this.colors.length],
                    visible: true
                };
                this.setState({ datasets: [...this.state.datasets, newDs] });
                this.locateDataset(newDs.id);
                Toast.success('导入完成');

                // 上传后自动刷新文件列表
                this.fetchTrailFiles();
            }
        } catch (e) { Toast.error('轨迹导入失败'); }
    }

    async loadTrailFile(fileId, silent = false) {
        // 检查是否已经加载
        if (this.state.datasets.some(ds => ds.id === fileId)) {
            if (!silent) {
                Toast.info('该轨迹已在地图上');
                this.locateDataset(fileId);
            }
            return;
        }

        if (!silent) Toast.info('加载轨迹中...');
        try {
            const res = await Api.get(`/map/gps/load?file_id=${encodeURIComponent(fileId)}`);
            if (res.code === 200) {
                const newDs = {
                    id: res.data.id,
                    name: res.data.filename,
                    points: res.data.points,
                    color: res.data.color || this.colors[this.state.datasets.length % this.colors.length],
                    visible: true
                };
                this.setState({ datasets: [...this.state.datasets, newDs] });
                if (!silent) {
                    this.locateDataset(newDs.id);
                    Toast.success('加载成功');
                }
            }
        } catch (e) {
            if (!silent) Toast.error('轨迹加载失败');
        }
    }

    async loadAllTrails() {
        const { trailFiles, datasets } = this.state;
        const unloaded = trailFiles.filter(f => !datasets.some(ds => ds.id === f.id));

        if (unloaded.length === 0) {
            Toast.info('所有轨迹已加载');
            return;
        }

        Toast.info(`正在批量加载 ${unloaded.length} 个轨迹...`);
        let loadedCount = 0;
        for (const file of unloaded) {
            try {
                const res = await Api.get(`/map/gps/load?file_id=${encodeURIComponent(file.id)}`);
                if (res.code === 200) {
                    const newDs = {
                        id: res.data.id,
                        name: file.filename,
                        points: res.data.points,
                        color: this.colors[(datasets.length + loadedCount) % this.colors.length],
                        visible: true
                    };
                    datasets.push(newDs);
                    loadedCount++;
                }
            } catch (e) { console.error(`加载 ${file.id} 失败`, e); }
        }

        if (loadedCount > 0) {
            this.setState({ datasets: [...datasets] });
            Toast.success(`成功加载 ${loadedCount} 个轨迹`);
        }
    }

    /** 轨迹持久化：保存当前已加载的轨迹 ID 列表 **/
    savePersistDatasets() {
        const ids = this.state.datasets.map(ds => ds.id);
        localStorage.setItem('jeje_map_active_datasets', JSON.stringify(ids));
    }

    /** 轨迹持久化：恢复上次加载的轨迹 **/
    async restoreDatasets() {
        const saved = localStorage.getItem('jeje_map_active_datasets');
        if (!saved) return;
        try {
            const ids = JSON.parse(saved);
            if (ids && ids.length > 0) {
                Toast.info(`正在恢复上次的 ${ids.length} 条轨迹...`);
                for (const id of ids) {
                    await this.loadTrailFile(id, true); // true 表示静默加载，不弹 Toast
                }
            }
        } catch (e) { }
    }

    /** [高性能渲染] 绘制轨迹图层 **/
    renderDataset(ds) {
        if (!this.map) return;
        if (this.layers[ds.id]) this.map.removeLayer(this.layers[ds.id]);
        if (!ds.visible) return;

        const group = L.featureGroup(), latlngs = [];
        const pointCount = ds.points.length;
        const bounds = this.map.getBounds(); // 获取当前视口

        // 性能策略：
        // 1. 根据缩放级别和点数决定抽稀步长
        const isFar = this.map.getZoom() < 10;
        const skipStep = pointCount > 2000 ? Math.ceil(pointCount / (isFar ? 200 : 800)) : 1;

        ds.points.forEach((pt, index) => {
            if (pt.lat && pt.lng) {
                const pos = [pt.lat, pt.lng];
                latlngs.push(pos);

                // 抽稀渲染点 + 视口裁剪 (只在视野内渲染 Marker)
                if (index % skipStep === 0 && (pointCount < 500 || bounds.contains(pos))) {
                    L.circleMarker(pos, {
                        radius: pointCount > 1000 ? 2 : 4,
                        color: ds.color,
                        fillOpacity: 0.8,
                        stroke: false
                    }).bindPopup(`<b>${pt.name || '标记点'}</b><br>${pt.time || ''}`).addTo(group);
                }
            }
        });

        if (latlngs.length > 1) {
            L.polyline(latlngs, {
                color: ds.color,
                weight: 3,
                opacity: 0.6,
                smoothFactor: 2.0
            }).addTo(group);
        }

        group.addTo(this.map);
        this.layers[ds.id] = group;
        this.savePersistDatasets();
    }

    /** 修改轨迹颜色 **/
    async handleColorChange(id, color) {
        const ds = this.state.datasets.find(d => d.id === id);
        if (!ds) return;

        // 1. 即时更新状态和渲染
        ds.color = color;
        this.renderDataset(ds);
        this.setState({ datasets: [...this.state.datasets] });

        // 2. 异步持久化到后端 (如果已在数据库中)
        if (typeof id === 'number' || !isNaN(id)) {
            try {
                await Api.post(`/map/gps/update_style?trail_id=${id}&color=${encodeURIComponent(color)}`);
            } catch (e) {
                console.error('样式持久化失败', e);
            }
        }
    }

    locateDataset(id) {
        const layer = this.layers[id];
        if (layer && this.map) {
            try {
                this.map.fitBounds(layer.getBounds(), { padding: [50, 50] });
            } catch (e) { }
        }
    }

    async removeDataset(id) {
        if (this.layers[id]) this.map.removeLayer(this.layers[id]);
        delete this.layers[id];
        const newDatasets = this.state.datasets.filter(d => d.id !== id);
        this.setState({ datasets: newDatasets });
        this.savePersistDatasets();

        // [持久化] 如果是数据库记录，同步删除后端物理文件和记录
        if (typeof id === 'number' || !isNaN(id)) {
            try {
                await Api.delete(`/map/gps/delete?trail_id=${id}`);
                Toast.success('轨迹已从库中删除');
                this.fetchTrailFiles(); // 刷新列表
            } catch (e) {
                console.error('删除后端记录失败', e);
            }
        }
    }

    /** 适配全部轨迹到视野 **/
    fitAllDatasets() {
        if (!this.map || this.state.datasets.length === 0) return;

        const allBounds = [];
        this.state.datasets.forEach(ds => {
            if (ds.visible && this.layers[ds.id]) {
                try {
                    allBounds.push(this.layers[ds.id].getBounds());
                } catch (e) { }
            }
        });

        if (allBounds.length > 0) {
            let combined = allBounds[0];
            for (let i = 1; i < allBounds.length; i++) {
                combined.extend(allBounds[i]);
            }
            this.map.fitBounds(combined, { padding: [50, 50] });
            Toast.success('已适配全部轨迹范围');
        }
    }

    /** 清除所有图层 **/
    clearAllDatasets() {
        if (this.state.datasets.length === 0) return;

        if (!confirm(`确定要清除地图上的 ${this.state.datasets.length} 个轨迹图层吗？\n（仅从地图移除，不会删除云端文件）`)) return;

        // 移除所有图层
        Object.values(this.layers).forEach(layer => {
            if (layer && this.map) this.map.removeLayer(layer);
        });
        this.layers = {};
        this.setState({ datasets: [] });
        this.savePersistDatasets();
        Toast.success('已清除所有图层');
    }

    /** 显示轨迹详情 **/
    showDatasetInfo(id) {
        const ds = this.state.datasets.find(d => d.id == id);
        if (!ds) return;

        const dist = this.calculateDistance(ds.points);
        const distStr = dist >= 1 ? `${dist.toFixed(2)} km` : `${(dist * 1000).toFixed(0)} m`;

        // 计算时间跨度
        let timeInfo = '无时间数据';
        const times = ds.points.filter(p => p.time).map(p => new Date(p.time));
        if (times.length >= 2) {
            times.sort((a, b) => a - b);
            const durationMs = times[times.length - 1] - times[0];
            const hours = Math.floor(durationMs / 3600000);
            const mins = Math.floor((durationMs % 3600000) / 60000);
            timeInfo = hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
        }

        // 计算边界
        let bounds = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
        ds.points.forEach(p => {
            if (p.lat && p.lng) {
                bounds.minLat = Math.min(bounds.minLat, p.lat);
                bounds.maxLat = Math.max(bounds.maxLat, p.lat);
                bounds.minLng = Math.min(bounds.minLng, p.lng);
                bounds.maxLng = Math.max(bounds.maxLng, p.lng);
            }
        });

        Modal.show({
            title: '轨迹详情',
            width: '400px',
            content: `
                <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px 0;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="ds-color-dot" style="background:${ds.color}; width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;"></span>
                        <span style="font-weight: 600; font-size: 16px;">${ds.name}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-primary);">${ds.points.length}</div>
                            <div style="font-size: 11px; opacity: 0.6;">轨迹点数</div>
                        </div>
                        <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-success);">${distStr}</div>
                            <div style="font-size: 11px; opacity: 0.6;">总里程</div>
                        </div>
                        <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-warning);">${timeInfo}</div>
                            <div style="font-size: 11px; opacity: 0.6;">时间跨度</div>
                        </div>
                        <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-info);">${dist > 0 && times.length >= 2 ? ((dist / ((times[times.length - 1] - times[0]) / 3600000)).toFixed(1)) : '-'}</div>
                            <div style="font-size: 11px; opacity: 0.6;">平均速度(km/h)</div>
                        </div>
                    </div>
                    <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: 10px; font-size: 12px;">
                        <div style="margin-bottom: 6px; font-weight: 500;">地理范围</div>
                        <div style="opacity: 0.7;">
                            纬度: ${bounds.minLat.toFixed(4)} ~ ${bounds.maxLat.toFixed(4)}<br>
                            经度: ${bounds.minLng.toFixed(4)} ~ ${bounds.maxLng.toFixed(4)}
                        </div>
                    </div>
                </div>
            `,
            confirmText: '定位到此轨迹',
            onConfirm: () => {
                this.locateDataset(id);
                return true;
            }
        });
    }

    /**
     * 显示地图配置对话框
     * [优化] 从后端拉取可用瓦片源，支持下拉选择与删除管理
     */
    async showMapConfig() {
        const { onlineTileUrl, tileSource } = this.state;

        Toast.info('正在获取瓦片信息...');
        let sources = [];
        try {
            const res = await Api.get('/map/tiles/check');
            if (res.code === 200) {
                sources = res.data.sources;
                this.state.sources = sources;
            }
        } catch (e) { }

        const escape = (str) => (window.Utils && window.Utils.escapeHtml) ? window.Utils.escapeHtml(str) : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

        Modal.show({
            title: '地图与离线资源管理',
            width: '450px',
            content: `
                <div class="map-config-form" style="padding: 10px 0;">
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label class="form-label" style="font-weight: 600; margin-bottom: 10px; display: block; font-size: 13px;">在线 XYZ 地图服务</label>
                        <input type="text" class="form-input" id="cfgOnlineUrl" 
                               placeholder="高德: https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
                               value="${escape(onlineTileUrl)}" style="width: 100%; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); padding: 0 14px; background: var(--color-bg-primary); color: var(--color-text); outline: none;">
                    </div>
                    <div class="form-group">
                        <label class="form-label" style="font-weight: 600; margin-bottom: 10px; display: block; font-size: 13px;">离线源管理</label>
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <select id="cfgTileSource" style="flex: 1; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text); padding: 0 10px; cursor: pointer; outline: none;">
                                <option value="">-- 手动输入 --</option>
                                ${sources.map(s => `<option value="${escape(s.name)}" ${s.name === tileSource ? 'selected' : ''}>${escape(s.name)} (${s.count} 层)</option>`).join('')}
                            </select>
                            <button class="btn-icon" id="btnDeleteSource" title="删除选中源" style="color: var(--color-error);"><i class="ri-delete-bin-line"></i></button>
                        </div>
                        <div id="cfgManualSourceBox" style="${sources.length > 0 && sources.some(s => s.name === tileSource) ? 'display:none;' : ''}">
                            <input type="text" class="form-input" id="cfgTileSourceManual" 
                                   placeholder="例如: amap_offline" value="${escape(tileSource)}"
                                   style="width: 100%; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); padding: 0 14px; background: var(--color-bg-primary); color: var(--color-text); outline: none;">
                        </div>
                    </div>
                </div>
            `,
            onMount: (modalEl) => {
                const select = modalEl.querySelector('#cfgTileSource');
                const manualBox = modalEl.querySelector('#cfgManualSourceBox');
                const deleteBtn = modalEl.querySelector('#btnDeleteSource');

                select.addEventListener('change', (e) => {
                    manualBox.style.display = e.target.value === '' ? 'block' : 'none';
                });

                deleteBtn.addEventListener('click', async () => {
                    const val = select.value;
                    if (!val) { Toast.info('请选择一个源'); return; }
                    if (!confirm(`确定删除离线源 [${val}] 吗？`)) return;
                    try {
                        const res = await Api.delete(`/map/tiles/delete?source_name=${encodeURIComponent(val)}`);
                        if (res.code === 200) {
                            Toast.success('删除成功');
                            Modal.hide();
                            this.showMapConfig();
                        }
                    } catch (e) { Toast.error('删除失败'); }
                });
            },
            onConfirm: async () => {
                const urlInput = document.getElementById('cfgOnlineUrl');
                const sourceSelect = document.getElementById('cfgTileSource');
                const sourceManual = document.getElementById('cfgTileSourceManual');

                const onlineTileUrl = urlInput ? urlInput.value.trim() : '';
                let tileSource = sourceSelect ? sourceSelect.value : '';
                if (!tileSource && sourceManual) tileSource = sourceManual.value.trim();

                const config = { onlineTileUrl, tileSource, mapMode: this.state.mapMode };
                try {
                    localStorage.setItem('jeje_map_config', JSON.stringify(config));
                } catch (e) { }
                this.setState(config);
                this.updateTileLayer(true);
                this.syncMapConfig();
                Toast.success('配置已更新');
                return true;
            }
        });
    }

    /** 热力图控制逻辑 **/
    toggleHeatmap() {
        this.state.isHeatmapMode = !this.state.isHeatmapMode;
        if (this.state.isHeatmapMode) {
            Toast.info('已开启轨迹热力分析模式');
            this.renderHeatmap();
        } else {
            if (this.heatLayer) this.map.removeLayer(this.heatLayer);
            this.heatLayer = null;
            // 恢复普通图层可见性
            this.state.datasets.forEach(ds => this.renderDataset(ds));
        }
    }

    renderHeatmap() {
        if (!this.map) return;
        if (this.heatLayer) this.map.removeLayer(this.heatLayer);

        const points = [];
        this.state.datasets.forEach(ds => {
            if (!ds.visible) return;
            // 隐藏普通图层以便观看热力图
            if (this.layers[ds.id]) this.map.removeLayer(this.layers[ds.id]);
            ds.points.forEach(p => {
                if (p.lat && p.lng) points.push([p.lat, p.lng, 0.5]); // 纬度, 经度, 强度
            });
        });

        if (points.length === 0) {
            Toast.info('没有可见的轨迹数据可供分析');
            this.state.isHeatmapMode = false;
            return;
        }

        if (typeof L.heatLayer !== 'undefined') {
            this.heatLayer = L.heatLayer(points, {
                radius: 20,
                blur: 15,
                maxZoom: 17,
                gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' }
            }).addTo(this.map);
        } else if (this._heatLibLoading && !this._heatLibLoaded) {
            // 库正在加载中，延时重试
            Toast.info('热力图引擎加载中...');
            setTimeout(() => this.renderHeatmap(), 500);
        } else {
            Toast.error('热力图引擎加载失败');
            this.state.isHeatmapMode = false;
        }
    }

    /** 导出 GPX 逻辑 **/
    exportToGPX(dsId) {
        const ds = this.state.datasets.find(d => d.id === dsId);
        if (!ds) return;

        Toast.info('正在生成 GPX 文件...');

        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JeJe WebOS Map" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${ds.name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${ds.name}</name>
    <trkseg>`;

        ds.points.forEach(p => {
            const timeTag = p.time ? `<time>${p.time.replace(' ', 'T')}Z</time>` : '';
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lng}">${timeTag}</trkpt>`;
        });

        gpx += `
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ds.name.split('.')[0]}.gpx`;
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('轨迹导出成功');
    }

    /** 渲染所有标记点 **/
    renderMarkers() {
        if (!this.map) return;
        if (this.markerGroup) this.map.removeLayer(this.markerGroup);
        this.markerGroup = L.layerGroup();

        if (this.state.isMarkersVisible) {
            this.state.markers.forEach(m => {
                const marker = L.marker([m.lat, m.lng], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<i class="${m.icon || 'ri-map-pin-2-fill'}" style="color: ${m.color || '#ef4444'}; font-size: 24px; text-shadow: 0 0 3px white;"></i>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 24]
                    })
                });

                marker.bindPopup(`
                    <div class="marker-popup" style="min-width: 180px;">
                        <div style="font-weight:bold; border-bottom:1px solid #eee; padding-bottom:4px; margin-bottom:4px;">${m.name}</div>
                        <div style="font-size:12px; color:#666;">${m.description || '无备注'}</div>
                        <div style="margin-top:8px; display:flex; gap:8px;">
                            <button class="btn-xs btn-marker-edit" onclick="window._currentMap.editMarker(${m.id})" style="background:#dbeafe; color:#3b82f6; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">
                                <i class="ri-edit-line"></i> 编辑
                            </button>
                            <button class="btn-xs btn-marker-delete" onclick="window._currentMap.removeMarker(${m.id})" style="background:#fee2e2; color:#ef4444; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">
                                <i class="ri-delete-bin-line"></i> 删除
                            </button>
                        </div>
                    </div>
                `);

                this.markerGroup.addLayer(marker);
            });
            this.markerGroup.addTo(this.map);
        }
    }

    /** 同步地图配置到后端 (防抖控制) **/
    syncMapConfig() {
        if (!this.map) return;
        if (this._syncTimer) clearTimeout(this._syncTimer);

        this._syncTimer = setTimeout(async () => {
            const center = this.map.getCenter();
            const payload = {
                map_mode: this.state.mapMode,
                tile_source: this.state.tileSource,
                last_center: [center.lat, center.lng],
                last_zoom: this.map.getZoom()
            };

            // 暂时仅保存到本地，避免 401 错误干扰
            this.saveMapConfig();
            try {
                // 如果需要恢复 API 调用，请取消注释，并确保已登录
                // await Api.post('/map/config/save', payload);
            } catch (e) { }
        }, 3000);
    }

    /** 删除标记点 **/
    async removeMarker(id) {
        if (!confirm('确定要删除这个标记点吗？')) return;
        try {
            const res = await Api.delete(`/map/markers/delete?marker_id=${id}`);
            if (res.code === 200) {
                Toast.success('标记点已移除');
                this.setState({ markers: this.state.markers.filter(m => m.id !== id) });
                this.renderMarkers();
            }
        } catch (e) { }
    }

    /** 编辑标记点 **/
    editMarker(id) {
        const marker = this.state.markers.find(m => m.id === id);
        if (!marker) return;

        // 关闭 popup
        this.map.closePopup();

        Modal.show({
            title: '编辑标记点',
            width: '400px',
            content: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">名称</label>
                        <input type="text" id="editMarkerName" value="${marker.name}" 
                               style="width: 100%; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); padding: 0 14px; background: var(--color-bg-primary); color: var(--color-text);">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">备注描述</label>
                        <textarea id="editMarkerDesc" rows="3" placeholder="可选..."
                                  style="width: 100%; border-radius: 10px; border: 1px solid var(--color-border); padding: 10px 14px; background: var(--color-bg-primary); color: var(--color-text); resize: none;">${marker.description || ''}</textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">颜色</label>
                        <input type="color" id="editMarkerColor" value="${marker.color || '#ef4444'}" 
                               style="width: 60px; height: 36px; border: none; cursor: pointer;">
                    </div>
                </div>
            `,
            onConfirm: async () => {
                const name = document.getElementById('editMarkerName')?.value.trim();
                const description = document.getElementById('editMarkerDesc')?.value.trim();
                const color = document.getElementById('editMarkerColor')?.value;

                if (!name) {
                    Toast.error('名称不能为空');
                    return false;
                }

                try {
                    const res = await Api.post('/map/markers/update', {
                        id: id,
                        name: name,
                        description: description,
                        color: color
                    });
                    if (res.code === 200) {
                        Toast.success('标记点已更新');
                        await this.fetchMarkers();
                        this.renderMarkers();
                        return true;
                    }
                } catch (e) { Toast.error('更新失败'); }
                return false;
            }
        });
    }
}

// 绑定全局引用以便 Popup 中的 inline 事件调用
window._currentMap = null;

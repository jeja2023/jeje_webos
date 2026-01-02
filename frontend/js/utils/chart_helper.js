/**
 * 图表辅助工具类 - 统一管理图表初始化、实例管理和响应式处理
 * 用于完全复用图表相关功能，避免代码重复
 */
class ChartHelper {

    /**
     * 统一的图表容器初始化
     * @param {string|HTMLElement} container 容器ID或元素
     * @param {Object} options 配置选项
     * @returns {Object|null} {container, instance} 或 null
     */
    static initChart(container, options = {}) {
        const {
            theme = 'dark', // 主题: 'dark' | 'light' | null
            width = null,   // 宽度
            height = null,  // 高度
            devicePixelRatio = null, // 设备像素比
            renderer = 'canvas' // 渲染器
        } = options;

        // 获取容器元素
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) {
            console.warn('ChartHelper: 容器不存在', container);
            return null;
        }

        // 检查 ECharts 是否已加载
        if (!window.echarts) {
            console.error('ChartHelper: ECharts 未加载');
            return null;
        }

        // 清除容器内容
        containerEl.innerHTML = '';

        // 设置容器样式（如果未设置）
        if (!containerEl.style.width) {
            containerEl.style.width = width ? `${width}px` : '100%';
        }
        if (!containerEl.style.height) {
            containerEl.style.height = height ? `${height}px` : '500px';
        }
        containerEl.style.position = containerEl.style.position || 'relative';
        containerEl.style.display = containerEl.style.display || 'block';

        // 初始化 ECharts 实例
        try {
            const initOptions = {};
            if (width && height) {
                initOptions.width = width;
                initOptions.height = height;
            }
            if (devicePixelRatio) {
                initOptions.devicePixelRatio = devicePixelRatio;
            }
            if (renderer) {
                initOptions.renderer = renderer;
            }

            const instance = Object.keys(initOptions).length > 0
                ? echarts.init(containerEl, theme, initOptions)
                : echarts.init(containerEl, theme);

            if (!instance) {
                console.error('ChartHelper: 图表初始化失败');
                return null;
            }

            return { container: containerEl, instance };
        } catch (e) {
            console.error('ChartHelper: 图表初始化异常', e);
            return null;
        }
    }

    /**
     * 销毁图表实例
     * @param {Object} chartInstance ECharts 实例
     */
    static disposeChart(chartInstance) {
        if (chartInstance && typeof chartInstance.dispose === 'function') {
            try {
                chartInstance.dispose();
            } catch (e) {
                console.warn('ChartHelper: 销毁图表实例失败', e);
            }
        }
    }

    /**
     * 统一的图表渲染流程
     * @param {string|HTMLElement} container 容器ID或元素
     * @param {Object} option ECharts 配置对象
     * @param {Object} options 配置选项
     * @returns {Object|null} {container, instance} 或 null
     */
    static renderChart(container, option, options = {}) {
        const result = this.initChart(container, options);
        if (!result) {
            return null;
        }

        const { instance } = result;

        // 应用配置
        if (option && Object.keys(option).length > 0) {
            try {
                instance.setOption(option, true);
            } catch (e) {
                console.error('ChartHelper: 设置图表配置失败', e);
                this.disposeChart(instance);
                return null;
            }
        }

        // 延迟 resize 确保容器尺寸已稳定
        setTimeout(() => {
            try {
                instance.resize();
            } catch (e) {
                console.warn('ChartHelper: resize 失败', e);
            }
        }, 100);

        return result;
    }

    /**
     * 创建统一的 resize 处理器（防抖）
     * @param {Object} instances 图表实例对象 {id: instance}
     * @param {number} delay 防抖延迟（毫秒）
     * @returns {Function} resize 处理函数
     */
    static createResizeHandler(instances, delay = 200) {
        return Utils.debounce(() => {
            Object.values(instances).forEach(instance => {
                if (instance && typeof instance.resize === 'function') {
                    try {
                        instance.resize();
                    } catch (e) {
                        console.warn('ChartHelper: resize 失败', e);
                    }
                }
            });
        }, delay);
    }

    /**
     * 注册全局 resize 监听器（单例模式）
     * @param {Function} handler resize 处理函数
     * @returns {Function} 清理函数
     */
    static registerGlobalResize(handler) {
        if (!handler || typeof handler !== 'function') {
            return () => { };
        }

        window.addEventListener('resize', handler);

        // 返回清理函数
        return () => {
            window.removeEventListener('resize', handler);
        };
    }

    /**
     * 获取主题模式（根据页面状态自动判断）
     * @param {Object} options 配置选项
     * @returns {string|null} 'dark' | 'light' | null
     */
    static getThemeMode(options = {}) {
        const {
            forceDark = false,      // 强制暗色主题
            forceLight = false,    // 强制亮色主题
            detectDataScreen = true // 是否检测大屏模式
        } = options;

        if (forceDark) return 'dark';
        if (forceLight) return 'light';

        // 检测大屏模式
        if (detectDataScreen) {
            const isDataScreen = document.querySelector('.data-screen-mode') !== null;
            if (isDataScreen) return 'dark';
        }

        // 检测页面主题
        if (document.body.classList.contains('dark')) {
            return 'dark';
        }

        // 检测 Store 中的主题设置
        if (typeof Store !== 'undefined') {
            const storeTheme = Store.get('theme');
            if (storeTheme === 'dark') return 'dark';
            if (storeTheme === 'light') return 'light';
        }

        return null; // 使用 ECharts 默认主题
    }

    /**
     * 获取响应式配置（根据容器宽度自动调整样式）
     * @param {number} containerWidth 容器宽度
     * @param {Object} options 可选配置
     * @returns {Object} 响应式配置对象
     */
    static getResponsiveOptions(containerWidth, options = {}) {
        const { chartType = 'bar', dataCount = 0 } = options;

        const config = {
            grid: {},
            xAxis: {},
            yAxis: {},
            legend: {},
            series: {}
        };

        // 移动端（< 480px）
        if (containerWidth < 480) {
            config.grid = { left: '12%', right: '8%', bottom: '20%', top: 60 };
            config.xAxis = {
                axisLabel: {
                    rotate: 90,
                    fontSize: 10,
                    interval: Math.max(0, Math.floor(dataCount / 8) - 1)
                }
            };
            config.legend = {
                orient: 'horizontal',
                bottom: 0,
                left: 'center',
                textStyle: { fontSize: 10 }
            };
            config.series = {
                label: { fontSize: 9 }
            };
        }
        // 平板（480-768px）
        else if (containerWidth < 768) {
            config.grid = { left: '10%', right: '5%', bottom: '15%', top: 70 };
            config.xAxis = {
                axisLabel: {
                    rotate: 45,
                    fontSize: 11,
                    interval: Math.max(0, Math.floor(dataCount / 12) - 1)
                }
            };
            config.legend = {
                orient: 'horizontal',
                top: 35,
                textStyle: { fontSize: 11 }
            };
        }
        // 桌面（>= 768px）
        else {
            config.grid = { left: '8%', right: '5%', bottom: '15%', top: 80, containLabel: true };
            config.xAxis = {
                axisLabel: {
                    rotate: dataCount > 15 ? 45 : 0,
                    fontSize: 12,
                    interval: 0
                }
            };
            config.legend = {
                top: 35,
                textStyle: { fontSize: 12 }
            };
        }

        // 饼图特殊处理
        if (chartType === 'pie') {
            if (containerWidth < 480) {
                config.series = {
                    radius: ['30%', '55%'],
                    center: ['50%', '55%'],
                    label: { fontSize: 10 }
                };
                config.legend = {
                    orient: 'horizontal',
                    bottom: 0,
                    left: 'center',
                    textStyle: { fontSize: 9 }
                };
            } else if (containerWidth < 768) {
                config.series = {
                    radius: ['35%', '65%'],
                    center: ['50%', '55%']
                };
            }
        }

        return config;
    }

    /**
     * 应用响应式配置到图表选项
     * @param {Object} option 原始图表配置
     * @param {number} containerWidth 容器宽度
     * @param {Object} extraOptions 额外配置
     * @returns {Object} 合并后的配置
     */
    static applyResponsiveOptions(option, containerWidth, extraOptions = {}) {
        const responsive = this.getResponsiveOptions(containerWidth, {
            chartType: option.series?.[0]?.type || 'bar',
            dataCount: option.xAxis?.data?.length || 0,
            ...extraOptions
        });

        // 深度合并配置
        const merged = { ...option };

        if (responsive.grid && merged.grid) {
            merged.grid = { ...merged.grid, ...responsive.grid };
        }
        if (responsive.xAxis && merged.xAxis) {
            if (Array.isArray(merged.xAxis)) {
                merged.xAxis = merged.xAxis.map(ax => ({
                    ...ax,
                    axisLabel: { ...ax.axisLabel, ...responsive.xAxis.axisLabel }
                }));
            } else {
                merged.xAxis = {
                    ...merged.xAxis,
                    axisLabel: { ...merged.xAxis.axisLabel, ...responsive.xAxis.axisLabel }
                };
            }
        }
        if (responsive.legend && merged.legend) {
            merged.legend = { ...merged.legend, ...responsive.legend };
        }

        return merged;
    }

    /**
     * 导出图表为图片
     * @param {Object} chartInstance ECharts 实例
     * @param {Object} options 导出选项
     * @returns {string|null} 图片数据URL
     */
    static exportChartImage(chartInstance, options = {}) {
        if (!chartInstance || typeof chartInstance.getDataURL !== 'function') {
            console.warn('ChartHelper: 图表实例无效或不支持导出');
            return null;
        }

        const {
            type = 'png',
            pixelRatio = 2,
            backgroundColor = '#fff'
        } = options;

        try {
            return chartInstance.getDataURL({
                type,
                pixelRatio,
                backgroundColor
            });
        } catch (e) {
            console.error('ChartHelper: 导出图表失败', e);
            return null;
        }
    }

    /**
     * 导出图表为 SVG 格式
     * @param {Object} chartInstance ECharts 实例
     * @returns {string|null} SVG 字符串
     */
    static exportChartSVG(chartInstance) {
        if (!chartInstance) {
            console.warn('ChartHelper: 图表实例无效');
            return null;
        }

        try {
            // 获取 SVG 渲染器的内容
            const svgDataURL = chartInstance.getDataURL({
                type: 'svg'
            });

            if (svgDataURL && svgDataURL.startsWith('data:image/svg+xml;')) {
                // 解码 base64 SVG
                const base64 = svgDataURL.split(',')[1];
                return atob(base64);
            }

            return svgDataURL;
        } catch (e) {
            console.error('ChartHelper: 导出 SVG 失败', e);
            return null;
        }
    }

    /**
     * 下载图表图片（支持多种格式）
     * @param {Object} chartInstance ECharts 实例
     * @param {string} filename 文件名
     * @param {Object} options 导出选项
     */
    static downloadChartImage(chartInstance, filename, options = {}) {
        const { type = 'png' } = options;

        let dataURL;
        let mimeType;
        let extension;

        if (type === 'svg') {
            const svgContent = this.exportChartSVG(chartInstance);
            if (!svgContent) {
                Toast.error('导出失败');
                return;
            }
            dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
            mimeType = 'image/svg+xml';
            extension = '.svg';
        } else {
            dataURL = this.exportChartImage(chartInstance, options);
            if (!dataURL) {
                Toast.error('导出失败');
                return;
            }
            mimeType = 'image/png';
            extension = '.png';
        }

        try {
            const link = document.createElement('a');
            const finalFilename = filename || `图表导出_${new Date().getTime()}`;
            link.download = finalFilename.endsWith(extension) ? finalFilename : finalFilename + extension;
            link.href = dataURL;
            link.click();
            Toast.success('图片已生成并开始下载');
        } catch (e) {
            console.error('ChartHelper: 下载图表失败', e);
            Toast.error('下载失败: ' + e.message);
        }
    }

    /**
     * 导出图表数据为 CSV
     * @param {Object} chartInstance ECharts 实例
     * @param {string} filename 文件名
     */
    static exportChartData(chartInstance, filename = '图表数据.csv') {
        if (!chartInstance) {
            Toast.error('图表实例无效');
            return;
        }

        try {
            const option = chartInstance.getOption();
            const series = option.series || [];
            const xAxisData = option.xAxis?.[0]?.data || option.xAxis?.data || [];

            const rows = [];
            const headers = ['分类'];

            // 收集系列名称作为表头
            series.forEach(s => {
                if (s.name) {
                    headers.push(s.name);
                }
            });

            if (headers.length === 1 && series.length > 0) {
                headers.push('数值');
            }

            rows.push(headers.join(','));

            // 处理数据
            if (series[0]?.type === 'pie') {
                // 饼图数据格式
                const pieData = series[0].data || [];
                pieData.forEach(item => {
                    rows.push(`"${item.name}",${item.value}`);
                });
            } else {
                // 柱状图/折线图等
                xAxisData.forEach((category, idx) => {
                    const row = [`"${category}"`];
                    series.forEach(s => {
                        const val = s.data?.[idx];
                        const value = typeof val === 'object' ? val?.value : val;
                        row.push(value ?? '');
                    });
                    rows.push(row.join(','));
                });
            }

            // 导出 CSV
            const csvContent = '\ufeff' + rows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();

            Toast.success('数据已导出');
        } catch (e) {
            console.error('ChartHelper: 导出数据失败', e);
            Toast.error('导出失败: ' + e.message);
        }
    }

    /**
     * 获取图表缓存（如果可用）
     * @param {number} chartId 图表ID
     * @param {Array} data 数据
     * @returns {string|null} 缓存的图片数据
     */
    static getCachedImage(chartId, data) {
        if (window.ChartRenderCache) {
            return window.ChartRenderCache.get(chartId, data);
        }
        return null;
    }

    /**
     * 设置图表缓存
     * @param {number} chartId 图表ID
     * @param {Array} data 数据
     * @param {string} imageData 图片数据
     */
    static setCachedImage(chartId, data, imageData) {
        if (window.ChartRenderCache && imageData) {
            window.ChartRenderCache.set(chartId, data, imageData);
        }
    }

    /**
     * 清除图表缓存
     * @param {number} chartId 图表ID（可选，不传则清除全部）
     */
    static clearCache(chartId = null) {
        if (window.ChartRenderCache) {
            if (chartId) {
                window.ChartRenderCache.clearChart(chartId);
            } else {
                window.ChartRenderCache.clear();
            }
        }
    }
}



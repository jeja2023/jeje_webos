/**
 * 图表样式统一配置类
 * 用于统一管理所有图表相关的样式、主题、颜色等配置
 * 确保图表分析、数据大屏、智能报告、数据透镜等模块使用统一的样式配置
 */
class ChartStyleConfig {

    /**
     * 获取所有可用的颜色主题列表
     * @returns {Array} 主题名称数组
     */
    static getAvailableThemes() {
        return ['default', 'blue', 'green', 'orange', 'purple', 'red', 'warm', 'cool', 'rainbow', 'business', 'multi'];
    }

    /**
     * 获取颜色主题配置
     * 统一所有模块的颜色主题定义
     * @param {string} theme 主题名称
     * @returns {Array} 颜色数组
     */
    static getColorScheme(theme) {
        const schemes = {
            // 默认主题 - ECharts 经典配色
            default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#4992ff'],
            
            // BI 仪表盘主题色系
            blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'],
            green: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5'],
            orange: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb'],
            purple: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff'],
            red: ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fef2f2'],
            multi: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'],
            
            // 通用主题色系
            warm: ['#ff7c43', '#ffa600', '#d45087', '#f95d6a', '#ff6b6b', '#fab005', '#fcc419', '#ffe066', '#ffec99', '#fff3bf'],
            cool: ['#4e79a7', '#59a14f', '#76b7b2', '#86bcb6', '#499894', '#4a8fbf', '#69b3a2', '#8dc6bf', '#a5d5cf', '#c7e9e5'],
            rainbow: ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6', '#fabebe', '#bfef45'],
            business: ['#1565c0', '#1976d2', '#1e88e5', '#2196f3', '#42a5f5', '#64b5f6', '#90caf9', '#bbdefb', '#e3f2fd', '#0d47a1']
        };
        
        return schemes[theme] || schemes.default;
    }

    /**
     * 获取主题显示名称
     * @param {string} theme 主题名称
     * @returns {string} 显示名称
     */
    static getThemeDisplayName(theme) {
        const names = {
            default: '默认配色',
            blue: '蓝色系',
            green: '绿色系',
            orange: '橙色系',
            purple: '紫色系',
            red: '红色系',
            warm: '暖色调',
            cool: '冷色调',
            rainbow: '彩虹色',
            business: '商务风格',
            multi: '多彩配色'
        };
        return names[theme] || theme;
    }

    /**
     * 获取默认图表样式配置
     * @returns {Object} 样式配置对象
     */
    static getDefaultStyle() {
        return {
            backgroundColor: 'transparent',
            textColor: '#fff',
            textColorSecondary: '#aaa',
            axisLineColor: '#444',
            splitLineColor: '#333',
            tooltipBackground: 'rgba(30, 30, 35, 0.9)',
            tooltipBorder: '#444',
            titleFontSize: 16,
            labelFontSize: 11
        };
    }

    /**
     * 获取图表标题样式配置
     * @param {string} title 标题文本
     * @param {Object} options 可选配置
     * @returns {Object} ECharts 标题配置对象
     */
    static getTitleStyle(title, options = {}) {
        const style = this.getDefaultStyle();
        return {
            text: title,
            left: options.left || 'center',
            top: options.top || undefined,
            textStyle: {
                color: options.textColor || style.textColor,
                fontSize: options.fontSize || style.titleFontSize
            }
        };
    }

    /**
     * 获取工具提示样式配置
     * @param {string} trigger 触发方式 ('axis' | 'item')
     * @param {Object} options 可选配置
     * @returns {Object} ECharts tooltip 配置对象
     */
    static getTooltipStyle(trigger = 'axis', options = {}) {
        const style = this.getDefaultStyle();
        return {
            trigger: trigger,
            backgroundColor: options.backgroundColor || style.tooltipBackground,
            borderColor: options.borderColor || style.tooltipBorder,
            textStyle: {
                color: options.textColor || style.textColor
            },
            ...options.extra
        };
    }

    /**
     * 获取图例样式配置
     * @param {Object} options 可选配置
     * @returns {Object} ECharts legend 配置对象
     */
    static getLegendStyle(options = {}) {
        const style = this.getDefaultStyle();
        return {
            top: options.top || 35,
            left: options.left || undefined,
            orient: options.orient || 'horizontal',
            textStyle: {
                color: options.textColor || style.textColorSecondary
            },
            ...options.extra
        };
    }

    /**
     * 获取坐标轴样式配置
     * @param {Object} options 可选配置
     * @returns {Object} ECharts 坐标轴配置对象
     */
    static getAxisStyle(options = {}) {
        const style = this.getDefaultStyle();
        return {
            axisLabel: {
                color: options.labelColor || style.textColorSecondary,
                rotate: options.rotate || 0,
                fontSize: options.fontSize || 10
            },
            axisLine: {
                show: options.showAxisLine !== false,
                lineStyle: {
                    color: options.lineColor || style.axisLineColor
                }
            },
            splitLine: options.splitLine !== false ? {
                lineStyle: {
                    color: options.splitLineColor || style.splitLineColor
                }
            } : { show: false },
            ...options.extra
        };
    }

    /**
     * 获取标签样式配置
     * @param {boolean} show 是否显示
     * @param {Object} options 可选配置
     * @returns {Object} ECharts label 配置对象
     */
    static getLabelStyle(show = false, options = {}) {
        const style = this.getDefaultStyle();
        return {
            show: show,
            position: options.position || 'top',
            color: options.color || style.textColor,
            fontSize: options.fontSize || style.labelFontSize,
            ...options.extra
        };
    }

    /**
     * 获取网格样式配置
     * @param {Object} options 可选配置
     * @returns {Object} ECharts grid 配置对象
     */
    static getGridStyle(options = {}) {
        return {
            left: options.left || '3%',
            right: options.right || '4%',
            bottom: options.bottom || '12%',
            top: options.top || 80,
            containLabel: options.containLabel !== false
        };
    }

    /**
     * 应用统一样式到图表配置
     * @param {Object} option ECharts 配置对象
     * @param {Object} config 用户配置
     * @returns {Object} 应用样式后的配置对象
     */
    static applyStyle(option, config = {}) {
        const style = this.getDefaultStyle();
        
        // 确保背景透明
        if (!option.backgroundColor) {
            option.backgroundColor = style.backgroundColor;
        }

        // 应用标题样式
        if (option.title && typeof option.title === 'object') {
            option.title = {
                ...this.getTitleStyle(option.title.text || '', { 
                    left: option.title.left,
                    top: option.title.top 
                }),
                ...option.title
            };
        }

        // 应用工具提示样式
        if (option.tooltip) {
            option.tooltip = {
                ...this.getTooltipStyle(option.tooltip.trigger || 'axis', {
                    extra: option.tooltip
                }),
                ...option.tooltip
            };
        }

        // 应用图例样式
        if (option.legend) {
            option.legend = {
                ...this.getLegendStyle({
                    top: option.legend.top,
                    left: option.legend.left,
                    orient: option.legend.orient,
                    extra: option.legend
                }),
                ...option.legend
            };
        }

        return option;
    }
}








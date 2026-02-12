/**
 * 桌面页面（空状态）
 */

class DesktopPage extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        return `<div class="desktop-view fade-in"></div>`;
    }
}


// 将 DesktopPage 导出到全局作用域以支持动态加载
window.DesktopPage = DesktopPage;
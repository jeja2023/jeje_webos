# 模块开发模板

> 此目录包含模块开发的完整模板，用于快速创建新模块

## 📋 使用说明

### 1. 复制模板

```bash
# 在 backend/modules/ 目录下
cp -r _template my_module
cd my_module
```

### 2. 重命名文件

将所有 `_template_*.py` 文件重命名为 `{module_id}_*.py`：

```bash
# 示例：如果模块ID是 task_manager
mv _template_manifest.py task_manager_manifest.py
mv _template_models.py task_manager_models.py
mv _template_schemas.py task_manager_schemas.py
mv _template_router.py task_manager_router.py
mv _template_services.py task_manager_services.py
```

### 3. 替换占位符

使用文本编辑器或脚本替换所有文件中的占位符：

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `{module_id}` | 模块唯一标识（小写+下划线） | `task_manager` |
| `{ModuleName}` | 模块类名（大驼峰） | `TaskManager` |
| `{module_name}` | 模块变量名（小写+下划线） | `task_manager` |
| `{模块名称}` | 模块显示名称（中文） | `任务管理` |
| `{table_name}` | 数据表名（不含前缀） | `tasks` |
| `{作者名称}` | 作者名称 | `Your Name` |

### 4. 修改业务逻辑

根据实际需求修改：
- **模型**：定义数据表结构
- **Schema**：定义数据验证规则
- **服务**：实现业务逻辑
- **路由**：定义API接口

### 5. 开发前端

参考 `frontend/js/pages/blog.js` 或 `notes.js` 创建前端页面。

## 📚 相关文档

- [模块开发指南](../../MODULE_DEVELOPMENT_GUIDE.md)
- [快速开始指南](../../QUICK_START.md)
- [开发规范](../../SPECIFICATION.md)

## ✅ 检查清单

开发完成后，请确认：

- [ ] 所有文件已重命名
- [ ] 所有占位符已替换
- [ ] 模块ID唯一
- [ ] 表名使用模块前缀
- [ ] 权限命名格式正确
- [ ] 路由不设置prefix
- [ ] 无直接import其他模块
- [ ] 前端页面已创建
- [ ] API接口已注册
- [ ] 路由已配置

## 🎉 开始开发

现在可以开始实现你的业务逻辑了！









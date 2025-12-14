# Alembic 数据库迁移指南

## 📖 简介

Alembic 是 SQLAlchemy 的数据库迁移工具，用于管理数据库表结构的版本控制。

## 🚀 快速开始

### 1. 初始化迁移（首次使用）

如果数据库已有数据，需要先生成初始迁移：

```bash
cd backend

# 生成初始迁移（标记当前数据库状态）
alembic revision --autogenerate -m "initial"

# 将当前数据库标记为最新版本（不实际执行迁移）
alembic stamp head
```

### 2. 创建新迁移

当修改了模型后，创建迁移脚本：

```bash
# 自动检测模型变化并生成迁移脚本
alembic revision --autogenerate -m "描述此次变更"

# 示例
alembic revision --autogenerate -m "add user avatar field"
```

### 3. 执行迁移

```bash
# 升级到最新版本
alembic upgrade head

# 升级到指定版本
alembic upgrade <revision_id>

# 升级一个版本
alembic upgrade +1
```

### 4. 回滚迁移

```bash
# 回滚到上一个版本
alembic downgrade -1

# 回滚到指定版本
alembic downgrade <revision_id>

# 回滚所有迁移
alembic downgrade base
```

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `alembic current` | 查看当前数据库版本 |
| `alembic history` | 查看迁移历史 |
| `alembic heads` | 查看最新版本 |
| `alembic show <revision>` | 查看指定版本详情 |
| `alembic branches` | 查看分支 |

## 📁 目录结构

```
alembic/
├── env.py              # 环境配置（数据库连接、模型导入）
├── script.py.mako      # 迁移脚本模板
├── README.md           # 本文档
└── versions/           # 迁移脚本目录
    ├── 001_initial.py
    └── 002_add_user_avatar.py
```

## ⚠️ 注意事项

### 1. 模块模型

所有模块的模型都会被自动加载（通过 `env.py` 中的 `import_all_models` 函数）。

### 2. 表名规范

模块的表名必须使用模块前缀：
- ✅ `blog_posts`
- ✅ `notes_folders`
- ❌ `posts`
- ❌ `folders`

### 3. 生产环境

在生产环境中：
1. 务必先备份数据库
2. 在测试环境验证迁移脚本
3. 使用 `--sql` 参数预览 SQL
4. 确保迁移脚本的 `downgrade` 函数正确

```bash
# 预览将要执行的 SQL
alembic upgrade head --sql

# 生成 SQL 文件
alembic upgrade head --sql > migration.sql
```

### 4. 常见问题

**Q: 迁移检测不到模型变化？**

A: 确保模型已正确导入。检查 `env.py` 中的 `import_all_models` 函数。

**Q: 表已存在错误？**

A: 使用 `alembic stamp head` 将当前数据库标记为最新版本。

**Q: 如何重置迁移历史？**

A: 
1. 删除 `alembic/versions/` 下所有文件
2. 删除数据库中的 `alembic_version` 表
3. 重新生成初始迁移

## 🔗 相关链接

- [Alembic 官方文档](https://alembic.sqlalchemy.org/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)








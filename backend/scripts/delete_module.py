#!/usr/bin/env python
"""
模块删除工具
一键删除模块的所有相关文件和数据库表

使用方法：
    python scripts/delete_module.py <module_id> [--no-backup] [--delete-db] [--force]
    
示例：
    python scripts/delete_module.py task_manager
    python scripts/delete_module.py product --delete-db --force
"""

import sys
import json
import re
import csv
import asyncio
from pathlib import Path
from datetime import datetime
from sqlalchemy import text

# 确保可以导入项目模块
SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

# 导入数据库模块
try:
    from core.database import engine
except ImportError:
    engine = None
    print("[警告] 无法加载数据库配置，数据库相关操作将跳过")


async def backup_db_tables(module_id: str):
    """
    备份模块相关的数据表
    
    Args:
        module_id: 模块ID
    """
    if not engine:
        return False
        
    print(f"\n[备份数据] 正在检查模块 {module_id} 的数据表...")
    # 备份目录放在根目录的 storage/backups/modules 下
    storage_dir = BACKEND_DIR.parent / "storage" / "backups" / "modules"
    backup_dir = storage_dir / f"module_{module_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    table_pattern = f"{module_id}_%"
    
    try:
        async with engine.connect() as conn:
            # 查找相关表
            # MySQL 语法
            result = await conn.execute(
                text(f"SHOW TABLES LIKE '{table_pattern}'")
            )
            tables = result.scalars().all()
            
            if not tables:
                print(f"  [跳过] 未找到相关数据表")
                return True
                
            print(f"  发现 {len(tables)} 个数据表: {', '.join(tables)}")
            
            for table in tables:
                print(f"  正在备份表: {table} ...")
                # 读取数据
                data_result = await conn.execute(text(f"SELECT * FROM `{table}`"))
                rows = data_result.fetchall()
                if not rows:
                    print(f"    - 表 {table} 为空")
                    continue
                    
                # 获取列名
                columns = list(data_result.keys())
                
                # 写入 CSV
                file_path = backup_dir / f"{table}.csv"
                with open(file_path, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    writer.writerow(columns)
                    writer.writerows(rows)
                
                print(f"    - 已导出到: {file_path}")
            
            print(f"  [完成] 数据备份完成: {backup_dir}")
            return True
            
    except Exception as e:
        print(f"  [错误] 备份失败: {e}")
        return False


async def delete_db_tables(module_id: str):
    """
    删除模块相关的数据表
    
    Args:
        module_id: 模块ID
    """
    if not engine:
        return False
        
    print(f"\n[删除数据] 正在删除模块 {module_id} 的数据表...")
    
    table_pattern = f"{module_id}_%"
    
    try:
        async with engine.begin() as conn:
            # 查找相关表
            result = await conn.execute(
                text(f"SHOW TABLES LIKE '{table_pattern}'")
            )
            tables = result.scalars().all()
            
            if not tables:
                print(f"  [跳过] 未找到相关数据表")
                return True
            
            # 禁用外键检查（防止删除顺序问题）
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            
            for table in tables:
                print(f"  正在删除表: {table} ...")
                await conn.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
            
            # 恢复外键检查
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
            
            print(f"  [完成] 已删除 {len(tables)} 个数据表")
            return True
            
    except Exception as e:
        print(f"  [错误] 删除数据表失败: {e}")
        return False


def delete_module_steps(module_id: str, confirm: bool = True, delete_db: bool = False, backup_db: bool = True):
    """
    同步执行删除步骤（包含异步数据库操作）
    """
    # 验证模块ID（安全检查：只允许字母数字和下划线，防止SQL注入）
    import re
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', module_id):
        print(f"[错误] 模块ID无效: {module_id}")
        print("  模块ID必须以字母开头，只能包含字母、数字和下划线")
        return False
    
    # 额外长度限制
    if len(module_id) > 64:
        print(f"[错误] 模块ID过长: {len(module_id)} > 64")
        return False
    
    # 模块目录
    module_dir = BACKEND_DIR / 'modules' / module_id
    
    # 在交互模式下，如果目录不存在但仍想删除数据，也允许继续
    if not module_dir.exists():
        print(f"[提示] 模块目录不存在: {module_dir}")
        if confirm:
            print("是否尝试清理其他残留文件（如前端代码、数据库）？")
            if input("确定继续吗？[y/N] ").lower() != 'y':
                return False
        else:
            print("将尝试清理其他相关文件...")
    
    if confirm:
        print(f"\n[警告] 即将删除模块: {module_id}")
        print(f"  后端目录: {module_dir}")
        print(f"  前端文件: frontend/js/pages/{module_id}.js")
        print(f"  前端文件: frontend/css/pages/{module_id}.css")
        if delete_db:
             print(f"  [!!!] 数据库表: 包含 '{module_id}_' 前缀的所有表将被删除！")
             if backup_db:
                 print(f"  [备份] 删除前将自动备份数据")
        
        response = input("\n确定要删除吗？[y/N] ")
        if response.lower() != 'y':
            print("已取消")
            return False
            
        # 二次确认数据库删除
        if delete_db and engine:
            print(f"\n[严重警告] 您选择了删除数据库表！此操作不可逆！")
            if backup_db:
                print("我们会尝试为您备份数据，但请务必自行确认数据重要性。")
            if input(f"确认要删除 {module_id} 的所据库表吗？[Type DELETE to confirm]: ") != "DELETE":
                print("已取消操作")
                return False
    
    print(f"\n[删除模块] {module_id}")

    # 0. 数据库操作 (异步需在事件循环中运行)
    if engine:
        should_backup = False
        should_delete = False
        
        if confirm:
             # 交互式询问
             if not delete_db: # 如果命令行没指定强制，则询问
                 print(f"\n是否检查并删除相关数据库表？(表名以 {module_id}_ 开头)")
                 if input("是否删除数据库表？[y/N] ").lower() == 'y':
                     should_delete = True
                     print(f"是否在删除前备份数据？")
                     if input("是否备份？[Y/n] ").lower() != 'n':
                         should_backup = True
             else:
                 should_delete = True # 命令行指定了 delete-db
                 if backup_db: 
                    should_backup = True # 命令行指定了 backup (默认True)
        else:
            # 非交互式，直接使用参数
            should_delete = delete_db
            should_backup = backup_db
        
        if should_delete or should_backup:
            # 检查是否有现有的 loop
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            try:
                if should_backup:
                    if loop.is_running():
                         # 如果 loop 正在运行（例如在 FastAPI 中被调用），创建一个 Task
                         # 但这里 delete_module_steps 是同步函数，这说明设计上有问题
                         # 如果是在 FastAPI 请求中调用，不能用 run_until_complete
                         # 必须将 delete_module_steps 转为 async 或者使用 nest_asyncio
                         import nest_asyncio
                         nest_asyncio.apply()
                         loop.run_until_complete(backup_db_tables(module_id))
                    else:
                        loop.run_until_complete(backup_db_tables(module_id))
                
                if should_delete:
                    if loop.is_running():
                         import nest_asyncio
                         nest_asyncio.apply()
                         loop.run_until_complete(delete_db_tables(module_id))
                    else:
                        loop.run_until_complete(delete_db_tables(module_id))
            except Exception as e:
                print(f"[错误] 数据库操作异常: {e}")
            # 不要关闭系统默认的 loop
    
    # 1. 删除后端模块目录
    print("\n[1/5] 删除后端模块目录...")
    if module_dir.exists():
        try:
            import shutil
            shutil.rmtree(module_dir)
            print(f"  [完成] 已删除: {module_dir}")
        except Exception as e:
            print(f"  [错误] 删除后端目录失败: {e}")
            return False
    else:
        print(f"  [跳过] 目录不存在")
    
    # 2. 删除前端 JS 文件
    print("\n[2/5] 删除前端 JS 文件...")
    frontend_dir = BACKEND_DIR.parent / 'frontend'
    js_file = frontend_dir / 'js' / 'pages' / f'{module_id}.js'
    if js_file.exists():
        try:
            js_file.unlink()
            print(f"  [完成] 已删除: {js_file}")
        except Exception as e:
            print(f"  [错误] 删除 JS 文件失败: {e}")
    else:
        print(f"  [跳过] JS 文件不存在")
    
    # 3. 删除前端 CSS 文件
    print("\n[3/5] 删除前端 CSS 文件...")
    css_file = frontend_dir / 'css' / 'pages' / f'{module_id}.css'
    if css_file.exists():
        try:
            css_file.unlink()
            print(f"  [完成] 已删除: {css_file}")
        except Exception as e:
            print(f"  [错误] 删除 CSS 文件失败: {e}")
    else:
        print(f"  [跳过] CSS 文件不存在")
    
    # 4. 从 module_states.json 中移除
    print("\n[4/5] 更新模块状态文件...")
    state_file = BACKEND_DIR / 'state' / 'module_states.json'
    if state_file.exists():
        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                states = json.load(f)
            
            if module_id in states:
                del states[module_id]
                with open(state_file, 'w', encoding='utf-8') as f:
                    json.dump(states, f, ensure_ascii=False, indent=2)
                print(f"  [完成] 已从状态文件中移除: {module_id}")
            else:
                print(f"  [跳过] 状态文件中不存在: {module_id}")
        except Exception as e:
            print(f"  [错误] 更新状态文件失败: {e}")
    else:
        print(f"  [跳过] 状态文件不存在")
    
    # 5. 从 app.js 中移除路由
    print("\n[5/6] 更新前端路由配置...")
    app_js_path = frontend_dir / 'js' / 'pages' / 'app.js'
    if app_js_path.exists():
        try:
            content = app_js_path.read_text(encoding='utf-8')
            lines = content.split('\n')
            new_lines = []
            
            i = 0
            deleted_count = 0
            in_removal_block = False
            
            while i < len(lines):
                line = lines[i]
                stripped = line.strip()
                
                # 情况1: 发现模块路由注释块，开始删除模式
                # 匹配: // ========== task_manager模块路由 (自动生成) ==========
                if f'{module_id}' in line and '模块路由' in line and '自动生成' in line:
                    in_removal_block = True
                    # 跳过注释行
                    i += 1
                    continue
                
                # 情况2: 在删除模式下，或者发现单独的路由定义
                # 检查是否是该模块的路由定义 (例如 '/task_manager': { 或 '/task_manager/list': {)
                is_module_route = False
                if f"'/{module_id}" in line or f'"/{module_id}"' in line:
                    # 确保是路由key，而不是其他内容
                    if stripped.startswith("'") or stripped.startswith('"'):
                        is_module_route = True
                
                # 如果在删除块模式中，或者发现了模块路由
                if in_removal_block or is_module_route:
                    # 开始跳过整个路由块（利用括号计数）
                    brace_count = 0
                    # 计算当前行的括号
                    brace_count += line.count('{') - line.count('}')
                    
                    # 如果当前行就结束了 (例如 path: { handler: ... },)
                    if brace_count == 0 and (stripped.endswith('},') or stripped.endswith('}')):
                        if in_removal_block:
                            # 如果在注释块模式下，继续保持在块中，准备删除下一个路由
                            i += 1
                            deleted_count += 1
                            continue
                        else:
                            # 单个路由删除完，停止删除
                            i += 1
                            deleted_count += 1
                            continue
                    
                    # 如果有未闭合的括号，继续向下查找直到闭合
                    if brace_count > 0:
                        j = i + 1
                        while j < len(lines):
                            sub_line = lines[j]
                            brace_count += sub_line.count('{') - sub_line.count('}')
                            j += 1
                            # 括号平衡，且行尾看起来像结束
                            if brace_count == 0:
                                break
                        
                        # j 现在指向闭合行的下一行
                        i = j
                        deleted_count += 1
                        continue
                    
                    # 其他情况（比如当前行就是个空行或者注释，但在删除块中）
                    if in_removal_block:
                         i += 1
                         continue
                
                # 检查是否要退出删除块模式
                # 如果遇到了空行或下一个模块的注释，或者代码块结束
                if in_removal_block:
                    if not line.strip(): # 空行
                        # 向下看一行，如果是路由定义则继续，否则退出
                        if i + 1 < len(lines) and (f"'/{module_id}" in lines[i+1] or f'"/{module_id}"' in lines[i+1]):
                            i += 1
                            continue
                        else:
                            in_removal_block = False
                            # 保留这个空行，美观
                            new_lines.append(line)
                            i += 1
                            continue
                    elif '});' in line: # registerAll 结束
                         in_removal_block = False
                         new_lines.append(line)
                         i += 1
                         continue
                    
                # 不需要删除的行，保留
                new_lines.append(line)
                i += 1
            
            if deleted_count > 0:
                app_js_path.write_text('\n'.join(new_lines), encoding='utf-8')
                print(f"  [完成] 已从 app.js 中移除 {deleted_count} 个路由定义")
            else:
                print(f"  [跳过] 未在 app.js 中发现相关路由")
                
        except Exception as e:
            print(f"  [错误] 更新 app.js 失败: {e}")
    else:
        print(f"  [跳过] app.js 不存在")
    
    # 6. 从 index.html 中移除 CSS/JS 引用
    print("\n[6/6] 更新 index.html...")
    index_html_path = frontend_dir / 'index.html'
    if index_html_path.exists():
        try:
            content = index_html_path.read_text(encoding='utf-8')
            original_content = content
            
            # 移除 CSS 引用
            css_pattern = rf'<link rel="stylesheet" href="/static/css/pages/{module_id}\.css">\s*\n?'
            content = re.sub(css_pattern, '', content)
            
            # 移除 JS 引用
            js_pattern = rf'<script src="/static/js/pages/{module_id}\.js"></script>\s*\n?'
            content = re.sub(js_pattern, '', content)
            
            if content != original_content:
                index_html_path.write_text(content, encoding='utf-8')
                print(f"  [完成] 已从 index.html 中移除 CSS/JS 引用")
            else:
                print(f"  [跳过] index.html 中未找到相关引用")
        except Exception as e:
            print(f"  [错误] 更新 index.html 失败: {e}")
    else:
        print(f"  [跳过] index.html 不存在")
    
    # 7. 清理 orphans
    # 考虑权限清理？权限字符串残留无害
    
    print(f"\n[完成] 模块 {module_id} 已完全删除！")
    return True

# 兼容旧接口的包装器
def delete_module(module_id: str, confirm: bool = True):
    return delete_module_steps(module_id, confirm=confirm, delete_db=False)


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='JeJe WebOS 模块删除工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python scripts/delete_module.py task_manager
  python scripts/delete_module.py product --force --delete-db
        '''
    )
    
    parser.add_argument(
        'module_id',
        help='模块ID（如：task_manager）'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='强制删除，不询问确认'
    )
    parser.add_argument(
        '--delete-db',
        action='store_true',
        help='同时删除关联的数据表（危险！）'
    )
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='不备份数据（仅在 --delete-db 时有效）'
    )
    
    args = parser.parse_args()
    
    success = delete_module_steps(
        module_id=args.module_id,
        confirm=not args.force,
        delete_db=args.delete_db,
        backup_db=not args.no_backup
    )
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()


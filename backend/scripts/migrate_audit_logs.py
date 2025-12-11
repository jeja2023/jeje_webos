"""
数据库迁移脚本：添加审计日志新字段
"""

import sys
from pathlib import Path

# 添加 backend 目录到 Python 路径
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

import pymysql
from core.config import get_settings

settings = get_settings()

def run_migration():
    """执行数据库迁移"""
    connection = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )
    
    try:
        with connection.cursor() as cursor:
            # 检查列是否存在
            cursor.execute("""
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = %s 
                AND TABLE_NAME = 'sys_logs'
            """, (settings.db_name,))
            
            existing_columns = [row[0] for row in cursor.fetchall()]
            
            # 添加缺失的列
            migrations = []
            
            if 'user_agent' not in existing_columns:
                migrations.append("ADD COLUMN user_agent VARCHAR(500) NULL")
                
            if 'request_method' not in existing_columns:
                migrations.append("ADD COLUMN request_method VARCHAR(10) NULL")
                
            if 'request_path' not in existing_columns:
                migrations.append("ADD COLUMN request_path VARCHAR(500) NULL")
            
            if migrations:
                sql = f"ALTER TABLE sys_logs {', '.join(migrations)}"
                print(f"执行迁移: {sql}")
                cursor.execute(sql)
                connection.commit()
                print("✅ 迁移成功!")
            else:
                print("✅ 所有列已存在，无需迁移")
                
    finally:
        connection.close()

if __name__ == "__main__":
    run_migration()

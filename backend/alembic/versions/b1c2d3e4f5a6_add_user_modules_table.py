"""添加用户模块配置表

Revision ID: b1c2d3e4f5a6
Revises: af6011a6de52
Create Date: 2026-01-17 21:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = 'a66001197bfa'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 创建用户模块配置表
    op.create_table(
        'sys_user_modules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, comment='主键ID'),
        sa.Column('user_id', sa.Integer(), nullable=False, comment='用户ID'),
        sa.Column('module_id', sa.String(50), nullable=False, comment='模块ID'),
        sa.Column('installed', sa.Boolean(), nullable=False, default=True, comment='用户是否安装'),
        sa.Column('enabled', sa.Boolean(), nullable=False, default=True, comment='用户是否启用'),
        sa.Column('installed_at', sa.DateTime(), nullable=True, comment='安装时间'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, comment='更新时间'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'module_id', name='uq_user_module'),
        comment='用户个人模块安装与启用状态表'
    )
    # 创建索引
    op.create_index('ix_sys_user_modules_user_id', 'sys_user_modules', ['user_id'])
    op.create_index('ix_sys_user_modules_module_id', 'sys_user_modules', ['module_id'])


def downgrade() -> None:
    # 删除索引
    op.drop_index('ix_sys_user_modules_module_id', 'sys_user_modules')
    op.drop_index('ix_sys_user_modules_user_id', 'sys_user_modules')
    # 删除表
    op.drop_table('sys_user_modules')

"""rename_message_to_notification

Revision ID: a666764d0b25
Revises: 
Create Date: 2026-01-02 10:15:58.636005

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a666764d0b25'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级迁移：将 sys_messages 表重命名为 sys_notifications"""
    # 重命名表
    op.rename_table('sys_messages', 'sys_notifications')


def downgrade() -> None:
    """降级迁移：将 sys_notifications 表重命名为 sys_messages"""
    # 重命名表回原来的名字
    op.rename_table('sys_notifications', 'sys_messages')








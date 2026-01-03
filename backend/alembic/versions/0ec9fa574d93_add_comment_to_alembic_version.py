"""add comment to alembic_version

Revision ID: 0ec9fa574d93
Revises: 6b2c4352d4fd
Create Date: 2026-01-03 17:19:13.525622

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ec9fa574d93'
down_revision: Union[str, None] = '6b2c4352d4fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级迁移"""
    op.create_table_comment(
        'alembic_version',
        '数据库版本控制表',
        existing_comment=None,
        schema=None
    )


def downgrade() -> None:
    """降级迁移"""
    op.drop_table_comment(
        'alembic_version',
        existing_comment='数据库版本控制表',
        schema=None
    )








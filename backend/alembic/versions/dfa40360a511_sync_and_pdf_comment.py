"""sync_and_pdf_comment

Revision ID: dfa40360a511
Revises: 215f47284b32
Create Date: 2026-01-25 22:06:46.499631

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'dfa40360a511'
down_revision: Union[str, None] = '215f47284b32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级迁移"""
    op.create_table_comment(
        'pdf_history',
        'PDF 工具操作历史记录表',
        existing_comment=None,
        schema=None
    )


def downgrade() -> None:
    """降级迁移"""
    op.drop_table_comment(
        'pdf_history',
        existing_comment='PDF 工具操作历史记录表',
        schema=None
    )

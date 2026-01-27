"""add_pdf_items_comment

Revision ID: 0ccce284c0ca
Revises: dfa40360a511
Create Date: 2026-01-25 22:09:20.145855

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0ccce284c0ca'
down_revision: Union[str, None] = 'dfa40360a511'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级迁移"""
    op.create_table_comment(
        'pdf_items',
        'PDF 工具扩展项目表',
        existing_comment=None,
        schema=None
    )


def downgrade() -> None:
    """降级迁移"""
    op.drop_table_comment(
        'pdf_items',
        existing_comment='PDF 工具扩展项目表',
        schema=None
    )

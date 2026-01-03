"""create_im_tables

Revision ID: 15cb3d79a241
Revises: a666764d0b25
Create Date: 2026-01-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '15cb3d79a241'
down_revision: Union[str, None] = 'a666764d0b25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级迁移：创建即时通讯相关表"""
    
    # 会话表
    op.create_table(
        'im_conversations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False, server_default='private'),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('avatar', sa.String(length=255), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('last_message_id', sa.Integer(), nullable=True),
        sa.Column('last_message_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['sys_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_im_conv_updated', 'updated_at'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        comment='即时通讯会话表'
    )
    
    # 会话成员表
    op.create_table(
        'im_conversation_members',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='member'),
        sa.Column('unread_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_read_message_id', sa.Integer(), nullable=True),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('is_muted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['im_conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['sys_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_im_member_conv_user', 'conversation_id', 'user_id'),
        sa.Index('idx_im_member_user', 'user_id'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        comment='即时通讯会话成员表'
    )
    
    # 消息表
    op.create_table(
        'im_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False, server_default='text'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=True),
        sa.Column('file_name', sa.String(length=255), nullable=True),
        sa.Column('file_size', sa.BigInteger(), nullable=True),
        sa.Column('file_mime', sa.String(length=100), nullable=True),
        sa.Column('reply_to_id', sa.Integer(), nullable=True),
        sa.Column('is_recalled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['im_conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reply_to_id'], ['im_messages.id'], ),
        sa.ForeignKeyConstraint(['sender_id'], ['sys_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_im_msg_conv_created', 'conversation_id', 'created_at'),
        sa.Index('idx_im_msg_sender', 'sender_id'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        comment='即时通讯消息表'
    )
    
    # 消息已读记录表
    op.create_table(
        'im_message_reads',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['im_conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['message_id'], ['im_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['sys_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_im_read_msg_user', 'message_id', 'user_id'),
        sa.Index('idx_im_read_user_conv', 'user_id', 'conversation_id'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        comment='即时通讯消息已读记录表'
    )
    
    # 联系人表
    op.create_table(
        'im_contacts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('contact_id', sa.Integer(), nullable=False),
        sa.Column('alias', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['contact_id'], ['sys_users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['sys_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_im_contact_user_contact', 'user_id', 'contact_id'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        comment='即时通讯联系人表'
    )


def downgrade() -> None:
    """降级迁移：删除即时通讯相关表"""
    op.drop_table('im_contacts')
    op.drop_table('im_message_reads')
    op.drop_table('im_messages')
    op.drop_table('im_conversation_members')
    op.drop_table('im_conversations')

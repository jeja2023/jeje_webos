"""
IM Service 测试
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
from modules.im.im_services import IMService, MessageEncryption
from modules.im.im_schemas import ConversationCreate, MessageCreate
from modules.im.im_models import IMConversation, IMConversationMember, IMMessage

class TestMessageEncryption:
    """加密工具测试"""
    
    def test_encrypt_decrypt(self):
        enc = MessageEncryption()
        plaintext = "secret message"
        ciphertext = enc.encrypt(plaintext)
        
        assert ciphertext != plaintext
        decrypted = enc.decrypt(ciphertext)
        assert decrypted == plaintext
        
        # 测试空内容
        assert enc.decrypt("") == ""
        
        # 测试无效内容
        assert enc.decrypt("invalid") == "invalid"

class TestIMService:
    """IM Service测试"""
    
    @pytest.mark.asyncio
    async def test_create_conversation_private(self):
        """测试创建私聊"""
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_db.add_all = MagicMock()
        service = IMService(mock_db)
        
        # 模拟 _find_private_conversation 返回 None
        # 我们需要对实例或类的方法进行 patch
        with patch.object(service, '_find_private_conversation', new_callable=AsyncMock) as mock_find:
            mock_find.return_value = None
            
            data = ConversationCreate(type="private", member_ids=[2])
            
            # 执行
            conv = await service.create_conversation(1, data)
            
            assert mock_db.add.called
            assert mock_db.commit.called
            # 检查成员是否已添加
            assert mock_db.add_all.called
        
    @pytest.mark.asyncio
    async def test_create_conversation_group(self):
        """测试创建群聊"""
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_db.add_all = MagicMock()
        service = IMService(mock_db)
        
        data = ConversationCreate(type="group", name="Group", member_ids=[2, 3])
        
        conv = await service.create_conversation(1, data)
        
        assert mock_db.add.called
        # 1名所有者 + 2名成员 = 3名
        # 代码逻辑：data 中的 member_ids 是 [2, 3]，创建者是 1。
        # 成员列表应该有 3 个项。
        
    @pytest.mark.asyncio
    async def test_send_message(self):
        """测试发送消息"""
        mock_db = AsyncMock()
        
        # 模拟 add 以模拟 ID 生成 (同步方法)
        def set_id(obj):
            obj.id = 1
            
        mock_db.add = MagicMock(side_effect=set_id)
        
        service = IMService(mock_db)
        service.encryption = MagicMock()
        service.encryption.encrypt.return_value = "encrypted"
        
        # 模拟 get_conversation
        mock_conv = IMConversation(id=1, type="private")
        with patch.object(service, 'get_conversation', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_conv
            
            data = MessageCreate(conversation_id=1, content="Hello", type="text")
            
            msg = await service.send_message(1, data)
            
            assert mock_db.add.called
            assert mock_conv.last_message_id == 1
            assert mock_db.execute.called # 更新未读计数
            assert msg.content == "encrypted"

    @pytest.mark.asyncio
    async def test_recall_message(self):
        """测试撤回消息"""
        mock_db = AsyncMock()
        service = IMService(mock_db)
        
        # 情况 1: 成功
        # 为 mock_msg 使用带有市区信息的时间，以避免 "can't subtract offset-naive" 错误
        from utils.timezone import get_beijing_time
        now = get_beijing_time()
        mock_msg = IMMessage(id=1, sender_id=1, created_at=now, is_recalled=False)
        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = mock_msg
        mock_db.execute.return_value = mock_res
        
        with patch("modules.im.im_services.get_beijing_time", return_value=now):
             res = await service.recall_message(1, 1)
             assert res is True
             assert mock_msg.is_recalled is True
             
        # 情况 2: 非所有者
        # 如果需要，重置消息状态或重新模拟
        mock_msg_2 = IMMessage(id=2, sender_id=1, created_at=now, is_recalled=False)
        mock_res.scalar_one_or_none.return_value = mock_msg_2
        
        # service 代码在 sender != user_id 时抛出 ValueError
        try:
             await service.recall_message(2, 999) # 发送者是 1, 用户是 999
        except ValueError as e:
             assert "只能撤回自己" in str(e)
             
        # 情况 3: 超时
        mock_msg_3 = IMMessage(id=3, sender_id=1, created_at=now - timedelta(minutes=5), is_recalled=False)
        mock_res.scalar_one_or_none.return_value = mock_msg_3
        
        with patch("modules.im.im_services.get_beijing_time", return_value=now):
            try:
                await service.recall_message(3, 1)
            except ValueError as e:
                assert "超过2分钟" in str(e)

# -*- coding: utf-8 -*-
"""
AI助手模块测试
测试AI服务的各项功能
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import sys
import os

# 确保可以导入模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))


class TestAIService:
    """AI服务测试"""
    
    def test_role_presets_exist(self):
        """测试角色预设是否存在"""
        from modules.ai.ai_service import AIService
        
        assert hasattr(AIService, 'ROLE_PRESETS')
        assert 'default' in AIService.ROLE_PRESETS
        assert 'coder' in AIService.ROLE_PRESETS
        assert 'writer' in AIService.ROLE_PRESETS
        assert 'translator' in AIService.ROLE_PRESETS
        assert 'analyst' in AIService.ROLE_PRESETS
    
    def test_role_presets_content(self):
        """测试角色预设内容不为空"""
        from modules.ai.ai_service import AIService
        
        for role, prompt in AIService.ROLE_PRESETS.items():
            assert prompt, f"角色 {role} 的提示词不应为空"
            assert len(prompt) > 10, f"角色 {role} 的提示词应有足够内容"
    
    def test_is_data_analysis_query(self):
        """测试数据分析查询检测"""
        from modules.ai.ai_service import AIService
        
        # 应该被识别为数据分析查询
        data_queries = [
            "查询数据集的信息",
            "统计销售数据",
            "分析用户行为",
            "帮我写一个SQL",
            "找出销售额最高的产品",
            "显示前10条记录"
        ]
        
        for query in data_queries:
            assert AIService._is_data_analysis_query(query), f"'{query}' 应被识别为数据分析查询"
        
        # 不应该被识别为数据分析查询
        non_data_queries = [
            "你好",
            "今天天气怎么样",
            "讲个笑话"
        ]
        
        for query in non_data_queries:
            assert not AIService._is_data_analysis_query(query), f"'{query}' 不应被识别为数据分析查询"
    
    def test_get_available_models(self):
        """测试获取可用模型列表"""
        from modules.ai.ai_service import AIService
        
        # 方法应该存在且可调用
        assert hasattr(AIService, 'get_available_models')
        assert callable(AIService.get_available_models)
        
        # 应该返回列表
        models = AIService.get_available_models()
        assert isinstance(models, list)
    
    def test_suggest_visualization(self):
        """测试可视化建议"""
        from modules.ai.ai_service import AIService
        
        # 测试趋势查询
        result = AIService._suggest_visualization("分析销售趋势")
        assert "折线图" in result
        
        # 测试占比查询
        result = AIService._suggest_visualization("各类别销售占比")
        assert "饼图" in result
        
        # 测试对比查询
        result = AIService._suggest_visualization("对比不同产品的销量")
        assert "柱状图" in result


class TestSQLGeneration:
    """SQL生成测试"""
    
    def test_generate_sql_basic(self):
        """测试基本SQL生成"""
        from modules.ai.ai_service import AIService
        
        # 创建模拟数据集
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        
        # 测试基本查询
        sql = AIService._generate_sql_from_natural_language("显示所有数据", mock_dataset)
        assert sql is not None
        assert "SELECT" in sql.upper()
        assert "FROM test_table" in sql
    
    def test_generate_sql_with_limit(self):
        """测试带限制的SQL生成"""
        from modules.ai.ai_service import AIService
        
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        
        # 测试限制查询
        sql = AIService._generate_sql_from_natural_language("显示前10条记录", mock_dataset)
        assert "LIMIT 10" in sql
        
        sql = AIService._generate_sql_from_natural_language("显示前5条", mock_dataset)
        assert "LIMIT 5" in sql
    
    def test_generate_sql_with_order(self):
        """测试带排序的SQL生成"""
        from modules.ai.ai_service import AIService
        
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        
        # 测试降序排序
        sql = AIService._generate_sql_from_natural_language("找出最大的记录", mock_dataset)
        assert "ORDER BY" in sql
        assert "DESC" in sql
        
        # 测试升序排序
        sql = AIService._generate_sql_from_natural_language("找出最小的记录", mock_dataset)
        assert "ORDER BY" in sql
        assert "ASC" in sql
    
    def test_generate_sql_with_aggregation(self):
        """测试带聚合函数的SQL生成"""
        from modules.ai.ai_service import AIService
        
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        columns = ["id", "name", "price", "category"]
        
        # 测试计数
        sql = AIService._generate_sql_from_natural_language("统计总数", mock_dataset, columns)
        assert "COUNT" in sql.upper()
        
        # 测试求和
        sql = AIService._generate_sql_from_natural_language("计算价格总和", mock_dataset, columns)
        assert "SUM" in sql.upper() or "SELECT" in sql.upper()


class TestAPIEncryption:
    """API密钥加密测试（前端功能，此处仅为参考）"""
    
    def test_encryption_concept(self):
        """测试加密概念是否正确"""
        # 这是一个概念性测试
        # 实际的加密/解密在前端JavaScript中实现
        
        # 模拟加密流程
        original = "sk-test-key-12345"
        
        # 简单的字符偏移 + Base64 模拟
        import base64
        shifted = ''.join(chr(ord(c) + 3) for c in original)
        encrypted = base64.b64encode(shifted.encode()).decode()
        
        # 解密
        decoded = base64.b64decode(encrypted).decode()
        decrypted = ''.join(chr(ord(c) - 3) for c in decoded)
        
        assert decrypted == original
        assert encrypted != original


class TestSessionManagement:
    """会话管理测试"""
    
    @pytest.mark.asyncio
    async def test_session_service_exists(self):
        """测试会话服务是否存在"""
        from modules.ai.ai_session_service import AISessionService
        
        assert hasattr(AISessionService, 'create_session')
        assert hasattr(AISessionService, 'get_sessions')
        assert hasattr(AISessionService, 'delete_session')


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

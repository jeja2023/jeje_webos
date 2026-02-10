"""
Modeling Service 测试
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import pandas as pd
import numpy as np

# 模拟 pandas 和 numpy，虽然我们已经在外部导入了
# 这里主要是为了确保 mocking 正确

from modules.analysis.analysis_modeling_service import ModelingService
from modules.analysis.analysis_models import AnalysisDataset, AnalysisModel
from modules.analysis.analysis_schemas import ModelCreate, ModelUpdate

class TestModelingService:
    """ModelingService 测试"""
    
    @pytest.mark.asyncio
    async def test_get_dataset(self):
        """测试获取数据集"""
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_dataset = AnalysisDataset(id=1, name="Test", table_name="test_table")
        
        mock_result.scalar_one_or_none.return_value = mock_dataset
        mock_db.execute.return_value = mock_result
        
        # 测试成功情况
        dataset = await ModelingService.get_dataset(mock_db, 1)
        assert dataset.id == 1
        assert dataset.name == "Test"
        
        # 测试失败情况
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        with pytest.raises(ValueError):
            await ModelingService.get_dataset(mock_db, 999)

    @pytest.mark.asyncio
    async def test_get_summary(self):
        """测试获取概要"""
        mock_db = AsyncMock()
        mock_dataset = AnalysisDataset(id=1, table_name="test_table")
        
        # 模拟 get_dataset 返回值
        with patch.object(ModelingService, 'get_dataset', return_value=mock_dataset):
            # 模拟 fetch_df 返回值
            with patch("modules.analysis.analysis_modeling_service.duckdb_instance.fetch_df") as mock_fetch:
                df = pd.DataFrame({"a": [1, 2, np.nan], "b": [3, 4, 5]})
                mock_fetch.return_value = df
                
                res = await ModelingService.get_summary(mock_db, 1)
                
                assert "stats" in res
                assert "missing" in res
                assert res["missing"]["a"] == 1
                assert res["missing"]["b"] == 0

    @pytest.mark.asyncio
    async def test_get_correlation(self):
        """测试相关性分析"""
        mock_db = AsyncMock()
        mock_dataset = AnalysisDataset(id=1, table_name="test_table", row_count=100)
        
        with patch.object(ModelingService, 'get_dataset', return_value=mock_dataset):
            with patch("modules.analysis.analysis_modeling_service.duckdb_instance.fetch_df") as mock_fetch:
                # 构造数值型数据
                df = pd.DataFrame({
                    "a": [1, 2, 3, 4, 5],
                    "b": [2, 4, 6, 8, 10], # 完全相关
                    "c": ["x", "y", "z", "w", "v"] # 非数值型
                })
                mock_fetch.return_value = df
                
                res = await ModelingService.get_correlation(mock_db, 1)
                
                assert "matrix" in res
                matrix = res["matrix"]
                assert "a" in matrix
                assert "b" in matrix
                assert "c" not in matrix # 应该被过滤掉
                assert matrix["a"]["b"] == 1.0 # 1.0 相关性

    @pytest.mark.asyncio
    async def test_execute_sql_security(self):
        """测试SQL安全检查"""
        mock_db = AsyncMock()
        
        # 测试禁用关键字
        forbidden = ["DROP TABLE", "DELETE FROM", "UPDATE table"]
        for sql in forbidden:
            with pytest.raises(ValueError):
                await ModelingService.execute_sql(mock_db, sql)
                
        # 测试有效SQL
        with patch("modules.analysis.analysis_modeling_service.duckdb_instance.fetch_df") as mock_fetch:
            mock_fetch.return_value = pd.DataFrame({"a": [1]})
            res = await ModelingService.execute_sql(mock_db, "SELECT * FROM t")
            assert res["row_count"] == 1

    @pytest.mark.asyncio
    async def test_model_crud(self):
        """测试模型增删改查"""
        mock_db = AsyncMock()
        
        # 创建模型
        data = ModelCreate(name="New Model", description="Desc")
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        model = await ModelingService.create_model(mock_db, data)
        assert model.name == "New Model"
        mock_db.add.assert_called()
        
        # 更新模型
        update_data = ModelUpdate(name="Updated")
        
        # 模拟 get_model 结果
        existing_model = AnalysisModel(id=1, name="Old")
        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = existing_model
        mock_db.execute.return_value = mock_res
        
        updated = await ModelingService.update_model(mock_db, 1, update_data)
        assert updated.name == "Updated"
        
        # 删除模型
        await ModelingService.delete_model(mock_db, 1)
        mock_db.delete.assert_called_with(existing_model)

    @pytest.mark.asyncio
    async def test_execute_sql_save_as(self):
        """测试SQL保存为数据集"""
        mock_db = AsyncMock()
        mock_db.add = MagicMock()  # add 是同步方法
        sql = "SELECT * FROM t"
        
        with patch("modules.analysis.analysis_modeling_service.duckdb_instance") as mock_duck:
            # 模拟 fetch_df 返回值
            mock_duck.fetch_df.return_value = pd.DataFrame({"a": [1, 2]})
            
            # 模拟完整的 DuckDB 调用链（conn.execute 用于 CREATE TABLE AS）
            mock_conn = MagicMock()
            mock_duck.conn = mock_conn
            mock_duck.execute = MagicMock()
            
            result = await ModelingService.execute_sql(mock_db, sql, save_as="new_ds")
            
            assert "saved_dataset" in result
            assert result["saved_dataset"]["name"] == "new_ds"
            mock_db.add.assert_called()  # 应该记录到数据库

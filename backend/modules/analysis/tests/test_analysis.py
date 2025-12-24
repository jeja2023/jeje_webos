# -*- coding: utf-8 -*-
"""
数据分析模块测试
测试 ETL 算子执行逻辑
"""

import pytest
import pandas as pd
import numpy as np

# 导入被测试模块
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.analysis.analysis_etl_service import ETLExecutionService


class TestETLExecutionService:
    """ETL 算子执行服务测试"""

    def setup_method(self):
        """每个测试前清空缓存"""
        ETLExecutionService.clear_cache()

    # ==================== 过滤算子测试 ====================

    def test_filter_equals(self):
        """测试过滤算子 - 等于"""
        df = pd.DataFrame({'name': ['Alice', 'Bob', 'Charlie'], 'age': [25, 30, 35]})
        # 使用 conditions 格式（实际服务接口）
        node_data = {
            'conditions': [{'field': 'name', 'operator': '==', 'value': 'Bob'}]
        }
        result = ETLExecutionService._execute_filter(df, node_data)
        assert len(result) == 1
        assert result.iloc[0]['name'] == 'Bob'

    def test_filter_greater_than(self):
        """测试过滤算子 - 大于"""
        df = pd.DataFrame({'name': ['Alice', 'Bob', 'Charlie'], 'age': [25, 30, 35]})
        node_data = {
            'conditions': [{'field': 'age', 'operator': '>', 'value': 28}]
        }
        result = ETLExecutionService._execute_filter(df, node_data)
        assert len(result) == 2
        assert set(result['name'].tolist()) == {'Bob', 'Charlie'}

    def test_filter_contains(self):
        """测试过滤算子 - 包含"""
        df = pd.DataFrame({'name': ['Alice', 'Bob', 'Charlie'], 'age': [25, 30, 35]})
        node_data = {
            'conditions': [{'field': 'name', 'operator': 'contains', 'value': 'li'}]
        }
        result = ETLExecutionService._execute_filter(df, node_data)
        assert len(result) == 2
        assert set(result['name'].tolist()) == {'Alice', 'Charlie'}

    def test_filter_multiple_conditions_and(self):
        """测试过滤算子 - 多条件 AND 组合"""
        df = pd.DataFrame({'name': ['Alice', 'Bob', 'Charlie'], 'age': [25, 30, 35]})
        node_data = {
            'conditions': [
                {'field': 'age', 'operator': '>=', 'value': 25},
                {'field': 'age', 'operator': '<', 'value': 35}
            ],
            'logic': 'AND'  # 使用实际参数名
        }
        result = ETLExecutionService._execute_filter(df, node_data)
        assert len(result) == 2
        assert set(result['name'].tolist()) == {'Alice', 'Bob'}

    # ==================== 字段选择算子测试 ====================

    def test_select_columns(self):
        """测试字段选择"""
        df = pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30], 'city': ['NY', 'LA']})
        node_data = {'columns': 'name, age'}
        result = ETLExecutionService._execute_select(df, node_data)
        assert list(result.columns) == ['name', 'age']

    def test_select_single_column(self):
        """测试选择单列"""
        df = pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})
        node_data = {'columns': 'name'}
        result = ETLExecutionService._execute_select(df, node_data)
        assert list(result.columns) == ['name']

    # ==================== 去重算子测试 ====================

    def test_distinct_all(self):
        """测试全局去重"""
        df = pd.DataFrame({'name': ['Alice', 'Alice', 'Bob'], 'age': [25, 25, 30]})
        node_data = {}
        result = ETLExecutionService._execute_distinct(df, node_data)
        assert len(result) == 2

    def test_distinct_by_column(self):
        """测试按列去重"""
        df = pd.DataFrame({'name': ['Alice', 'Alice', 'Bob'], 'age': [25, 30, 30]})
        node_data = {'columns': 'name'}
        result = ETLExecutionService._execute_distinct(df, node_data)
        assert len(result) == 2

    # ==================== 排序算子测试 ====================

    def test_sort_ascending(self):
        """测试升序排序"""
        df = pd.DataFrame({'name': ['Charlie', 'Alice', 'Bob'], 'age': [35, 25, 30]})
        # 使用实际服务接口参数
        node_data = {'orderBy': 'age', 'direction': 'ASC'}
        result = ETLExecutionService._execute_sort(df, node_data)
        assert result.iloc[0]['name'] == 'Alice'
        assert result.iloc[2]['name'] == 'Charlie'

    def test_sort_descending(self):
        """测试降序排序"""
        df = pd.DataFrame({'name': ['Charlie', 'Alice', 'Bob'], 'age': [35, 25, 30]})
        node_data = {'orderBy': 'age', 'direction': 'DESC'}
        result = ETLExecutionService._execute_sort(df, node_data)
        assert result.iloc[0]['name'] == 'Charlie'
        assert result.iloc[2]['name'] == 'Alice'

    # ==================== 聚合算子测试 ====================

    def test_group_by_count(self):
        """测试分组计数"""
        df = pd.DataFrame({
            'category': ['A', 'A', 'A', 'B', 'B'],
            'value': [10, 20, 30, 40, 50]
        })
        # 使用实际服务接口参数
        node_data = {
            'groupBy': 'category',
            'aggCol': 'value',
            'aggFunc': 'COUNT'
        }
        result = ETLExecutionService._execute_group(df, node_data)
        # 分组后应有2行（A和B）
        assert len(result) == 2

    def test_group_by_sum(self):
        """测试分组求和"""
        df = pd.DataFrame({
            'category': ['A', 'A', 'B', 'B'],
            'value': [10, 20, 30, 40]
        })
        node_data = {
            'groupBy': 'category',
            'aggCol': 'value',
            'aggFunc': 'SUM'
        }
        result = ETLExecutionService._execute_group(df, node_data)
        assert len(result) == 2

    # ==================== 采样算子测试 ====================

    def test_sample_by_rate(self):
        """测试百分比采样"""
        df = pd.DataFrame({'value': range(100)})
        # 使用实际服务接口参数 rate
        node_data = {'rate': 10}  # 10%
        result = ETLExecutionService._execute_sample(df, node_data)
        assert len(result) == 10

    # ==================== 限制行数算子测试 ====================

    def test_limit(self):
        """测试限制行数"""
        df = pd.DataFrame({'value': range(100)})
        # 使用实际服务接口参数 count
        node_data = {'count': 5}
        result = ETLExecutionService._execute_limit(df, node_data)
        assert len(result) == 5

    # ==================== 类型转换算子测试 ====================

    def test_typecast_to_string(self):
        """测试转换为字符串"""
        df = pd.DataFrame({'value': [1, 2, 3]})
        # 使用实际服务接口参数
        node_data = {'column': 'value', 'castType': 'VARCHAR'}
        result = ETLExecutionService._execute_typecast(df, node_data)
        assert result['value'].dtype == 'object'

    def test_typecast_to_float(self):
        """测试转换为浮点数"""
        df = pd.DataFrame({'value': ['1.5', '2.5', '3.5']})
        node_data = {'column': 'value', 'castType': 'DOUBLE'}
        result = ETLExecutionService._execute_typecast(df, node_data)
        assert result['value'].dtype == 'float64'

    def test_typecast_to_int(self):
        """测试转换为整数"""
        df = pd.DataFrame({'value': ['1', '2', '3']})
        node_data = {'column': 'value', 'castType': 'INTEGER'}
        result = ETLExecutionService._execute_typecast(df, node_data)
        assert result['value'].dtype == 'int64'

    # ==================== 空值填充算子测试 ====================

    def test_fillna_value(self):
        """测试填充固定值"""
        df = pd.DataFrame({'value': [1, None, 3]})
        # 使用实际服务接口参数
        node_data = {'targetCol': 'value', 'fillValue': 0}
        result = ETLExecutionService._execute_fillna(df, node_data)
        assert result['value'].tolist() == [1.0, 0, 3.0]

    def test_fillna_all_columns(self):
        """测试填充所有列"""
        df = pd.DataFrame({'a': [1, None, 3], 'b': [None, 2, 3]})
        node_data = {'fillValue': 0}  # 不指定 targetCol 则填充所有列
        result = ETLExecutionService._execute_fillna(df, node_data)
        assert result['a'].isnull().sum() == 0
        assert result['b'].isnull().sum() == 0

    # ==================== 重命名算子测试 ====================

    def test_rename_column(self):
        """测试列重命名"""
        df = pd.DataFrame({'old_name': [1, 2, 3]})
        # 使用实际服务接口参数
        node_data = {'oldCol': 'old_name', 'newCol': 'new_name'}
        result = ETLExecutionService._execute_rename(df, node_data)
        assert 'new_name' in result.columns
        assert 'old_name' not in result.columns

    # ==================== 清洗算子测试 ====================

    def test_clean_drop_null(self):
        """测试删除空值行"""
        df = pd.DataFrame({'value': [1, None, 3, None]})
        # 使用实际服务接口参数
        node_data = {'mode': 'drop_na'}
        result = ETLExecutionService._execute_clean(df, node_data)
        assert len(result) == 2

    def test_clean_drop_duplicates(self):
        """测试删除重复行"""
        df = pd.DataFrame({'value': [1, 1, 2, 2, 3]})
        node_data = {'mode': 'drop_duplicates'}
        result = ETLExecutionService._execute_clean(df, node_data)
        assert len(result) == 3

    # ==================== 缓存测试 ====================

    def test_cache_set_get(self):
        """测试缓存设置和获取"""
        df = pd.DataFrame({'value': [1, 2, 3]})
        ETLExecutionService.set_cached_result(1, 'node_1', df)
        cached = ETLExecutionService.get_cached_result(1, 'node_1')
        assert cached is not None
        assert len(cached) == 3

    def test_cache_clear(self):
        """测试缓存清除"""
        df = pd.DataFrame({'value': [1, 2, 3]})
        ETLExecutionService.set_cached_result(1, 'node_1', df)
        ETLExecutionService.clear_cache(model_id=1)
        cached = ETLExecutionService.get_cached_result(1, 'node_1')
        assert cached is None


class TestETLDataTransformation:
    """ETL 数据转换综合测试"""

    def test_df_to_records_handles_nan(self):
        """测试 DataFrame 转记录时处理 NaN"""
        df = pd.DataFrame({
            'name': ['Alice', None, 'Bob'],
            'age': [25, np.nan, 30]
        })
        records = ETLExecutionService._df_to_records(df)
        assert records[0]['name'] == 'Alice'
        # NaN 应该被转换为 None
        assert records[1]['name'] is None

    def test_df_to_records_preserves_values(self):
        """测试 DataFrame 转记录保持值完整"""
        df = pd.DataFrame({
            'name': ['Alice', 'Bob'],
            'value': [1.5, 2.5]
        })
        records = ETLExecutionService._df_to_records(df)
        assert records[0]['name'] == 'Alice'
        assert records[0]['value'] == 1.5
        assert records[1]['name'] == 'Bob'
        assert records[1]['value'] == 2.5

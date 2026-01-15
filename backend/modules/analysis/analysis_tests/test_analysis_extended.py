# -*- coding: utf-8 -*-
"""
Analysis ETL Service Extended Test
Focus on boundary conditions and new features
"""

import pytest
import pandas as pd
import numpy as np
import sys
import os

# Ensure modules can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from modules.analysis.analysis_etl_service import ETLExecutionService

class TestETLExtended:

    def setup_method(self):
        ETLExecutionService.clear_cache()

    def test_filter_empty_dataframe(self):
        """测试对空DataFrame进行过滤"""
        df = pd.DataFrame({'name': [], 'age': []})
        node_data = {
            'conditions': [{'field': 'age', 'operator': '>', 'value': 20}]
        }
        result = ETLExecutionService._execute_filter(df, node_data)
        assert len(result) == 0
        assert list(result.columns) == ['name', 'age']

    def test_calculate_with_nan(self):
        """测试包含 NaN 值的计算 - 注意: 当前设计将 NaN 视为 0"""
        df = pd.DataFrame({'a': [10, np.nan, 30], 'b': [2, 2, 2]})
        node_data = {'newColumn': 'res', 'fieldA': 'a', 'op': '+', 'value': 'b'}
        result = ETLExecutionService._execute_calculate(df, node_data)
        # 10+2=12, NaN被视为0所以0+2=2, 30+2=32
        assert result.iloc[0]['res'] == 12.0
        assert result.iloc[1]['res'] == 2.0  # NaN -> 0, 0+2=2
        assert result.iloc[2]['res'] == 32.0

    def test_split_column_with_missing_separators(self):
        """测试拆分不存在分隔符的字段"""
        df = pd.DataFrame({'tags': ['apple,banana', 'orange', '']})
        node_data = {
            'sourceCol': 'tags',
            'separator': ',',
            'limit': 2
        }
        result = ETLExecutionService._execute_split(df, node_data)
        # 'orange' split by ',' -> ['orange'] -> col1='orange', col2=None
        assert result.iloc[1]['tags_1'] == 'orange'
        assert result.iloc[1]['tags_2'] is None

    def test_clean_invalid_mode(self):
        """测试无效的清洗模式"""
        df = pd.DataFrame({'a': [1, 2]})
        node_data = {'mode': 'unknown_mode'}
        # 应该原样返回，不报错
        result = ETLExecutionService._execute_clean(df, node_data)
        assert len(result) == 2

    def test_math_ops_extended(self):
        """测试扩展的数学运算: SQRT, LOG, ROUND"""
        df = pd.DataFrame({'val': [4, 1, 0, -1], 'float_val': [1.1, 1.9, 2.5, 2.4]})
        
        # SQRT
        node_sqrt = {'fieldA': 'val', 'op': 'SQRT', 'newCol': 'sqrt_res'}
        res_sqrt = ETLExecutionService._execute_math_ops(df, node_sqrt)
        assert res_sqrt.iloc[0]['sqrt_res'] == 2.0
        assert pd.isna(res_sqrt.iloc[3]['sqrt_res']) # sqrt(-1) -> Nan

        # LOG
        node_log = {'fieldA': 'val', 'op': 'LOG', 'newCol': 'log_res'}
        res_log = ETLExecutionService._execute_math_ops(df, node_log)
        assert res_log.iloc[1]['log_res'] == 0.0 # log(1)
        assert pd.isna(res_log.iloc[2]['log_res']) # log(0) -> Nan

        # ROUND
        node_round = {'fieldA': 'float_val', 'op': 'ROUND', 'value': 0, 'newCol': 'round_res'}
        res_round = ETLExecutionService._execute_math_ops(df, node_round)
        assert res_round.iloc[0]['round_res'] == 1.0
        assert res_round.iloc[1]['round_res'] == 2.0
    
    def test_ml_regression_simple(self):
        """测试简单的线性回归预测"""
        # y = 2x + 1
        df = pd.DataFrame({
            'x': [1, 2, 3, 4, 5],
            'y': [3, 5, 7, 9, None] # 最后一个用于预测
        })
        node_data = {
            'features': 'x',
            'target': 'y',
            'predictionCol': 'pred_y'
        }
        
        result = ETLExecutionService._execute_ml_regression(df, node_data)
        
        # 检查是否生成了预测列
        assert 'pred_y' in result.columns
        # 检查预测值 (index 4)
        pred_val = result.iloc[4]['pred_y']
        # 应该接近 2*5 + 1 = 11
        assert 10.9 < pred_val < 11.1
        # 检查训练拟合 (index 0) 2*1 + 1 = 3
        assert 2.9 < result.iloc[0]['pred_y'] < 3.1

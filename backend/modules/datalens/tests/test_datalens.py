"""
DataLens 数据透镜模块测试
"""

import pytest
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))


class TestDataLensManifest:
    """测试模块清单"""

    def test_manifest_load(self):
        """测试清单加载"""
        from modules.datalens.datalens_manifest import manifest
        assert manifest.id == "datalens"
        assert manifest.name == "数据透镜"
        assert manifest.enabled is True

    def test_manifest_permissions(self):
        """测试权限声明"""
        from modules.datalens.datalens_manifest import manifest
        assert "datalens.view" in manifest.permissions
        assert "datalens.create" in manifest.permissions
        assert "datalens.source.manage" in manifest.permissions


class TestDataSourceConnector:
    """测试数据源连接器"""

    @pytest.mark.asyncio
    async def test_mysql_connection_config(self):
        """测试 MySQL 连接配置解析"""
        from modules.datalens.datalens_services import DataSourceConnector
        # 不实际连接，只测试方法存在
        assert hasattr(DataSourceConnector, 'test_connection')
        assert hasattr(DataSourceConnector, '_test_mysql')
        assert hasattr(DataSourceConnector, '_test_postgres')
        assert hasattr(DataSourceConnector, '_test_csv')
        assert hasattr(DataSourceConnector, '_test_excel')
        assert hasattr(DataSourceConnector, '_test_api')


class TestSchemas:
    """测试数据校验模型"""

    def test_datasource_create_schema(self):
        """测试数据源创建模型"""
        from modules.datalens.datalens_schemas import DataSourceCreate, DataSourceType
        
        data = DataSourceCreate(
            name="测试数据源",
            type=DataSourceType.MYSQL,
            description="测试描述",
            connection_config={"host": "localhost", "port": 3306}
        )
        assert data.name == "测试数据源"
        assert data.type == DataSourceType.MYSQL

    def test_view_create_schema(self):
        """测试视图创建模型"""
        from modules.datalens.datalens_schemas import ViewCreate, QueryType
        
        data = ViewCreate(
            name="测试视图",
            description="视图描述",
            query_type=QueryType.SQL,
            query_config={"sql": "SELECT * FROM users"}
        )
        assert data.name == "测试视图"
        assert data.query_type == QueryType.SQL

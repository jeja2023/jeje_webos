"""
分页模块测试
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from core.pagination import (
    PaginationParams, 
    PageResult, 
    paginate_list, 
    Paginator,
    paginate
)

class TestPagination:
    """分页工具测试"""
    
    def test_pagination_params(self):
        """测试分页参数模型"""
        # 默认值
        p = PaginationParams()
        assert p.page == 1
        assert p.page_size == 20
        assert p.offset == 0
        assert p.limit == 20
        
        # 自定义值
        p = PaginationParams(page=2, page_size=10)
        assert p.page == 2
        assert p.page_size == 10
        assert p.offset == 10
        assert p.limit == 10
        
    def test_page_result(self):
        """测试分页结果模型"""
        items = [1, 2, 3]
        total = 10
        page = 1
        page_size = 5
        
        result = PageResult.create(items, total, page, page_size)
        
        assert result.items == items
        assert result.total == 10
        assert result.page == 1
        assert result.page_size == 5
        assert result.total_pages == 2
        assert result.has_next is True
        assert result.has_prev is False
        
        # 测试最后一页
        result = PageResult.create(items, total, 2, 5)
        assert result.has_next is False
        assert result.has_prev is True
        
        # 测试 to_dict
        d = result.to_dict()
        assert d['items'] == items
        assert d['pagination']['total'] == 10
        
    @pytest.mark.asyncio
    async def test_paginate_list(self):
        """测试内存列表分页"""
        items = list(range(1, 11)) # 1..10
        
        # 第一页，每页3个 -> [1, 2, 3]
        res = await paginate_list(items, page=1, page_size=3)
        assert res.items == [1, 2, 3]
        assert res.total == 10
        assert res.has_next is True
        
        # 第二页，每页3个 -> [4, 5, 6]
        res = await paginate_list(items, page=2, page_size=3)
        assert res.items == [4, 5, 6]
        
        # 转换器
        res = await paginate_list(items, page=1, page_size=2, transformer=lambda x: x*2)
        assert res.items == [2, 4]

    @pytest.mark.asyncio
    async def test_paginator(self):
        """测试分页器类"""
        paginator = Paginator(default_page_size=5, max_page_size=10)
        
        # 测试参数归一化
        p, ps = paginator._normalize_params(0, None)
        assert p == 1
        assert ps == 5 # 默认值
        
        p, ps = paginator._normalize_params(1, 100)
        assert ps == 10 # 超过最大值，限制在最大值
        
        # 测试 paginate_list
        items = list(range(20))
        res = await paginator.paginate_list(items, page=1, page_size=None)
        assert res.page_size == 5
        assert len(res.items) == 5

    @pytest.mark.asyncio
    async def test_paginate_db(self):
        """测试数据库分页 (Mock)"""
        mock_db = AsyncMock()
        mock_query = MagicMock()
        
        # 模拟 count 查询执行
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 100
        
        # 模拟数据查询执行
        mock_data_result = MagicMock()
        mock_data_result.scalars.return_value.all.return_value = ["item1", "item2"]
        
        # 设置 execute 返回值: 第一次是 count, 第二次是 data
        mock_db.execute.side_effect = [mock_count_result, mock_data_result]
        
        # 在 core.pagination 中 patch select 和 func，以避免对 mock 对象进行真实的 SQLAlchemy 校验
        with patch("core.pagination.select") as mock_select, \
             patch("core.pagination.func") as mock_func:
                 
            # 设置 mock_select 返回值以支持链式调用 .select_from()
            mock_select_obj = MagicMock()
            mock_select.return_value = mock_select_obj
            mock_select_obj.select_from.return_value = mock_select_obj
            
            # 执行
            res = await paginate(mock_db, mock_query, page=1, page_size=10)
        
        assert res.total == 100
        assert res.items == ["item1", "item2"]
        # 验证 offset/limit 调用
        mock_query.offset.assert_called_with(0)
        mock_query.offset.return_value.limit.assert_called_with(10)

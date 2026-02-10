"""
时区工具单元测试
覆盖：北京时间获取、时区转换、UTC 互转
"""

import pytest
from datetime import datetime, timezone, timedelta

from utils.timezone import (
    BEIJING_TZ,
    get_beijing_time,
    to_beijing_time,
    utc_to_beijing,
    beijing_to_utc,
)


class TestBeijingTimezone:
    """北京时区常量测试"""

    def test_beijing_tz_offset(self):
        """测试北京时区偏移为 +8 小时"""
        assert BEIJING_TZ.utcoffset(None) == timedelta(hours=8)


class TestGetBeijingTime:
    """获取北京时间测试"""

    def test_returns_datetime(self):
        """测试返回 datetime 对象"""
        now = get_beijing_time()
        assert isinstance(now, datetime)

    def test_has_timezone_info(self):
        """测试包含时区信息"""
        now = get_beijing_time()
        assert now.tzinfo is not None

    def test_timezone_is_beijing(self):
        """测试时区为北京时间"""
        now = get_beijing_time()
        assert now.utcoffset() == timedelta(hours=8)

    def test_close_to_current_time(self):
        """测试返回时间接近当前时间"""
        now = get_beijing_time()
        utc_now = datetime.now(timezone.utc)
        beijing_now = utc_now.astimezone(BEIJING_TZ)
        
        diff = abs((now - beijing_now).total_seconds())
        assert diff < 2  # 2 秒内误差


class TestToBeijingTime:
    """时间转换为北京时间测试"""

    def test_none_input(self):
        """测试 None 输入"""
        result = to_beijing_time(None)
        assert result is None

    def test_naive_datetime(self):
        """测试无时区信息的 datetime（假设为本地时间）"""
        naive = datetime(2024, 1, 1, 12, 0, 0)
        result = to_beijing_time(naive)
        
        assert result.tzinfo is not None
        assert result.utcoffset() == timedelta(hours=8)
        assert result.hour == 12  # 直接替换时区，不转换

    def test_utc_datetime(self):
        """测试 UTC 时间转北京时间"""
        utc_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = to_beijing_time(utc_time)
        
        assert result.utcoffset() == timedelta(hours=8)
        assert result.hour == 8  # UTC 0:00 → 北京 8:00

    def test_other_timezone(self):
        """测试其他时区转北京时间"""
        # JST (UTC+9) 
        jst = timezone(timedelta(hours=9))
        jst_time = datetime(2024, 1, 1, 9, 0, 0, tzinfo=jst)
        result = to_beijing_time(jst_time)
        
        assert result.utcoffset() == timedelta(hours=8)
        assert result.hour == 8  # JST 9:00 → 北京 8:00


class TestUtcToBeijing:
    """UTC 转北京时间测试"""

    def test_none_input(self):
        """测试 None 输入"""
        result = utc_to_beijing(None)
        assert result is None

    def test_aware_utc(self):
        """测试带时区的 UTC 时间"""
        utc_time = datetime(2024, 6, 15, 12, 30, 0, tzinfo=timezone.utc)
        result = utc_to_beijing(utc_time)
        
        assert result.hour == 20
        assert result.minute == 30
        assert result.utcoffset() == timedelta(hours=8)

    def test_naive_utc(self):
        """测试无时区的 UTC 时间"""
        naive_utc = datetime(2024, 6, 15, 12, 30, 0)
        result = utc_to_beijing(naive_utc)
        
        assert result.hour == 20
        assert result.minute == 30

    def test_midnight_crossing(self):
        """测试跨日转换"""
        utc_time = datetime(2024, 1, 1, 20, 0, 0, tzinfo=timezone.utc)
        result = utc_to_beijing(utc_time)
        
        # UTC 20:00 → 北京 次日 4:00
        assert result.day == 2
        assert result.hour == 4


class TestBeijingToUtc:
    """北京时间转 UTC 测试"""

    def test_none_input(self):
        """测试 None 输入"""
        result = beijing_to_utc(None)
        assert result is None

    def test_aware_beijing(self):
        """测试带时区的北京时间"""
        beijing_time = datetime(2024, 6, 15, 20, 30, 0, tzinfo=BEIJING_TZ)
        result = beijing_to_utc(beijing_time)
        
        assert result.hour == 12
        assert result.minute == 30
        assert result.utcoffset() == timedelta(0)

    def test_naive_beijing(self):
        """测试无时区的北京时间"""
        naive_beijing = datetime(2024, 6, 15, 20, 30, 0)
        result = beijing_to_utc(naive_beijing)
        
        assert result.hour == 12
        assert result.minute == 30

    def test_roundtrip(self):
        """测试往返转换"""
        original = datetime(2024, 6, 15, 14, 30, 0, tzinfo=BEIJING_TZ)
        
        utc_version = beijing_to_utc(original)
        back_to_beijing = utc_to_beijing(utc_version)
        
        assert original.hour == back_to_beijing.hour
        assert original.minute == back_to_beijing.minute
        assert original.day == back_to_beijing.day

    def test_midnight_crossing_reverse(self):
        """测试反向跨日转换"""
        beijing_time = datetime(2024, 1, 1, 4, 0, 0, tzinfo=BEIJING_TZ)
        result = beijing_to_utc(beijing_time)
        
        # 北京 4:00 → UTC 前一天 20:00
        assert result.day == 31
        assert result.month == 12
        assert result.year == 2023
        assert result.hour == 20

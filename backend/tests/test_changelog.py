"""
更新日志模块测试
"""
import pytest
from core.changelog import (
    ChangelogEntry, 
    get_changelog, 
    get_latest_version, 
    get_version_changes, 
    CHANGELOG,
    ChangeType
)

class TestChangelog:
    """更新日志测试"""
    
    def test_changelog_entry(self):
        """测试日志条目模型"""
        entry = ChangelogEntry(
            version="0.0.1",
            date="2024-01-01",
            changes={"feature": ["Test"]}
        )
        d = entry.to_dict()
        assert d["version"] == "0.0.1"
        assert d["changes"]["feature"] == ["Test"]
        
    def test_get_changelog(self):
        """测试获取日志"""
        # 获取所有日志
        logs = get_changelog()
        assert len(logs) == len(CHANGELOG)
        
        # 获取特定版本日志
        if CHANGELOG:
            ver = CHANGELOG[0].version
            logs = get_changelog(ver)
            assert len(logs) == 1
            assert logs[0]["version"] == ver
            
        # 获取不存在的版本
        logs = get_changelog("0.0.0.0.0")
        assert len(logs) == 0

    def test_get_latest_version(self):
        """测试获取最新版本"""
        latest = get_latest_version()
        if CHANGELOG:
            assert latest["version"] == CHANGELOG[0].version
        else:
            assert latest is None
            
    def test_get_version_changes(self):
        """测试版本变更比较"""
        # 临时模拟 CHANGELOG
        original_changelog = list(CHANGELOG)
        CHANGELOG.clear()
        
        try:
            CHANGELOG.extend([
                ChangelogEntry("1.1.0", "2024-02-01", {"feature": ["F2"]}),
                ChangelogEntry("1.0.0", "2024-01-01", {"feature": ["F1"]})
            ])
            
            # 检查是否有可用更新
            diff = get_version_changes("1.0.0", "1.1.0")
            assert diff["has_updates"] is True
            assert "F2" in diff["changes"]["feature"]
            
            # 检查无更新的情况
            diff = get_version_changes("1.1.0", "1.1.0")
            assert diff["has_updates"] is False
            
            # 检查无效版本
            diff = get_version_changes("9.9.9", "1.1.0")
            assert diff["has_updates"] is False
            
        finally:
            # 恢复原始数据
            CHANGELOG.clear()
            CHANGELOG.extend(original_changelog)

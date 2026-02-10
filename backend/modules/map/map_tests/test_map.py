# -*- coding: utf-8 -*-
"""
地图模块测试
覆盖：模型、服务层、标记 CRUD、GPS 轨迹、地图配置、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.map.map_models import MapTrail, MapConfig, MapMarker


# ==================== 模型测试 ====================
class TestMapModels:
    def test_trail_model(self):
        assert "trail" in MapTrail.__tablename__

    def test_config_model(self):
        assert "config" in MapConfig.__tablename__

    def test_marker_model(self):
        assert "marker" in MapMarker.__tablename__


# ==================== 服务层测试 ====================
class TestMapService:
    @pytest.mark.asyncio
    async def test_get_or_create_config(self, db_session):
        """测试获取或创建地图配置"""
        from modules.map.map_models import MapConfig
        from sqlalchemy import select
        # 初始应该没有配置
        result = await db_session.execute(select(MapConfig).where(MapConfig.user_id == 1))
        config = result.scalar_one_or_none()
        assert config is None  # 首次应为空

    @pytest.mark.asyncio
    async def test_create_marker(self, db_session):
        """测试创建标记点"""
        marker = MapMarker(
            user_id=1, name="测试标记", lat=39.9042, lng=116.4074,
            color="#FF0000", icon="pin", description="北京天安门"
        )
        db_session.add(marker)
        await db_session.commit()
        await db_session.refresh(marker)
        assert marker.id is not None
        assert marker.name == "测试标记"
        assert marker.lat == 39.9042

    @pytest.mark.asyncio
    async def test_create_trail(self, db_session):
        """测试创建 GPS 轨迹记录"""
        trail = MapTrail(
            user_id=1, filename="track.gpx", file_path="/data/track.gpx",
            file_size=1024, file_type="gpx"
        )
        db_session.add(trail)
        await db_session.commit()
        await db_session.refresh(trail)
        assert trail.id is not None
        assert trail.filename == "track.gpx"

    @pytest.mark.asyncio
    async def test_marker_crud(self, db_session):
        """测试标记点 CRUD"""
        from sqlalchemy import select
        # 创建
        marker = MapMarker(user_id=1, name="CRUD标记", lat=31.23, lng=121.47, color="#00FF00")
        db_session.add(marker)
        await db_session.commit()
        await db_session.refresh(marker)
        mid = marker.id

        # 查询
        result = await db_session.execute(select(MapMarker).where(MapMarker.id == mid))
        fetched = result.scalar_one_or_none()
        assert fetched is not None
        assert fetched.name == "CRUD标记"

        # 更新
        fetched.name = "更新标记"
        await db_session.commit()
        result2 = await db_session.execute(select(MapMarker).where(MapMarker.id == mid))
        updated = result2.scalar_one_or_none()
        assert updated.name == "更新标记"

        # 删除
        await db_session.delete(updated)
        await db_session.commit()
        result3 = await db_session.execute(select(MapMarker).where(MapMarker.id == mid))
        assert result3.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_trail_visibility(self, db_session):
        """测试轨迹可见性"""
        trail = MapTrail(
            user_id=1, filename="vis.gpx", file_path="/data/vis.gpx",
            file_size=512, file_type="gpx", is_visible=True
        )
        db_session.add(trail)
        await db_session.commit()
        assert trail.is_visible is True

    @pytest.mark.asyncio
    async def test_trail_favorite(self, db_session):
        """测试轨迹收藏"""
        trail = MapTrail(
            user_id=1, filename="fav.gpx", file_path="/data/fav.gpx",
            file_size=256, file_type="gpx", is_favorite=False
        )
        db_session.add(trail)
        await db_session.commit()
        trail.is_favorite = True
        await db_session.commit()
        assert trail.is_favorite is True


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestMapConfigAPI:
    async def test_get_config(self, admin_client: AsyncClient):
        """测试获取地图配置"""
        resp = await admin_client.get("/api/v1/map/config")
        assert resp.status_code == 200

    async def test_save_config(self, admin_client: AsyncClient):
        """测试保存地图配置"""
        resp = await admin_client.post("/api/v1/map/config/save", json={
            "map_mode": "online", "tile_source": "amap",
            "last_center": [116.4, 39.9], "last_zoom": 10
        })
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestMapMarkerAPI:
    async def test_list_markers(self, admin_client: AsyncClient):
        """测试获取标记列表"""
        resp = await admin_client.get("/api/v1/map/markers/list")
        assert resp.status_code == 200

    async def test_add_marker(self, admin_client: AsyncClient):
        """测试添加标记"""
        resp = await admin_client.post("/api/v1/map/markers/add", json={
            "name": "API标记", "lat": 39.9, "lng": 116.4, "color": "#FF0000"
        })
        assert resp.status_code == 200

    async def test_marker_lifecycle(self, admin_client: AsyncClient):
        """测试标记完整生命周期"""
        # 添加
        cr = await admin_client.post("/api/v1/map/markers/add", json={
            "name": "生命周期", "lat": 31.2, "lng": 121.4, "color": "#0000FF"
        })
        assert cr.status_code == 200
        mid = cr.json()["data"]["id"]
        # 更新
        up = await admin_client.post("/api/v1/map/markers/update", json={
            "id": mid, "name": "已更新", "lat": 31.2, "lng": 121.4, "color": "#00FF00"
        })
        assert up.status_code == 200
        # 删除
        dl = await admin_client.delete(f"/api/v1/map/markers/delete", params={"marker_id": mid})
        assert dl.status_code == 200


@pytest.mark.asyncio
class TestMapGpsAPI:
    async def test_list_gps(self, admin_client: AsyncClient):
        """测试获取 GPS 文件列表"""
        resp = await admin_client.get("/api/v1/map/gps/list")
        assert resp.status_code == 200

    async def test_tiles_check(self, admin_client: AsyncClient):
        """测试检查本地瓦片"""
        resp = await admin_client.get("/api/v1/map/tiles/check")
        assert resp.status_code == 200


class TestMapManifest:
    def test_manifest(self):
        from modules.map.map_manifest import manifest
        assert manifest.id == "map"
        assert manifest.enabled is True

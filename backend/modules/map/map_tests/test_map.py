import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from modules.map.map_models import MapConfig, MapTrail

# Mock user ID
USER_ID = 1

@pytest.mark.asyncio
async def test_map_models_basic(db: AsyncSession):
    """测试 Map 模块模型基础操作"""
    
    # 1. MapConfig
    config = MapConfig(
        user_id=USER_ID,
        map_mode="online",
        last_center={"lat": 39.9, "lng": 116.4}
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    
    fetched_conf = await db.execute(select(MapConfig).where(MapConfig.user_id == USER_ID))
    res = fetched_conf.scalar_one()
    assert res.map_mode == "online"
    assert res.last_center["lat"] == 39.9

    # 2. MapTrail
    trail = MapTrail(
        user_id=USER_ID,
        filename="test.gpx",
        file_path="modules/map/test.gpx",
        file_type="gpx"
    )
    db.add(trail)
    await db.commit()
    
    assert trail.id is not None
    await db.delete(trail)
    await db.delete(config)
    await db.commit()

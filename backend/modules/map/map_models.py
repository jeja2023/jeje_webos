from sqlalchemy import Column, Integer, String, Float, JSON, ForeignKey, DateTime, Boolean
from sqlalchemy.sql import func
from core.database import Base

class MapTrail(Base):
    """地图轨迹元数据表"""
    __tablename__ = "map_trails"
    __table_args__ = {"comment": "地图轨迹元数据及样式持久化表"}
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, comment="所属用户ID")
    filename = Column(String(255), nullable=False, comment="显示文件名")
    file_path = Column(String(500), nullable=False, comment="物理存储相对路径")
    file_size = Column(Integer, default=0, comment="文件大小字节")
    file_type = Column(String(50), comment="文件类型如 gpx, csv")
    
    # 样式与偏好
    color = Column(String(20), default="#3b82f6", comment="轨迹显示颜色")
    is_visible = Column(Boolean, default=True, comment="是否默认可见")
    is_favorite = Column(Boolean, default=False, comment="是否收藏")
    
    # 统计信息 (自动解析后存储)
    stats = Column(JSON, nullable=True, comment="轨迹统计信息如里程、海拔等")
    
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间")

class MapConfig(Base):
    """地图个人配置持久化表"""
    __tablename__ = "map_configs"
    __table_args__ = {"comment": "用户地图个性化配置表"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("sys_users.id"), unique=True, index=True, comment="所属用户ID")
    
    # 地图状态
    map_mode = Column(String(20), default="offline", comment="底图模式: online/offline")
    tile_source = Column(String(100), default="amap_offline", comment="当前离线源名称")
    online_tile_url = Column(String(500), comment="在线底图模板URL")
    
    # 视野状态
    last_center = Column(JSON, comment="上次查看中心坐标 [lat, lng]")
    last_zoom = Column(Integer, default=12, comment="上次缩放级别")
    
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="最后更新时间")

class MapMarker(Base):
    """地图标记点持久化表"""
    __tablename__ = "map_markers"
    __table_args__ = {"comment": "用户自定义地理标记点表"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, comment="用户ID")
    name = Column(String(100), nullable=False, comment="标记点名称")
    lat = Column(Float, nullable=False, comment="纬度")
    lng = Column(Float, nullable=False, comment="经度")
    
    # 属性
    color = Column(String(20), default="#ef4444", comment="标记点颜色")
    icon = Column(String(50), default="ri-map-pin-2-fill", comment="图标类名")
    description = Column(String(500), comment="描述/备注")
    
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")

class MapTileSource(Base):
    """离线瓦片资源库元数据表"""
    __tablename__ = "map_tile_sources"
    __table_args__ = {"comment": "离线瓦片资源元数据表"}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, comment="源标识名称")
    display_name = Column(String(100), comment="显示名称")
    storage_path = Column(String(500), nullable=False, comment="瓦片物理路径")
    
    # 元数据
    min_zoom = Column(Integer, default=0, comment="最小缩放")
    max_zoom = Column(Integer, default=18, comment="最大缩放")
    bounds = Column(JSON, comment="地理范围边界 [[lat_min, lng_min], [lat_max, lng_max]]")
    center = Column(JSON, comment="默认推荐中心点 [lat, lng]")
    
    created_at = Column(DateTime, server_default=func.now(), comment="入库时间")

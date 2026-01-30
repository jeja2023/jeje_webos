"""
地图模块路由
处理 GPS 数据上传与解析
"""

import os
import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from typing import List, Dict, Optional
from datetime import datetime

from core.security import get_current_user, TokenData
from core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from modules.map.map_models import MapTrail, MapConfig, MapMarker, MapTileSource
from utils.storage import get_storage_manager
from schemas.response import success, error

router = APIRouter()
storage_manager = get_storage_manager()

@router.get("/config")
async def get_map_config(
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户地图个性化配置"""
    result = await db.execute(select(MapConfig).where(MapConfig.user_id == user.user_id))
    config = result.scalar_one_or_none()
    
    if not config:
        # 首次使用，创建一个默认配置
        config = MapConfig(user_id=user.user_id)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    
    return success(data={
        "map_mode": config.map_mode,
        "tile_source": config.tile_source,
        "online_tile_url": config.online_tile_url,
        "last_center": config.last_center,
        "last_zoom": config.last_zoom
    })

@router.post("/config/save")
async def save_map_config(
    data: Dict,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """保存用户地图状态"""
    result = await db.execute(select(MapConfig).where(MapConfig.user_id == user.user_id))
    config = result.scalar_one_or_none()
    
    if not config:
        config = MapConfig(user_id=user.user_id)
        db.add(config)
    
    # 更新字段
    if "map_mode" in data: config.map_mode = data["map_mode"]
    if "tile_source" in data: config.tile_source = data["tile_source"]
    if "online_tile_url" in data: config.online_tile_url = data["online_tile_url"]
    if "last_center" in data: config.last_center = data["last_center"]
    if "last_zoom" in data: config.last_zoom = data["last_zoom"]
    
    await db.commit()
    return success(message="配置已同步")

# --- 标记点 (Markers) 接口 ---

@router.get("/markers/list")
async def list_markers(
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户标记点列表"""
    result = await db.execute(select(MapMarker).where(MapMarker.user_id == user.user_id))
    markers = result.scalars().all()
    return success(data=[{
        "id": m.id,
        "name": m.name,
        "lat": m.lat,
        "lng": m.lng,
        "color": m.color,
        "icon": m.icon,
        "description": m.description
    } for m in markers])

@router.post("/markers/add")
async def add_marker(
    marker_data: Dict,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """新增标记点"""
    new_m = MapMarker(
        user_id=user.user_id,
        name=marker_data.get("name", "未命名标记"),
        lat=marker_data["lat"],
        lng=marker_data["lng"],
        color=marker_data.get("color", "#ef4444"),
        icon=marker_data.get("icon", "ri-map-pin-2-fill"),
        description=marker_data.get("description", "")
    )
    db.add(new_m)
    await db.commit()
    await db.refresh(new_m)
    return success(data={"id": new_m.id}, message="标记点已添加")

@router.delete("/markers/delete")
async def delete_marker(
    marker_id: int,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除标记点"""
    await db.execute(delete(MapMarker).where(MapMarker.id == marker_id, MapMarker.user_id == user.user_id))
    await db.flush()
    await db.commit()
    return success(message="标记点已移除")

@router.post("/markers/update")
async def update_marker(
    marker_data: Dict,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新标记点信息"""
    marker_id = marker_data.get("id")
    if not marker_id:
        return error(message="缺少标记点ID")
    
    result = await db.execute(select(MapMarker).where(MapMarker.id == marker_id, MapMarker.user_id == user.user_id))
    marker = result.scalar_one_or_none()
    
    if not marker:
        return error(message="标记点不存在")
    
    # 更新字段
    if "name" in marker_data: marker.name = marker_data["name"]
    if "description" in marker_data: marker.description = marker_data["description"]
    if "color" in marker_data: marker.color = marker_data["color"]
    if "icon" in marker_data: marker.icon = marker_data["icon"]
    
    await db.commit()
    return success(message="标记点已更新")

import gpxpy
import gpxpy.gpx

@router.post("/upload")
async def upload_gps_data(
    file: UploadFile = File(...),
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    上传 GPS 点位数据 (CSV/Excel/GPX) 并存入数据库
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.csv', '.xlsx', '.xls', '.gpx']:
        return error(message="仅支持 CSV, Excel 或 GPX 文件")

    # 保存原始文件
    rel_path, full_path = storage_manager.generate_filename(
        file.filename, 
        user_id=user.user_id, 
        module="map", 
        sub_type="map_gps"
    )
    
    with open(full_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    try:
        # 解析数据
        points = parse_gps_file(full_path)
        
        # 存入数据库
        new_trail = MapTrail(
            user_id=user.user_id,
            filename=file.filename,
            file_path=rel_path,
            file_size=len(content),
            file_type=ext.lstrip('.'),
            stats={"point_count": len(points)}
        )
        db.add(new_trail)
        await db.commit()
        await db.refresh(new_trail)

        return success(data={
            "id": new_trail.id,
            "filename": new_trail.filename,
            "path": rel_path,
            "points": points,
            "count": len(points),
            "upload_at": new_trail.created_at.strftime("%Y-%m-%d %H:%M:%S")
        })

    except Exception as e:
        await db.rollback()
        return error(message=f"处理失败: {str(e)}")

def parse_gps_file(file_path: str) -> List[Dict]:
    """解析 GPS 文件内容 (支持 CSV, Excel, GPX)"""
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == '.gpx':
        points = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                gpx = gpxpy.parse(f)
                
                # 提取航点 (Waypoints)
                for waypoint in gpx.waypoints:
                    points.append({
                        'lng': waypoint.longitude,
                        'lat': waypoint.latitude,
                        'name': waypoint.name or '航点',
                        'time': waypoint.time.strftime("%Y-%m-%d %H:%M:%S") if waypoint.time else None
                    })
                
                # 提取轨迹点 (Track Points)
                for track in gpx.tracks:
                    for segment in track.segments:
                        for point in segment.points:
                            points.append({
                                'lng': point.longitude,
                                'lat': point.latitude,
                                'name': getattr(point, 'name', None) or '轨迹点',
                                'time': point.time.strftime("%Y-%m-%d %H:%M:%S") if point.time else None
                            })
            return points
        except Exception as e:
            raise ValueError(f"GPX 解析失败: {str(e)}")

    if ext == '.csv':
        try:
            df = pd.read_csv(file_path)
        except:
            df = pd.read_csv(file_path, encoding='gbk')
    else:
        df = pd.read_excel(file_path)

    # 统一列名映射
    col_map = {
        'longitude': 'lng', '经度': 'lng', 'lng': 'lng',
        'latitude': 'lat', '纬度': 'lat', 'lat': 'lat',
        'name': 'name', '名称': 'name', '点名': 'name',
        'seq': 'seq', '序号': 'seq', '编号': 'seq'
    }
    df.columns = [col_map.get(str(c).lower(), str(c)) for c in df.columns]

    if 'lng' not in df.columns or 'lat' not in df.columns:
        raise ValueError("文件中必须包含经(lng)纬(lat)度列")

    # 清洗数据
    df = df.dropna(subset=['lng', 'lat'])
    return df.to_dict(orient='records')

@router.get("/gps/list")
async def list_gps_files(
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户轨迹库，融合物理文件与数据库元数据"""
    # 1. 获取数据库中属于该用户的所有记录
    result = await db.execute(select(MapTrail).where(MapTrail.user_id == user.user_id))
    db_trails = {t.file_path: t for t in result.scalars().all()}
    
    gps_root = storage_manager.get_module_dir("map", "map_gps", user_id=user.user_id)
    
    def get_tree(path):
        tree = []
        if not path.exists(): return tree
        for item in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name)):
            rel_id = str(item.relative_to(gps_root)).replace("\\", "/")
            if item.is_dir():
                tree.append({
                    "id": rel_id,
                    "filename": item.name,
                    "type": "directory",
                    "children": get_tree(item)
                })
            elif item.suffix.lower() in ['.csv', '.xlsx', '.xls', '.gpx']:
                stat = item.stat()
                # 尝试匹配数据库记录
                db_item = db_trails.get(f"modules/map/map_gps/user_{user.user_id}/{rel_id}")
                
                tree.append({
                    "id": db_item.id if db_item else rel_id, # 优先使用数据库 ID
                    "filename": item.name,
                    "type": "file",
                    "size": stat.st_size,
                    "color": db_item.color if db_item else "#3b82f6",
                    "stats": db_item.stats if db_item else {},
                    "created_at": db_item.created_at.strftime("%Y-%m-%d %H:%M:%S") if db_item else datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S")
                })
        return tree

    return success(data=get_tree(gps_root))

@router.post("/gps/update_style")
async def update_trail_style(
    trail_id: int,
    color: Optional[str] = None,
    is_visible: Optional[bool] = None,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新轨迹的显示样式（颜色、可见性）"""
    result = await db.execute(select(MapTrail).where(MapTrail.id == trail_id, MapTrail.user_id == user.user_id))
    trail = result.scalar_one_or_none()
    
    if not trail:
        return error(message="记录不存在")
        
    if color: trail.color = color
    if is_visible is not None: trail.is_visible = is_visible
    
    await db.commit()
    return success(message="样式已更新")

@router.post("/gps/mkdir")
async def create_gps_dir(
    dir_name: str,
    parent_path: Optional[str] = "",
    user: TokenData = Depends(get_current_user)
):
    """创建轨迹存放目录"""
    # 防止路径穿越
    if ".." in dir_name or ".." in parent_path:
        return error(message="非法的目录名")
        
    gps_root = storage_manager.get_module_dir("map", "map_gps", user_id=user.user_id)
    target_dir = gps_root / parent_path / dir_name
    
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        return success(message="目录创建成功")
    except Exception as e:
        return error(message=f"创建失败: {str(e)}")

@router.get("/gps/load")
async def load_gps_file(
    file_id: str, # 兼容字符串路径或数字 ID
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """加载轨迹数据（支持路径或 ID，自动同步数据库）"""
    trail = None
    if file_id.isdigit():
        # 按 ID 查询
        result = await db.execute(select(MapTrail).where(MapTrail.id == int(file_id), MapTrail.user_id == user.user_id))
        trail = result.scalar_one_or_none()
    
    if not trail:
        # 按路径查询（可能是前端传来的相对路径）
        search_path = file_id
        if not search_path.startswith("modules/map/map_gps/"):
             search_path = f"modules/map/map_gps/user_{user.user_id}/{file_id}"
             
        result = await db.execute(select(MapTrail).where(MapTrail.file_path == search_path, MapTrail.user_id == user.user_id))
        trail = result.scalar_one_or_none()
        
        # 如果数据库没有，但物理文件存在，则自动“补全”到数据库
        if not trail:
            gps_root = storage_manager.get_module_dir("map", "map_gps", user_id=user.user_id)
            full_path = gps_root / file_id
            if full_path.exists() and full_path.is_file():
                try:
                    points = parse_gps_file(str(full_path))
                    trail = MapTrail(
                        user_id=user.user_id,
                        filename=os.path.basename(file_id),
                        file_path=f"modules/map/map_gps/user_{user.user_id}/{file_id}",
                        file_size=full_path.stat().st_size,
                        file_type=full_path.suffix.lstrip('.'),
                        stats={"point_count": len(points)}
                    )
                    db.add(trail)
                    await db.commit()
                    await db.refresh(trail)
                except Exception as e:
                    return error(message=f"自动同步失败: {str(e)}")
            else:
                return error(message="轨迹文件不存在")

    # 执行最终解析
    full_path = storage_manager.get_full_path(trail.file_path)
    try:
        points = parse_gps_file(str(full_path))
        return success(data={
            "id": trail.id, # 统一返回数据库 ID
            "filename": trail.filename,
            "color": trail.color,
            "points": points,
            "count": len(points)
        })
    except Exception as e:
        return error(message=f"解析失败: {str(e)}")

@router.delete("/gps/delete")
async def delete_gps_trail(
    trail_id: int,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除轨迹（同步删除数据库记录和物理文件）"""
    result = await db.execute(select(MapTrail).where(MapTrail.id == trail_id, MapTrail.user_id == user.user_id))
    trail = result.scalar_one_or_none()
    
    if not trail:
        return error(message="轨迹不存在")
    
    # 删除物理文件
    full_path = storage_manager.get_full_path(trail.file_path)
    if os.path.exists(full_path):
        os.remove(full_path)
        
    # 删除数据库记录
    await db.delete(trail)
    await db.flush()
    await db.commit()
    
    return success(message="轨迹已成功删除")

@router.delete("/tiles/delete")
async def delete_local_tiles(source_name: str, user: TokenData = Depends(get_current_user)):
    """删除指定的本地瓦片源"""
    # 路径安全检查
    if ".." in source_name or "/" in source_name or "\\" in source_name:
        return error(message="非法源名称")
        
    tiles_base = storage_manager.get_module_dir("map", "map_tiles")
    target_dir = tiles_base / source_name
    
    if not target_dir.exists() or not target_dir.is_dir():
        return error(message="该源不存在")
        
    try:
        import shutil
        shutil.rmtree(target_dir)
        return success(message=f"离线源 {source_name} 已删除")
    except Exception as e:
        return error(message=f"删除失败: {str(e)}")

import math

def get_lat_lng_from_tile(x: int, y: int, z: int):
    """根据瓦片坐标换算经纬度 (Google/OSM 方案)"""
    n = 2.0 ** z
    lon_deg = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    lat_deg = math.degrees(lat_rad)
    return lat_deg, lon_deg

@router.get("/tiles/check")
async def check_local_tiles():
    """检查本地瓦片可用性、各级范围及推荐中心点"""
    tiles_base = storage_manager.get_module_dir("map", "map_tiles")
    sources = []
    
    if tiles_base.exists():
        for d in tiles_base.iterdir():
            if not d.is_dir(): continue
            
            # 获取所有缩放级别
            levels = [ld.name for ld in d.iterdir() if ld.is_dir() and ld.name.isdigit()]
            if not levels: continue
            
            levels_int = sorted([int(l) for l in levels])
            # 取中间或最高级别来计算中心点
            target_z = levels_int[len(levels_int)//2]
            z_dir = d / str(target_z)
            
            x_dirs = [xd.name for xd in z_dir.iterdir() if xd.is_dir() and xd.name.isdigit()]
            if x_dirs:
                x_min, x_max = int(min(x_dirs, key=int)), int(max(x_dirs, key=int))
                # 随机取一个 X 下的 Y 目录
                sample_x_dir = z_dir / str(x_min)
                y_files = [yf.stem for yf in sample_x_dir.iterdir() if yf.is_file() and yf.stem.isdigit()]
                if y_files:
                    y_min, y_max = int(min(y_files, key=int)), int(max(y_files, key=int))
                    
                    # 计算范围中心点
                    c_lat, c_lng = get_lat_lng_from_tile((x_min + x_max) // 2, (y_min + y_max) // 2, target_z)
                    
                    sources.append({
                        "name": d.name,
                        "levels": levels_int,
                        "count": len(levels_int),
                        "center": [round(c_lat, 4), round(c_lng, 4)], # 推荐中心点
                        "default_zoom": target_z
                    })
    
    return success(data={
        "offline_available": len(sources) > 0,
        "sources": sources
    })

import httpx
from fastapi import Response
import logging
logger = logging.getLogger(__name__)

@router.get("/tile-proxy", include_in_schema=False)
async def map_tile_proxy(url: str):
    """
    地图瓦片反向代理
    解决前端跨域或 HTTP/HTTPS 混合加载限制
    """
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            # 模拟浏览器 UA
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            resp = await client.get(url, timeout=10.0, headers=headers)
            if resp.status_code != 200:
                logger.error(f"⚠️ 地图瓦片抓取异常: HTTP {resp.status_code}, URL: {url}")
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="image/png"
            )
        except Exception as e:
            logger.error(f"❌ 地图代理连接失败: {str(e)}, URL: {url}")
            return Response(status_code=502, content=f"Proxy Error: {str(e)}")

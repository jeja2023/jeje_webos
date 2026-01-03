"""
相册模块
"""

from .album_manifest import manifest
from .album_models import Album
from .album_services import AlbumService

__all__ = ["manifest", "Album", "AlbumService"]

"""
JWT密钥自动轮换服务
支持定期自动轮换和手动轮换
"""

import secrets
import random
import os
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Tuple

from core.config import get_settings, reload_settings

logger = logging.getLogger(__name__)


class JWTRotator:
    """JWT密钥轮换器"""
    
    def __init__(self, env_path: Optional[Path] = None):
        """
        初始化轮换器
        
        Args:
            env_path: .env文件路径，默认使用backend/.env
        """
        if env_path is None:
            # 从backend目录查找.env文件
            backend_path = Path(__file__).parent.parent
            self.env_path = backend_path / ".env"
        else:
            self.env_path = Path(env_path)
        
        if not self.env_path.exists():
            raise FileNotFoundError(f"配置文件不存在: {self.env_path}")
    
    def generate_secret(self, length: int = 64) -> str:
        """
        生成安全的随机密钥
        
        Args:
            length: 密钥长度（字符数），默认64字符
            
        Returns:
            安全的随机密钥字符串
        """
        # 使用字母、数字和部分特殊字符生成强密钥
        alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))
    
    def read_env_file(self) -> Tuple[list, dict]:
        """
        读取.env文件内容
        
        Returns:
            (lines, config_dict) 元组
        """
        content = self.env_path.read_text(encoding="utf-8")
        lines = content.split("\n")
        
        config = {}
        for line in lines:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()
        
        return lines, config
    
    def write_env_file(self, lines: list):
        """
        写入.env文件
        
        Args:
            lines: 文件行列表
        """
        content = "\n".join(lines)
        self.env_path.write_text(content, encoding="utf-8")
        logger.info(f"已更新配置文件: {self.env_path}")
    
    def rotate_secret(self, force: bool = False, auto_generate: bool = False) -> dict:
        """
        轮换JWT密钥
        
        Args:
            force: 是否强制轮换（即使刚轮换过）
            auto_generate: 是否自动生成（首次生成时，不保留旧密钥）
            
        Returns:
            轮换结果信息
        """
        settings = get_settings()
        lines, config = self.read_env_file()
        
        current_secret = config.get("JWT_SECRET", "").strip()
        old_secret = config.get("JWT_SECRET_OLD", "").strip()
        
        # 自动生成模式：如果是默认密钥，直接生成新密钥（不保留旧密钥）
        if auto_generate:
            default_secrets = [
                "your-super-secret-key-change-this",
                "your-secret-key-change-in-production"
            ]
            if current_secret in default_secrets:
                # 直接生成新密钥，不保留默认密钥
                old_secret = ""  # 清空旧密钥标记
                force = True  # 强制生成
            else:
                # 不是默认密钥，按正常流程处理
                auto_generate = False
        
        # 检查是否需要轮换
        if not force and old_secret:
            logger.info("存在旧密钥，跳过轮换（等待过渡期结束）")
            return {
                "rotated": False,
                "reason": "存在旧密钥，等待过渡期结束",
                "current_secret_length": len(current_secret),
                "old_secret_exists": bool(old_secret)
            }
        
        # 生成新密钥
        new_secret = self.generate_secret()
        
        # 构建新的配置行
        new_lines = []
        jwt_secret_found = False
        jwt_secret_old_found = False
        
        default_secrets = [
            "your-super-secret-key-change-this",
            "your-secret-key-change-in-production"
        ]
        
        for line in lines:
            if line.startswith("JWT_SECRET=") and not line.startswith("JWT_SECRET_OLD="):
                # 将当前密钥移到旧密钥（排除默认值，且非自动生成模式）
                if current_secret and current_secret not in default_secrets and not auto_generate:
                    new_lines.append(f"JWT_SECRET_OLD={current_secret}")
                    jwt_secret_old_found = True
                elif auto_generate:
                    # 自动生成模式：不保留默认密钥
                    logger.info("自动生成模式：跳过保留默认密钥")
                
                # 设置新密钥
                new_lines.append(f"JWT_SECRET={new_secret}")
                jwt_secret_found = True
            elif line.startswith("JWT_SECRET_OLD="):
                # 保留现有旧密钥（如果存在且不为空）
                if old_secret:
                    new_lines.append(line)
                    jwt_secret_old_found = True
                # 如果旧密钥为空，跳过（将被新密钥替换）
            else:
                new_lines.append(line)
        
        # 如果JWT_SECRET行不存在，添加它
        if not jwt_secret_found:
            new_lines.append(f"JWT_SECRET={new_secret}")
        
        # 生成下次轮换的随机间隔
        next_rotate_days = self.generate_next_rotate_days()
        next_rotate_time = datetime.now() + timedelta(days=next_rotate_days)
        
        # 更新轮换时间戳和下次轮换时间
        rotate_timestamp_found = False
        next_rotate_found = False
        current_time = datetime.now().isoformat()
        next_rotate_str = next_rotate_time.isoformat()
        
        for i, line in enumerate(new_lines):
            if line.startswith("JWT_ROTATE_TIMESTAMP="):
                new_lines[i] = f"JWT_ROTATE_TIMESTAMP={current_time}"
                rotate_timestamp_found = True
            elif line.startswith("JWT_NEXT_ROTATE_TIME="):
                new_lines[i] = f"JWT_NEXT_ROTATE_TIME={next_rotate_str}"
                next_rotate_found = True
        
        # 如果不存在，添加时间戳和下次轮换时间
        if not rotate_timestamp_found or not next_rotate_found:
            # 找到JWT_SECRET行的位置
            insert_index = -1
            for i, line in enumerate(new_lines):
                if line.startswith("JWT_SECRET=") and not line.startswith("JWT_SECRET_OLD="):
                    insert_index = i + 1
                    break
            
            if insert_index > 0:
                if not rotate_timestamp_found:
                    new_lines.insert(insert_index, f"JWT_ROTATE_TIMESTAMP={current_time}")
                    insert_index += 1
                if not next_rotate_found:
                    new_lines.insert(insert_index, f"JWT_NEXT_ROTATE_TIME={next_rotate_str}")
        
        # 写入文件
        self.write_env_file(new_lines)
        
        # 重新加载配置
        reload_settings()
        
        logger.info(f"JWT密钥轮换成功，新密钥长度: {len(new_secret)}")
        
        rotate_timestamp = datetime.now().isoformat()
        
        return {
            "rotated": True,
            "new_secret_length": len(new_secret),
            "old_secret_kept": bool(current_secret and current_secret not in default_secrets),
            "rotate_timestamp": rotate_timestamp,
            "next_rotate_days": next_rotate_days,
            "next_rotate_time": next_rotate_str,
            "message": f"密钥轮换成功，下次轮换将在 {next_rotate_days} 天后（{next_rotate_time.strftime('%Y-%m-%d %H:%M')}）"
        }
    
    def cleanup_old_secret(self) -> dict:
        """
        清理旧密钥（过渡期结束后）
        
        Returns:
            清理结果信息
        """
        lines, config = self.read_env_file()
        
        old_secret = config.get("JWT_SECRET_OLD", "").strip()
        
        if not old_secret:
            return {
                "cleaned": False,
                "reason": "不存在旧密钥"
            }
        
        # 移除JWT_SECRET_OLD行
        new_lines = []
        for line in lines:
            if not line.startswith("JWT_SECRET_OLD="):
                new_lines.append(line)
        
        self.write_env_file(new_lines)
        reload_settings()
        
        logger.info("已清理旧JWT密钥")
        
        return {
            "cleaned": True,
            "message": "旧密钥已清理"
        }
    
    def generate_next_rotate_days(self) -> int:
        """
        生成下次轮换的随机间隔天数
        
        Returns:
            随机间隔天数（在配置的最小值和最大值之间）
        """
        settings = get_settings()
        min_days = settings.jwt_rotate_interval_min
        max_days = settings.jwt_rotate_interval_max
        
        # 确保最大值不小于最小值
        if max_days < min_days:
            max_days = min_days
        
        # 生成随机间隔
        days = random.randint(min_days, max_days)
        logger.info(f"生成随机轮换间隔: {days} 天（范围: {min_days}-{max_days}天）")
        return days
    
    def should_rotate(self) -> bool:
        """
        检查是否应该轮换密钥
        
        策略：
        1. 如果存在旧密钥，说明刚轮换过，等待过渡期结束
        2. 如果密钥是默认值，立即轮换
        3. 检查记录的下次轮换时间，如果已到则轮换
        
        Returns:
            是否应该轮换
        """
        settings = get_settings()
        
        # 如果存在旧密钥，说明刚轮换过，等待过渡期
        if settings.jwt_secret_old:
            return False
        
        # 检查密钥是否是默认值
        default_secrets = [
            "your-secret-key-change-in-production",
            "your-super-secret-key-change-this"
        ]
        if settings.jwt_secret in default_secrets:
            logger.info("检测到默认密钥，立即轮换")
            return True
        
        # 检查是否有下次轮换时间记录
        try:
            _, config = self.read_env_file()
            next_rotate_str = config.get("JWT_NEXT_ROTATE_TIME", "").strip()
            
            if next_rotate_str:
                try:
                    next_rotate = datetime.fromisoformat(next_rotate_str)
                    now = datetime.now()
                    
                    if now >= next_rotate:
                        days_passed = (now - next_rotate).days
                        logger.info(f"已到达轮换时间，距离计划时间已过 {days_passed} 天")
                        return True
                    else:
                        days_remaining = (next_rotate - now).days
                        logger.debug(f"距离下次轮换还有 {days_remaining} 天")
                        return False
                except ValueError as e:
                    logger.warning(f"解析下次轮换时间失败: {e}")
        except Exception as e:
            logger.debug(f"读取下次轮换时间失败: {e}")
        
        # 如果没有记录，检查.env文件修改时间作为后备方案
        try:
            env_mtime = self.env_path.stat().st_mtime
            env_modified = datetime.fromtimestamp(env_mtime)
            days_since_modified = (datetime.now() - env_modified).days
            
            # 如果超过最大间隔，需要轮换
            if days_since_modified >= settings.jwt_rotate_interval_max:
                logger.info(f"JWT密钥已使用 {days_since_modified} 天，超过最大间隔 {settings.jwt_rotate_interval_max} 天")
                return True
        except Exception as e:
            logger.warning(f"无法检查.env文件修改时间: {e}")
        
        return False
    
    def should_cleanup(self) -> bool:
        """
        检查是否应该清理旧密钥
        
        策略：
        1. 如果不存在旧密钥，无需清理
        2. 检查轮换时间戳，如果已超过 Token 最大有效期（jwt_expire_minutes），则清理
        
        Returns:
            是否应该清理旧密钥
        """
        settings = get_settings()
        
        # 检查是否存在旧密钥
        if not settings.jwt_secret_old:
            return False
        
        # 读取轮换时间戳
        try:
            _, config = self.read_env_file()
            rotate_timestamp_str = config.get("JWT_ROTATE_TIMESTAMP", "").strip()
            
            if not rotate_timestamp_str:
                # 没有轮换时间戳，使用文件修改时间作为后备
                env_mtime = self.env_path.stat().st_mtime
                rotate_time = datetime.fromtimestamp(env_mtime)
            else:
                rotate_time = datetime.fromisoformat(rotate_timestamp_str)
            
            # 计算过渡期（Token 最大有效期）
            transition_minutes = settings.jwt_expire_minutes  # 默认 7 天 = 10080 分钟
            transition_end = rotate_time + timedelta(minutes=transition_minutes)
            
            now = datetime.now()
            if now >= transition_end:
                days_passed = (now - rotate_time).days
                logger.info(f"旧密钥过渡期已结束，距轮换已过 {days_passed} 天，可以清理")
                return True
            else:
                remaining = transition_end - now
                hours_remaining = remaining.total_seconds() / 3600
                logger.debug(f"旧密钥过渡期未结束，还需等待 {hours_remaining:.1f} 小时")
                return False
                
        except Exception as e:
            logger.warning(f"检查清理条件失败: {e}")
            return False


# 全局轮换器实例
_jwt_rotator: Optional[JWTRotator] = None


def get_jwt_rotator() -> JWTRotator:
    """获取JWT轮换器实例"""
    global _jwt_rotator
    if _jwt_rotator is None:
        _jwt_rotator = JWTRotator()
    return _jwt_rotator


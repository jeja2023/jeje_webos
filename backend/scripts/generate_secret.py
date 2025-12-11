# -*- coding: utf-8 -*-
"""
生成强随机密钥工具
用于生成 JWT 密钥和其他安全密钥

运行: python scripts/generate_secret.py
"""

import secrets
import string
import sys

def generate_secret(length: int = 64) -> str:
    """
    生成强随机密钥
    
    Args:
        length: 密钥长度（默认64字符）
    
    Returns:
        随机密钥字符串
    """
    # 使用字母、数字和部分特殊字符
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    secret = ''.join(secrets.choice(alphabet) for _ in range(length))
    return secret


def generate_jwt_secret() -> str:
    """生成 JWT 密钥（推荐长度：64字符）"""
    return generate_secret(64)


if __name__ == "__main__":
    print("=" * 60)
    print("强随机密钥生成工具")
    print("=" * 60)
    print()
    
    # 生成 JWT 密钥
    jwt_secret = generate_jwt_secret()
    print("JWT 密钥（64字符）:")
    print(jwt_secret)
    print()
    
    # 生成其他长度的密钥示例
    print("其他长度密钥示例:")
    for length in [32, 48, 64, 128]:
        secret = generate_secret(length)
        print(f"  {length}字符: {secret[:32]}...")
    print()
    
    print("=" * 60)
    print("使用说明:")
    print("1. 将生成的密钥复制到 .env 文件的 JWT_SECRET 配置项")
    print("2. 确保密钥长度至少 32 字符（推荐 64 字符）")
    print("3. 生产环境必须使用强随机密钥，不要使用默认密钥")
    print("=" * 60)


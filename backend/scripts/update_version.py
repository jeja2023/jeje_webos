
import sys
import re
from pathlib import Path

# 获取项目根目录
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

CONFIG_FILE = BACKEND_DIR / "core" / "config.py"
ENV_EXAMPLE_FILE = BACKEND_DIR / ".env.example"
README_FILE = ROOT_DIR / "README.md"
CHANGELOG_FILE = ROOT_DIR / "更新日志.md"
DOCKER_ENV_EXAMPLE = ROOT_DIR / "docker" / "env_docker.example"
DEPLOYMENT_ENV_EXAMPLE = ROOT_DIR / "deployment" / "env_docker.example"
USAGE_FILE = ROOT_DIR / "deployment" / "使用说明.md"

def update_version(new_version):
    """
    更新系统版本号到配置文件和文档
    """
    print(f"🚀 开始更新版本号至: {new_version}")

    updated_files = []
    
    # 1. 更新 backend/core/config.py (Source of Truth)
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
        
        config_pattern = r'app_version: str = "([\d\.]+)"'
        match = re.search(config_pattern, content)
        
        if not match:
            print(f"❌ 错误: 在 {CONFIG_FILE.name} 中未找到 app_version 定义")
            return False
            
        old_version = match.group(1)
        print(f"   当前版本: {old_version}")
        
        if old_version == new_version:
            print(f"   ⚠️ 版本号未变化，跳过 {CONFIG_FILE.name}")
        else:
            new_config_content = re.sub(config_pattern, f'app_version: str = "{new_version}"', content)
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                f.write(new_config_content)
            print(f"   ✅ 已更新 {CONFIG_FILE.name}")
            updated_files.append(CONFIG_FILE.name)

    except Exception as e:
        print(f"❌ 读取 {CONFIG_FILE.name} 失败: {e}")
        return False

    # 2. Helper function to update env files
    def update_env_file(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Match APP_VERSION=2.5.29
            pattern = r'APP_VERSION=([\d\.]+)'
            if re.search(pattern, content):
                new_content = re.sub(pattern, f'APP_VERSION={new_version}', content)
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"   ✅ 已更新 {file_path.name}")
                updated_files.append(file_path.name)
            else:
                print(f"   ⚠️ 在 {file_path.name} 中未找到 APP_VERSION，跳过")
        except Exception as e:
            print(f"❌ 更新 {file_path.name} 失败: {e}")

    # Update all env example files
    update_env_file(ENV_EXAMPLE_FILE)
    update_env_file(DOCKER_ENV_EXAMPLE)
    update_env_file(DEPLOYMENT_ENV_EXAMPLE)

    # 3. 更新 README.md
    try:
        with open(README_FILE, 'r', encoding='utf-8') as f:
            readme_content = f.read()
        
        table_pattern = r'(\|\s*\|\s*`APP_VERSION`\s*\|\s*系统版本\s*\|\s*)([\d\.]+)(\s*\|)'
        if re.search(table_pattern, readme_content):
            readme_content = re.sub(table_pattern, f'\\g<1>{new_version}\\g<3>', readme_content)
            with open(README_FILE, 'w', encoding='utf-8') as f:
                f.write(readme_content)
            print(f"   ✅ 已更新 {README_FILE.name}")
            updated_files.append(README_FILE.name)
        else:
            print(f"   ⚠️ 在 {README_FILE.name} 中未找到版本号配置表格，跳过")
    except Exception as e:
        print(f"❌ 更新 {README_FILE.name} 失败: {e}")

    # 4. 更新 deployment/使用说明.md
    try:
        with open(USAGE_FILE, 'r', encoding='utf-8') as f:
            usage_content = f.read()
        
        # Replace jeje_webos_vX.Y.Z.tar
        usage_content = re.sub(r'jeje_webos_v[\d\.]+\.tar', f'jeje_webos_v{new_version}.tar', usage_content)
        # Replace jeje_webos:vX.Y.Z
        usage_content = re.sub(r'jeje_webos:v[\d\.]+', f'jeje_webos:v{new_version}', usage_content)
        # Replace (vX.Y.Z) in title
        usage_content = re.sub(r'\(v[\d\.]+\)', f'(v{new_version})', usage_content)
        
        with open(USAGE_FILE, 'w', encoding='utf-8') as f:
            f.write(usage_content)
        print(f"   ✅ 已更新 {USAGE_FILE.name}")
        updated_files.append(USAGE_FILE.name)
    except Exception as e:
        print(f"❌ 更新 {USAGE_FILE.name} 失败: {e}")

    # 5. Check Changelog

    try:
        with open(CHANGELOG_FILE, 'r', encoding='utf-8') as f:
            changelog_head = f.read(500)
            
        if new_version not in changelog_head:
            print(f"\n📝 提示: {CHANGELOG_FILE.name} 中似乎还没有包含 v{new_version} 的记录。")
            print(f"   请记得在 {CHANGELOG_FILE.name} 顶部添加更新日志。")
        else:
             print(f"   ✅ {CHANGELOG_FILE.name} 中已包含 v{new_version} 的记录")

    except Exception as e:
        pass

    if updated_files:
        print("\n✨ 版本更新完成！")
        return True
    else:
        print("\n⚠️ 没有文件被更改 (可能是版本号相同)。")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python scripts/update_version.py <新版本号>")
        print("示例: python scripts/update_version.py 2.6.0")
        sys.exit(1)
    
    new_ver = sys.argv[1]
    
    # 简单的版本号格式校验
    if not re.match(r'^\d+\.\d+\.\d+$', new_ver):
        print("❌ 错误: 版本号格式必须为 x.y.z (例如 2.5.30)")
        sys.exit(1)

    if not update_version(new_ver):
        sys.exit(1)

#!/usr/bin/env python3
"""
cTrader OAuth 认证工具

使用步骤：
1. 运行此脚本
2. 访问打印的 URL
3. 授权后会跳转到 http://localhost:8096/callback?code=xxx
4. 复制 code 参数
5. 脚本会自动获取 access_token 和 account_id
6. 更新 .env 文件
"""

import os
import sys
from pathlib import Path

# 添加 runtime 到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "runtime"))

import requests
from urllib.parse import urlencode

# cTrader OAuth 配置
CLIENT_ID = "22422_P3tUUQJNaDhrkZBcNpZT2icVOwiWGp2aXnThg4WVn92lXvakUp"
CLIENT_SECRET = "xbmOJYV7c2SBBDQKkU1cvNBoAp99wYlSYMTvnRWmT2HZc9u99I"
REDIRECT_URI = "http://localhost:8096/callback"
AUTH_URL = "https://openapi.ctrader.com/apps/auth"
TOKEN_URL = "https://openapi.ctrader.com/apps/token"


def get_auth_url():
    """生成授权 URL"""
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": "trading",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def get_access_token(code: str):
    """使用 code 获取 access_token"""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    response = requests.post(TOKEN_URL, data=data)
    response.raise_for_status()

    return response.json()


def get_accounts(access_token: str):
    """获取账户列表"""
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    response = requests.get(
        "https://demo.ctraderapi.com/v2/accounts",
        headers=headers
    )
    response.raise_for_status()

    return response.json()


def update_env_file(access_token: str, account_id: str):
    """更新 .env 文件"""
    env_path = Path(__file__).parent.parent / "config" / ".env"

    if not env_path.exists():
        print(f"错误：找不到 .env 文件: {env_path}")
        return

    # 读取现有内容
    with open(env_path, "r") as f:
        lines = f.readlines()

    # 更新配置
    updated = False
    for i, line in enumerate(lines):
        if line.startswith("AB_PATROL_CTRADER_ACCESS_TOKEN="):
            lines[i] = f"AB_PATROL_CTRADER_ACCESS_TOKEN={access_token}\n"
            updated = True
        elif line.startswith("AB_PATROL_CTRADER_ACCOUNT_ID="):
            lines[i] = f"AB_PATROL_CTRADER_ACCOUNT_ID={account_id}\n"
            updated = True

    # 写回文件
    with open(env_path, "w") as f:
        f.writelines(lines)

    print(f"✅ 已更新 .env 文件: {env_path}")


def main():
    print("=" * 70)
    print("cTrader OAuth 认证工具")
    print("=" * 70)
    print()

    # 步骤 1：生成授权 URL
    auth_url = get_auth_url()
    print("步骤 1：访问以下 URL 进行授权")
    print()
    print(auth_url)
    print()
    print("授权后会跳转到：http://localhost:8096/callback?code=xxx")
    print()

    # 步骤 2：输入 code
    code = input("请输入 code 参数: ").strip()

    if not code:
        print("错误：code 不能为空")
        return

    print()
    print("步骤 2：获取 access_token...")

    try:
        token_response = get_access_token(code)
        access_token = token_response.get("access_token")

        if not access_token:
            print(f"错误：无法获取 access_token: {token_response}")
            return

        print(f"✅ access_token: {access_token[:20]}...")
        print()

        # 步骤 3：获取账户列表
        print("步骤 3：获取账户列表...")
        accounts = get_accounts(access_token)

        if not accounts:
            print("错误：没有找到账户")
            return

        print(f"找到 {len(accounts)} 个账户：")
        for i, account in enumerate(accounts):
            account_id = account.get("accountId", "")
            account_type = account.get("accountType", "")
            balance = account.get("balance", 0)
            print(f"  {i+1}. ID={account_id}, Type={account_type}, Balance={balance}")

        print()

        # 选择账户
        if len(accounts) == 1:
            selected_account = accounts[0]
        else:
            choice = input(f"请选择账户 (1-{len(accounts)}): ").strip()
            try:
                idx = int(choice) - 1
                selected_account = accounts[idx]
            except:
                print("错误：无效的选择")
                return

        account_id = selected_account.get("accountId", "")
        print(f"✅ 选择账户: {account_id}")
        print()

        # 步骤 4：更新 .env 文件
        print("步骤 4：更新 .env 文件...")
        update_env_file(access_token, account_id)
        print()

        print("=" * 70)
        print("✅ 配置完成！")
        print("=" * 70)
        print()
        print("现在可以使用 cTrader 交易所了：")
        print("  export AB_PATROL_EXCHANGE=ctrader")
        print("  python runtime/pa_runtime.py")
        print()

    except Exception as e:
        print(f"错误：{e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

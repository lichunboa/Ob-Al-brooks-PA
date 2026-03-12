#!/usr/bin/env python3
"""
cTrader OAuth 回调服务器

运行此脚本，然后访问授权 URL，授权后会自动获取 access_token
"""

import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import requests
from _bootstrap import ensure_agent_root_on_path

CLIENT_ID = "22422_P3tUUQJNaDhrkZBcNpZT2icVOwiWGp2aXnThg4WVn92lXvakUp"
CLIENT_SECRET = "xbmOJYV7c2SBBDQKkU1cvNBoAp99wYlSYMTvnRWmT2HZc9u99I"
REDIRECT_URI = "http://localhost:8096/callback"
TOKEN_URL = "https://openapi.ctrader.com/apps/token"
ROOT = ensure_agent_root_on_path()

access_token = None
account_id = None


class CallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 禁用日志输出

    def do_GET(self):
        global access_token, account_id

        parsed = urlparse(self.path)
        if parsed.path == "/callback":
            params = parse_qs(parsed.query)
            code = params.get("code", [None])[0]

            if code:
                print("\n✅ 收到授权码")

                # 获取 access_token
                data = {
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": REDIRECT_URI,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                }

                try:
                    response = requests.post(TOKEN_URL, data=data, timeout=10)
                    if response.status_code == 200:
                        token_data = response.json()
                        if "access_token" in token_data:
                            access_token = token_data["access_token"]
                            print("✅ access_token 获取成功")

                            # 获取账户列表
                            headers = {"Authorization": f"Bearer {access_token}"}
                            accounts_response = requests.get(
                                "https://demo.ctraderapi.com/v2/accounts",
                                headers=headers,
                                timeout=10
                            )

                            if accounts_response.status_code == 200:
                                accounts = accounts_response.json()
                                if accounts:
                                    account_id = accounts[0].get("accountId")
                                    print(f"✅ 账户 ID: {account_id}")

                                    # 返回成功页面
                                    self.send_response(200)
                                    self.send_header("Content-type", "text/html")
                                    self.end_headers()
                                    self.wfile.write(b"""
                                    <html>
                                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                                        <h1 style="color: green;">&#x2713; Authorization Successful!</h1>
                                        <p>You can close this window now.</p>
                                    </body>
                                    </html>
                                    """)
                                    return
                        else:
                            print(f"❌ 响应中没有 access_token: {token_data}")
                    else:
                        print(f"❌ 获取 token 失败: {response.text}")
                except Exception as e:
                    print(f"❌ 请求失败: {e}")

            # 返回错误页面
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: red;">&#x2717; Authorization Failed</h1>
                <p>Please try again.</p>
            </body>
            </html>
            """)


def main():
    print("=" * 70)
    print("cTrader OAuth 回调服务器")
    print("=" * 70)
    print()
    print("步骤 1: 启动回调服务器...")

    server = HTTPServer(("localhost", 8096), CallbackHandler)
    print("✅ 服务器已启动: http://localhost:8096")
    print()
    print("步骤 2: 访问以下 URL 进行授权:")
    print()
    auth_url = f"https://openapi.ctrader.com/apps/auth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=trading"
    print(auth_url)
    print()
    print("等待授权...")
    print()

    # 等待回调
    while access_token is None:
        server.handle_request()

    print()
    print("=" * 70)
    print("✅ 配置完成！")
    print("=" * 70)
    print()
    print(f"access_token: {access_token}")
    print(f"account_id: {account_id}")
    print()

    # 更新 .env 文件
    try:
        env_path = ROOT / "config" / ".env"

        if env_path.exists():
            with open(env_path) as f:
                lines = f.readlines()

            for i, line in enumerate(lines):
                if line.startswith("AB_PATROL_CTRADER_ACCESS_TOKEN="):
                    lines[i] = f"AB_PATROL_CTRADER_ACCESS_TOKEN={access_token}\n"
                elif line.startswith("AB_PATROL_CTRADER_ACCOUNT_ID="):
                    lines[i] = f"AB_PATROL_CTRADER_ACCOUNT_ID={account_id}\n"

            with open(env_path, "w") as f:
                f.writelines(lines)

            print(f"✅ 已更新 .env 文件: {env_path}")
        else:
            print(f"⚠️  找不到 .env 文件: {env_path}")
            print("请手动添加以下配置:")
            print(f"AB_PATROL_CTRADER_ACCESS_TOKEN={access_token}")
            print(f"AB_PATROL_CTRADER_ACCOUNT_ID={account_id}")
    except Exception as e:
        print(f"⚠️  更新 .env 失败: {e}")
        print("请手动添加以下配置:")
        print(f"AB_PATROL_CTRADER_ACCESS_TOKEN={access_token}")
        print(f"AB_PATROL_CTRADER_ACCOUNT_ID={account_id}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ 用户取消")
        sys.exit(1)

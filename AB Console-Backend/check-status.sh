#!/bin/bash
echo "=== 服务状态检查 ==="
echo ""
echo "Python 进程:"
ps aux | grep -E "python" | grep -E "(telegram|signal|data|trading)" | grep -v grep || echo "无 Python 服务运行"
echo ""
echo "Clawdbot:"
ps aux | grep clawdbot | grep -v grep || echo "Clawdbot 未运行"
echo ""
echo "端口监听:"
python3 -c "
import socket
for port in [8089, 8090, 18789]:
    try:
        s = socket.socket()
        s.settimeout(1)
        r = s.connect_ex(('127.0.0.1', port))
        s.close()
        status = '开放' if r == 0 else '关闭'
        print(f'  Port {port}: {status}')
    except:
        print(f'  Port {port}: 未知')
"
echo ""
echo "日志文件:"
ls -lt services/*/ *.log 2>/dev/null | head -5 || echo "无日志文件"

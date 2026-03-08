"""
回测 API 服务器 — 为 Web Dashboard 提供回测接口

端口: 8093

API:
  GET  /health              — 健康检查
  GET  /jobs                — 获取所有回测任务
  GET  /jobs/:id            — 获取任务详情/结果
  POST /run                 — 启动回测任务
  DELETE /jobs/:id          — 删除任务

用法:
  python -m libs.backtest.api_server
  # 或
  python -m libs.backtest.api_server --port 8093
"""

import json
import logging
import os
import sys
import threading
import time
import uuid
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)

# 结果存储目录
RESULTS_DIR = Path(__file__).parent.parent.parent / "data" / "backtest_results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


class BacktestJob:
    """回测任务"""

    def __init__(self, job_id: str, config: dict):
        self.job_id = job_id
        self.config = config
        self.status = "pending"  # pending / running / completed / failed
        self.progress = 0
        self.created_at = datetime.now().isoformat()
        self.started_at = None
        self.completed_at = None
        self.result = None
        self.error = None

    def to_dict(self) -> dict:
        d = {
            "job_id": self.job_id,
            "config": self.config,
            "status": self.status,
            "progress": self.progress,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }
        if self.error:
            d["error"] = self.error
        if self.result and self.status == "completed":
            d["result"] = self.result
        return d


# 全局任务注册表
_jobs: dict[str, BacktestJob] = {}
_jobs_lock = threading.Lock()


def _load_saved_jobs():
    """启动时加载已保存的结果"""
    for f in RESULTS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            job_id = f.stem
            job = BacktestJob(job_id, data.get("config", {}))
            job.status = "completed"
            job.created_at = data.get("created_at", "")
            job.completed_at = data.get("completed_at", "")
            job.result = data.get("result", {})
            _jobs[job_id] = job
        except Exception:
            continue


def _run_backtest(job: BacktestJob):
    """在后台线程中运行回测"""
    try:
        job.status = "running"
        job.started_at = datetime.now().isoformat()

        # 确保路径
        backend_root = Path(__file__).parent.parent.parent
        if str(backend_root) not in sys.path:
            sys.path.insert(0, str(backend_root))

        from libs.backtest.runner import BacktestRunner, BacktestConfig

        cfg = BacktestConfig(
            symbols=job.config.get("symbols", ["BTCUSDT"]),
            timeframes=job.config.get("timeframes", ["5m"]),
            days=job.config.get("days", 30),
            start_date=job.config.get("start_date"),
            end_date=job.config.get("end_date"),
            threshold=job.config.get("threshold", 80),
            max_holding_bars=job.config.get("max_holding_bars", 48),
            fee_rate=job.config.get("fee_rate", 0.0004),
            verbose=False,
        )

        runner = BacktestRunner(cfg)
        result = runner.run()

        # 转换结果
        result_dict = json.loads(result.to_json())
        job.result = result_dict
        job.status = "completed"
        job.completed_at = datetime.now().isoformat()

        # 持久化到文件
        save_data = {
            "config": job.config,
            "result": result_dict,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }
        result_file = RESULTS_DIR / f"{job.job_id}.json"
        result_file.write_text(json.dumps(save_data, ensure_ascii=False, indent=2, default=str))
        logger.info(f"回测完成: {job.job_id}")

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.completed_at = datetime.now().isoformat()
        logger.error(f"回测失败: {job.job_id} - {e}", exc_info=True)


class BacktestAPIHandler(BaseHTTPRequestHandler):
    """回测 API 请求处理器"""

    def log_message(self, format, *args):
        logger.debug(f"API: {args[0] if args else ''}")

    def do_OPTIONS(self):
        """处理 CORS 预检"""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/jobs":
            self._handle_list_jobs()
        elif path.startswith("/jobs/"):
            job_id = path.split("/jobs/")[1]
            self._handle_get_job(job_id)
        else:
            self._send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/run":
            self._handle_run()
        else:
            self._send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path.startswith("/jobs/"):
            job_id = path.split("/jobs/")[1]
            self._handle_delete_job(job_id)
        else:
            self._send_error(404, "Not Found")

    def _handle_health(self):
        running = sum(1 for j in _jobs.values() if j.status == "running")
        completed = sum(1 for j in _jobs.values() if j.status == "completed")
        self._send_json({
            "status": "healthy",
            "service": "backtest-service",
            "running_jobs": running,
            "completed_jobs": completed,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    def _handle_list_jobs(self):
        with _jobs_lock:
            jobs = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
            # 列表不包含完整 result（太大），只返回摘要
            items = []
            for j in jobs[:50]:  # 最近 50 个
                d = j.to_dict()
                if "result" in d and d["result"]:
                    d["result_summary"] = {
                        "total_trades": d["result"].get("summary", {}).get("total_trades", 0),
                        "win_rate": d["result"].get("summary", {}).get("win_rate", 0),
                        "total_pnl": d["result"].get("summary", {}).get("total_pnl", 0),
                    }
                    del d["result"]
                items.append(d)
        self._send_json({"jobs": items})

    def _handle_get_job(self, job_id: str):
        with _jobs_lock:
            job = _jobs.get(job_id)
        if not job:
            self._send_error(404, f"Job {job_id} not found")
            return
        self._send_json(job.to_dict())

    def _handle_run(self):
        # 读取请求体
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            config = json.loads(body)
        except json.JSONDecodeError:
            self._send_error(400, "Invalid JSON")
            return

        # 检查是否有正在运行的任务
        with _jobs_lock:
            running = [j for j in _jobs.values() if j.status == "running"]
            if len(running) >= 2:
                self._send_error(429, "已有 2 个回测任务在运行，请等待完成")
                return

        # 创建任务
        job_id = datetime.now().strftime("%y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
        job = BacktestJob(job_id, config)

        with _jobs_lock:
            _jobs[job_id] = job

        # 后台线程运行
        thread = threading.Thread(target=_run_backtest, args=(job,), daemon=True)
        thread.start()

        self._send_json({"job_id": job_id, "status": "pending"}, status_code=202)

    def _handle_delete_job(self, job_id: str):
        with _jobs_lock:
            job = _jobs.get(job_id)
            if not job:
                self._send_error(404, f"Job {job_id} not found")
                return
            if job.status == "running":
                self._send_error(409, "无法删除运行中的任务")
                return
            del _jobs[job_id]

        # 删除文件
        result_file = RESULTS_DIR / f"{job_id}.json"
        if result_file.exists():
            result_file.unlink()

        self._send_json({"deleted": job_id})

    def _send_json(self, data: dict, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, default=str).encode())

    def _send_error(self, status_code: int, message: str):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def start_server(port: int = 8093, host: str = "0.0.0.0"):
    """启动回测 API 服务器"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # 加载已保存的结果
    _load_saved_jobs()
    logger.info(f"已加载 {len(_jobs)} 个历史回测结果")

    server = HTTPServer((host, port), BacktestAPIHandler)
    logger.info(f"回测 API 服务器启动: http://{host}:{port}")
    logger.info(f"  GET  /health    — 健康检查")
    logger.info(f"  GET  /jobs      — 任务列表")
    logger.info(f"  POST /run       — 启动回测")
    logger.info(f"  GET  /jobs/:id  — 任务详情")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("服务器停止")
        server.shutdown()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="回测 API 服务器")
    parser.add_argument("--port", type=int, default=8093)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()
    start_server(port=args.port, host=args.host)

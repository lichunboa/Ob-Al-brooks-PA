"""
入口: python -m src

ai-service 作为 telegram-service 的子模块运行，
此入口仅用于独立测试和调试。

用法:
    cd services/ai-service
    python -m src --test              # 测试配置
    python -m src --list-prompts      # 列出可用提示词
    python -m src --analyze BTCUSDT   # 测试分析（需配置 LLM）
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

SRC_DIR = Path(__file__).parent
PROJECT_ROOT = SRC_DIR.parent
REPO_ROOT = PROJECT_ROOT.parent.parent

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="AI Service for TradeCat")
    parser.add_argument("--test", action="store_true", help="测试配置")
    parser.add_argument("--list-prompts", action="store_true", help="列出可用提示词")
    parser.add_argument("--analyze", type=str, metavar="SYMBOL", help="测试分析指定币种")
    parser.add_argument("--interval", type=str, default="4h", help="分析周期 (默认 4h)")
    parser.add_argument("--prompt", type=str, default="市场全局解析", help="提示词名称 (默认 市场全局解析)")
    args = parser.parse_args()

    if args.test:
        from config import PROJECT_ROOT as cfg_root
        logger.info("=== AI Service 配置测试 ===")
        logger.info("  PROJECT_ROOT: %s", cfg_root)
        logger.info("  REPO_ROOT: %s", REPO_ROOT)

        try:
            from prompt import PromptRegistry
            registry = PromptRegistry()
            logger.info("  提示词数量: %d", len(registry.list_prompts()))
            logger.info("✅ 配置测试通过")
        except Exception as e:
            logger.error("❌ 配置测试失败: %s", e)
            sys.exit(1)

    elif args.list_prompts:
        from prompt import PromptRegistry
        registry = PromptRegistry()
        prompts = registry.list_prompts()
        logger.info("=== 可用提示词 (%d) ===", len(prompts))
        for name in prompts:
            logger.info("  - %s", name)

    elif args.analyze:
        from pipeline import run_analysis
        symbol = args.analyze.upper()
        if not symbol.endswith("USDT"):
            symbol += "USDT"

        logger.info("=== 分析 %s (%s) ===", symbol, args.interval)

        async def _run():
            result = await run_analysis(symbol, args.interval, args.prompt)
            if result:
                print("\n" + "=" * 60)
                print(result)
                print("=" * 60)
            else:
                logger.error("分析失败")

        asyncio.run(_run())

    else:
        logger.info("ai-service 作为 telegram-service 子模块运行")
        logger.info("独立测试用法:")
        logger.info("  python -m src --test")
        logger.info("  python -m src --list-prompts")
        import time
        logger.info("  python -m src --analyze BTCUSDT")
        
        # Keep container alive
        logger.info("AI Service 已启动，处于待命状态。(如需执行任务，请在 telegram-service 中调用)")
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()

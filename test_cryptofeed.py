from cryptofeed import FeedHandler
from cryptofeed.exchanges import BinanceFutures
from cryptofeed.defines import TICKER, L2_BOOK
import os

print(f"HTTP_PROXY: {os.environ.get('HTTP_PROXY')}")
print(f"HTTPS_PROXY: {os.environ.get('HTTPS_PROXY')}")

async def ticker(t, receipt_timestamp):
    print(f'Ticker received: {t}')

def main():
    fh = FeedHandler()
    fh.add_feed(BinanceFutures(symbols=['BTCUSDT'], channels=[TICKER], callbacks={TICKER: ticker}))
    print("Starting feedhandler...")
    fh.run()

if __name__ == '__main__':
    main()

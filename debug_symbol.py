from cryptofeed.defines import PERPETUAL
from cryptofeed.symbols import Symbol

s = Symbol("BTC", "USDT", type=PERPETUAL)
print(f"Normalized: '{s.normalized}'")

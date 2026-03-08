#!/usr/bin/env python3
"""OKX Trading Module for Claude PA Trader
Demo account trading via OKX API v5.
Usage:
    python3 okx_trader.py positions
    python3 okx_trader.py balance
    python3 okx_trader.py order BTCUSDT buy 10 125 --sl 60000 --tp 70000
    python3 okx_trader.py close BTCUSDT
    python3 okx_trader.py instrument BTCUSDT
    python3 okx_trader.py calc-size BTCUSDT 67000 66500 45
    python3 okx_trader.py init
"""

import hmac, hashlib, base64, json, sys, os
from datetime import datetime, timezone
import requests

BASE_URL = "https://www.okx.com"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, '..', 'data', 'pa_trader', 'okx_config.json')

SYMBOL_MAP = {
    'BTCUSDT': 'BTC-USDT-SWAP',
    'ETHUSDT': 'ETH-USDT-SWAP',
    'SOLUSDT': 'SOL-USDT-SWAP',
    'BNBUSDT': 'BNB-USDT-SWAP',
    'DOGEUSDT': 'DOGE-USDT-SWAP',
    'AAVEUSDT': 'AAVE-USDT-SWAP',
    'ADAUSDT': 'ADA-USDT-SWAP',
    'AVAXUSDT': 'AVAX-USDT-SWAP',
}

def to_okx(sym):
    """BTCUSDT -> BTC-USDT-SWAP"""
    sym = sym.replace(':USDT', '')
    if sym in SYMBOL_MAP:
        return SYMBOL_MAP[sym]
    base = sym.replace('USDT', '')
    return f"{base}-USDT-SWAP"

def to_std(okx_sym):
    """BTC-USDT-SWAP -> BTCUSDT"""
    return okx_sym.split('-')[0] + 'USDT'


class OKXTrader:
    def __init__(self, config_path=CONFIG_PATH):
        with open(config_path) as f:
            cfg = json.load(f)
        self.api_key = cfg['apiKey']
        self.secret_key = cfg['secretKey']
        self.passphrase = cfg['passphrase']
        self.demo = cfg.get('demo', True)

    def _timestamp(self):
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

    def _sign(self, timestamp, method, path, body=''):
        msg = timestamp + method.upper() + path + body
        mac = hmac.new(self.secret_key.encode(), msg.encode(), hashlib.sha256)
        return base64.b64encode(mac.digest()).decode()

    def _headers(self, method, path, body=''):
        ts = self._timestamp()
        sig = self._sign(ts, method, path, body)
        h = {
            'OK-ACCESS-KEY': self.api_key,
            'OK-ACCESS-SIGN': sig,
            'OK-ACCESS-TIMESTAMP': ts,
            'OK-ACCESS-PASSPHRASE': self.passphrase,
            'Content-Type': 'application/json',
        }
        if self.demo:
            h['x-simulated-trading'] = '1'
        return h

    def _get(self, path, params=None):
        if params:
            qs = '&'.join(f'{k}={v}' for k, v in params.items() if v is not None)
            full_path = f'{path}?{qs}' if qs else path
        else:
            full_path = path
        headers = self._headers('GET', full_path)
        r = requests.get(f'{BASE_URL}{full_path}', headers=headers, timeout=30)
        return r.json()

    def _post(self, path, body=None):
        body_str = json.dumps(body) if body else ''
        headers = self._headers('POST', path, body_str)
        r = requests.post(f'{BASE_URL}{path}', headers=headers, data=body_str, timeout=30)
        return r.json()

    # ── Account ──────────────────────────────────────────

    def get_balance(self):
        result = self._get('/api/v5/account/balance')
        if result.get('code') == '0' and result['data']:
            data = result['data'][0]
            usdt = next((d for d in data.get('details', []) if d['ccy'] == 'USDT'), {})
            return {
                'total_equity': float(data.get('totalEq', 0)),
                'available': float(usdt.get('availBal', 0)),
                'usdt_equity': float(usdt.get('eq', 0)),
            }
        return {'error': result.get('msg', 'unknown'), 'code': result.get('code')}

    def get_positions(self):
        result = self._get('/api/v5/account/positions', {'instType': 'SWAP'})
        if result.get('code') == '0':
            positions = []
            for p in result['data']:
                pos = float(p.get('pos', '0'))
                if pos == 0:
                    continue
                positions.append({
                    'symbol': to_std(p['instId']),
                    'instId': p['instId'],
                    'side': 'LONG' if pos > 0 else 'SHORT',
                    'contracts': abs(pos),
                    'entry_price': float(p.get('avgPx', 0) or 0),
                    'mark_price': float(p.get('markPx', 0) or 0),
                    'unrealized_pnl': float(p.get('upl', 0) or 0),
                    'leverage': p.get('lever', '?'),
                    'liq_price': p.get('liqPx', None),
                    'margin_mode': p.get('mgnMode', '?'),
                })
            return positions
        return {'error': result.get('msg', 'unknown'), 'code': result.get('code')}

    # ── Trading ──────────────────────────────────────────

    def set_leverage(self, symbol, leverage, mgn_mode='cross'):
        return self._post('/api/v5/account/set-leverage', {
            'instId': to_okx(symbol),
            'lever': str(leverage),
            'mgnMode': mgn_mode,
        })

    def set_position_mode(self, mode='net_mode'):
        """Set position mode: net_mode or long_short_mode"""
        return self._post('/api/v5/account/set-position-mode', {
            'posMode': mode,
        })

    def place_order(self, symbol, side, size, leverage=125, sl=None, tp=None):
        """Place market order with optional SL/TP.
        size = number of contracts (use calc_size to convert from USDT risk)
        """
        inst_id = to_okx(symbol)
        # Set leverage first
        self.set_leverage(symbol, leverage, 'cross')

        body = {
            'instId': inst_id,
            'tdMode': 'cross',
            'side': side.lower(),
            'ordType': 'market',
            'sz': str(size),
        }

        # OKX v5 requires SL/TP via attachAlgoOrds
        if sl or tp:
            algo = {}
            if sl:
                algo['slTriggerPx'] = str(sl)
                algo['slOrdPx'] = '-1'
            if tp:
                algo['tpTriggerPx'] = str(tp)
                algo['tpOrdPx'] = '-1'
            body['attachAlgoOrds'] = [algo]

        result = self._post('/api/v5/trade/order', body)
        return result

    def close_position(self, symbol, mgn_mode='cross'):
        """Close entire position for a symbol"""
        return self._post('/api/v5/trade/close-position', {
            'instId': to_okx(symbol),
            'mgnMode': mgn_mode,
        })

    def place_algo_order(self, symbol, side, size, trigger_px, ord_px='-1', algo_type='conditional'):
        """Place standalone SL/TP algo order"""
        return self._post('/api/v5/trade/order-algo', {
            'instId': to_okx(symbol),
            'tdMode': 'cross',
            'side': side.lower(),
            'ordType': algo_type,
            'sz': str(int(size)),
            'slTriggerPx': str(trigger_px),
            'slOrdPx': str(ord_px),
        })

    def cancel_algo_orders(self, symbol):
        """Cancel all algo orders for a symbol"""
        # First get algo orders
        result = self._get('/api/v5/trade/orders-algo-pending', {
            'instType': 'SWAP',
            'instId': to_okx(symbol),
        })
        if result.get('code') == '0' and result['data']:
            algo_ids = [{'instId': to_okx(symbol), 'algoId': o['algoId']} for o in result['data']]
            if algo_ids:
                return self._post('/api/v5/trade/cancel-algos', algo_ids)
        return {'code': '0', 'msg': 'no algo orders to cancel'}

    def modify_sl(self, symbol, new_sl):
        """Modify stop loss by canceling existing and placing new"""
        # Cancel existing algo orders
        self.cancel_algo_orders(symbol)
        # Get current position to determine side and size
        positions = self.get_positions()
        if isinstance(positions, list):
            pos = next((p for p in positions if p['symbol'] == symbol.replace(':USDT', '')), None)
            if pos:
                close_side = 'sell' if pos['side'] == 'LONG' else 'buy'
                return self.place_algo_order(symbol, close_side, pos['contracts'], new_sl)
        return {'error': 'no position found'}

    # ── Info ─────────────────────────────────────────────

    def get_instrument(self, symbol):
        """Get instrument info (contract size, min size, tick size)"""
        inst_id = to_okx(symbol)
        result = self._get('/api/v5/public/instruments', {
            'instType': 'SWAP',
            'instId': inst_id,
        })
        if result.get('code') == '0' and result['data']:
            d = result['data'][0]
            return {
                'instId': d['instId'],
                'ctVal': float(d.get('ctVal', 1)),
                'minSz': d.get('minSz', '1'),
                'lotSz': d.get('lotSz', '1'),
                'tickSz': d.get('tickSz', '0.1'),
                'ctType': d.get('ctType', '?'),
            }
        return {'error': result.get('msg', 'unknown')}

    def get_klines(self, symbol, bar='5m', limit=30):
        """Fetch OHLCV candles from OKX real market data.
        bar: 1m/3m/5m/15m/30m/1H/4H
        Returns list of {time, O, H, L, C, vol} dicts
        """
        inst_id = to_okx(symbol)
        okx_bar = bar.replace('m', 'm').replace('h', 'H').replace('1H', '1H')
        result = self._get('/api/v5/market/candles', {
            'instId': inst_id,
            'bar': okx_bar,
            'limit': str(limit),
        })
        if result.get('code') != '0':
            return {'error': result.get('msg', 'unknown'), 'symbol': symbol}
        candles = []
        for row in reversed(result['data']):  # OKX returns newest first
            ts, o, h, l, c, vol = int(row[0]), float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5])
            from datetime import datetime, timezone
            time_str = datetime.fromtimestamp(ts/1000, tz=timezone.utc).strftime('%H:%M')
            candles.append({'time': time_str, 'O': o, 'H': h, 'L': l, 'C': c, 'vol': vol})
        return candles

    def calc_size(self, symbol, entry_price, stop_loss, risk_usdt):
        """Calculate number of contracts from USDT risk amount.
        risk_usdt = account_balance * risk_percent
        """
        info = self.get_instrument(symbol)
        if 'error' in info:
            return info
        ct_val = info['ctVal']
        risk_per_contract = abs(entry_price - stop_loss) * ct_val
        if risk_per_contract <= 0:
            return {'error': 'invalid entry/sl'}
        raw_contracts = risk_usdt / risk_per_contract
        lot_sz = float(info['lotSz'])
        min_sz = float(info['minSz'])
        # Round down to lot size
        contracts = max(min_sz, int(raw_contracts / lot_sz) * lot_sz)
        return {
            'contracts': contracts,
            'ct_val': ct_val,
            'risk_per_contract': round(risk_per_contract, 4),
            'total_risk': round(contracts * risk_per_contract, 2),
            'notional': round(contracts * ct_val * entry_price, 2),
        }


# ── CLI ──────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: okx_trader.py <positions|balance|order|close|instrument|calc-size|modify-sl|init>'}))
        sys.exit(1)

    cmd = sys.argv[1]
    trader = OKXTrader()

    if cmd == 'init':
        r = trader.set_position_mode('net_mode')
        print(json.dumps(r, indent=2))

    elif cmd == 'positions':
        print(json.dumps(trader.get_positions(), indent=2))

    elif cmd == 'balance':
        print(json.dumps(trader.get_balance(), indent=2))

    elif cmd == 'order':
        # order BTCUSDT buy 10 [125] [--sl X] [--tp X]
        if len(sys.argv) < 5:
            print(json.dumps({'error': 'Usage: order SYMBOL SIDE SIZE [LEVERAGE] [--sl SL] [--tp TP]'}))
            sys.exit(1)
        symbol, side, size = sys.argv[2], sys.argv[3], sys.argv[4]
        leverage = 125
        if len(sys.argv) > 5 and not sys.argv[5].startswith('-'):
            leverage = int(sys.argv[5])
        sl = tp = None
        for i, arg in enumerate(sys.argv):
            if arg == '--sl' and i + 1 < len(sys.argv):
                sl = float(sys.argv[i + 1])
            if arg == '--tp' and i + 1 < len(sys.argv):
                tp = float(sys.argv[i + 1])
        result = trader.place_order(symbol, side, size, leverage, sl, tp)
        print(json.dumps(result, indent=2))

    elif cmd == 'close':
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Usage: close SYMBOL'}))
            sys.exit(1)
        print(json.dumps(trader.close_position(sys.argv[2]), indent=2))

    elif cmd == 'modify-sl':
        # modify-sl BTCUSDT 66000
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'Usage: modify-sl SYMBOL NEW_SL'}))
            sys.exit(1)
        print(json.dumps(trader.modify_sl(sys.argv[2], float(sys.argv[3])), indent=2))

    elif cmd == 'instrument':
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Usage: instrument SYMBOL'}))
            sys.exit(1)
        print(json.dumps(trader.get_instrument(sys.argv[2]), indent=2))

    elif cmd == 'calc-size':
        # calc-size BTCUSDT 67000 66500 45
        if len(sys.argv) < 6:
            print(json.dumps({'error': 'Usage: calc-size SYMBOL ENTRY SL RISK_USDT'}))
            sys.exit(1)
        result = trader.calc_size(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]))
        print(json.dumps(result, indent=2))

    elif cmd == 'leverage':
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'Usage: leverage SYMBOL LEVER'}))
            sys.exit(1)
        print(json.dumps(trader.set_leverage(sys.argv[2], sys.argv[3]), indent=2))

    elif cmd == 'klines':
        # klines BTCUSDT 5m [limit]
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'Usage: klines SYMBOL BAR [LIMIT]'}))
            sys.exit(1)
        limit = int(sys.argv[4]) if len(sys.argv) > 4 else 30
        result = trader.get_klines(sys.argv[2], sys.argv[3], limit)
        print(json.dumps(result))

    else:
        print(json.dumps({'error': f'Unknown command: {cmd}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()

"""
Screener Dispatcher — main entry point for GitHub Actions.
Routes based on payload (market, logic, timeframe, params).
Loads stock lists, executes appropriate screener, formats output.
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
import argparse

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from screeners.breakout_screener import BreakoutScreener
from screeners.pullback_screener import PullbackScreener
from screeners.telegram_notifier import (
    send_telegram_message,
    build_breakout_telegram_message,
    build_pullback_telegram_message,
)


def load_stock_list(market):
    """
    Load stock list from JSON file based on market.

    Returns:
        List of stock symbols with market suffix (e.g., ['SBIN.NS', 'INFY.NS'])
    """
    stock_file = BASE_DIR / 'stock_lists' / f"{market.lower()}_stocks.json"

    try:
        with stock_file.open('r') as f:
            data = json.load(f)

        default_suffixes = {'NSE': '.NS', 'BSE': '.BO'}
        suffix = data.get('suffix', default_suffixes.get(market.upper(), ''))
        stocks = data.get('stocks') or data.get(f'{market.lower()}_stocks', [])
        return [
            stock if not suffix or stock.endswith(suffix) else f"{stock}{suffix}"
            for stock in stocks
        ]

    except FileNotFoundError:
        print(f"❌ Stock list file not found: {stock_file}")
        return []
    except Exception as e:
        print(f"❌ Error loading stock list: {e}")
        return []


def get_config(logic, timeframe, params):
    """
    Build configuration dictionary from payload params.

    Note: timeframe is passed as a direct constructor argument to the screener
    classes and is not needed inside config. It was previously duplicated here
    which was harmless but confusing — removed for clarity.
    """
    config = {
        'min_turnover': params.get('min_turnover', 10_000_000),
        'timeframe': timeframe,
    }

    if logic == 'breakout':
        config.update({
            'tolerance_below_avwap': params.get('tolerance_below_avwap', 0.05),
            'ceiling': params.get('ceiling', 0.10),
            'sustain_periods': params.get('sustain_periods', 3),
            'max_failed_attempts': params.get('max_failed_attempts', 2),
        })
    else:  # pullback
        config.update({
            'proximity_low_pct': params.get('proximity_low_pct', 0.0),
            'proximity_high_pct': params.get('proximity_high_pct', 2.0),
            'max_brief_crosses': params.get('max_brief_crosses', 5),
            'min_periods_old': params.get('min_periods_old', 20),
        })

    return config


def get_anchor_periods(logic, timeframe, params):
    """
    Get anchor periods from params, or fall back to sensible defaults.
    """
    if 'anchor_periods' in params and params['anchor_periods']:
        return params['anchor_periods']

    if timeframe == 'daily':
        return [180, 365, 550, 730, 900]
    elif timeframe == 'weekly':
        return [52, 104, 156, 208, 260]
    elif timeframe == 'monthly':
        return [12, 36, 60, 84, 120]

    return []


def save_csv(df, market, logic, timeframe):
    """
    Save results to CSV in results/ folder.

    Returns:
        Path to saved file, or None on error.
    """
    date_str = datetime.now().strftime('%d%b%Y').lower()
    filename = f"{market.lower()}_{logic}_{timeframe}_{date_str}.csv"

    results_dir = BASE_DIR / 'results'
    results_dir.mkdir(exist_ok=True)
    filepath = results_dir / filename

    try:
        df.to_csv(filepath, index=False)
        print(f"\n  ✔  CSV saved → {filepath}")
        return filepath
    except Exception as e:
        print(f"  ❌ Error saving CSV: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description='NSE Screener')
    parser.add_argument('--market', default='NSE')
    parser.add_argument('--logic', default='breakout')
    parser.add_argument('--timeframe', default='daily')
    parser.add_argument('--params', default='{}')
    parser.add_argument('--telegram-token', default=os.getenv('TELEGRAM_BOT_TOKEN'))
    parser.add_argument('--telegram-chat-id', default=os.getenv('TELEGRAM_CHAT_ID'))

    args = parser.parse_args()

    try:
        params = json.loads(args.params) if isinstance(args.params, str) else args.params
    except json.JSONDecodeError:
        params = {}

    if args.logic not in ['breakout', 'pullback']:
        print(f"❌ Invalid logic: {args.logic}")
        sys.exit(1)

    if args.timeframe not in ['daily', 'weekly', 'monthly']:
        print(f"❌ Invalid timeframe: {args.timeframe}")
        sys.exit(1)

    if args.market not in ['NSE', 'BSE', 'NASDAQ', 'NYSE']:
        print(f"❌ Invalid market: {args.market}")
        sys.exit(1)

    stocks = load_stock_list(args.market)
    if not stocks:
        print(f"❌ No stocks loaded for {args.market}")
        sys.exit(1)

    config = get_config(args.logic, args.timeframe, params)
    anchor_periods = get_anchor_periods(args.logic, args.timeframe, params)

    print(f"\n{'═'*60}")
    print(f"  SCREENER DISPATCHER")
    print(f"{'═'*60}")
    print(f"  Market:         {args.market}")
    print(f"  Logic:          {args.logic}")
    print(f"  Timeframe:      {args.timeframe}")
    print(f"  Stocks loaded:  {len(stocks)}")
    print(f"  Anchor periods: {anchor_periods}")
    print(f"{'═'*60}\n")

    try:
        if args.logic == 'breakout':
            screener = BreakoutScreener(
                stocks, args.market, args.timeframe, anchor_periods, config
            )
        else:
            screener = PullbackScreener(
                stocks, args.market, args.timeframe, anchor_periods, config
            )

        results_df = screener.run()
        csv_path = save_csv(results_df, args.market, args.logic, args.timeframe)

        if not results_df.empty:
            print(f"\n{'═'*60}")
            print(f"  SUMMARY")
            print(f"{'═'*60}")
            print(f"  Total results: {len(results_df)}")

            if args.logic == 'breakout':
                pure = results_df[results_df['Failed Attempts'] == 0]
                retry = results_df[results_df['Failed Attempts'] > 0]
                print(f"  Pure breaks:   {len(pure)}")
                print(f"  Retry breaks:  {len(retry)}")

            print(f"{'═'*60}\n")
        else:
            print(f"\n  ❌ No results found\n")

        if args.telegram_token and args.telegram_chat_id:
            print("  Sending to Telegram...")

            if args.logic == 'breakout':
                message = build_breakout_telegram_message(
                    results_df, anchor_periods, config
                )
            else:
                message = build_pullback_telegram_message(
                    results_df, anchor_periods, config
                )

            status = send_telegram_message(
                message, args.telegram_token, args.telegram_chat_id
            )
            print(f"  Telegram: {status}")
        else:
            print("  ⚠  Telegram credentials not provided, skipping notification")

        print("\n  ✔  Scan complete!")

    except Exception as e:
        print(f"\n❌ Error during scan: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

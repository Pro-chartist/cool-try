"""
Pullback Screener — detects stocks pulling back to AVWAP (within proximity band).
Fully parameterized — timeframe, tolerances, all passed at runtime.
"""

import pandas as pd
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from screeners.avwap_engine import find_anchor_points, calculate_avwap_low
from screeners.output_formatter import to_tv
from screeners.data_fetcher import (
    FETCH_ERROR,
    FETCH_NO_DATA,
    FETCH_OK,
    FETCH_RATE_LIMITED,
    fetch_history_batch,
)


class PullbackScreener:
    """
    Pullback screener for NSE stocks.

    Supports: daily, weekly timeframes
    Parameters: all configurable at runtime (no hardcoding)
    """

    def __init__(self, stocks, market, timeframe, anchor_periods, config):
        self.stocks = stocks
        self.market = market
        self.timeframe = timeframe
        self.anchor_periods = anchor_periods

        self.proximity_low_pct = config.get('proximity_low_pct', 0.0)
        self.proximity_high_pct = config.get('proximity_high_pct', 2.0)
        self.min_turnover = config.get('min_turnover', 10_000_000)
        self.max_brief_crosses = config.get('max_brief_crosses', 5)
        self.min_periods_old = config.get('min_periods_old', 20)

        self.market_suffix = self._get_market_suffix(market)

    def _get_market_suffix(self, market):
        suffix_map = {
            'NSE': '.NS',
            'BSE': '.BO',
            'NASDAQ': '',
            'NYSE': '',
        }
        return suffix_map.get(market, '.NS')

    def _get_data(self, symbol):
        histories, statuses = fetch_history_batch(
            [symbol],
            self.timeframe,
            self.anchor_periods,
            batch_size=1,
        )
        status = statuses.get(symbol)
        if status and status.status != FETCH_OK:
            print(f"  ⚠  {self._fetch_status_label(status)}: {status.message}")

        return histories.get(symbol)

    def _fetch_status_label(self, status):
        if status.status == FETCH_RATE_LIMITED:
            return "Possible rate limit / fetch failed"
        if status.status == FETCH_ERROR:
            return "Fetch error"
        if status.status == FETCH_NO_DATA:
            return "No data"
        return "No data"

    def _check_criteria(self, data, anchor_idx, avwap_series):
        """
        Check if stock meets pullback criteria.

        FIX 1: avwap_series is now a pandas Series (from fixed avwap_engine).
                .iloc[i] returns a scalar float, resolving the crash:
                "ValueError: The truth value of a Series is ambiguous"

        FIX 2: Returns raw turnover (not divided by 100k) so the caller
                can compare against self.min_turnover directly.
                The /100_000 division now happens only in _screen_stock
                when building the display field 'Turnover_Lakhs'.

        Returns: (passes, dist_pct_or_msg, raw_turnover, max_consec_below)
        """
        try:
            post_data = data.iloc[anchor_idx + 1:]
            # FIX 1: avwap_series is a Series; .iloc[1:] returns a Series slice
            post_avwap = avwap_series.iloc[1:]

            if post_data.empty:
                return False, "No post-anchor data", 0, 0

            closes = post_data['Close']
            # reindex a Series → returns a Series; .iloc[i] is a scalar float
            avwap = post_avwap.reindex(closes.index, method='ffill')

            # Check for consecutive closes below AVWAP
            streaks, cur = [], 0
            for i in range(len(closes)):
                # FIX 1: avwap.iloc[i] is now a scalar — comparison is bool, not Series
                below = (i < len(avwap)) and (closes.iloc[i] < avwap.iloc[i])
                if below:
                    cur += 1
                else:
                    if cur > 0:
                        streaks.append(cur)
                    cur = 0
            if cur > 0:
                streaks.append(cur)

            max_consec = max(streaks) if streaks else 0
            num_crosses = len(streaks)
            if num_crosses > self.max_brief_crosses:
                return False, f"Crossed below AVWAP {num_crosses} times", 0, max_consec

            # FIX 1: avwap_series.iloc[-1] is now a scalar float
            cmp = data['Close'].iloc[-1]
            avwap_latest = avwap_series.iloc[-1]
            dist = ((cmp - avwap_latest) / avwap_latest) * 100

            if self.proximity_low_pct <= dist <= self.proximity_high_pct:
                # FIX 2: return raw turnover — no /100_000 here
                raw_turnover = cmp * data['Volume'].iloc[-1]
                return True, dist, raw_turnover, max_consec

            return False, f"Dist {dist:.2f}% out of range", 0, max_consec

        except Exception as e:
            return False, f"Error: {e}", 0, 0

    def _screen_stock(self, symbol, data):
        results = []
        hits = []

        for period in self.anchor_periods:
            try:
                anchors = find_anchor_points(data, [period], self.min_periods_old)

                if anchors is None:
                    continue

                for key, info in anchors.items():
                    avwap = calculate_avwap_low(data, anchor_date=info['date'])

                    if avwap is None:
                        continue

                    passes, result, raw_turnover, max_below = self._check_criteria(
                        data, info['idx'], avwap
                    )

                    # FIX 2: compare raw_turnover against self.min_turnover (both raw)
                    # Previously: turnover was in lakhs, min_turnover was raw → always False
                    if passes and raw_turnover >= self.min_turnover:
                        if self.timeframe == 'daily':
                            period_label = f"{period}d"
                        elif self.timeframe == 'weekly':
                            period_label = f"{period}w"
                        else:
                            period_label = f"{period}mo"

                        results.append({
                            'Symbol': symbol.replace(self.market_suffix, ''),
                            'TV_Symbol': to_tv(symbol.replace(self.market_suffix, ''), self.market_suffix, self.market),
                            'Timeframe': self.timeframe.upper(),
                            'Anchor_Period': period_label,
                            'Current_Price': round(data['Close'].iloc[-1], 2),
                            # FIX 1: avwap.iloc[-1] is now a scalar float
                            'AVWAP': round(avwap.iloc[-1], 2),
                            'Distance_%': round(result, 2),
                            # FIX 2: divide by 100_000 only here for display
                            'Turnover_Lakhs': round(raw_turnover / 100_000, 1),
                            'Anchor_Date': info['date'].strftime('%d-%m-%Y'),
                            'Anchor_Low': round(info['low'], 2),
                            'Days_Since_Anchor': info['days_old'],
                            'Max_Bars_Below': max_below,
                        })

                        hits.append(f"{period_label}:✅({result:.1f}%)")

            except Exception:
                continue

        return results, hits

    def run(self):
        all_results = []

        print(f"\n{'═'*60}")
        print(f"  {self.market} {self.timeframe.upper()} PULLBACK SCREENER")
        print(f"  {datetime.now().strftime('%d %b %Y  %H:%M')}")
        print(f"{'═'*60}")
        print(f"  Stocks: {len(self.stocks)}")
        print(f"  Anchors: {self.anchor_periods}")
        print(f"  Proximity: {self.proximity_low_pct}%-{self.proximity_high_pct}%")
        print(f"{'═'*60}\n")

        histories, fetch_statuses = fetch_history_batch(
            self.stocks,
            self.timeframe,
            self.anchor_periods,
        )

        for idx, stock in enumerate(self.stocks, 1):
            print(f"  [{idx:>3}/{len(self.stocks)}]  {stock:<18}", end="", flush=True)

            data = histories.get(stock)
            if data is None:
                status = fetch_statuses.get(stock)
                if status is None:
                    print("  ⚠  Fetch error: missing fetch status")
                elif status.status == FETCH_NO_DATA:
                    print("  ⚠  No data")
                else:
                    message = f": {status.message}" if status.message else ""
                    print(f"  ⚠  {self._fetch_status_label(status)}{message}")
                continue

            results, hits = self._screen_stock(stock, data)
            all_results.extend(results)

            if hits:
                print("  →  " + "  ".join(hits))
            else:
                print("  —  no match")

        cols = [
            'Symbol', 'TV_Symbol', 'Timeframe', 'Anchor_Period',
            'Current_Price', 'AVWAP', 'Distance_%', 'Turnover_Lakhs',
            'Anchor_Date', 'Anchor_Low', 'Days_Since_Anchor', 'Max_Bars_Below',
        ]

        if all_results:
            df = pd.DataFrame(all_results, columns=cols)
            df = df.sort_values(['Turnover_Lakhs'], ascending=[False])
        else:
            df = pd.DataFrame(columns=cols)

        return df

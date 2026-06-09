"""
Output Formatter — formats results for CSV export and Telegram messaging.
Handles symbol conversion (NSE:SBIN format), CSV creation, and data structuring.
"""

import pandas as pd
from datetime import datetime


def to_tv(symbol, market_suffix, market=''):
    """
    Convert symbol to TradingView format.
    E.g., SBIN + .NS → NSE:SBIN
    """
    suffix_map = {
        '.NS': 'NSE',
        '.BO': 'BSE',
    }
    if market_suffix == '':
        prefix = 'NYSE' if market.upper() == 'NYSE' else 'NASDAQ'
    else:
        prefix = suffix_map.get(market_suffix, 'NSE')
    return f"{prefix}:{symbol}"


def format_date(date):
    """Format date as DD-MM-YYYY"""
    return date.strftime('%d-%m-%Y')


def create_csv_dataframe(results, columns):
    """
    Create a clean pandas DataFrame from results.
    """
    if results:
        df = pd.DataFrame(results, columns=columns)
    else:
        df = pd.DataFrame(columns=columns)
    return df


def sort_breakout_results(df):
    """
    Sort breakout results by failed attempts, anchor period, breakout date.
    """
    if df.empty:
        return df

    try:
        df['Highest High Date'] = pd.to_datetime(df['Highest High Date'])
        df['Successful Breakout'] = pd.to_datetime(df['Successful Breakout'])

        df = df.sort_values(
            ['Stock', 'Highest High Date', 'Successful Breakout', 'Anchor Period']
        )
        df = df.drop_duplicates(
            subset=['Stock', 'Highest High Date', 'Successful Breakout'],
            keep='first'
        )

        df['_sort_key'] = df['Failed Attempts']
        df = df.sort_values(['_sort_key', 'Anchor Period', 'Successful Breakout'])
        df = df.drop(columns=['_sort_key'])

        df['Highest High Date'] = df['Highest High Date'].apply(format_date)
        df['Successful Breakout'] = df['Successful Breakout'].apply(format_date)
    except Exception:
        pass

    return df


def sort_pullback_results(df):
    """
    Sort pullback results by turnover descending.
    """
    if df.empty:
        return df

    try:
        if 'Anchor_Date' in df.columns:
            df['Anchor_Date'] = pd.to_datetime(df['Anchor_Date'])
            df['Anchor_Date'] = df['Anchor_Date'].apply(format_date)
    except Exception:
        pass

    return df


def group_results_by_period(df, period_col, anchor_periods):
    """
    Group results by anchor period for Telegram formatting.

    FIX: breakout_screener stores the column as 'TV Symbol' (with a space).
         pullback_screener stores it as 'TV_Symbol' (with underscore).
         Detect which one is present rather than hardcoding.

    Args:
        df: Results DataFrame
        period_col: Name of period column
        anchor_periods: List of periods in order

    Returns:
        Dictionary {period: [symbols]}
    """
    # FIX: handle both naming conventions
    if 'TV Symbol' in df.columns:
        symbol_col = 'TV Symbol'
    elif 'TV_Symbol' in df.columns:
        symbol_col = 'TV_Symbol'
    else:
        return {}

    grouped = {}
    for period in anchor_periods:
        grp = df[df[period_col] == period]
        if not grp.empty:
            grouped[period] = grp[symbol_col].tolist()

    return grouped

import { useState, CSSProperties, useEffect, useRef } from 'react';
import axios from 'axios';

interface ScanResults {
  total: number;
  pure?: number;
  retry?: number;
  symbols: string[];
  csvFile?: string;
  downloadUrl?: string;
}

// ─── Design tokens (mirrors CSS vars for inline styles) ──────────────────────
const C = {
  bgVoid:       '#060A0D',
  bgBase:       '#0B1014',
  bgSurface:    '#0F161B',
  bgRaised:     '#141D23',
  bgElevated:   '#1A2530',
  borderDim:    '#1C2A33',
  borderStd:    '#213040',
  borderAccent: 'rgba(0, 255, 136, 0.35)',
  green:        '#00FF88',
  greenDim:     '#00CC6A',
  greenMuted:   'rgba(0, 255, 136, 0.12)',
  greenGlow:    'rgba(0, 255, 136, 0.18)',
  greenGlowLg:  'rgba(0, 255, 136, 0.08)',
  textPrimary:  '#D8EEE2',
  textSecondary:'#6B8F7A',
  textMuted:    '#334D3E',
  textLabel:    '#4A7060',
  red:          '#FF4466',
  redBg:        'rgba(255, 68, 102, 0.08)',
  redBorder:    'rgba(255, 68, 102, 0.25)',
  fontDisplay:  "'Syne', sans-serif",
  fontMono:     "'Space Mono', monospace",
};

const styles: Record<string, CSSProperties> = {
  // ── Layout ─────────────────────────────────────────────────────────────────
  page: {
    minHeight: '100vh',
    backgroundColor: C.bgVoid,
    color: C.textPrimary,
    fontFamily: C.fontMono,
    padding: '0 0 60px',
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topbar: {
    borderBottom: `1px solid ${C.borderDim}`,
    backgroundColor: C.bgBase,
    padding: '0 40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '58px',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    backdropFilter: 'blur(12px)',
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  logoMark: {
    width: '28px',
    height: '28px',
    border: `1.5px solid ${C.green}`,
    borderRadius: '5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 10px ${C.greenGlow}`,
    flexShrink: 0,
  },
  logoText: {
    fontFamily: C.fontDisplay,
    fontWeight: 800,
    fontSize: '18px',
    letterSpacing: '-0.04em',
    color: C.textPrimary,
  },
  logoSub: {
    fontFamily: C.fontMono,
    fontSize: '10px',
    letterSpacing: '0.18em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    marginTop: '1px',
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
    letterSpacing: '0.1em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: C.green,
    boxShadow: `0 0 6px ${C.green}`,
    flexShrink: 0,
  },

  // ── Main layout ────────────────────────────────────────────────────────────
  main: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '36px 40px',
    display: 'grid',
    gridTemplateColumns: '340px 1fr',
    gap: '24px',
    alignItems: 'start',
  },

  // ── Panel (shared card style) ──────────────────────────────────────────────
  panel: {
    backgroundColor: C.bgSurface,
    border: `1px solid ${C.borderDim}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '14px 20px',
    borderBottom: `1px solid ${C.borderDim}`,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: C.bgRaised,
  },
  panelHeaderDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: C.green,
    boxShadow: `0 0 8px ${C.greenGlow}`,
    flexShrink: 0,
  },
  panelTitle: {
    fontFamily: C.fontDisplay,
    fontWeight: 700,
    fontSize: '13px',
    letterSpacing: '0.04em',
    color: C.textPrimary,
    textTransform: 'uppercase' as const,
  },
  panelBody: {
    padding: '20px',
  },

  // ── Section divider ────────────────────────────────────────────────────────
  section: {
    marginBottom: '22px',
    paddingBottom: '22px',
    borderBottom: `1px solid ${C.borderDim}`,
  },
  sectionLast: {
    marginBottom: '0',
    paddingBottom: '0',
    borderBottom: 'none',
  },
  sectionLabel: {
    fontFamily: C.fontMono,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    marginBottom: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionLabelLine: {
    flex: 1,
    height: '1px',
    backgroundColor: C.borderDim,
  },

  // ── Segmented control (Market / Logic / Timeframe) ─────────────────────────
  segmentGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '2px',
    backgroundColor: C.bgRaised,
    border: `1px solid ${C.borderDim}`,
    borderRadius: '6px',
    padding: '3px',
    marginBottom: '12px',
  },
  segmentGroupFour: {
    gridTemplateColumns: 'repeat(4, 1fr)',
  },
  segmentGroupThree: {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
  segmentButton: {
    padding: '7px 4px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: C.textSecondary,
    fontSize: '11px',
    fontFamily: C.fontMono,
    fontWeight: 700,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    textAlign: 'center' as const,
  },
  segmentButtonActive: {
    backgroundColor: C.bgElevated,
    color: C.green,
    boxShadow: `inset 0 0 0 1px ${C.borderAccent}`,
  },

  // ── Form fields ────────────────────────────────────────────────────────────
  formGroup: {
    marginBottom: '12px',
  },
  formGroupLast: {
    marginBottom: '0',
  },
  fieldLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: C.textLabel,
    textTransform: 'uppercase' as const,
    marginBottom: '5px',
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    backgroundColor: C.bgRaised,
    border: `1px solid ${C.borderStd}`,
    borderRadius: '5px',
    color: C.textPrimary,
    fontSize: '13px',
    fontFamily: C.fontMono,
    outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
    boxSizing: 'border-box' as const,
  },

  // ── Row of 2 fields ────────────────────────────────────────────────────────
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '12px',
  },

  // ── Primary CTA ────────────────────────────────────────────────────────────
  runButton: {
    width: '100%',
    padding: '13px',
    backgroundColor: C.green,
    color: C.bgVoid,
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: C.fontMono,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    marginTop: '4px',
    boxShadow: `0 0 20px ${C.greenGlow}`,
    transition: 'all 150ms ease',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  runButtonLoading: {
    backgroundColor: C.bgElevated,
    color: C.green,
    boxShadow: `inset 0 0 0 1px ${C.borderAccent}`,
  },

  // ── Right column ───────────────────────────────────────────────────────────
  rightCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },

  // ── Idle state ─────────────────────────────────────────────────────────────
  idleCard: {
    backgroundColor: C.bgSurface,
    border: `1px solid ${C.borderDim}`,
    borderRadius: '8px',
    padding: '52px 36px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    textAlign: 'center' as const,
    minHeight: '220px',
  },
  idleIcon: {
    width: '44px',
    height: '44px',
    border: `1px solid ${C.borderStd}`,
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.textMuted,
    fontSize: '20px',
    marginBottom: '4px',
  },
  idleTitle: {
    fontFamily: C.fontDisplay,
    fontWeight: 700,
    fontSize: '15px',
    color: C.textSecondary,
  },
  idleSub: {
    fontSize: '11px',
    color: C.textMuted,
    letterSpacing: '0.04em',
    maxWidth: '240px',
    lineHeight: '1.7',
  },

  // ── Loading state ──────────────────────────────────────────────────────────
  loadingCard: {
    backgroundColor: C.bgSurface,
    border: `1px solid ${C.borderAccent}`,
    borderRadius: '8px',
    padding: '36px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    boxShadow: `0 0 30px ${C.greenGlowLg}`,
  },
  loadingLabel: {
    fontFamily: C.fontMono,
    fontSize: '11px',
    letterSpacing: '0.14em',
    color: C.green,
    textTransform: 'uppercase' as const,
  },
  loadingBar: {
    width: '100%',
    height: '2px',
    backgroundColor: C.bgElevated,
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  loadingBarFill: {
    position: 'absolute' as const,
    top: 0,
    left: '-40%',
    width: '40%',
    height: '100%',
    background: `linear-gradient(90deg, transparent, ${C.green}, transparent)`,
    animation: 'scan 1.6s ease-in-out infinite',
    boxShadow: `0 0 8px ${C.green}`,
  },
  loadingTime: {
    fontFamily: C.fontMono,
    fontSize: '28px',
    fontWeight: 700,
    color: C.green,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
  },
  loadingTimeSub: {
    fontSize: '10px',
    color: C.textMuted,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    marginTop: '-10px',
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorCard: {
    backgroundColor: C.redBg,
    border: `1px solid ${C.redBorder}`,
    borderRadius: '8px',
    padding: '18px 20px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  errorIcon: {
    color: C.red,
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
    letterSpacing: 0,
  },
  errorText: {
    fontSize: '12px',
    color: C.red,
    lineHeight: '1.6',
    fontFamily: C.fontMono,
  },

  // ── Results ────────────────────────────────────────────────────────────────
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '0',
  },
  statCard: {
    backgroundColor: C.bgRaised,
    border: `1px solid ${C.borderDim}`,
    borderRadius: '6px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
  },
  statValue: {
    fontFamily: C.fontMono,
    fontSize: '26px',
    fontWeight: 700,
    color: C.green,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  statValueNeutral: {
    color: C.textPrimary,
  },

  // ── Symbols panel ─────────────────────────────────────────────────────────
  symbolsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: `1px solid ${C.borderDim}`,
    backgroundColor: C.bgRaised,
  },
  symbolsHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  symbolsBadge: {
    backgroundColor: C.greenMuted,
    border: `1px solid ${C.borderAccent}`,
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontFamily: C.fontMono,
    fontWeight: 700,
    color: C.green,
    letterSpacing: '0.04em',
  },
  symbolsTextarea: {
    width: '100%',
    minHeight: '110px',
    padding: '14px 16px',
    backgroundColor: C.bgVoid,
    border: 'none',
    borderBottom: `1px solid ${C.borderDim}`,
    color: C.green,
    fontFamily: C.fontMono,
    fontSize: '12px',
    lineHeight: '1.8',
    resize: 'none' as const,
    outline: 'none',
    letterSpacing: '0.03em',
  },
  symbolsActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0',
  },
  actionButton: {
    padding: '12px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: C.textSecondary,
    fontSize: '11px',
    fontFamily: C.fontMono,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 150ms ease',
    borderTop: `1px solid ${C.borderDim}`,
  },
  actionButtonLeft: {
    borderRight: `1px solid ${C.borderDim}`,
  },

  // ── No results ─────────────────────────────────────────────────────────────
  noResults: {
    padding: '32px 20px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: C.textMuted,
    letterSpacing: '0.06em',
  },
};

// ─── Small sub-components ─────────────────────────────────────────────────────

function SegButton({
  label, value, current, onClick, cols
}: {
  label: string; value: string; current: string;
  onClick: (v: string) => void; cols?: number;
}) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      style={{
        ...styles.segmentButton,
        ...(isActive ? styles.segmentButtonActive : {}),
        gridColumn: cols ? `span ${cols}` : undefined,
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.textPrimary;
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary;
      }}
    >
      {label}
    </button>
  );
}

function FieldInput({
  label, value, onChange, type = 'text', step, placeholder, last
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; step?: string; placeholder?: string; last?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={last ? styles.formGroupLast : styles.formGroup}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...styles.input,
          borderColor: focused ? C.borderAccent : C.borderStd,
          boxShadow: focused ? `0 0 0 3px ${C.greenGlowLg}` : 'none',
        }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home() {
  // Form state
  const [market, setMarket]                     = useState('NSE');
  const [logic, setLogic]                       = useState('breakout');
  const [timeframe, setTimeframe]               = useState('daily');
  const [anchorPeriods, setAnchorPeriods]       = useState('52,156,260');
  const [toleranceBelowAvwap, setToleranceBelowAvwap] = useState('0.05');
  const [ceiling, setCeiling]                   = useState('0.10');
  const [sustainPeriods, setSustainPeriods]     = useState('3');
  const [maxFailedAttempts, setMaxFailedAttempts] = useState('2');
  const [minTurnover, setMinTurnover]           = useState('10000000');
  const [proximityLowPct, setProximityLowPct]   = useState('0.0');
  const [proximityHighPct, setProximityHighPct] = useState('2.0');
  const [maxBriefCrosses, setMaxBriefCrosses]   = useState('5');
  const [minPeriodsOld, setMinPeriodsOld]       = useState('20');

  // UI state
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState<ScanResults | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [copied, setCopied]     = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0
      ? `${m}:${sec.toString().padStart(2, '0')}`
      : `${sec}s`;
  };

  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    setPollCount(0);

    try {
      const periods = anchorPeriods
        .split(',')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p));

      const baseParams = { min_turnover: parseInt(minTurnover) };
      const params = logic === 'breakout'
        ? {
            ...baseParams,
            tolerance_below_avwap: parseFloat(toleranceBelowAvwap),
            ceiling: parseFloat(ceiling),
            sustain_periods: parseInt(sustainPeriods),
            max_failed_attempts: parseInt(maxFailedAttempts),
            anchor_periods: periods,
          }
        : {
            ...baseParams,
            proximity_low_pct: parseFloat(proximityLowPct),
            proximity_high_pct: parseFloat(proximityHighPct),
            max_brief_crosses: parseInt(maxBriefCrosses),
            min_periods_old: parseInt(minPeriodsOld),
            anchor_periods: periods,
          };

      const response = await axios.post('/api/trigger-scan', { market, logic, timeframe, params });
      pollForResults(response.data.jobId);
    } catch (err: unknown) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : 'Error triggering scan'
      );
      setLoading(false);
    }
  };

  const pollForResults = (id: string) => {
    let count = 0;
    const interval = setInterval(async () => {
      count += 1;
      setPollCount(count);
      try {
        const res = await axios.get('/api/scan-status', {
          params: { jobId: id, market, logic, timeframe },
        });
        if (res.data.status === 'completed') {
          clearInterval(interval);
          setResults(res.data.results
            ? { ...res.data.results, csvFile: res.data.csvFile, downloadUrl: res.data.downloadUrl }
            : null
          );
          setLoading(false);
        } else if (res.data.status === 'failed') {
          clearInterval(interval);
          setError(res.data.error || 'Scan failed');
          setLoading(false);
        } else if (count > 180) {
          clearInterval(interval);
          setError('Scan timed out after 15 minutes');
          setLoading(false);
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.error) {
          clearInterval(interval);
          setError(err.response.data.error);
          setLoading(false);
        } else if (count > 60) {
          clearInterval(interval);
          setError('Scan timed out');
          setLoading(false);
        }
      }
    }, 5000);
  };

  const copySymbols = (symbols: string[]) => {
    navigator.clipboard.writeText(symbols.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const downloadCsv = (downloadUrl?: string, filename?: string) => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename || 'scan_results.csv';
      a.click();
    } else {
      alert('CSV not available yet. Check GitHub results folder.');
    }
  };

  // Disable timeframes that aren't valid for market+logic combos
  const availableTimeframes = market === 'NASDAQ' || market === 'NYSE'
    ? ['weekly']
    : ['daily', 'weekly', 'monthly'];

  return (
    <div style={styles.page}>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <div style={styles.logoMark}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7 L7 2 L12 7 L7 12 Z" stroke="#00FF88" strokeWidth="1.5" fill="none"/>
              <path d="M7 4.5 L9.5 7 L7 9.5 L4.5 7 Z" fill="#00FF88"/>
            </svg>
          </div>
          <div>
            <div style={styles.logoText}>ARGUS</div>
            <div style={styles.logoSub}>AVWAP Screener</div>
          </div>
        </div>
        <div style={styles.topbarRight}>
          <div style={styles.statusDot} />
          <span>System Online</span>
          <span style={{ color: C.borderStd, margin: '0 4px' }}>·</span>
          <span style={{ color: C.textMuted }}>
            {market} / {logic} / {timeframe}
          </span>
        </div>
      </header>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <main style={styles.main}>
        {/* ── LEFT: Config panel ────────────────────────────────────────── */}
        <form onSubmit={handleRunScan}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div style={styles.panelHeaderDot} />
              <span style={styles.panelTitle}>Scan Configuration</span>
            </div>

            <div style={styles.panelBody}>
              {/* Market */}
              <div style={styles.section}>
                <div style={styles.sectionLabel}>
                  <span>Market</span>
                  <div style={styles.sectionLabelLine} />
                </div>
                <div style={{ ...styles.segmentGroup, ...styles.segmentGroupFour }}>
                  {['NSE', 'BSE', 'NASDAQ', 'NYSE'].map(m => (
                    <SegButton key={m} label={m} value={m} current={market} onClick={setMarket} />
                  ))}
                </div>

                {/* Logic */}
                <div style={{ ...styles.sectionLabel, marginTop: '14px' }}>
                  <span>Logic</span>
                  <div style={styles.sectionLabelLine} />
                </div>
                <div style={styles.segmentGroup}>
                  <SegButton label="Breakout" value="breakout" current={logic} onClick={setLogic} />
                  <SegButton label="Pullback" value="pullback" current={logic} onClick={setLogic} />
                </div>

                {/* Timeframe */}
                <div style={{ ...styles.sectionLabel, marginTop: '14px' }}>
                  <span>Timeframe</span>
                  <div style={styles.sectionLabelLine} />
                </div>
                <div style={{ ...styles.segmentGroup, ...styles.segmentGroupThree }}>
                  {['daily', 'weekly', 'monthly'].map(tf => {
                    const disabled = !availableTimeframes.includes(tf);
                    return (
                      <button
                        key={tf}
                        type="button"
                        disabled={disabled}
                        onClick={() => setTimeframe(tf)}
                        style={{
                          ...styles.segmentButton,
                          ...(tf === timeframe ? styles.segmentButtonActive : {}),
                          opacity: disabled ? 0.3 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {tf.charAt(0).toUpperCase() + tf.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Anchor Periods + Min Turnover */}
              <div style={styles.section}>
                <div style={styles.sectionLabel}>
                  <span>Parameters</span>
                  <div style={styles.sectionLabelLine} />
                </div>
                <FieldInput
                  label="Anchor Periods (comma-separated)"
                  value={anchorPeriods}
                  onChange={setAnchorPeriods}
                  placeholder="e.g. 52,156,260"
                />
                <FieldInput
                  label="Min Turnover (₹)"
                  value={minTurnover}
                  onChange={setMinTurnover}
                  type="number"
                  last
                />
              </div>

              {/* Logic-specific params */}
              {logic === 'breakout' && (
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>
                    <span>Breakout Params</span>
                    <div style={styles.sectionLabelLine} />
                  </div>
                  <div style={styles.fieldRow}>
                    <FieldInput label="Tol. Below AVWAP" value={toleranceBelowAvwap} onChange={setToleranceBelowAvwap} type="number" step="0.01" />
                    <FieldInput label="Ceiling Above AVWAP" value={ceiling} onChange={setCeiling} type="number" step="0.01" />
                  </div>
                  <div style={{ ...styles.fieldRow, marginBottom: 0 }}>
                    <FieldInput label="Sustain Periods" value={sustainPeriods} onChange={setSustainPeriods} type="number" last />
                    <FieldInput label="Max Failed Attempts" value={maxFailedAttempts} onChange={setMaxFailedAttempts} type="number" last />
                  </div>
                </div>
              )}

              {logic === 'pullback' && (
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>
                    <span>Pullback Params</span>
                    <div style={styles.sectionLabelLine} />
                  </div>
                  <div style={styles.fieldRow}>
                    <FieldInput label="Proximity Low (%)" value={proximityLowPct} onChange={setProximityLowPct} type="number" step="0.1" />
                    <FieldInput label="Proximity High (%)" value={proximityHighPct} onChange={setProximityHighPct} type="number" step="0.1" />
                  </div>
                  <div style={{ ...styles.fieldRow, marginBottom: 0 }}>
                    <FieldInput label="Max Brief Crosses" value={maxBriefCrosses} onChange={setMaxBriefCrosses} type="number" last />
                    <FieldInput label="Min Periods Old" value={minPeriodsOld} onChange={setMinPeriodsOld} type="number" last />
                  </div>
                </div>
              )}

              {/* Run button */}
              <div style={{ ...styles.sectionLast }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...styles.runButton,
                    ...(loading ? styles.runButtonLoading : {}),
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 32px rgba(0, 255, 136, 0.4)`;
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 20px ${C.greenGlow}`;
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: C.green, animation: 'blink 1s ease infinite' }} />
                      Scanning...
                    </span>
                  ) : '▶  Run Scan'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* ── RIGHT: Results ─────────────────────────────────────────────── */}
        <div style={styles.rightCol}>

          {/* Error */}
          {error && (
            <div style={{ ...styles.errorCard, animation: 'fadeIn 0.3s ease' }}>
              <span style={styles.errorIcon}>✕</span>
              <div>
                <div style={{ ...styles.errorText, fontWeight: 700, marginBottom: '4px' }}>Scan Error</div>
                <div style={styles.errorText}>{error}</div>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ ...styles.loadingCard, animation: 'fadeIn 0.3s ease' }}>
              <div style={styles.loadingLabel}>Scanning {market} · {logic} · {timeframe}</div>
              <div style={styles.loadingBar}>
                <div style={styles.loadingBarFill} />
              </div>
              <div style={styles.loadingTime}>{formatElapsed(elapsed)}</div>
              <div style={styles.loadingTimeSub}>elapsed — polling every 5s</div>
            </div>
          )}

          {/* Results */}
          {results && !loading && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* Stats row */}
              <div style={{ ...styles.panel, marginBottom: '16px' }}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelHeaderDot} />
                  <span style={styles.panelTitle}>Scan Complete</span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '10px',
                    color: C.textMuted,
                    fontFamily: C.fontMono,
                    letterSpacing: '0.08em',
                  }}>
                    {market} · {logic.toUpperCase()} · {timeframe.toUpperCase()}
                  </span>
                </div>
                <div style={{ ...styles.statsRow, padding: '16px' }}>
                  <div style={styles.statCard}>
                    <div style={styles.statLabel}>Total Matches</div>
                    <div style={styles.statValue}>{results.total}</div>
                  </div>
                  {results.pure !== undefined && (
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Pure Breaks</div>
                      <div style={{ ...styles.statValue, ...styles.statValueNeutral }}>{results.pure}</div>
                    </div>
                  )}
                  {results.retry !== undefined && (
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Retry Breaks</div>
                      <div style={{ ...styles.statValue, ...styles.statValueNeutral }}>{results.retry}</div>
                    </div>
                  )}
                  {results.pure === undefined && results.retry === undefined && (
                    <>
                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>Symbols</div>
                        <div style={{ ...styles.statValue, ...styles.statValueNeutral }}>{results.symbols?.length ?? 0}</div>
                      </div>
                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>Status</div>
                        <div style={{ ...styles.statValue, fontSize: '13px', paddingTop: '6px', color: C.green }}>DONE</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Symbols panel */}
              {results.symbols && results.symbols.length > 0 ? (
                <div style={styles.panel}>
                  <div style={styles.symbolsHeader}>
                    <div style={styles.symbolsHeaderLeft}>
                      <div style={styles.panelHeaderDot} />
                      <span style={styles.panelTitle}>Symbols</span>
                    </div>
                    <div style={styles.symbolsBadge}>{results.symbols.length} stocks</div>
                  </div>
                  <textarea
                    value={results.symbols.join(', ')}
                    readOnly
                    style={styles.symbolsTextarea}
                  />
                  <div style={styles.symbolsActions}>
                    <button
                      onClick={() => copySymbols(results.symbols)}
                      style={{ ...styles.actionButton, ...styles.actionButtonLeft }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.color = C.green;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.greenMuted;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <span>{copied ? '✓' : '⧉'}</span>
                      {copied ? 'Copied!' : 'Copy for TradingView'}
                    </button>
                    <button
                      onClick={() => downloadCsv(results.downloadUrl, results.csvFile)}
                      style={styles.actionButton}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.color = C.green;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.greenMuted;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <span>↓</span>
                      Download CSV
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ ...styles.panel }}>
                  <div style={styles.noResults}>No symbols matched the selected parameters.</div>
                </div>
              )}
            </div>
          )}

          {/* Idle state */}
          {!loading && !results && !error && (
            <div style={styles.idleCard}>
              <div style={styles.idleIcon}>◈</div>
              <div style={styles.idleTitle}>Ready to Scan</div>
              <div style={styles.idleSub}>
                Configure parameters on the left and click Run Scan to begin scanning {market} for AVWAP {logic} setups.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

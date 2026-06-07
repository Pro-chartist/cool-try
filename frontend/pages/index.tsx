import { useState, CSSProperties } from 'react';
import axios from 'axios';

interface ScanResults {
  total: number;
  pure?: number;
  retry?: number;
  symbols: string[];
  csvFile?: string;
  downloadUrl?: string;
}

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
    borderBottom: '2px solid #007bff',
    paddingBottom: '20px',
  },
  form: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  formSection: {
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '1px solid #ddd',
  },
  formGroup: {
    marginBottom: '12px',
  },
  select: {
    width: '100%',
    padding: '8px',
    marginTop: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginTop: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px',
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '20px',
    border: '1px solid #f5c6cb',
  },
  results: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  symbolsCard: {
    backgroundColor: '#f0f8ff',
    padding: '15px',
    borderRadius: '4px',
    marginTop: '15px',
    border: '1px solid #b3d9ff',
  },
  textarea: {
    width: '100%',
    height: '100px',
    padding: '10px',
    marginTop: '10px',
    marginBottom: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
    boxSizing: 'border-box',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
  },
  secondaryButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  noResults: {
    color: '#666',
    fontStyle: 'italic',
    marginTop: '15px',
  },
};

export default function Home() {
  // Form state
  const [market, setMarket] = useState('NSE');
  const [logic, setLogic] = useState('breakout');
  const [timeframe, setTimeframe] = useState('daily');
  const [anchorPeriods, setAnchorPeriods] = useState('52,156,260');
  const [toleranceBelowAvwap, setToleranceBelowAvwap] = useState('0.05');
  const [ceiling, setCeiling] = useState('0.10');
  const [sustainPeriods, setSustainPeriods] = useState('3');
  const [maxFailedAttempts, setMaxFailedAttempts] = useState('2');
  const [minTurnover, setMinTurnover] = useState('10000000');
  const [proximityLowPct, setProximityLowPct] = useState('0.0');
  const [proximityHighPct, setProximityHighPct] = useState('2.0');
  const [maxBriefCrosses, setMaxBriefCrosses] = useState('5');
  const [minPeriodsOld, setMinPeriodsOld] = useState('20');

  // UI state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Trigger scan
  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    setPollCount(0);

    try {
      const periods = anchorPeriods
        .split(',')
        .map((p) => parseInt(p.trim()))
        .filter((p) => !isNaN(p));

      const baseParams = {
        min_turnover: parseInt(minTurnover),
      };

      const params =
        logic === 'breakout'
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

      const response = await axios.post('/api/trigger-scan', {
        market,
        logic,
        timeframe,
        params,
      });

      const jobId: string = response.data.jobId;
      setLoading(true);
      pollForResults(jobId);
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : 'Error triggering scan';
      setError(message);
      setLoading(false);
    }
  };

  // Poll for results
  const pollForResults = (id: string) => {
    let count = 0;
    const pollInterval = setInterval(async () => {
      count += 1;
      setPollCount(count);

      try {
        const response = await axios.get('/api/scan-status', {
          params: { jobId: id, market, logic, timeframe },
        });

        if (response.data.status === 'completed') {
          clearInterval(pollInterval);
          setResults(
            response.data.results
              ? {
                  ...response.data.results,
                  csvFile: response.data.csvFile,
                  downloadUrl: response.data.downloadUrl,
                }
              : null
          );
          setLoading(false);
        } else if (response.data.status === 'failed') {
          clearInterval(pollInterval);
          setError(response.data.error || 'Scan failed');
          setLoading(false);
        } else if (count > 180) {
          clearInterval(pollInterval);
          setError('Scan timed out after 15 minutes');
          setLoading(false);
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.error) {
          clearInterval(pollInterval);
          setError(err.response.data.error);
          setLoading(false);
        } else if (count > 60) {
          clearInterval(pollInterval);
          setError('Scan timed out');
          setLoading(false);
        }
      }
    }, 5000);
  };

  const copySymbols = (symbols: string[]) => {
    navigator.clipboard.writeText(symbols.join(', '));
    alert('Symbols copied to clipboard!');
  };

  const downloadCsv = (downloadUrl?: string, filename?: string) => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'scan_results.csv';
      link.click();
    } else {
      alert('CSV not available yet. Check GitHub results folder.');
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>NSE Screener Cloud</h1>
        <p>Select parameters and run your screener</p>
      </header>

      <form onSubmit={handleRunScan} style={styles.form}>
        <div style={styles.formSection}>
          <h2>Market &amp; Logic Selection</h2>

          <div style={styles.formGroup}>
            <label>Market:</label>
            <select value={market} onChange={(e) => setMarket(e.target.value)} style={styles.select}>
              <option value="NSE">NSE (India)</option>
              <option value="BSE">BSE (India)</option>
              <option value="NASDAQ">NASDAQ (USA)</option>
              <option value="NYSE">NYSE (USA)</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label>Logic:</label>
            <select value={logic} onChange={(e) => setLogic(e.target.value)} style={styles.select}>
              <option value="breakout">Breakout</option>
              <option value="pullback">Pullback</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label>Timeframe:</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={styles.select}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div style={styles.formSection}>
          <h2>Anchor Periods</h2>
          <div style={styles.formGroup}>
            <label>Periods (comma-separated):</label>
            <input
              type="text"
              value={anchorPeriods}
              onChange={(e) => setAnchorPeriods(e.target.value)}
              placeholder="e.g., 52,156,260"
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.formSection}>
          <h2>Common Parameters</h2>
          <div style={styles.formGroup}>
            <label>Minimum Turnover (₹):</label>
            <input
              type="number"
              value={minTurnover}
              onChange={(e) => setMinTurnover(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        {logic === 'breakout' && (
          <div style={styles.formSection}>
            <h2>Breakout Parameters</h2>
            <div style={styles.formGroup}>
              <label>Tolerance Below AVWAP (decimal e.g. 0.05 = 5%):</label>
              <input type="number" step="0.01" value={toleranceBelowAvwap} onChange={(e) => setToleranceBelowAvwap(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Ceiling Above AVWAP (decimal e.g. 0.10 = 10%):</label>
              <input type="number" step="0.01" value={ceiling} onChange={(e) => setCeiling(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Sustain Periods:</label>
              <input type="number" value={sustainPeriods} onChange={(e) => setSustainPeriods(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Max Failed Attempts:</label>
              <input type="number" value={maxFailedAttempts} onChange={(e) => setMaxFailedAttempts(e.target.value)} style={styles.input} />
            </div>
          </div>
        )}

        {logic === 'pullback' && (
          <div style={styles.formSection}>
            <h2>Pullback Parameters</h2>
            <div style={styles.formGroup}>
              <label>Proximity Low (%):</label>
              <input type="number" step="0.1" value={proximityLowPct} onChange={(e) => setProximityLowPct(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Proximity High (%):</label>
              <input type="number" step="0.1" value={proximityHighPct} onChange={(e) => setProximityHighPct(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Max Brief Crosses:</label>
              <input type="number" value={maxBriefCrosses} onChange={(e) => setMaxBriefCrosses(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label>Min Periods Old:</label>
              <input type="number" value={minPeriodsOld} onChange={(e) => setMinPeriodsOld(e.target.value)} style={styles.input} />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? `Running scan... (${pollCount * 5}s elapsed)` : 'Run Scan'}
        </button>
      </form>

      {error && (
        <div style={styles.error}>
          <h3>Error:</h3>
          <p>{error}</p>
        </div>
      )}

      {results && (
        <div style={styles.results}>
          <h2>Scan Results</h2>
          <p>Total matches: {results.total}</p>
          {results.pure !== undefined && <p>Pure breaks: {results.pure}</p>}
          {results.retry !== undefined && <p>Retry breaks: {results.retry}</p>}

          {results.symbols && results.symbols.length > 0 ? (
            <div style={styles.symbolsCard}>
              <h3>Symbols — Copy to TradingView ({results.symbols.length} stocks)</h3>
              <textarea
                value={results.symbols.join(', ')}
                readOnly
                style={styles.textarea}
              />
              <div style={styles.buttonGroup}>
                <button onClick={() => copySymbols(results.symbols)} style={styles.secondaryButton}>
                  📋 Copy All Symbols
                </button>
                <button
                  onClick={() => downloadCsv(results.downloadUrl, results.csvFile)}
                  style={styles.secondaryButton}
                >
                  ⬇️ Download CSV
                </button>
              </div>
            </div>
          ) : (
            <p style={styles.noResults}>No results found with the selected parameters.</p>
          )}
        </div>
      )}
    </div>
  );
}

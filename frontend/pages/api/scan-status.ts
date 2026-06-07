import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

type ScanResults = {
  total: number;
  pure: number;
  retry: number;
  symbols: string[];
};

type ScanStatusResponse = {
  status: 'pending' | 'completed' | 'failed';
  message?: string;
  success?: boolean;
  csvFile?: string;
  downloadUrl?: string;
  results?: ScanResults;
  error?: string;
};

// ─── CSV helpers ────────────────────────────────────────────────────────────

/**
 * Parse a single CSV line respecting double-quoted fields.
 * e.g.  NSE:SBIN,"Tata Cons,Ltd",52  →  ['NSE:SBIN', 'Tata Cons,Ltd', '52']
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV text into scan results.
 *
 * Handles both screener output formats:
 *   Breakout  → columns include 'TV Symbol' and 'Failed Attempts'
 *   Pullback  → columns include 'TV_Symbol' (no Failed Attempts column)
 */
function parseCsvResults(csvText: string): ScanResults {
  const lines = csvText
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { total: 0, pure: 0, retry: 0, symbols: [] };
  }

  const headers = parseCsvLine(lines[0]);

  // Detect which symbol column is present (breakout vs pullback naming)
  const symbolColIndex =
    headers.indexOf('TV Symbol') !== -1
      ? headers.indexOf('TV Symbol')       // breakout screener
      : headers.indexOf('TV_Symbol');       // pullback screener

  const failedAttemptsIndex = headers.indexOf('Failed Attempts'); // -1 for pullback

  const dataRows = lines.slice(1).map((l) => parseCsvLine(l));

  // De-duplicate symbols (same stock can appear under multiple anchor periods)
const allSymbols = dataRows
  .map((row) => (symbolColIndex !== -1 ? row[symbolColIndex] : ''))
  .filter(Boolean) as string[];

const uniqueSymbols = allSymbols.filter(
  (sym, index) => allSymbols.indexOf(sym) === index
);

  let pure = 0;
  let retry = 0;

  if (failedAttemptsIndex !== -1) {
    // Breakout: count pure (0 failed attempts) vs retry (>0)
    dataRows.forEach((row) => {
      const attempts = parseInt(row[failedAttemptsIndex] ?? '0', 10);
      if (isNaN(attempts) || attempts === 0) pure++;
      else retry++;
    });
  }

  return {
    total: uniqueSymbols.length,
    pure,
    retry,
    symbols: uniqueSymbols,
  };
}

// ─── Date helper (sort CSVs by date in filename) ─────────────────────────────

function parseDateFromFilename(name: string): Date {
  // Filename format: nse_breakout_daily_05jun2025.csv
  const match = name.match(
    /(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})/i
  );
  if (!match) return new Date(0);
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  return new Date(
    parseInt(match[3], 10),
    months[match[2].toLowerCase()],
    parseInt(match[1], 10)
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScanStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'failed', error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ status: 'failed', error: 'Missing jobId' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo =
      process.env.NEXT_PUBLIC_GITHUB_REPO || 'your-username/screener-cloud';

    if (!githubToken) {
      return res
        .status(500)
        .json({ status: 'failed', error: 'GitHub token not configured' });
    }

    const authHeaders = {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };

    // ── 1. Check latest workflow run status ──────────────────────────────────
    const workflowResponse = await axios.get(
      `https://api.github.com/repos/${githubRepo}/actions/workflows/screener.yml/runs?per_page=1`,
      { headers: authHeaders }
    );

    if (
      !workflowResponse.data.workflow_runs ||
      workflowResponse.data.workflow_runs.length === 0
    ) {
      return res.status(200).json({
        status: 'pending',
        message: 'Waiting for workflow to start',
      });
    }

    const latestRun = workflowResponse.data.workflow_runs[0];
    const isCompleted = latestRun.status === 'completed';
    const conclusion = latestRun.conclusion;

    if (!isCompleted) {
      return res.status(200).json({
        status: 'pending',
        message: 'Scan in progress...',
      });
    }

    if (conclusion !== 'success') {
      return res.status(200).json({
        status: 'failed',
        error: `Workflow failed with conclusion: ${conclusion}`,
      });
    }

    // ── 2. Workflow succeeded — find the latest CSV in backend/results/ ───────
    try {
      const contentsResponse = await axios.get(
        `https://api.github.com/repos/${githubRepo}/contents/backend/results`,
        { headers: authHeaders }
      );

      const files: Array<{ name: string; download_url: string }> =
        contentsResponse.data;

      const latestFile = files
        .filter((f) => f.name.endsWith('.csv'))
        .sort(
          (a, b) =>
            parseDateFromFilename(b.name).getTime() -
            parseDateFromFilename(a.name).getTime()
        )[0];

      if (!latestFile) {
        return res.status(200).json({
          status: 'completed',
          success: true,
          message: 'Scan completed but no CSV found in results folder.',
          results: { total: 0, pure: 0, retry: 0, symbols: [] },
        });
      }

      // ── 3. Fetch and parse the CSV ─────────────────────────────────────────
      const csvResponse = await axios.get<string>(latestFile.download_url, {
        headers: { Authorization: `token ${githubToken}` },
        responseType: 'text',
      });

      const results = parseCsvResults(csvResponse.data);

      return res.status(200).json({
        status: 'completed',
        success: true,
        csvFile: latestFile.name,
        downloadUrl: latestFile.download_url,
        results,
      });

    } catch {
      // Results folder doesn't exist yet (first ever run, or empty)
      return res.status(200).json({
        status: 'completed',
        success: true,
        message: 'Scan completed. Results folder not found.',
        results: { total: 0, pure: 0, retry: 0, symbols: [] },
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking scan status:', message);
    return res.status(200).json({
      status: 'pending',
      message: 'Checking status...',
    });
  }
}

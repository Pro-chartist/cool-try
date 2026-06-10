import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getGitHubAuthHeaders, getGitHubConfig, getGitHubErrorMessage } from '../../lib/github';

type ScanResults = {
    total: number;
    pure?: number;
    retry?: number;
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

type GitHubWorkflowRun = {
  status: string;
  conclusion: string | null;
  created_at: string;
};

type GitHubContentFile = {
  name: string;
  download_url: string | null;
  type: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
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

function parseCsvResults(csvText: string): ScanResults {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { total: 0, pure: 0, retry: 0, symbols: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const symbolColIndex =
    headers.indexOf('TV Symbol') !== -1
      ? headers.indexOf('TV Symbol')
      : headers.indexOf('TV_Symbol');
  const failedAttemptsIndex = headers.indexOf('Failed Attempts');

  if (symbolColIndex === -1) {
    return { total: 0, pure: 0, retry: 0, symbols: [] };
  }

  const dataRows = lines.slice(1).map((line) => parseCsvLine(line));
  const symbols = dataRows
    .map((row) => row[symbolColIndex])
    .filter((symbol): symbol is string => Boolean(symbol));
  const uniqueSymbols = Array.from(new Set(symbols));


    const symbolRowMap = new Map<string, string[]>();
dataRows.forEach((row) => {
  const sym = row[symbolColIndex];
  if (!sym) return;
  const existing = symbolRowMap.get(sym);
  if (!existing) {
    symbolRowMap.set(sym, row);
  } else if (failedAttemptsIndex !== -1) {
    const newAttempts = Number.parseInt(row[failedAttemptsIndex] ?? '99', 10);
    const oldAttempts = Number.parseInt(existing[failedAttemptsIndex] ?? '99', 10);
    if (newAttempts < oldAttempts) symbolRowMap.set(sym, row);
  }
});

const dedupedRows = Array.from(symbolRowMap.values());
    
    let pure = 0;
    let retry = 0;
    
    if (failedAttemptsIndex !== -1) {
      dedupedRows.forEach((row) => {
        const attempts = Number.parseInt(row[failedAttemptsIndex] ?? '0', 10);
        if (Number.isNaN(attempts) || attempts === 0) {
          pure += 1;
        } else {
          retry += 1;
        }
      });
    }
    
    return {
      total: dedupedRows.length,
      pure: failedAttemptsIndex !== -1 ? pure : undefined,
      retry: failedAttemptsIndex !== -1 ? retry : undefined,
      symbols: uniqueSymbols,
    };
}

return {
  total: dedupedRows.length,
  pure: failedAttemptsIndex !== -1 ? pure : undefined,
  retry: failedAttemptsIndex !== -1 ? retry : undefined,
  symbols: uniqueSymbols,
};
}

function parseDateFromFilename(name: string): Date {
  const match = name.match(
    /(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})/i
  );

  if (!match) {
    return new Date(0);
  }

  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  return new Date(
    Number.parseInt(match[3], 10),
    months[match[2].toLowerCase()],
    Number.parseInt(match[1], 10)
  );
}

function getJobStartedAt(jobId: string): Date | undefined {
  const timestamp = Number.parseInt(jobId.split('-')[0] ?? '', 10);

  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return new Date(timestamp);
}

function getStringQueryParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScanStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'failed', error: 'Method not allowed' });
  }

  const jobId = getStringQueryParam(req.query.jobId);

  if (!jobId) {
    return res.status(400).json({ status: 'failed', error: 'Missing jobId' });
  }

  const marketFilter = getStringQueryParam(req.query.market)?.toLowerCase();
  const logicFilter = getStringQueryParam(req.query.logic)?.toLowerCase();
  const timeframeFilter = getStringQueryParam(req.query.timeframe)?.toLowerCase();
  const githubConfig = getGitHubConfig();

  if (githubConfig.error || !githubConfig.token || !githubConfig.repo) {
    return res.status(500).json({ status: 'failed', error: githubConfig.error });
  }

  const { token: githubToken, repo: githubRepo } = githubConfig;
  const authHeaders = getGitHubAuthHeaders(githubToken);

  try {
    const workflowResponse = await axios.get<{ workflow_runs?: GitHubWorkflowRun[] }>(
      `https://api.github.com/repos/${githubRepo}/actions/workflows/screener.yml/runs`,
      {
        headers: authHeaders,
        params: { event: 'repository_dispatch', per_page: 10 },
      }
    );

    const jobStartedAt = getJobStartedAt(jobId);
    const matchingRuns = (workflowResponse.data.workflow_runs ?? []).filter((run) => {
      if (!jobStartedAt) {
        return true;
      }

      return new Date(run.created_at).getTime() >= jobStartedAt.getTime();
    });

    if (matchingRuns.length === 0) {
      return res.status(200).json({
        status: 'pending',
        message: 'Waiting for workflow to start',
      });
    }

    const latestRun = matchingRuns[0];

    if (latestRun.status !== 'completed') {
      return res.status(200).json({
        status: 'pending',
        message: 'Scan in progress...',
      });
    }

    if (latestRun.conclusion !== 'success') {
      return res.status(200).json({
        status: 'failed',
        error: `Workflow failed with conclusion: ${latestRun.conclusion ?? 'unknown'}`,
      });
    }

    try {
      const contentsResponse = await axios.get<GitHubContentFile[]>(
        `https://api.github.com/repos/${githubRepo}/contents/backend/results`,
        { headers: authHeaders }
      );

      const expectedPrefix =
        marketFilter && logicFilter && timeframeFilter
          ? `${marketFilter}_${logicFilter}_${timeframeFilter}_`
          : undefined;

      const latestFile = contentsResponse.data
        .filter((file) => file.type === 'file' && file.download_url)
        .filter((file) => file.name.endsWith('.csv'))
        .filter((file) => !expectedPrefix || file.name.startsWith(expectedPrefix))
        .sort(
          (a, b) =>
            parseDateFromFilename(b.name).getTime() -
            parseDateFromFilename(a.name).getTime()
        )[0];

      if (!latestFile?.download_url) {
        return res.status(200).json({
          status: 'completed',
          success: true,
          message: 'Scan completed but no matching CSV was found in backend/results.',
          results: { total: 0, pure: 0, retry: 0, symbols: [] },
        });
      }

      const csvResponse = await axios.get<string>(latestFile.download_url, {
        responseType: 'text',
      });

      return res.status(200).json({
        status: 'completed',
        success: true,
        csvFile: latestFile.name,
        downloadUrl: latestFile.download_url,
        results: parseCsvResults(csvResponse.data),
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return res.status(200).json({
          status: 'completed',
          success: true,
          message: 'Scan completed. Results folder not found.',
          results: { total: 0, pure: 0, retry: 0, symbols: [] },
        });
      }

      throw error;
    }
  } catch (error) {
    const message = getGitHubErrorMessage(error, githubRepo);
    console.error('Error checking scan status:', message);
    return res.status(500).json({ status: 'failed', error: message });
  }
}

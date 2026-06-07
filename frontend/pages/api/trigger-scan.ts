import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

type TriggerScanResponse = {
  success?: boolean;
  jobId?: string;
  message?: string;
  error?: string;
};

function getGitHubErrorMessage(error: unknown, githubRepo: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Failed to trigger scan';
  }

  if (error.response?.status === 404) {
    return [
      `GitHub repository not found or inaccessible: ${githubRepo}.`,
      'Set NEXT_PUBLIC_GITHUB_REPO to owner/repo and make sure GITHUB_TOKEN has access to that repository.',
    ].join(' ');
  }

  const githubMessage =
    typeof error.response?.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data
      ? String(error.response.data.message)
      : undefined;

  return githubMessage || error.message || 'Failed to trigger scan';
}

// FIX 1: Typed handler parameters
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TriggerScanResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // FIX 2: Type the request body so TypeScript doesn't infer `any`
    const { market, logic, timeframe, params } = req.body as {
      market: string;
      logic: string;
      timeframe: string;
      params: Record<string, unknown>;
    };

    if (!market || !logic || !timeframe) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo =
      process.env.NEXT_PUBLIC_GITHUB_REPO || 'your-username/screener-cloud';

    if (!githubToken) {
      return res.status(500).json({ error: 'GitHub token not configured' });
    }

    if (githubRepo === 'your-username/screener-cloud') {
      return res.status(500).json({
        error:
          'GitHub repo not configured. Set NEXT_PUBLIC_GITHUB_REPO to your owner/repo value.',
      });
    }

    if (!/^[^/]+\/[^/]+$/.test(githubRepo)) {
      return res.status(500).json({
        error:
          'Invalid NEXT_PUBLIC_GITHUB_REPO. Use the owner/repo format, for example octocat/screener-cloud.',
      });
    }

    await axios.post(
      `https://api.github.com/repos/${githubRepo}/dispatches`,
      {
        event_type: 'run-screener',
        client_payload: {
          market,
          logic,
          timeframe,
          params: JSON.stringify(params),
        },
      },
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    // FIX 3: substr() is deprecated — use substring()
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    return res.status(200).json({
      success: true,
      jobId,
      message: 'Scan triggered successfully',
    });
  } catch (error) {
    // FIX 4: error is `unknown` in catch — narrow before accessing .message
    const githubRepo =
      process.env.NEXT_PUBLIC_GITHUB_REPO || 'your-username/screener-cloud';
    const message = getGitHubErrorMessage(error, githubRepo);
    console.error('Error triggering scan:', message);
    return res.status(500).json({ error: message });
  }
}

import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getGitHubAuthHeaders, getGitHubConfig, getGitHubErrorMessage } from '../../lib/github';

type TriggerScanResponse = {
  success?: boolean;
  jobId?: string;
  message?: string;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TriggerScanResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market, logic, timeframe, params } = req.body as {
      market: string;
      logic: string;
      timeframe: string;
      params: Record<string, unknown>;
    };

    if (!market || !logic || !timeframe) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const githubConfig = getGitHubConfig();

    if (githubConfig.error || !githubConfig.token || !githubConfig.repo) {
      return res.status(500).json({ error: githubConfig.error });
    }

    const { token: githubToken, repo: githubRepo } = githubConfig;

    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    await axios.post(
      `https://api.github.com/repos/${githubRepo}/dispatches`,
      {
        event_type: 'run-screener',
        client_payload: {
          market,
          logic,
          timeframe,
          params: JSON.stringify(params),
          jobId,
        },
      },
      {
        headers: getGitHubAuthHeaders(githubToken),
      }
    );

    return res.status(200).json({
      success: true,
      jobId,
      message: 'Scan triggered successfully',
    });
  } catch (error) {
    const message = getGitHubErrorMessage(error, getGitHubConfig().repo);
    console.error('Error triggering scan:', message);
    return res.status(500).json({ error: message });
  }
}

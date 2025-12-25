import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy: GET /api/etl/admin/getJobStatus?jobId=...
 * Forwards to backend GET /etl/admin/getJobStatus?jobId=...
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const jobId = String(req.query.jobId ?? '').trim();
        if (!jobId) {
            return res.status(400).json({ message: 'jobId query param is required' });
        }

        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/getJobStatus?jobId=${encodeURIComponent(jobId)}`;
        console.log('[proxy/getJobStatus] forwarding to', target);

        const headers: Record<string, string> = {};
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, {
            method: 'GET',
            headers,
        });

        const text = await backendRes.text().catch(() => '');
        const ct = backendRes.headers.get('content-type') || '';

        res.status(backendRes.status);
        backendRes.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if (['transfer-encoding', 'content-encoding', 'connection'].includes(lk)) return;
            res.setHeader(k, v);
        });

        if (ct.includes('application/json')) {
            try {
                const json = JSON.parse(text);
                return res.json(json);
            } catch {
                return res.send(text);
            }
        }

        return res.send(text);
    } catch (err: any) {
        console.error('[proxy/getJobStatus] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}
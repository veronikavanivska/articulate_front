import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy: POST /api/etl/admin/recalcCycleScores?cycleId=...
 * Accepts cycleId as query param OR JSON body { cycleId }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {

        const cycleIdFromQuery = String(req.query.cycleId ?? '').trim();
        const cycleIdFromBody = req.body && (req.body.cycleId ?? req.body.cycle_id) ? String(req.body.cycleId ?? req.body.cycle_id) : '';
        const cycleId = cycleIdFromQuery || cycleIdFromBody;

        if (!cycleId) return res.status(400).json({ message: 'cycleId is required (query param or JSON body)' });

        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/recalcCycleScores?cycleId=${encodeURIComponent(cycleId)}`;
        console.log('[proxy/recalcCycleScores] forwarding to', target);

        const headers: Record<string, string> = {};
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, { method: 'POST', headers });

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
                return res.json(JSON.parse(text));
            } catch {
                return res.send(text);
            }
        }

        return res.send(text);
    } catch (err: any) {
        console.error('[proxy/recalcCycleScores] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}

import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy: POST /api/etl/admin/listMeinJournals
 * Forwards JSON body to backend /etl/admin/listMeinJournals and returns JSON.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/listMeinJournals`;
        console.log('[proxy/listMeinJournals] forwarding to', target);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body ?? {}),
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
        console.error('[proxy/listMeinJournals] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}
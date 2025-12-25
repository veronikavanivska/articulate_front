import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy: POST /api/etl/admin/deactivateMeinVersion?versionId=...
 * Forwards to backend /etl/admin/deactivateMeinVersion?versionId=...
 * Accepts versionId either as query param or in JSON body { versionId: ... }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const versionIdFromQuery = String(req.query.versionId ?? '').trim();
        const versionIdFromBody = req.body && (req.body.versionId ?? req.body.version_id) ? String(req.body.versionId ?? req.body.version_id) : '';
        const versionId = versionIdFromQuery || versionIdFromBody;

        if (!versionId) {
            return res.status(400).json({ message: 'versionId is required (query param or JSON body)' });
        }

        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/deactivateMeinVersion?versionId=${encodeURIComponent(versionId)}`;
        console.log('[proxy/deactivateMeinVersion] forwarding to', target);

        const headers: Record<string, string> = {};
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, {
            method: 'POST',
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
        console.error('[proxy/deactivateMeinVersion] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}
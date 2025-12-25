import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy: DELETE /api/etl/admin/deleteMeinVersion?versionId=...
 * Forwards to backend DELETE /etl/admin/deleteMeinVersion?versionId=...
 * Accepts versionId either as query param or in JSON body { versionId: ... }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const versionIdFromQuery = String(req.query.versionId ?? '').trim();
        const versionIdFromBody = req.body && (req.body.versionId ?? req.body.version_id) ? String(req.body.versionId ?? req.body.version_id) : '';
        const versionId = versionIdFromQuery || versionIdFromBody;

        if (!versionId) {
            return res.status(400).json({ message: 'versionId is required (query param or JSON body)' });
        }

        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/deleteMeinVersion?versionId=${encodeURIComponent(versionId)}`;
        console.log('[proxy/deleteMeinVersion] forwarding to', target);

        const headers: Record<string, string> = {};
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, {
            method: 'DELETE',
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
        console.error('[proxy/deleteMeinVersion] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}
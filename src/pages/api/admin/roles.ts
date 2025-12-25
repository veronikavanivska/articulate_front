import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[proxy pages] /api/admin/roles called. method=', req.method);
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        // Forward to backend. Change "/roles" -> "/admin/roles" if your backend exposes it there.
        const backendRes = await fetch(`${API_GATEWAY}/auth/roles`, { method: 'GET', headers });
        console.log('[proxy pages] backend status=', backendRes.status);
        const text = await backendRes.text().catch(() => '');
        console.log('[proxy pages] backend body preview=', text ? (text.length > 500 ? text.slice(0,500) + '...' : text) : '(empty)');

        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('[proxy pages] admin/roles proxy error', err);
        return res.status(500).json({ message: 'admin roles proxy failed', error: String(err) });
    }
}
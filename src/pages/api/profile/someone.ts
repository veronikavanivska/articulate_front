import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

/**
 * Proxy for GET /profile/someone?userId=...
 * Forwards Authorization and Cookie headers and returns backend response.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[proxy pages] /api/profile/someone called. method=', req.method, 'query=', req.query);

    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const forwardHeaders: Record<string, string> = { Accept: 'application/json' };
        if (req.headers.authorization) forwardHeaders['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) forwardHeaders['Cookie'] = String(req.headers.cookie);

        const qs = req.url?.split('?')[1] ?? '';
        const backendUrl = `${API_GATEWAY}/profile/someone${qs ? '?' + qs : ''}`;

        console.log('[proxy pages] forwarding to', backendUrl, 'headers: authorization=', !!req.headers.authorization, 'cookie=', !!req.headers.cookie);

        const backendRes = await fetch(backendUrl, { method: 'GET', headers: forwardHeaders });

        const text = await backendRes.text().catch(() => '');
        console.log('[proxy pages] backend status=', backendRes.status, 'body preview=', text ? (text.length > 500 ? text.slice(0,500) + '...' : text) : '(empty)');

        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            // if backend returned plain text
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('[proxy pages] someone proxy error', err);
        return res.status(500).json({ message: 'someone proxy failed', error: String(err) });
    }
}
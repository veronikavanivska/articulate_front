// src/pages/api/profile/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[DEBUG] /api/profile/me called. method=', req.method);
    console.log('[DEBUG] incoming headers:', req.headers);

    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const headers: Record<string, string> = { Accept: 'application/json' };

        // forward Authorization if present
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        // forward cookie if present (in case backend relies on cookies)
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        console.log('[DEBUG] forwarding headers to backend:', headers);

        const backendRes = await fetch(`${API_GATEWAY}/profile/me`, {
            method: 'GET',
            headers,
        });

        console.log('[DEBUG] backend status=', backendRes.status);
        const text = await backendRes.text().catch(() => '');
        console.log('[DEBUG] backend body preview:', text.slice(0, 2000));

        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('[DEBUG] profile/me proxy error', err);
        return res.status(500).json({ message: 'Profile proxy failed', error: String(err) });
    }
}
import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[DEBUG] /api/auth/admin/enable-disable called. method=', req.method);

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(`${API_GATEWAY}/auth/admin/enable-disable`, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body),
        });

        const text = await backendRes.text().catch(() => '');
        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('enable-disable proxy error', err);
        return res.status(500).json({ message: 'enable-disable proxy failed', error: String(err) });
    }
}
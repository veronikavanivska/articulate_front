import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[DEBUG] /api/profile/deleteDiscipline called. method=', req.method);

    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const qs = req.url?.split('?')[1] ?? '';
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(`${API_GATEWAY}/profile/deleteDiscipline${qs ? '?' + qs : ''}`, {
            method: 'DELETE',
            headers,
        });

        const text = await backendRes.text().catch(() => '');
        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('deleteDiscipline proxy error', err);
        return res.status(500).json({ message: 'deleteDiscipline proxy failed', error: String(err) });
    }
}
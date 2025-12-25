import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[DEBUG] /api/profile/addDiscipline called. method=', req.method);

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const qs = req.url?.split('?')[1] ?? '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(`${API_GATEWAY}/profile/addDiscipline${qs ? '?' + qs : ''}`, {
            method: 'POST',
            headers,
            // backend expects query params and no body, but if you send body forward it as well
            body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined,
        });

        const text = await backendRes.text().catch(() => '');
        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('addDiscipline proxy error', err);
        return res.status(500).json({ message: 'addDiscipline proxy failed', error: String(err) });
    }
}
import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
        if (req.headers.cookie) headers['Cookie'] = req.headers.cookie;

        const backendRes = await fetch(`${API_GATEWAY}/auth/change-email`, {
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
        console.error('change-email proxy error', err);
        return res.status(500).json({ message: 'Change email proxy failed', error: String(err) });
    }
}
// src/pages/api/auth/refresh.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const backendRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                cookie: req.headers.cookie ?? '',
                accept: 'application/json',
            },
        });

        const text = await backendRes.text();
        const setCookie = backendRes.headers.get('set-cookie');
        if (setCookie) {
            // forward Set-Cookie header(s)
            res.setHeader('set-cookie', setCookie);
        }
        res.status(backendRes.status).send(text);
    } catch (err) {
        console.error('Proxy /api/auth/refresh error', err);
        res.status(502).send('Proxy error');
    }
}
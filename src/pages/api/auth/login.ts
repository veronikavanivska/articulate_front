import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';
const REFRESH_MAX_AGE = parseInt(process.env.REFRESH_COOKIE_MAX_AGE || '2592000', 10); // seconds

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const backendRes = await fetch(`${API_GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
        });

        const body = await backendRes.json().catch(() => ({}));

        if (!backendRes.ok) {
            return res.status(backendRes.status).json(body);
        }

        const accessToken = body.accessToken ?? body.access_token ?? null;
        const refreshToken = body.refreshToken ?? body.refresh_token ?? null;

        if (!refreshToken) {
            return res.status(200).json({ accessToken });
        }

        const secure = process.env.NODE_ENV === 'production';
        const cookie = [
            `refreshToken=${encodeURIComponent(refreshToken)}`,
            'HttpOnly',
            `Path=/`,
            `Max-Age=${REFRESH_MAX_AGE}`,
            `SameSite=Strict`,
            secure ? 'Secure' : '',
        ]
            .filter(Boolean)
            .join('; ');

        res.setHeader('Set-Cookie', cookie);
        return res.status(200).json({ accessToken });
    } catch (err) {
        console.error('login proxy error', err);
        return res.status(500).json({ message: 'Login proxy failed' });
    }
}
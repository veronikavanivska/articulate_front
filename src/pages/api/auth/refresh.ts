import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';
const REFRESH_MAX_AGE = parseInt(process.env.REFRESH_COOKIE_MAX_AGE || '2592000', 10); // seconds

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    // Prefer Next's parsed cookies, fallback to header parse
    const refreshTokenFromCookie = (req.cookies && req.cookies.refreshToken) || (() => {
        const cookieHeader = req.headers.cookie || '';
        const found = cookieHeader
            .split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('refreshToken='));
        return found ? decodeURIComponent(found.split('=')[1]) : undefined;
    })();

    if (!refreshTokenFromCookie) {
        return res.status(401).json({ message: 'No refresh token' });
    }

    try {
        const backendRes = await fetch(`${API_GATEWAY}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refreshTokenFromCookie }),
        });

        const body = await backendRes.json().catch(() => ({}));

        if (!backendRes.ok) {
            // clear cookie on failure
            const secure = process.env.NODE_ENV === 'production';
            const clearCookie = [
                `refreshToken=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`,
                secure ? 'Secure' : '',
            ].filter(Boolean).join('; ');
            res.setHeader('Set-Cookie', clearCookie);
            return res.status(backendRes.status).json(body);
        }

        const accessToken = body.accessToken ?? body.access_token ?? null;
        const newRefresh = body.refreshToken ?? body.refresh_token ?? null;

        if (newRefresh) {
            const secure = process.env.NODE_ENV === 'production';
            const cookie = [
                `refreshToken=${encodeURIComponent(newRefresh)}`,
                'HttpOnly',
                `Path=/`,
                `Max-Age=${REFRESH_MAX_AGE}`,
                `SameSite=Strict`,
                secure ? 'Secure' : '',
            ]
                .filter(Boolean)
                .join('; ');
            res.setHeader('Set-Cookie', cookie);
        }

        return res.status(200).json({ accessToken });
    } catch (err) {
        console.error('refresh proxy error', err);
        return res.status(500).json({ message: 'Refresh proxy failed' });
    }
}
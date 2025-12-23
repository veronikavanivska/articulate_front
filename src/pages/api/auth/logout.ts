import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        // forward Authorization header if client passed it (so backend can identify user)
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

        await fetch(`${API_GATEWAY}/auth/logout`, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body ?? {}),
        }).catch((e) => {
            // ignore backend errors here — we'll clear cookie anyway
            console.warn('backend logout call failed', e);
        });
    } catch (err) {
        console.error('logout proxy error', err);
    } finally {
        // clear refresh cookie locally
        const secure = process.env.NODE_ENV === 'production';
        const clearCookie = [
            `refreshToken=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`,
            secure ? 'Secure' : '',
        ]
            .filter(Boolean)
            .join('; ');
        res.setHeader('Set-Cookie', clearCookie);
        return res.status(200).json({ ok: true });
    }
}
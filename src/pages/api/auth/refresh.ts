import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8888'; // <- ustaw właściwy adres backendu

function getCookieValueRaw(cookieHeader: string, name: string): string | null {
    if (!cookieHeader) return null;
    const pairs = cookieHeader.split(';').map(p => p.trim());
    for (const p of pairs) {
        if (p.startsWith(name + '=')) {
            return p.substring(name.length + 1); // raw value, no decode
        }
    }
    return null;
}

function buildSetCookieHeader(refreshToken: string) {
    // In dev use SameSite=Lax and no Secure. In production use SameSite=None; Secure
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    // HttpOnly, Path=/ so cookie is sent on all requests to our domain
    return `refreshToken=${refreshToken}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${secure}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        console.log('[proxy pages] /api/auth/refresh called');

        const cookieHeader = req.headers.cookie ?? '';
        console.log('[proxy pages] incoming cookie present:', !!cookieHeader);

        // Try to extract refresh token from cookie (if present)
        const incomingRefreshToken =
            getCookieValueRaw(cookieHeader, 'refreshToken')
            ?? getCookieValueRaw(cookieHeader, 'refresh_token')
            ?? getCookieValueRaw(cookieHeader, 'rt')
            ?? null;

        // Build request body expected by backend: { refreshToken: "..." }
        const bodyObj = { refreshToken: incomingRefreshToken };

        console.log('[proxy pages] forwarding refresh token to backend (presence only)');

        const backendRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
            },
            body: JSON.stringify(bodyObj),
        });

        const text = await backendRes.text();
        console.log('[proxy pages] backend status=', backendRes.status);
        console.log('[proxy pages] backend body preview=', text ? (text.length > 300 ? text.slice(0, 300) + '...' : text) : '(empty)');

        // Try to parse JSON response
        let parsed: any = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch (e) {
            parsed = null;
        }

        // If backend returned a refreshToken in body, set it as HttpOnly cookie for client
        if (parsed && parsed.refreshToken) {
            const newRefresh = String(parsed.refreshToken);
            // set cookie header for client
            const cookieHeaderToSet = buildSetCookieHeader(newRefresh);
            // Forward Set-Cookie to the client (overwrite any existing)
            res.setHeader('set-cookie', cookieHeaderToSet);
            console.log('[proxy pages] set HttpOnly refreshToken cookie for client (masked)');

            // Remove refreshToken from body before forwarding to client (do not leak raw token)
            delete parsed.refreshToken;
            const forwardedBody = JSON.stringify(parsed);

            const ct = backendRes.headers.get('content-type');
            if (ct) res.setHeader('content-type', ct);

            return res.status(backendRes.status).send(forwardedBody);
        }

        // If backend provided Set-Cookie header itself, forward it too
        const setCookie = backendRes.headers.get('set-cookie');
        if (setCookie) {
            res.setHeader('set-cookie', setCookie);
            console.log('[proxy pages] forwarded backend set-cookie header');
        }

        // Forward content-type if present
        const ct = backendRes.headers.get('content-type');
        if (ct) res.setHeader('content-type', ct);

        // Default: forward raw text body (could be empty)
        return res.status(backendRes.status).send(text);
    } catch (err) {
        console.error('[proxy pages] error', err);
        res.status(502).send('Proxy error');
    }
}
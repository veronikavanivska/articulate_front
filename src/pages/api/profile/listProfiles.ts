// import type { NextApiRequest, NextApiResponse } from 'next';
//
// const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';
//
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//     console.log('[proxy pages] /api/profile/listProfiles called. method=', req.method);
//     // log presence of auth header / cookie for debugging (mask token)
//     const authHeader = req.headers.authorization ?? '';
//     console.log('[proxy pages] incoming Authorization present=', !!authHeader, 'sample=', String(authHeader).slice(0, 20).replace(/./g, '*'));
//     console.log('[proxy pages] incoming cookie present=', !!req.headers.cookie);
//
//     if (req.method !== 'POST') {
//         res.setHeader('Allow', ['POST']);
//         return res.status(405).end('Method Not Allowed');
//     }
//
//     try {
//         const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
//         if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
//         if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);
//
//         const backendRes = await fetch(`${API_GATEWAY}/profile/listProfiles`, {
//             method: 'POST',
//             headers,
//             body: JSON.stringify(req.body),
//         });
//
//         console.log('[proxy pages] backend status=', backendRes.status);
//         const text = await backendRes.text().catch(() => '');
//         console.log('[proxy pages] backend body preview=', text ? (text.length > 200 ? text.slice(0, 200) + '...' : text) : '(empty)');
//
//         try {
//             const json = JSON.parse(text);
//             return res.status(backendRes.status).json(json);
//         } catch {
//             return res.status(backendRes.status).send(text || '');
//         }
//     } catch (err) {
//         console.error('[proxy pages] listProfiles proxy error', err);
//         return res.status(500).json({ message: 'listProfiles proxy failed', error: String(err) });
//     }
// }

import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log('[proxy pages] /api/profile/listProfiles called. method=', req.method);

    // debug headers
    console.log('[proxy pages] incoming headers content-type=', req.headers['content-type']);
    console.log('[proxy pages] incoming cookie present=', !!req.headers.cookie);
    console.log('[proxy pages] incoming authorization present=', !!req.headers.authorization);

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        // Log what Next parsed as body
        try {
            console.log('[proxy pages] req.body type=', typeof req.body, 'value preview=', (() => {
                try {
                    if (req.body == null) return '(null)';
                    if (typeof req.body === 'string') return req.body.length > 200 ? req.body.slice(0,200) + '...' : req.body;
                    return JSON.stringify(req.body).slice(0, 500);
                } catch (e) {
                    return '[cannot stringify body]';
                }
            })());
        } catch (e) {
            console.error('[proxy pages] error logging req.body', e);
        }

        // Build headers to forward
        const forwardHeaders: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
        if (req.headers.authorization) forwardHeaders['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) forwardHeaders['Cookie'] = String(req.headers.cookie);

        // Prepare body to forward. If req.body is an object => stringify.
        // If it's string => forward as-is. If empty, forward '{}' (or change behavior as needed).
        let forwardBody: string | undefined;
        if (req.body == null || (typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
            // If client really sent empty body, log Content-Length for debugging
            const cl = req.headers['content-length'] ?? 'unknown';
            console.log('[proxy pages] req.body empty — content-length=', cl);
            // forward empty object so backend sees valid JSON (change if backend expects no body)
            forwardBody = JSON.stringify({ fullName: '', page: 0, size: 20 });
        } else if (typeof req.body === 'string') {
            forwardBody = req.body;
        } else {
            // object
            forwardBody = JSON.stringify(req.body);
        }

        // Forward request to backend
        const backendRes = await fetch(`${API_GATEWAY}/profile/listProfiles`, {
            method: 'POST',
            headers: forwardHeaders,
            body: forwardBody,
        });

        const text = await backendRes.text().catch(() => '');
        console.log('[proxy pages] backend status=', backendRes.status, 'body preview=', text ? (text.length > 200 ? text.slice(0,200) + '...' : text) : '(empty)');

        try {
            const json = JSON.parse(text);
            return res.status(backendRes.status).json(json);
        } catch {
            return res.status(backendRes.status).send(text || '');
        }
    } catch (err) {
        console.error('[proxy pages] listProfiles proxy error', err);
        return res.status(500).json({ message: 'listProfiles proxy failed', error: String(err) });
    }
}
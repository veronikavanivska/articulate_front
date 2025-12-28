// pages/api/article/worker/[...path].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

// Zostawiam jak w Twoim przykładzie (mechanizm opcjonalny).
// Dla pokazanych endpointów article/worker raczej nie będzie potrzebny.
const GET_WITH_BODY = new Set<string>([]);

function copyBackendHeadersToRes(res: NextApiResponse, backendHeaders: Record<string, any>) {
    for (const [k, v] of Object.entries(backendHeaders)) {
        const lk = k.toLowerCase();
        if (['transfer-encoding', 'content-encoding', 'connection', 'keep-alive'].includes(lk)) continue;
        if (typeof v === 'undefined') continue;
        res.setHeader(k, v as any);
    }
}

function requestRaw(
    target: string,
    method: string,
    headers: Record<string, string>,
    bodyStr?: string
): Promise<{ status: number; headers: Record<string, any>; body: string }> {
    return new Promise((resolve, reject) => {
        const u = new URL(target);
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;

        const reqHeaders: Record<string, string> = { ...headers };
        if (bodyStr != null) reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));

        const r = lib.request(
            {
                method,
                hostname: u.hostname,
                port: u.port ? Number(u.port) : isHttps ? 443 : 80,
                path: u.pathname + u.search,
                headers: reqHeaders,
            },
            (backendRes) => {
                let data = '';
                backendRes.setEncoding('utf8');
                backendRes.on('data', (chunk) => (data += chunk));
                backendRes.on('end', () => {
                    resolve({
                        status: backendRes.statusCode || 500,
                        headers: backendRes.headers as any,
                        body: data,
                    });
                });
            }
        );

        r.on('error', reject);
        if (bodyStr != null) r.write(bodyStr);
        r.end();
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const qs = req.url?.split('?')[1] ?? '';

    // wymagane przez Ciebie w każdym pliku:
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
    if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

    try {
        const pathParam = req.query.path;
        const parts = Array.isArray(pathParam) ? pathParam : [String(pathParam ?? '')].filter(Boolean);
        if (parts.length === 0) return res.status(400).json({ message: 'Missing path' });

        const leaf = parts[parts.length - 1];

        const backendBase = API_GATEWAY.replace(/\/$/, '');
        // API Gateway: /article/worker/<...>
        const backendUrl = `${backendBase}/article/worker/${parts.map(encodeURIComponent).join('/')}${
            qs ? `?${qs}` : ''
        }`;
        console.log('[api/article/worker] body=', req.body);

        const bodyStr =
            req.body == null ? '' : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        const shouldDoGetWithBody = req.method === 'POST' && GET_WITH_BODY.has(leaf);
        if (shouldDoGetWithBody) {
            const out = await requestRaw(backendUrl, 'GET', headers, bodyStr || '{}');
            res.status(out.status);
            copyBackendHeadersToRes(res, out.headers);

            const ct = String(out.headers['content-type'] ?? '');
            if (ct.includes('application/json')) {
                try {
                    return res.json(JSON.parse(out.body || 'null'));
                } catch {
                    return res.send(out.body);
                }
            }
            return res.send(out.body);
        }

        const method = (req.method || 'GET').toUpperCase();

        const backendRes = await fetch(backendUrl, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : bodyStr || undefined,
        } as any);

        const text = await backendRes.text().catch(() => '');
        res.status(backendRes.status);

        const ct = backendRes.headers.get('content-type') || '';
        backendRes.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if (['transfer-encoding', 'content-encoding', 'connection', 'keep-alive'].includes(lk)) return;
            res.setHeader(k, v);
        });

        if (ct.includes('application/json')) {
            try {
                return res.json(JSON.parse(text || 'null'));
            } catch {
                return res.send(text);
            }
        }
        return res.send(text);
    } catch (err: any) {
        console.error('[api/article/worker] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}

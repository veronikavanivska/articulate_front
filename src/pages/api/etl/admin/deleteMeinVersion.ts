import type { NextApiRequest, NextApiResponse } from 'next';

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

function copyResponseHeaders(backendRes: Response, res: NextApiResponse) {
    const anyHeaders = backendRes.headers as any;
    const setCookies: string[] = anyHeaders.getSetCookie?.() ?? [];
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);

    backendRes.headers.forEach((v, k) => {
        const lk = k.toLowerCase();
        if (['transfer-encoding', 'content-encoding', 'connection'].includes(lk)) return;
        if (lk === 'set-cookie') return;
        res.setHeader(k, v);
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const qs = req.url?.split('?')[1] ?? '';
        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/deleteMeinVersion${qs ? `?${qs}` : ''}`;
        console.log('[proxy/deleteMeinVersion] ->', target);

        const headers: Record<string, string> = {
            Accept: 'application/json',
        };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const backendRes = await fetch(target, { method: 'DELETE', headers });

        const text = await backendRes.text().catch(() => '');
        copyResponseHeaders(backendRes, res);
        res.status(backendRes.status);

        const ct = backendRes.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try {
                return res.json(JSON.parse(text));
            } catch {
                return res.send(text);
            }
        }
        return res.send(text);
    } catch (err: any) {
        console.error('[proxy/deleteMeinVersion] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}

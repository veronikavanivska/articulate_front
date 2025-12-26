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
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const qs = req.url?.split('?')[1] ?? '';
        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/listMeinMonoVersions${qs ? `?${qs}` : ''}`;
        console.log('[proxy/listMeinMonoVersions] ->', target);

        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        const body = req.body ?? {};
        const page = Number(body.page ?? 0);
        const size = Number(body.size ?? 20);
        const sortDir = String(body.sortDir ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const backendRes = await fetch(target, {
            method: 'POST',
            headers,
            body: JSON.stringify({ page, size, sortDir }),
        });

        const text = await backendRes.text().catch(() => '');
        copyResponseHeaders(backendRes, res);
        res.status(backendRes.status);

        const ct = backendRes.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try {
                const json = JSON.parse(text);
                // backend: { items: [...], pageMeta: ... }
                const items = json?.items ?? json?.item ?? [];
                return res.json({ ...json, items });
            } catch {
                return res.send(text);
            }
        }

        return res.send(text);
    } catch (err: any) {
        console.error('[proxy/listMeinMonoVersions] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
    api: { bodyParser: false },
};

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

async function readRawBodyAsArrayBuffer(req: NextApiRequest): Promise<ArrayBuffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const qs = req.url?.split('?')[1] ?? '';
        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/importPDF${qs ? `?${qs}` : ''}`;
        console.log('[proxy/importPDF] ->', target);

        const headers: Record<string, string> = { Accept: 'application/json' };
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);
        if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']); // boundary!

        const body = await readRawBodyAsArrayBuffer(req);

        const backendRes = await fetch(target, { method: 'POST', headers, body });

        const text = await backendRes.text().catch(() => '');
        copyResponseHeaders(backendRes, res);
        res.status(backendRes.status);

        const ct = backendRes.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { return res.json(JSON.parse(text)); } catch { return res.send(text); }
        }
        return res.send(text);
    } catch (err: any) {
        console.error('[proxy/importPDF] error', err);
        return res.status(500).json({ message: 'Proxy failed', error: String(err?.message ?? err) });
    }
}

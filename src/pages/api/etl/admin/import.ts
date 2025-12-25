import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Debug proxy for POST /api/etl/admin/import
 * - bodyParser is disabled to forward raw multipart bodies.
 * - Adds verbose logging (Content-Type, body length, first bytes).
 * - Forwards Authorization and Cookie headers.
 * - Set API_GATEWAY_URL in .env.local (e.g. http://localhost:8888).
 *
 * Remove/shorten logging after debugging.
 */
export const config = {
    api: {
        bodyParser: false,
    },
};

const API_GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:8888';

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function hexPreview(buf: Buffer, max = 200) {
    const slice = buf.slice(0, max);
    return slice.toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const target = `${API_GATEWAY.replace(/\/$/, '')}/etl/admin/import`;
        console.log('[proxy/import] forwarding to', target);

        const rawBody = await getRawBody(req);

        console.log('[proxy/import] incoming headers:');
        console.log(JSON.stringify(req.headers, null, 2));
        console.log('[proxy/import] rawBody length =', rawBody.length);
        if (rawBody.length > 0) {
            console.log('[proxy/import] rawBody preview (hex, first 200 bytes):', hexPreview(rawBody, 200));
        } else {
            console.log('[proxy/import] rawBody is empty');
        }

        const headers: Record<string, string> = {};
        if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
        if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
        if (req.headers.cookie) headers['Cookie'] = String(req.headers.cookie);

        if (rawBody && rawBody.length) {
            headers['Content-Length'] = String(rawBody.length);
        }

        // remove host (and other hop-by-hop) to be safe
        delete headers['host'];

        console.log('[proxy/import] forwarding headers:', headers);

        const backendRes = await fetch(target, {
            method: 'POST',
            headers,
            body: rawBody && rawBody.length ? rawBody : undefined,
        });

        console.log('[proxy/import] backend status:', backendRes.status);

        // forward status + headers (skip hop-by-hop)
        res.status(backendRes.status);
        backendRes.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if ([
                'transfer-encoding', 'content-encoding', 'connection', 'keep-alive',
                'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'
            ].includes(lk)) return;
            res.setHeader(k, v);
        });

        const backendText = await backendRes.text().catch(() => null);
        console.log('[proxy/import] backend response body:', backendText);

        // Return backend body to caller so client can see the message
        if (backendText) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(backendText);
        } else {
            return res.end();
        }
    } catch (err: any) {
        console.error('[proxy/import] error', err);
        return res.status(500).json({ message: 'Proxy import failed', error: String(err?.message ?? err) });
    }
}
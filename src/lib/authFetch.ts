// lightweight fetch wrapper that attaches access token and tries refresh on 401
export async function authFetch(input: RequestInfo, init: RequestInit = {}, retry = true): Promise<Response> {
    const token: string | undefined = typeof window !== 'undefined' ? // @ts-ignore
        window.__ACCESS_TOKEN__ : undefined;

    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401 && retry) {
        try {
            const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
            if (r.ok) {
                const json = await r.json().catch(() => ({}));
                const newToken = json.accessToken ?? null;
                if (newToken) {
                    try {
                        // @ts-ignore
                        window.__ACCESS_TOKEN__ = newToken;
                        window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: newToken }));
                    } catch {}
                    const headers2 = new Headers(init.headers || {});
                    headers2.set('Authorization', `Bearer ${newToken}`);
                    headers2.set('Accept', 'application/json');
                    return fetch(input, { ...init, headers: headers2 });
                }
            }
        } catch (err) {
            console.error('authFetch refresh error', err);
        }
    }

    return res;
}
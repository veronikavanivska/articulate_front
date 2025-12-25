// lightweight fetch wrapper with single-flight refresh handling
let refreshingPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
    if (refreshingPromise) return refreshingPromise;

    refreshingPromise = (async () => {
        try {
            console.log('[authFetch] starting refresh');
            const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
            console.log('[authFetch] refresh returned', r.status);
            if (!r.ok) return null;
            const json = await r.json().catch(() => ({}));
            const newToken = json.accessToken ?? null;
            if (newToken) {
                try {
                    // store new token globally
                    // @ts-ignore
                    window.__ACCESS_TOKEN__ = newToken;
                    window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: newToken }));
                    console.log('[authFetch] refresh -> new accessToken set');
                } catch (e) { console.error(e); }
                return newToken;
            }
            return null;
        } finally {
            // reset so subsequent refreshes can run later
            refreshingPromise = null;
        }
    })();

    return refreshingPromise;
}

export async function authFetch(input: RequestInfo, init: RequestInit = {}, retry = true): Promise<Response> {
    // normalize URL: '/profile/...' -> '/api/profile/...'
    let url: string;
    if (typeof input === 'string') {
        url = (input.startsWith('/') && !input.startsWith('/api/')) ? `/api${input}` : input;
    } else {
        url = (input as Request).url;
    }

    const token: string | undefined = typeof window !== 'undefined' ? // @ts-ignore
        window.__ACCESS_TOKEN__ : undefined;

    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');

    const fetchInit: RequestInit = { ...init, headers, credentials: 'include' };

    console.log('[authFetch] fetching', url, 'with token present=', !!token);

    let res = await fetch(url, fetchInit);

    console.log('[authFetch] response', url, res.status);

    if (res.status === 401 && retry) {
        // single-flight refresh
        try {
            const newToken = await doRefresh();
            if (newToken) {
                const headers2 = new Headers(init.headers || {});
                headers2.set('Authorization', `Bearer ${newToken}`);
                headers2.set('Accept', 'application/json');

                const fetchInit2: RequestInit = { ...init, headers: headers2, credentials: 'include' };
                console.log('[authFetch] retrying', url, 'with refreshed token');
                return fetch(url, fetchInit2);
            }
            // refresh failed -> return original 401
        } catch (err) {
            console.error('authFetch refresh error', err);
            return res;
        }
    }

    return res;
}
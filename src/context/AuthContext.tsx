'use client';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

type AuthContextType = {
    accessToken: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    changeEmail: (newEmail: string) => Promise<void>;
    isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used inside AuthProvider'); return ctx; };

function parseJwtExpiry(token: string): number | null {
    try {
        const payload = token.split('.')[1];
        const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(decodeURIComponent(atob(b64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        return json?.exp ? json.exp * 1000 : null;
    } catch { return null; }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const refreshTimerRef = useRef<number | null>(null);
    const refreshingRef = useRef(false);

    useEffect(() => {
        try { // expose for legacy code if needed
            // @ts-ignore
            window.__ACCESS_TOKEN__ = accessToken ?? undefined;
        } catch {}
    }, [accessToken]);

    useEffect(() => {
        if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
        if (!accessToken) return;
        const expiry = parseJwtExpiry(accessToken);
        if (!expiry) return;
        const now = Date.now();
        const refreshAt = Math.max(0, expiry - now - 30_000);
        const timeout = refreshAt > 0 ? refreshAt : 1000;
        refreshTimerRef.current = window.setTimeout(async () => {
            await attemptRefreshWithRetries();
        }, timeout);
        return () => { if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    // Try refresh on mount (so F5 can restore session if refresh cookie present)
    useEffect(() => {
        (async () => {
            await attemptRefreshWithRetries(2, 800);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Safe refresh: do not throw on non-200; return boolean success
    async function attemptRefreshWithRetries(retries = 2, delayMs = 1000): Promise<boolean> {
        if (refreshingRef.current) return false;
        refreshingRef.current = true;
        try {
            for (let i = 0; i <= retries; i++) {
                try {
                    // Call our Next API proxy (ensure it exists)
                    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
                    // DEBUG: log status for easier debugging
                    // eslint-disable-next-line no-console
                    console.debug('refresh response status', res.status);
                    if (!res.ok) {
                        // 401/400 indicates invalid refresh; we must clear token
                        if (res.status === 401 || res.status === 400) {
                            setAccessToken(null);
                            refreshingRef.current = false;
                            return false;
                        }
                        // other statuses: retry if we can, else stop
                        if (i < retries) {
                            await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
                            continue;
                        } else {
                            // final failure -> do not throw, just return false
                            const text = await res.text().catch(() => '');
                            // eslint-disable-next-line no-console
                            console.warn('Refresh failed final:', res.status, text);
                            refreshingRef.current = false;
                            return false;
                        }
                    }
                    const data = await res.json().catch(() => ({}));
                    const newToken = data?.accessToken ?? null;
                    if (newToken) {
                        setAccessToken(newToken);
                        try {
                            // @ts-ignore
                            window.__ACCESS_TOKEN__ = newToken;
                            window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: newToken }));
                        } catch {}
                        refreshingRef.current = false;
                        return true;
                    } else {
                        // backend returned 200 but no accessToken — treat as failure
                        // eslint-disable-next-line no-console
                        console.warn('Refresh returned 200 but no accessToken', data);
                        refreshingRef.current = false;
                        return false;
                    }
                } catch (err) {
                    // network error -> retry if attempts remain
                    // eslint-disable-next-line no-console
                    console.warn('Refresh attempt error', err, 'attempt', i);
                    if (i < retries) {
                        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
                        continue;
                    } else {
                        refreshingRef.current = false;
                        return false;
                    }
                }
            }
            refreshingRef.current = false;
            return false;
        } finally {
            refreshingRef.current = false;
        }
    }

    const login = async (email: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Login failed' }));
            throw new Error(err.message || 'Login failed');
        }
        const data = await res.json().catch(() => ({}));
        const token = data.accessToken ?? null;
        setAccessToken(token);
    };

    const logout = async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
        setAccessToken(null);
        try { // @ts-ignore
            window.__ACCESS_TOKEN__ = undefined;
        } catch {}
    };

    const register = async (email: string, password: string) => {
        const res = await fetch('/api/auth/registration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        if (!res.ok) { const err = await res.json().catch(() => ({ message: 'Registration failed' })); throw new Error(err.message || 'Registration failed'); }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        const token = accessToken;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/auth/change-password', { method: 'POST', headers, body: JSON.stringify({ password: currentPassword, newPassword }), credentials: 'include' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Change password failed' }));
            throw new Error(err.message || 'Change password failed');
        }
        const body = await res.json().catch(() => ({}));
        if (body.accessToken) setAccessToken(body.accessToken);
    };

    const changeEmail = async (newEmail: string) => {
        const token = accessToken;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/auth/change-email', { method: 'POST', headers, body: JSON.stringify({ email: newEmail }), credentials: 'include' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Change email failed' }));
            throw new Error(err.message || 'Change email failed');
        }
    };

    const value = useMemo(() => ({ accessToken, login, logout, register, changePassword, changeEmail, isAuthenticated: !!accessToken }), [accessToken]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
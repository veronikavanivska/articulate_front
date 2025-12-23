'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [accessToken, setAccessToken] = useState<string | null>(null);

    useEffect(() => {
        try {
            // @ts-ignore
            window.__ACCESS_TOKEN__ = accessToken ?? undefined;
        } catch {}

        function onTokenUpdate(e: any) {
            const newToken = e?.detail ?? null;
            setAccessToken(newToken);
        }
        try {
            window.addEventListener('accessTokenUpdated', onTokenUpdate as EventListener);
        } catch {}
        return () => {
            try {
                window.removeEventListener('accessTokenUpdated', onTokenUpdate as EventListener);
            } catch {}
        };
    }, [accessToken]);

    useEffect(() => {
        let timer: number | undefined;

        function getExpiryFromJwt(token: string): number | null {
            try {
                const payload = token.split('.')[1];
                const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
                if (!decoded || !decoded.exp) return null;
                return decoded.exp * 1000;
            } catch {
                return null;
            }
        }

        async function scheduleRefresh(token: string) {
            const expiry = getExpiryFromJwt(token);
            if (!expiry) return;
            const now = Date.now();
            const refreshAt = Math.max(0, expiry - now - 30_000);
            timer = window.setTimeout(async () => {
                try {
                    const res = await fetch('/api/auth/refresh', { method: 'POST' });
                    if (res.ok) {
                        const data = await res.json();
                        setAccessToken(data.accessToken ?? null);
                    } else {
                        setAccessToken(null);
                    }
                } catch {
                    setAccessToken(null);
                }
            }, refreshAt);
        }

        if (accessToken) scheduleRefresh(accessToken);

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [accessToken]);

    const login = async (email: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Login failed' }));
            throw new Error(err.message || 'Login failed');
        }
        const data = await res.json();
        setAccessToken(data.accessToken ?? null);
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setAccessToken(null);
    };

    const register = async (email: string, password: string) => {
        const res = await fetch('/api/auth/registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Registration failed' }));
            throw new Error(err.message || 'Registration failed');
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        const token = (typeof window !== 'undefined' && // @ts-ignore
            window.__ACCESS_TOKEN__) ?? null;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers,
            body: JSON.stringify({ password: currentPassword, newPassword }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Change password failed' }));
            throw new Error(err.message || 'Change password failed');
        }

        const body = await res.json().catch(() => ({}));
        if (body.accessToken) {
            setAccessToken(body.accessToken);
            try {
                // @ts-ignore
                window.__ACCESS_TOKEN__ = body.accessToken;
                window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: body.accessToken }));
            } catch {}
        }
    };

    const changeEmail = async (newEmail: string) => {
        const token = (typeof window !== 'undefined' && // @ts-ignore
            window.__ACCESS_TOKEN__) ?? null;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/auth/change-email', {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: newEmail }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Change email failed' }));
            throw new Error(err.message || 'Change email failed');
        }
    };

    const value = useMemo(
        () => ({
            accessToken,
            login,
            logout,
            register,
            changePassword,
            changeEmail,
            isAuthenticated: !!accessToken,
        }),
        [accessToken]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
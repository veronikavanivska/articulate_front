// 'use client';
//
// import React, { createContext, useContext, useEffect, useState } from 'react';
//
// export type AuthContextValue = {
//     accessToken: string | null;
//     initialized: boolean;
//     setAccessToken: (t: string | null) => void;
//     login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
//     loginWithToken: (t: string) => void;
//     changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<void>;
//     changeEmail: (newEmail: string) => Promise<void>;
//     logout: () => Promise<void>;
//     register: (email: string, password: string) => Promise<void>;
// };
//
// const AuthContext = createContext<AuthContextValue | undefined>(undefined);
//
// export function useAuth(): AuthContextValue {
//     const ctx = useContext(AuthContext);
//     if (!ctx) throw new Error('useAuth must be used within AuthProvider');
//     return ctx;
// }
//
// export function AuthProvider({ children }: { children: React.ReactNode }) {
//     const [accessToken, setAccessTokenState] = useState<string | null>(null);
//     const [initialized, setInitialized] = useState(false);
//
//     // helper to set token both in state and window var for existing code
//     function setAccessToken(token: string | null) {
//         setAccessTokenState(token);
//         try {
//             // @ts-ignore
//             window.__ACCESS_TOKEN__ = token;
//             window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: token }));
//         } catch {}
//     }
//
//     useEffect(() => {
//         let mounted = true;
//         (async () => {
//             try {
//                 const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
//                 if (!mounted) return;
//                 if (r.ok) {
//                     const json = await r.json().catch(() => ({}));
//                     const newToken = json.accessToken ?? null;
//                     if (newToken) setAccessToken(newToken);
//                 } else {
//                     setAccessToken(null);
//                 }
//             } catch (err) {
//                 console.error('AuthProvider refresh error', err);
//                 setAccessToken(null);
//             } finally {
//                 if (mounted) setInitialized(true);
//             }
//         })();
//         return () => {
//             mounted = false;
//         };
//     }, []);
//     const register = async (email: string, password: string) => {
//         const res = await fetch('/api/auth/registration', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ email, password }),
//         });
//         if (!res.ok) {
//             const err = await res.json().catch(() => ({ message: 'Registration failed' }));
//             throw new Error(err.message || 'Registration failed');
//         }
//     };
//     async function login(email: string, password: string) {
//         try {
//             const res = await fetch('/api/auth/login', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 credentials: 'include', // important if backend sets refresh cookie
//                 body: JSON.stringify({ email, password }),
//             });
//             const text = await res.text().catch(() => '');
//             let json: any = {};
//             try { json = text ? JSON.parse(text) : {}; } catch {}
//             if (!res.ok) {
//                 const msg = json?.message ?? text ?? `HTTP ${res.status}`;
//                 return { ok: false, message: msg };
//             }
//             const token = json.accessToken ?? null;
//             if (token) setAccessToken(token);
//             return { ok: true };
//         } catch (err: any) {
//             console.error('login error', err);
//             return { ok: false, message: String(err?.message ?? err) };
//         }
//     }
//
//     function loginWithToken(token: string) {
//         setAccessToken(token);
//     }
//
//     async function logout() {
//         try {
//             await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
//         } catch (e) {
//             console.error('logout error', e);
//         } finally {
//             setAccessToken(null);
//         }
//     }
//
//     const changePassword = async (payload: { currentPassword: string; newPassword: string }) => {
//         const token = accessToken;
//         const headers: Record<string, string> = { 'Content-Type': 'application/json' };
//         if (token) headers['Authorization'] = `Bearer ${token}`;
//         const res = await fetch('/api/auth/change-password', {
//             method: 'POST',
//             headers,
//             body: JSON.stringify({ password: payload.currentPassword, newPassword: payload.newPassword }),
//             credentials: 'include',
//         });
//         if (!res.ok) {
//             const err = await res.json().catch(() => ({ message: 'Change password failed' }));
//             throw new Error(err.message || 'Change password failed');
//         }
//         const body = await res.json().catch(() => ({}));
//         if (body.accessToken) setAccessToken(body.accessToken);
//     };
//
//     const changeEmail = async (newEmail: string) => {
//         const token = accessToken;
//         const headers: Record<string, string> = { 'Content-Type': 'application/json' };
//         if (token) headers['Authorization'] = `Bearer ${token}`;
//         const res = await fetch('/api/auth/change-email', {
//             method: 'POST',
//             headers,
//             body: JSON.stringify({ email: newEmail }),
//             credentials: 'include',
//         });
//         if (!res.ok) {
//             const err = await res.json().catch(() => ({ message: 'Change email failed' }));
//             throw new Error(err.message || 'Change email failed');
//         }
//     };
//
//     const value: AuthContextValue = {
//         accessToken,
//         initialized,
//         setAccessToken,
//         login,
//         loginWithToken,
//         changePassword,
//         changeEmail,
//         logout,
//         register,
//     };
//
//     return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
// }

'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type AuthContextValue = {
    accessToken: string | null;
    initialized: boolean;
    setAccessToken: (t: string | null) => void;
    login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
    loginWithToken: (t: string) => void;
    changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<void>;
    changeEmail: (newEmail: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

/** Tłumaczenie komunikatów z backendu (EN -> PL) + fallback na stałe PL */
function translateAuthError(action: 'register' | 'login' | 'changeEmail' | 'changePassword', raw?: string): string {
    const msg = String(raw ?? '').trim();
    const lower = msg.toLowerCase();

    // ---- Typowe komunikaty z Twojego backendu (gRPC descriptions) ----
    if (lower.includes('email already exists')) return 'Taki adres e-mail już istnieje.';
    if (lower.includes('email is not right')) return 'Podany adres e-mail jest nieprawidłowy.';
    if (lower.includes('user does not exist')) return 'Użytkownik nie istnieje.';
    if (lower.includes('password does not match')) return 'Aktualne hasło jest nieprawidłowe.';
    if (lower.includes('password should be strong')) return 'Hasło jest zbyt słabe.';
    if (lower.includes('new password must be different')) return 'Nowe hasło musi być inne niż poprzednie.';

    // ---- Inne częste ----
    if (lower.includes('unauthorized') || lower.includes('unauthenticated') || lower.includes('token') || lower.includes('jwt'))
        return 'Sesja wygasła. Zaloguj się ponownie.';

    if (lower.includes('forbidden') || lower.includes('permission denied') || lower.includes('access denied'))
        return 'Brak uprawnień do wykonania tej operacji.';

    if (lower.includes('internal server error')) return 'Wystąpił błąd serwera.';

    // ---- Jeżeli backend zwraca coś dziwnego lub pusto: stałe komunikaty per akcja ----
    switch (action) {
        case 'register':
            return 'Nie udało się utworzyć konta.';
        case 'login':
            return 'Nieprawidłowy e-mail lub hasło.';
        case 'changeEmail':
            return 'Nie udało się zmienić adresu e-mail.';
        case 'changePassword':
            return 'Nie udało się zmienić hasła.';
        default:
            return 'Wystąpił błąd.';
    }
}

/** Zawsze próbujemy wyciągnąć message z odpowiedzi, ale i tak zwracamy PL */
async function readMessageFromResponse(res: Response): Promise<string | undefined> {
    // najpierw JSON
    try {
        const json = await res.clone().json();
        const m = json?.message ?? json?.error ?? json?.details;
        if (m) return String(m);
    } catch {}

    // potem tekst
    try {
        const text = await res.clone().text();
        if (text && text.trim()) return text.trim();
    } catch {}

    return undefined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [accessToken, setAccessTokenState] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);

    function setAccessToken(token: string | null) {
        setAccessTokenState(token);
        try {
            // @ts-ignore
            window.__ACCESS_TOKEN__ = token;
            window.dispatchEvent(new CustomEvent('accessTokenUpdated', { detail: token }));
        } catch {}
    }

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
                if (!mounted) return;
                if (r.ok) {
                    const json = await r.json().catch(() => ({}));
                    const newToken = json.accessToken ?? null;
                    if (newToken) setAccessToken(newToken);
                } else {
                    setAccessToken(null);
                }
            } catch (err) {
                console.error('AuthProvider refresh error', err);
                setAccessToken(null);
            } finally {
                if (mounted) setInitialized(true);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const register = async (email: string, password: string) => {
        const res = await fetch('/api/auth/registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const backendMsg = await readMessageFromResponse(res);
            throw new Error(translateAuthError('register', backendMsg));
        }
    };

    async function login(email: string, password: string) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });

            const text = await res.text().catch(() => '');
            let json: any = {};
            try { json = text ? JSON.parse(text) : {}; } catch {}

            if (!res.ok) {
                const backendMsg = json?.message ?? text ?? `HTTP ${res.status}`;
                return { ok: false, message: translateAuthError('login', backendMsg) };
            }

            const token = json.accessToken ?? null;
            if (token) setAccessToken(token);
            return { ok: true };
        } catch (err: any) {
            console.error('login error', err);
            return { ok: false, message: translateAuthError('login', String(err?.message ?? err)) };
        }
    }

    function loginWithToken(token: string) {
        setAccessToken(token);
    }

    async function logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error('logout error', e);
        } finally {
            setAccessToken(null);
        }
    }

    const changePassword = async (payload: { currentPassword: string; newPassword: string }) => {
        const token = accessToken;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers,
            body: JSON.stringify({ password: payload.currentPassword, newPassword: payload.newPassword }),
            credentials: 'include',
        });

        if (!res.ok) {
            const backendMsg = await readMessageFromResponse(res);
            throw new Error(translateAuthError('changePassword', backendMsg));
        }

        const body = await res.json().catch(() => ({}));
        if (body.accessToken) setAccessToken(body.accessToken);
    };

    const changeEmail = async (newEmail: string) => {
        const token = accessToken;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/auth/change-email', {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: newEmail }),
            credentials: 'include',
        });

        if (!res.ok) {
            const backendMsg = await readMessageFromResponse(res);
            throw new Error(translateAuthError('changeEmail', backendMsg));
        }
    };

    const value: AuthContextValue = {
        accessToken,
        initialized,
        setAccessToken,
        login,
        loginWithToken,
        changePassword,
        changeEmail,
        logout,
        register,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

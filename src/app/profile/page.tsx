'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { useAuth } from '@/context/AuthContext';
import styles from '../login/styles.module.css';

/** Parse roles from JWT payload and return normalized array (no ROLE_ prefix) */
function parseRolesFromJwt(token?: string | null): string[] {
    if (!token) return [];
    try {
        const parts = token.split('.');
        if (parts.length < 2) return [];
        const payload = parts[1];
        const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const json = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        const roles = json.roles ?? json.role ?? json.authorities ?? null;
        if (!roles) return [];
        if (Array.isArray(roles)) return roles.map((r: any) => String(r).replace(/^ROLE_/i, '').toLowerCase());
        if (typeof roles === 'string') return roles.split(',').map((r: string) => r.replace(/^ROLE_/i, '').trim().toLowerCase());
        return [];
    } catch (e) {
        console.error('parseRolesFromJwt', e);
        return [];
    }
}

/** Extract subject (sub) from JWT payload */
function getSubFromJwt(token?: string | null): string | null {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const json = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        return json?.sub ? String(json.sub) : null;
    } catch {
        return null;
    }
}

export default function ProfilePage() {
    const router = useRouter();
    const { accessToken, logout } = useAuth();
    const [profile, setProfile] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                const res = await authFetch('/api/profile/me', { method: 'GET' });
                if (!mounted) return;
                setStatus(res.status);
                if (!res.ok) {
                    setProfile(null);
                    return;
                }
                const data = await res.json().catch(() => null);
                setProfile(data ?? null);
            } catch (err) {
                console.error('profile fetch error', err);
                setError('Błąd połączenia');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [accessToken]); // refetch if accessToken changes (refresh on mount)

    const roles = useMemo(() => parseRolesFromJwt(accessToken ?? null), [accessToken]);
    const isAdmin = roles.some(r => r.includes('admin'));
    const isWorker = roles.some(r => r.includes('worker'));

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>Ładowanie profilu...</div>
            </div>
        );
    }

    if (status === 401 || !profile) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <h2>Nie jesteś zalogowany</h2>
                    <p>Aby zobaczyć profil musisz się zalogować.</p>
                    <div style={{ marginTop: 12 }}>
                        <a href="/login" className={styles.link} style={{ padding: '8px 12px', background: '#5b46f0', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                            Zaloguj się
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    const user = profile.user ?? {};
    const worker = profile.worker ?? null;
    const admin = profile.admin ?? null;

    // ensure admin has object shape { unitName: "" } for display; if missing, use empty object
    const adminSafe = admin ?? { unitName: '' };

    return (
        <div style={{ padding: 24, minHeight: '80vh', background: '#f8fafc' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
                <section style={{ background: '#fff', padding: 20, borderRadius: 10, boxShadow: '0 6px 24px rgba(2,6,23,0.04)' }}>
                    {/* Name */}
                    <div style={{ color: '#111827', fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
                        {user.fullName ?? profile.firstName ?? '—'}
                    </div>

                    {/* Bio */}
                    <div style={{ color: '#374151', marginBottom: 16 }}>
                        <div style={{ fontWeight: 700 }}>Bio:</div>
                        <div>{user.bio ?? '—'}</div>
                    </div>

                    {/* Worker info */}
                    {worker && (
                        <div style={{ color: '#374151', marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Informacje pracownicze</div>

                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontWeight: 600 }}>Jednostka:</div>
                                <div>{worker.unitName ?? '—'}</div>
                            </div>

                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontWeight: 600 }}>Tytuł / stopień:</div>
                                <div>{worker.degreeTitle ?? '—'}</div>
                            </div>

                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontWeight: 600 }}>Dyscypliny:</div>
                                <div style={{ whiteSpace: 'pre-line', marginTop: 6 }}>
                                    {Array.isArray(worker.disciplines) && worker.disciplines.length
                                        ? worker.disciplines.map((d: any) => d.name).join('\n')
                                        : 'Brak przypisanych dyscyplin'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Admin info: show only Jednostka admina line (no "Masz uprawnienia administratora") */}
                    {(adminSafe || isAdmin) && (
                        <div style={{ color: '#374151', marginTop: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Informacje administratora</div>
                            <div style={{ marginTop: 6 }}>
                                <div style={{ fontWeight: 600 }}>Jednostka admina:</div>
                                <div>{(adminSafe.unitName ?? '') || '—'}</div>
                            </div>
                        </div>
                    )}
                </section>

                <aside style={{ background: '#fff', padding: 20, borderRadius: 10, boxShadow: '0 6px 24px rgba(2,6,23,0.04)' }}>
                    <h3 style={{ marginTop: 0 }}>Akcje</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                        <button onClick={() => router.push('/settings')} className={styles.link} style={{ padding: '10px 12px', background: '#5b46f0', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                            Ustawienia
                        </button>

                        {/*/!* Admin: manage other accounts *!/*/}
                        {/*{isAdmin && (*/}
                        {/*    <button onClick={() => router.push('/admin/users')} className={styles.link} style={{ padding: '10px 12px', background: '#eef2ff', color: '#5b46f0', borderRadius: 8, border: 'none', cursor: 'pointer' }}>*/}
                        {/*        Zarządzaj kontami*/}
                        {/*    </button>*/}
                        {/*)}*/}

                        {/* Worker: panel */}
                        {isWorker && (
                            <button onClick={() => router.push('/worker/dashboard')} className={styles.link} style={{ padding: '10px 12px', background: '#0ea5a4', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                                Panel pracownika
                            </button>
                        )}

                        {/* Admin: admin panel */}
                        {isAdmin && (
                            <button onClick={() => router.push('/admin/management')} className={styles.link} style={{ padding: '10px 12px', background: '#7c3aed', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                                Panel administratora
                            </button>
                        )}

                        {/* Logout for convenience */}
                        <button onClick={async () => { await logout(); router.push('/login'); }} className={styles.link} style={{ padding: '8px 12px', marginTop: 6, background: '#fff', color: '#374151', borderRadius: 8, border: '1px solid #e6e7ea', cursor: 'pointer' }}>
                            Wyloguj
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
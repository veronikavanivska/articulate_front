'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { useAuth } from '@/context/AuthContext';
import { mapSomeoneToProfileDetail, ProfileDetail as ProfileDetailType } from '@/lib/profileMapper';
import styles from './styles.module.css';

function parseRolesFromJwt(token?: string | null): string[] {
    if (!token) return [];
    try {
        const parts = token.split('.');
        if (parts.length < 2) return [];

        const payload = parts[1];
        const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const json = JSON.parse(atob(b64));

        const roles = json.roles ?? json.role ?? json.authorities ?? null;
        if (!roles) return [];

        if (Array.isArray(roles)) {
            return roles.map((r: any) => String(r).replace(/^ROLE_/i, '').trim().toLowerCase());
        }
        if (typeof roles === 'string') {
            return roles
                .split(',')
                .map((r: string) => r.replace(/^ROLE_/i, '').trim().toLowerCase())
                .filter(Boolean);
        }
        return [];
    } catch {
        return [];
    }
}

export default function ProfilePage() {
    const router = useRouter();
    const { accessToken, logout } = useAuth();

    const [profile, setProfile] = useState<ProfileDetailType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const roles = useMemo(() => parseRolesFromJwt(accessToken ?? null), [accessToken]);
    const isAdmin = roles.some(r => r.includes('admin'));
    const isWorker = roles.some(r => r.includes('worker'));

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                const res = await authFetch('/api/profile/me', { method: 'GET' });
                if (!mounted) return;

                if (!res.ok) {
                    setError('Nie jesteś zalogowany');
                    setProfile(null);
                    return;
                }

                const data = await res.json().catch(() => null);
                const mapped = mapSomeoneToProfileDetail(data ?? null);
                if (mounted) setProfile(mapped);
            } catch (e) {
                console.error('profile fetch error', e);
                if (mounted) setError('Błąd połączenia');
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => { mounted = false; };
    }, [accessToken]);

    function initials(name?: string) {
        if (!name) return 'U';
        return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    }

    if (loading) {
        return <div style={{ padding: 28 }} className={styles.loading}>Ładowanie profilu…</div>;
    }

    if (error) {
        return (
            <div style={{ padding: 28 }}>
                <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ color: '#111827' }}>{error}</h2>
                    <p style={{ color: '#6b7280' }}>Aby zobaczyć profil musisz się zalogować.</p>
                    <div style={{ marginTop: 12 }}>
                        <a
                            href="/login"
                            style={{ padding: '8px 12px', background: '#5b46f0', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
                        >
                            Zaloguj się
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if (!profile) {
        return <div style={{ padding: 28 }} className={styles.empty}>Brak profilu</div>;
    }

    return (
        <div className={styles.page} style={{ paddingTop: 24 }}>
            <header className={styles.header} style={{ marginBottom: 20 }}>
                <h1 className={styles.title}>Mój profil</h1>
            </header>

            <main className={styles.grid}>
                <section className={styles.left}>
                    <article className={styles.bigCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.bigAvatar}>{initials(profile.fullName)}</div>
                            <div>
                                <h2 className={styles.cardTitle}>{profile.fullName ?? '—'}</h2>
                                <div className={styles.muted}>{profile.email ?? ''}</div>
                            </div>
                        </div>

                        <div className={styles.cardBody}>
                            <h4>Bio</h4>
                            <p className={styles.bio}>{profile.bio ?? '—'}</p>

                            {/* Pracownik: dane tylko dla roli worker */}
                            {isWorker && (
                                <>
                                    <h4>Informacje pracownicze</h4>
                                    <p><strong>Jednostka:</strong> {profile.workerUnit ?? '—'}</p>
                                    <p><strong>Tytuł / stopień:</strong> {profile.workerDegree ?? '—'}</p>

                                    <h4>Dyscypliny</h4>
                                    <div className={styles.disciplines}>
                                        {(profile.disciplines || []).length
                                            ? (profile.disciplines || []).map((d) => (
                                                <div key={d.id} className={styles.disciplineItem}>{d.name}</div>
                                            ))
                                            : <div className={styles.muted}>Brak przypisanych dyscyplin</div>
                                        }
                                    </div>
                                </>
                            )}

                            {/* Administrator: dane tylko dla roli admin */}
                            {isAdmin && (
                                <>
                                    <h4 style={{ marginTop: 18 }}>Informacje administratora</h4>
                                    <p><strong>Jednostka admina:</strong> {profile.adminUnit ?? '—'}</p>
                                </>
                            )}


                        </div>
                    </article>
                </section>

                <aside className={styles.rightColumn}>
                    <div className={styles.actionsCard}>
                        <h3>Akcje</h3>

                        <button className={styles.primaryBtn} onClick={() => router.push('/settings')}>
                            Ustawienia
                        </button>

                        {/* Panel pracownika tylko jeśli rola worker */}
                        {isWorker && (
                            <button className={styles.secondaryBtn} onClick={() => router.push('/worker/management')}>
                                Panel pracownika
                            </button>
                        )}

                        {/* Panel administratora tylko jeśli rola admin */}
                        {isAdmin && (
                            <button className={styles.primaryBtn} onClick={() => router.push('/admin/management')}>
                                Panel administratora
                            </button>
                        )}

                        <div style={{ height: 12 }} />

                        <div style={{ flex: 1 }} />

                        <button
                            className={styles.dangerBtn}
                            onClick={async () => {
                                await logout();
                                router.push('/login');
                            }}
                        >
                            Wyloguj
                        </button>
                    </div>
                </aside>
            </main>
        </div>
    );
}

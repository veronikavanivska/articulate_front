'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import styles from '../login/styles.module.css';

type Profile = {
    email?: string;
    firstName?: string;
    lastName?: string;
    roles?: string[] | string;
    role?: string;
};

export default function DashboardEntry() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                const res = await authFetch('/api/profile/me', { method: 'GET' });
                if (!mounted) return;
                if (!res.ok) {
                    // niepomyślnie -> przekieruj do /login lub /profile
                    router.push('/login');
                    return;
                }
                const data = await res.json().catch(() => null);
                setProfile(data ?? null);
            } catch (err) {
                console.error('dashboard fetch error', err);
                setError('Błąd połączenia');
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [router]);

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <p style={{ textAlign: 'center' }}>Ładowanie...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>
                </div>
            </div>
        );
    }

    // Normalize roles to array of lowercase strings for easy checks
    const rolesArr: string[] = (() => {
        if (!profile) return [];
        const raw = profile.roles ?? profile.role ?? [];
        if (Array.isArray(raw)) return raw.map((r) => String(r).toLowerCase());
        return String(raw).split(',').map((r) => r.trim().toLowerCase());
    })();

    // Helper that checks for admin/worker presence even if backend returns "ROLE_ADMIN" etc.
    const hasAdmin = rolesArr.some((r) => r.includes('admin'));
    const hasWorker = rolesArr.some((r) => r.includes('worker'));
    const hasOnlyUser = rolesArr.length === 0 || rolesArr.every((r) => r.includes('user') || r === '');

    // If user only (no worker/admin) -> show full screen waiting message
    if (hasOnlyUser) {
        return <UserWaitingFullScreen email={profile?.email} />;
    }

    // If user has multiple roles show dashboard with tiles for each
    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fb', padding: '48px 16px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 28 }}>Witaj{profile?.firstName ? `, ${profile.firstName}` : ''}</h1>
                        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                            Twoje role: {rolesArr.join(', ')}
                        </p>
                    </div>
                    <div>
                        <a href="/settings" className={styles.link} style={{ fontWeight: 600 }}>Ustawienia</a>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
                    {hasAdmin && (
                        <RoleCard
                            title="Panel administratora"
                            description="Dostęp do zarządzania publikacjami, dyscyplinami i cyklami."
                            href="/admin/management"
                            accent="#7c3aed"
                            emoji="🛠️"
                        />
                    )}

                    {hasWorker && (
                        <RoleCard
                            title="Panel pracownika"
                            description="Przeglądaj i zarządzaj swoimi monografiami i publikacjami."
                            href="/worker/dashboard"
                            accent="#0ea5a4"
                            emoji="📚"
                        />
                    )}

                    {/* Dodatkowe kafelki możesz tu dodać dla innych ról */}
                </div>
            </div>
        </div>
    );
}

/* Role card component */
function RoleCard({ title, description, href, accent, emoji }: { title: string; description: string; href: string; accent?: string; emoji?: string }) {
    return (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 10px 30px rgba(2,6,23,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: accent ?? '#5b46f0', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22 }}>{emoji ?? '⭐'}</div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
                        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{description}</p>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 18, textAlign: 'right' }}>
                <a href={href} style={{ background: accent ?? '#5b46f0', color: '#fff', padding: '10px 14px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
                    Przejdź
                </a>
            </div>
        </div>
    );
}

/* Full-screen waiting view for plain users */
function UserWaitingFullScreen({ email }: { email?: string }) {
    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb' }}>
            <div style={{ width: 'min(760px, 96%)', textAlign: 'center', padding: 48 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 40, boxShadow: '0 20px 60px rgba(2,6,23,0.06)' }}>
                    <div style={{ width: 96, height: 96, borderRadius: 9999, margin: '0 auto', background: '#5b46f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                        A
                    </div>
                    <h1 style={{ marginTop: 20, fontSize: 32, color: '#0f172a', fontWeight: 800 }}>Czekaj na przypisanie roli</h1>
                    <p style={{ marginTop: 12, color: '#6b7280', fontSize: 16 }}>
                        Twoje konto ({email ?? 'konto'}) zostało zarejestrowane. Administrator przypisze Ci rolę — otrzymasz powiadomienie, gdy to nastąpi.
                    </p>

                    <div style={{ marginTop: 28 }}>
                        <a href="/settings" style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 8, background: '#5b46f0', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                            Przejdź do ustawień
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
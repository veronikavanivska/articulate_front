'use client';

import React, { useEffect, useState } from 'react';
import styles from '../login/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

type Profile = {
    id?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
    roles?: string[]; // or single role
};

export default function ProfilePage() {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        let mounted = true;
        setLoading(true);
        setError(null);

        authFetch('/api/profile/me', { method: 'GET' })
            .then(async (res) => {
                if (!mounted) return;
                if (!res.ok) {
                    const body = await res.json().catch(() => ({ message: 'Nie można pobrać profilu' }));
                    setError(body.message || 'Błąd serwera');
                    setProfile(null);
                } else {
                    const data = await res.json().catch(() => null);
                    setProfile(data ?? null);
                }
            })
            .catch((err) => {
                if (!mounted) return;
                console.error(err);
                setError('Błąd połączenia');
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [isAuthenticated, router]);

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
                    <div className={styles.header}>
                        <h1 className={styles.title}>Profil</h1>
                    </div>
                    <div style={{ color: 'red' }}>{error}</div>
                </div>
            </div>
        );
    }

    const roleRaw: string | undefined =
        Array.isArray(profile?.roles) && profile.roles.length > 0
            ? profile.roles[0]
            : (profile as any)?.role;
    const role = roleRaw ? String(roleRaw).toLowerCase() : 'user';

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>A</div>
                    <h1 className={styles.title}>Twój profil</h1>
                    <p className={styles.subtitle}>{profile?.email ?? ''}</p>
                </div>

                {role === 'user' && (
                    <p style={{ textAlign: 'center', color: '#374151' }}>
                        Twoje konto zostało zarejestrowane. Czekaj na przypisanie roli przez administratora.
                    </p>
                )}

                {role === 'worker' && (
                    <>
                        <p style={{ textAlign: 'center', color: '#374151' }}>
                            Jesteś przypisany jako worker — możesz przejść do panelu pracownika.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <a className={styles.link} href="/worker/dashboard">Przejdź do panelu pracownika</a>
                        </div>
                    </>
                )}

                {role === 'admin' && (
                    <>
                        <p style={{ textAlign: 'center', color: '#374151' }}>
                            Jesteś administratorem — masz dostęp do panelu administracyjnego.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <a className={styles.link} href="/admin/management">Panel admina</a>
                        </div>
                    </>
                )}

                <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f7' }} />

                <ChangePasswordSection />
            </div>
        </div>
    );
}

function ChangePasswordSection() {
    const { changePassword } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setMsg(null);

        if (!currentPassword || !newPassword || !confirm) {
            setErr('Wypełnij wszystkie pola');
            return;
        }
        if (newPassword.length < 6) {
            setErr('Nowe hasło musi mieć co najmniej 6 znaków');
            return;
        }
        if (newPassword !== confirm) {
            setErr('Nowe hasła nie są zgodne');
            return;
        }

        setLoading(true);
        try {
            await changePassword(currentPassword, newPassword);
            setMsg('Hasło zostało zmienione pomyślnie.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirm('');
        } catch (e: any) {
            setErr(e?.message ?? 'Błąd zmiany hasła');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="mt-4" suppressHydrationWarning>
            <div style={{ marginBottom: 8 }}>
                <input
                    className="input"
                    type="password"
                    placeholder="Aktualne hasło"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <input
                    className="input"
                    type="password"
                    placeholder="Nowe hasło"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <input
                    className="input"
                    type="password"
                    placeholder="Powtórz nowe hasło"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
            </div>

            {err && <div style={{ color: '#dc2626', marginBottom: 8 }}>{err}</div>}
            {msg && <div style={{ color: 'green', marginBottom: 8 }}>{msg}</div>}

            <button
                type="submit"
                className="submit"
                style={{ padding: '10px 14px', borderRadius: 8, background: '#5b46f0', color: '#fff', cursor: 'pointer' }}
                disabled={loading}
            >
                {loading ? 'Trwa...' : 'Zmień hasło'}
            </button>
        </form>
    );
}
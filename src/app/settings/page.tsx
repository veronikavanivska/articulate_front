'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../login/styles.module.css';

/** normalize ROLE_ prefix */
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
    } catch {
        return [];
    }
}

/* Simple centered modal used for inline dialogs */
function Modal({ title, children, onClose }: { title?: string; children: React.ReactNode; onClose: () => void }) {
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 80,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(2,6,23,0.45)',
                padding: 20
            }}
        >
            <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 96%)', background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 20px 60px rgba(2,6,23,0.12)' }}>
                {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
                {children}
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const router = useRouter();
    const { accessToken, changePassword, changeEmail, logout } = useAuth();

    const [profile, setProfile] = useState<any | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [modal, setModal] = useState<'update' | 'email' | 'password' | 'delete' | null>(null);

    // update form state
    const [fullName, setFullname] = useState('');
    const [bio, setBio] = useState('');
    const [workerUnit, setWorkerUnit] = useState('');
    const [workerDegree, setWorkerDegree] = useState('');
    const [adminUnit, setAdminUnit] = useState('');

    // email/password state (for modals)
    const [email, setEmail] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailErr, setEmailErr] = useState<string | null>(null);
    const [emailMsg, setEmailMsg] = useState<string | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwLoading, setPwLoading] = useState(false);
    const [pwErr, setPwErr] = useState<string | null>(null);
    const [pwMsg, setPwMsg] = useState<string | null>(null);

    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateErr, setUpdateErr] = useState<string | null>(null);
    const [updateMsg, setUpdateMsg] = useState<string | null>(null);

    const [deleting, setDeleting] = useState(false);
    const [deleteErr, setDeleteErr] = useState<string | null>(null);

    const roles = useMemo(() => parseRolesFromJwt(accessToken ?? null), [accessToken]);
    const isAdmin = roles.some(r => r.includes('admin'));
    const isWorker = roles.some(r => r.includes('worker'));

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoadingProfile(true);
            try {
                const res = await authFetch('/api/profile/me', { method: 'GET' });
                if (!mounted) return;
                if (!res.ok) {
                    setProfile(null);
                    return;
                }
                const data = await res.json().catch(() => null);
                setProfile(data ?? null);

                // preload form values
                setFullname(data?.user?.fullName ?? '');
                setBio(data?.user?.bio ?? '');
                setWorkerUnit(data?.worker?.unitName ?? '');
                setWorkerDegree(data?.worker?.degreeTitle ?? '');
                setAdminUnit(data?.admin?.unitName ?? '');
            } catch (err) {
                console.error('profile fetch error', err);
            } finally {
                if (mounted) setLoadingProfile(false);
            }
        })();
        return () => { mounted = false; };
    }, [accessToken]);

    // ---------- handlers (same logic as before, kept here) ----------
    async function submitUpdateProfile() {
        setUpdateErr(null);
        setUpdateMsg(null);
        setUpdateLoading(true);
        const payload: any = {
            user: {
                fullName: fullName ?? '',
                bio: bio ?? ''
            }
        };
        if (isWorker || profile?.worker) {
            payload.worker = { unitName: workerUnit ?? '', degreeTitle: workerDegree ?? '' };
        }
        if (isAdmin || profile?.admin) {
            payload.admin = { unitName: adminUnit ?? '' };
        }

        try {
            const res = await authFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const text = await res.text().catch(() => null);
                setUpdateErr(text || 'Błąd aktualizacji profilu');
                setUpdateLoading(false);
                return;
            }
            setUpdateMsg('Profil zaktualizowany.');
            const refreshed = await authFetch('/api/profile/me', { method: 'GET' });
            if (refreshed.ok) {
                const data = await refreshed.json().catch(() => null);
                setProfile(data ?? null);
            }
            setUpdateLoading(false);
            setTimeout(() => setModal(null), 400);
        } catch (err: any) {
            setUpdateErr(err?.message ?? 'Błąd sieci');
            setUpdateLoading(false);
        }
    }

    async function submitChangeEmail() {
        setEmailErr(null);
        setEmailMsg(null);
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailErr('Podaj poprawny adres e‑mail');
            return;
        }
        setEmailLoading(true);
        try {
            await changeEmail(email);
            setEmailMsg('Adres e‑mail został zaktualizowany.');
            const refreshed = await authFetch('/api/profile/me', { method: 'GET' });
            if (refreshed.ok) {
                const data = await refreshed.json().catch(() => null);
                setProfile(data ?? null);
            }
            setTimeout(() => setModal(null), 400);
        } catch (err: any) {
            setEmailErr(err?.message ?? 'Błąd zmiany e‑mail');
        } finally {
            setEmailLoading(false);
        }
    }

    async function submitChangePassword() {
        setPwErr(null);
        setPwMsg(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setPwErr('Uzupełnij wszystkie pola');
            return;
        }
        if (newPassword.length < 6) {
            setPwErr('Hasło musi mieć co najmniej 6 znaków');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwErr('Hasła nie są zgodne');
            return;
        }

        setPwLoading(true);
        try {
            // przekazujemy obiekt zgodny z implementacją changePassword w AuthContext
            await changePassword({ currentPassword, newPassword });

            setPwMsg('Hasło zmieniono pomyślnie.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

            // zamknij modal po chwili, aby użytkownik zobaczył komunikat
            setTimeout(() => setModal(null), 400);
        } catch (err: any) {
            setPwErr(err?.message ?? 'Błąd zmiany hasła');
        } finally {
            setPwLoading(false);
        }
    }

    async function submitDeleteAccount() {
        setDeleteErr(null);
        setDeleting(true);
        try {
            const res = await authFetch('/api/profile/delete-me', { method: 'DELETE' });
            if (!res.ok) {
                const text = await res.text().catch(() => null);
                setDeleteErr(text || 'Błąd usuwania konta');
                setDeleting(false);
                return;
            }
            await logout();
            router.push('/');
        } catch (err: any) {
            setDeleteErr(err?.message ?? 'Błąd sieci');
            setDeleting(false);
        }
    }

    if (loadingProfile) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>Ładowanie ustawień...</div>
            </div>
        );
    }

    // --------- prettier layout (values shown cleanly, labels removed) ----------
    return (
        <div style={{ padding: 24, minHeight: '80vh', background: '#f8fafc' }}>
            <div style={{ maxWidth: 920, margin: '0 auto' }}>
                <h1 style={{ margin: '6px 0 18px', fontSize: 36, color: '#0f172a' }}>Ustawienia</h1>

                <div style={{ display: 'grid', gap: 18 }}>
                    <section style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 10px 30px rgba(2,6,23,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 20 }}>Aktualizuj profil</h2>
                                <div style={{ marginTop: 12, color: '#111827', fontWeight: 700, fontSize: 18 }}>{profile?.user?.fullName ?? '—'}</div>
                                <div style={{ marginTop: 6, color: '#6b7280' }}>{profile?.user?.bio ?? '—'}</div>

                                {profile?.worker && (
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ color: '#374151', fontWeight: 700 }}>Informacje pracownicze</div>
                                        <div style={{ color: '#6b7280', marginTop: 6 }}>
                                            <div>Jednostka: {profile.worker.unitName ?? '—'}</div>
                                            <div style={{ marginTop: 6 }}>Tytuł / stopień: {profile.worker.degreeTitle ?? '—'}</div>
                                            {Array.isArray(profile.worker.disciplines) && profile.worker.disciplines.length > 0 && (
                                                <div style={{ marginTop: 8 }}>
                                                    <div style={{ fontWeight: 700, color: '#374151' }}>Dyscypliny:</div>
                                                    <ul style={{ marginTop: 6 }}>
                                                        {profile.worker.disciplines.map((d: any) => <li key={d.id ?? d.name}>{d.name}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(profile?.admin || isAdmin) && (
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ color: '#374151', fontWeight: 700 }}>Informacje administratora</div>
                                        <div style={{ color: '#6b7280', marginTop: 6 }}>Jednostka admina: { (profile?.admin?.unitName ?? '') || '—' }</div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
                                <button onClick={() => setModal('update')} className={styles.submit} style={{ width: '100%' }}>Edytuj profil</button>
                                <button onClick={() => setModal('email')} className={styles.link as any} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#eef2ff', color: '#5b46f0' }}>Zmień e‑mail</button>
                                <button onClick={() => setModal('password')} className={styles.link as any} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#e9f7f6', color: '#0ea5a4' }}>Zmień hasło</button>
                                <button onClick={() => setModal('delete')} className={styles.link as any} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#fff4f4', color: '#dc2626' }}>Usuń konto</button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* ---------- MODALS (same as previous, but kept for nicer UX) ---------- */}

            {modal === 'update' && (
                <Modal title="Edytuj profil" onClose={() => setModal(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); submitUpdateProfile(); }}>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <label style={{ fontWeight: 700 }}>Imię / Nazwa</label>
                            <input className={styles.input} value={fullName} onChange={(e) => setFullname(e.target.value)} />

                            <label style={{ fontWeight: 700 }}>Bio</label>
                            <textarea className={styles.input} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

                            {(isWorker || profile?.worker) && (
                                <>
                                    <label style={{ fontWeight: 700 }}>Jednostka (worker)</label>
                                    <input className={styles.input} value={workerUnit} onChange={(e) => setWorkerUnit(e.target.value)} />

                                    <label style={{ fontWeight: 700 }}>Tytuł / stopień (worker)</label>
                                    <input className={styles.input} value={workerDegree} onChange={(e) => setWorkerDegree(e.target.value)} />
                                </>
                            )}

                            {(isAdmin || profile?.admin) && (
                                <>
                                    <label style={{ fontWeight: 700 }}>Jednostka (admin)</label>
                                    <input className={styles.input} value={adminUnit} onChange={(e) => setAdminUnit(e.target.value)} />
                                </>
                            )}

                            {updateErr && <div style={{ color: '#dc2626' }}>{updateErr}</div>}
                            {updateMsg && <div style={{ color: 'green' }}>{updateMsg}</div>}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setModal(null)} className={styles.link as any}>Anuluj</button>
                                <button type="submit" className={styles.submit} disabled={updateLoading}>{updateLoading ? 'Trwa...' : 'Zapisz'}</button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}

            {modal === 'email' && (
                <Modal title="Zmień adres e‑mail" onClose={() => setModal(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); submitChangeEmail(); }}>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <label style={{ fontWeight: 700 }}>Nowy adres e‑mail</label>
                            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />

                            {emailErr && <div style={{ color: '#dc2626' }}>{emailErr}</div>}
                            {emailMsg && <div style={{ color: 'green' }}>{emailMsg}</div>}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setModal(null)} className={styles.link as any}>Anuluj</button>
                                <button type="submit" className={styles.submit} disabled={emailLoading}>{emailLoading ? 'Trwa...' : 'Zmień e‑mail'}</button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}

            {modal === 'password' && (
                <Modal title="Zmień hasło" onClose={() => setModal(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); submitChangePassword(); }}>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <label style={{ fontWeight: 700 }}>Aktualne hasło</label>
                            <input className={styles.input} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />

                            <label style={{ fontWeight: 700 }}>Nowe hasło</label>
                            <input className={styles.input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />

                            <label style={{ fontWeight: 700 }}>Powtórz nowe hasło</label>
                            <input className={styles.input} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

                            {pwErr && <div style={{ color: '#dc2626' }}>{pwErr}</div>}
                            {pwMsg && <div style={{ color: 'green' }}>{pwMsg}</div>}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setModal(null)} className={styles.link as any}>Anuluj</button>
                                <button type="submit" className={styles.submit} disabled={pwLoading}>{pwLoading ? 'Trwa...' : 'Zmień hasło'}</button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}

            {modal === 'delete' && (
                <Modal title="Usuń konto" onClose={() => setModal(null)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <p>Na pewno chcesz usunąć konto? Operacja jest nieodwracalna.</p>
                        {deleteErr && <div style={{ color: '#dc2626' }}>{deleteErr}</div>}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setModal(null)} className={styles.link as any}>Anuluj</button>
                            <button onClick={submitDeleteAccount} className={styles.submit} style={{ background: '#dc2626' }} disabled={deleting}>{deleting ? 'Trwa usuwanie...' : 'Usuń konto'}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
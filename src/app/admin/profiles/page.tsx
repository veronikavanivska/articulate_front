'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { useAuth } from '@/context/AuthContext';
import { mapSomeoneToProfileDetail, ProfileDetail as ProfileDetailType } from '@/lib/profileMapper';
import styles from './styles.module.css';

type ListProfileItem = {
    id: number;
    fullname?: string;
    email?: string;
    hasWorker?: boolean;
    hasAdmin?: boolean;
    degreeTitle?: string;
    workerUnitName?: string;
    adminUnitName?: string;
};

type Discipline = { id: number; name: string };
type RoleOption = { value: string; label: string };

export default function AdminProfilesPage() {
    const { initialized, logout } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    // list & search
    const [items, setItems] = useState<ListProfileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [size] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState<string | null>(null);

    // selected + roles/disciplines
    const [selected, setSelected] = useState<ProfileDetailType | null>(null);

    const [rolesList, setRolesList] = useState<RoleOption[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);

    const [availableDisciplines, setAvailableDisciplines] = useState<Discipline[]>([]);
    const [disciplinesLoading, setDisciplinesLoading] = useState(false);

    const [selectedRole, setSelectedRole] = useState<string>('');
    const [selectedDiscipline, setSelectedDiscipline] = useState<number | ''>('');
    const [actionLoading, setActionLoading] = useState(false);

    // pending user roles (filled by openProfile) - used to sync selectedRole after rolesList is loaded
    const [pendingUserRoles, setPendingUserRoles] = useState<string[] | null>(null);

    const debounceRef = useRef<number | null>(null);
    const listAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // when rolesList loads, if pendingUserRoles exists try to match and set selectedRole
        if (rolesList.length && pendingUserRoles && pendingUserRoles.length) {
            // try to find first matching role option
            const match = rolesList.find(r =>
                pendingUserRoles.includes(r.value) ||
                pendingUserRoles.includes(r.value.replace(/^ROLE_/i, '')) ||
                pendingUserRoles.includes(r.label)
            );
            if (match) {
                setSelectedRole(match.value);
            } else {
                // fallback to first available role
                setSelectedRole(rolesList[0].value);
            }
            setPendingUserRoles(null);
        } else if (rolesList.length && !selectedRole && !pendingUserRoles) {
            // set default if nothing selected yet
            setSelectedRole(rolesList[0].value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rolesList]);

    useEffect(() => {
        // initial
        if (!initialized) return;

        if (listAbortRef.current) { listAbortRef.current.abort(); listAbortRef.current = null; }
        listAbortRef.current = new AbortController();

        fetchList(listAbortRef.current.signal);
        fetchDisciplines();
        fetchRoles();

        const openId = searchParams?.get('open');
        if (openId) openProfile(Number(openId));

        return () => {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            if (listAbortRef.current) listAbortRef.current.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized, page]);

    async function fetchList(signal?: AbortSignal) {
        setLoading(true);
        setError(null);
        try {
            const body = { fullName: search ?? '', page, size, sortBy: 'fullname', sortDir: 'asc' };
            const res = await authFetch('/api/profile/listProfiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: (signal as any),
            } as RequestInit);

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error('[fetchList] status=', res.status, 'body=', text);
                throw new Error(text || 'Błąd pobierania listy profili');
            }

            const data = await res.json().catch(() => null);
            setItems(data?.items ?? data?.data ?? []);
            setTotalPages(data?.totalPages ?? Math.max(1, Math.ceil((data?.total ?? 0) / size)));
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.error('[fetchList] error', err);
            setError(err?.message ?? 'Błąd');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    async function fetchRoles() {
        setRolesLoading(true);
        try {
            // wywołujemy proxy, które masz w src/pages/api/admin/roles.ts
            const res = await authFetch('/api/admin/roles', { method: 'GET' });
            console.log('[fetchRoles] status=', res.status);
            if (!res.ok) {
                console.warn('[fetchRoles] non-OK status', res.status);
                setRolesLoading(false);
                return;
            }

            const text = await res.text().catch(() => '');
            console.log('[fetchRoles] body preview=', text ? (text.length > 500 ? text.slice(0,500) + '...' : text) : '(empty)');
            let data: any = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = text; }

            // normalizacja możliwych formatów odpowiedzi
            let arr: any[] = [];
            if (Array.isArray(data)) arr = data;
            else if (Array.isArray(data?.roles)) arr = data.roles;
            else if (Array.isArray(data?.data)) arr = data.data;
            else if (Array.isArray(data?.items)) arr = data.items;
            else {
                const firstArr = data && typeof data === 'object' && Object.values(data).find(v => Array.isArray(v));
                if (firstArr) arr = firstArr as any[];
            }

            if (!arr.length) {
                const fallback = [
                    { value: 'ROLE_ADMIN', label: 'ADMIN' },
                    { value: 'ROLE_WORKER', label: 'WORKER' },
                    { value: 'ROLE_USER', label: 'USER' },
                ];
                setRolesList(fallback);
                if (!selectedRole) setSelectedRole(fallback[0].value);
                return;
            }

            const normalized: RoleOption[] = arr.map((it: any) => {
                if (typeof it === 'string') return { value: it, label: it.replace(/^ROLE_/i, '') };
                if (it?.value && it?.label) return { value: String(it.value), label: String(it.label) };
                if (it?.name) return { value: String(it.name), label: String(it.name).replace(/^ROLE_/i, '') };
                return { value: String(it), label: String(it) };
            });

            setRolesList(normalized);

            // jeśli mamy pendingUserRoles (ustawione wcześniej przez openProfile), efekt useEffect na rolesList je obsłuży
            if (!selectedRole && normalized.length) setSelectedRole(normalized[0].value);
        } catch (e) {
            console.error('[fetchRoles] error', e);
        } finally {
            setRolesLoading(false);
        }
    }

    // Fetch disciplines (proxy: /api/profile/listDisciplines)
    async function fetchDisciplines() {
        setDisciplinesLoading(true);
        try {
            const res = await authFetch('/api/profile/listDisciplines', { method: 'GET' });
            if (!res.ok) {
                console.warn('[fetchDisciplines] /api/profile/listDisciplines status=', res.status);
                setDisciplinesLoading(false);
                return;
            }
            const text = await res.text().catch(() => '');
            let data: any = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = text; }

            let arr: any[] = [];
            if (Array.isArray(data)) arr = data;
            else if (Array.isArray(data?.discipline)) arr = data.discipline;
            else if (Array.isArray(data?.disciplineList)) arr = data.disciplineList;
            else if (Array.isArray(data?.items)) arr = data.items;
            else {
                const firstArr = data && typeof data === 'object' && Object.values(data).find(v => Array.isArray(v));
                if (firstArr) arr = firstArr as any[];
            }

            const normalized: Discipline[] = (arr || []).map((d: any) => ({
                id: Number(d.id ?? d.disciplineId ?? d.value ?? 0),
                name: d.name ?? d.label ?? String(d),
            }));
            setAvailableDisciplines(normalized);
        } catch (e) {
            console.error('[fetchDisciplines] error', e);
        } finally {
            setDisciplinesLoading(false);
        }
    }

    function onSearchChange(v: string) {
        setSearch(v);
        if (!initialized) return;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        if (listAbortRef.current) { listAbortRef.current.abort(); listAbortRef.current = null; }
        debounceRef.current = window.setTimeout(() => {
            setPage(0);
            fetchList(listAbortRef.current?.signal);
            debounceRef.current = null;
        }, 300);
    }

    function onSearchNow() {
        if (!initialized) return;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        if (listAbortRef.current) { listAbortRef.current.abort(); listAbortRef.current = null; }
        setPage(0);
        fetchList();
    }

    async function openProfile(userId: number) {
        setError(null);
        try {
            const res = await authFetch(`/api/profile/someone?userId=${userId}`, { method: 'GET' });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error('[openProfile] body=', text);
                setError('Nie udało się pobrać profilu');
                return;
            }
            const data = await res.json().catch(() => null);
            const mapped = mapSomeoneToProfileDetail(data ?? null, userId);
            setSelected(mapped);

            // store user roles as strings to sync later with rolesList
            const rolesFromUser = mapped.roles ?? [];
            setPendingUserRoles(Array.isArray(rolesFromUser) ? rolesFromUser.map(String) : []);
            // selectedRole will be set by effect when rolesList loads (or earlier if already loaded)
            if (rolesList.length) {
                // immediate attempt to match
                const match = rolesList.find(r =>
                    rolesFromUser.includes(r.value) ||
                    rolesFromUser.includes(r.value.replace(/^ROLE_/i, '')) ||
                    rolesFromUser.includes(r.label)
                );
                if (match) setSelectedRole(match.value);
            }

            setSelectedDiscipline('');
            try { router.replace(`/admin/profiles?open=${userId}`); } catch {}
        } catch (e) {
            console.error('[openProfile] error', e);
            setError('Błąd pobierania profilu');
        }
    }

    function closeSelected() {
        setSelected(null);
        try { router.replace('/admin/profiles'); } catch {}
    }

    async function assignRoleToUser(userId: number, role: string) {
        if (!confirm(`Nadać rolę ${role} użytkownikowi ${userId}?`)) return;
        setActionLoading(true);
        try {
            const res = await authFetch('/api/auth/admin/assign-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, roleName: role }),
            });
            if (!res.ok) throw new Error('Błąd przypisywania roli');
            await openProfile(userId);
            await fetchList();
        } catch (err: any) {
            alert(err?.message ?? 'Błąd');
        } finally {
            setActionLoading(false);
        }
    }

    async function revokeRoleFromUser(userId: number, role: string) {
        if (!confirm(`Zabrać rolę ${role} użytkownikowi ${userId}?`)) return;
        setActionLoading(true);
        try {
            const res = await authFetch('/api/auth/admin/revoke-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, roleName: role }),
            });
            if (!res.ok) throw new Error('Błąd odbierania roli');
            await openProfile(userId);
            await fetchList();
        } catch (err: any) {
            alert(err?.message ?? 'Błąd');
        } finally {
            setActionLoading(false);
        }
    }

    async function addDisciplineToUser(userId: number, disciplineId: number) {
        if (!confirm(`Dodać dyscyplinę ${disciplineId} do użytkownika ${userId}?`)) return;
        setActionLoading(true);
        try {
            const res = await authFetch(`/api/profile/addDiscipline?userId=${userId}&disciplineId=${disciplineId}`, { method: 'POST' });
            if (!res.ok) throw new Error('Błąd dodawania dyscypliny');
            await openProfile(userId);
            await fetchList();
        } catch (err: any) {
            alert(err?.message ?? 'Błąd');
        } finally {
            setActionLoading(false);
        }
    }

    async function removeDisciplineFromUser(userId: number, disciplineId: number) {
        if (!confirm(`Usunąć dyscyplinę ${disciplineId} z użytkownika ${userId}?`)) return;
        setActionLoading(true);
        try {
            const res = await authFetch(`/api/profile/deleteDiscipline?userId=${userId}&disciplineId=${disciplineId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Błąd usuwania dyscypliny');
            await openProfile(userId);
            await fetchList();
        } catch (err: any) {
            alert(err?.message ?? 'Błąd');
        } finally {
            setActionLoading(false);
        }
    }

    // // Zamień istniejącą funkcję toggleEnable na tę:
    // async function toggleEnable(userId: number) {
    //     const prev = selected;
    //     const currentlyEnabled = !!selected?.enabled;
    //     const actionLabel = currentlyEnabled ? 'Wyłączyć' : 'Włączyć';
    //     if (!confirm(`${actionLabel} konto użytkownika?`)) return;
    //
    //     // optymistycznie pokażemy zmianę w UI natychmiast
    //     setSelected(prev ? { ...prev, enabled: !prev.enabled } : prev);
    //     setActionLoading(true);
    //
    //     try {
    //         const res = await authFetch('/api/auth/admin/enable-disable', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ userId }),
    //         });
    //
    //         // jeśli backend zwrócił błąd - rzuć wyjątek
    //         if (!res.ok) {
    //             const txt = await res.text().catch(() => '');
    //             throw new Error(txt || 'Błąd zmiany stanu');
    //         }
    //
    //         // SPRÓBUJ ODCZYTAĆ BODY - jeśli backend zwraca nowy stan, użyj go
    //         let body: any = null;
    //         try { body = await res.json(); } catch { body = null; }
    //
    //         if (body) {
    //             // przypadki: backend może zwrócić profil, lub pole enabled, albo zapakowane dane
    //             // próbujemy znaleźć pole enabled
    //             const newEnabled = body.enabled ?? body.data?.enabled ?? body.user?.enabled ?? body.profile?.enabled ?? null;
    //             if (newEnabled !== null && typeof newEnabled !== 'undefined') {
    //                 setSelected(prev => prev ? { ...prev, enabled: Boolean(newEnabled) } : prev);
    //                 // odśwież listę (opcjonalnie)
    //                 await fetchList();
    //                 return;
    //             }
    //         }
    //
    //         // Jeśli nie ma bezpośredniego potwierdzenia w body — polluj openProfile aż zwróci nowy stan
    //         const maxAttempts = 10; // 10 * 500ms = 5s
    //         const delayMs = 500;
    //         let attempt = 0;
    //         while (attempt < maxAttempts) {
    //             // czekaj
    //             await new Promise((r) => setTimeout(r, delayMs));
    //             try {
    //                 await openProfile(userId); // openProfile ustawi selected na wartość z backendu
    //             } catch (e) {
    //                 // ignoruj błędy w polling
    //             }
    //             // sprawdź czy backend zwrócił inny stan niż poprzedni
    //             if ((selected && selected.enabled) !== currentlyEnabled) {
    //                 // nowy stan zsynchronizowany - odśwież listę i zakończ
    //                 await fetchList();
    //                 return;
    //             }
    //             attempt++;
    //         }
    //
    //         // jeżeli po polling nadal brak zmiany - rollback i komunikat
    //         setSelected(prev); // rollback
    //         alert('Zmiana stanu konta nie została odzwierciedlona po stronie serwera. Spróbuj ponownie.');
    //     } catch (err: any) {
    //         // rollback UI i pokaż błąd
    //         setSelected(prev);
    //         alert(err?.message ?? 'Błąd zmiany stanu');
    //     } finally {
    //         setActionLoading(false);
    //     }
    // }

    function initials(name?: string) {
        if (!name) return 'U';
        return name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
    }

    // Wait for auth init
    if (!initialized) {
        return (
            <div className={styles.page} style={{ paddingTop: 24 }}>
                <header className={styles.header}><h1 className={styles.title}>Panel admin — Zarządzaj profilami</h1></header>
                <div style={{ padding: 28 }} className={styles.loading}>Ładowanie…</div>
            </div>
        );
    }


    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — Zarządzaj profilami</h1>

                <div className={styles.searchArea}>
                    <input
                        className={styles.searchInput}
                        placeholder="Szukaj po imieniu"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    <div className={styles.searchButtons}>
                        <button className={styles.primaryBtn} onClick={onSearchNow}>Szukaj</button>
                        <button className={styles.ghostBtn} onClick={() => { setSearch(''); setPage(0); onSearchNow(); }}>Wyczyść</button>
                    </div>
                </div>
            </header>

            <div className={styles.contentRow}>
                <main className={styles.leftColumn}>
                    {error && <div style={{ color: 'red', padding: 12 }}>{error}</div>}

                    {selected ? (
                        <article className={styles.bigCardFull}>
                            <div className={styles.cardHeader}>
                                <div className={styles.bigAvatar}>{initials(selected.fullName)}</div>
                                <div>
                                    <h2 className={styles.cardTitle}>{selected.fullName}</h2>
                                    <div className={styles.muted}>{selected.email}</div>
                                </div>
                            </div>

                            <div className={styles.cardBody}>
                                <h4>Bio</h4>
                                <p className={styles.bio}>{selected.bio ?? '—'}</p>

                                <h4>Informacje pracownicze</h4>
                                <p><strong>Jednostka:</strong> {selected.workerUnit ?? '—'}</p>
                                <p><strong>Tytuł / stopień:</strong> {selected.workerDegree ?? '—'}</p>

                                <h4>Dyscypliny</h4>
                                <div className={styles.disciplines}>
                                    {(selected.disciplines || []).length
                                        ? (selected.disciplines || []).map(d => (
                                            <div key={d.id} className={styles.disciplineItem} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>{d.name}</span>
                                                <button className={styles.infoBtn}
                                                        onClick={() => removeDisciplineFromUser(selected.userId, d.id)}
                                                        disabled={actionLoading}>Usuń
                                                </button>
                                            </div>
                                        ))
                                        : <div className={styles.muted}>Brak przypisanych dyscyplin</div>
                                    }
                                </div>

                                <div style={{marginTop: 12, display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <select value={selectedDiscipline ?? ''}
                                            onChange={(e) => setSelectedDiscipline(e.target.value ? Number(e.target.value) : '')}
                                            style={{flex: 1, padding: 8, borderRadius: 8}}>
                                        <option value="">— wybierz dyscyplinę —</option>
                                        {availableDisciplines.map(d => <option key={d.id}
                                                                               value={d.id}>{d.name}</option>)}
                                    </select>
                                    <button className={styles.primaryBtn} onClick={() => {
                                        if (selected && selectedDiscipline) addDisciplineToUser(selected.userId, Number(selectedDiscipline));
                                    }} disabled={actionLoading || !selectedDiscipline}>Dodaj
                                    </button>
                                </div>

                                <h4 style={{marginTop: 18}}>Role</h4>
                                {/*<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>*/}
                                {/*    <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>*/}
                                {/*        {rolesList.map(r => <option key={r} value={r}>{r.replace(/^ROLE_/i, '')}</option>)}*/}
                                {/*    </select>*/}
                                {/*    <button className={styles.primaryBtn} onClick={() => { if (selected) assignRoleToUser(selected.userId, selectedRole); }} disabled={actionLoading}>Nadaj</button>*/}
                                {/*    <button className={styles.ghostBtn} onClick={() => { if (selected) revokeRoleFromUser(selected.userId, selectedRole); }} disabled={actionLoading}>Zabierz</button>*/}
                                {/*</div>*/}
                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                        style={{padding: 8, borderRadius: 8}}
                                    >
                                        {rolesList.map((r) => (
                                            <option key={r.value} value={r.value}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => {
                                            if (selected) assignRoleToUser(selected.userId, selectedRole);
                                        }}
                                        disabled={actionLoading}
                                    >
                                        Nadaj
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        onClick={() => {
                                            if (selected) revokeRoleFromUser(selected.userId, selectedRole);
                                        }}
                                        disabled={actionLoading}
                                    >
                                        Zabierz
                                    </button>
                                </div>
                                {/* replace existing toggle button with this */}
                                {/*<div style={{ marginTop: 18 }}>*/}
                                {/*    <button*/}
                                {/*        className={`${styles.dangerBtn} ${selected?.enabled ? styles.btnDanger : styles.btnPrimary}`}*/}
                                {/*        onClick={() => selected && toggleEnable(selected.userId)}*/}
                                {/*        disabled={actionLoading}*/}
                                {/*        aria-pressed={selected?.enabled ? 'true' : 'false'}*/}
                                {/*        aria-label={selected?.enabled ? 'Wyłącz konto' : 'Włącz konto'}*/}
                                {/*    >*/}
                                {/*        {selected?.enabled ? 'Wyłącz konto' : 'Włącz konto'}*/}
                                {/*    </button>*/}
                                {/*</div>*/}

                                <div style={{marginTop: 18}}>
                                    <button className={styles.ghostBtn} onClick={() => closeSelected()}>Zamknij</button>
                                </div>
                            </div>
                        </article>
                    ) : (
                        <>
                            {loading ? (
                                <div className={styles.loading}>Ładowanie profili…</div>
                            ) : items.length === 0 ? (
                                <div className={styles.empty}>Brak profili</div>
                            ) : (
                                <div className={styles.cardsGrid}>
                                    {items.map(it => (
                                        <div key={it.id} className={styles.cardSmall}>
                                            <div className={styles.cardTop}>
                                            <div className={styles.avatarSmall}>{initials(it.fullname)}</div>
                                                <div className={styles.cardMeta}>
                                                    <div className={styles.name}>{it.fullname ?? '—'}</div>
                                                    <div className={styles.muted}>{it.workerUnitName ?? it.adminUnitName ?? ''}</div>
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom}>
                                                <div className={styles.badgeRow}>
                                                    {it.hasAdmin ? <span className={`${styles.badge} ${styles.badgeAdmin}`}>ADMIN</span> : null}
                                                    {it.hasWorker ? <span className={`${styles.badge} ${styles.badgeWorker}`}>WORKER</span> : !it.hasAdmin ? <span className={`${styles.badge} ${styles.badgeMuted}`}>USER</span> : null}
                                                </div>

                                                <div className={styles.cardActions}>
                                                    <button className={styles.infoBtn} onClick={() => openProfile(it.id)}>Szczegóły</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    <div className={styles.pagerWrap}>
                        <button className={styles.pageBtn} onClick={() => { if (page>0) setPage(p => Math.max(0, p-1)); }} disabled={page===0}>Poprzednia</button>
                        <div className={styles.pageInfo}>Strona {page+1} / {Math.max(1, totalPages)}</div>
                        <button className={styles.pageBtn} onClick={() => { if (page+1 < totalPages) setPage(p => p+1); }} disabled={page+1 >= totalPages}>Następna</button>
                    </div>
                </main>

            </div>
        </div>
    );
}
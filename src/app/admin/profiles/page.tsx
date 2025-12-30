'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { useAuth } from '@/context/AuthContext';
import { mapSomeoneToProfileDetail, ProfileDetail as ProfileDetailType } from '@/lib/profileMapper';
import styles from './styles.module.css';
import { getPolishErrorFromResponse, translateErrorMessageToPolish } from '@/lib/errorMapper';

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

/* Prosty modal potwierdzenia (zamiast confirm()) */
function ConfirmModal(props: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const {
        title,
        description,
        confirmText = 'Potwierdź',
        cancelText = 'Anuluj',
        loading,
        error,
        onConfirm,
        onClose,
    } = props;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(2,6,23,0.45)',
                padding: 20,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(560px, 96%)',
                    background: '#fff',
                    borderRadius: 12,
                    padding: 18,
                    boxShadow: '0 20px 60px rgba(2,6,23,0.12)',
                }}
            >
                <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3>
                <p style={{ marginTop: 0, color: '#374151' }}>{description}</p>

                {error ? <div style={{ color: '#dc2626', marginTop: 10 }}>{error}</div> : null}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button className={styles.ghostBtn} onClick={onClose} disabled={!!loading}>
                        {cancelText}
                    </button>
                    <button className={styles.primaryBtn} onClick={onConfirm} disabled={!!loading}>
                        {loading ? 'Trwa…' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Ładna etykieta roli */
function roleLabelPl(role: string): string {
    const r = (role || '').toUpperCase();
    if (r.includes('ADMIN')) return 'Administrator';
    if (r.includes('WORKER')) return 'Pracownik';
    if (r.includes('USER')) return 'Użytkownik';
    return role.replace(/^ROLE_/i, '');
}

export default function AdminProfilesPage() {
    const { initialized } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [items, setItems] = useState<ListProfileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [size] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState<string | null>(null);

    const [selected, setSelected] = useState<ProfileDetailType | null>(null);

    const [rolesList, setRolesList] = useState<RoleOption[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);

    const [availableDisciplines, setAvailableDisciplines] = useState<Discipline[]>([]);
    const [disciplinesLoading, setDisciplinesLoading] = useState(false);

    const [selectedRole, setSelectedRole] = useState<string>('');
    const [selectedDiscipline, setSelectedDiscipline] = useState<number | ''>('');
    const [actionLoading, setActionLoading] = useState(false);

    const [pendingUserRoles, setPendingUserRoles] = useState<string[] | null>(null);

    const debounceRef = useRef<number | null>(null);
    const listAbortRef = useRef<AbortController | null>(null);

    // --- MODAL potwierdzenia (zamiast confirm) ---
    const [confirmState, setConfirmState] = useState<null | {
        kind: 'assignRole' | 'revokeRole' | 'addDiscipline' | 'removeDiscipline';
        title: string;
        description: string;
        onConfirm: () => Promise<void>;
    }>(null);
    const [confirmErr, setConfirmErr] = useState<string | null>(null);

    function userDisplay() {
        const name = selected?.fullName?.trim() || 'Użytkownik';
        const email = selected?.email?.trim();
        return email ? `${name} (${email})` : name;
    }

    useEffect(() => {
        if (rolesList.length && pendingUserRoles && pendingUserRoles.length) {
            const match = rolesList.find(
                (r) =>
                    pendingUserRoles.includes(r.value) ||
                    pendingUserRoles.includes(r.value.replace(/^ROLE_/i, '')) ||
                    pendingUserRoles.includes(r.label)
            );
            if (match) setSelectedRole(match.value);
            else setSelectedRole(rolesList[0].value);
            setPendingUserRoles(null);
        } else if (rolesList.length && !selectedRole && !pendingUserRoles) {
            setSelectedRole(rolesList[0].value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rolesList]);

    useEffect(() => {
        if (!initialized) return;

        if (listAbortRef.current) {
            listAbortRef.current.abort();
            listAbortRef.current = null;
        }
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
                signal: signal as any,
            } as RequestInit);

            if (!res.ok) {
                setError(await getPolishErrorFromResponse(res));
                setItems([]);
                return;
            }

            const data = await res.json().catch(() => null);
            setItems(data?.items ?? data?.data ?? []);
            setTotalPages(data?.totalPages ?? Math.max(1, Math.ceil((data?.total ?? 0) / size)));
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            setError(translateErrorMessageToPolish(String(err?.message ?? err)));
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    async function fetchRoles() {
        setRolesLoading(true);
        try {
            const res = await authFetch('/api/admin/roles', { method: 'GET' });
            if (!res.ok) return;

            const text = await res.text().catch(() => '');
            let data: any = null;
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = text;
            }

            let arr: any[] = [];
            if (Array.isArray(data)) arr = data;
            else if (Array.isArray(data?.roles)) arr = data.roles;
            else if (Array.isArray(data?.data)) arr = data.data;
            else if (Array.isArray(data?.items)) arr = data.items;

            if (!arr.length) {
                const fallback = [
                    { value: 'ROLE_ADMIN', label: 'Administrator' },
                    { value: 'ROLE_WORKER', label: 'Pracownik' },
                    { value: 'ROLE_USER', label: 'Użytkownik' },
                ];
                setRolesList(fallback);
                if (!selectedRole) setSelectedRole(fallback[0].value);
                return;
            }

            const normalized: RoleOption[] = arr.map((it: any) => {
                const v = typeof it === 'string' ? it : String(it.value ?? it.name ?? it);
                return { value: v, label: roleLabelPl(v) };
            });

            setRolesList(normalized);
            if (!selectedRole && normalized.length) setSelectedRole(normalized[0].value);
        } finally {
            setRolesLoading(false);
        }
    }

    async function fetchDisciplines() { setDisciplinesLoading(true); try { const res = await authFetch('/api/profile/listDisciplines', { method: 'GET' }); if (!res.ok) { console.warn('[fetchDisciplines]', await getPolishErrorFromResponse(res)); return; } const text = await res.text().catch(() => ''); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; } let arr: any[] = []; if (Array.isArray(data)) arr = data; else if (Array.isArray(data?.discipline)) arr = data.discipline; else if (Array.isArray(data?.disciplineList)) arr = data.disciplineList; else if (Array.isArray(data?.items)) arr = data.items; else { const firstArr = data && typeof data === 'object' && Object.values(data).find((v) => Array.isArray(v)); if (firstArr) arr = firstArr as any[]; } const normalized: Discipline[] = (arr || []).map((d: any) => ({ id: Number(d.id ?? d.disciplineId ?? d.value ?? 0), name: d.name ?? d.label ?? String(d), })); setAvailableDisciplines(normalized); } catch (e) { console.error('[fetchDisciplines] error', e); } finally { setDisciplinesLoading(false); } }

    function onSearchChange(v: string) {
        setSearch(v);
        if (!initialized) return;

        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        if (listAbortRef.current) {
            listAbortRef.current.abort();
            listAbortRef.current = null;
        }

        debounceRef.current = window.setTimeout(() => {
            setPage(0);
            fetchList(listAbortRef.current?.signal);
            debounceRef.current = null;
        }, 300);
    }

    function onSearchNow() {
        if (!initialized) return;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        if (listAbortRef.current) {
            listAbortRef.current.abort();
            listAbortRef.current = null;
        }
        setPage(0);
        fetchList();
    }

    async function openProfile(userId: number) { setError(null); try { const res = await authFetch(`/api/profile/someone?userId=${userId}`, { method: 'GET' }); if (!res.ok) { setError(await getPolishErrorFromResponse(res)); return; } const data = await res.json().catch(() => null); const mapped = mapSomeoneToProfileDetail(data ?? null, userId); setSelected(mapped); const rolesFromUser = mapped.roles ?? []; setPendingUserRoles(Array.isArray(rolesFromUser) ? rolesFromUser.map(String) : []); if (rolesList.length) { const match = rolesList.find( (r) => rolesFromUser.includes(r.value) || rolesFromUser.includes(r.value.replace(/^ROLE_/i, '')) || rolesFromUser.includes(r.label) ); if (match) setSelectedRole(match.value); } setSelectedDiscipline(''); try { router.replace(`/admin/profiles?open=${userId}`); } catch {} } catch (e) { console.error('[openProfile] error', e); setError('Błąd pobierania profilu.'); } }

    function closeSelected() {
        setSelected(null);
        try {
            router.replace('/admin/profiles');
        } catch {}
    }

    // --------- akcje (bez confirm()) + modal ----------
    function askConfirm(opts: {
        kind: 'assignRole' | 'revokeRole' | 'addDiscipline' | 'removeDiscipline';
        title: string;
        description: string;
        onConfirm: () => Promise<void>;
    }) {
        setConfirmErr(null);
        setConfirmState(opts);
    }

    async function assignRoleToUser(userId: number, role: string) {
        askConfirm({
            kind: 'assignRole',
            title: 'Nadać rolę?',
            description: `Czy na pewno chcesz nadać rolę „${roleLabelPl(role)}” użytkownikowi: ${userDisplay()}?`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    const res = await authFetch('/api/auth/admin/assign-role', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, roleName: role }),
                    });

                    if (!res.ok) {
                        setConfirmErr(await getPolishErrorFromResponse(res));
                        return;
                    }

                    setConfirmState(null);
                    await openProfile(userId);
                    await fetchList();
                } catch (err: any) {
                    setConfirmErr(translateErrorMessageToPolish(String(err?.message ?? err)));
                } finally {
                    setActionLoading(false);
                }
            },
        });
    }

    async function revokeRoleFromUser(userId: number, role: string) {
        askConfirm({
            kind: 'revokeRole',
            title: 'Odebrać rolę?',
            description: `Czy na pewno chcesz odebrać rolę „${roleLabelPl(role)}” użytkownikowi: ${userDisplay()}?`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    const res = await authFetch('/api/auth/admin/revoke-role', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, roleName: role }),
                    });

                    if (!res.ok) {
                        setConfirmErr(await getPolishErrorFromResponse(res));
                        return;
                    }

                    setConfirmState(null);
                    await openProfile(userId);
                    await fetchList();
                } catch (err: any) {
                    setConfirmErr(translateErrorMessageToPolish(String(err?.message ?? err)));
                } finally {
                    setActionLoading(false);
                }
            },
        });
    }

    async function addDisciplineToUser(userId: number, disciplineId: number) {
        const d = availableDisciplines.find((x) => x.id === disciplineId);
        askConfirm({
            kind: 'addDiscipline',
            title: 'Dodać dyscyplinę?',
            description: `Dodać dyscyplinę „${d?.name ?? disciplineId}” użytkownikowi: ${userDisplay()}?`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    const res = await authFetch(`/api/profile/addDiscipline?userId=${userId}&disciplineId=${disciplineId}`, {
                        method: 'POST',
                    });

                    if (!res.ok) {
                        setConfirmErr(await getPolishErrorFromResponse(res));
                        return;
                    }

                    setConfirmState(null);
                    await openProfile(userId);
                    await fetchList();
                } catch (err: any) {
                    setConfirmErr(translateErrorMessageToPolish(String(err?.message ?? err)));
                } finally {
                    setActionLoading(false);
                }
            },
        });
    }

    async function removeDisciplineFromUser(userId: number, disciplineId: number) {
        const d = (selected?.disciplines || []).find((x) => x.id === disciplineId);
        askConfirm({
            kind: 'removeDiscipline',
            title: 'Usunąć dyscyplinę?',
            description: `Usunąć dyscyplinę „${d?.name ?? disciplineId}” z użytkownika: ${userDisplay()}?`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    const res = await authFetch(
                        `/api/profile/deleteDiscipline?userId=${userId}&disciplineId=${disciplineId}`,
                        { method: 'DELETE' }
                    );

                    if (!res.ok) {
                        setConfirmErr(await getPolishErrorFromResponse(res));
                        return;
                    }

                    setConfirmState(null);
                    await openProfile(userId);
                    await fetchList();
                } catch (err: any) {
                    setConfirmErr(translateErrorMessageToPolish(String(err?.message ?? err)));
                } finally {
                    setActionLoading(false);
                }
            },
        });
    }

    function initials(name?: string) {
        if (!name) return 'U';
        return name
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    if (!initialized) {
        return (
            <div className={styles.page} style={{ paddingTop: 24 }}>
                <header className={styles.header}>
                    <h1 className={styles.title}>Panel admin — Zarządzaj profilami</h1>
                </header>
                <div style={{ padding: 28 }} className={styles.loading}>
                    Ładowanie…
                </div>
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
                        <button className={styles.primaryBtn} onClick={onSearchNow}>
                            Szukaj
                        </button>
                        <button
                            className={styles.ghostBtn}
                            onClick={() => {
                                setSearch('');
                                setPage(0);
                                onSearchNow();
                            }}
                        >
                            Wyczyść
                        </button>
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
                                <p>
                                    <strong>Jednostka:</strong> {selected.workerUnit ?? '—'}
                                </p>
                                <p>
                                    <strong>Tytuł / stopień:</strong> {selected.workerDegree ?? '—'}
                                </p>

                                <h4>Dyscypliny</h4>
                                <div className={styles.disciplines}>
                                    {(selected.disciplines || []).length ? (
                                        (selected.disciplines || []).map((d) => (
                                            <div
                                                key={d.id}
                                                className={styles.disciplineItem}
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                                <span>{d.name}</span>
                                                <button
                                                    className={styles.infoBtn}
                                                    onClick={() => removeDisciplineFromUser(selected.userId, d.id)}
                                                    disabled={actionLoading}
                                                >
                                                    Usuń
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className={styles.muted}>Brak przypisanych dyscyplin</div>
                                    )}
                                </div>

                                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <select
                                        value={selectedDiscipline ?? ''}
                                        onChange={(e) => setSelectedDiscipline(e.target.value ? Number(e.target.value) : '')}
                                        style={{ flex: 1, padding: 8, borderRadius: 8 }}
                                        disabled={disciplinesLoading}
                                    >
                                        <option value="">— wybierz dyscyplinę —</option>
                                        {availableDisciplines.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => {
                                            if (selected && selectedDiscipline) addDisciplineToUser(selected.userId, Number(selectedDiscipline));
                                        }}
                                        disabled={actionLoading || !selectedDiscipline}
                                    >
                                        Dodaj
                                    </button>
                                </div>

                                <h4 style={{ marginTop: 18 }}>Role</h4>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                        style={{ padding: 8, borderRadius: 8 }}
                                        disabled={rolesLoading}
                                    >
                                        {rolesList.map((r) => (
                                            <option key={r.value} value={r.value}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => selected && assignRoleToUser(selected.userId, selectedRole)}
                                        disabled={actionLoading}
                                    >
                                        Nadaj
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        onClick={() => selected && revokeRoleFromUser(selected.userId, selectedRole)}
                                        disabled={actionLoading}
                                    >
                                        Zabierz
                                    </button>
                                </div>

                                <div style={{ marginTop: 18 }}>
                                    <button className={styles.ghostBtn} onClick={closeSelected}>
                                        Zamknij
                                    </button>
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
                                    {items.map((it) => (
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
                                                    {it.hasAdmin ? (
                                                        <span className={`${styles.badge} ${styles.badgeAdmin}`}>Administrator</span>
                                                    ) : null}
                                                    {it.hasWorker ? (
                                                        <span className={`${styles.badge} ${styles.badgeWorker}`}>Pracownik</span>
                                                    ) : !it.hasAdmin ? (
                                                        <span className={`${styles.badge} ${styles.badgeMuted}`}>Użytkownik</span>
                                                    ) : null}
                                                </div>

                                                <div className={styles.cardActions}>
                                                    <button className={styles.infoBtn} onClick={() => openProfile(it.id)}>
                                                        Szczegóły
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    <div className={styles.pagerWrap}>
                        <button
                            className={styles.pageBtn}
                            onClick={() => {
                                if (page > 0) setPage((p) => Math.max(0, p - 1));
                            }}
                            disabled={page === 0}
                        >
                            Poprzednia
                        </button>
                        <div className={styles.pageInfo}>
                            Strona {page + 1} / {Math.max(1, totalPages)}
                        </div>
                        <button
                            className={styles.pageBtn}
                            onClick={() => {
                                if (page + 1 < totalPages) setPage((p) => p + 1);
                            }}
                            disabled={page + 1 >= totalPages}
                        >
                            Następna
                        </button>
                    </div>
                </main>
            </div>

            {/* MODAL POTWIERDZENIA (zamiast confirm()) */}
            {confirmState && (
                <ConfirmModal
                    title={confirmState.title}
                    description={confirmState.description}
                    confirmText="Tak, wykonaj"
                    cancelText="Anuluj"
                    loading={actionLoading}
                    error={confirmErr}
                    onClose={() => {
                        if (!actionLoading) setConfirmState(null);
                    }}
                    onConfirm={() => confirmState.onConfirm()}
                />
            )}
        </div>
    );
}

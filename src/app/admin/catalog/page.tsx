'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../profiles/styles.module.css';

// ===================== ENDPOINTY =====================
// Catalog (admin słowniki)
const LIST_DISCIPLINES_URL = '/api/article/admin/listDisciplines';
const LIST_TYPES_URL = '/api/article/admin/listTypes';
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

const CREATE_DISCIPLINE_URL = (name: string) => `/api/article/admin/createDiscipline?name=${encodeURIComponent(name)}`;
const UPDATE_DISCIPLINE_URL = (id: number, name: string) =>
    `/api/article/admin/updateDiscipline?id=${encodeURIComponent(String(id))}&name=${encodeURIComponent(name)}`;
const DELETE_DISCIPLINE_URL = (id: number) => `/api/article/admin/deleteDiscipline?id=${encodeURIComponent(String(id))}`;

const CREATE_TYPE_URL = (name: string) => `/api/article/admin/createType?name=${encodeURIComponent(name)}`;
const UPDATE_TYPE_URL = (id: number, name: string) =>
    `/api/article/admin/updateType?id=${encodeURIComponent(String(id))}&name=${encodeURIComponent(name)}`;
const DELETE_TYPE_URL = (id: number) => `/api/article/admin/deleteType?id=${encodeURIComponent(String(id))}`;

const CREATE_CYCLE_URL = '/api/article/admin/createEvalCycle';
const UPDATE_CYCLE_URL = '/api/article/admin/updateEvalCycle';
const DELETE_CYCLE_URL = (id: number) => `/api/article/admin/deleteEvalCycle?id=${encodeURIComponent(String(id))}`;

// Recalc jobs
const RECALC_MONO_URL = (cycleId: number) => `/api/etl/admin/recalculateMonoPoints?cycleId=${cycleId}`;
// Podmień jeśli masz inny endpoint dla artykułów:
const RECALC_ARTICLES_URL = (cycleId: number) => `/api/etl/admin/recalcCycleScores?cycleId=${cycleId}`;
const JOB_STATUS_URL = (jobId: number) => `/api/etl/admin/getJobStatus?jobId=${jobId}`;

// Dropdowny wersji MEiN (do powiązania cyklu)
const MEIN_VERSIONS_LIST_URL = '/api/etl/admin/listMeinVersions';
const MEIN_MONO_VERSIONS_LIST_URL = '/api/etl/admin/listMeinMonoVersions';

// ===================== TYPY =====================
type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };

type RefItem = { id: number; name: string };

type CycleItem = {
    id: number;
    name: string;
    yearFrom: number;
    yearTo: number;
    active: boolean;
    activeYear?: number | null;
    meinVersionId?: number | null;
    meinMonoVersionId?: number | null;
};

type JobItem = {
    jobId: number;
    cycleId?: number;
    status?: string;
    type?: string;
    error?: string | null;
    createdAt: number;
    done: boolean;
};

type MeinVersion = {
    id: number;
    label?: string | null;
    status?: string | null;
    active?: boolean | null;
};

type MeinMonoVersion = {
    id: number;
    label?: string | null;
    status?: string | null;
};

function isJobDone(status?: string) {
    const s = String(status ?? '').toUpperCase();
    return ['DONE', 'SUCCESS', 'FINISHED', 'FAILED', 'ERROR', 'CANCELLED'].includes(s);
}

function badgeClassForJob(status?: string) {
    const s = String(status ?? '').toUpperCase();
    if (s === 'RUNNING' || s === 'IN_PROGRESS' || s === 'PENDING') return styles.badgeWorker;
    if (s === 'DONE' || s === 'SUCCESS' || s === 'FINISHED') return styles.badgeMuted;
    if (s === 'FAILED' || s === 'ERROR') return styles.badgeAdmin;
    return styles.badgeMuted;
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
    if (!props.open) return null;

    return (
        <div className={styles.modalOverlay} onMouseDown={props.onClose}>
            <div className={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>{props.title}</h3>
                    <button className={styles.ghostBtn} onClick={props.onClose}>
                        Zamknij
                    </button>
                </div>
                <div>{props.children}</div>
            </div>
        </div>
    );
}

function asNullIfZero(v: any): number | null {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function friendlyCycleSaveError(raw: string): string {
    const s = String(raw || '');
    if (/ALREADY_EXISTS/i.test(s) || /already exists/i.test(s)) {
        return 'Taki cykl już istnieje (nazwa musi być unikalna). Zmień nazwę cyklu.';
    }
    return s || 'Błąd zapisu cyklu.';
}

export default function AdminCatalogPage() {
    const { initialized } = useAuth();

    const [tab, setTab] = useState<'disciplines' | 'types' | 'cycles'>('disciplines');

    // wspólne stronicowanie
    const [pageMeta, setPageMeta] = useState<PageMeta>({ page: 0, size: 20 });

    // ---------- disciplines ----------
    const [disciplines, setDisciplines] = useState<RefItem[]>([]);
    const [discLoading, setDiscLoading] = useState(false);
    const [discError, setDiscError] = useState<string | null>(null);

    // ---------- types ----------
    const [types, setTypes] = useState<RefItem[]>([]);
    const [typeLoading, setTypeLoading] = useState(false);
    const [typeError, setTypeError] = useState<string | null>(null);

    // ---------- cycles ----------
    const [cycles, setCycles] = useState<CycleItem[]>([]);
    const [cycleLoading, setCycleLoading] = useState(false);
    const [cycleError, setCycleError] = useState<string | null>(null);

    // ---------- recalc ----------
    const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
    const [recalcJobs, setRecalcJobs] = useState<JobItem[]>([]);
    const intervalRef = useRef<number | null>(null);
    const jobsRef = useRef<JobItem[]>([]);
    useEffect(() => {
        jobsRef.current = recalcJobs;
    }, [recalcJobs]);

    const hasPendingRecalcJobs = useMemo(() => recalcJobs.some((j) => !j.done), [recalcJobs]);

    // ---------- dropdown: MEiN versions ----------
    const [meinVersions, setMeinVersions] = useState<MeinVersion[]>([]);
    const [meinMonoVersions, setMeinMonoVersions] = useState<MeinMonoVersion[]>([]);
    const [meinVLoading, setMeinVLoading] = useState(false);
    const [meinMVLoading, setMeinMVLoading] = useState(false);

    // ---------- modal: ref (discipline/type) ----------
    const [refModalOpen, setRefModalOpen] = useState(false);
    const [refModalKind, setRefModalKind] = useState<'discipline' | 'type'>('discipline');
    const [refModalId, setRefModalId] = useState<number | null>(null);
    const [refModalName, setRefModalName] = useState('');

    // ---------- modal: cycle ----------
    const [cycleModalOpen, setCycleModalOpen] = useState(false);
    const [cycleModalIsEdit, setCycleModalIsEdit] = useState(false);
    const [cycleForm, setCycleForm] = useState<Partial<CycleItem>>({
        name: '',
        yearFrom: new Date().getFullYear() - 1,
        yearTo: new Date().getFullYear(),
        active: false,
        activeYear: new Date().getFullYear(),
    });

    // ====== INIT ======
    useEffect(() => {
        if (!initialized) return;
        if (tab === 'disciplines') fetchDisciplines(0, pageMeta.size);
        if (tab === 'types') fetchTypes(0, pageMeta.size);
        if (tab === 'cycles') fetchCycles(0, pageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    useEffect(() => {
        if (!initialized) return;
        setPageMeta((p) => ({ ...p, page: 0 }));
        if (tab === 'disciplines') fetchDisciplines(0, pageMeta.size);
        if (tab === 'types') fetchTypes(0, pageMeta.size);
        if (tab === 'cycles') fetchCycles(0, pageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    // domyślny cykl do dropdown (cycles tab)
    useEffect(() => {
        if (tab !== 'cycles') return;
        if (!cycles || cycles.length === 0) return;
        if (selectedCycleId != null) return;
        setSelectedCycleId(cycles[0].id);
    }, [tab, cycles, selectedCycleId]);

    // ====== POLLING JOBÓW ======
    useEffect(() => {
        if (!hasPendingRecalcJobs) {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            intervalRef.current = null;
            return;
        }

        if (intervalRef.current) return;

        intervalRef.current = window.setInterval(async () => {
            const pending = jobsRef.current.filter((j) => !j.done);
            if (pending.length === 0) return;

            await Promise.all(
                pending.map(async (j) => {
                    try {
                        const res = await authFetch(JOB_STATUS_URL(j.jobId), { method: 'GET' });
                        const text = await res.text().catch(() => '');
                        if (!res.ok) return;

                        const data = text ? JSON.parse(text) : null;
                        const nextStatus = data?.status ?? j.status;
                        const done = isJobDone(nextStatus);

                        setRecalcJobs((prev) =>
                            prev.map((x) =>
                                x.jobId === j.jobId
                                    ? {
                                        ...x,
                                        status: nextStatus,
                                        type: data?.type ?? x.type,
                                        error: data?.error ?? x.error,
                                        done,
                                    }
                                    : x
                            )
                        );
                    } catch {
                        // ignore
                    }
                })
            );
        }, 2500);

        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [hasPendingRecalcJobs]);

    // ====== LIST API ======
    async function fetchDisciplines(page = 0, size = 20) {
        setDiscLoading(true);
        setDiscError(null);
        try {
            const res = await authFetch(LIST_DISCIPLINES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, size, sortDir: 'ASC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            setDisciplines((data?.item ?? data?.items ?? []) as RefItem[]);
            setPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setDisciplines([]);
            setDiscError(String(e?.message ?? e));
        } finally {
            setDiscLoading(false);
        }
    }

    async function fetchTypes(page = 0, size = 20) {
        setTypeLoading(true);
        setTypeError(null);
        try {
            const res = await authFetch(LIST_TYPES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, size, sortDir: 'ASC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            setTypes((data?.item ?? data?.items ?? []) as RefItem[]);
            setPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setTypes([]);
            setTypeError(String(e?.message ?? e));
        } finally {
            setTypeLoading(false);
        }
    }

    async function fetchCycles(page = 0, size = 20) {
        setCycleLoading(true);
        setCycleError(null);
        try {
            const res = await authFetch(LIST_CYCLES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, size, sortDir: 'DESC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            setCycles((data?.item ?? data?.items ?? []) as CycleItem[]);
            setPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setCycles([]);
            setCycleError(String(e?.message ?? e));
        } finally {
            setCycleLoading(false);
        }
    }

    // ====== LIST: MEiN versions for dropdowns ======
    async function fetchMeinVersionsForDropdown() {
        setMeinVLoading(true);
        try {
            const res = await authFetch(MEIN_VERSIONS_LIST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];

            const mapped: MeinVersion[] = (Array.isArray(items) ? items : []).map((v: any) => ({
                id: Number(v?.id ?? v?.versionId ?? v?.version_id),
                label: v?.label ?? null,
                status: v?.status ?? null,
                active: v?.active ?? null,
            }));

            setMeinVersions(mapped.filter((x) => x.id > 0));
        } catch {
            setMeinVersions([]);
        } finally {
            setMeinVLoading(false);
        }
    }

    async function fetchMeinMonoVersionsForDropdown() {
        setMeinMVLoading(true);
        try {
            const res = await authFetch(MEIN_MONO_VERSIONS_LIST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];

            const mapped: MeinMonoVersion[] = (Array.isArray(items) ? items : []).map((v: any) => ({
                id: Number(v?.id ?? v?.versionId ?? v?.version_id ?? v?.monoVersionId),
                label: v?.label ?? null,
                status: v?.status ?? null,
            }));

            setMeinMonoVersions(mapped.filter((x) => x.id > 0));
        } catch {
            setMeinMonoVersions([]);
        } finally {
            setMeinMVLoading(false);
        }
    }

    // dociągnij dropdowny, gdy otwierasz modal edycji cyklu
    useEffect(() => {
        if (!cycleModalOpen) return;
        if (!cycleModalIsEdit) return;

        // zawsze odśwież (żeby lista była aktualna)
        fetchMeinVersionsForDropdown();
        fetchMeinMonoVersionsForDropdown();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cycleModalOpen, cycleModalIsEdit]);

    // ====== ACTIONS: DISCIPLINE / TYPE ======
    function openCreateRef(kind: 'discipline' | 'type') {
        setRefModalKind(kind);
        setRefModalId(null);
        setRefModalName('');
        setRefModalOpen(true);
    }

    function openEditRef(kind: 'discipline' | 'type', item: RefItem) {
        setRefModalKind(kind);
        setRefModalId(item.id);
        setRefModalName(item.name);
        setRefModalOpen(true);
    }

    async function saveRef() {
        const name = refModalName.trim();
        if (!name) return alert('Podaj nazwę');

        const isEdit = refModalId != null;

        try {
            if (refModalKind === 'discipline') {
                if (!isEdit) {
                    const res = await authFetch(CREATE_DISCIPLINE_URL(name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                } else {
                    const res = await authFetch(UPDATE_DISCIPLINE_URL(refModalId!, name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                }
                setRefModalOpen(false);
                fetchDisciplines(pageMeta.page, pageMeta.size);
            }

            if (refModalKind === 'type') {
                if (!isEdit) {
                    const res = await authFetch(CREATE_TYPE_URL(name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                } else {
                    const res = await authFetch(UPDATE_TYPE_URL(refModalId!, name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                }
                setRefModalOpen(false);
                fetchTypes(pageMeta.page, pageMeta.size);
            }
        } catch (e: any) {
            alert(`Błąd zapisu: ${String(e?.message ?? e)}`);
        }
    }

    async function deleteRef(kind: 'discipline' | 'type', id: number) {
        if (!confirm('Usunąć?')) return;
        try {
            const url = kind === 'discipline' ? DELETE_DISCIPLINE_URL(id) : DELETE_TYPE_URL(id);
            const res = await authFetch(url, { method: 'DELETE' });
            const t = await res.text().catch(() => '');
            if (!res.ok) throw new Error(t || `HTTP ${res.status}`);

            if (kind === 'discipline') fetchDisciplines(pageMeta.page, pageMeta.size);
            if (kind === 'type') fetchTypes(pageMeta.page, pageMeta.size);
        } catch (e: any) {
            alert(`Błąd usuwania: ${String(e?.message ?? e)}`);
        }
    }

    // ====== ACTIONS: CYCLES ======
    function openCreateCycle() {
        setCycleModalIsEdit(false);
        setCycleForm({
            name: '',
            yearFrom: new Date().getFullYear() - 1,
            yearTo: new Date().getFullYear(),
            active: false,
            activeYear: new Date().getFullYear(),
        });
        setCycleModalOpen(true);
    }

    function openEditCycle(item: CycleItem) {
        setCycleModalIsEdit(true);

        // WAŻNE: 0 -> null (żeby nie wysyłać do backendu "0")
        const sanitized: Partial<CycleItem> = {
            ...item,
            activeYear: asNullIfZero(item.activeYear),
            meinVersionId: asNullIfZero(item.meinVersionId),
            meinMonoVersionId: asNullIfZero(item.meinMonoVersionId),
        };

        setCycleForm(sanitized);
        setCycleModalOpen(true);
    }

    async function saveCycle() {
        const name = String(cycleForm.name ?? '').trim();
        const yearFrom = Number(cycleForm.yearFrom ?? 0);
        const yearTo = Number(cycleForm.yearTo ?? 0);

        if (!name) return alert('Podaj nazwę');
        if (!yearFrom || !yearTo) return alert('Podaj yearFrom i yearTo');

        try {
            if (!cycleModalIsEdit) {
                const body = {
                    name,
                    yearFrom,
                    yearTo,
                    active: Boolean(cycleForm.active),
                    isActive: Boolean(cycleForm.active),
                    activeYear: asNullIfZero(cycleForm.activeYear),
                };

                const res = await authFetch(CREATE_CYCLE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const t = await res.text().catch(() => '');
                if (!res.ok) throw new Error(friendlyCycleSaveError(t || `HTTP ${res.status}`));
            } else {
                const id = Number(cycleForm.id ?? 0);
                if (!id) return alert('Brak id cyklu');

                const body = {
                    id,
                    name,
                    yearFrom,
                    yearTo,
                    active: Boolean(cycleForm.active),
                    meinVersionId: asNullIfZero(cycleForm.meinVersionId),
                    meinMonoVersionId: asNullIfZero(cycleForm.meinMonoVersionId),
                    activeYear: asNullIfZero(cycleForm.activeYear),
                };

                const res = await authFetch(UPDATE_CYCLE_URL, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const t = await res.text().catch(() => '');
                if (!res.ok) throw new Error(friendlyCycleSaveError(t || `HTTP ${res.status}`));
            }

            setCycleModalOpen(false);
            fetchCycles(pageMeta.page, pageMeta.size);
        } catch (e: any) {
            alert(`Błąd zapisu cyklu: ${String(e?.message ?? e)}`);
        }
    }

    async function deleteCycle(id: number) {
        if (!confirm('Usunąć cykl?')) return;
        try {
            const res = await authFetch(DELETE_CYCLE_URL(id), { method: 'DELETE' });
            const t = await res.text().catch(() => '');
            if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
            fetchCycles(pageMeta.page, pageMeta.size);
        } catch (e: any) {
            alert(`Błąd usuwania cyklu: ${String(e?.message ?? e)}`);
        }
    }

    // ====== PRZELICZANIE ======
    async function startRecalc(cycleId: number, kind: 'ARTICLES' | 'MONOS') {
        try {
            const url = kind === 'ARTICLES' ? RECALC_ARTICLES_URL(cycleId) : RECALC_MONO_URL(cycleId);

            const res = await authFetch(url, { method: 'POST' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            const jobId = Number(data?.jobId ?? data?.id ?? 0);

            if (!jobId) {
                alert('Uruchomiono przeliczenie, ale brak jobId w odpowiedzi.');
                return;
            }

            setRecalcJobs((prev) => [
                {
                    jobId,
                    cycleId,
                    status: 'RUNNING',
                    type: kind === 'ARTICLES' ? 'RECALC_ARTICLE_POINTS' : 'RECALC_MONO_POINTS',
                    error: null,
                    createdAt: Date.now(),
                    done: false,
                },
                ...prev,
            ]);
        } catch (e: any) {
            alert(`Błąd przeliczenia: ${String(e?.message ?? e)}`);
        }
    }

    async function recalcArticlesForSelectedCycle() {
        if (!selectedCycleId) return alert('Wybierz cykl');
        await startRecalc(selectedCycleId, 'ARTICLES');
    }

    async function recalcMonosForSelectedCycle() {
        if (!selectedCycleId) return alert('Wybierz cykl');
        await startRecalc(selectedCycleId, 'MONOS');
    }

    // ====== UI: paging + refresh ======
    function refreshCurrentTab() {
        if (tab === 'disciplines') fetchDisciplines(pageMeta.page, pageMeta.size);
        if (tab === 'types') fetchTypes(pageMeta.page, pageMeta.size);
        if (tab === 'cycles') fetchCycles(pageMeta.page, pageMeta.size);
    }

    function prevPage() {
        const p = Math.max(0, (pageMeta.page ?? 0) - 1);
        if (tab === 'disciplines') fetchDisciplines(p, pageMeta.size);
        if (tab === 'types') fetchTypes(p, pageMeta.size);
        if (tab === 'cycles') fetchCycles(p, pageMeta.size);
    }

    function nextPage() {
        const p = (pageMeta.page ?? 0) + 1;
        if (tab === 'disciplines') fetchDisciplines(p, pageMeta.size);
        if (tab === 'types') fetchTypes(p, pageMeta.size);
        if (tab === 'cycles') fetchCycles(p, pageMeta.size);
    }

    const loading = tab === 'disciplines' ? discLoading : tab === 'types' ? typeLoading : cycleLoading;
    const error = tab === 'disciplines' ? discError : tab === 'types' ? typeError : cycleError;

    const itemsCount = useMemo(() => {
        if (tab === 'disciplines') return disciplines.length;
        if (tab === 'types') return types.length;
        return cycles.length;
    }, [tab, disciplines.length, types.length, cycles.length]);

    // UWAGA: return dopiero po hookach
    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — Typy / Dyscypliny / Cykle</h1>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={tab === 'disciplines' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('disciplines')}>
                        Dyscypliny
                    </button>
                    <button className={tab === 'types' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('types')}>
                        Typy
                    </button>
                    <button className={tab === 'cycles' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('cycles')}>
                        Cykle
                    </button>

                    <button className={styles.ghostBtn} onClick={refreshCurrentTab} disabled={loading}>
                        Odśwież
                    </button>

                    {tab === 'disciplines' && (
                        <button className={styles.secondaryBtn} onClick={() => openCreateRef('discipline')}>
                            + Dodaj dyscyplinę
                        </button>
                    )}
                    {tab === 'types' && (
                        <button className={styles.secondaryBtn} onClick={() => openCreateRef('type')}>
                            + Dodaj typ
                        </button>
                    )}
                    {tab === 'cycles' && (
                        <button className={styles.secondaryBtn} onClick={openCreateCycle}>
                            + Dodaj cykl
                        </button>
                    )}
                </div>
            </header>

            <div className={styles.contentRow}>
                {/* LEFT */}
                <div className={styles.leftColumn}>
                    {loading ? (
                        <div className={styles.loading}>Ładowanie…</div>
                    ) : error ? (
                        <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                            Błąd: {error}
                        </div>
                    ) : itemsCount === 0 ? (
                        <div className={styles.empty}>Brak danych</div>
                    ) : tab === 'cycles' ? (
                        <div className={styles.cardsGrid}>
                            {cycles.map((c) => (
                                <div key={c.id} className={styles.cardSmall}>
                                    <div className={styles.cardTop}>
                                        <div className={styles.avatarSmall}>{`C${c.id}`}</div>
                                        <div className={styles.cardMeta}>
                                            <div className={styles.name}>{c.name}</div>
                                            <div className={styles.muted}>
                                                {c.yearFrom}–{c.yearTo} • {c.active ? 'ACTIVE' : 'INACTIVE'}
                                                {asNullIfZero(c.activeYear) != null ? ` • activeYear: ${c.activeYear}` : ''}
                                                {asNullIfZero(c.meinVersionId) != null ? ` • MEiN: v${c.meinVersionId}` : ''}
                                                {asNullIfZero(c.meinMonoVersionId) != null ? ` • MONO: v${c.meinMonoVersionId}` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.cardBottom}>
                                        <div className={styles.badgeRow}>
                      <span className={`${styles.badge} ${c.active ? styles.badgeWorker : styles.badgeMuted}`}>
                        {c.active ? 'Aktywny' : 'Nieaktywny'}
                      </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className={styles.infoBtn} onClick={() => openEditCycle(c)}>
                                                Edytuj
                                            </button>
                                            <button className={styles.dangerBtn} onClick={() => deleteCycle(c.id)}>
                                                Usuń
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {(tab === 'disciplines' ? disciplines : types).map((x) => (
                                <div key={x.id} className={styles.cardSmall}>
                                    <div className={styles.cardTop}>
                                        <div className={styles.avatarSmall}>{x.name.slice(0, 2).toUpperCase()}</div>
                                        <div className={styles.cardMeta}>
                                            <div className={styles.name}>{x.name}</div>
                                            <div className={styles.muted}>ID: {x.id}</div>
                                        </div>
                                    </div>

                                    <div className={styles.cardBottom}>
                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badge} ${styles.badgeMuted}`}>{tab === 'disciplines' ? 'Dyscyplina' : 'Typ'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className={styles.infoBtn} onClick={() => openEditRef(tab === 'disciplines' ? 'discipline' : 'type', x)}>
                                                Edytuj
                                            </button>
                                            <button className={styles.dangerBtn} onClick={() => deleteRef(tab === 'disciplines' ? 'discipline' : 'type', x.id)}>
                                                Usuń
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className={styles.pagerWrap}>
                        <button className={styles.pageBtn} disabled={loading || (pageMeta.page ?? 0) <= 0} onClick={prevPage}>
                            ← Poprzednia
                        </button>
                        <button className={styles.pageBtn} disabled={loading} onClick={nextPage}>
                            Następna →
                        </button>
                        <div className={styles.pageInfo}>
                            strona: {pageMeta.page ?? 0} • size: {pageMeta.size ?? 20}
                        </div>
                    </div>
                </div>

                {/* RIGHT */}
                <div className={styles.rightColumn}>
                    {tab === 'cycles' ? (
                        <>
                            <div className={styles.actionsCard}>
                                <h3>Przelicz punkty</h3>
                                <p>Wybierz cykl i uruchom przeliczenie punktów dla artykułów lub monografii.</p>

                                <div style={{ display: 'grid', gap: 10 }}>
                                    <select
                                        className={styles.searchInput}
                                        value={selectedCycleId ?? ''}
                                        onChange={(e) => setSelectedCycleId(e.target.value ? Number(e.target.value) : null)}
                                    >
                                        <option value="" disabled>
                                            — wybierz cykl —
                                        </option>
                                        {cycles.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({c.yearFrom}-{c.yearTo}) {c.active ? '• ACTIVE' : ''}
                                            </option>
                                        ))}
                                    </select>

                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        <button className={styles.primaryBtn} onClick={recalcArticlesForSelectedCycle} disabled={!selectedCycleId}>
                                            Przelicz punkty — artykuły
                                        </button>
                                        <button className={styles.secondaryBtn} onClick={recalcMonosForSelectedCycle} disabled={!selectedCycleId}>
                                            Przelicz punkty — monografie
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.actionsCard} style={{ marginTop: 16 }}>
                                <h3>Zadania przeliczeń</h3>
                                <p>Statusy odświeżają się automatycznie.</p>

                                {recalcJobs.length === 0 ? (
                                    <div className={styles.muted}>Brak uruchomionych zadań.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {recalcJobs.slice(0, 10).map((j) => (
                                            <div
                                                key={j.jobId}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 10,
                                                    padding: 10,
                                                    borderRadius: 12,
                                                    border: '1px solid var(--border)',
                                                    background: 'linear-gradient(180deg,#fff,#fcfdff)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ fontWeight: 900 }}>
                                                        jobId: {j.jobId} {j.cycleId ? `• cycleId: ${j.cycleId}` : ''}
                                                    </div>
                                                    <div className={styles.muted}>
                                                        {j.type ?? '—'} {j.error ? `• error: ${j.error}` : ''}
                                                    </div>
                                                </div>

                                                <span className={`${styles.badge} ${badgeClassForJob(j.status)}`}>{j.status ?? '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className={styles.actionsCard}>
                            <h3>Info</h3>
                            <p>
                                Ten panel zarządza słownikami: <b>typy publikacji</b>, <b>dyscypliny</b>, <b>cykle ewaluacji</b>.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* REF MODAL */}
            <Modal
                open={refModalOpen}
                title={
                    refModalId == null
                        ? `Dodaj ${refModalKind === 'discipline' ? 'dyscyplinę' : 'typ'}`
                        : `Edytuj ${refModalKind === 'discipline' ? 'dyscyplinę' : 'typ'}`
                }
                onClose={() => setRefModalOpen(false)}
            >
                <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className={styles.muted}>Nazwa</span>
                        <input className={styles.searchInput} placeholder="np. Informatyka" value={refModalName} onChange={(e) => setRefModalName(e.target.value)} />
                    </label>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className={styles.primaryBtn} onClick={saveRef}>
                            Zapisz
                        </button>
                        <button className={styles.ghostBtn} onClick={() => setRefModalOpen(false)}>
                            Anuluj
                        </button>
                    </div>
                </div>
            </Modal>

            {/* CYCLE MODAL */}
            <Modal open={cycleModalOpen} title={cycleModalIsEdit ? 'Edytuj cykl' : 'Dodaj cykl'} onClose={() => setCycleModalOpen(false)}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className={styles.muted}>Nazwa cyklu</span>
                        <input
                            className={styles.searchInput}
                            placeholder="np. 2022–2025"
                            value={String(cycleForm.name ?? '')}
                            onChange={(e) => setCycleForm((p) => ({ ...p, name: e.target.value }))}
                        />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className={styles.muted}>Rok od (yearFrom)</span>
                            <input
                                className={styles.searchInput}
                                type="number"
                                value={Number(cycleForm.yearFrom ?? 0) || ''}
                                onChange={(e) => setCycleForm((p) => ({ ...p, yearFrom: Number(e.target.value) }))}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className={styles.muted}>Rok do (yearTo)</span>
                            <input
                                className={styles.searchInput}
                                type="number"
                                value={Number(cycleForm.yearTo ?? 0) || ''}
                                onChange={(e) => setCycleForm((p) => ({ ...p, yearTo: Number(e.target.value) }))}
                            />
                        </label>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="checkbox" checked={Boolean(cycleForm.active)} onChange={(e) => setCycleForm((p) => ({ ...p, active: e.target.checked }))} />
                        Aktywny cykl
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className={styles.muted}>Rok aktywny (activeYear) — opcjonalnie</span>
                        <input
                            className={styles.searchInput}
                            type="number"
                            placeholder="np. 2024"
                            value={asNullIfZero(cycleForm.activeYear) == null ? '' : Number(cycleForm.activeYear)}
                            onChange={(e) => setCycleForm((p) => ({ ...p, activeYear: e.target.value ? Number(e.target.value) : null }))}
                        />
                        <span className={styles.muted} style={{ fontSize: 12 }}>
              Zostaw puste, jeśli nie używasz tej logiki. Unikaj wartości 0.
            </span>
                    </label>

                    {cycleModalIsEdit && (
                        <>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <span className={styles.muted}>MEiN — wersja artykułów/czasopism (meinVersionId)</span>
                                <select
                                    className={styles.searchInput}
                                    value={asNullIfZero(cycleForm.meinVersionId) ?? ''}
                                    onChange={(e) => setCycleForm((p) => ({ ...p, meinVersionId: e.target.value ? Number(e.target.value) : null }))}
                                    disabled={meinVLoading}
                                >
                                    <option value="">— brak / nie ustawiaj —</option>
                                    {meinVersions.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            v{v.id} • {v.label ?? v.status ?? '—'} {v.active ? '• ACTIVE' : ''}
                                        </option>
                                    ))}
                                </select>
                                <span className={styles.muted} style={{ fontSize: 12 }}>
                  To jest wersja MEiN dla artykułów/czasopism. Cykl będzie ją używał do przeliczeń / mapowań.
                </span>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <span className={styles.muted}>MEiN — wersja monografii (meinMonoVersionId)</span>
                                <select
                                    className={styles.searchInput}
                                    value={asNullIfZero(cycleForm.meinMonoVersionId) ?? ''}
                                    onChange={(e) => setCycleForm((p) => ({ ...p, meinMonoVersionId: e.target.value ? Number(e.target.value) : null }))}
                                    disabled={meinMVLoading}
                                >
                                    <option value="">— brak / nie ustawiaj —</option>
                                    {meinMonoVersions.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            v{v.id} • {v.label ?? v.status ?? '—'}
                                        </option>
                                    ))}
                                </select>
                                <span className={styles.muted} style={{ fontSize: 12 }}>
                  To jest wersja MEiN dla monografii. Unikaj ustawiania 0 – puste = null.
                </span>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className={styles.primaryBtn} onClick={saveCycle}>
                            Zapisz
                        </button>
                        <button className={styles.ghostBtn} onClick={() => setCycleModalOpen(false)}>
                            Anuluj
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

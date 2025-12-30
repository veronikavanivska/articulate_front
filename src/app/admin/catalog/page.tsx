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
    // backend często ma monoVersionId, w UI trzymamy meinMonoVersionId
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

type UiMessagePayload = { type: 'error' | 'success' | 'info'; text: string };
type UiMessage = UiMessagePayload | null;

// ===================== TŁUMACZENIE BŁĘDÓW (BEZ ID) =====================
function translateBackendMessage(msg: string): string {
    const raw = String(msg || '').trim();
    if (!raw) return 'Wystąpił błąd.';

    // 1) Jeśli backend zwrócił JSON jako tekst, wyciągnij message/error i przetłumacz to
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
        const obj: any = safeJsonParse(raw);
        if (obj) {
            // typowe pola
            const inner =
                (typeof obj.message === 'string' && obj.message) ||
                (typeof obj.error === 'string' && obj.error) ||
                (typeof obj.description === 'string' && obj.description) ||
                (typeof obj.details === 'string' && obj.details) ||
                '';

            if (inner) return translateBackendMessage(inner);

            // fallback po code (gdy brak message)
            const code = String(obj.code ?? '').toUpperCase();
            if (code === 'ALREADY_EXISTS') return 'Element o tej nazwie już istnieje.';
            if (code === 'NOT_FOUND') return 'Nie znaleziono zasobu.';
            if (code === 'INVALID_ARGUMENT') return 'Nieprawidłowe dane wejściowe.';
            if (code === 'FAILED_PRECONDITION') return 'Nie można wykonać operacji w obecnym stanie.';
        }
    }

    // 2) Normalny tekst
    const m = raw;

    // HTTP fallback
    if (/^HTTP\s+\d+/i.test(m)) return 'Wystąpił błąd serwera. Spróbuj ponownie.';

    // =========================
    // ETL / MEiN / MONO
    // =========================
    if (m === 'Not found the mein version') return 'Nie znaleziono wersji MEiN.';
    if (m === 'No MEiN article version with this id') return 'Nie znaleziono wersji MEiN (artykuły).';
    if (m === 'Not found the cycle') return 'Nie znaleziono cyklu ewaluacji.';
    if (m === 'This version is already active') return 'Ta wersja jest już aktywna.';
    if (m === 'This mein is now active') return 'Wersja MEiN została ustawiona jako aktywna.';
    if (m === 'This version is already deactivate') return 'Ta wersja jest już zdezaktywowana.';
    if (m === 'This mein is now deactivate') return 'Wersja MEiN została zdezaktywowana.';

    if (m === 'Mein version mono not found') return 'Nie znaleziono wersji MEiN (monografie).';
    if (m === 'Mein publisher not found') return 'Nie znaleziono wydawnictwa.';
    if (m === 'Not found the mein mono version') return 'Nie znaleziono wersji MEiN (monografie).';
    if (m === 'No MeinMonoVersion with this id') return 'Nie znaleziono wersji MEiN (monografie).';

    if (m === 'MEiN version deletion started or already in progress')
        return 'Usuwanie wersji MEiN (artykuły) zostało uruchomione lub już trwa.';
    if (m === 'MEiN mono version deletion started or already in progress')
        return 'Usuwanie wersji MEiN (monografie) zostało uruchomione lub już trwa.';

    if (m === 'Article recalculation started or already in progress')
        return 'Przeliczanie punktów (artykuły) zostało uruchomione lub już trwa.';
    if (m === 'Monograph cycle recalculation started or already in progress')
        return 'Przeliczanie punktów (monografie) zostało uruchomione lub już trwa.';

    if (m === 'Job not found') return 'Nie znaleziono zadania.';

    // =========================
    // ArticleService – getActiveEvalCycle()
    // =========================
    if (m === 'No active eval cycle') return 'Brak aktywnego cyklu ewaluacji.';
    if (m === 'Active eval cycle has no activeYear set.') return 'Aktywny cykl nie ma ustawionego roku aktywnego.';
    if (m === 'activeYear is outside cycle range.') return 'Rok aktywny jest poza zakresem cyklu.';

    // =========================
    // AdminArticleService – walidacje
    // =========================
    if (m === 'disciplineName is required.') return 'Podaj nazwę dyscypliny.';
    if (m === 'publicationType name is required.') return 'Podaj nazwę typu publikacji.';
    if (m === 'name is required.') return 'Podaj nazwę cyklu.';
    if (m === 'name must not be blank.') return 'Nazwa cyklu nie może być pusta.';

    if (m === 'yearFrom and yearTo must be positive.') return 'Rok „od” i „do” muszą być dodatnie.';
    if (m === 'yearFrom cannot be greater than yearTo.') return 'Rok „od” nie może być większy niż rok „do”.';

    if (m === 'activeYear is required when isActive=true.') return 'Podaj rok aktywny, gdy cykl ma być aktywny.';
    if (m === 'activeYear must be within yearFrom..yearTo.') return 'Rok aktywny musi mieścić się w zakresie cyklu.';

    if (m === 'The provided year range overlaps an existing evaluation cycle.')
        return 'Zakres lat nachodzi na istniejący cykl ewaluacji.';

    // NOT FOUND (bez ID)
    if (m.startsWith('Discipline not found')) return 'Nie znaleziono dyscypliny.';
    if (m.startsWith('Publication type not found')) return 'Nie znaleziono typu publikacji.';
    if (m.startsWith('Evaluation cycle not found')) return 'Nie znaleziono cyklu ewaluacji.';
    if (m.startsWith('EvalCycle not found')) return 'Nie znaleziono cyklu ewaluacji.';

    // ALREADY EXISTS – prosto i bez ID
    if (m === 'Publication Type with this name already exists') return 'Typ publikacji o tej nazwie już istnieje.';
    if (/PublicationType\s+".+"\s+already exists\./i.test(m)) return 'Typ publikacji o tej nazwie już istnieje.';
    if (/Discipline\s+".+"\s+already exists\./i.test(m)) return 'Dyscyplina o tej nazwie już istnieje.';
    if (/Evaluation cycle\s+".+"\s+already exists\./i.test(m)) return 'Cykl o tej nazwie już istnieje.';
    if (/ALREADY_EXISTS/i.test(m) || /already exists/i.test(m)) return 'Element o tej nazwie już istnieje.';

    // literówka backendu
    if (m === 'Publication Type name cabbot be empty') return 'Nazwa typu publikacji nie może być pusta.';

    // wersje MEiN po ID – bez ID
    if (/^meinVersionId not found:/i.test(m)) return 'Nie znaleziono wersji MEiN (artykuły).';
    if (/^monoVersionId not found:/i.test(m)) return 'Nie znaleziono wersji MEiN (monografie).';
    if (m === 'Mein Version not found') return 'Nie znaleziono wersji MEiN.';

    return m;
}

function normalizeErr(e: any): string {
    const raw = String(e?.message ?? e ?? '').trim();
    return translateBackendMessage(raw);
}


// ===================== HELPERS =====================
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

function safeJsonParse(text: string) {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function InlineNotice({ msg }: { msg: UiMessage }) {
    if (!msg) return null;

    const base: React.CSSProperties = {
        fontSize: 12,
        fontWeight: 800,
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        whiteSpace: 'pre-wrap',
    };

    const style: React.CSSProperties =
        msg.type === 'error'
            ? { ...base, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }
            : msg.type === 'success'
                ? { ...base, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }
                : { ...base, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' };

    return <div style={style}>{msg.text}</div>;
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

    // ---------- toast/message ----------
    const [uiMsg, setUiMsg] = useState<UiMessage>(null);
    const uiMsgT = useRef<number | null>(null);
    function showMessage(type: UiMessagePayload['type'], text: string) {
        setUiMsg({ type, text });
        if (uiMsgT.current) window.clearTimeout(uiMsgT.current);
        uiMsgT.current = window.setTimeout(() => setUiMsg(null), 4500);
    }

    // ---------- confirm modal ----------
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('Potwierdź');
    const [confirmBody, setConfirmBody] = useState<string | null>(null);
    const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

    function openConfirm(opts: { title: string; body?: string; onConfirm: () => Promise<void> | void }) {
        setConfirmTitle(opts.title);
        setConfirmBody(opts.body ?? null);
        confirmActionRef.current = opts.onConfirm;
        setConfirmOpen(true);
    }

    async function runConfirmAction() {
        const fn = confirmActionRef.current;
        setConfirmOpen(false);
        confirmActionRef.current = null;
        if (!fn) return;
        await fn();
    }

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

                        const data = safeJsonParse(text);
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

            const data = safeJsonParse(text);
            setDisciplines((data?.items ?? data?.item ?? []) as RefItem[]);
            setPageMeta((data?.pageMeta ?? data?.page ?? { page, size }) as PageMeta);
        } catch (e: any) {
            setDisciplines([]);
            setDiscError(normalizeErr(e));
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

            const data = safeJsonParse(text);
            setTypes((data?.items ?? data?.item ?? []) as RefItem[]);
            setPageMeta((data?.pageMeta ?? data?.page ?? { page, size }) as PageMeta);
        } catch (e: any) {
            setTypes([]);
            setTypeError(normalizeErr(e));
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

            const data = safeJsonParse(text);
            const rawItems = (data?.items ?? data?.item ?? []) as any[];

            const mapped: CycleItem[] = (Array.isArray(rawItems) ? rawItems : []).map((c: any) => {
                const active = Boolean(c?.isActive ?? c?.active);
                const monoId = asNullIfZero(c?.monoVersionId ?? c?.meinMonoVersionId ?? c?.meinMonoVersion_id);
                return {
                    id: Number(c?.id ?? 0),
                    name: String(c?.name ?? ''),
                    yearFrom: Number(c?.yearFrom ?? 0),
                    yearTo: Number(c?.yearTo ?? 0),
                    active,
                    activeYear: asNullIfZero(c?.activeYear),
                    meinVersionId: asNullIfZero(c?.meinVersionId),
                    meinMonoVersionId: monoId,
                };
            });

            setCycles(mapped.filter((x) => x.id > 0));
            setPageMeta((data?.pageMeta ?? data?.page ?? { page, size }) as PageMeta);
        } catch (e: any) {
            setCycles([]);
            setCycleError(normalizeErr(e));
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

            const data = safeJsonParse(text);
            const items = data?.items ?? data?.item ?? [];

            const mapped: MeinVersion[] = (Array.isArray(items) ? items : []).map((v: any) => ({
                id: Number(v?.id ?? v?.versionId ?? v?.version_id),
                label: v?.label ?? null,
                status: v?.status ?? null,
                active: v?.isActive ?? v?.active ?? null,
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

            const data = safeJsonParse(text);
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

    // dropdowny dociągamy przy edycji cyklu
    useEffect(() => {
        if (!cycleModalOpen) return;
        if (!cycleModalIsEdit) return;
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
        if (!name) return showMessage('error', 'Podaj nazwę.');

        const isEdit = refModalId != null;

        try {
            if (refModalKind === 'discipline') {
                if (!isEdit) {
                    const res = await authFetch(CREATE_DISCIPLINE_URL(name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                    showMessage('success', 'Dyscyplina dodana.');
                } else {
                    const res = await authFetch(UPDATE_DISCIPLINE_URL(refModalId!, name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                    showMessage('success', 'Dyscyplina zaktualizowana.');
                }
                setRefModalOpen(false);
                fetchDisciplines(pageMeta.page, pageMeta.size);
            }

            if (refModalKind === 'type') {
                if (!isEdit) {
                    const res = await authFetch(CREATE_TYPE_URL(name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                    showMessage('success', 'Typ dodany.');
                } else {
                    const res = await authFetch(UPDATE_TYPE_URL(refModalId!, name), { method: 'POST' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                    showMessage('success', 'Typ zaktualizowany.');
                }
                setRefModalOpen(false);
                fetchTypes(pageMeta.page, pageMeta.size);
            }
        } catch (e: any) {
            showMessage('error', normalizeErr(e));
        }
    }

    async function deleteRef(kind: 'discipline' | 'type', id: number) {
        openConfirm({
            title: 'Potwierdź usunięcie',
            body: 'Ta operacja jest nieodwracalna.',
            onConfirm: async () => {
                try {
                    const url = kind === 'discipline' ? DELETE_DISCIPLINE_URL(id) : DELETE_TYPE_URL(id);
                    const res = await authFetch(url, { method: 'DELETE' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);

                    showMessage('success', 'Usunięto.');
                    if (kind === 'discipline') fetchDisciplines(pageMeta.page, pageMeta.size);
                    if (kind === 'type') fetchTypes(pageMeta.page, pageMeta.size);
                } catch (e: any) {
                    showMessage('error', normalizeErr(e));
                }
            },
        });
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
        const activeYearRaw = cycleForm.activeYear;
        const activeYear = activeYearRaw == null ? null : Number(activeYearRaw);

        if (!name) return showMessage('error', 'Podaj nazwę cyklu.');
        if (!Number.isFinite(yearFrom) || yearFrom <= 0) return showMessage('error', 'Podaj poprawny rok „od” (yearFrom).');
        if (!Number.isFinite(yearTo) || yearTo <= 0) return showMessage('error', 'Podaj poprawny rok „do” (yearTo).');
        if (yearFrom > yearTo) return showMessage('error', 'Rok „od” nie może być większy niż rok „do”.');

        if (activeYear == null || !Number.isFinite(activeYear) || activeYear <= 0) {
            return showMessage('error', 'Podaj rok aktywny.');
        }


        if (activeYear < yearFrom || activeYear > yearTo) {
            return showMessage('error', `Rok aktywny musi być w zakresie ${yearFrom}–${yearTo}.`);
        }
        try {
            if (!cycleModalIsEdit) {
                const body: any = {
                    name,
                    yearFrom,
                    yearTo,
                    active: Boolean(cycleForm.active),
                    activeYear: asNullIfZero(cycleForm.activeYear) ?? 0,
                };

                const res = await authFetch(CREATE_CYCLE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const t = await res.text().catch(() => '');
                if (!res.ok) throw new Error(t || `HTTP ${res.status}`);

                showMessage('success', 'Cykl dodany.');
            } else {
                const id = Number(cycleForm.id ?? 0);
                if (!id) return showMessage('error', 'Brak cyklu do zapisu.');

                const body: any = {
                    id,
                    name,
                    yearFrom,
                    yearTo,
                    active: Boolean(cycleForm.active),
                    meinVersionId: asNullIfZero(cycleForm.meinVersionId) ?? 0,
                    monoVersionId: asNullIfZero(cycleForm.meinMonoVersionId) ?? 0,
                    activeYear: asNullIfZero(cycleForm.activeYear) ?? 0,
                };

                const res = await authFetch(UPDATE_CYCLE_URL, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const t = await res.text().catch(() => '');
                if (!res.ok) throw new Error(t || `HTTP ${res.status}`);

                showMessage('success', 'Cykl zapisany.');
            }

            setCycleModalOpen(false);
            fetchCycles(pageMeta.page, pageMeta.size);
        } catch (e: any) {
            showMessage('error', normalizeErr(e));
        }
    }


    async function deleteCycle(id: number) {
        openConfirm({
            title: 'Potwierdź usunięcie cyklu',
            body: 'Usunięcie cyklu może wpłynąć na dane i przeliczenia.',
            onConfirm: async () => {
                try {
                    const res = await authFetch(DELETE_CYCLE_URL(id), { method: 'DELETE' });
                    const t = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
                    showMessage('success', 'Cykl usunięty.');
                    fetchCycles(pageMeta.page, pageMeta.size);
                } catch (e: any) {
                    showMessage('error', normalizeErr(e));
                }
            },
        });
    }

    // ====== PRZELICZANIE ======
    async function startRecalc(cycleId: number, kind: 'ARTICLES' | 'MONOS') {
        openConfirm({
            title: 'Uruchomić przeliczenie?',
            body:
                kind === 'ARTICLES'
                    ? 'To uruchomi przeliczenie punktów artykułów dla wybranego cyklu.'
                    : 'To uruchomi przeliczenie punktów monografii dla wybranego cyklu.',
            onConfirm: async () => {
                try {
                    const url = kind === 'ARTICLES' ? RECALC_ARTICLES_URL(cycleId) : RECALC_MONO_URL(cycleId);

                    const res = await authFetch(url, { method: 'POST' });
                    const text = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

                    const data = safeJsonParse(text);
                    const jobId = Number(data?.jobId ?? data?.id ?? 0);

                    if (!jobId) {
                        showMessage('error', 'Uruchomiono przeliczenie, ale brak identyfikatora zadania w odpowiedzi.');
                        return;
                    }

                    showMessage('success', 'Przeliczenie uruchomione.');

                    setRecalcJobs((prev) => [
                        {
                            jobId,
                            cycleId,
                            status: 'RUNNING',
                            type: kind === 'ARTICLES' ? 'RECALC_CYCLE_SCORES' : 'RECALC_MONO_CYCLE_SCORES',
                            error: null,
                            createdAt: Date.now(),
                            done: false,
                        },
                        ...prev,
                    ]);
                } catch (e: any) {
                    showMessage('error', normalizeErr(e));
                }
            },
        });
    }

    async function recalcArticlesForSelectedCycle() {
        if (!selectedCycleId) return showMessage('error', 'Wybierz cykl.');
        await startRecalc(selectedCycleId, 'ARTICLES');
    }

    async function recalcMonosForSelectedCycle() {
        if (!selectedCycleId) return showMessage('error', 'Wybierz cykl.');
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

            {/* komunikat u góry */}
            <InlineNotice msg={uiMsg} />

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
                                            <div className={styles.muted}>{tab === 'disciplines' ? 'Dyscyplina' : 'Typ'}</div>
                                        </div>
                                    </div>

                                    <div className={styles.cardBottom}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                className={styles.infoBtn}
                                                onClick={() => openEditRef(tab === 'disciplines' ? 'discipline' : 'type', x)}
                                            >
                                                Edytuj
                                            </button>
                                            <button
                                                className={styles.dangerBtn}
                                                onClick={() => deleteRef(tab === 'disciplines' ? 'discipline' : 'type', x.id)}
                                            >
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
                        <input
                            className={styles.searchInput}
                            placeholder="np. Informatyka"
                            value={refModalName}
                            onChange={(e) => setRefModalName(e.target.value)}
                        />
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
                        <input
                            type="checkbox"
                            checked={Boolean(cycleForm.active)}
                            onChange={(e) => setCycleForm((p) => ({ ...p, active: e.target.checked }))}
                        />
                        Aktywny cykl
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className={styles.muted}>Rok aktywny</span>
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
                                <span className={styles.muted}>MEiN — wersja artykułów/czasopism</span>
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
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <span className={styles.muted}>MEiN — wersja monografii </span>
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

            {/* CONFIRM MODAL */}
            <Modal open={confirmOpen} title={confirmTitle} onClose={() => setConfirmOpen(false)}>
                <div style={{ display: 'grid', gap: 12 }}>
                    {confirmBody && (
                        <div className={styles.muted} style={{ whiteSpace: 'pre-line' }}>
                            {confirmBody}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className={styles.ghostBtn} onClick={() => setConfirmOpen(false)}>
                            Anuluj
                        </button>
                        <button className={styles.primaryBtn} onClick={runConfirmAction}>
                            Potwierdź
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

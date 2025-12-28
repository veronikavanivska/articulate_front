// src/app/worker/monographs/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { CoauthorsPicker, type CoauthorInput } from '@/components/CoauthorsPicker';
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';

// ===== WORKER (Monograph CRUD + LIST) =====
const LIST_MY_MONOGRAPHS_URL = '/api/monograph/worker/listMyMonographs';
const GET_MONOGRAPH_URL = '/api/monograph/worker/getMonograph'; // GET ?id=...
const CREATE_MONOGRAPH_URL = '/api/monograph/worker/createMonograph'; // POST
const UPDATE_MONOGRAPH_URL = '/api/monograph/worker/updateMonograph'; // PATCH (body contains id)
const DELETE_MONOGRAPH_URL = '/api/monograph/worker/deleteMonograph'; // DELETE ?id=...

// ===== SLOTS =====
const ADD_TO_SLOT_URL = '/api/slots/addToSlot';

// ===== ADMIN (SŁOWNIKI) =====
const LIST_TYPES_URL = '/api/article/admin/listTypes';
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

// ===== PROFILES (MOJE DYSCYPLINY) =====
// jeśli u Ciebie proxy ma inną nazwę (np. /api/profile/...), podmień tu:
const LIST_MY_DISCIPLINES_URL = '/api/profiles/me/disciplines';

type FieldErr = { field?: string; message?: string; defaultMessage?: string; code?: string };

function mapApiError(status: number, rawText: string): string {
    const txt = String(rawText ?? '').trim();

    let j: any = null;
    try {
        j = txt ? JSON.parse(txt) : null;
    } catch {
        j = null;
    }

    const errorsArr: FieldErr[] =
        (Array.isArray(j?.errors) && j.errors) ||
        (Array.isArray(j?.fieldErrors) && j.fieldErrors) ||
        (Array.isArray(j?.violations) && j.violations) ||
        [];

    const message =
        (typeof j?.message === 'string' && j.message) ||
        (typeof j?.error === 'string' && j.error) ||
        (typeof j?.detail === 'string' && j.detail) ||
        '';

    const statusHint =
        status === 400
            ? 'Błędne dane wejściowe.'
            : status === 401
                ? 'Brak autoryzacji (zaloguj się ponownie).'
                : status === 403
                    ? 'Brak uprawnień do tej operacji.'
                    : status === 404
                        ? 'Nie znaleziono zasobu (sprawdź ID).'
                        : status >= 500
                            ? 'Błąd serwera (API).'
                            : '';

    if (errorsArr.length > 0) {
        const lines = errorsArr
            .map((e) => {
                const f = String(e.field ?? '').trim();
                const m = String(e.message ?? e.defaultMessage ?? '').trim();
                if (f && m) return `• ${f}: ${m}`;
                if (m) return `• ${m}`;
                return '';
            })
            .filter(Boolean);

        const top = message || statusHint || `HTTP ${status}`;
        return [top, ...lines].join('\n');
    }

    if (message) return statusHint ? `${statusHint}\n${message}` : message;
    if (txt) return statusHint ? `${statusHint}\n${txt}` : txt;
    return statusHint || `HTTP ${status}`;
}

async function readApiError(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    return mapApiError(res.status, text || '');
}

// ===================== TYPY / HELPERS =====================
type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };
type RefItem = { id: number; name: string };
type CycleItem = { id: number; yearFrom: number; yearTo: number; name: string; isActive?: boolean; active?: boolean };

type Coauthor = {
    position?: number;
    userId: number;
    fullName: string;
    unitName?: string | null;
};

type MonographListItem = {
    id: number;
    title?: string | null;
    doi?: string | null;
    isbn?: string | null;

    // backend bywa różny: czasem monograficTitle
    monograficTitle?: string | null;

    publicationYear?: number | null;

    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;

    coauthors?: Coauthor[] | null;
    coauthor?: Coauthor[] | null;

    meinPoints?: number | null;
    points?: number | null;
};

type WorkerDisciplineResponse = { id: number; name: string };
type ListWorkerDisciplineResponse = {
    discipline?: WorkerDisciplineResponse[];
    disciplines?: WorkerDisciplineResponse[];
    items?: WorkerDisciplineResponse[];
    item?: WorkerDisciplineResponse[];
};

function safeJson(text: string) {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function toIntOr0(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toIntOrNull(v: any): number | null {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const x = Math.trunc(n);
    return x > 0 ? x : null;
}

function safeStr(v: any): string {
    const s = String(v ?? '').trim();
    return s ? s : '—';
}

function cycleLabel(c?: CycleItem | null) {
    if (!c) return '—';
    const yf = c.yearFrom ?? '';
    const yt = c.yearTo ?? '';
    const nm = c.name ? String(c.name) : '';
    return nm ? `${nm} (${yf}-${yt})` : `${yf}-${yt}`;
}

function normalizeCoauthors(x: any): Coauthor[] {
    const raw = x?.coauthors ?? x?.coauthor ?? x?.replaceCoauthors ?? x?.replaceCoauthor ?? [];
    const arr = Array.isArray(raw) ? (raw as any[]) : [];

    const mapped: Coauthor[] = arr
        .map((c) => {
            const fullName = String(c?.fullName ?? c?.name ?? '').trim();
            const userId = Number(c?.userId ?? c?.id ?? 0) || 0;
            const unitName = c?.unitName ?? c?.unit ?? c?.unit_name ?? null;
            const position = c?.position != null ? Number(c.position) : undefined;
            return { userId, fullName, unitName, position };
        })
        .filter((c) => c.fullName.length > 0);

    const hasPos = mapped.some((m) => Number.isFinite(Number(m.position)));
    return hasPos ? mapped.slice().sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)) : mapped;
}

function coauthorLabel(c: Coauthor): string {
    const name = safeStr(c.fullName);
    const unit = String(c.unitName ?? '').trim();
    if (unit) return `${name} — ${unit}`;
    if ((c.userId ?? 0) === 0) return `${name} — inna uczelnia`;
    return name;
}

// ===================== UI: MODAL (SCROLLOWALNY) =====================
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

                <div className={styles.modalBody}>{props.children}</div>
            </div>
        </div>
    );
}

// ===================== PAGE =====================
export default function WorkerMonographsPage() {
    const { initialized } = useAuth();

    // LIST
    const [items, setItems] = useState<MonographListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pageMeta, setPageMeta] = useState<PageMeta>({ page: 0, size: 20 });

    // TITLE SEARCH
    const [titleInput, setTitleInput] = useState('');
    const [titleQuery, setTitleQuery] = useState('');

    // DICTS
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [types, setTypes] = useState<RefItem[]>([]);
    const [disciplines, setDisciplines] = useState<RefItem[]>([]); // UWAGA: to są MOJE dyscypliny
    const [cycles, setCycles] = useState<CycleItem[]>([]);

    // FILTERS (RIGHT)
    const [filters, setFilters] = useState({ typeId: 0, disciplineId: 0, cycleId: 0 });

    // CREATE (BOTTOM)
    const [createForm, setCreateForm] = useState({
        typeId: 0,
        disciplineId: 0,
        title: '',
        doi: '',
        isbn: '',
        monograficPublisherTitle: '',
        publicationYear: '',
        coauthors: [] as CoauthorInput[],
    });
    const [creating, setCreating] = useState(false);

    // MODAL
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [draft, setDraft] = useState<any | null>(null);

    // SLOTS
    const [slotBusyId, setSlotBusyId] = useState<number | null>(null);

    const myDisciplineIdSet = useMemo(() => new Set(disciplines.map((d) => Number(d.id))), [disciplines]);

    // ===== SearchSelect options =====
    const typeOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— typ publikacji —' }, ...types.map((t) => ({ id: t.id, label: t.name }))],
        [types]
    );

    const disciplineOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— moja dyscyplina —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))],
        [disciplines]
    );

    const cycleOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— cykl —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))],
        [cycles]
    );

    useEffect(() => {
        if (!initialized) return;
        void loadFilters();
        void fetchList(0, pageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    async function loadFilters() {
        setFiltersLoading(true);
        try {
            const headers = { 'Content-Type': 'application/json' };

            const [tRes, myDiscRes, cRes] = await Promise.all([
                authFetch(LIST_TYPES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }) } as RequestInit),
                authFetch(LIST_MY_DISCIPLINES_URL, { method: 'GET' } as RequestInit),
                authFetch(LIST_CYCLES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }) } as RequestInit),
            ]);

            const [tTxt, myDiscTxt, cTxt] = await Promise.all([
                tRes.text().catch(() => ''),
                myDiscRes.text().catch(() => ''),
                cRes.text().catch(() => ''),
            ]);

            setTypes(tRes.ok ? ((safeJson(tTxt)?.item ?? safeJson(tTxt)?.items ?? []) as RefItem[]) : []);

            if (myDiscRes.ok) {
                const data = (safeJson(myDiscTxt) ?? {}) as ListWorkerDisciplineResponse;
                const arr =
                    (data?.discipline ??
                        data?.disciplines ??
                        data?.items ??
                        data?.item ??
                        []) as WorkerDisciplineResponse[];

                const mapped: RefItem[] = Array.isArray(arr)
                    ? arr.map((d) => ({ id: Number(d.id) || 0, name: String(d.name ?? '').trim() })).filter((d) => d.id > 0 && d.name)
                    : [];

                setDisciplines(mapped);
            } else {
                setDisciplines([]);
            }

            setCycles(cRes.ok ? ((safeJson(cTxt)?.item ?? safeJson(cTxt)?.items ?? []) as CycleItem[]) : []);
        } finally {
            setFiltersLoading(false);
        }
    }

    async function fetchList(page = 0, size = 20, titleOverride?: string) {
        setLoading(true);
        setErr(null);

        try {
            const effectiveTitle = String(titleOverride ?? titleQuery ?? '').trim();

            const body = {
                typeId: filters.typeId > 0 ? filters.typeId : null,
                disciplineId: filters.disciplineId > 0 ? filters.disciplineId : null,
                cycleId: filters.cycleId > 0 ? filters.cycleId : null,
                page,
                size,
                title: effectiveTitle ? effectiveTitle : null,
            };

            const res = await authFetch(LIST_MY_MONOGRAPHS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) {
                setItems([]);
                setErr(text || `HTTP ${res.status}`);
                return;
            }

            const data = safeJson(text);
            const arr = (data?.monograph ?? data?.monographs ?? data?.items ?? data?.item ?? []) as MonographListItem[];
            setItems(Array.isArray(arr) ? arr : []);
            setPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setItems([]);
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function openDetails(id: number) {
        setModalOpen(true);
        setModalLoading(true);
        setModalError(null);
        setDraft(null);

        try {
            const res = await authFetch(`${GET_MONOGRAPH_URL}?id=${encodeURIComponent(String(id))}`, { method: 'GET' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = safeJson(text) ?? null;
            const co = normalizeCoauthors(data);

            const typeId = toIntOr0(data?.typeId ?? data?.type?.id ?? 0);
            const disciplineId = toIntOr0(data?.disciplineId ?? data?.discipline?.id ?? 0);

            const monograficPublisherTitle = String(data?.monograficPublisherTitle ?? data?.monograficTitle ?? '').trim();

            setDraft({
                ...data,
                typeId,
                disciplineId,
                monograficPublisherTitle,
                coauthors: co.map((c) => ({
                    userId: Number(c.userId) || 0,
                    fullName: String(c.fullName ?? '').trim(),
                    unitName: c.unitName ?? null,
                })),
            });
        } catch (e: any) {
            setModalError(String(e?.message ?? e));
        } finally {
            setModalLoading(false);
        }
    }

    async function addToSlots(it: MonographListItem) {
        const itemId = Number(it?.id ?? 0);
        const disciplineId = Number(it?.discipline?.id ?? 0);

        if (!itemId) return;

        if (!disciplineId) {
            alert('Ta monografia nie ma ustawionej dyscypliny. Ustaw ją w szczegółach i spróbuj ponownie.');
            return;
        }

        // jeśli dyscypliny w itemach są spoza "moich", backend i tak odrzuci – ale tu dajemy jasny komunikat:
        if (disciplines.length > 0 && !myDisciplineIdSet.has(disciplineId)) {
            alert('Nie masz przypisanej tej dyscypliny (sloty działają tylko w Twoich dyscyplinach).');
            return;
        }

        setSlotBusyId(itemId);
        try {
            const body = {
                disciplineId,
                itemType: 'SLOT_ITEM_MONOGRAPH', // WAŻNE
                itemId,
            };

            const res = await authFetch(ADD_TO_SLOT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                alert('Nie udało się dodać do slotów:\n' + msg);
                return;
            }

            alert('Dodano do slotów.');
        } finally {
            setSlotBusyId(null);
        }
    }

    async function createMonograph(e?: React.FormEvent) {
        e?.preventDefault();
        setCreating(true);
        try {
            const body = {
                typeId: createForm.typeId > 0 ? createForm.typeId : null,
                disciplineId: createForm.disciplineId > 0 ? createForm.disciplineId : null,
                title: createForm.title?.trim() || null,
                doi: String(createForm.doi ?? '').trim(),
                isbn: String(createForm.isbn ?? '').trim(),
                monograficPublisherTitle: createForm.monograficPublisherTitle?.trim() || null,
                publicationYear: createForm.publicationYear ? toIntOrNull(createForm.publicationYear) : null,
                coauthors: (Array.isArray(createForm.coauthors) ? createForm.coauthors : [])
                    .map((c: any) => ({ userId: Number(c?.userId ?? 0) || 0, fullName: String(c?.fullName ?? '').trim() }))
                    .filter((c) => c.fullName.length > 0),
            };

            const res = await authFetch(CREATE_MONOGRAPH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                throw new Error(msg);
            }

            await fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20);

            setCreateForm({
                typeId: 0,
                disciplineId: 0,
                title: '',
                doi: '',
                isbn: '',
                monograficPublisherTitle: '',
                publicationYear: '',
                coauthors: [],
            });
        } catch (e: any) {
            alert('Błąd createMonograph:\n' + String(e?.message ?? e));
        } finally {
            setCreating(false);
        }
    }

    async function updateMonograph() {
        if (!draft?.id) return;

        const id = Number(draft.id);
        if (!Number.isFinite(id) || id <= 0) {
            alert('Nieprawidłowe id.');
            return;
        }

        try {
            const body = {
                id,
                typeId: draft.typeId ? Number(draft.typeId) : null,
                disciplineId: draft.disciplineId ? Number(draft.disciplineId) : null,

                title: String(draft.title ?? '').trim(),
                doi: String(draft.doi ?? '').trim(),
                isbn: String(draft.isbn ?? '').trim(),
                monograficPublisherTitle: String(draft.monograficPublisherTitle ?? '').trim() || null,
                publicationYear:
                    draft.publicationYear != null && String(draft.publicationYear).trim() !== '' ? Number(draft.publicationYear) : null,

                coauthors: Array.isArray(draft.coauthors)
                    ? draft.coauthors
                        .map((c: any) => ({
                            userId: Number(c?.userId ?? 0) || 0,
                            fullName: String(c?.fullName ?? '').trim(),
                        }))
                        .filter((c: any) => c.fullName.length > 0)
                    : [],
            };

            const res = await authFetch(UPDATE_MONOGRAPH_URL, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                alert('Błąd updateMonograph:\n' + msg);
                return;
            }

            const txt = await res.text().catch(() => '');
            const data = txt ? safeJson(txt) : null;

            const co = normalizeCoauthors(data);
            const monograficPublisherTitle = String(data?.monograficPublisherTitle ?? data?.monograficTitle ?? draft?.monograficPublisherTitle ?? '').trim();

            setDraft({
                ...data,
                typeId: toIntOr0(data?.typeId ?? data?.type?.id ?? 0),
                disciplineId: toIntOr0(data?.disciplineId ?? data?.discipline?.id ?? 0),
                monograficPublisherTitle,
                coauthors: co.map((c) => ({
                    userId: Number(c.userId) || 0,
                    fullName: String(c.fullName ?? '').trim(),
                    unitName: c.unitName ?? null,
                })),
            });

            await fetchList(pageMeta.page, pageMeta.size);
            alert('Zapisano.');
        } catch (e: any) {
            alert('Błąd updateMonograph:\n' + String(e?.message ?? e));
        }
    }

    async function deleteMonograph(id: number) {
        if (!confirm(`Usunąć monografię ID=${id}?`)) return;

        try {
            const res = await authFetch(`${DELETE_MONOGRAPH_URL}?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            await fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20);
            setModalOpen(false);
            setDraft(null);
        } catch (e: any) {
            alert('Błąd deleteMonograph: ' + String(e?.message ?? e));
        }
    }

    function prevPage() {
        const p = Math.max(0, (pageMeta.page ?? 0) - 1);
        void fetchList(p, pageMeta.size ?? 20);
    }
    function nextPage() {
        const p = (pageMeta.page ?? 0) + 1;
        void fetchList(p, pageMeta.size ?? 20);
    }

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Monografie — moje publikacje</h1>
                <button className={styles.ghostBtn} onClick={() => fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20)} disabled={loading}>
                    Odśwież
                </button>
            </header>

            {err ? (
                <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                    Błąd: {err}
                </div>
            ) : null}

            <div className={styles.contentRow}>
                {/* LEFT: LIST */}
                <div className={styles.leftColumn}>
                    {loading ? (
                        <div className={styles.loading}>Ładowanie…</div>
                    ) : items.length === 0 ? (
                        <div className={styles.empty}>Brak monografii</div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {items.map((it) => {
                                const id = Number(it?.id ?? 0);
                                const co = normalizeCoauthors(it);
                                const preview = co.slice(0, 3);
                                const more = Math.max(0, co.length - preview.length);
                                const points = Number(it?.meinPoints ?? it?.points ?? 0) || 0;

                                const disciplineId = Number(it?.discipline?.id ?? 0);
                                const canAdd =
                                    !!id &&
                                    !!disciplineId &&
                                    (disciplines.length === 0 ? true : myDisciplineIdSet.has(disciplineId)) &&
                                    slotBusyId !== id;

                                return (
                                    <div key={id || Math.random()} className={styles.cardSmall}>
                                        <div className={styles.cardTop}>
                                            <div className={styles.avatarSmall}>{id ? `#${id}` : 'M'}</div>
                                            <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                    {safeStr(it?.title)}
                                                </div>

                                                <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                    {safeStr(it?.monograficTitle)}
                                                </div>

                                                <div className={styles.muted} style={{ marginTop: 6 }}>
                                                    {it?.publicationYear ? `Rok: ${it.publicationYear}` : 'Rok: —'}
                                                    {it?.doi ? ` • DOI: ${it.doi}` : ''}
                                                    {it?.isbn ? ` • ISBN: ${it.isbn}` : ''}
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>{it?.type?.name ?? 'Typ: —'}</span>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>{it?.discipline?.name ?? 'Dyscyplina: —'}</span>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>Cykl: {cycleLabel(it?.cycle)}</span>
                                                    <span className={`${styles.badge} ${styles.badgeWorker}`}>{String(points)} pkt</span>
                                                </div>

                                                {preview.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                                        {preview.map((c, idx) => (
                                                            <span key={`${id}-c-${idx}`} className={`${styles.badge} ${styles.badgeMuted}`} title={coauthorLabel(c)}>
                                {coauthorLabel(c)}
                              </span>
                                                        ))}
                                                        {more > 0 && <span className={`${styles.badge} ${styles.badgeMuted}`}>+{more}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                            <div className={styles.badgeRow}>
                                                <span className={`${styles.badge} ${styles.badgeWorker}`}>MONOGRAPH</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <button
                                                    className={styles.primaryBtn}
                                                    onClick={() => addToSlots(it)}
                                                    disabled={!canAdd}
                                                    title={
                                                        !disciplineId
                                                            ? 'Brak dyscypliny w publikacji'
                                                            : disciplines.length > 0 && !myDisciplineIdSet.has(disciplineId)
                                                                ? 'Nie masz przypisanej tej dyscypliny'
                                                                : ''
                                                    }
                                                >
                                                    {slotBusyId === id ? 'Dodawanie…' : 'Dodaj do slotów'}
                                                </button>

                                                <button className={styles.infoBtn} onClick={() => id && openDetails(id)} disabled={!id}>
                                                    Szczegóły / Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => id && deleteMonograph(id)} disabled={!id}>
                                                    Usuń
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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

                {/* RIGHT: FILTERS */}
                <div className={styles.rightColumn}>
                    <div className={styles.actionsCard} style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
                        <h3>Szukaj</h3>
                        <p>Filtry listy monografii</p>

                        <div style={{display: 'grid', gap: 10}}>
                            <input
                                className={styles.searchInput}
                                placeholder="Szukaj po tytule…"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const t = titleInput.trim();
                                        setTitleQuery(t);
                                        void fetchList(0, pageMeta.size ?? 20, t);
                                    }
                                }}
                            />

                            <SearchSelect
                                label="Typ"
                                value={filters.typeId}
                                options={typeOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— typ publikacji —"
                                onChange={(id) => setFilters((p) => ({...p, typeId: Number(id) || 0}))}
                            />

                            <SearchSelect
                                label="Dyscyplina (moja)"
                                value={filters.disciplineId}
                                options={disciplineOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— moja dyscyplina —"
                                onChange={(id) => setFilters((p) => ({...p, disciplineId: Number(id) || 0}))}
                            />

                            <SearchSelect
                                label="Cykl"
                                value={filters.cycleId}
                                options={cycleOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— cykl —"
                                onChange={(id) => setFilters((p) => ({...p, cycleId: Number(id) || 0}))}
                            />

                            <div style={{display: 'flex', gap: 10}}>
                                <button className={styles.primaryBtn} onClick={() => {
                                    const t = titleInput.trim();
                                    setTitleQuery(t);
                                    void fetchList(0, pageMeta.size ?? 20, t);
                                }}


                                        disabled={loading} style={{flex: '1 1 auto'}}>
                                    Szukaj
                                </button>
                                <button
                                    className={styles.ghostBtn}
                                    onClick={() => {
                                        setFilters({ typeId: 0, disciplineId: 0, cycleId: 0 });
                                        setTitleInput('');
                                        setTitleQuery('');
                                        void fetchList(0, pageMeta.size ?? 20, '');
                                    }}

                                    disabled={loading}
                                    style={{whiteSpace: 'nowrap'}}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CREATE (BOTTOM) */}
            <div className={styles.bigCardFull} style={{marginTop: 16}}>
                <div className={styles.cardHeader}>
                    <div className={styles.bigAvatar}>+</div>
                    <div>
                        <h3 className={styles.cardTitle}>Dodaj monografię</h3>
                        <div className={styles.muted}>createMonograph</div>
                    </div>
                </div>

                <form onSubmit={createMonograph} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <SearchSelect
                            label="Typ"
                            value={createForm.typeId}
                            options={typeOptionsSS}
                            disabled={filtersLoading}
                            placeholder="— typ publikacji —"
                            onChange={(id) => setCreateForm((p) => ({ ...p, typeId: Number(id) || 0 }))}
                        />

                        <SearchSelect
                            label="Dyscyplina (moja)"
                            value={createForm.disciplineId}
                            options={disciplineOptionsSS}
                            disabled={filtersLoading}
                            placeholder="— moja dyscyplina —"
                            onChange={(id) => setCreateForm((p) => ({ ...p, disciplineId: Number(id) || 0 }))}
                        />
                    </div>

                    <input className={styles.searchInput} placeholder="Tytuł" value={createForm.title} onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <input className={styles.searchInput} placeholder="DOI" value={createForm.doi} onChange={(e) => setCreateForm((p) => ({ ...p, doi: e.target.value }))} />
                        <input className={styles.searchInput} placeholder="ISBN" value={createForm.isbn} onChange={(e) => setCreateForm((p) => ({ ...p, isbn: e.target.value }))} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <input
                            className={styles.searchInput}
                            placeholder="Wydawca"
                            value={createForm.monograficPublisherTitle}
                            onChange={(e) => setCreateForm((p) => ({ ...p, monograficPublisherTitle: e.target.value }))}
                        />
                        <input
                            className={styles.searchInput}
                            placeholder="Rok publikacji"
                            value={createForm.publicationYear}
                            onChange={(e) => setCreateForm((p) => ({ ...p, publicationYear: e.target.value }))}
                        />
                    </div>

                    <CoauthorsPicker value={createForm.coauthors} onChange={(next) => setCreateForm((p) => ({ ...p, coauthors: next }))} label="Współautorzy" />

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className={styles.primaryBtn} type="submit" disabled={creating}>
                            {creating ? 'Zapisywanie…' : 'Dodaj'}
                        </button>
                        <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() =>
                                setCreateForm({
                                    typeId: 0,
                                    disciplineId: 0,
                                    title: '',
                                    doi: '',
                                    isbn: '',
                                    monograficPublisherTitle: '',
                                    publicationYear: '',
                                    coauthors: [],
                                })
                            }
                        >
                            Wyczyść
                        </button>
                    </div>
                </form>
            </div>

            {/* DETAILS MODAL */}
            <Modal
                open={modalOpen}
                title={draft?.id ? `Szczegóły monografii #${draft.id}` : 'Szczegóły monografii'}
                onClose={() => {
                    setModalOpen(false);
                    setDraft(null);
                    setModalError(null);
                }}
            >
                {modalLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : modalError ? (
                    <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                        Błąd: {modalError}
                    </div>
                ) : !draft ? (
                    <div className={styles.empty}>Brak danych.</div>
                ) : (
                    <>
                        <div className={styles.kvGrid} style={{ marginBottom: 12 }}>
                            <div className={styles.kvKey}>Typ</div>
                            <div className={styles.kvVal}>
                                <SearchSelect
                                    label=""
                                    value={toIntOr0(draft.typeId)}
                                    options={typeOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— typ publikacji —"
                                    onChange={(id) => setDraft((p: any) => ({ ...p, typeId: Number(id) || 0 }))}
                                />
                            </div>

                            <div className={styles.kvKey}>Dyscyplina (moja)</div>
                            <div className={styles.kvVal}>
                                <SearchSelect
                                    label=""
                                    value={toIntOr0(draft.disciplineId)}
                                    options={disciplineOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— moja dyscyplina —"
                                    onChange={(id) => setDraft((p: any) => ({ ...p, disciplineId: Number(id) || 0 }))}
                                />
                            </div>

                            <div className={styles.kvKey}>Tytuł</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.title ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, title: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>Rok</div>
                            <div className={styles.kvVal}>
                                <input
                                    className={styles.searchInput}
                                    value={String(draft.publicationYear ?? '')}
                                    onChange={(e) => setDraft((p: any) => ({ ...p, publicationYear: e.target.value ? Number(e.target.value) : null }))}
                                />
                            </div>

                            <div className={styles.kvKey}>DOI</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.doi ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, doi: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>ISBN</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.isbn ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, isbn: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>Wydawca</div>
                            <div className={styles.kvVal}>
                                <input
                                    className={styles.searchInput}
                                    value={String(draft.monograficPublisherTitle ?? '')}
                                    onChange={(e) => setDraft((p: any) => ({ ...p, monograficPublisherTitle: e.target.value }))}
                                />
                            </div>
                        </div>

                        <CoauthorsPicker
                            value={Array.isArray(draft.coauthors) ? draft.coauthors : []}
                            onChange={(next) => setDraft((p: any) => ({ ...p, coauthors: next }))}
                            label="Współautorzy"
                        />

                        <div style={{ marginTop: 12 }}>
                            <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 8 }}>
                                Podgląd współautorów
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {normalizeCoauthors({ coauthors: draft.coauthors }).map((c, idx) => (
                                    <span key={idx} className={`${styles.badge} ${styles.badgeMuted}`} title={coauthorLabel(c)}>
                    {coauthorLabel(c)}
                  </span>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <button className={styles.primaryBtn} onClick={updateMonograph}>
                                Zapisz
                            </button>
                            <button className={styles.dangerBtn} onClick={() => deleteMonograph(Number(draft.id))}>
                                Usuń
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}

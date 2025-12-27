'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { CoauthorsPicker, type CoauthorInput } from '@/components/CoauthorsPicker';
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';

// ===== WORKER (Chapter CRUD + LIST) =====
const LIST_MY_CHAPTERS_URL = '/api/monograph/worker/listMyChapters';
const GET_CHAPTER_URL = '/api/monograph/worker/getChapter'; // GET ?id=...
const CREATE_CHAPTER_URL = '/api/monograph/worker/createChapter'; // POST
const UPDATE_CHAPTER_URL = '/api/monograph/worker/updateChapter'; // PATCH (body contains id)
const DELETE_CHAPTER_URL = '/api/monograph/worker/deleteChapter'; // DELETE ?id=...

// ===== ADMIN (SŁOWNIKI) =====
const LIST_TYPES_URL = '/api/article/admin/listTypes';
const LIST_DISCIPLINES_URL = '/api/article/admin/listDisciplines';
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

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

type ChapterListItem = {
    id: number;

    monograficChapterTitle?: string | null;
    monograficTitle?: string | null;
    monographPublisher?: string | null;

    doi?: string | null;
    isbn?: string | null;
    publicationYear?: number | null;

    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;

    coauthor?: Coauthor[] | null;
    coauthors?: Coauthor[] | null;

    meinPoints?: number | null;
    points?: number | null;
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

// ===================== UI: MODAL (scroll body) =====================
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
export default function WorkerChaptersPage() {
    const { initialized } = useAuth();

    // LIST
    const [items, setItems] = useState<ChapterListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pageMeta, setPageMeta] = useState<PageMeta>({ page: 0, size: 20 });

    // DICTS
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [types, setTypes] = useState<RefItem[]>([]);
    const [disciplines, setDisciplines] = useState<RefItem[]>([]);
    const [cycles, setCycles] = useState<CycleItem[]>([]);

    // FILTERS (RIGHT)
    const [filters, setFilters] = useState({ typeId: 0, disciplineId: 0, cycleId: 0 });

    // CREATE (BOTTOM)
    const [createForm, setCreateForm] = useState({
        typeId: 0,
        disciplineId: 0,
        monograficChapterTitle: '',
        monograficTitle: '',
        monographPublisher: '',
        doi: '',
        isbn: '',
        publicationYear: '',
        coauthor: [] as CoauthorInput[], // API: "coauthor"
    });
    const [creating, setCreating] = useState(false);

    // MODAL
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [draft, setDraft] = useState<any | null>(null);

    // SearchSelect options (tak jak w articles)
    const typeOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— typ publikacji —' }, ...types.map((t) => ({ id: t.id, label: t.name }))],
        [types]
    );

    const disciplineOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— dyscyplina —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))],
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
            const [tRes, dRes, cRes] = await Promise.all([
                authFetch(LIST_TYPES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }) } as RequestInit),
                authFetch(LIST_DISCIPLINES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }) } as RequestInit),
                authFetch(LIST_CYCLES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }) } as RequestInit),
            ]);

            const [tTxt, dTxt, cTxt] = await Promise.all([tRes.text().catch(() => ''), dRes.text().catch(() => ''), cRes.text().catch(() => '')]);

            setTypes(tRes.ok ? ((safeJson(tTxt)?.item ?? safeJson(tTxt)?.items ?? []) as RefItem[]) : []);
            setDisciplines(dRes.ok ? ((safeJson(dTxt)?.item ?? safeJson(dTxt)?.items ?? []) as RefItem[]) : []);
            setCycles(cRes.ok ? ((safeJson(cTxt)?.item ?? safeJson(cTxt)?.items ?? []) as CycleItem[]) : []);
        } finally {
            setFiltersLoading(false);
        }
    }

    async function fetchList(page = 0, size = 20) {
        setLoading(true);
        setErr(null);
        try {
            const body = {
                typeId: filters.typeId > 0 ? filters.typeId : null,
                disciplineId: filters.disciplineId > 0 ? filters.disciplineId : null,
                cycleId: filters.cycleId > 0 ? filters.cycleId : null,
                page,
                size,
            };

            const res = await authFetch(LIST_MY_CHAPTERS_URL, {
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
            const arr = (data?.chapters ?? data?.items ?? data?.item ?? []) as ChapterListItem[];
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
            const res = await authFetch(`${GET_CHAPTER_URL}?id=${encodeURIComponent(String(id))}`, { method: 'GET' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = safeJson(text) ?? null;
            const co = normalizeCoauthors(data);

            const typeId = toIntOr0(data?.typeId ?? data?.type?.id ?? 0);
            const disciplineId = toIntOr0(data?.disciplineId ?? data?.discipline?.id ?? 0);

            setDraft({
                ...data,
                typeId,
                disciplineId,
                coauthor: co.map((c) => ({
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

    async function createChapter(e?: React.FormEvent) {
        e?.preventDefault();
        setCreating(true);
        try {
            const body = {
                typeId: createForm.typeId > 0 ? createForm.typeId : null,
                disciplineId: createForm.disciplineId > 0 ? createForm.disciplineId : null,

                monograficChapterTitle: createForm.monograficChapterTitle?.trim() || null,
                monograficTitle: createForm.monograficTitle?.trim() || null,
                monographPublisher: createForm.monographPublisher?.trim() || null,

                doi: String(createForm.doi ?? '').trim(),
                isbn: String(createForm.isbn ?? '').trim(),
                publicationYear: createForm.publicationYear ? toIntOrNull(createForm.publicationYear) : null,

                coauthor: (Array.isArray(createForm.coauthor) ? createForm.coauthor : [])
                    .map((c: any) => ({ userId: Number(c?.userId ?? 0) || 0, fullName: String(c?.fullName ?? '').trim() }))
                    .filter((c) => c.fullName.length > 0),
            };

            const res = await authFetch(CREATE_CHAPTER_URL, {
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
                monograficChapterTitle: '',
                monograficTitle: '',
                monographPublisher: '',
                doi: '',
                isbn: '',
                publicationYear: '',
                coauthor: [],
            });
        } catch (e: any) {
            alert('Błąd createChapter:\n' + String(e?.message ?? e));
        } finally {
            setCreating(false);
        }
    }

    async function updateChapter() {
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

                monograficChapterTitle: draft.monograficChapterTitle ?? null,
                monograficTitle: draft.monograficTitle ?? null,
                monographPublisher: draft.monographPublisher ?? null,

                doi: (draft.doi ?? '').toString(),
                isbn: (draft.isbn ?? '').toString(),
                publicationYear:
                    draft.publicationYear != null && String(draft.publicationYear).trim() !== '' ? Number(draft.publicationYear) : null,

                coauthor: Array.isArray(draft.coauthor)
                    ? draft.coauthor
                        .map((c: any) => ({
                            userId: Number(c?.userId ?? 0) || 0,
                            fullName: String(c?.fullName ?? '').trim(),
                        }))
                        .filter((c: any) => c.fullName.length > 0)
                    : [],
            };

            const res = await authFetch(UPDATE_CHAPTER_URL, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                alert('Błąd updateChapter:\n' + msg);
                return;
            }

            const txt = await res.text().catch(() => '');
            const data = txt ? safeJson(txt) : null;

            const co = normalizeCoauthors(data);
            setDraft({
                ...data,
                typeId: toIntOr0(data?.typeId ?? data?.type?.id ?? 0),
                disciplineId: toIntOr0(data?.disciplineId ?? data?.discipline?.id ?? 0),
                coauthor: co.map((c) => ({ userId: Number(c.userId) || 0, fullName: String(c.fullName ?? '').trim(), unitName: c.unitName ?? null })),
            });

            await fetchList(pageMeta.page, pageMeta.size);
            alert('Zapisano.');
        } catch (e: any) {
            alert('Błąd updateChapter:\n' + String(e?.message ?? e));
        }
    }

    async function deleteChapter(id: number) {
        if (!confirm(`Usunąć rozdział ID=${id}?`)) return;

        try {
            const res = await authFetch(`${DELETE_CHAPTER_URL}?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            await fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20);
            setModalOpen(false);
            setDraft(null);
        } catch (e: any) {
            alert('Błąd deleteChapter: ' + String(e?.message ?? e));
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

    const typeOptions = useMemo(() => [{ id: 0, name: '— typ publikacji —' }, ...types], [types]);
    const disciplineOptions = useMemo(() => [{ id: 0, name: '— dyscyplina —' }, ...disciplines], [disciplines]);
    const cycleOptions = useMemo(() => [{ id: 0, label: '— cykl —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))], [cycles]);

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Rozdziały — moje publikacje</h1>
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
                        <div className={styles.empty}>Brak rozdziałów</div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {items.map((it) => {
                                const id = Number(it?.id ?? 0);
                                const co = normalizeCoauthors(it);
                                const preview = co.slice(0, 3);
                                const more = Math.max(0, co.length - preview.length);
                                const points = Number(it?.meinPoints ?? it?.points ?? 0) || 0;

                                return (
                                    <div key={id || Math.random()} className={styles.cardSmall}>
                                        <div className={styles.cardTop}>
                                            <div className={styles.avatarSmall}>{id ? `#${id}` : 'C'}</div>
                                            <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                    {safeStr(it?.monograficChapterTitle)}
                                                </div>

                                                <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                    {safeStr(it?.monograficTitle)}
                                                </div>

                                                <div className={styles.muted} style={{ marginTop: 6 }}>
                                                    {safeStr(it?.monographPublisher)}
                                                    {it?.publicationYear ? ` • Rok: ${it.publicationYear}` : ' • Rok: —'}
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
                                                <span className={`${styles.badge} ${styles.badgeWorker}`}>CHAPTER</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className={styles.infoBtn} onClick={() => id && openDetails(id)} disabled={!id}>
                                                    Szczegóły / Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => id && deleteChapter(id)} disabled={!id}>
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

                {/* RIGHT: FILTERS (SearchSelect) */}
                <div className={styles.rightColumn}>
                    <div className={styles.actionsCard} style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
                        <h3>Szukaj</h3>
                        <p>Filtry listy rozdziałów</p>

                        <div style={{ display: 'grid', gap: 10 }}>
                            <SearchSelect
                                label="Typ"
                                value={filters.typeId}
                                options={typeOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— typ publikacji —"
                                onChange={(id) => setFilters((p) => ({ ...p, typeId: id }))}
                            />

                            <SearchSelect
                                label="Dyscyplina"
                                value={filters.disciplineId}
                                options={disciplineOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— dyscyplina —"
                                onChange={(id) => setFilters((p) => ({ ...p, disciplineId: id }))}
                            />

                            <SearchSelect
                                label="Cykl"
                                value={filters.cycleId}
                                options={cycleOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— cykl —"
                                onChange={(id) => setFilters((p) => ({ ...p, cycleId: id }))}
                            />

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className={styles.primaryBtn} onClick={() => fetchList(0, pageMeta.size ?? 20)} disabled={loading} style={{ flex: '1 1 auto' }}>
                                    Szukaj
                                </button>
                                <button
                                    className={styles.ghostBtn}
                                    onClick={() => {
                                        setFilters({ typeId: 0, disciplineId: 0, cycleId: 0 });
                                        setTimeout(() => void fetchList(0, pageMeta.size ?? 20), 0);
                                    }}
                                    disabled={loading}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CREATE (BOTTOM) */}
            <div className={styles.bigCardFull} style={{ marginTop: 16 }}>
                <div className={styles.cardHeader}>
                    <div className={styles.bigAvatar}>+</div>
                    <div>
                        <h3 className={styles.cardTitle}>Dodaj rozdział</h3>
                        <div className={styles.muted}>createChapter</div>
                    </div>
                </div>

                <form onSubmit={createChapter} style={{display: 'grid', gap: 10, marginTop: 12}}>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10}}>
                        <SearchSelect
                            label="Typ"
                            value={createForm.typeId}
                            options={typeOptionsSS}
                            disabled={filtersLoading}
                            placeholder="— typ publikacji —"
                            onChange={(id) => setCreateForm((p) => ({...p, typeId: Number(id) || 0}))}
                        />

                        <SearchSelect
                            label="Dyscyplina"
                            value={createForm.disciplineId}
                            options={disciplineOptionsSS}
                            disabled={filtersLoading}
                            placeholder="— dyscyplina —"
                            onChange={(id) => setCreateForm((p) => ({...p, disciplineId: Number(id) || 0}))}
                        />
                    </div>


                    <input
                        className={styles.searchInput}
                        placeholder="tytuł rozdziału"
                        value={createForm.monograficChapterTitle}
                        onChange={(e) => setCreateForm((p) => ({...p, monograficChapterTitle: e.target.value}))}
                    />

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10}}>
                        <input
                            className={styles.searchInput}
                            placeholder="tytuł monografii"
                            value={createForm.monograficTitle}
                            onChange={(e) => setCreateForm((p) => ({...p, monograficTitle: e.target.value}))}
                        />
                        <input
                            className={styles.searchInput}
                            placeholder="Wydawca"
                            value={createForm.monographPublisher}
                            onChange={(e) => setCreateForm((p) => ({...p, monographPublisher: e.target.value}))}
                        />
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10}}>
                        <input className={styles.searchInput} placeholder="doi" value={createForm.doi}
                               onChange={(e) => setCreateForm((p) => ({...p, doi: e.target.value}))}/>
                        <input className={styles.searchInput} placeholder="isbn" value={createForm.isbn}
                               onChange={(e) => setCreateForm((p) => ({...p, isbn: e.target.value}))}/>
                        <input
                            className={styles.searchInput}
                            placeholder="rok publikacji"
                            value={createForm.publicationYear}
                            onChange={(e) => setCreateForm((p) => ({...p, publicationYear: e.target.value}))}
                        />
                    </div>

                    <CoauthorsPicker value={createForm.coauthor}
                                     onChange={(next) => setCreateForm((p) => ({...p, coauthor: next}))}
                                     label="Współautorzy"/>

                    <div style={{display: 'flex', gap: 10}}>
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
                                    monograficChapterTitle: '',
                                    monograficTitle: '',
                                    monographPublisher: '',
                                    doi: '',
                                    isbn: '',
                                    publicationYear: '',
                                    coauthor: [],
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
                title={draft?.id ? `Szczegóły rozdziału #${draft.id}` : 'Szczegóły rozdziału'}
                onClose={() => {
                    setModalOpen(false);
                    setDraft(null);
                    setModalError(null);
                }}
            >
                {modalLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : modalError ? (
                    <div className={styles.empty} style={{whiteSpace: 'pre-wrap'}}>
                        Błąd: {modalError}
                    </div>
                ) : !draft ? (
                    <div className={styles.empty}>Brak danych.</div>
                ) : (
                    <>
                        <div className={styles.kvGrid} style={{marginBottom: 12, overflow: 'visible'}}>
                            <div className={styles.kvKey}>Typ</div>
                            <div className={styles.kvVal} style={{overflow: 'visible'}}>
                                <SearchSelect
                                    label="" // jeśli Twój SearchSelect wymaga label, zostaw; jeśli pokazuje pustą linię, zamień na "Typ"
                                    value={toIntOr0(draft.typeId)}
                                    options={typeOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— typ publikacji —"
                                    onChange={(id) => setDraft((p: any) => ({...p, typeId: Number(id) || 0}))}
                                />
                            </div>

                            <div className={styles.kvKey}>Dyscyplina</div>
                            <div className={styles.kvVal} style={{overflow: 'visible'}}>
                                <SearchSelect
                                    label=""
                                    value={toIntOr0(draft.disciplineId)}
                                    options={disciplineOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— dyscyplina —"
                                    onChange={(id) => setDraft((p: any) => ({...p, disciplineId: Number(id) || 0}))}
                                />
                            </div>


                            <div className={styles.kvKey}>Tytuł rozdziału</div>
                            <div className={styles.kvVal}>
                                <input
                                    className={styles.searchInput}
                                    value={String(draft.monograficChapterTitle ?? '')}
                                    onChange={(e) => setDraft((p: any) => ({
                                        ...p,
                                        monograficChapterTitle: e.target.value
                                    }))}
                                />
                            </div>

                            <div className={styles.kvKey}>Tytuł monografii</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.monograficTitle ?? '')}
                                       onChange={(e) => setDraft((p: any) => ({
                                           ...p,
                                           monograficTitle: e.target.value
                                       }))}/>
                            </div>

                            <div className={styles.kvKey}>Wydawca</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.monographPublisher ?? '')}
                                       onChange={(e) => setDraft((p: any) => ({
                                           ...p,
                                           monographPublisher: e.target.value
                                       }))}/>
                            </div>

                            <div className={styles.kvKey}>Rok</div>
                            <div className={styles.kvVal}>
                                <input
                                    className={styles.searchInput}
                                    value={String(draft.publicationYear ?? '')}
                                    onChange={(e) => setDraft((p: any) => ({
                                        ...p,
                                        publicationYear: e.target.value ? Number(e.target.value) : null
                                    }))}
                                />
                            </div>

                            <div className={styles.kvKey}>DOI</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.doi ?? '')}
                                       onChange={(e) => setDraft((p: any) => ({...p, doi: e.target.value}))}/>
                            </div>

                            <div className={styles.kvKey}>ISBN</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.isbn ?? '')}
                                       onChange={(e) => setDraft((p: any) => ({...p, isbn: e.target.value}))}/>
                            </div>
                        </div>

                        <CoauthorsPicker value={Array.isArray(draft.coauthor) ? draft.coauthor : []}
                                         onChange={(next) => setDraft((p: any) => ({...p, coauthor: next}))}
                                         label="Współautorzy"/>

                        <div style={{marginTop: 12}}>
                            <div className={styles.muted} style={{fontWeight: 800, marginBottom: 8}}>
                                Podgląd współautorów
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                {normalizeCoauthors({coauthor: draft.coauthor}).map((c, idx) => (
                                    <span key={idx} className={`${styles.badge} ${styles.badgeMuted}`}
                                          title={coauthorLabel(c)}>
                    {coauthorLabel(c)}
                  </span>
                                ))}
                            </div>
                        </div>

                        <div style={{display: 'flex', gap: 10, marginTop: 12}}>
                            <button className={styles.primaryBtn} onClick={updateChapter}>
                                Zapisz
                            </button>
                            <button className={styles.dangerBtn} onClick={() => deleteChapter(Number(draft.id))}>
                                Usuń
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}

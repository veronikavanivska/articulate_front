// src/app/worker/articles/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { CoauthorsPicker, type CoauthorInput } from '@/components/CoauthorsPicker';
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';

// ===== WORKER (CRUD + LIST) =====
const LIST_MY_ARTICLES_URL = '/api/article/worker/listMyPublication';
const GET_ARTICLE_URL = '/api/article/worker/getPublication'; // GET ?publicationId=...
const CREATE_ARTICLE_URL = '/api/article/worker/createPublication';
const UPDATE_ARTICLE_URL = '/api/article/worker/updatePublication'; // PATCH
const DELETE_ARTICLE_URL = '/api/article/worker/deletePublication'; // DELETE ?publicationId=...

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

// ===================== TYPY =====================
type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };
type RefItem = { id: number; name: string };
type CycleItem = { id: number; yearFrom: number; yearTo: number; name: string; isActive?: boolean; active?: boolean };

type Coauthor = {
    position?: number;
    userId: number;
    fullName: string;
    unitName?: string | null;
};

type PublicationListItem = {
    id: number;
    title?: string | null;
    doi?: string | null;
    journalTitle?: string | null;
    publicationYear?: number | null;
    meinPoints?: number | null;
    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;
    coauthors?: Coauthor[] | null;
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
    const raw = x?.coauthors ?? x?.coauthor ?? [];
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

// ===================== UI: MODAL =====================
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
export default function WorkerArticlesPage() {
    const { initialized } = useAuth();

    // LIST
    const [items, setItems] = useState<PublicationListItem[]>([]);
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
        title: '',
        doi: '',
        issn: '',
        eissn: '',
        journalTitle: '',
        publicationYear: '',
        coauthors: [] as CoauthorInput[],
    });
    const [creating, setCreating] = useState(false);

    // MODAL
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [draft, setDraft] = useState<any | null>(null);

    // SearchSelect options (po załadowaniu słowników)
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
                authFetch(LIST_TYPES_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }),
                } as RequestInit),
                authFetch(LIST_DISCIPLINES_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }),
                } as RequestInit),
                authFetch(LIST_CYCLES_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
                } as RequestInit),
            ]);

            const [tTxt, dTxt, cTxt] = await Promise.all([
                tRes.text().catch(() => ''),
                dRes.text().catch(() => ''),
                cRes.text().catch(() => ''),
            ]);

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

            const res = await authFetch(LIST_MY_ARTICLES_URL, {
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
            const arr = (data?.publications ?? data?.items ?? data?.item ?? []) as PublicationListItem[];
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
            const res = await authFetch(`${GET_ARTICLE_URL}?publicationId=${encodeURIComponent(String(id))}`, { method: 'GET' });
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
                replaceCoauthors: co.map((c) => ({
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

    async function createPublication(e?: React.FormEvent) {
        e?.preventDefault();
        setCreating(true);
        try {
            const body = {
                typeId: createForm.typeId > 0 ? createForm.typeId : null,
                disciplineId: createForm.disciplineId > 0 ? createForm.disciplineId : null,
                title: createForm.title?.trim() || null,
                doi: String(createForm.doi ?? '').trim(), // "" zamiast null
                issn: String(createForm.issn ?? '').trim(),
                eissn: String(createForm.eissn ?? '').trim(),
                journalTitle: createForm.journalTitle?.trim() || null,
                publicationYear: createForm.publicationYear ? toIntOrNull(createForm.publicationYear) : null,
                coauthors: (Array.isArray(createForm.coauthors) ? createForm.coauthors : [])
                    .map((c: any) => ({ userId: Number(c?.userId ?? 0) || 0, fullName: String(c?.fullName ?? '').trim() }))
                    .filter((c) => c.fullName.length > 0),
            };

            const res = await authFetch(CREATE_ARTICLE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            await fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20);

            setCreateForm({
                typeId: 0,
                disciplineId: 0,
                title: '',
                doi: '',
                issn: '',
                eissn: '',
                journalTitle: '',
                publicationYear: '',
                coauthors: [],
            });
        } catch (e: any) {
            alert('Błąd createPublication: ' + String(e?.message ?? e));
        } finally {
            setCreating(false);
        }
    }

    async function updatePublication() {
        if (!draft?.id) return;

        const publicationId = Number(draft.id);
        if (!Number.isFinite(publicationId) || publicationId <= 0) {
            alert('Nieprawidłowe publicationId.');
            return;
        }

        try {
            const body = {
                id: draft.id ? Number(draft.id) : null,
                typeId: draft.typeId ? Number(draft.typeId) : null,
                disciplineId: draft.disciplineId ? Number(draft.disciplineId) : null,

                title: draft.title ?? null,
                doi: draft.doi ?? null,

                issn: draft.issn ?? null,
                eissn: draft.eissn ?? null,

                journalTitle: draft.journalTitle ?? null,
                publicationYear:
                    draft.publicationYear != null && String(draft.publicationYear).trim() !== ''
                        ? Number(draft.publicationYear)
                        : null,

                replaceCoauthors: Array.isArray(draft.replaceCoauthors)
                    ? draft.replaceCoauthors
                        .map((c: any) => ({
                            userId: Number(c?.userId ?? 0) || 0,
                            fullName: String(c?.fullName ?? '').trim(),
                        }))
                        .filter((c: any) => c.fullName.length > 0)
                    : [],
            };

            const res = await authFetch(`${UPDATE_ARTICLE_URL}?publicationId=${publicationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                alert('Błąd updatePublication:\n' + msg);
                return;
            }

            const txt = await res.text().catch(() => '');
            const data = txt ? safeJson(txt) : null;

            const coauthors = Array.isArray(data?.coauthors)
                ? data.coauthors.map((c: any) => ({
                    userId: Number(c.userId ?? c.id ?? 0) || 0,
                    fullName: String(c.fullName ?? c.name ?? '').trim(),
                }))
                : [];

            setDraft({ ...data, replaceCoauthors: coauthors });
            await fetchList(pageMeta.page, pageMeta.size);

            alert('Zapisano.');
        } catch (e: any) {
            alert('Błąd updatePublication:\n' + String(e?.message ?? e));
        }
    }

    async function deletePublication(id: number) {
        if (!confirm(`Usunąć artykuł ID=${id}?`)) return;

        try {
            const res = await authFetch(`${DELETE_ARTICLE_URL}?publicationId=${encodeURIComponent(String(id))}`, { method: 'DELETE' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            await fetchList(pageMeta.page ?? 0, pageMeta.size ?? 20);
            setModalOpen(false);
            setDraft(null);
        } catch (e: any) {
            alert('Błąd deletePublication: ' + String(e?.message ?? e));
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
                <h1 className={styles.title}>Artykuły — moje publikacje</h1>
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
                        <div className={styles.empty}>Brak publikacji</div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {items.map((it) => {
                                const id = Number(it?.id ?? 0);
                                const co = normalizeCoauthors(it);
                                const preview = co.slice(0, 3);
                                const more = Math.max(0, co.length - preview.length);

                                return (
                                    <div key={id || Math.random()} className={styles.cardSmall}>
                                        <div className={styles.cardTop}>
                                            <div className={styles.avatarSmall}>{id ? `#${id}` : 'A'}</div>
                                            <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                    {safeStr(it?.title)}
                                                </div>

                                                <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                    {safeStr(it?.journalTitle)}
                                                </div>

                                                <div className={styles.muted} style={{ marginTop: 6 }}>
                                                    {it?.publicationYear ? `Rok: ${it.publicationYear}` : 'Rok: —'}
                                                    {it?.doi ? ` • DOI: ${it.doi}` : ''}
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>{it?.type?.name ?? 'Typ: —'}</span>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>{it?.discipline?.name ?? 'Dyscyplina: —'}</span>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>Cykl: {cycleLabel(it?.cycle)}</span>
                                                    <span className={`${styles.badge} ${styles.badgeWorker}`}>{String(it?.meinPoints ?? 0)} pkt</span>
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
                                                <span className={`${styles.badge} ${styles.badgeWorker}`}>ARTICLE</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className={styles.infoBtn} onClick={() => id && openDetails(id)} disabled={!id}>
                                                    Szczegóły / Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => id && deletePublication(id)} disabled={!id}>
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
                    <div
                        className={styles.actionsCard}
                        style={{
                            position: 'sticky',
                            top: 16,
                            alignSelf: 'flex-start',
                            overflow: 'visible', // ważne dla dropdownu SearchSelect
                            width: '100%',
                            maxWidth: '100%',
                        }}
                    >
                        <h3>Szukaj</h3>
                        <p>Filtry listy artykułów</p>

                        <div style={{ display: 'grid', gap: 10 }}>
                            <SearchSelect
                                label="Typ"
                                value={filters.typeId}
                                options={typeOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— typ publikacji —"
                                onChange={(id) => setFilters((p) => ({ ...p, typeId: Number(id) || 0 }))}
                            />

                            <SearchSelect
                                label="Dyscyplina"
                                value={filters.disciplineId}
                                options={disciplineOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— dyscyplina —"
                                onChange={(id) => setFilters((p) => ({ ...p, disciplineId: Number(id) || 0 }))}
                            />

                            <SearchSelect
                                label="Cykl"
                                value={filters.cycleId}
                                options={cycleOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— cykl —"
                                onChange={(id) => setFilters((p) => ({ ...p, cycleId: Number(id) || 0 }))}
                            />

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    className={styles.primaryBtn}
                                    onClick={() => fetchList(0, pageMeta.size ?? 20)}
                                    disabled={loading}
                                    style={{ flex: '1 1 auto' }}
                                >
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
            <div className={styles.bigCardFull} style={{ marginTop: 16, overflow: 'visible' }}>
                <div className={styles.cardHeader}>
                    <div className={styles.bigAvatar}>+</div>
                    <div>
                        <h3 className={styles.cardTitle}>Dodaj artykuł</h3>
                        <div className={styles.muted}>createPublication</div>
                    </div>
                </div>

                <form onSubmit={createPublication} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
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
                            label="Dyscyplina"
                            value={createForm.disciplineId}
                            options={disciplineOptionsSS}
                            disabled={filtersLoading}
                            placeholder="— dyscyplina —"
                            onChange={(id) => setCreateForm((p) => ({ ...p, disciplineId: Number(id) || 0 }))}
                        />
                    </div>

                    <input
                        className={styles.searchInput}
                        placeholder="tytuł"
                        value={createForm.title}
                        onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <input
                            className={styles.searchInput}
                            placeholder="doi"
                            value={createForm.doi}
                            onChange={(e) => setCreateForm((p) => ({ ...p, doi: e.target.value }))}
                        />
                        <input
                            className={styles.searchInput}
                            placeholder="tytuł czasopisma"
                            value={createForm.journalTitle}
                            onChange={(e) => setCreateForm((p) => ({ ...p, journalTitle: e.target.value }))}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        <input
                            className={styles.searchInput}
                            placeholder="issn"
                            value={createForm.issn}
                            onChange={(e) => setCreateForm((p) => ({ ...p, issn: e.target.value }))}
                        />
                        <input
                            className={styles.searchInput}
                            placeholder="eissn"
                            value={createForm.eissn}
                            onChange={(e) => setCreateForm((p) => ({ ...p, eissn: e.target.value }))}
                        />
                        <input
                            className={styles.searchInput}
                            placeholder="rok publikacji"
                            value={createForm.publicationYear}
                            onChange={(e) => setCreateForm((p) => ({ ...p, publicationYear: e.target.value }))}
                        />
                    </div>

                    <CoauthorsPicker
                        value={createForm.coauthors}
                        onChange={(next) => setCreateForm((p) => ({ ...p, coauthors: next }))}
                        label="Współautorzy (szukaj po imieniu)"
                    />

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
                                    issn: '',
                                    eissn: '',
                                    journalTitle: '',
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
                title={draft?.id ? `Szczegóły artykułu #${draft.id}` : 'Szczegóły artykułu'}
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
                        <div className={styles.kvGrid} style={{ marginBottom: 12, overflow: 'visible' }}>
                            <div className={styles.kvKey}>Typ</div>
                            <div className={styles.kvVal} style={{ overflow: 'visible' }}>
                                <SearchSelect
                                    label="" // jeśli Twój SearchSelect wymaga label, zostaw; jeśli pokazuje pustą linię, zamień na "Typ"
                                    value={toIntOr0(draft.typeId)}
                                    options={typeOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— typ publikacji —"
                                    onChange={(id) => setDraft((p: any) => ({ ...p, typeId: Number(id) || 0 }))}
                                />
                            </div>

                            <div className={styles.kvKey}>Dyscyplina</div>
                            <div className={styles.kvVal} style={{ overflow: 'visible' }}>
                                <SearchSelect
                                    label=""
                                    value={toIntOr0(draft.disciplineId)}
                                    options={disciplineOptionsSS}
                                    disabled={filtersLoading}
                                    placeholder="— dyscyplina —"
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
                                    onChange={(e) =>
                                        setDraft((p: any) => ({
                                            ...p,
                                            publicationYear: e.target.value ? Number(e.target.value) : null,
                                        }))
                                    }
                                />
                            </div>

                            <div className={styles.kvKey}>DOI</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.doi ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, doi: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>ISSN</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.issn ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, issn: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>EISSN</div>
                            <div className={styles.kvVal}>
                                <input className={styles.searchInput} value={String(draft.eissn ?? '')} onChange={(e) => setDraft((p: any) => ({ ...p, eissn: e.target.value }))} />
                            </div>

                            <div className={styles.kvKey}>Czasopismo</div>
                            <div className={styles.kvVal}>
                                <input
                                    className={styles.searchInput}
                                    value={String(draft.journalTitle ?? '')}
                                    onChange={(e) => setDraft((p: any) => ({ ...p, journalTitle: e.target.value }))}
                                />
                            </div>
                        </div>

                        <CoauthorsPicker
                            value={Array.isArray(draft.replaceCoauthors) ? draft.replaceCoauthors : []}
                            onChange={(next) => setDraft((p: any) => ({ ...p, replaceCoauthors: next }))}
                            label="Współautorzy"
                        />

                        <div style={{ marginTop: 12 }}>
                            <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 8 }}>
                                Podgląd współautorów
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {normalizeCoauthors({ coauthors: draft.replaceCoauthors }).map((c, idx) => (
                                    <span key={idx} className={`${styles.badge} ${styles.badgeMuted}`} title={coauthorLabel(c)}>
                    {coauthorLabel(c)}
                  </span>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <button className={styles.primaryBtn} onClick={updatePublication}>
                                Zapisz
                            </button>
                            <button className={styles.dangerBtn} onClick={() => deletePublication(Number(draft.id))}>
                                Usuń
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../profiles/styles.module.css';

// ===================== ENDPOINTY (POST + JSON body) =====================
const LIST_ARTICLES_URL = '/api/article/admin/listPublication';
const LIST_MONOGRAPHS_URL = '/api/monograph/admin/listMonographs';
const LIST_CHAPTERS_URL = '/api/monograph/admin/listChapters';

const GET_ARTICLE_URL = '/api/article/admin/getPublication';
const GET_MONOGRAPH_URL = '/api/monograph/admin/getMonographs';
const GET_CHAPTER_URL = '/api/monograph/admin/getChapters';

// Filtry (słowniki)
const LIST_DISCIPLINES_URL = '/api/article/admin/listDisciplines';
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

// ===================== TYPY =====================
type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };
type RefItem = { id: number; name: string };

type CycleItem = {
    id: number;
    yearFrom: number;
    yearTo: number;
    name: string;
    isActive?: boolean;
    active?: boolean;
};

type Coauthor = {
    position: number;
    fullName: string;
    userId: number;
};

type PublicationViewResponse = {
    id: number;
    ownerId: number;

    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;

    title?: string | null;
    doi?: string | null;
    issn?: string | null;
    eissn?: string | null;
    journalTitle?: string | null;
    publicationYear?: number | null;

    meinPoints?: number | null;

    coauthors?: Coauthor[] | null;
};

type MonographViewResponse = {
    id: number;
    authorId: number;

    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;

    title?: string | null;
    doi?: string | null;
    isbn?: string | null;
    points?: number | null;

    monograficTitle?: string | null;
    meinMonoPublisherId?: number | null;
    meinMonoId?: number | null;

    publicationYear?: number | null;

    coauthors?: Coauthor[] | null;
};

type ChapterViewResponse = {
    id: number;
    authorId: number;

    type?: RefItem | null;
    discipline?: RefItem | null;
    cycle?: CycleItem | null;

    monograficChapterTitle?: string | null;
    monograficTitle?: string | null;
    monographPublisher?: string | null;

    doi?: string | null;
    isbn?: string | null;
    points?: number | null;

    meinMonoPublisherId?: number | null;
    meinMonoId?: number | null;

    publicationYear?: number | null;

    // backend bywa różny: czasem "coauthor", czasem "coauthors"
    coauthor?: Coauthor[] | null;
    coauthors?: Coauthor[] | null;
};

// ===================== UI HELPERS =====================
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

function toIntOr0(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
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
    const arr = Array.isArray(raw) ? (raw as Coauthor[]) : [];
    return arr
        .filter((c) => c && typeof c.fullName === 'string' && String(c.fullName).trim().length > 0)
        .slice()
        .sort((a, b) => Number(a.position) - Number(b.position));
}

function pickOwnerName(ownerId: number | null | undefined, coauthors: Coauthor[] | null | undefined): string {
    const list = Array.isArray(coauthors) ? coauthors : [];
    if (list.length === 0) return '—';

    const oid = Number(ownerId ?? 0);
    if (oid > 0) {
        const exact = list.find((c) => Number(c.userId) === oid);
        if (exact?.fullName) return exact.fullName;
    }

    const firstPos = list.find((c) => Number(c.position) === 1);
    if (firstPos?.fullName) return firstPos.fullName;

    return safeStr(list[0]?.fullName);
}

function formatPoints(v: any): string {
    if (v == null) return '0';
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    const isInt = Math.abs(n - Math.round(n)) < 1e-9;
    return isInt ? String(Math.round(n)) : String(n);
}

function Chip(props: { text: string; kind?: 'muted' | 'worker' | 'danger' }) {
    const kind = props.kind ?? 'muted';
    const cls = kind === 'worker' ? styles.badgeWorker : kind === 'danger' ? styles.badgeAdmin : styles.badgeMuted;
    return <span className={`${styles.badge} ${cls}`}>{props.text}</span>;
}

function FieldRow(props: { label: string; value: React.ReactNode }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                gap: 14,
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div className={styles.muted} style={{ fontWeight: 800 }}>
                {props.label}
            </div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{props.value}</div>
        </div>
    );
}

function norm(v: any) {
    return String(v ?? '').toLowerCase().trim();
}

// ===================== SEARCHABLE DROPDOWN (żeby lista NIE wychodziła za ramkę) =====================
type Option = { id: number; label: string };
function SearchSelect(props: {
    label: string;
    value: number;
    options: Option[];
    disabled?: boolean;
    placeholder?: string;
    onChange: (id: number) => void;
}) {
    const { label, value, options, disabled, placeholder, onChange } = props;

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');

    const selectedLabel = useMemo(() => {
        const found = options.find((o) => o.id === value);
        return found?.label ?? (value === 0 ? placeholder ?? '— dowolna —' : '—');
    }, [options, value, placeholder]);

    const filtered = useMemo(() => {
        const nq = norm(q);
        if (!nq) return options;
        return options.filter((o) => norm(o.label).includes(nq));
    }, [options, q]);

    useEffect(() => {
        function onDocDown(e: MouseEvent) {
            const el = wrapRef.current;
            if (!el) return;
            if (!el.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    return (
        <div ref={wrapRef} style={{ display: 'grid', gap: 6, position: 'relative' }}>
      <span className={styles.muted} style={{ fontWeight: 800 }}>
        {label}
      </span>

            <button
                type="button"
                className={styles.searchInput}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>
                <span className={styles.muted} style={{ fontWeight: 900 }}>
          ▾
        </span>
            </button>

            {open && !disabled && (
                <div
                    style={{
                        position: 'absolute',
                        top: 62,
                        left: 0,
                        right: 0,
                        zIndex: 30,
                        background: '#fff',
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        boxShadow: '0 12px 36px rgba(15,23,42,0.12)',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                        <input
                            className={styles.searchInput}
                            placeholder="Szukaj…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {filtered.length === 0 ? (
                            <div className={styles.muted} style={{ padding: 12 }}>
                                Brak wyników.
                            </div>
                        ) : (
                            filtered.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(o.id);
                                        setOpen(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        textAlign: 'left',
                                        background: o.id === value ? 'rgba(99,102,241,0.08)' : '#fff',
                                        border: 'none',
                                        borderBottom: '1px solid rgba(15,23,42,0.06)',
                                        cursor: 'pointer',
                                        fontWeight: o.id === value ? 900 : 700,
                                        color: '#0f172a',
                                    }}
                                >
                                    {o.label}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ===================== PAGE =====================
export default function AdminPublicationsPage() {
    const { initialized } = useAuth();

    const [tab, setTab] = useState<'articles' | 'monographs' | 'chapters'>('articles');

    // Filtry
    const [disciplineId, setDisciplineId] = useState<number>(0);
    const [cycleId, setCycleId] = useState<number>(0);

    const [pageMeta, setPageMeta] = useState<PageMeta>({ page: 0, size: 20, totalPages: 0, totalItems: 0 });

    // Słowniki
    const [disciplines, setDisciplines] = useState<RefItem[]>([]);
    const [cycles, setCycles] = useState<CycleItem[]>([]);
    const [filtersLoading, setFiltersLoading] = useState(false);

    // Dane list
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemsError, setItemsError] = useState<string | null>(null);

    const [articles, setArticles] = useState<PublicationViewResponse[]>([]);
    const [monographs, setMonographs] = useState<MonographViewResponse[]>([]);
    const [chapters, setChapters] = useState<ChapterViewResponse[]>([]);

    // Szukajka UI (BEZ backendu) — osobno per zakładka
    const [qArticles, setQArticles] = useState('');
    const [qMonographs, setQMonographs] = useState('');
    const [qChapters, setQChapters] = useState('');

    const activeQuery = tab === 'articles' ? qArticles : tab === 'monographs' ? qMonographs : qChapters;
    const setActiveQuery = (v: string) => {
        if (tab === 'articles') setQArticles(v);
        else if (tab === 'monographs') setQMonographs(v);
        else setQChapters(v);
    };

    // Modal szczegółów
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [detailsData, setDetailsData] = useState<any>(null);
    const [detailsKind, setDetailsKind] = useState<'article' | 'monograph' | 'chapter'>('article');

    // request body: bez sortBy (sortDir zostawiam jeśli backend tego oczekuje)
    const requestBase = useMemo(
        () => ({
            disciplineId: toIntOr0(disciplineId),
            cycleId: toIntOr0(cycleId),
            page: pageMeta.page ?? 0,
            size: pageMeta.size ?? 20,
            sortDir: 'DESC',
        }),
        [disciplineId, cycleId, pageMeta.page, pageMeta.size]
    );

    // INIT
    useEffect(() => {
        if (!initialized) return;
        void loadFilters();
        void loadList(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // zmiana zakładki
    useEffect(() => {
        if (!initialized) return;
        setItemsError(null);
        setPageMeta((p) => ({ ...p, page: 0 }));
        void loadList(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    async function loadFilters() {
        setFiltersLoading(true);
        try {
            const dRes = await authFetch(LIST_DISCIPLINES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }),
            } as RequestInit);

            const dTxt = await dRes.text().catch(() => '');
            if (dRes.ok) {
                const dData = dTxt ? JSON.parse(dTxt) : null;
                setDisciplines((dData?.item ?? dData?.items ?? []) as RefItem[]);
            } else {
                setDisciplines([]);
            }

            const cRes = await authFetch(LIST_CYCLES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
            } as RequestInit);

            const cTxt = await cRes.text().catch(() => '');
            if (cRes.ok) {
                const cData = cTxt ? JSON.parse(cTxt) : null;
                setCycles((cData?.item ?? cData?.items ?? []) as CycleItem[]);
            } else {
                setCycles([]);
            }
        } finally {
            setFiltersLoading(false);
        }
    }

    async function loadList(page: number) {
        setItemsLoading(true);
        setItemsError(null);

        try {
            const body = { ...requestBase, page };

            if (tab === 'articles') {
                const res = await authFetch(LIST_ARTICLES_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

                const data = txt ? JSON.parse(txt) : null;
                setArticles((data?.publications ?? data?.items ?? data?.item ?? []) as PublicationViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: requestBase.size });
                setMonographs([]);
                setChapters([]);
            }

            if (tab === 'monographs') {
                const res = await authFetch(LIST_MONOGRAPHS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

                const data = txt ? JSON.parse(txt) : null;
                setMonographs((data?.monograph ?? data?.monographs ?? data?.items ?? data?.item ?? []) as MonographViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: requestBase.size });
                setArticles([]);
                setChapters([]);
            }

            if (tab === 'chapters') {
                const res = await authFetch(LIST_CHAPTERS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

                const data = txt ? JSON.parse(txt) : null;
                setChapters((data?.chapters ?? data?.items ?? data?.item ?? []) as ChapterViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: requestBase.size });
                setArticles([]);
                setMonographs([]);
            }
        } catch (e: any) {
            setArticles([]);
            setMonographs([]);
            setChapters([]);
            setItemsError(String(e?.message ?? e));
        } finally {
            setItemsLoading(false);
        }
    }

    function refresh() {
        void loadList(pageMeta.page ?? 0);
    }

    function prevPage() {
        const p = Math.max(0, (pageMeta.page ?? 0) - 1);
        void loadList(p);
    }

    function nextPage() {
        const p = (pageMeta.page ?? 0) + 1;
        void loadList(p);
    }

    function resetFiltersOnly() {
        setDisciplineId(0);
        setCycleId(0);
        setPageMeta((p) => ({ ...p, page: 0 }));
    }

    function applyFiltersServer() {
        setPageMeta((p) => ({ ...p, page: 0 }));
        void loadList(0);
    }

    async function openDetails(kind: 'article' | 'monograph' | 'chapter', id: number, ownerId?: number) {
        setDetailsKind(kind);
        setDetailsOpen(true);
        setDetailsLoading(true);
        setDetailsError(null);
        setDetailsData(null);

        try {
            const url = kind === 'article' ? GET_ARTICLE_URL : kind === 'monograph' ? GET_MONOGRAPH_URL : GET_CHAPTER_URL;

            const res = await authFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ownerId: ownerId ?? 0 }),
            } as RequestInit);

            const txt = await res.text().catch(() => '');
            if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

            const data = txt ? JSON.parse(txt) : null;
            setDetailsData(data);
        } catch (e: any) {
            setDetailsError(String(e?.message ?? e));
        } finally {
            setDetailsLoading(false);
        }
    }

    // ====== SZUKAJKA UI — TYLKO PO NAZWIE/TYTULE ======
    const filteredArticles = useMemo(() => {
        const q = norm(qArticles);
        if (!q) return articles;
        return articles.filter((a) => norm(a?.title).includes(q));
    }, [articles, qArticles]);

    const filteredMonographs = useMemo(() => {
        const q = norm(qMonographs);
        if (!q) return monographs;
        return monographs.filter((m) => norm(m?.title).includes(q));
    }, [monographs, qMonographs]);

    const filteredChapters = useMemo(() => {
        const q = norm(qChapters);
        if (!q) return chapters;
        return chapters.filter((c) => norm(c?.monograficChapterTitle ?? c?.monograficTitle).includes(q));
    }, [chapters, qChapters]);

    const visibleCount = useMemo(() => {
        if (tab === 'articles') return filteredArticles.length;
        if (tab === 'monographs') return filteredMonographs.length;
        return filteredChapters.length;
    }, [tab, filteredArticles.length, filteredMonographs.length, filteredChapters.length]);

    const detailsCoauthors: Coauthor[] = useMemo(() => normalizeCoauthors(detailsData), [detailsData]);
    const detailsOwnerName = useMemo(() => {
        if (!detailsData) return '—';
        const ownerId = Number(detailsData?.ownerId ?? detailsData?.authorId ?? 0);
        return pickOwnerName(ownerId, detailsCoauthors);
    }, [detailsData, detailsCoauthors]);

    const disciplineOptions: Option[] = useMemo(() => {
        return [{ id: 0, label: '— dowolna —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))];
    }, [disciplines]);

    const cycleOptions: Option[] = useMemo(() => {
        return [{ id: 0, label: '— dowolny —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))];
    }, [cycles]);

    const searchPlaceholder =
        tab === 'articles'
            ? 'Szukaj po tytule artykułu (aktualna strona)…'
            : tab === 'monographs'
                ? 'Szukaj po tytule monografii (aktualna strona)…'
                : 'Szukaj po tytule rozdziału (aktualna strona)…';

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — Przeglądaj publikacje</h1>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={tab === 'articles' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('articles')}>
                        Artykuły
                    </button>
                    <button className={tab === 'monographs' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('monographs')}>
                        Monografie
                    </button>
                    <button className={tab === 'chapters' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('chapters')}>
                        Rozdziały
                    </button>

                    <button className={styles.ghostBtn} onClick={refresh} disabled={itemsLoading}>
                        Odśwież
                    </button>
                </div>
            </header>

            <div className={styles.contentRow}>
                {/* LEFT: LIST */}
                <div className={styles.leftColumn}>
                    {itemsLoading ? (
                        <div className={styles.loading}>Ładowanie…</div>
                    ) : itemsError ? (
                        <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                            Błąd: {itemsError}
                        </div>
                    ) : visibleCount === 0 ? (
                        <div className={styles.empty}>{activeQuery.trim() ? `Brak wyników dla: "${activeQuery.trim()}".` : 'Brak danych'}</div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {/* ====== ARTYKUŁY ====== */}
                            {tab === 'articles' &&
                                filteredArticles.map((a) => {
                                    const co = normalizeCoauthors(a);
                                    const authorName = pickOwnerName(a.ownerId, co);
                                    const preview = co.filter((x) => x.fullName).slice(0, 3);
                                    const more = Math.max(0, co.length - preview.length);

                                    return (
                                        <div key={a.id} className={styles.cardSmall}>
                                            <div className={styles.cardTop}>
                                                <div className={styles.avatarSmall}>A</div>
                                                <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                    <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                        {safeStr(a.title)}
                                                    </div>

                                                    <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                        {safeStr(a.journalTitle)}
                                                    </div>

                                                    <div className={styles.muted} style={{ marginTop: 6 }}>
                                                        Autor: <b style={{ color: '#0f172a' }}>{authorName}</b>
                                                    </div>

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                        <Chip text={`Rok: ${a.publicationYear ?? '—'}`} kind="muted" />
                                                        <Chip text={`${formatPoints(a.meinPoints)} pkt`} kind="worker" />
                                                        <Chip text={a.discipline?.name ?? 'Dyscyplina: —'} kind="muted" />
                                                        <Chip text={`Cykl: ${cycleLabel(a.cycle)}`} kind="muted" />
                                                    </div>

                                                    {(preview.length > 0 || more > 0) && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                                            {preview.map((p, idx) => (
                                                                <Chip key={`${a.id}-c-${idx}`} text={p.fullName} kind="muted" />
                                                            ))}
                                                            {more > 0 && <Chip text={`+${more}`} kind="muted" />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('article', a.id, a.ownerId)}>
                                                    Szczegóły
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                            {/* ====== MONOGRAFIE ====== */}
                            {tab === 'monographs' &&
                                filteredMonographs.map((m) => {
                                    const co = normalizeCoauthors(m);
                                    const authorName = pickOwnerName(m.authorId, co);
                                    const preview = co.filter((x) => x.fullName).slice(0, 3);
                                    const more = Math.max(0, co.length - preview.length);

                                    return (
                                        <div key={m.id} className={styles.cardSmall}>
                                            <div className={styles.cardTop}>
                                                <div className={styles.avatarSmall}>M</div>
                                                <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                    <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                        {safeStr(m.title)}
                                                    </div>

                                                    <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                        {safeStr(m.monograficTitle)}
                                                    </div>

                                                    <div className={styles.muted} style={{ marginTop: 6 }}>
                                                        Autor: <b style={{ color: '#0f172a' }}>{authorName}</b>
                                                    </div>

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                        <Chip text={`Rok: ${m.publicationYear ?? '—'}`} kind="muted" />
                                                        <Chip text={`${formatPoints(m.points)} pkt`} kind="worker" />
                                                        <Chip text={m.discipline?.name ?? 'Dyscyplina: —'} kind="muted" />
                                                        <Chip text={`Cykl: ${cycleLabel(m.cycle)}`} kind="muted" />
                                                    </div>

                                                    {(preview.length > 0 || more > 0) && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                                            {preview.map((p, idx) => (
                                                                <Chip key={`${m.id}-c-${idx}`} text={p.fullName} kind="muted" />
                                                            ))}
                                                            {more > 0 && <Chip text={`+${more}`} kind="muted" />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('monograph', m.id, m.authorId)}>
                                                    Szczegóły
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                            {/* ====== ROZDZIAŁY ====== */}
                            {tab === 'chapters' &&
                                filteredChapters.map((c) => {
                                    const co = normalizeCoauthors(c);
                                    const authorName = pickOwnerName(c.authorId, co);
                                    const preview = co.filter((x) => x.fullName).slice(0, 3);
                                    const more = Math.max(0, co.length - preview.length);

                                    return (
                                        <div key={c.id} className={styles.cardSmall}>
                                            <div className={styles.cardTop}>
                                                <div className={styles.avatarSmall}>R</div>
                                                <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                    <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                        {safeStr(c.monograficChapterTitle ?? c.monograficTitle)}
                                                    </div>

                                                    <div className={styles.muted} style={{ fontWeight: 900, marginTop: 2 }}>
                                                        {safeStr(c.monographPublisher)}
                                                    </div>

                                                    <div className={styles.muted} style={{ marginTop: 6 }}>
                                                        Autor: <b style={{ color: '#0f172a' }}>{authorName}</b>
                                                    </div>

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                        <Chip text={`Rok: ${c.publicationYear ?? '—'}`} kind="muted" />
                                                        <Chip text={`${formatPoints(c.points)} pkt`} kind="worker" />
                                                        <Chip text={c.discipline?.name ?? 'Dyscyplina: —'} kind="muted" />
                                                        <Chip text={`Cykl: ${cycleLabel(c.cycle)}`} kind="muted" />
                                                    </div>

                                                    {(preview.length > 0 || more > 0) && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                                            {preview.map((p, idx) => (
                                                                <Chip key={`${c.id}-c-${idx}`} text={p.fullName} kind="muted" />
                                                            ))}
                                                            {more > 0 && <Chip text={`+${more}`} kind="muted" />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('chapter', c.id, c.authorId)}>
                                                    Szczegóły
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    <div className={styles.pagerWrap}>
                        <button className={styles.pageBtn} disabled={itemsLoading || (pageMeta.page ?? 0) <= 0} onClick={prevPage}>
                            ← Poprzednia
                        </button>
                        <button className={styles.pageBtn} disabled={itemsLoading} onClick={nextPage}>
                            Następna →
                        </button>
                        <div className={styles.pageInfo}>
                            strona: {pageMeta.page ?? 0} • size: {pageMeta.size ?? 20}
                            {pageMeta.totalPages != null ? ` • totalPages: ${pageMeta.totalPages}` : ''}
                            {pageMeta.totalItems != null ? ` • totalItems: ${pageMeta.totalItems}` : ''}
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
                            boxShadow: '0 12px 36px rgba(15,23,42,0.08)',
                            width: '100%',
                            maxWidth: '100%',
                            overflow: 'visible',
                        }}
                    >
                        <h3 style={{ marginBottom: 10 }}>Filtry</h3>

                        <div style={{ display: 'grid', gap: 12 }}>
                            {/* SZUKAJKA UI (bez backendu) — NAPRAWIONY LAYOUT */}
                {/*            <div style={{ display: 'grid', gap: 6 }}>*/}
                {/*<span className={styles.muted} style={{ fontWeight: 800 }}>*/}
                {/*  Szukaj po tytule (tylko aktualna strona)*/}
                {/*</span>*/}

                {/*                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>*/}
                {/*                    <input*/}
                {/*                        className={styles.searchInput}*/}
                {/*                        type="search"*/}
                {/*                        placeholder={searchPlaceholder}*/}
                {/*                        value={activeQuery}*/}
                {/*                        onChange={(e) => setActiveQuery(e.target.value)}*/}
                {/*                        style={{ flex: '1 1 260px', minWidth: 0, width: 'auto' }}*/}
                {/*                    />*/}
                {/*                    <button*/}
                {/*                        className={styles.ghostBtn}*/}
                {/*                        onClick={() => setActiveQuery('')}*/}
                {/*                        disabled={!activeQuery.trim()}*/}
                {/*                        style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}*/}
                {/*                    >*/}
                {/*                        Wyczyść*/}
                {/*                    </button>*/}
                {/*                </div>*/}

                {/*                <div className={styles.muted} style={{ fontSize: 12 }}>*/}
                {/*                    To wyszukiwanie nie wysyła requestów do backendu — filtruje tylko pobraną stronę.*/}
                {/*                </div>*/}
                {/*            </div>*/}

                            {/* DYSYCPLINA */}
                            <SearchSelect
                                label="Dyscyplina"
                                value={disciplineId}
                                options={disciplineOptions}
                                disabled={filtersLoading}
                                placeholder="— dowolna —"
                                onChange={(id) => setDisciplineId(Number(id) || 0)}
                            />

                            {/* CYKL */}
                            <SearchSelect
                                label="Cykl"
                                value={cycleId}
                                options={cycleOptions}
                                disabled={filtersLoading}
                                placeholder="— dowolny —"
                                onChange={(id) => setCycleId(Number(id) || 0)}
                            />

                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button className={styles.primaryBtn} onClick={applyFiltersServer} disabled={itemsLoading} style={{ flex: '1 1 200px' }}>
                                    Zastosuj filtry
                                </button>
                                <button
                                    className={styles.ghostBtn}
                                    onClick={() => {
                                        resetFiltersOnly();
                                        setTimeout(() => void loadList(0), 0);
                                    }}
                                    disabled={itemsLoading}
                                    style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
                                >
                                    Reset
                                </button>
                            </div>

                            <div className={styles.muted} style={{ fontSize: 12 }}>
                                Sortowanie w backendzie: domyślnie DESC. (sortBy nie jest używany w UI i nie jest wysyłany.)
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAILS MODAL */}
            <Modal
                open={detailsOpen}
                title={detailsKind === 'article' ? 'Szczegóły — artykuł' : detailsKind === 'monograph' ? 'Szczegóły — monografia' : 'Szczegóły — rozdział'}
                onClose={() => {
                    setDetailsOpen(false);
                    setDetailsData(null);
                    setDetailsError(null);
                }}
            >
                {detailsLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : detailsError ? (
                    <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                        Błąd: {detailsError}
                    </div>
                ) : !detailsData ? (
                    <div className={styles.empty}>Brak danych.</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                            <Chip text={detailsKind === 'article' ? 'Artykuł' : detailsKind === 'monograph' ? 'Monografia' : 'Rozdział'} kind="muted" />
                            <Chip text={`Autor: ${detailsOwnerName}`} kind="worker" />
                            <Chip text={`Dyscyplina: ${detailsData?.discipline?.name ?? '—'}`} kind="muted" />
                            <Chip text={`Cykl: ${cycleLabel(detailsData?.cycle)}`} kind="muted" />
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '6px 14px', background: '#fff' }}>
                            <FieldRow label="Typ" value={detailsData?.type?.name ?? '—'} />

                            {detailsKind === 'article' && (
                                <>
                                    <FieldRow label="Tytuł" value={safeStr(detailsData?.title)} />
                                    <FieldRow label="Czasopismo" value={safeStr(detailsData?.journalTitle)} />
                                    <FieldRow label="Rok publikacji" value={detailsData?.publicationYear ?? '—'} />
                                    <FieldRow label="DOI" value={safeStr(detailsData?.doi)} />
                                    <FieldRow label="ISSN" value={safeStr(detailsData?.issn)} />
                                    <FieldRow label="EISSN" value={safeStr(detailsData?.eissn)} />
                                    <FieldRow label="Punkty (MEiN)" value={formatPoints(detailsData?.meinPoints)} />
                                </>
                            )}

                            {detailsKind === 'monograph' && (
                                <>
                                    <FieldRow label="Tytuł" value={safeStr(detailsData?.title)} />
                                    <FieldRow label="Tytuł monografii" value={safeStr(detailsData?.monograficTitle)} />
                                    <FieldRow label="Rok publikacji" value={detailsData?.publicationYear ?? '—'} />
                                    <FieldRow label="DOI" value={safeStr(detailsData?.doi)} />
                                    <FieldRow label="ISBN" value={safeStr(detailsData?.isbn)} />
                                    <FieldRow label="Punkty" value={formatPoints(detailsData?.points)} />
                                </>
                            )}

                            {detailsKind === 'chapter' && (
                                <>
                                    <FieldRow label="Tytuł rozdziału" value={safeStr(detailsData?.monograficChapterTitle)} />
                                    <FieldRow label="Tytuł monografii" value={safeStr(detailsData?.monograficTitle)} />
                                    <FieldRow label="Wydawca" value={safeStr(detailsData?.monographPublisher)} />
                                    <FieldRow label="Rok publikacji" value={detailsData?.publicationYear ?? '—'} />
                                    <FieldRow label="DOI" value={safeStr(detailsData?.doi)} />
                                    <FieldRow label="ISBN" value={safeStr(detailsData?.isbn)} />
                                    <FieldRow label="Punkty" value={formatPoints(detailsData?.points)} />
                                </>
                            )}
                        </div>

                        <h4 style={{ margin: '14px 0 10px 0' }}>Współautorzy</h4>
                        {detailsCoauthors.length === 0 ? (
                            <div className={styles.muted}>Brak współautorów.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                                {detailsCoauthors.slice(0, 120).map((c, idx) => (
                                    <div
                                        key={`${idx}-${c.userId}-${c.position}`}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            padding: '10px 12px',
                                            border: '1px solid var(--border)',
                                            borderRadius: 12,
                                            background: 'linear-gradient(180deg,#fff,#fcfdff)',
                                        }}
                                    >
                                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{safeStr(c.fullName)}</div>
                                        <span className={`${styles.badge} ${styles.badgeMuted}`}>pozycja: {c.position}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
}

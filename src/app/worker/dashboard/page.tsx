'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../../admin/profiles/styles.module.css';

// ===================== ENDPOINTY (UI wysyła POST dla list) =====================
// Worker - artykuły
const LIST_MY_ARTICLES_URL = '/api/article/worker/listMyPublication';
const GET_MY_ARTICLE_URL = (publicationId: number) => `/api/article/worker/getPublication?publicationId=${publicationId}`;
const CREATE_ARTICLE_URL = '/api/article/worker/createPublication';
const UPDATE_ARTICLE_URL = '/api/article/worker/updatePublication';
const DELETE_ARTICLE_URL = (publicationId: number) => `/api/article/worker/deletePublication?publicationId=${publicationId}`;

// Worker - monografie/rozdziały (u Ciebie controller jest pod /monograph/admin)
const LIST_MY_MONOGRAPHS_URL = '/api/monograph/admin/listMyMonographs';
const LIST_MY_CHAPTERS_URL = '/api/monograph/admin/listMyChapters';
const GET_MY_MONOGRAPH_URL = (id: number) => `/api/monograph/admin/getMonograph?id=${id}`;
const GET_MY_CHAPTER_URL = (id: number) => `/api/monograph/admin/getChapter?id=${id}`;
const CREATE_MONOGRAPH_URL = '/api/monograph/admin/createMonograph';
const CREATE_CHAPTER_URL = '/api/monograph/admin/createChapter';
const UPDATE_MONOGRAPH_URL = '/api/monograph/admin/updateMonograph';
const UPDATE_CHAPTER_URL = '/api/monograph/admin/updateChapter';
const DELETE_MONOGRAPH_URL = (id: number) => `/api/monograph/admin/deleteMonograph?id=${id}`;
const DELETE_CHAPTER_URL = (id: number) => `/api/monograph/admin/deleteChapter?id=${id}`;

// Słowniki (globalne)
const LIST_DISCIPLINES_URL = '/api/article/admin/listDisciplines';
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';
const LIST_TYPES_URL = '/api/article/admin/listTypes';

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

    // u Ciebie w response: monograficTitle
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

    coauthor?: Coauthor[] | null;
    coauthors?: Coauthor[] | null;
};

// ===== request payloads (frontend) =====
type ListRequest = {
    typeId: number;
    disciplineId: number;
    cycleId: number;
    page: number;
    size: number;
    sortBy: string;
    sortDir: 'ASC' | 'DESC';
};

// create/update – robimy minimalne body wg Twoich controllerów
type CreatePublicationRequest = {
    typeId: number;
    disciplineId: number;
    title: string;
    doi?: string | null;
    issn?: string | null;
    eissn?: string | null;
    journalTitle?: string | null;
    publicationYear: number;
    coauthors?: Coauthor[]; // najbezpieczniej struktura jak response
};

type UpdatePublicationRequest = {
    id: number;
    typeId: number;
    disciplineId: number;
    title: string;
    doi?: string | null;
    issn?: string | null;
    eissn?: string | null;
    journalTitle?: string | null;
    publicationYear: number;
    replaceCoauthors?: Coauthor[];
};

type CreateMonographRequest = {
    typeId: number;
    disciplineId: number;
    title: string;
    doi?: string | null;
    isbn?: string | null;
    monograficPublisherTitle?: string | null; // tak masz w request.getMonograficPublisherTitle()
    publicationYear: number;
    coauthors?: Coauthor[];
};

type UpdateMonographRequest = {
    id: number;
    typeId: number;
    disciplineId: number;
    title: string;
    doi?: string | null;
    isbn?: string | null;
    monograficPublisherTitle?: string | null;
    publicationYear: number;
    coauthors?: Coauthor[];
};

type CreateChapterRequest = {
    typeId: number;
    disciplineId: number;
    monograficChapterTitle: string;
    monograficTitle: string;
    monographPublisher: string;
    doi?: string | null;
    isbn?: string | null;
    publicationYear: number;
    coauthor?: Coauthor[];
};

type UpdateChapterRequest = {
    id: number;
    typeId: number;
    disciplineId: number;
    monograficChapterTitle: string;
    monograficTitle: string;
    monographPublisher: string;
    doi?: string | null;
    isbn?: string | null;
    publicationYear: number;
    coauthor?: Coauthor[];
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

function safeStr(v: any): string {
    const s = String(v ?? '').trim();
    return s ? s : '—';
}

function toIntOr0(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
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

// ====== SearchSelect (żeby dropdown nie wychodził poza ramkę) =====
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
        const nq = String(q ?? '').toLowerCase().trim();
        if (!nq) return options;
        return options.filter((o) => String(o.label ?? '').toLowerCase().includes(nq));
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
                        <input className={styles.searchInput} placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
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

function parseNamesToCoauthors(text: string): Coauthor[] {
    const lines = String(text ?? '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);

    return lines.slice(0, 200).map((fullName, idx) => ({
        position: idx + 1,
        fullName,
        userId: 0, // UI nie pokazuje ID; jeśli backend wymaga userId, później podmienisz na selektor użytkowników
    }));
}

function coauthorsToTextarea(arr?: Coauthor[] | null): string {
    const list = Array.isArray(arr) ? arr.slice().sort((a, b) => Number(a.position) - Number(b.position)) : [];
    return list.map((c) => String(c.fullName ?? '').trim()).filter(Boolean).join('\n');
}

// ===================== PAGE =====================
export default function WorkerDashboardPage() {
    const { initialized } = useAuth();

    const [tab, setTab] = useState<'articles' | 'monographs' | 'chapters'>('articles');

    // Filtry (tylko dyscyplina + cykl jak u admina)
    const [disciplineId, setDisciplineId] = useState<number>(0);
    const [cycleId, setCycleId] = useState<number>(0);

    const [pageMeta, setPageMeta] = useState<PageMeta>({ page: 0, size: 20, totalPages: 0, totalItems: 0 });

    // Słowniki
    const [disciplines, setDisciplines] = useState<RefItem[]>([]);
    const [cycles, setCycles] = useState<CycleItem[]>([]);
    const [types, setTypes] = useState<RefItem[]>([]);
    const [filtersLoading, setFiltersLoading] = useState(false);

    // listy
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemsError, setItemsError] = useState<string | null>(null);

    const [articles, setArticles] = useState<PublicationViewResponse[]>([]);
    const [monographs, setMonographs] = useState<MonographViewResponse[]>([]);
    const [chapters, setChapters] = useState<ChapterViewResponse[]>([]);

    // details modal
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [detailsData, setDetailsData] = useState<any>(null);
    const [detailsKind, setDetailsKind] = useState<'article' | 'monograph' | 'chapter'>('article');

    // create/edit modal
    const [editOpen, setEditOpen] = useState(false);
    const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
    const [editKind, setEditKind] = useState<'article' | 'monograph' | 'chapter'>('article');
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // form states
    const [articleForm, setArticleForm] = useState<{
        id?: number;
        typeId: number;
        disciplineId: number;
        title: string;
        journalTitle: string;
        publicationYear: number | '';
        doi: string;
        issn: string;
        eissn: string;
        coauthorsText: string;
    }>({
        typeId: 0,
        disciplineId: 0,
        title: '',
        journalTitle: '',
        publicationYear: '',
        doi: '',
        issn: '',
        eissn: '',
        coauthorsText: '',
    });

    const [monographForm, setMonographForm] = useState<{
        id?: number;
        typeId: number;
        disciplineId: number;
        title: string;
        monograficPublisherTitle: string;
        publicationYear: number | '';
        doi: string;
        isbn: string;
        coauthorsText: string;
    }>({
        typeId: 0,
        disciplineId: 0,
        title: '',
        monograficPublisherTitle: '',
        publicationYear: '',
        doi: '',
        isbn: '',
        coauthorsText: '',
    });

    const [chapterForm, setChapterForm] = useState<{
        id?: number;
        typeId: number;
        disciplineId: number;
        monograficChapterTitle: string;
        monograficTitle: string;
        monographPublisher: string;
        publicationYear: number | '';
        doi: string;
        isbn: string;
        coauthorsText: string;
    }>({
        typeId: 0,
        disciplineId: 0,
        monograficChapterTitle: '',
        monograficTitle: '',
        monographPublisher: '',
        publicationYear: '',
        doi: '',
        isbn: '',
        coauthorsText: '',
    });

    const listRequestBase = useMemo((): ListRequest => {
        return {
            typeId: 0, // celowo nie pokazujemy filtra typu (jak admin)
            disciplineId: toIntOr0(disciplineId),
            cycleId: toIntOr0(cycleId),
            page: pageMeta.page ?? 0,
            size: pageMeta.size ?? 20,
            sortBy: 'id',
            sortDir: 'DESC',
        };
    }, [disciplineId, cycleId, pageMeta.page, pageMeta.size]);

    // INIT
    useEffect(() => {
        if (!initialized) return;
        void loadDictionaries();
        void loadList(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // tab change
    useEffect(() => {
        if (!initialized) return;
        setItemsError(null);
        setPageMeta((p) => ({ ...p, page: 0 }));
        void loadList(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    async function loadDictionaries() {
        setFiltersLoading(true);
        try {
            const [dRes, cRes, tRes] = await Promise.all([
                authFetch(LIST_DISCIPLINES_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: 0, size: 300, sortDir: 'ASC' }),
                } as RequestInit),
                authFetch(LIST_CYCLES_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
                } as RequestInit),
                authFetch(LIST_TYPES_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: 0, size: 300, sortDir: 'ASC' }),
                } as RequestInit),
            ]);

            const dTxt = await dRes.text().catch(() => '');
            if (dRes.ok) {
                const dData = dTxt ? JSON.parse(dTxt) : null;
                setDisciplines((dData?.item ?? dData?.items ?? []) as RefItem[]);
            } else setDisciplines([]);

            const cTxt = await cRes.text().catch(() => '');
            if (cRes.ok) {
                const cData = cTxt ? JSON.parse(cTxt) : null;
                setCycles((cData?.item ?? cData?.items ?? []) as CycleItem[]);
            } else setCycles([]);

            const tTxt = await tRes.text().catch(() => '');
            if (tRes.ok) {
                const tData = tTxt ? JSON.parse(tTxt) : null;
                setTypes((tData?.item ?? tData?.items ?? []) as RefItem[]);
            } else setTypes([]);
        } finally {
            setFiltersLoading(false);
        }
    }

    async function loadList(page: number) {
        setItemsLoading(true);
        setItemsError(null);

        try {
            const body = { ...listRequestBase, page };

            if (tab === 'articles') {
                const res = await authFetch(LIST_MY_ARTICLES_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setArticles((data?.publications ?? data?.items ?? data?.item ?? []) as PublicationViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: body.size });
                setMonographs([]);
                setChapters([]);
            }

            if (tab === 'monographs') {
                const res = await authFetch(LIST_MY_MONOGRAPHS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setMonographs((data?.monograph ?? data?.monographs ?? data?.items ?? data?.item ?? []) as MonographViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: body.size });
                setArticles([]);
                setChapters([]);
            }

            if (tab === 'chapters') {
                const res = await authFetch(LIST_MY_CHAPTERS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                } as RequestInit);

                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setChapters((data?.chapters ?? data?.items ?? data?.item ?? []) as ChapterViewResponse[]);
                setPageMeta(data?.pageMeta ?? { page, size: body.size });
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

    // ===== details =====
    async function openDetails(kind: 'article' | 'monograph' | 'chapter', id: number) {
        setDetailsKind(kind);
        setDetailsOpen(true);
        setDetailsLoading(true);
        setDetailsError(null);
        setDetailsData(null);

        try {
            if (kind === 'article') {
                const res = await authFetch(GET_MY_ARTICLE_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                setDetailsData(txt ? JSON.parse(txt) : null);
            } else if (kind === 'monograph') {
                const res = await authFetch(GET_MY_MONOGRAPH_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                setDetailsData(txt ? JSON.parse(txt) : null);
            } else {
                const res = await authFetch(GET_MY_CHAPTER_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                setDetailsData(txt ? JSON.parse(txt) : null);
            }
        } catch (e: any) {
            setDetailsError(String(e?.message ?? e));
        } finally {
            setDetailsLoading(false);
        }
    }

    const detailsCoauthors: Coauthor[] = useMemo(() => normalizeCoauthors(detailsData), [detailsData]);
    const detailsOwnerName = useMemo(() => {
        if (!detailsData) return '—';
        const ownerId = Number(detailsData?.ownerId ?? detailsData?.authorId ?? 0);
        return pickOwnerName(ownerId, detailsCoauthors);
    }, [detailsData, detailsCoauthors]);

    // ===== create/edit =====
    function openCreate(kind: 'article' | 'monograph' | 'chapter') {
        setEditKind(kind);
        setEditMode('create');
        setEditError(null);

        if (kind === 'article') {
            setArticleForm({
                typeId: 0,
                disciplineId: 0,
                title: '',
                journalTitle: '',
                publicationYear: '',
                doi: '',
                issn: '',
                eissn: '',
                coauthorsText: '',
            });
        } else if (kind === 'monograph') {
            setMonographForm({
                typeId: 0,
                disciplineId: 0,
                title: '',
                monograficPublisherTitle: '',
                publicationYear: '',
                doi: '',
                isbn: '',
                coauthorsText: '',
            });
        } else {
            setChapterForm({
                typeId: 0,
                disciplineId: 0,
                monograficChapterTitle: '',
                monograficTitle: '',
                monographPublisher: '',
                publicationYear: '',
                doi: '',
                isbn: '',
                coauthorsText: '',
            });
        }

        setEditOpen(true);
    }

    async function openEdit(kind: 'article' | 'monograph' | 'chapter', id: number) {
        setEditKind(kind);
        setEditMode('edit');
        setEditError(null);
        setEditLoading(true);
        setEditOpen(true);

        try {
            if (kind === 'article') {
                const res = await authFetch(GET_MY_ARTICLE_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setArticleForm({
                    id,
                    typeId: toIntOr0(data?.type?.id),
                    disciplineId: toIntOr0(data?.discipline?.id),
                    title: String(data?.title ?? ''),
                    journalTitle: String(data?.journalTitle ?? ''),
                    publicationYear: Number(data?.publicationYear ?? '') || '',
                    doi: String(data?.doi ?? ''),
                    issn: String(data?.issn ?? ''),
                    eissn: String(data?.eissn ?? ''),
                    coauthorsText: coauthorsToTextarea(normalizeCoauthors(data)),
                });
            } else if (kind === 'monograph') {
                const res = await authFetch(GET_MY_MONOGRAPH_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setMonographForm({
                    id,
                    typeId: toIntOr0(data?.type?.id),
                    disciplineId: toIntOr0(data?.discipline?.id),
                    title: String(data?.title ?? ''),
                    monograficPublisherTitle: String(data?.monograficTitle ?? ''),
                    publicationYear: Number(data?.publicationYear ?? '') || '',
                    doi: String(data?.doi ?? ''),
                    isbn: String(data?.isbn ?? ''),
                    coauthorsText: coauthorsToTextarea(normalizeCoauthors(data)),
                });
            } else {
                const res = await authFetch(GET_MY_CHAPTER_URL(id), { method: 'GET' });
                const txt = await res.text().catch(() => '');
                if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                const data = txt ? JSON.parse(txt) : null;

                setChapterForm({
                    id,
                    typeId: toIntOr0(data?.type?.id),
                    disciplineId: toIntOr0(data?.discipline?.id),
                    monograficChapterTitle: String(data?.monograficChapterTitle ?? ''),
                    monograficTitle: String(data?.monograficTitle ?? ''),
                    monographPublisher: String(data?.monographPublisher ?? ''),
                    publicationYear: Number(data?.publicationYear ?? '') || '',
                    doi: String(data?.doi ?? ''),
                    isbn: String(data?.isbn ?? ''),
                    coauthorsText: coauthorsToTextarea(normalizeCoauthors(data)),
                });
            }
        } catch (e: any) {
            setEditError(String(e?.message ?? e));
        } finally {
            setEditLoading(false);
        }
    }

    async function saveEdit() {
        setEditError(null);
        setEditLoading(true);

        try {
            if (editKind === 'article') {
                const year = Number(articleForm.publicationYear);
                if (!articleForm.typeId || !articleForm.disciplineId || !articleForm.title.trim() || !Number.isFinite(year) || year <= 0) {
                    throw new Error('Uzupełnij: typ, dyscyplina, tytuł, rok publikacji.');
                }

                if (editMode === 'create') {
                    const body: CreatePublicationRequest = {
                        typeId: articleForm.typeId,
                        disciplineId: articleForm.disciplineId,
                        title: articleForm.title.trim(),
                        doi: articleForm.doi.trim() || null,
                        issn: articleForm.issn.trim() || null,
                        eissn: articleForm.eissn.trim() || null,
                        journalTitle: articleForm.journalTitle.trim() || null,
                        publicationYear: year,
                        coauthors: parseNamesToCoauthors(articleForm.coauthorsText),
                    };

                    const res = await authFetch(CREATE_ARTICLE_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                } else {
                    const id = Number(articleForm.id ?? 0);
                    if (!id) throw new Error('Brak ID do edycji.');

                    const body: UpdatePublicationRequest = {
                        id,
                        typeId: articleForm.typeId,
                        disciplineId: articleForm.disciplineId,
                        title: articleForm.title.trim(),
                        doi: articleForm.doi.trim() || null,
                        issn: articleForm.issn.trim() || null,
                        eissn: articleForm.eissn.trim() || null,
                        journalTitle: articleForm.journalTitle.trim() || null,
                        publicationYear: year,
                        replaceCoauthors: parseNamesToCoauthors(articleForm.coauthorsText),
                    };

                    const res = await authFetch(UPDATE_ARTICLE_URL, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                }
            }

            if (editKind === 'monograph') {
                const year = Number(monographForm.publicationYear);
                if (!monographForm.typeId || !monographForm.disciplineId || !monographForm.title.trim() || !Number.isFinite(year) || year <= 0) {
                    throw new Error('Uzupełnij: typ, dyscyplina, tytuł, rok publikacji.');
                }

                if (editMode === 'create') {
                    const body: CreateMonographRequest = {
                        typeId: monographForm.typeId,
                        disciplineId: monographForm.disciplineId,
                        title: monographForm.title.trim(),
                        doi: monographForm.doi.trim() || null,
                        isbn: monographForm.isbn.trim() || null,
                        monograficPublisherTitle: monographForm.monograficPublisherTitle.trim() || null,
                        publicationYear: year,
                        coauthors: parseNamesToCoauthors(monographForm.coauthorsText),
                    };

                    const res = await authFetch(CREATE_MONOGRAPH_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                } else {
                    const id = Number(monographForm.id ?? 0);
                    if (!id) throw new Error('Brak ID do edycji.');

                    const body: UpdateMonographRequest = {
                        id,
                        typeId: monographForm.typeId,
                        disciplineId: monographForm.disciplineId,
                        title: monographForm.title.trim(),
                        doi: monographForm.doi.trim() || null,
                        isbn: monographForm.isbn.trim() || null,
                        monograficPublisherTitle: monographForm.monograficPublisherTitle.trim() || null,
                        publicationYear: year,
                        coauthors: parseNamesToCoauthors(monographForm.coauthorsText),
                    };

                    const res = await authFetch(UPDATE_MONOGRAPH_URL, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                }
            }

            if (editKind === 'chapter') {
                const year = Number(chapterForm.publicationYear);
                if (
                    !chapterForm.typeId ||
                    !chapterForm.disciplineId ||
                    !chapterForm.monograficChapterTitle.trim() ||
                    !chapterForm.monograficTitle.trim() ||
                    !chapterForm.monographPublisher.trim() ||
                    !Number.isFinite(year) ||
                    year <= 0
                ) {
                    throw new Error('Uzupełnij: typ, dyscyplina, tytuł rozdziału, tytuł monografii, wydawca, rok publikacji.');
                }

                if (editMode === 'create') {
                    const body: CreateChapterRequest = {
                        typeId: chapterForm.typeId,
                        disciplineId: chapterForm.disciplineId,
                        monograficChapterTitle: chapterForm.monograficChapterTitle.trim(),
                        monograficTitle: chapterForm.monograficTitle.trim(),
                        monographPublisher: chapterForm.monographPublisher.trim(),
                        doi: chapterForm.doi.trim() || null,
                        isbn: chapterForm.isbn.trim() || null,
                        publicationYear: year,
                        coauthor: parseNamesToCoauthors(chapterForm.coauthorsText),
                    };

                    const res = await authFetch(CREATE_CHAPTER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                } else {
                    const id = Number(chapterForm.id ?? 0);
                    if (!id) throw new Error('Brak ID do edycji.');

                    const body: UpdateChapterRequest = {
                        id,
                        typeId: chapterForm.typeId,
                        disciplineId: chapterForm.disciplineId,
                        monograficChapterTitle: chapterForm.monograficChapterTitle.trim(),
                        monograficTitle: chapterForm.monograficTitle.trim(),
                        monographPublisher: chapterForm.monographPublisher.trim(),
                        doi: chapterForm.doi.trim() || null,
                        isbn: chapterForm.isbn.trim() || null,
                        publicationYear: year,
                        coauthor: parseNamesToCoauthors(chapterForm.coauthorsText),
                    };

                    const res = await authFetch(UPDATE_CHAPTER_URL, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    } as RequestInit);

                    const txt = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
                }
            }

            setEditOpen(false);
            void loadList(pageMeta.page ?? 0);
        } catch (e: any) {
            setEditError(String(e?.message ?? e));
        } finally {
            setEditLoading(false);
        }
    }

    async function deleteItem(kind: 'article' | 'monograph' | 'chapter', id: number) {
        if (!confirm('Usunąć?')) return;

        try {
            let res: Response;

            if (kind === 'article') {
                res = await authFetch(DELETE_ARTICLE_URL(id), { method: 'DELETE' });
            } else if (kind === 'monograph') {
                res = await authFetch(DELETE_MONOGRAPH_URL(id), { method: 'DELETE' });
            } else {
                res = await authFetch(DELETE_CHAPTER_URL(id), { method: 'DELETE' });
            }

            const txt = await res.text().catch(() => '');
            if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

            void loadList(pageMeta.page ?? 0);
        } catch (e: any) {
            alert(`Błąd usuwania: ${String(e?.message ?? e)}`);
        }
    }

    const listCount = useMemo(() => {
        if (tab === 'articles') return articles.length;
        if (tab === 'monographs') return monographs.length;
        return chapters.length;
    }, [tab, articles.length, monographs.length, chapters.length]);

    const disciplineOptions: Option[] = useMemo(
        () => [{ id: 0, label: '— dowolna —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))],
        [disciplines]
    );
    const cycleOptions: Option[] = useMemo(
        () => [{ id: 0, label: '— dowolny —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))],
        [cycles]
    );
    const typeOptions: Option[] = useMemo(
        () => [{ id: 0, label: '— wybierz —' }, ...types.map((t) => ({ id: t.id, label: t.name }))],
        [types]
    );

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel pracownika — Moje publikacje</h1>

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

                    <button
                        className={styles.secondaryBtn}
                        onClick={() => openCreate(tab === 'articles' ? 'article' : tab === 'monographs' ? 'monograph' : 'chapter')}
                    >
                        + Dodaj
                    </button>
                </div>
            </header>

            <div className={styles.contentRow}>
                {/* LEFT */}
                <div className={styles.leftColumn}>
                    {itemsLoading ? (
                        <div className={styles.loading}>Ładowanie…</div>
                    ) : itemsError ? (
                        <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                            Błąd: {itemsError}
                        </div>
                    ) : listCount === 0 ? (
                        <div className={styles.empty}>Brak danych</div>
                    ) : (
                        <div className={styles.cardsGrid}>
                            {/* ====== ARTYKUŁY ====== */}
                            {tab === 'articles' &&
                                articles.map((a) => {
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

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('article', a.id)}>
                                                    Szczegóły
                                                </button>
                                                <button className={styles.ghostBtn} onClick={() => openEdit('article', a.id)}>
                                                    Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => deleteItem('article', a.id)}>
                                                    Usuń
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                            {/* ====== MONOGRAFIE ====== */}
                            {tab === 'monographs' &&
                                monographs.map((m) => {
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

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('monograph', m.id)}>
                                                    Szczegóły
                                                </button>
                                                <button className={styles.ghostBtn} onClick={() => openEdit('monograph', m.id)}>
                                                    Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => deleteItem('monograph', m.id)}>
                                                    Usuń
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                            {/* ====== ROZDZIAŁY ====== */}
                            {tab === 'chapters' &&
                                chapters.map((c) => {
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

                                            <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                <button className={styles.infoBtn} onClick={() => openDetails('chapter', c.id)}>
                                                    Szczegóły
                                                </button>
                                                <button className={styles.ghostBtn} onClick={() => openEdit('chapter', c.id)}>
                                                    Edytuj
                                                </button>
                                                <button className={styles.dangerBtn} onClick={() => deleteItem('chapter', c.id)}>
                                                    Usuń
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
                            <SearchSelect
                                label="Dyscyplina"
                                value={disciplineId}
                                options={disciplineOptions}
                                disabled={filtersLoading}
                                placeholder="— dowolna —"
                                onChange={(id) => setDisciplineId(Number(id) || 0)}
                            />

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
                                Sortowanie: domyślnie po ID (DESC). Filtr typu jest ukryty (typeId=0).
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

            {/* CREATE/EDIT MODAL */}
            <Modal
                open={editOpen}
                title={
                    editMode === 'create'
                        ? editKind === 'article'
                            ? 'Dodaj — artykuł'
                            : editKind === 'monograph'
                                ? 'Dodaj — monografia'
                                : 'Dodaj — rozdział'
                        : editKind === 'article'
                            ? 'Edytuj — artykuł'
                            : editKind === 'monograph'
                                ? 'Edytuj — monografia'
                                : 'Edytuj — rozdział'
                }
                onClose={() => {
                    if (editLoading) return;
                    setEditOpen(false);
                    setEditError(null);
                }}
            >
                {editLoading && editMode === 'edit' ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                        {editError && (
                            <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                                Błąd: {editError}
                            </div>
                        )}

                        {/* wspólne: typ + dyscyplina */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <SearchSelect
                                label="Typ"
                                value={editKind === 'article' ? articleForm.typeId : editKind === 'monograph' ? monographForm.typeId : chapterForm.typeId}
                                options={typeOptions}
                                disabled={filtersLoading}
                                placeholder="— wybierz —"
                                onChange={(id) => {
                                    const v = Number(id) || 0;
                                    if (editKind === 'article') setArticleForm((p) => ({ ...p, typeId: v }));
                                    if (editKind === 'monograph') setMonographForm((p) => ({ ...p, typeId: v }));
                                    if (editKind === 'chapter') setChapterForm((p) => ({ ...p, typeId: v }));
                                }}
                            />

                            <SearchSelect
                                label="Dyscyplina"
                                value={editKind === 'article' ? articleForm.disciplineId : editKind === 'monograph' ? monographForm.disciplineId : chapterForm.disciplineId}
                                options={disciplineOptions}
                                disabled={filtersLoading}
                                placeholder="— wybierz —"
                                onChange={(id) => {
                                    const v = Number(id) || 0;
                                    if (editKind === 'article') setArticleForm((p) => ({ ...p, disciplineId: v }));
                                    if (editKind === 'monograph') setMonographForm((p) => ({ ...p, disciplineId: v }));
                                    if (editKind === 'chapter') setChapterForm((p) => ({ ...p, disciplineId: v }));
                                }}
                            />
                        </div>

                        {/* formularze zależne od typu */}
                        {editKind === 'article' && (
                            <>
                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Tytuł
                  </span>
                                    <input className={styles.searchInput} value={articleForm.title} onChange={(e) => setArticleForm((p) => ({ ...p, title: e.target.value }))} />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Czasopismo (journalTitle)
                  </span>
                                    <input
                                        className={styles.searchInput}
                                        value={articleForm.journalTitle}
                                        onChange={(e) => setArticleForm((p) => ({ ...p, journalTitle: e.target.value }))}
                                    />
                                </label>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      Rok publikacji
                    </span>
                                        <input
                                            className={styles.searchInput}
                                            type="number"
                                            value={articleForm.publicationYear}
                                            onChange={(e) => setArticleForm((p) => ({ ...p, publicationYear: e.target.value ? Number(e.target.value) : '' }))}
                                        />
                                    </label>

                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      DOI
                    </span>
                                        <input className={styles.searchInput} value={articleForm.doi} onChange={(e) => setArticleForm((p) => ({ ...p, doi: e.target.value }))} />
                                    </label>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      ISSN
                    </span>
                                        <input className={styles.searchInput} value={articleForm.issn} onChange={(e) => setArticleForm((p) => ({ ...p, issn: e.target.value }))} />
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      EISSN
                    </span>
                                        <input className={styles.searchInput} value={articleForm.eissn} onChange={(e) => setArticleForm((p) => ({ ...p, eissn: e.target.value }))} />
                                    </label>
                                </div>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Współautorzy (po jednym w linii)
                  </span>
                                    <textarea
                                        className={styles.searchInput}
                                        rows={4}
                                        value={articleForm.coauthorsText}
                                        onChange={(e) => setArticleForm((p) => ({ ...p, coauthorsText: e.target.value }))}
                                        placeholder={`Jan Kowalski\nAnna Nowak`}
                                        style={{ resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
                                    />
                                    <span className={styles.muted} style={{ fontSize: 12 }}>
                    UI zapisuje współautorów jako fullName + position. userId = 0 (bez pokazywania ID).
                  </span>
                                </label>
                            </>
                        )}

                        {editKind === 'monograph' && (
                            <>
                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Tytuł
                  </span>
                                    <input className={styles.searchInput} value={monographForm.title} onChange={(e) => setMonographForm((p) => ({ ...p, title: e.target.value }))} />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Tytuł monografii / wydawca (monograficTitle)
                  </span>
                                    <input
                                        className={styles.searchInput}
                                        value={monographForm.monograficPublisherTitle}
                                        onChange={(e) => setMonographForm((p) => ({ ...p, monograficPublisherTitle: e.target.value }))}
                                    />
                                </label>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      Rok publikacji
                    </span>
                                        <input
                                            className={styles.searchInput}
                                            type="number"
                                            value={monographForm.publicationYear}
                                            onChange={(e) => setMonographForm((p) => ({ ...p, publicationYear: e.target.value ? Number(e.target.value) : '' }))}
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      DOI
                    </span>
                                        <input className={styles.searchInput} value={monographForm.doi} onChange={(e) => setMonographForm((p) => ({ ...p, doi: e.target.value }))} />
                                    </label>
                                </div>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    ISBN
                  </span>
                                    <input className={styles.searchInput} value={monographForm.isbn} onChange={(e) => setMonographForm((p) => ({ ...p, isbn: e.target.value }))} />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Współautorzy (po jednym w linii)
                  </span>
                                    <textarea
                                        className={styles.searchInput}
                                        rows={4}
                                        value={monographForm.coauthorsText}
                                        onChange={(e) => setMonographForm((p) => ({ ...p, coauthorsText: e.target.value }))}
                                        style={{ resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
                                    />
                                </label>
                            </>
                        )}

                        {editKind === 'chapter' && (
                            <>
                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Tytuł rozdziału
                  </span>
                                    <input
                                        className={styles.searchInput}
                                        value={chapterForm.monograficChapterTitle}
                                        onChange={(e) => setChapterForm((p) => ({ ...p, monograficChapterTitle: e.target.value }))}
                                    />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Tytuł monografii
                  </span>
                                    <input className={styles.searchInput} value={chapterForm.monograficTitle} onChange={(e) => setChapterForm((p) => ({ ...p, monograficTitle: e.target.value }))} />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Wydawca (monographPublisher)
                  </span>
                                    <input
                                        className={styles.searchInput}
                                        value={chapterForm.monographPublisher}
                                        onChange={(e) => setChapterForm((p) => ({ ...p, monographPublisher: e.target.value }))}
                                    />
                                </label>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      Rok publikacji
                    </span>
                                        <input
                                            className={styles.searchInput}
                                            type="number"
                                            value={chapterForm.publicationYear}
                                            onChange={(e) => setChapterForm((p) => ({ ...p, publicationYear: e.target.value ? Number(e.target.value) : '' }))}
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                    <span className={styles.muted} style={{ fontWeight: 800 }}>
                      DOI
                    </span>
                                        <input className={styles.searchInput} value={chapterForm.doi} onChange={(e) => setChapterForm((p) => ({ ...p, doi: e.target.value }))} />
                                    </label>
                                </div>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    ISBN
                  </span>
                                    <input className={styles.searchInput} value={chapterForm.isbn} onChange={(e) => setChapterForm((p) => ({ ...p, isbn: e.target.value }))} />
                                </label>

                                <label style={{ display: 'grid', gap: 6 }}>
                  <span className={styles.muted} style={{ fontWeight: 800 }}>
                    Współautorzy (po jednym w linii)
                  </span>
                                    <textarea
                                        className={styles.searchInput}
                                        rows={4}
                                        value={chapterForm.coauthorsText}
                                        onChange={(e) => setChapterForm((p) => ({ ...p, coauthorsText: e.target.value }))}
                                        style={{ resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
                                    />
                                </label>
                            </>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className={styles.primaryBtn} onClick={saveEdit} disabled={editLoading}>
                                {editLoading ? 'Zapis…' : 'Zapisz'}
                            </button>
                            <button className={styles.ghostBtn} onClick={() => setEditOpen(false)} disabled={editLoading}>
                                Anuluj
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

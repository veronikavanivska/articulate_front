// src/app/worker/slots/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';

// ===== SLOTS (proxy -> API Gateway) =====
const GET_SLOTS_URL = '/api/slots/getSlots'; // POST
const REMOVE_FROM_SLOTS_URL = '/api/slots/removeFromSlots'; // DELETE (JSON body)

// ===== WORKER DISCIPLINES (Twoje dyscypliny) =====
// Jeśli u Ciebie proxy/route ma inną nazwę (np. /api/profiles/me/disciplines) – podmień tylko ten URL.
const LIST_MY_DISCIPLINES_URL = '/api/profile/me/disciplines'; // GET

// ===== CYCLES (admin słownik) =====
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

// ===================== TYPES =====================
type RefItem = { id: number; name: string };
type CycleItem = { id: number; yearFrom: number; yearTo: number; name: string; isActive?: boolean; active?: boolean };

type SlotItemType = 'ARTICLE' | 'MONOGRAPH' | 'CHAPTER' | string;

type DraftItemResponse = {
    itemType: SlotItemType;
    itemId: number;

    publicationYear: number;
    title: string;

    points: number;
    slotValue: number;
    pointsRecalc: number;

    // defensywnie – jak backend czasem inaczej zwróci:
    id?: number | null;
    type?: string | null;
    name?: string | null;

    [k: string]: any;
};

type DraftViewResponse = {
    draftId: number;
    userId: number;
    disciplineId: number;
    cycleId: number;
    evalYear: number;

    editable: boolean;
    maxSlots: number;
    usedSlots: number;
    freeSlots: number;

    sumPoints: number;
    sumPointsRecalc: number;

    items: DraftItemResponse[];
};

type ListWorkerDisciplineResponse = {
    discipline?: RefItem[];
    disciplines?: RefItem[];
    items?: RefItem[];
    item?: RefItem[];
    apiResponse?: { code?: any; message?: string };
};

type UiMessage = { type: 'error' | 'success' | 'info'; text: string };

type FieldErr = { field?: string; message?: string; defaultMessage?: string; code?: string };

// ===================== HELPERS =====================
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

function safeStr(v: any): string {
    const s = String(v ?? '').trim();
    return s ? s : '—';
}

function formatNum(v: any): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    const isInt = Math.abs(n - Math.round(n)) < 1e-9;
    return isInt ? String(Math.round(n)) : String(n);
}

function cycleLabel(c?: CycleItem | null) {
    if (!c) return '—';
    const yf = c.yearFrom ?? '';
    const yt = c.yearTo ?? '';
    const nm = c.name ? String(c.name) : '';
    return nm ? `${nm} (${yf}-${yt})` : `${yf}-${yt}`;
}

function stripIds(s: string): string {
    return String(s || '')
        .replace(/\b(ID|Id|id)\s*[=:]\s*\d+\b/g, '')
        .replace(/#\d+\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function translateBackendMessage(raw: string): string {
    const text = String(raw ?? '').trim();
    if (!text) return 'Wystąpił błąd.';

    const j = safeJson(text);
    const msg =
        (typeof j?.message === 'string' && j.message) ||
        (typeof j?.error === 'string' && j.error) ||
        (typeof j?.detail === 'string' && j.detail) ||
        (typeof j?.description === 'string' && j.description) ||
        text;

    const m = stripIds(String(msg).trim());
    if (!m) return 'Wystąpił błąd.';

    // typowe komunikaty slotów
    if (/^Only publications from activeYear=\d+\s+can be added\.$/i.test(m)) {
        return 'Do slotów można dodać tylko publikacje z aktywnego roku.';
    }
    if (m.startsWith('Slot limit exceeded')) return 'Przekroczono limit slotów.';
    if (m.startsWith('Mono sublimit exceeded')) return 'Przekroczono limit slotów dla monografii.';
    if (m.startsWith('Chapter sublimit exceeded')) return 'Przekroczono limit slotów dla rozdziałów.';
    if (m.startsWith('Article sublimit exceeded')) return 'Przekroczono limit slotów dla artykułów.';
    if (/not editable/i.test(m)) return 'Ten draft nie jest edytowalny (nie można usuwać elementów).';
    if (/not found/i.test(m)) return 'Nie znaleziono zasobu.';
    if (/forbidden/i.test(m)) return 'Brak uprawnień do tej operacji.';

    return m;
}

function mapApiError(status: number, rawText: string): string {
    const txt = String(rawText ?? '').trim();
    const j = safeJson(txt);

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
                        ? 'Nie znaleziono zasobu.'
                        : status >= 500
                            ? 'Błąd serwera.'
                            : '';

    const top = translateBackendMessage(message || txt || statusHint || `HTTP ${status}`);

    if (errorsArr.length > 0) {
        const lines = errorsArr
            .map((e) => {
                const f = String(e.field ?? '').trim();
                const m = translateBackendMessage(String(e.message ?? e.defaultMessage ?? '').trim());
                if (f && m) return `• ${f}: ${m}`;
                if (m) return `• ${m}`;
                return '';
            })
            .filter(Boolean);

        return [top, ...lines].join('\n');
    }

    return top || statusHint || `HTTP ${status}`;
}

// ---- SLOT ITEM TYPE TRANSLATION ----
function normalizeSlotItemType(raw: any): string {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
}

function slotItemTypeLabel(raw: any): string {
    const t = normalizeSlotItemType(raw);

    if (t === 'ARTICLE' || t === 'SLOT_ITEM_ARTICLE') return 'Artykuł';
    if (t === 'MONOGRAPH' || t === 'SLOT_ITEM_MONOGRAPH') return 'Monografia';
    if (t === 'CHAPTER' || t === 'SLOT_ITEM_CHAPTER') return 'Rozdział';

    // fallback by contains
    if (t.includes('ARTICLE')) return 'Artykuł';
    if (t.includes('MONOGRAPH')) return 'Monografia';
    if (t.includes('CHAPTER')) return 'Rozdział';

    return t || '—';
}

async function readApiError(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    return mapApiError(res.status, text || '');
}

// UI badge (bazuje na Twoim CSS)
function Chip(props: { text: string; kind?: 'muted' | 'worker' | 'danger' }) {
    const kind = props.kind ?? 'muted';
    const cls = kind === 'worker' ? styles.badgeWorker : kind === 'danger' ? styles.badgeAdmin : styles.badgeMuted;
    return <span className={`${styles.badge} ${cls}`}>{props.text}</span>;
}

function InlineNotice({ msg }: { msg: UiMessage | null }) {
    if (!msg) return null;

    const base: React.CSSProperties = {
        fontSize: 12,
        fontWeight: 800,
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        whiteSpace: 'pre-wrap',
        marginBottom: 10,
    };

    const style: React.CSSProperties =
        msg.type === 'error'
            ? { ...base, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }
            : msg.type === 'success'
                ? { ...base, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }
                : { ...base, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' };

    return <div style={style}>{msg.text}</div>;
}

// ===================== UI: MODAL (scrollowalny) =====================
function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
    if (!props.open) return null;

    return (
        <div className={styles.modalOverlay} onMouseDown={props.onClose}>
            <div
                className={styles.modalCard}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: 'min(1100px, calc(100vw - 32px))',
                    maxHeight: 'calc(100vh - 32px)',
                    overflow: 'hidden',
                }}
            >
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>{props.title}</h3>
                    <button className={styles.ghostBtn} onClick={props.onClose}>
                        Zamknij
                    </button>
                </div>

                <div
                    style={{
                        maxHeight: 'calc(100vh - 32px - 70px)',
                        overflowY: 'auto',
                        paddingRight: 6,
                    }}
                >
                    {props.children}
                </div>
            </div>
        </div>
    );
}

// ===================== CONFIRM MODAL =====================
function ConfirmModal(props: {
    open: boolean;
    title: string;
    body?: string | null;
    confirmText?: string;
    cancelText?: string;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    if (!props.open) return null;

    return (
        <div className={styles.modalOverlay} onMouseDown={props.onClose}>
            <div className={styles.modalCard} onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(560px, calc(100vw - 32px))' }}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>{props.title}</h3>
                    <button className={styles.ghostBtn} onClick={props.onClose} disabled={props.busy}>
                        Zamknij
                    </button>
                </div>

                <div style={{ padding: 14 }}>
                    {props.body ? <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{props.body}</div> : null}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className={styles.ghostBtn} onClick={props.onClose} disabled={props.busy}>
                            {props.cancelText ?? 'Anuluj'}
                        </button>
                        <button className={styles.dangerBtn} onClick={props.onConfirm} disabled={props.busy}>
                            {props.busy ? 'Wykonywanie…' : props.confirmText ?? 'Potwierdź'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ===================== PAGE =====================
export default function WorkerSlotsPage() {
    const { initialized } = useAuth();

    // DICTS
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [disciplines, setDisciplines] = useState<RefItem[]>([]);
    const [cycles, setCycles] = useState<CycleItem[]>([]);

    // FILTERS
    const currentYear = useMemo(() => new Date().getFullYear(), []);
    const [disciplineId, setDisciplineId] = useState<number>(0);
    const [cycleId, setCycleId] = useState<number>(0);
    const [evalYear, setEvalYear] = useState<number>(currentYear);

    // DATA
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [draft, setDraft] = useState<DraftViewResponse | null>(null);

    // UI message
    const [uiMsg, setUiMsg] = useState<UiMessage | null>(null);
    const uiMsgT = useRef<number | null>(null);
    function showMessage(type: UiMessage['type'], text: string) {
        setUiMsg({ type, text });
        if (uiMsgT.current) window.clearTimeout(uiMsgT.current);
        uiMsgT.current = window.setTimeout(() => setUiMsg(null), 4500);
    }

    // DETAILS MODAL
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [detailsItem, setDetailsItem] = useState<DraftItemResponse | null>(null);

    // REMOVE CONFIRM MODAL
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('Potwierdź');
    const [confirmBody, setConfirmBody] = useState<string | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

    // busy remove
    const [removingKey, setRemovingKey] = useState<string | null>(null);

    useEffect(() => {
        if (!initialized) return;
        void loadDicts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    async function loadDicts() {
        setFiltersLoading(true);
        try {
            // 1) Moje dyscypliny (GET)
            const dRes = await authFetch(LIST_MY_DISCIPLINES_URL, { method: 'GET' });
            const dTxt = await dRes.text().catch(() => '');
            if (dRes.ok) {
                const dData = (safeJson(dTxt) ?? null) as ListWorkerDisciplineResponse | null;
                const arr = (dData?.discipline ?? dData?.disciplines ?? dData?.items ?? dData?.item ?? []) as RefItem[];
                const mapped = Array.isArray(arr)
                    ? arr
                        .map((d) => ({ id: Number((d as any).id) || 0, name: String((d as any).name ?? '').trim() }))
                        .filter((d) => d.id > 0 && d.name)
                    : [];
                setDisciplines(mapped);
            } else {
                setDisciplines([]);
            }

            // 2) Cykle (POST słownik)
            const cRes = await authFetch(LIST_CYCLES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }),
            } as RequestInit);

            const cTxt = await cRes.text().catch(() => '');
            if (cRes.ok) {
                const cData = safeJson(cTxt);
                const arr = (cData?.item ?? cData?.items ?? []) as CycleItem[];
                setCycles(Array.isArray(arr) ? arr : []);
            } else {
                setCycles([]);
            }
        } finally {
            setFiltersLoading(false);
        }
    }

    const disciplineOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— wybierz dyscyplinę —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))],
        [disciplines]
    );

    const cycleOptionsSS: SearchSelectOption[] = useMemo(
        () => [{ id: 0, label: '— wybierz cykl —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))],
        [cycles]
    );

    const selectedCycle = useMemo(() => {
        const id = Number(cycleId) || 0;
        if (!id) return null;
        return cycles.find((c) => Number(c.id) === id) ?? null;
    }, [cycles, cycleId]);

    const evalYearMin = selectedCycle?.yearFrom ?? 0;
    const evalYearMax = selectedCycle?.yearTo ?? 0;

    // clamp evalYear po zmianie cyklu
    useEffect(() => {
        if (!selectedCycle) return;

        const min = Number(selectedCycle.yearFrom) || 0;
        const max = Number(selectedCycle.yearTo) || 0;
        if (min <= 0 || max <= 0) return;

        setEvalYear((prev) => {
            const v = Number(prev) || 0;
            if (v < min) return min;
            if (v > max) return max;
            return v;
        });
    }, [selectedCycle?.id]);

    function openConfirm(opts: { title: string; body?: string; onConfirm: () => Promise<void> | void }) {
        setConfirmTitle(opts.title);
        setConfirmBody(opts.body ?? null);
        confirmActionRef.current = opts.onConfirm;
        setConfirmBusy(false);
        setConfirmOpen(true);
    }

    async function runConfirm() {
        const fn = confirmActionRef.current;
        if (!fn) {
            setConfirmOpen(false);
            return;
        }
        setConfirmBusy(true);
        try {
            await fn();
            setConfirmOpen(false);
        } finally {
            setConfirmBusy(false);
            confirmActionRef.current = null;
        }
    }

    function normalizeItemKey(item: DraftItemResponse) {
        const itemType = normalizeSlotItemType(item?.itemType ?? item?.type ?? '');
        const itemId = Number(item?.itemId ?? item?.id ?? 0) || 0;
        return `${itemType}`;
    }

    async function fetchSlots() {
        setLoading(true);
        setErr(null);
        setDraft(null);
        setUiMsg(null);

        try {
            if (disciplineId <= 0) {
                setErr('Wybierz dyscyplinę.');
                return;
            }
            if (cycleId <= 0) {
                setErr('Wybierz cykl.');
                return;
            }
            if (!Number.isFinite(evalYear) || evalYear <= 0) {
                setErr('Podaj poprawny rok.');
                return;
            }

            // walidacja roku wg cyklu (żeby nie wysłać out-of-range)
            if (selectedCycle) {
                const min = Number(selectedCycle.yearFrom) || 0;
                const max = Number(selectedCycle.yearTo) || 0;
                if (min > 0 && max > 0 && (evalYear < min || evalYear > max)) {
                    setErr(`Rok ewaluacji musi być w zakresie cyklu: ${min}-${max}.`);
                    return;
                }
            }

            const body = {
                disciplineId,
                evalCycle: cycleId,
                evalYear,
            };

            const res = await authFetch(GET_SLOTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                setErr(msg);
                return;
            }

            const txt = await res.text().catch(() => '');
            const data = (safeJson(txt) ?? null) as DraftViewResponse | null;
            if (!data) {
                setErr('Brak danych (null).');
                return;
            }

            const items = Array.isArray((data as any).items) ? ((data as any).items as DraftItemResponse[]) : [];
            setDraft({ ...data, items });
            showMessage('success', 'Pobrano sloty.');
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function doRemoveFromSlots(item: DraftItemResponse) {
        if (!draft) return;

        const itemType = String(item?.itemType ?? item?.type ?? '').trim();
        const itemId = Number(item?.itemId ?? item?.id ?? 0) || 0;

        if (!itemType || itemId <= 0) {
            showMessage('error', 'Nie da się usunąć: brak itemType lub itemId.');
            return;
        }

        if (!draft.editable) {
            showMessage('error', 'Ten draft nie jest edytowalny (nie można usuwać elementów).');
            return;
        }

        const key = normalizeItemKey(item);
        setRemovingKey(key);

        try {
            const body = {
                disciplineId: Number(draft.disciplineId) || disciplineId || 0,
                itemType,
                itemId,
            };

            const res = await authFetch(REMOVE_FROM_SLOTS_URL, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const msg = await readApiError(res);
                showMessage('error', `Nie udało się usunąć ze slotów:\n${msg}`);
                return;
            }

            // backend może zwrócić nowy draft – jeśli nie, robimy refresh
            const txt = await res.text().catch(() => '');
            const data = (safeJson(txt) ?? null) as DraftViewResponse | null;

            if (data) {
                const items = Array.isArray((data as any).items) ? ((data as any).items as DraftItemResponse[]) : [];
                setDraft({ ...data, items });
            } else {
                await fetchSlots();
            }

            // domknij szczegóły jeśli usunęliśmy oglądany element
            const currentDetailsKey = detailsItem ? normalizeItemKey(detailsItem) : null;
            if (currentDetailsKey && currentDetailsKey === key) {
                setDetailsOpen(false);
                setDetailsItem(null);
            }

            showMessage('success', 'Usunięto ze slotów.');
        } catch (e: any) {
            showMessage('error', 'Błąd removeFromSlots:\n' + String(e?.message ?? e));
        } finally {
            setRemovingKey(null);
        }
    }

    function removeFromSlotsWithConfirm(item: DraftItemResponse) {
        const itemTypeRaw = item?.itemType ?? item?.type ?? '';
        const itemId = Number(item?.itemId ?? item?.id ?? 0) || 0;
        const title = safeStr(item?.title ?? item?.name);

        openConfirm({
            title: 'Potwierdź usunięcie',
            body: `Usunąć z slotów?\n${title}\n${slotItemTypeLabel(itemTypeRaw)} `,
            onConfirm: () => doRemoveFromSlots(item),
        });
    }

    const stats = useMemo(() => {
        if (!draft) return null;
        const max = Number(draft.maxSlots ?? 0) || 0;
        const used = Number(draft.usedSlots ?? 0) || 0;
        const free = Number(draft.freeSlots ?? (max - used)) || 0;
        const pct = max > 0 ? Math.max(0, Math.min(100, (used / max) * 100)) : 0;
        return { max, used, free, pct };
    }, [draft]);

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Sloty</h1>
                <button className={styles.ghostBtn} onClick={fetchSlots} disabled={loading}>
                    Odśwież
                </button>
            </header>

            <InlineNotice msg={uiMsg} />

            {err ? (
                <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                    Błąd: {err}
                </div>
            ) : null}

            <div className={styles.contentRow}>
                {/* LEFT */}
                <div className={styles.leftColumn}>
                    {loading ? (
                        <div className={styles.loading}>Ładowanie…</div>
                    ) : !draft ? (
                        <div className={styles.empty}>Wybierz filtry po prawej i kliknij „Pobierz”.</div>
                    ) : (
                        <>
                            <div className={styles.bigCardFull} style={{ marginBottom: 12 }}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.bigAvatar}>S</div>
                                    <div>
                                        <h3 className={styles.cardTitle}>Podsumowanie</h3>
                                        <div className={styles.muted}>edytowalne: {String(Boolean(draft.editable))}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                    <Chip text={`Max slotów: ${formatNum(draft.maxSlots)}`} kind="muted" />
                                    <Chip text={`Użyte: ${formatNum(draft.usedSlots)}`} kind="worker" />
                                    <Chip text={`Wolne: ${formatNum(draft.freeSlots)}`} kind="muted" />
                                    <Chip text={`Suma pkt: ${formatNum(draft.sumPoints)}`} kind="worker" />
                                    <Chip text={`Suma pkt (recalc): ${formatNum(draft.sumPointsRecalc)}`} kind="muted" />
                                </div>

                                {stats ? (
                                    <div style={{ marginTop: 12 }}>
                                        <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
                                            Wykorzystanie slotów
                                        </div>
                                        <div style={{ height: 12, borderRadius: 999, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                                            <div style={{ width: `${stats.pct}%`, height: '100%', background: 'rgba(99,102,241,0.70)' }} />
                                        </div>
                                        <div className={styles.muted} style={{ marginTop: 6, fontSize: 12 }}>
                                            {formatNum(stats.used)} / {formatNum(stats.max)} ({formatNum(stats.pct)}%)
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {Array.isArray(draft.items) && draft.items.length > 0 ? (
                                <div className={styles.cardsGrid}>
                                    {draft.items.map((it, idx) => {
                                        const itemTypeRaw = it?.itemType ?? it?.type ?? '—';
                                        const itemTypeNorm = normalizeSlotItemType(itemTypeRaw);
                                        const itemTypeUi = slotItemTypeLabel(itemTypeRaw);
                                        const itemId = Number(it?.itemId ?? it?.id ?? 0) || 0;

                                        const key = `${itemTypeNorm}`;
                                        const isRemoving = removingKey === key;

                                        return (
                                            <div key={`${itemTypeNorm}-${itemId}-${idx}`} className={styles.cardSmall}>
                                                <div className={styles.cardTop}>
                                                    <div className={styles.avatarSmall}>{itemTypeUi?.[0] ?? 'I'}</div>
                                                    <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                        <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                            {safeStr(it.title ?? it.name)}
                                                        </div>

                                                        <div className={styles.muted} style={{ marginTop: 6 }}>
                                                            {itemTypeUi}  • Rok: {it.publicationYear ?? '—'}
                                                        </div>

                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                            <Chip text={`Punkty: ${formatNum(it.points)}`} kind="worker" />
                                                            <Chip text={`Slot: ${formatNum(it.slotValue)}`} kind="muted" />
                                                            <Chip text={`Recalc: ${formatNum(it.pointsRecalc)}`} kind="muted" />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                    <div className={styles.badgeRow}>
                                                        <span className={`${styles.badge} ${styles.badgeWorker}`}>IN SLOT</span>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                        <button
                                                            className={styles.infoBtn}
                                                            onClick={() => {
                                                                setDetailsItem(it);
                                                                setDetailsOpen(true);
                                                            }}
                                                            disabled={isRemoving}
                                                        >
                                                            Szczegóły
                                                        </button>

                                                        <button
                                                            className={styles.dangerBtn}
                                                            onClick={() => removeFromSlotsWithConfirm(it)}
                                                            disabled={!draft.editable || isRemoving}
                                                            title={!draft.editable ? 'Draft nie jest edytowalny' : ''}
                                                        >
                                                            {isRemoving ? 'Usuwanie…' : 'Usuń'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className={styles.empty}>Brak elementów w slotach.</div>
                            )}
                        </>
                    )}
                </div>

                {/* RIGHT */}
                <div className={styles.rightColumn}>
                    <div className={styles.actionsCard} style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
                        <h3>Sloty</h3>
                        <p>Wybierz parametry draftu</p>

                        <div style={{ display: 'grid', gap: 10 }}>
                            <SearchSelect
                                label="Moje dyscypliny"
                                value={disciplineId}
                                options={disciplineOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— wybierz dyscyplinę —"
                                onChange={(id) => setDisciplineId(Number(id) || 0)}
                            />

                            <SearchSelect
                                label="Cykl"
                                value={cycleId}
                                options={cycleOptionsSS}
                                disabled={filtersLoading}
                                placeholder="— wybierz cykl —"
                                onChange={(id) => setCycleId(Number(id) || 0)}
                            />

                            <div style={{ display: 'grid', gap: 6 }}>
                <span className={styles.muted} style={{ fontWeight: 800 }}>
                  Rok ewaluacji
                </span>
                                <input
                                    className={styles.searchInput}
                                    type="number"
                                    inputMode="numeric"
                                    value={String(evalYear)}
                                    min={evalYearMin > 0 ? evalYearMin : undefined}
                                    max={evalYearMax > 0 ? evalYearMax : undefined}
                                    onChange={(e) => setEvalYear(toIntOr0(e.target.value))}
                                    placeholder={selectedCycle ? `${selectedCycle.yearFrom}-${selectedCycle.yearTo}` : 'np. 2025'}
                                />

                                {selectedCycle ? (
                                    <div className={styles.muted} style={{ fontSize: 12 }}>
                                        Dozwolony zakres: <b>{selectedCycle.yearFrom}-{selectedCycle.yearTo}</b>
                                    </div>
                                ) : null}
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className={styles.primaryBtn} onClick={fetchSlots} disabled={loading} style={{ flex: '1 1 auto' }}>
                                    Pobierz
                                </button>
                                <button
                                    className={styles.ghostBtn}
                                    onClick={() => {
                                        setDisciplineId(0);
                                        setCycleId(0);
                                        setEvalYear(currentYear);
                                        setDraft(null);
                                        setErr(null);
                                        setUiMsg(null);
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

            {/* DETAILS MODAL */}
            <Modal
                open={detailsOpen}
                title="Szczegóły elementu slotu"
                onClose={() => {
                    setDetailsOpen(false);
                    setDetailsItem(null);
                }}
            >
                {!detailsItem ? (
                    <div className={styles.empty}>Brak danych.</div>
                ) : (
                    <div style={{ padding: 14 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                            <Chip text={`Typ: ${slotItemTypeLabel(detailsItem.itemType ?? detailsItem.type)}`} kind="muted" />
                            <Chip text={`Rok: ${formatNum(detailsItem.publicationYear)}`} kind="muted" />
                        </div>

                        <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
                            Tytuł
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>{safeStr(detailsItem.title ?? detailsItem.name)}</div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <Chip text={`Punkty: ${formatNum(detailsItem.points)}`} kind="worker" />
                            <Chip text={`Slot: ${formatNum(detailsItem.slotValue)}`} kind="muted" />
                            <Chip text={`Recalc: ${formatNum(detailsItem.pointsRecalc)}`} kind="muted" />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                            <button
                                className={styles.dangerBtn}
                                onClick={() => removeFromSlotsWithConfirm(detailsItem)}
                                disabled={!draft?.editable || removingKey === normalizeItemKey(detailsItem)}
                                title={!draft?.editable ? 'Draft nie jest edytowalny' : ''}
                            >
                                {removingKey === normalizeItemKey(detailsItem) ? 'Usuwanie…' : 'Usuń ze slotów'}
                            </button>
                            <button className={styles.ghostBtn} onClick={() => setDetailsOpen(false)} disabled={confirmBusy}>
                                Zamknij
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* CONFIRM MODAL */}
            <ConfirmModal
                open={confirmOpen}
                title={confirmTitle}
                body={confirmBody}
                confirmText="Usuń"
                cancelText="Anuluj"
                busy={confirmBusy}
                onClose={() => {
                    if (confirmBusy) return;
                    setConfirmOpen(false);
                    confirmActionRef.current = null;
                }}
                onConfirm={runConfirm}
            />
        </div>
    );
}

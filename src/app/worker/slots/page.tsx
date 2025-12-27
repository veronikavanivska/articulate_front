// // src/app/worker/slots/page.tsx
// 'use client';
//
// import React, { useEffect, useMemo, useState } from 'react';
// import styles from '@/app/admin/profiles/styles.module.css';
// import { useAuth } from '@/context/AuthContext';
// import { authFetch } from '@/lib/authFetch';
// import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';
//
// // ===== SLOTS (proxy -> API Gateway) =====
// const GET_SLOTS_URL = '/api/slots/getSlots'; // POST
// const REMOVE_FROM_SLOTS_URL = '/api/slots/removeFromSlots'; // DELETE (z JSON body)
//
// // ===== DICTS (admin) =====
// const LIST_DISCIPLINES_URL = '/api/article/admin/listDisciplines';
// const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';
//
// // ===================== TYPES =====================
// type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };
// type RefItem = { id: number; name: string };
// type CycleItem = { id: number; yearFrom: number; yearTo: number; name: string; isActive?: boolean; active?: boolean };
//
// type DraftItemResponse = {
//     itemType?: string | null; // np. ARTICLE / MONOGRAPH / CHAPTER
//     itemId?: number | null;
//     title?: string | null;
//
//     // różne backendy czasem inaczej nazywają
//     points?: number | null;
//     meinPoints?: number | null;
//     pointsRecalc?: number | null;
//     sumPoints?: number | null;
//
//     // fallback pola
//     id?: number | null;
//
//     [k: string]: any;
// };
//
// type DraftViewResponse = {
//     draftId: number;
//     userId: number;
//     disciplineId: number;
//     cycleId: number;
//     evalYear: number;
//
//     editable: boolean;
//     maxSlots: number;
//     usedSlots: number;
//     freeSlots: number;
//
//     sumPoints: number;
//     sumPointsRecalc: number;
//
//     items: DraftItemResponse[];
// };
//
// // ===================== HELPERS =====================
// function safeJson(text: string) {
//     try {
//         return text ? JSON.parse(text) : null;
//     } catch {
//         return null;
//     }
// }
//
// function toIntOr0(v: any): number {
//     const n = Number(v);
//     return Number.isFinite(n) ? Math.trunc(n) : 0;
// }
//
// function safeStr(v: any): string {
//     const s = String(v ?? '').trim();
//     return s ? s : '—';
// }
//
// function formatNum(v: any): string {
//     const n = Number(v);
//     if (!Number.isFinite(n)) return '0';
//     const isInt = Math.abs(n - Math.round(n)) < 1e-9;
//     return isInt ? String(Math.round(n)) : String(n);
// }
//
// function cycleLabel(c?: CycleItem | null) {
//     if (!c) return '—';
//     const yf = c.yearFrom ?? '';
//     const yt = c.yearTo ?? '';
//     const nm = c.name ? String(c.name) : '';
//     return nm ? `${nm} (${yf}-${yt})` : `${yf}-${yt}`;
// }
//
// // UI badge (bazuje na Twoim CSS)
// function Chip(props: { text: string; kind?: 'muted' | 'worker' | 'danger' }) {
//     const kind = props.kind ?? 'muted';
//     const cls = kind === 'worker' ? styles.badgeWorker : kind === 'danger' ? styles.badgeAdmin : styles.badgeMuted;
//     return <span className={`${styles.badge} ${cls}`}>{props.text}</span>;
// }
//
// // ===================== UI: MODAL (scrollowalny) =====================
// function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
//     if (!props.open) return null;
//
//     // ważne: scroll jest na BODY modala, nie na overlay
//     return (
//         <div className={styles.modalOverlay} onMouseDown={props.onClose}>
//             <div
//                 className={styles.modalCard}
//                 onMouseDown={(e) => e.stopPropagation()}
//                 style={{
//                     width: 'min(1100px, calc(100vw - 32px))',
//                     maxHeight: 'calc(100vh - 32px)',
//                     overflow: 'hidden',
//                 }}
//             >
//                 <div className={styles.modalHeader}>
//                     <h3 className={styles.modalTitle}>{props.title}</h3>
//                     <button className={styles.ghostBtn} onClick={props.onClose}>
//                         Zamknij
//                     </button>
//                 </div>
//
//                 <div
//                     style={{
//                         maxHeight: 'calc(100vh - 32px - 70px)', // 70px ~ header
//                         overflowY: 'auto',
//                         paddingRight: 6,
//                     }}
//                 >
//                     {props.children}
//                 </div>
//             </div>
//         </div>
//     );
// }
//
// // ===================== PAGE =====================
// export default function WorkerSlotsPage() {
//     const { initialized } = useAuth();
//
//     // DICTS
//     const [filtersLoading, setFiltersLoading] = useState(false);
//     const [disciplines, setDisciplines] = useState<RefItem[]>([]);
//     const [cycles, setCycles] = useState<CycleItem[]>([]);
//
//     // FILTERS
//     const currentYear = useMemo(() => new Date().getFullYear(), []);
//     const [disciplineId, setDisciplineId] = useState<number>(0);
//     const [cycleId, setCycleId] = useState<number>(0);
//     const [evalYear, setEvalYear] = useState<number>(currentYear);
//
//     // DATA
//     const [loading, setLoading] = useState(false);
//     const [err, setErr] = useState<string | null>(null);
//     const [draft, setDraft] = useState<DraftViewResponse | null>(null);
//
//     // DETAILS MODAL
//     const [detailsOpen, setDetailsOpen] = useState(false);
//     const [detailsItem, setDetailsItem] = useState<DraftItemResponse | null>(null);
//
//     useEffect(() => {
//         if (!initialized) return;
//         void loadDicts();
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [initialized]);
//
//     async function loadDicts() {
//         setFiltersLoading(true);
//         try {
//             const headers = { 'Content-Type': 'application/json' };
//
//             const [dRes, cRes] = await Promise.all([
//                 authFetch(LIST_DISCIPLINES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'ASC' }) } as RequestInit),
//                 authFetch(LIST_CYCLES_URL, { method: 'POST', headers, body: JSON.stringify({ page: 0, size: 200, sortDir: 'DESC' }) } as RequestInit),
//             ]);
//
//             const [dTxt, cTxt] = await Promise.all([dRes.text().catch(() => ''), cRes.text().catch(() => '')]);
//
//             setDisciplines(dRes.ok ? ((safeJson(dTxt)?.item ?? safeJson(dTxt)?.items ?? []) as RefItem[]) : []);
//             setCycles(cRes.ok ? ((safeJson(cTxt)?.item ?? safeJson(cTxt)?.items ?? []) as CycleItem[]) : []);
//         } finally {
//             setFiltersLoading(false);
//         }
//     }
//
//     const disciplineOptionsSS: SearchSelectOption[] = useMemo(
//         () => [{ id: 0, label: '— wybierz dyscyplinę —' }, ...disciplines.map((d) => ({ id: d.id, label: d.name }))],
//         [disciplines]
//     );
//
//     const cycleOptionsSS: SearchSelectOption[] = useMemo(
//         () => [{ id: 0, label: '— wybierz cykl —' }, ...cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))],
//         [cycles]
//     );
//
//     async function fetchSlots() {
//         setLoading(true);
//         setErr(null);
//         setDraft(null);
//
//         try {
//             if (disciplineId <= 0) {
//                 setErr('Wybierz dyscyplinę.');
//                 return;
//             }
//             if (cycleId <= 0) {
//                 setErr('Wybierz cykl.');
//                 return;
//             }
//             if (!Number.isFinite(evalYear) || evalYear <= 0) {
//                 setErr('Podaj poprawny rok.');
//                 return;
//             }
//
//             const body = {
//                 disciplineId,
//                 evalCycle: cycleId,
//                 evalYear,
//             };
//
//             const res = await authFetch(GET_SLOTS_URL, {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(body),
//             } as RequestInit);
//
//             const txt = await res.text().catch(() => '');
//             if (!res.ok) {
//                 setErr(txt || `HTTP ${res.status}`);
//                 return;
//             }
//
//             const data = (safeJson(txt) ?? null) as DraftViewResponse | null;
//             if (!data) {
//                 setErr('Brak danych (null).');
//                 return;
//             }
//
//             // defensive: items może być null/undefined
//             const items = Array.isArray((data as any).items) ? (data as any).items : [];
//             setDraft({ ...data, items });
//         } catch (e: any) {
//             setErr(String(e?.message ?? e));
//         } finally {
//             setLoading(false);
//         }
//     }
//
//     async function removeFromSlots(item: DraftItemResponse) {
//         if (!draft) return;
//
//         const itemType = String(item?.itemType ?? item?.type ?? '').trim();
//         const itemId = Number(item?.itemId ?? item?.id ?? 0) || 0;
//
//         if (!itemType || itemId <= 0) {
//             alert('Nie da się usunąć: brak itemType lub itemId.');
//             return;
//         }
//
//         if (!confirm(`Usunąć z slotów: ${itemType} #${itemId}?`)) return;
//
//         try {
//             const body = {
//                 disciplineId: Number(draft.disciplineId) || disciplineId || 0,
//                 itemType,
//                 itemId,
//             };
//
//             const res = await authFetch(REMOVE_FROM_SLOTS_URL, {
//                 method: 'DELETE',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(body),
//             } as RequestInit);
//
//             const txt = await res.text().catch(() => '');
//             if (!res.ok) {
//                 alert('Błąd removeFromSlots:\n' + (txt || `HTTP ${res.status}`));
//                 return;
//             }
//
//             const data = (safeJson(txt) ?? null) as DraftViewResponse | null;
//             if (data) {
//                 const items = Array.isArray((data as any).items) ? (data as any).items : [];
//                 setDraft({ ...data, items });
//             } else {
//                 // fallback: odśwież
//                 await fetchSlots();
//             }
//         } catch (e: any) {
//             alert('Błąd removeFromSlots:\n' + String(e?.message ?? e));
//         }
//     }
//
//     const stats = useMemo(() => {
//         if (!draft) return null;
//         const max = Number(draft.maxSlots ?? 0) || 0;
//         const used = Number(draft.usedSlots ?? 0) || 0;
//         const free = Number(draft.freeSlots ?? (max - used)) || 0;
//         const pct = max > 0 ? Math.max(0, Math.min(100, (used / max) * 100)) : 0;
//         return { max, used, free, pct };
//     }, [draft]);
//
//     if (!initialized) return <div className={styles.page}>Ładowanie…</div>;
//
//     return (
//         <div className={styles.page}>
//             <header className={styles.headerRow}>
//                 <h1 className={styles.title}>Sloty — draft</h1>
//                 <button className={styles.ghostBtn} onClick={fetchSlots} disabled={loading}>
//                     Odśwież
//                 </button>
//             </header>
//
//             {err ? (
//                 <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
//                     Błąd: {err}
//                 </div>
//             ) : null}
//
//             <div className={styles.contentRow}>
//                 {/* LEFT: DATA */}
//                 <div className={styles.leftColumn}>
//                     {loading ? (
//                         <div className={styles.loading}>Ładowanie…</div>
//                     ) : !draft ? (
//                         <div className={styles.empty}>Wybierz filtry po prawej i kliknij „Pobierz”.</div>
//                     ) : (
//                         <>
//                             {/* SUMMARY */}
//                             <div className={styles.bigCardFull} style={{ marginBottom: 12 }}>
//                                 <div className={styles.cardHeader}>
//                                     <div className={styles.bigAvatar}>S</div>
//                                     <div>
//                                         <h3 className={styles.cardTitle}>Podsumowanie</h3>
//                                         <div className={styles.muted}>
//                                             draftId: {draft.draftId} • editable: {String(Boolean(draft.editable))}
//                                         </div>
//                                     </div>
//                                 </div>
//
//                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
//                                     <Chip text={`Max slotów: ${formatNum(draft.maxSlots)}`} kind="muted" />
//                                     <Chip text={`Użyte: ${formatNum(draft.usedSlots)}`} kind="worker" />
//                                     <Chip text={`Wolne: ${formatNum(draft.freeSlots)}`} kind="muted" />
//                                     <Chip text={`Suma pkt: ${formatNum(draft.sumPoints)}`} kind="worker" />
//                                     <Chip text={`Suma pkt (recalc): ${formatNum(draft.sumPointsRecalc)}`} kind="muted" />
//                                 </div>
//
//                                 {stats ? (
//                                     <div style={{ marginTop: 12 }}>
//                                         <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
//                                             Wykorzystanie slotów
//                                         </div>
//                                         <div style={{ height: 12, borderRadius: 999, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
//                                             <div
//                                                 style={{
//                                                     width: `${stats.pct}%`,
//                                                     height: '100%',
//                                                     background: 'rgba(99,102,241,0.70)',
//                                                 }}
//                                             />
//                                         </div>
//                                         <div className={styles.muted} style={{ marginTop: 6, fontSize: 12 }}>
//                                             {formatNum(stats.used)} / {formatNum(stats.max)} ({formatNum(stats.pct)}%)
//                                         </div>
//                                     </div>
//                                 ) : null}
//                             </div>
//
//                             {/* ITEMS */}
//                             {Array.isArray(draft.items) && draft.items.length > 0 ? (
//                                 <div className={styles.cardsGrid}>
//                                     {draft.items.map((it, idx) => {
//                                         const itemType = String(it?.itemType ?? it?.type ?? '—');
//                                         const itemId = Number(it?.itemId ?? it?.id ?? 0) || 0;
//
//                                         const pts =
//                                             it?.points ??
//                                             it?.meinPoints ??
//                                             it?.sumPoints ??
//                                             null;
//
//                                         const ptsRecalc = it?.pointsRecalc ?? null;
//
//                                         const title = it?.title ?? it?.name ?? it?.monograficTitle ?? it?.monograficChapterTitle ?? null;
//
//                                         return (
//                                             <div key={`${itemType}-${itemId}-${idx}`} className={styles.cardSmall}>
//                                                 <div className={styles.cardTop}>
//                                                     <div className={styles.avatarSmall}>{itemType?.[0] ?? 'I'}</div>
//                                                     <div className={styles.cardMeta} style={{ minWidth: 0 }}>
//                                                         <div className={styles.name} style={{ lineHeight: 1.2 }}>
//                                                             {safeStr(title)}
//                                                         </div>
//
//                                                         <div className={styles.muted} style={{ marginTop: 6 }}>
//                                                             {itemType} {itemId ? `#${itemId}` : ''}
//                                                         </div>
//
//                                                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
//                                                             <Chip text={`Punkty: ${pts == null ? '—' : formatNum(pts)}`} kind="worker" />
//                                                             <Chip text={`Recalc: ${ptsRecalc == null ? '—' : formatNum(ptsRecalc)}`} kind="muted" />
//                                                         </div>
//                                                     </div>
//                                                 </div>
//
//                                                 <div className={styles.cardBottom} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
//                                                     <div className={styles.badgeRow}>
//                                                         <span className={`${styles.badge} ${styles.badgeWorker}`}>IN SLOT</span>
//                                                     </div>
//
//                                                     <div style={{ display: 'flex', gap: 8 }}>
//                                                         <button
//                                                             className={styles.infoBtn}
//                                                             onClick={() => {
//                                                                 setDetailsItem(it);
//                                                                 setDetailsOpen(true);
//                                                             }}
//                                                         >
//                                                             Szczegóły
//                                                         </button>
//                                                         <button className={styles.dangerBtn} onClick={() => removeFromSlots(it)} disabled={!draft.editable}>
//                                                             Usuń
//                                                         </button>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         );
//                                     })}
//                                 </div>
//                             ) : (
//                                 <div className={styles.empty}>Brak elementów w slotach.</div>
//                             )}
//                         </>
//                     )}
//                 </div>
//
//                 {/* RIGHT: FILTERS */}
//                 <div className={styles.rightColumn}>
//                     <div className={styles.actionsCard} style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
//                         <h3>Sloty</h3>
//                         <p>Wybierz parametry draftu</p>
//
//                         <div style={{ display: 'grid', gap: 10 }}>
//                             <SearchSelect
//                                 label="Dyscyplina"
//                                 value={disciplineId}
//                                 options={disciplineOptionsSS}
//                                 disabled={filtersLoading}
//                                 placeholder="— wybierz dyscyplinę —"
//                                 onChange={(id) => setDisciplineId(Number(id) || 0)}
//                             />
//
//                             <SearchSelect
//                                 label="Cykl"
//                                 value={cycleId}
//                                 options={cycleOptionsSS}
//                                 disabled={filtersLoading}
//                                 placeholder="— wybierz cykl —"
//                                 onChange={(id) => setCycleId(Number(id) || 0)}
//                             />
//
//                             <div style={{ display: 'grid', gap: 6 }}>
//                 <span className={styles.muted} style={{ fontWeight: 800 }}>
//                   Rok ewaluacji
//                 </span>
//                                 <input
//                                     className={styles.searchInput}
//                                     type="number"
//                                     inputMode="numeric"
//                                     value={String(evalYear)}
//                                     onChange={(e) => setEvalYear(toIntOr0(e.target.value))}
//                                     placeholder="np. 2025"
//                                 />
//                             </div>
//
//                             <div style={{ display: 'flex', gap: 10 }}>
//                                 <button className={styles.primaryBtn} onClick={fetchSlots} disabled={loading} style={{ flex: '1 1 auto' }}>
//                                     Pobierz
//                                 </button>
//                                 <button
//                                     className={styles.ghostBtn}
//                                     onClick={() => {
//                                         setDisciplineId(0);
//                                         setCycleId(0);
//                                         setEvalYear(currentYear);
//                                         setDraft(null);
//                                         setErr(null);
//                                     }}
//                                     disabled={loading}
//                                     style={{ whiteSpace: 'nowrap' }}
//                                 >
//                                     Reset
//                                 </button>
//                             </div>
//
//                             <div className={styles.muted} style={{ fontSize: 12 }}>
//                                 Endpoint: <b>/api/slots/getSlots</b> (POST).
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//
//             {/* DETAILS MODAL */}
//             <Modal
//                 open={detailsOpen}
//                 title="Szczegóły elementu slotu"
//                 onClose={() => {
//                     setDetailsOpen(false);
//                     setDetailsItem(null);
//                 }}
//             >
//                 {!detailsItem ? (
//                     <div className={styles.empty}>Brak danych.</div>
//                 ) : (
//                     <div style={{ padding: 14 }}>
//                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
//                             <Chip text={`Typ: ${safeStr(detailsItem.itemType ?? detailsItem.type)}`} kind="muted" />
//                             <Chip text={`ID: ${formatNum(detailsItem.itemId ?? detailsItem.id)}`} kind="muted" />
//                         </div>
//
//                         <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
//                             Tytuł
//                         </div>
//                         <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
//                             {safeStr(detailsItem.title ?? detailsItem.name ?? detailsItem.monograficTitle ?? detailsItem.monograficChapterTitle)}
//                         </div>
//
//                         <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
//                             Dane (debug)
//                         </div>
//                         <pre
//                             style={{
//                                 whiteSpace: 'pre-wrap',
//                                 background: '#fff',
//                                 border: '1px solid var(--border)',
//                                 borderRadius: 12,
//                                 padding: 12,
//                                 fontSize: 12,
//                                 overflow: 'auto',
//                             }}
//                         >
// {JSON.stringify(detailsItem, null, 2)}
//             </pre>
//
//                         <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
//                             <button
//                                 className={styles.dangerBtn}
//                                 onClick={() => {
//                                     if (detailsItem) removeFromSlots(detailsItem);
//                                 }}
//                                 disabled={!draft?.editable}
//                             >
//                                 Usuń ze slotów
//                             </button>
//                             <button className={styles.ghostBtn} onClick={() => setDetailsOpen(false)}>
//                                 Zamknij
//                             </button>
//                         </div>
//                     </div>
//                 )}
//             </Modal>
//         </div>
//     );
// }
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect';

// ===== SLOTS (proxy -> API Gateway) =====
const GET_SLOTS_URL = '/api/slots/getSlots'; // POST
const REMOVE_FROM_SLOTS_URL = '/api/slots/removeFromSlots'; // DELETE (JSON body)

// ===== WORKER DISCIPLINES (Twoje dyscypliny) =====
// Uwaga: jeśli u Ciebie proxy/route ma inną bazę (np. /api/profile/...),
// zmień tylko ten URL.
const LIST_MY_DISCIPLINES_URL = '/api/profile/me/disciplines'; // GET

// ===== CYCLES (admin słownik) =====
const LIST_CYCLES_URL = '/api/article/admin/listEvalCycles';

// ===================== TYPES =====================
type RefItem = { id: number; name: string };
type CycleItem = { id: number; yearFrom: number; yearTo: number; name: string; isActive?: boolean; active?: boolean };

// zgodnie z backendem:
type SlotItemType = 'ARTICLE' | 'MONOGRAPH' | 'CHAPTER' | string;

type DraftItemResponse = {
    itemType: SlotItemType;
    itemId: number;

    publicationYear: number;
    title: string;

    points: number;
    slotValue: number;
    pointsRecalc: number;
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

// odpowiedź z /me/disciplines
type ListWorkerDisciplineResponse = {
    discipline?: RefItem[]; // zgodnie z Twoim setDiscipline(...)
    disciplines?: RefItem[]; // fallback gdyby nazwa była inna
    apiResponse?: { code?: any; message?: string };
};

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

function Chip(props: { text: string; kind?: 'muted' | 'worker' | 'danger' }) {
    const kind = props.kind ?? 'muted';
    const cls = kind === 'worker' ? styles.badgeWorker : kind === 'danger' ? styles.badgeAdmin : styles.badgeMuted;
    return <span className={`${styles.badge} ${cls}`}>{props.text}</span>;
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

    // DETAILS MODAL
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [detailsItem, setDetailsItem] = useState<DraftItemResponse | null>(null);

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
                const arr = (dData?.discipline ?? dData?.disciplines ?? []) as RefItem[];
                setDisciplines(Array.isArray(arr) ? arr : []);
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

    async function fetchSlots() {
        setLoading(true);
        setErr(null);
        setDraft(null);

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

            const txt = await res.text().catch(() => '');
            if (!res.ok) {
                setErr(txt || `HTTP ${res.status}`);
                return;
            }

            const data = (safeJson(txt) ?? null) as DraftViewResponse | null;
            if (!data) {
                setErr('Brak danych (null).');
                return;
            }

            const items = Array.isArray((data as any).items) ? (data as any).items : [];
            setDraft({ ...data, items });
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function removeFromSlots(item: DraftItemResponse) {
        if (!draft) return;

        const itemType = String(item?.itemType ?? '').trim();
        const itemId = Number(item?.itemId ?? 0) || 0;

        if (!itemType || itemId <= 0) {
            alert('Nie da się usunąć: brak itemType lub itemId.');
            return;
        }

        if (!confirm(`Usunąć z slotów: ${itemType} #${itemId}?`)) return;

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

            const txt = await res.text().catch(() => '');
            if (!res.ok) {
                alert('Błąd removeFromSlots:\n' + (txt || `HTTP ${res.status}`));
                return;
            }

            const data = (safeJson(txt) ?? null) as DraftViewResponse | null;
            if (data) {
                const items = Array.isArray((data as any).items) ? (data as any).items : [];
                setDraft({ ...data, items });
            } else {
                await fetchSlots();
            }
        } catch (e: any) {
            alert('Błąd removeFromSlots:\n' + String(e?.message ?? e));
        }
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
                <h1 className={styles.title}>Sloty — draft</h1>
                <button className={styles.ghostBtn} onClick={fetchSlots} disabled={loading}>
                    Odśwież
                </button>
            </header>

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
                                        <div className={styles.muted}>
                                            edytowalne: {String(Boolean(draft.editable))}
                                        </div>
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
                                        const itemType = String(it.itemType ?? '—');
                                        const itemId = Number(it.itemId ?? 0) || 0;

                                        return (
                                            <div key={`${itemType}-${itemId}-${idx}`} className={styles.cardSmall}>
                                                <div className={styles.cardTop}>
                                                    <div className={styles.avatarSmall}>{itemType?.[0] ?? 'I'}</div>
                                                    <div className={styles.cardMeta} style={{ minWidth: 0 }}>
                                                        <div className={styles.name} style={{ lineHeight: 1.2 }}>
                                                            {safeStr(it.title)}
                                                        </div>

                                                        <div className={styles.muted} style={{ marginTop: 6 }}>
                                                            {itemType} #{itemId} • Rok: {it.publicationYear ?? '—'}
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

                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button
                                                            className={styles.infoBtn}
                                                            onClick={() => {
                                                                setDetailsItem(it);
                                                                setDetailsOpen(true);
                                                            }}
                                                        >
                                                            Szczegóły
                                                        </button>
                                                        <button className={styles.dangerBtn} onClick={() => removeFromSlots(it)} disabled={!draft.editable}>
                                                            Usuń
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
                                    onChange={(e) => setEvalYear(toIntOr0(e.target.value))}
                                    placeholder="np. 2025"
                                />
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
                                    }}
                                    disabled={loading}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    Reset
                                </button>
                            </div>

                            <div className={styles.muted} style={{ fontSize: 12 }}>
                                Dyscypliny: <b>/me/disciplines</b> • Sloty: <b>/api/slots/getSlots</b> (POST).
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
                            <Chip text={`Typ: ${safeStr(detailsItem.itemType)}`} kind="muted" />
                            {/*<Chip text={`ID: ${formatNum(detailsItem.itemId)}`} kind="muted" />*/}
                            <Chip text={`Rok: ${formatNum(detailsItem.publicationYear)}`} kind="muted" />
                        </div>

                        <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 6 }}>
                            Tytuł
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>{safeStr(detailsItem.title)}</div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <Chip text={`Punkty: ${formatNum(detailsItem.points)}`} kind="worker" />
                            <Chip text={`Slot: ${formatNum(detailsItem.slotValue)}`} kind="muted" />
                            <Chip text={`Recalc: ${formatNum(detailsItem.pointsRecalc)}`} kind="muted" />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                            <button className={styles.dangerBtn} onClick={() => removeFromSlots(detailsItem)} disabled={!draft?.editable}>
                                Usuń ze slotów
                            </button>
                            <button className={styles.ghostBtn} onClick={() => setDetailsOpen(false)}>
                                Zamknij
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

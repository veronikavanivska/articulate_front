'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';
import { authFetch } from '@/lib/authFetch';

export type CoauthorInput = {
    userId: number;
    fullName: string;
    unitName?: string | null;
};

type Props = {
    value: CoauthorInput[];
    onChange: (next: CoauthorInput[]) => void;
    label?: string;
};


type ListProfileItem = {
    id: number;
    fullname?: string | null;
    fullName?: string | null;

    workerUnitName?: string | null;
    adminUnitName?: string | null;

    DegreeTitle?: string | null;   // uwaga: backend ma wielką literę
    degreeTitle?: string | null;   // fallback gdyby Jackson zmienił nazwę
};

function safeStr(v: any) {
    const s = String(v ?? '').trim();
    return s ? s : '';
}

function pickUnit(p: ListProfileItem): string {
    return safeStr(p.workerUnitName) || safeStr(p.adminUnitName);
}

function pickName(p: ListProfileItem): string {
    return safeStr(p.fullname) || safeStr((p as any).fullName) || safeStr(p.fullName);
}

function pickDegree(p: ListProfileItem): string {
    return safeStr((p as any).DegreeTitle) || safeStr((p as any).degreeTitle);
}

function labelForProfile(p: ListProfileItem): string {
    const name = pickName(p);
    const unit = pickUnit(p);
    const deg = pickDegree(p);

    // wymóg: imię+nazwisko oraz unitname
    // degree tylko jako dopisek
    const left = deg ? `${name} (${deg})` : name;
    return unit ? `${left} — ${unit}` : left;
}

function normalizeIncomingValue(v: CoauthorInput[] | null | undefined): CoauthorInput[] {
    const arr = Array.isArray(v) ? v : [];
    return arr
        .map((c) => ({
            userId: Number(c?.userId ?? 0) || 0,
            fullName: String(c?.fullName ?? '').trim(),
            unitName: c?.unitName ?? null,
        }))
        .filter((c) => c.fullName.length > 0);
}

export function CoauthorsPicker(props: {
    value: CoauthorInput[];
    onChange: (next: CoauthorInput[]) => void;
    label?: string;
}) {
    const label = props.label ?? 'Coautorzy (szukaj po fullName; userId=0 = inna uczelnia)';

    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<ListProfileItem[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const val = useMemo(() => normalizeIncomingValue(props.value), [props.value]);

    // debounce
    const tRef = useRef<any>(null);
    useEffect(() => {
        if (tRef.current) clearTimeout(tRef.current);

        const query = q.trim();
        if (query.length < 2) {
            setItems([]);
            setErr(null);
            setLoading(false);
            return;
        }

        tRef.current = setTimeout(() => {
            void doSearch(query);
        }, 250);

        return () => {
            if (tRef.current) clearTimeout(tRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    async function doSearch(query: string) {
        setLoading(true);
        setErr(null);
        try {
            const res = await authFetch('/api/profile/listProfiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: query, page: 0, size: 20 }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;

            // różne możliwe nazwy listy
            const raw =
                data?.items ??
                data?.item ??
                data?.profiles ??
                data?.list ??
                data ??
                [];

            const arr: ListProfileItem[] = Array.isArray(raw) ? raw : [];
            setItems(arr);
        } catch (e: any) {
            setItems([]);
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    function addFromProfile(p: ListProfileItem) {
        const userId = Number(p?.id ?? 0) || 0;
        const fullName = pickName(p).trim();
        if (!fullName) return;

        const unitName = pickUnit(p) || null;

        // nie duplikuj
        if (val.some((x) => Number(x.userId) === userId && x.fullName.toLowerCase() === fullName.toLowerCase())) return;

        props.onChange([...val, { userId, fullName, unitName }]);
    }

    function addManual() {
        const name = q.trim();
        if (!name) return;

        // userId=0 = inna uczelnia
        props.onChange([...val, { userId: 0, fullName: name, unitName: 'inna uczelnia' }]);
        setQ('');
        setItems([]);
        setErr(null);
    }

    function removeAt(idx: number) {
        const next = val.slice();
        next.splice(idx, 1);
        props.onChange(next);
    }

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div className={styles.muted} style={{ fontWeight: 800 }}>
                {label}
            </div>

            {/* wybrane */}
            {val.length === 0 ? (
                <div className={styles.muted}>Brak coautorów</div>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {val.map((c, idx) => {
                        const unit = safeStr(c.unitName);
                        const tag = unit ? `${c.fullName} — ${unit}` : c.userId === 0 ? `${c.fullName} — inna uczelnia` : c.fullName;

                        return (
                            <button
                                key={`${idx}-${c.userId}-${c.fullName}`}
                                type="button"
                                className={`${styles.badge} ${styles.badgeMuted}`}
                                onClick={() => removeAt(idx)}
                                title="Kliknij, aby usunąć"
                                style={{ cursor: 'pointer' }}
                            >
                                {tag} ✕
                            </button>
                        );
                    })}
                </div>
            )}

            {/* search + manual */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    className={styles.searchInput}
                    placeholder="Wpisz min. 2 znaki (np. nazwisko)…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{ flex: '1 1 320px', minWidth: 260 }}
                />
                <button type="button" className={styles.ghostBtn} onClick={addManual} disabled={!q.trim()}>
                    Dodaj ręcznie
                </button>
            </div>

            {/* wyniki */}
            {loading ? <div className={styles.muted}>Szukam…</div> : null}
            {err ? (
                <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                    Błąd: {err}
                </div>
            ) : null}

            {!loading && !err && q.trim().length >= 2 ? (
                items.length === 0 ? (
                    <div className={styles.muted}>Brak wyników. (Możesz dodać ręcznie — userId=0)</div>
                ) : (
                    <div
                        style={{
                            border: '1px solid var(--border)',
                            borderRadius: 14,
                            padding: 10,
                            background: '#fff',
                            display: 'grid',
                            gap: 8,
                        }}
                    >
                        {items.slice(0, 20).map((p) => {
                            const id = Number(p?.id ?? 0) || 0;
                            const text = labelForProfile(p);
                            return (
                                <div
                                    key={id || Math.random()}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        border: '1px solid rgba(15,23,42,0.08)',
                                        borderRadius: 12,
                                        background: 'linear-gradient(180deg,#fff,#fcfdff)',
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {text || `Użytkownik #${id}`}
                                        </div>
                                    </div>

                                    <button type="button" className={styles.primaryBtn} onClick={() => addFromProfile(p)}>
                                        Dodaj
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : null}
        </div>
    );
}
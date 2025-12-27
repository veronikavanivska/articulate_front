'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/app/admin/profiles/styles.module.css';

export type SearchSelectOption = { id: number; label: string };

function norm(v: any) {
    return String(v ?? '').toLowerCase().trim();
}

export function SearchSelect(props: {
    label?: string;               // opcjonalne (np. w kvGrid label masz osobno)
    value: number;
    options: SearchSelectOption[];
    disabled?: boolean;
    placeholder?: string;         // używane gdy value=0
    onChange: (id: number) => void;
    menuTopPx?: number;           // opcjonalnie: ręczny offset dropdownu
}) {
    const { label, value, options, disabled, placeholder, onChange } = props;

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');

    const selectedLabel = useMemo(() => {
        const found = options.find((o) => o.id === value);
        return found?.label ?? (value === 0 ? placeholder ?? '—' : '—');
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

    // jak disabled -> zamknij
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    const menuTop = props.menuTopPx ?? (label ? 62 : 44);

    return (
        <div ref={wrapRef} style={{ display: 'grid', gap: 6, position: 'relative' }}>
            {label ? (
                <span className={styles.muted} style={{ fontWeight: 800 }}>
          {label}
        </span>
            ) : null}

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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel}
        </span>
                <span className={styles.muted} style={{ fontWeight: 900 }}>▾</span>
            </button>

            {open && !disabled && (
                <div
                    style={{
                        position: 'absolute',
                        top: menuTop,
                        left: 0,
                        right: 0,
                        zIndex: 50,
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

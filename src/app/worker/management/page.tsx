'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

function CardLink(props: { href: string; title: string; desc: string; gradient: string }) {
    return (
        <Link href={props.href} style={{ textDecoration: 'none' }}>
            <div
                style={{
                    width: 320,
                    borderRadius: 16,
                    padding: 14,
                    background: '#ffffff',
                    border: '1px solid rgba(15, 23, 42, 0.10)',
                    boxShadow: '0 14px 40px rgba(15, 23, 42, 0.08)',
                    cursor: 'pointer',
                    transition: 'transform 120ms ease, box-shadow 120ms ease',
                }}
            >
                <div
                    style={{
                        borderRadius: 14,
                        padding: '10px 12px',
                        color: '#fff',
                        fontWeight: 900,
                        background: props.gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        letterSpacing: 0.2,
                    }}
                >
                    <span>{props.title}</span>
                    <span style={{ opacity: 0.9 }}>→</span>
                </div>

                <div style={{ marginTop: 10, color: '#334155', fontWeight: 700, lineHeight: 1.35 }}>
                    {props.desc}
                </div>

                <div style={{ marginTop: 12, color: '#64748b', fontSize: 12, fontWeight: 800 }}>
                    Otwórz moduł
                </div>
            </div>
        </Link>
    );
}

function isWorker(token?: string | null) {
    if (!token) return false;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return false;

        const payload = parts[1];
        const b64 = payload
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(payload.length / 4) * 4, '=');

        const json = JSON.parse(
            decodeURIComponent(
                atob(b64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            )
        );

        const roles = json.roles ?? json.role ?? json.authorities ?? json.authority ?? null;
        if (!roles) return false;

        const arr = Array.isArray(roles)
            ? roles
            : String(roles)
                .split(',')
                .map((r: string) => r.trim());

        return arr.some((r: string) => String(r).toLowerCase().includes('worker'));
    } catch {
        return false;
    }
}

export default function WorkerManagementPage() {
    const { accessToken } = useAuth();
    const worker = isWorker(accessToken);

    return (
        <div style={{ padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 34, color: '#0f172a', letterSpacing: -0.2 }}>
                Panel pracownika — Zarządzanie
            </h1>

            <div style={{ marginTop: 10, color: '#64748b', fontWeight: 700 }}>
                Moduły pracownika. Zarządzaj własnymi publikacjami.
            </div>

            <div style={{ marginTop: 18 }}>
                {!worker ? (
                    <div style={{ color: '#9ca3af', fontWeight: 700 }}>
                        Musisz mieć rolę pracownika, aby korzystać z tego panelu.
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>


                        {/* ARTICLE: create/get/list/update/delete */}
                        <CardLink
                            href="/worker/articles"
                            title="Artykuły"
                            desc="Moje artykuły"
                            gradient="linear-gradient(90deg,#4f46e5,#6366f1)"
                        />

                        {/* MONOGRAPH: create/get/list/update/delete */}
                        <CardLink
                            href="/worker/monographs"
                            title="Monografie"
                            desc="Moje monografie"
                            gradient="linear-gradient(90deg,#06b6d4,#0ea5a4)"
                        />

                        {/* CHAPTER: create/get/list/update/delete */}
                        <CardLink
                            href="/worker/chapters"
                            title="Rozdziały"
                            desc="Moje rozdziały"
                            gradient="linear-gradient(90deg,#6d28d9,#8b5cf6)"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

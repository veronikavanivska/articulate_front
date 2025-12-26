'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function AdminManagementPage() {
    const { accessToken } = useAuth();

    // proste sprawdzenie roli (możesz użyć swojej funkcji parseRolesFromJwt)
    function isAdmin(token?: string | null) {
        if (!token) return false;
        try {
            const parts = token.split('.');
            if (parts.length < 2) return false;
            const payload = parts[1];
            const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
            const json = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            const roles = json.roles ?? json.role ?? json.authorities ?? null;
            if (!roles) return false;
            const rolesArray = Array.isArray(roles) ? roles : String(roles).split(',').map((r: string) => r);
            return rolesArray.some((r: string) => String(r).toLowerCase().includes('admin'));
        } catch {
            return false;
        }
    }
    const admin = isAdmin(accessToken);

    return (
        <div style={{ padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 32, color: '#0f172a' }}>Panel administratora — Zarządzanie</h1>

            <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {admin ? (
                    <>
                        <Link href="/admin/profiles" >
                            <button style={{
                                display: 'inline-block',
                                padding: '10px 14px',
                                background: '#4f46e5',
                                color: '#fff',
                                borderRadius: 8,
                                textDecoration: 'none',
                                fontWeight: 700
                            }}>
                                Zarządzaj profilami
                            </button>
                        </Link>

                        <Link href="/admin/etl" >
                            <button style={{
                                display: 'inline-block',
                                padding: '10px 14px',
                                background: 'linear-gradient(90deg,#06b6d4,#0ea5a4)',
                                color: '#fff',
                                borderRadius: 8,
                                textDecoration: 'none',
                                fontWeight: 700
                            }}>
                                Zarządzaj ETL (artykuły / monografie)
                            </button>
                        </Link>

                        <Link href="/admin/catalog">
                            <button
                                style={{
                                    display: 'inline-block',
                                    padding: '10px 14px',
                                    background: 'linear-gradient(90deg,#6d28d9,#8b5cf6)',
                                    color: '#fff',
                                    borderRadius: 8,
                                    textDecoration: 'none',
                                    fontWeight: 700,
                                }}
                            >
                                Zarządzaj słownikami (typy / dyscypliny / cykle)
                            </button>
                        </Link>
                    </>
                ) : (
                    <div style={{ color: '#9ca3af' }}>Musisz mieć uprawnienia administratora, aby korzystać z panelu zarządzania.</div>
                )}
            </div>
        </div>
    );
}
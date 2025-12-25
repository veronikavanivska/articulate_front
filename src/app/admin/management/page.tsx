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

    return (
        <div style={{ padding: 24 }}>
            <h1>Panel administratora — Zarządzanie</h1>

            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                {isAdmin(accessToken) ? (
                    <Link href="/admin/profiles">
                        <button style={{
                            padding: '10px 14px',
                            background: '#4f46e5',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer'
                        }}>
                            Zarządzaj profilami
                        </button>
                    </Link>
                ) : (
                    <div style={{ color: '#9ca3af' }}>Musisz mieć uprawnienia administratora, aby zarządzać profilami.</div>
                )}

                {/* inne przyciski panelu admin */}
            </div>
        </div>
    );
}
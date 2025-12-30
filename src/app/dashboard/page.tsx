'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import styles from '../login/styles.module.css';
import { useAuth } from '@/context/AuthContext';

/** Parse roles from JWT payload, normalize (lowercase, strip ROLE_ prefix) */
function parseRolesFromJwt(token?: string | null): string[] {
    if (!token) return [];
    try {
        const parts = token.split('.');
        if (parts.length < 2) return [];
        const payload = parts[1];
        const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const json = decodeURIComponent(
            atob(b64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        const obj = JSON.parse(json);
        const claimCandidates = [obj.roles, obj.role, obj.authorities, obj.authority, obj.rolesList, obj.scope];
        let roles: any = null;
        for (const c of claimCandidates) {
            if (c) { roles = c; break; }
        }
        if (!roles) return [];
        if (Array.isArray(roles)) return roles.map((r) => String(r).replace(/^ROLE_/i, '').toLowerCase());
        if (typeof roles === 'string') return roles.split(',').map((r) => String(r).replace(/^ROLE_/i, '').trim().toLowerCase());
        return [];
    } catch (err) {
        console.error('parseRolesFromJwt error', err);
        return [];
    }
}

/** Safely extract roles from profile object returned by /profile/me */
function extractRolesFromProfile(profile: any): string[] {
    if (!profile) return [];
    const set = new Set<string>();

    if (profile.role) {
        if (typeof profile.role === 'string') set.add(profile.role.replace(/^ROLE_/i, '').toLowerCase());
    }
    if (profile.roles) {
        if (Array.isArray(profile.roles)) profile.roles.forEach((r: any) => set.add(String(r).replace(/^ROLE_/i, '').toLowerCase()));
        else if (typeof profile.roles === 'string') profile.roles.split(',').forEach((r: string) => set.add(r.replace(/^ROLE_/i, '').trim().toLowerCase()));
    }

    if (profile.user) {
        const u = profile.user;
        if (u.roles && Array.isArray(u.roles)) u.roles.forEach((r: any) => set.add(String(r).replace(/^ROLE_/i, '').toLowerCase()));
        if (u.user_roles && Array.isArray(u.user_roles)) u.user_roles.forEach((ur: any) => {
            if (typeof ur === 'string') set.add(ur.replace(/^ROLE_/i, '').toLowerCase());
            else if (ur && ur.roleName) set.add(String(ur.roleName).replace(/^ROLE_/i, '').toLowerCase());
            else if (ur && ur.role && typeof ur.role === 'string') set.add(String(ur.role).replace(/^ROLE_/i, '').toLowerCase());
        });
    }

    if (profile.worker != null) set.add('worker');
    if (profile.admin != null) set.add('admin');
    if (profile.user != null) set.add('user');

    if (profile.profile_user) set.add('user');
    if (profile.profile_worker) set.add('worker');
    if (profile.profile_admin) set.add('admin');

    return Array.from(set);
}

type Profile = {
    user?: any;
    worker?: any;
    admin?: any;
    roles?: any;
    role?: any;
    email?: string;
    firstName?: string;
};

export default function DashboardPage() {
    const router = useRouter();
    const { accessToken } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                const res = await authFetch('/api/profile/me', { method: 'GET' });
                if (!mounted) return;
                if (!res.ok) {

                    setProfile(null);
                    return;
                }
                const data = await res.json().catch(() => null);
                setProfile(data ?? null);
            } catch (err) {
                console.error('dashboard fetch error', err);
                setError('Błąd połączenia');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [router, accessToken]);

    const mergedRoles = useMemo(() => {
        const rolesFromJwt = parseRolesFromJwt(accessToken ?? null);
        const rolesFromProfile = extractRolesFromProfile(profile);
        const set = new Set<string>();
        rolesFromJwt.forEach((r) => set.add(r));
        rolesFromProfile.forEach((r) => set.add(r));
        if (!set.size) set.add('user');
        return Array.from(set);
    }, [accessToken, profile]);

    const hasWorker = mergedRoles.some((r) => r.includes('worker'));
    const hasAdmin = mergedRoles.some((r) => r.includes('admin'));

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>Ładowanie...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.card} style={{ color: 'red' }}>{error}</div>
            </div>
        );
    }

    const displayName = profile?.user?.fullName ?? profile?.firstName ?? '';

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fb', padding: '48px 16px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 36 }}>{`Witaj${displayName ? `, ${displayName}` : ''}`}</h1>

                    </div>
                    <div>
                        <a href="/settings" className={styles.link} style={{ fontWeight: 700 }}>Ustawienia</a>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
                    {/* Profile tile - always visible */}
                    <Tile title="Profil" description="Twoje dane i ustawienia konta." onClick={() => router.push('/profile')} accent="#4b5563" emoji="👤" />

                    {/* Admin tile - only render if user has admin */}
                    {hasAdmin && (
                        <Tile title="Panel administratora" description="Zarządzaj publikacjami, dyscyplinami i cyklami." onClick={() => router.push('/admin/management')} accent="#7c3aed" emoji="🛠️" />
                    )}

                    {/* Worker tile - only render if user has worker */}
                    {hasWorker && (
                        <Tile title="Panel pracownika" description="Przeglądaj i zarządzaj swoimi monografiami i publikacjami." onClick={() => router.push('/worker/management')} accent="#0ea5a4" emoji="📚" />
                    )}
                </div>
            </div>
        </div>
    );
}

/* Simple tile component that uses onClick (router.push) */
function Tile({ title, description, onClick, accent, emoji }: { title: string; description: string; onClick: () => void; accent?: string; emoji?: string }) {
    return (
        <button onClick={onClick} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 12px 40px rgba(2,6,23,0.06)', display: 'flex', alignItems: 'center', gap: 18, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: accent ?? '#5b46f0', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28 }}>{emoji ?? '⭐'}</div>
            <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{description}</p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
        <span style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 10, background: accent ?? '#5b46f0', color: '#fff', fontWeight: 700 }}>
          Przejdź
        </span>
            </div>
        </button>
    );
}
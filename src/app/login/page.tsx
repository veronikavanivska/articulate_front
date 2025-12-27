'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './styles.module.css';

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // logujemy użytkownika
            await login(email.trim(), password);

            // po poprawnym zalogowaniu przekierowujemy na wspólny dashboard
            router.push('/dashboard');
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err?.message ?? 'Błąd logowania');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles?.container ?? ''}>
            <div className={styles?.card ?? ''}>
                <div className={styles?.header ?? ''}>
                    <div className={styles?.logo ?? ''}>A</div>
                    <h1 className={styles?.title ?? ''}>Witamy z powrotem</h1>
                    <p className={styles?.subtitle ?? ''}>Zaloguj się do swojego konta</p>
                </div>

                <form onSubmit={handleSubmit} className={styles?.form ?? ''} suppressHydrationWarning>
                    <div className={styles?.field ?? ''}>
            <span className={styles?.icon ?? ''} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
            </span>
                        <input
                            className={styles?.input ?? ''}
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            suppressHydrationWarning
                        />
                    </div>

                    <div className={styles?.field ?? ''}>
            <span className={styles?.icon ?? ''} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V8a5 5 0 0110 0v3" /></svg>
            </span>
                        <input
                            className={styles?.input ?? ''}
                            id="password"
                            type="password"
                            placeholder="Hasło"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            suppressHydrationWarning
                        />
                    </div>

                    <div className={styles?.row ?? ''}>
                        <a className={styles?.link ?? ''} href="/register">Utwórz konto</a>

                    </div>

                    {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

                    <button
                        type="submit"
                        className={styles?.submit ?? ''}
                        disabled={loading}
                    >
                        {loading ? 'Logowanie...' : 'Zaloguj się'}
                    </button>
                </form>
            </div>
        </div>
    );
}
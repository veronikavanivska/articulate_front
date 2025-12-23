'use client';

import React, { useState } from 'react';
import styles from '../login/styles.module.css';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
    const { register } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email || !password || !confirm) {
            setError('Uzupełnij wszystkie pola');
            return;
        }
        if (password.length < 6) {
            setError('Hasło musi mieć przynajmniej 6 znaków');
            return;
        }
        if (password !== confirm) {
            setError('Hasła muszą być takie same');
            return;
        }

        setLoading(true);
        try {
            await register(email.trim(), password);
            router.push('/login');
        } catch (err: any) {
            setError(err?.message ?? 'Błąd rejestracji');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.card} role="main" aria-labelledby="register-title">
                <div className={styles.header}>
                    <div className={styles.logo}>A</div>
                    <h1 id="register-title" className={styles.title}>Utwórz konto</h1>
                    <p className={styles.subtitle}>Zarejestruj nowe konto</p>
                </div>

                {/* suppressHydrationWarning na formularzu */}
                <form onSubmit={handleSubmit} className={styles.form} suppressHydrationWarning>
                    <div className={styles.field}>
            <span className={styles.icon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
            </span>
                        <input
                            className={styles.input}
                            id="reg-email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            suppressHydrationWarning
                        />
                    </div>

                    <div className={styles.field}>
            <span className={styles.icon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V8a5 5 0 0110 0v3" /></svg>
            </span>
                        <input
                            className={styles.input}
                            id="reg-password"
                            type="password"
                            placeholder="Hasło"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            suppressHydrationWarning
                        />
                    </div>

                    <div className={styles.field}>
            <span className={styles.icon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V8a5 5 0 0110 0v3" /></svg>
            </span>
                        <input
                            className={styles.input}
                            id="reg-confirm"
                            type="password"
                            placeholder="Powtórz hasło"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            suppressHydrationWarning
                        />
                    </div>

                    <div className={styles.row}>
                        <a className={styles.link} href="/login">Masz już konto? Zaloguj się</a>
                        <span></span>
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button className={styles.submit} type="submit" disabled={loading}>
                        {loading ? 'Rejestracja...' : 'Zarejestruj się'}
                    </button>

                    <p className={styles.terms}>
                        Rejestrując się akceptujesz nasze <a className={styles.link} href="#">Regulamin</a> oraz <a className={styles.link} href="#">Politykę prywatności</a>.
                    </p>
                </form>

                <div className={styles.footer}>© {new Date().getFullYear()} Articulate</div>
            </div>
        </div>
    );
}
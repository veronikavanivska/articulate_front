'use client';

import React, { useState } from 'react';
import styles from '../login/styles.module.css';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
    const { changePassword, changeEmail } = useAuth();
    const [curr, setCurr] = useState('');
    const [newP, setNewP] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pwMsg, setPwMsg] = useState<string | null>(null);
    const [pwErr, setPwErr] = useState<string | null>(null);
    const [loadingPw, setLoadingPw] = useState(false);

    const [email, setEmail] = useState('');
    const [emailMsg, setEmailMsg] = useState<string | null>(null);
    const [emailErr, setEmailErr] = useState<string | null>(null);
    const [loadingEmail, setLoadingEmail] = useState(false);

    async function onChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setPwErr(null);
        setPwMsg(null);
        if (!curr || !newP || !confirm) return setPwErr('Uzupełnij wszystkie pola');
        if (newP.length < 6) return setPwErr('Hasło musi mieć co najmniej 6 znaków');
        if (newP !== confirm) return setPwErr('Hasła nie są zgodne');

        setLoadingPw(true);
        try {
            await changePassword(curr, newP);
            setPwMsg('Hasło zostało zmienione pomyślnie.');
            setCurr(''); setNewP(''); setConfirm('');
        } catch (err: any) {
            setPwErr(err?.message ?? 'Błąd zmiany hasła');
        } finally {
            setLoadingPw(false);
        }
    }

    async function onChangeEmail(e: React.FormEvent) {
        e.preventDefault();
        setEmailErr(null);
        setEmailMsg(null);
        if (!email) return setEmailErr('Podaj adres e-mail');
        setLoadingEmail(true);
        try {
            await changeEmail(email);
            setEmailMsg('Adres e-mail zaktualizowany.');
            setEmail('');
        } catch (err: any) {
            setEmailErr(err?.message ?? 'Błąd zmiany e-mail');
        } finally {
            setLoadingEmail(false);
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>A</div>
                    <h1 className={styles.title}>Ustawienia</h1>
                    <p className={styles.subtitle}>Zmień swoje hasło lub adres e-mail</p>
                </div>

                <section style={{ marginTop: 12 }}>
                    <h3 style={{ marginBottom: 8 }}>Zmień hasło</h3>
                    <form onSubmit={onChangePassword} className={styles.form} suppressHydrationWarning>
                        <div className={styles.field}>
                            <input className={styles.input} type="password" placeholder="Aktualne hasło" value={curr} onChange={(e)=>setCurr(e.target.value)} required />
                        </div>
                        <div className={styles.field}>
                            <input className={styles.input} type="password" placeholder="Nowe hasło" value={newP} onChange={(e)=>setNewP(e.target.value)} required />
                        </div>
                        <div className={styles.field}>
                            <input className={styles.input} type="password" placeholder="Powtórz nowe hasło" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required />
                        </div>
                        {pwErr && <div className={styles.error}>{pwErr}</div>}
                        {pwMsg && <div style={{ color: 'green', marginBottom: 8 }}>{pwMsg}</div>}
                        <button className={styles.submit} type="submit" disabled={loadingPw}>{loadingPw ? 'Trwa...' : 'Zmień hasło'}</button>
                    </form>
                </section>

                <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f7' }} />

                <section>
                    <h3 style={{ marginBottom: 8 }}>Zmień adres e‑mail</h3>
                    <form onSubmit={onChangeEmail} className={styles.form} suppressHydrationWarning>
                        <div className={styles.field}>
                            <input className={styles.input} type="email" placeholder="Nowy adres e‑mail" value={email} onChange={(e)=>setEmail(e.target.value)} required />
                        </div>
                        {emailErr && <div className={styles.error}>{emailErr}</div>}
                        {emailMsg && <div style={{ color: 'green', marginBottom: 8 }}>{emailMsg}</div>}
                        <button className={styles.submit} type="submit" disabled={loadingEmail}>{loadingEmail ? 'Trwa...' : 'Zmień e‑mail'}</button>
                    </form>
                </section>
            </div>
        </div>
    );
}
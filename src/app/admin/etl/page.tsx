'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../profiles/styles.module.css';

/**
 * Single-file client implementation of the ETL admin panel.
 * Replaces separate components — contains:
 * - Articles import / list / activate / delete / check job
 * - Monographs import / list / delete / recalc
 *
 * Expects proxy endpoints under /api/etl/admin/... (we created those earlier).
 */

export default function ETLAdminPage() {
    const { initialized } = useAuth();

    // common
    const [tab, setTab] = useState<'articles' | 'monos'>('articles');

    // Articles
    const [aFile, setAFile] = useState<File | null>(null);
    const [aLabel, setALabel] = useState('');
    const [aActivateAfter, setAActivateAfter] = useState(true);
    const [aUploading, setAUploading] = useState(false);

    const [journals, setJournals] = useState<any[]>([]);
    const [pageMeta, setPageMeta] = useState({ page: 0, size: 20 });
    const [versionId, setVersionId] = useState<number | null>(null);
    const [loadingList, setLoadingList] = useState(false);

    const [jobStatus, setJobStatus] = useState<any | null>(null);

    // Monographs
    const [mFile, setMFile] = useState<File | null>(null);
    const [mLabel, setMLabel] = useState('');
    const [mUploading, setMUploading] = useState(false);
    const [monoVersions, setMonoVersions] = useState<any[]>([]);
    const [monoLoading, setMonoLoading] = useState(false);

    useEffect(() => {
        if (!initialized) return;
        // Optionally fetch initial lists
        fetchJournals();
        fetchMonos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // ---------- Articles handlers ----------
    async function importArticles(e?: React.FormEvent) {
        e?.preventDefault();
        if (!aFile) return alert('Wybierz plik');
        setAUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', aFile);
            fd.append('label', aLabel);
            fd.append('activateAfter', String(aActivateAfter));

            const res = await authFetch('/api/etl/admin/import', {
                method: 'POST',
                body: fd as unknown as BodyInit,
            } as RequestInit);

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);

            // Jeśli backend zwraca informację, że plik już był importowany -> powiadomienie
            if (data?.alreadyImported) {
                alert('Plik został już zaimportowany wcześniej');
                setVersionId(null);
                // odśwież listę (opcjonalnie)
                fetchJournals();
                return;
            }

            const versionResp = Number(data?.version_id ?? data?.versionId ?? 0);
            if (versionResp > 0) {
                alert('Import zakończony, versionId=' + versionResp);
                setVersionId(versionResp);
            } else {
                alert('Import zakończony, versionId=' + (data?.version_id ?? data?.versionId ?? 'n/a'));
                setVersionId(null);
            }

            fetchJournals();
        } catch (err: any) {
            alert('Błąd importu: ' + (err?.message ?? err));
        } finally {
            setAUploading(false);
        }
    }


    async function fetchJournals(page = 0, size = 20) {
        setLoadingList(true);
        try {
            const body = { versionId: versionId ?? 0, page, size, sortDir: 'asc' };
            const res = await authFetch('/api/etl/admin/listMeinJournals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            } as RequestInit);

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                console.error('[fetchJournals] list error', res.status, txt);
                setJournals([]);
                return;
            }

            const data = await res.json().catch(() => null);
            setJournals(data?.meinJournals ?? data?.items ?? []);
            setPageMeta(data?.pageMeta ?? { page, size });
        } catch (e) {
            console.error('[fetchJournals] error', e);
            setJournals([]);
        } finally {
            setLoadingList(false);
        }
    }

    async function activateVersion(version: number) {
        if (!confirm('Aktywować wersję?')) return;
        try {
            const res = await authFetch(`/api/etl/admin/activateMeinVersion?versionId=${version}`, { method: 'POST' });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            alert('Aktywacja uruchomiona');
            fetchJournals();
        } catch (err: any) {
            alert('Błąd: ' + (err?.message ?? err));
        }
    }

    async function deleteVersion(version: number) {
        if (!confirm('Usunąć wersję (asynchroniczne)?')) return;
        try {
            const res = await authFetch(`/api/etl/admin/deleteMeinVersion?versionId=${version}`, { method: 'DELETE' });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);
            alert('Usuwanie uruchomione, jobId=' + (data?.jobId ?? 'n/a'));
            fetchJournals();
        } catch (err: any) {
            alert('Błąd: ' + (err?.message ?? err));
        }
    }

    async function checkJob(jobId: number) {
        try {
            const res = await authFetch(`/api/etl/admin/getJobStatus?jobId=${jobId}`, { method: 'GET' });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);
            setJobStatus(data);
            alert('Job status: ' + (data?.status ?? 'n/a'));
        } catch (err: any) {
            alert('Błąd pobierania statusu zadania: ' + (err?.message ?? err));
        }
    }

    // ---------- Monographs handlers ----------
    async function importMonos(e?: React.FormEvent) {
        e?.preventDefault();
        if (!mFile) return alert('Wybierz plik PDF/ZIP');
        setMUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', mFile);
            fd.append('label', mLabel);

            const res = await authFetch('/api/etl/admin/import', {
                method: 'POST',
                body: fd as unknown as BodyInit,
            } as RequestInit);

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);
            alert('Import uruchomiony, versionId=' + (data?.version_id ?? data?.versionId ?? 'n/a'));
            fetchMonos();
        } catch (err: any) {
            alert('Błąd importu: ' + (err?.message ?? err));
        } finally {
            setMUploading(false);
        }
    }

    async function fetchMonos() {
        setMonoLoading(true);
        try {
            const res = await authFetch('/api/etl/admin/listMonoVersions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, size: 20, sortDir: 'asc' }),
            } as RequestInit);

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                console.warn('[fetchMonos] non-ok', res.status, txt);
                setMonoVersions([]);
                return;
            }

            const data = await res.json().catch(() => null);
            setMonoVersions(data?.items ?? []);
        } catch (e) {
            console.error('[fetchMonos] error', e);
            setMonoVersions([]);
        } finally {
            setMonoLoading(false);
        }
    }

    async function deleteMonoVersion(id: number) {
        if (!confirm('Usunąć wersję?')) return;
        try {
            const res = await authFetch(`/api/etl/admin/deleteMonoVersion?versionId=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);
            alert('Usuwanie uruchomione, jobId=' + (data?.jobId ?? 'n/a'));
            fetchMonos();
        } catch (err: any) {
            alert('Błąd: ' + (err?.message ?? err));
        }
    }

    async function recalcMonoPoints(cycleId: number) {
        if (!confirm('Przeliczyć punkty dla cyklu?')) return;
        try {
            const res = await authFetch(`/api/etl/admin/recalcCycleScores?cycleId=${cycleId}`, { method: 'POST' });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || String(res.status));
            }
            const data = await res.json().catch(() => null);
            alert('Przeliczanie uruchomione, jobId=' + (data?.jobId ?? 'n/a'));
        } catch (err: any) {
            alert('Błąd: ' + (err?.message ?? err));
        }
    }

    if (!initialized) {
        return <div style={{ padding: 24 }}>Ładowanie…</div>;
    }

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — ETL (MEiN)</h1>
                <div className={styles.tabs}>
                    <button className={tab === 'articles' ? styles.tabActive : styles.tab} onClick={() => setTab('articles')}>Zarządzaj artykułami</button>
                    <button className={tab === 'monos' ? styles.tabActive : styles.tab} onClick={() => setTab('monos')}>Zarządzaj monografiami</button>
                </div>
            </header>

            <main className={styles.content}>
                {tab === 'articles' ? (
                    <div className={styles.panelGrid}>
                        <section className={styles.panelLeft}>
                            <div className={styles.card}>
                                <h3>Import artykułów (MEiN)</h3>
                                <form onSubmit={importArticles}>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <input type="file" accept=".xml,.zip,.csv" onChange={e => setAFile(e.target.files?.[0] ?? null)} />
                                        <input placeholder="label" value={aLabel} onChange={e => setALabel(e.target.value)} className={styles.input} />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="checkbox" checked={aActivateAfter} onChange={e => setAActivateAfter(e.target.checked)} /> Aktywuj po imporcie
                                        </label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className={styles.primaryBtn} type="submit" disabled={aUploading}>{aUploading ? 'Wysyłanie…' : 'Importuj'}</button>
                                            <button type="button" className={styles.ghostBtn} onClick={() => { setAFile(null); setALabel(''); }}>Wyczyść</button>
                                        </div>
                                    </div>
                                </form>
                            </div>

                            <div className={styles.card} style={{ marginTop: 12 }}>
                                <h4>Wersja do przeglądu</h4>
                                <input type="number" value={versionId ?? ''} onChange={e => setVersionId(e.target.value ? Number(e.target.value) : null)} className={styles.input} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button className={styles.primaryBtn} onClick={() => fetchJournals(0, pageMeta.size)}>Pobierz listę</button>
                                    <button className={styles.ghostBtn} onClick={() => setVersionId(null)}>Wyczyść</button>
                                </div>
                            </div>

                            <div className={styles.card} style={{ marginTop: 12 }}>
                                <h4>Operacje na wersji</h4>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className={styles.primaryBtn} onClick={() => { if (versionId) activateVersion(versionId); else alert('Podaj versionId'); }}>Aktywuj</button>
                                    <button className={styles.ghostBtn} onClick={() => { if (versionId) deleteVersion(versionId); else alert('Podaj versionId'); }}>Usuń (async)</button>
                                </div>
                            </div>
                        </section>

                        <aside className={styles.panelRight}>
                            <div className={styles.card}>
                                <h3>Lista czasopism</h3>
                                {loadingList ? <div>Ładowanie…</div> : (
                                    <>
                                        {journals.length === 0 ? <div className={styles.muted}>Brak danych</div> :
                                            <ul className={styles.list}>
                                                {journals.map((j: any) => (
                                                    <li key={j.uid ?? j.id} className={styles.listItem}>
                                                        <div>
                                                            <div className={styles.itemTitle}>{j.title1 ?? j.uid}</div>
                                                            <div className={styles.muted}>{j.issn ?? ''} • {j.points ?? ''}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <button className={styles.infoBtn} onClick={() => alert(JSON.stringify(j, null, 2))}>Szczegóły</button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        }
                                    </>
                                )}
                            </div>

                            <div className={styles.card} style={{ marginTop: 12 }}>
                                <h4>Sprawdź zadanie</h4>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input type="number" placeholder="jobId" id="jobIdInput" className={styles.input} />
                                    <button className={styles.primaryBtn} onClick={() => {
                                        const el = document.getElementById('jobIdInput') as HTMLInputElement | null;
                                        if (el && el.value) checkJob(Number(el.value));
                                        else alert('Podaj jobId');
                                    }}>Sprawdź</button>
                                </div>
                                {jobStatus && <pre style={{ marginTop: 8 }}>{JSON.stringify(jobStatus, null, 2)}</pre>}
                            </div>
                        </aside>
                    </div>
                ) : (
                    // Monographs tab
                    <div className={styles.panelGrid}>
                        <section className={styles.panelLeft}>
                            <div className={styles.card}>
                                <h3>Import monografii (PDF/ZIP)</h3>
                                <form onSubmit={importMonos}>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <input type="file" accept=".pdf,.zip" onChange={e => setMFile(e.target.files?.[0] ?? null)} />
                                        <input placeholder="label" value={mLabel} onChange={e => setMLabel(e.target.value)} className={styles.input} />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className={styles.primaryBtn} type="submit" disabled={mUploading}>{mUploading ? 'Wysyłanie…' : 'Importuj'}</button>
                                            <button type="button" className={styles.ghostBtn} onClick={() => { setMFile(null); setMLabel(''); }}>Wyczyść</button>
                                        </div>
                                    </div>
                                </form>
                            </div>

                            <div className={styles.card} style={{ marginTop: 12 }}>
                                <h4>Przelicz punkty cyklu</h4>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input type="number" placeholder="cycleId" id="cycleIdInput" className={styles.input} />
                                    <button className={styles.primaryBtn} onClick={() => {
                                        const el = document.getElementById('cycleIdInput') as HTMLInputElement | null;
                                        if (el && el.value) recalcMonoPoints(Number(el.value));
                                        else alert('Podaj cycleId');
                                    }}>Przelicz</button>
                                </div>
                            </div>
                        </section>

                        <aside className={styles.panelRight}>
                            <div className={styles.card}>
                                <h3>Wersje monografii</h3>
                                {monoLoading ? <div>Ładowanie…</div> : (
                                    <ul className={styles.list}>
                                        {monoVersions.map((v: any) => (
                                            <li key={v.id} className={styles.listItem}>
                                                <div>
                                                    <div className={styles.itemTitle}>v{v.id} • {v.label ?? '—'}</div>
                                                    <div className={styles.muted}>status: {v.status ?? '—'}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button className={styles.infoBtn} onClick={() => alert(JSON.stringify(v, null, 2))}>Szczegóły</button>
                                                    <button className={styles.ghostBtn} onClick={() => deleteMonoVersion(v.id)}>Usuń</button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </aside>
                    </div>
                )}
            </main>
        </div>
    );
}
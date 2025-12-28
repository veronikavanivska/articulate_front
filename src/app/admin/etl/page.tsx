'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/authFetch';
import styles from '../profiles/styles.module.css';

type PageMeta = { page: number; size: number; totalPages?: number; totalItems?: number };

type JobItem = {
    jobId: number;
    scope: 'MEIN' | 'MONO';
    versionId?: number;
    status?: string;
    type?: string;
    error?: string | null;
    createdAt: number;
    done: boolean;
};

function isJobDone(status?: string) {
    const s = String(status ?? '').toUpperCase();
    return ['DONE', 'SUCCESS', 'FINISHED', 'FAILED', 'ERROR', 'CANCELLED'].includes(s);
}

function badgeClassForJob(status?: string) {
    const s = String(status ?? '').toUpperCase();
    if (s === 'RUNNING' || s === 'IN_PROGRESS' || s === 'PENDING') return styles.badgeWorker;
    if (s === 'DONE' || s === 'SUCCESS' || s === 'FINISHED') return styles.badgeMuted;
    if (s === 'FAILED' || s === 'ERROR') return styles.badgeAdmin;
    return styles.badgeMuted;
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
    if (!props.open) return null;

    return (
        <div className={styles.modalOverlay} onMouseDown={props.onClose}>
            <div className={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>{props.title}</h3>
                    <button className={styles.ghostBtn} onClick={props.onClose}>
                        Zamknij
                    </button>
                </div>
                <div>{props.children}</div>
            </div>
        </div>
    );
}

export default function ETLAdminPage() {
    const { initialized } = useAuth();
    const [tab, setTab] = useState<'articles' | 'monos'>('articles');

    // ===================== MEiN (ARTICLES) =====================
    const [versions, setVersions] = useState<any[]>([]);
    const [vLoading, setVLoading] = useState(false);
    const [vError, setVError] = useState<string | null>(null);
    const [vPageMeta, setVPageMeta] = useState<PageMeta>({ page: 0, size: 20 });
    const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

    const [journals, setJournals] = useState<any[]>([]);
    const [jLoading, setJLoading] = useState(false);
    const [jError, setJError] = useState<string | null>(null);
    const [jPageMeta, setJPageMeta] = useState<PageMeta>({ page: 0, size: 20 });
    const [journalTitleInput, setJournalTitleInput] = useState('');
    const [journalTitleQuery, setJournalTitleQuery] = useState('');

    const [aFile, setAFile] = useState<File | null>(null);
    const [aLabel, setALabel] = useState('');
    const [aUploading, setAUploading] = useState(false);

    const [versionModalOpen, setVersionModalOpen] = useState(false);
    const [versionDetails, setVersionDetails] = useState<any | null>(null);

    const [journalModalOpen, setJournalModalOpen] = useState(false);
    const [journalModalLoading, setJournalModalLoading] = useState(false);
    const [journalModalData, setJournalModalData] = useState<any | null>(null);
    const [journalModalError, setJournalModalError] = useState<string | null>(null);

    const selectedVersion = useMemo(() => {
        if (!selectedVersionId) return null;
        return versions.find((v) => Number(v?.id ?? v?.versionId ?? v?.version_id) === selectedVersionId) ?? null;
    }, [versions, selectedVersionId]);

    // ===================== MONOGRAPHS =====================
    const [monoVersions, setMonoVersions] = useState<any[]>([]);
    const [mvLoading, setMvLoading] = useState(false);
    const [mvError, setMvError] = useState<string | null>(null);
    const [mvPageMeta, setMvPageMeta] = useState<PageMeta>({ page: 0, size: 20 });
    const [selectedMonoVersionId, setSelectedMonoVersionId] = useState<number | null>(null);

    const [publishers, setPublishers] = useState<any[]>([]);
    const [pLoading, setPLoading] = useState(false);
    const [pError, setPError] = useState<string | null>(null);
    const [pPageMeta, setPPageMeta] = useState<PageMeta>({ page: 0, size: 20 });
    const [publisherTitleInput, setPublisherTitleInput] = useState('');
    const [publisherTitleQuery, setPublisherTitleQuery] = useState('');


    const [mFile, setMFile] = useState<File | null>(null);
    const [mLabel, setMLabel] = useState('');
    const [mUploading, setMUploading] = useState(false);


    const [monoVersionModalOpen, setMonoVersionModalOpen] = useState(false);
    const [monoVersionModalLoading, setMonoVersionModalLoading] = useState(false);
    const [monoVersionModalError, setMonoVersionModalError] = useState<string | null>(null);
    const [monoVersionModalData, setMonoVersionModalData] = useState<any | null>(null);

    const [publisherModalOpen, setPublisherModalOpen] = useState(false);
    const [publisherModalLoading, setPublisherModalLoading] = useState(false);
    const [publisherModalError, setPublisherModalError] = useState<string | null>(null);
    const [publisherModalData, setPublisherModalData] = useState<any | null>(null);

    const selectedMonoVersion = useMemo(() => {
        if (!selectedMonoVersionId) return null;
        return monoVersions.find((v) => Number(v?.id ?? v?.versionId ?? v?.version_id) === selectedMonoVersionId) ?? null;
    }, [monoVersions, selectedMonoVersionId]);

    // ===================== JOBS (shared) =====================
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const pollRef = useRef<number | null>(null);

    // ---------------- init (MEiN default) ----------------
    useEffect(() => {
        if (!initialized) return;
        fetchMeinVersions(0, vPageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // ---------------- when select MEiN version -> journals ----------------
    useEffect(() => {
        if (!initialized) return;

        if (!selectedVersionId) {
            setJournals([]);
            return;
        }

        // reset filtra przy zmianie wersji
        setJournalTitleInput('');
        setJournalTitleQuery('');

        fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedVersionId, initialized]);

    // ---------------- when switch to monographs first time -> load mono versions ----------------
    useEffect(() => {
        if (!initialized) return;
        if (tab !== 'monos') return;
        if (monoVersions.length > 0) return;
        fetchMonoVersions(0, mvPageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, initialized]);

    // ---------------- when select mono version -> publishers ----------------
    useEffect(() => {
        if (!initialized) return;

        if (!selectedMonoVersionId) {
            setPublishers([]);
            return;
        }

        // reset filtra przy zmianie wersji
        setPublisherTitleInput('');
        setPublisherTitleQuery('');

        fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonoVersionId, initialized]);

    // ---------------- polling jobs ----------------
    useEffect(() => {
        const hasPending = jobs.some((j) => !j.done);
        if (!hasPending) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            return;
        }

        if (pollRef.current) return;
        pollRef.current = window.setInterval(() => {
            pollJobsOnce();
        }, 2500);

        return () => {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs]);

    async function pollJobsOnce() {
        const pending = jobs.filter((j) => !j.done);
        if (pending.length === 0) return;

        await Promise.all(
            pending.map(async (j) => {
                try {
                    const res = await authFetch(`/api/etl/admin/getJobStatus?jobId=${j.jobId}`, { method: 'GET' });
                    const text = await res.text().catch(() => '');
                    if (!res.ok) return;

                    const data = text ? JSON.parse(text) : null;
                    const nextStatus = data?.status ?? j.status;
                    const done = isJobDone(nextStatus);

                    setJobs((prev) =>
                        prev.map((x) =>
                            x.jobId === j.jobId
                                ? {
                                    ...x,
                                    status: nextStatus,
                                    type: data?.type ?? x.type,
                                    error: data?.error ?? x.error,
                                    done,
                                }
                                : x
                        )
                    );

                    if (done) {
                        // odśwież odpowiedni obszar
                        const scope = j.scope;

                        if (scope === 'MEIN') {
                            fetchMeinVersions(vPageMeta.page, vPageMeta.size);
                            if (selectedVersionId) fetchMeinJournals(selectedVersionId, jPageMeta.page, jPageMeta.size, journalTitleQuery);

                        } else {
                            fetchMonoVersions(mvPageMeta.page, mvPageMeta.size);
                            if (selectedMonoVersionId) fetchMonoPublishers(selectedMonoVersionId, pPageMeta.page, pPageMeta.size, publisherTitleQuery);

                        }
                    }
                } catch {
                    // ignoruj pojedyncze błędy pollingu
                }
            })
        );
    }

    // ===================== API: MEiN =====================
    async function fetchMeinVersions(page = 0, size = 20) {
        setVLoading(true);
        setVError(null);
        try {
            const res = await authFetch('/api/etl/admin/listMeinVersions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, size, sortDir: 'DESC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) {
                setVersions([]);
                setVError(text || `HTTP ${res.status}`);
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];

            setVersions(Array.isArray(items) ? items : []);
            setVPageMeta(data?.pageMeta ?? { page, size });

            if (!selectedVersionId && Array.isArray(items) && items.length > 0) {
                const first = items[0];
                const id = Number(first?.id ?? first?.versionId ?? first?.version_id);
                if (id > 0) setSelectedVersionId(id);
            }
        } catch (e: any) {
            setVersions([]);
            setVError(String(e?.message ?? e));
        } finally {
            setVLoading(false);
        }
    }

    // async function fetchMeinJournals(versionId: number, page = 0, size = 20) {
    //     setJLoading(true);
    //     setJError(null);
    //     try {
    //         const res = await authFetch('/api/etl/admin/listMeinJournals', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ versionId, page, size, sortDir: 'ASC' }),
    //         } as RequestInit);
    //
    //         const text = await res.text().catch(() => '');
    //         if (!res.ok) {
    //             setJournals([]);
    //             setJError(text || `HTTP ${res.status}`);
    //             return;
    //         }
    //
    //         const data = text ? JSON.parse(text) : null;
    //         const items = data?.items ?? data?.meinJournals ?? [];
    //         setJournals(Array.isArray(items) ? items : []);
    //         setJPageMeta(data?.pageMeta ?? { page, size });
    //     } catch (e: any) {
    //         setJournals([]);
    //         setJError(String(e?.message ?? e));
    //     } finally {
    //         setJLoading(false);
    //     }
    // }
    async function fetchMeinJournals(versionId: number, page = 0, size = 20, title?: string) {
        setJLoading(true);
        setJError(null);

        const q = (title ?? journalTitleQuery ?? '').trim();

        try {
            const res = await authFetch('/api/etl/admin/listMeinJournals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId, page, size, sortDir: 'ASC', title: q }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) {
                setJournals([]);
                setJError(text || `HTTP ${res.status}`);
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.meinJournals ?? [];
            setJournals(Array.isArray(items) ? items : []);
            setJPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setJournals([]);
            setJError(String(e?.message ?? e));
        } finally {
            setJLoading(false);
        }
    }

    async function importMein(e?: React.FormEvent) {
        e?.preventDefault();
        if (!aFile) return alert('Wybierz plik');
        if (!aLabel.trim()) return alert('Podaj label');

        setAUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', aFile);
            fd.append('label', aLabel.trim());

            const res = await authFetch('/api/etl/admin/import', { method: 'POST', body: fd as any } as RequestInit);
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;

            if (data?.alreadyImported) {
                alert('Plik został już zaimportowany wcześniej');
                fetchMeinVersions(0, vPageMeta.size);
                return;
            }

            const newVersionId = Number(data?.version_id ?? data?.versionId ?? 0);
            alert('Import zakończony, versionId=' + (newVersionId || 'n/a'));

            await fetchMeinVersions(0, vPageMeta.size);
            if (newVersionId > 0) setSelectedVersionId(newVersionId);

            setAFile(null);
            setALabel('');
        } catch (err: any) {
            alert('Błąd importu: ' + (err?.message ?? err));
        } finally {
            setAUploading(false);
        }
    }

    async function deleteMeinVersion(versionId: number) {
        if (!confirm(`Usunąć wersję v${versionId} (asynchronicznie)?`)) return;
        try {
            const res = await authFetch(`/api/etl/admin/deleteMeinVersion?versionId=${versionId}`, { method: 'DELETE' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            const jobId = Number(data?.jobId ?? 0);

            if (!jobId) {
                alert('Usuwanie uruchomione, ale brak jobId w odpowiedzi');
                return;
            }

            setJobs((prev) => [
                {
                    jobId,
                    scope: 'MEIN',
                    versionId,
                    status: 'RUNNING',
                    type: 'DELETE_MEIN_VERSION',
                    error: null,
                    createdAt: Date.now(),
                    done: false,
                },
                ...prev,
            ]);

            fetchMeinVersions(vPageMeta.page, vPageMeta.size);
        } catch (err: any) {
            alert('Błąd usuwania: ' + (err?.message ?? err));
        }
    }

    function openMeinVersionDetailsFromList(versionItem: any) {
        setVersionDetails(versionItem);
        setVersionModalOpen(true);
    }

    async function openJournalDetails(versionId: number, journalId: number) {
        setJournalModalOpen(true);
        setJournalModalLoading(true);
        setJournalModalError(null);
        setJournalModalData(null);

        try {
            const res = await authFetch('/api/etl/admin/getMeinJournal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId, journalId }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
            const data = text ? JSON.parse(text) : null;
            setJournalModalData(data);
        } catch (e: any) {
            setJournalModalError(String(e?.message ?? e));
        } finally {
            setJournalModalLoading(false);
        }
    }

    // ===================== API: MONO =====================
    async function fetchMonoVersions(page = 0, size = 20) {
        setMvLoading(true);
        setMvError(null);
        try {
            const res = await authFetch('/api/etl/admin/listMeinMonoVersions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, size, sortDir: 'DESC' }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) {
                setMonoVersions([]);
                setMvError(text || `HTTP ${res.status}`);
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];
            setMonoVersions(Array.isArray(items) ? items : []);
            setMvPageMeta(data?.pageMeta ?? { page, size });

            if (!selectedMonoVersionId && Array.isArray(items) && items.length > 0) {
                const first = items[0];
                const id = Number(first?.id ?? first?.versionId ?? first?.version_id);
                if (id > 0) setSelectedMonoVersionId(id);
            }
        } catch (e: any) {
            setMonoVersions([]);
            setMvError(String(e?.message ?? e));
        } finally {
            setMvLoading(false);
        }
    }

    // async function fetchMonoPublishers(versionId: number, page = 0, size = 20) {
    //     setPLoading(true);
    //     setPError(null);
    //     try {
    //         const res = await authFetch('/api/etl/admin/listMeinMonoPublishers', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ versionId, page, size, sortDir: 'ASC' }),
    //         } as RequestInit);
    //
    //         const text = await res.text().catch(() => '');
    //         if (!res.ok) {
    //             setPublishers([]);
    //             setPError(text || `HTTP ${res.status}`);
    //             return;
    //         }
    //
    //         const data = text ? JSON.parse(text) : null;
    //         const items = data?.items ?? [];
    //         setPublishers(Array.isArray(items) ? items : []);
    //         setPPageMeta(data?.pageMeta ?? { page, size });
    //     } catch (e: any) {
    //         setPublishers([]);
    //         setPError(String(e?.message ?? e));
    //     } finally {
    //         setPLoading(false);
    //     }
    // }
    async function fetchMonoPublishers(versionId: number, page = 0, size = 20, title?: string) {
        setPLoading(true);
        setPError(null);

        const q = (title ?? publisherTitleQuery ?? '').trim();

        try {
            const res = await authFetch('/api/etl/admin/listMeinMonoPublishers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId, page, size, sortDir: 'ASC', title: q }),
            } as RequestInit);

            const text = await res.text().catch(() => '');
            if (!res.ok) {
                setPublishers([]);
                setPError(text || `HTTP ${res.status}`);
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? [];
            setPublishers(Array.isArray(items) ? items : []);
            setPPageMeta(data?.pageMeta ?? { page, size });
        } catch (e: any) {
            setPublishers([]);
            setPError(String(e?.message ?? e));
        } finally {
            setPLoading(false);
        }
    }

    async function importMono(e?: React.FormEvent) {
        e?.preventDefault();
        if (!mFile) return alert('Wybierz plik PDF');
        if (!mLabel.trim()) return alert('Podaj label');

        setMUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', mFile);
            fd.append('label', mLabel.trim());

            const res = await authFetch('/api/etl/admin/importPDF', { method: 'POST', body: fd as any } as RequestInit);
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;

            if (data?.alreadyImported) {
                alert('Plik został już zaimportowany wcześniej');
                fetchMonoVersions(0, mvPageMeta.size);
                return;
            }

            const newVersionId = Number(data?.version_id ?? data?.versionId ?? 0);
            alert('Import monografii zakończony, versionId=' + (newVersionId || 'n/a'));

            await fetchMonoVersions(0, mvPageMeta.size);
            if (newVersionId > 0) setSelectedMonoVersionId(newVersionId);

            setMFile(null);
            setMLabel('');
        } catch (err: any) {
            alert('Błąd importu monografii: ' + (err?.message ?? err));
        } finally {
            setMUploading(false);
        }
    }

    async function deleteMonoVersion(versionId: number) {
        if (!confirm(`Usunąć wersję monografii v${versionId} (asynchronicznie)?`)) return;
        try {
            const res = await authFetch(`/api/etl/admin/deleteMeinMonoVersion?versionId=${versionId}`, { method: 'DELETE' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            const data = text ? JSON.parse(text) : null;
            const jobId = Number(data?.jobId ?? 0);

            if (!jobId) {
                alert('Usuwanie uruchomione, ale brak jobId w odpowiedzi');
                return;
            }

            setJobs((prev) => [
                {
                    jobId,
                    scope: 'MONO',
                    versionId,
                    status: 'RUNNING',
                    type: 'DELETE_MEIN_MONO_VERSION',
                    error: null,
                    createdAt: Date.now(),
                    done: false,
                },
                ...prev,
            ]);

            fetchMonoVersions(mvPageMeta.page, mvPageMeta.size);
        } catch (err: any) {
            alert('Błąd usuwania monografii: ' + (err?.message ?? err));
        }
    }


    async function openMonoVersionDetails(versionId: number) {
        setMonoVersionModalOpen(true);
        setMonoVersionModalLoading(true);
        setMonoVersionModalError(null);
        setMonoVersionModalData(null);

        try {
            const res = await authFetch(`/api/etl/admin/getMeinMonoVersion?versionId=${versionId}`, { method: 'GET' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
            const data = text ? JSON.parse(text) : null;
            setMonoVersionModalData(data);
        } catch (e: any) {
            setMonoVersionModalError(String(e?.message ?? e));
        } finally {
            setMonoVersionModalLoading(false);
        }
    }

    async function openPublisherDetails(publisherId: number) {
        setPublisherModalOpen(true);
        setPublisherModalLoading(true);
        setPublisherModalError(null);
        setPublisherModalData(null);

        try {
            const res = await authFetch(`/api/etl/admin/getMeinMonoPublisher?publisherId=${publisherId}`, { method: 'GET' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
            const data = text ? JSON.parse(text) : null;
            setPublisherModalData(data);
        } catch (e: any) {
            setPublisherModalError(String(e?.message ?? e));
        } finally {
            setPublisherModalLoading(false);
        }
    }

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    // ===================== UI helpers =====================
    const jobsForTab = jobs.filter((j) => (tab === 'articles' ? j.scope === 'MEIN' : j.scope === 'MONO'));

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — ETL</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className={tab === 'articles' ? styles.primaryBtn : styles.ghostBtn}
                        onClick={() => setTab('articles')}
                    >
                        Zarządzaj artykułami
                    </button>
                    <button className={tab === 'monos' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('monos')}>
                        Zarządzaj monografiami
                    </button>
                </div>
            </header>

            {/* ===================== TAB: MEiN ===================== */}
            {tab === 'articles' && (
                <div className={styles.contentRow}>
                    <div className={styles.leftColumn}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                marginBottom: 12,
                            }}
                        >
                            <h2 style={{ margin: 0 }}>Wersje MEiN</h2>
                            <button className={styles.ghostBtn} onClick={() => fetchMeinVersions(vPageMeta.page, vPageMeta.size)} disabled={vLoading}>
                                Odśwież
                            </button>
                        </div>

                        {vLoading ? (
                            <div className={styles.loading}>Ładowanie…</div>
                        ) : vError ? (
                            <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                                Błąd: {vError}
                            </div>
                        ) : versions.length === 0 ? (
                            <div className={styles.empty}>Brak wersji</div>
                        ) : (
                            <div className={styles.cardsGrid}>
                                {versions.map((v: any) => {
                                    const id = Number(v?.id ?? v?.versionId ?? v?.version_id);
                                    const isSelected = selectedVersionId === id;
                                    const label = v?.label ?? '—';

                                    return (
                                        <div
                                            key={id}
                                            className={styles.cardSmall}
                                            style={isSelected ? { outline: '2px solid rgba(109,40,217,0.18)' } : undefined}
                                            onClick={() => setSelectedVersionId(id)}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className={styles.cardTop}>
                                                <div className={styles.avatarSmall}>{`V${id}`}</div>
                                                <div className={styles.cardMeta}>
                                                    <div className={styles.name}>{label}</div>
                                                    <div className={styles.muted}>wersja: v{id}</div>
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom}>
                                                <div className={styles.badgeRow}>
                                                    <span className={`${styles.badge} ${styles.badgeWorker}`}>MEiN</span>
                                                </div>

                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        className={styles.infoBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openMeinVersionDetailsFromList(v);
                                                        }}
                                                    >
                                                        Szczegóły
                                                    </button>
                                                    <button
                                                        className={styles.dangerBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteMeinVersion(id);
                                                        }}
                                                    >
                                                        Usuń
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className={styles.pagerWrap}>
                            <button
                                className={styles.pageBtn}
                                disabled={vLoading || (vPageMeta.page ?? 0) <= 0}
                                onClick={() => fetchMeinVersions(Math.max(0, (vPageMeta.page ?? 0) - 1), vPageMeta.size)}
                            >
                                ← Poprzednia
                            </button>
                            <button className={styles.pageBtn} disabled={vLoading} onClick={() => fetchMeinVersions((vPageMeta.page ?? 0) + 1, vPageMeta.size)}>
                                Następna →
                            </button>
                            <div className={styles.pageInfo}>
                                strona: {vPageMeta.page ?? 0} • size: {vPageMeta.size ?? 20}
                            </div>
                        </div>

                        <div className={styles.bigCardFull} style={{ marginTop: 18 }}>
                            <div className={styles.cardHeader}>
                                <div
                                    className={styles.bigAvatar}>{selectedVersionId ? `V${selectedVersionId}` : '—'}</div>
                                <div>
                                    <h3 className={styles.cardTitle}>
                                        {selectedVersionId ? `Lista czasopism (v${selectedVersionId})` : 'Lista czasopism'}
                                    </h3>
                                    <div className={styles.muted}>
                                        {selectedVersion ? `label: ${selectedVersion.label ?? '—'}` : 'Wybierz wersję po lewej.'}
                                    </div>
                                </div>
                                <div
                                    style={{
                                        marginLeft: 'auto',
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        justifyContent: 'flex-end',
                                    }}
                                >
                                    <input
                                        className={styles.searchInput}
                                        placeholder="Szukaj czasopisma po tytule…"
                                        value={journalTitleInput}
                                        onChange={(e) => setJournalTitleInput(e.target.value)}
                                        style={{minWidth: 260}}
                                    />

                                    <button
                                        className={styles.primaryBtn}
                                        disabled={!selectedVersionId || jLoading}
                                        onClick={() => {
                                            if (!selectedVersionId) return;
                                            const q = journalTitleInput.trim();
                                            setJournalTitleQuery(q);
                                            fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, q);
                                        }}
                                    >
                                        Szukaj
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedVersionId || jLoading}
                                        onClick={() => {
                                            if (!selectedVersionId) return;
                                            setJournalTitleInput('');
                                            setJournalTitleQuery('');
                                            fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, '');
                                        }}
                                    >
                                        Reset
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedVersionId || jLoading}
                                        onClick={() => selectedVersionId && fetchMeinJournals(selectedVersionId, jPageMeta.page, jPageMeta.size, journalTitleQuery)}
                                    >
                                        Odśwież
                                    </button>
                                </div>

                            </div>

                            {jLoading ? (
                                <div className={styles.loading}>Ładowanie…</div>
                            ) : jError ? (
                                <div className={styles.empty} style={{whiteSpace: 'pre-wrap'}}>
                                    Błąd: {jError}
                                </div>
                            ) : !selectedVersionId ? (
                                <div className={styles.empty}>Wybierz wersję po lewej.</div>
                            ) : journals.length === 0 ? (
                                <div className={styles.empty}>Brak danych</div>
                            ) : (
                                <>
                                    <div className={styles.disciplines}>
                                        {journals.map((j: any) => {
                                            const jid = Number(j?.id ?? j?.journalId ?? 0);

                                            const issnLine = [j.issn, j.issn2].filter((x) => x && String(x).trim()).join(' • ');
                                            const eissnLine = [j.eissn, j.eissn2].filter((x) => x && String(x).trim()).join(' • ');
                                            const metaParts: string[] = [];
                                            if (issnLine) metaParts.push(`ISSN: ${issnLine}`);
                                            if (eissnLine) metaParts.push(`EISSN: ${eissnLine}`);
                                            if (j.points != null && String(j.points).trim() !== '') metaParts.push(`${j.points} pkt`);

                                            return (
                                                <div key={j.uid ?? jid} className={styles.disciplineItem}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ fontWeight: 900 }}>{j.title1 ?? j.title ?? j.uid ?? '—'}</div>
                                                        <div className={styles.muted}>{metaParts.length ? metaParts.join('  |  ') : '—'}</div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className={styles.infoBtn} onClick={() => openJournalDetails(selectedVersionId, jid)}>
                                                            Szczegóły
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className={styles.pagerWrap}>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={jLoading || (jPageMeta.page ?? 0) <= 0}
                                            onClick={() =>
                                                selectedVersionId &&
                                                fetchMeinJournals(selectedVersionId, Math.max(0, (jPageMeta.page ?? 0) - 1), jPageMeta.size, journalTitleQuery)
                                            }

                                        >
                                            ← Poprzednia
                                        </button>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={jLoading}
                                            onClick={() =>
                                                selectedVersionId &&
                                                fetchMeinJournals(selectedVersionId, (jPageMeta.page ?? 0) + 1, jPageMeta.size, journalTitleQuery)
                                            }

                                        >
                                            Następna →
                                        </button>
                                        <div className={styles.pageInfo}>
                                            strona: {jPageMeta.page ?? 0} • size: {jPageMeta.size ?? 20}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className={styles.rightColumn}>
                        <div className={styles.actionsCard}>
                            <h3>Import nowej wersji (MEiN)</h3>
                            <p>Excel</p>

                            <form onSubmit={importMein} style={{ display: 'grid', gap: 10 }}>
                                <input type="file" accept=".xml,.zip,.csv" onChange={(e) => setAFile(e.target.files?.[0] ?? null)} />
                                <input className={styles.searchInput} placeholder="label" value={aLabel} onChange={(e) => setALabel(e.target.value)} />
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button className={styles.primaryBtn} type="submit" disabled={aUploading}>
                                        {aUploading ? 'Wysyłanie…' : 'Importuj'}
                                    </button>
                                    <button type="button" className={styles.ghostBtn} onClick={() => { setAFile(null); setALabel(''); }}>
                                        Wyczyść
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className={styles.actionsCard} style={{ marginTop: 16 }}>
                            <h3>Zadania (MEiN)</h3>
                            <p>Statusy jobów aktualizują się automatycznie.</p>

                            {jobsForTab.length === 0 ? (
                                <div className={styles.muted}>Brak uruchomionych zadań.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {jobsForTab.slice(0, 8).map((j) => (
                                        <div
                                            key={j.jobId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 10,
                                                padding: 10,
                                                borderRadius: 12,
                                                border: '1px solid var(--border)',
                                                background: 'linear-gradient(180deg,#fff,#fcfdff)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ fontWeight: 900 }}>
                                                    jobId: {j.jobId} {j.versionId ? `• v${j.versionId}` : ''}
                                                </div>
                                                <div className={styles.muted}>{j.type ?? '—'} {j.error ? `• error: ${j.error}` : ''}</div>
                                            </div>
                                            <span className={`${styles.badge} ${badgeClassForJob(j.status)}`}>{j.status ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===================== TAB: MONOGRAPHS ===================== */}
            {tab === 'monos' && (
                <div className={styles.contentRow}>
                    <div className={styles.leftColumn}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                marginBottom: 12,
                            }}
                        >
                            <h2 style={{ margin: 0 }}>Wersje monografii</h2>
                            <button className={styles.ghostBtn} onClick={() => fetchMonoVersions(mvPageMeta.page, mvPageMeta.size)} disabled={mvLoading}>
                                Odśwież
                            </button>
                        </div>

                        {mvLoading ? (
                            <div className={styles.loading}>Ładowanie…</div>
                        ) : mvError ? (
                            <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                                Błąd: {mvError}
                            </div>
                        ) : monoVersions.length === 0 ? (
                            <div className={styles.empty}>Brak wersji monografii</div>
                        ) : (
                            <div className={styles.cardsGrid}>
                                {monoVersions.map((v: any) => {
                                    const id = Number(v?.id ?? v?.versionId ?? v?.version_id);
                                    const isSelected = selectedMonoVersionId === id;
                                    const label = v?.label ?? '—';

                                    return (
                                        <div
                                            key={id}
                                            className={styles.cardSmall}
                                            style={isSelected ? { outline: '2px solid rgba(109,40,217,0.18)' } : undefined}
                                            onClick={() => setSelectedMonoVersionId(id)}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className={styles.cardTop}>
                                                <div className={styles.avatarSmall}>{`M${id}`}</div>
                                                <div className={styles.cardMeta}>
                                                    <div className={styles.name}>{label}</div>
                                                    <div className={styles.muted}>wersja: v{id}</div>
                                                </div>
                                            </div>

                                            <div className={styles.cardBottom}>
                                                <div className={styles.badgeRow}>
                                                    <span className={`${styles.badge} ${styles.badgeMuted}`}>MONO</span>
                                                </div>

                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        className={styles.infoBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openMonoVersionDetails(id);
                                                        }}
                                                    >
                                                        Szczegóły
                                                    </button>
                                                    <button
                                                        className={styles.dangerBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteMonoVersion(id);
                                                        }}
                                                    >
                                                        Usuń
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className={styles.pagerWrap}>
                            <button
                                className={styles.pageBtn}
                                disabled={mvLoading || (mvPageMeta.page ?? 0) <= 0}
                                onClick={() => fetchMonoVersions(Math.max(0, (mvPageMeta.page ?? 0) - 1), mvPageMeta.size)}
                            >
                                ← Poprzednia
                            </button>
                            <button className={styles.pageBtn} disabled={mvLoading} onClick={() => fetchMonoVersions((mvPageMeta.page ?? 0) + 1, mvPageMeta.size)}>
                                Następna →
                            </button>
                            <div className={styles.pageInfo}>
                                strona: {mvPageMeta.page ?? 0} • size: {mvPageMeta.size ?? 20}
                            </div>
                        </div>

                        <div className={styles.bigCardFull} style={{ marginTop: 18 }}>
                            <div className={styles.cardHeader}>
                                <div
                                    className={styles.bigAvatar}>{selectedMonoVersionId ? `M${selectedMonoVersionId}` : '—'}</div>
                                <div>
                                    <h3 className={styles.cardTitle}>
                                        {selectedMonoVersionId ? `Publisherzy (v${selectedMonoVersionId})` : 'Publisherzy'}
                                    </h3>
                                    <div className={styles.muted}>
                                        {selectedMonoVersion ? `label: ${selectedMonoVersion.label ?? '—'}` : 'Wybierz wersję po lewej.'}
                                    </div>
                                </div>
                                <div style={{
                                    marginLeft: 'auto',
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end'
                                }}>
                                    <input
                                        className={styles.searchInput}
                                        placeholder="Szukaj publishera po tytule…"
                                        value={publisherTitleInput}
                                        onChange={(e) => setPublisherTitleInput(e.target.value)}
                                        style={{minWidth: 260}}
                                    />

                                    <button
                                        className={styles.primaryBtn}
                                        disabled={!selectedMonoVersionId || pLoading}
                                        onClick={() => {
                                            if (!selectedMonoVersionId) return;
                                            const q = publisherTitleInput.trim();
                                            setPublisherTitleQuery(q);
                                            fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, q);
                                        }}
                                    >
                                        Szukaj
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedMonoVersionId || pLoading}
                                        onClick={() => {
                                            if (!selectedMonoVersionId) return;
                                            setPublisherTitleInput('');
                                            setPublisherTitleQuery('');
                                            fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, '');
                                        }}
                                    >
                                        Reset
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedMonoVersionId || pLoading}
                                        onClick={() => selectedMonoVersionId && fetchMonoPublishers(selectedMonoVersionId, pPageMeta.page, pPageMeta.size, publisherTitleQuery)}
                                    >
                                        Odśwież
                                    </button>
                                </div>
                            </div>

                            {pLoading ? (
                                <div className={styles.loading}>Ładowanie…</div>
                            ) : pError ? (
                                <div className={styles.empty} style={{whiteSpace: 'pre-wrap'}}>
                                    Błąd: {pError}
                                </div>
                            ) : !selectedMonoVersionId ? (
                                <div className={styles.empty}>Wybierz wersję po lewej.</div>
                            ) : publishers.length === 0 ? (
                                <div className={styles.empty}>Brak danych</div>
                            ) : (
                                <>
                                    <div className={styles.disciplines}>
                                        {publishers.map((p: any) => {
                                            const pid = Number(p?.publisherId ?? p?.id ?? 0);
                                            const title = p?.name ?? p?.title ?? p?.publisherName ?? `Publisher #${pid || '—'}`;

                                            const metaParts: string[] = [];
                                            if (pid) metaParts.push(`id: ${pid}`);
                                            if (p?.points != null) metaParts.push(`pkt: ${p.points}`);
                                            if (p?.monographs != null) metaParts.push(`mono: ${p.monographs}`);
                                            if (p?.items != null) metaParts.push(`items: ${p.items}`);

                                            return (
                                                <div key={pid || title} className={styles.disciplineItem}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ fontWeight: 900 }}>{title}</div>
                                                        <div className={styles.muted}>{metaParts.length ? metaParts.join('  |  ') : '—'}</div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className={styles.infoBtn} onClick={() => pid && openPublisherDetails(pid)} disabled={!pid}>
                                                            Szczegóły
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className={styles.pagerWrap}>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={pLoading || (pPageMeta.page ?? 0) <= 0}
                                            onClick={() =>
                                                selectedMonoVersionId &&
                                                fetchMonoPublishers(selectedMonoVersionId, Math.max(0, (pPageMeta.page ?? 0) - 1), pPageMeta.size, publisherTitleQuery)
                                            }
                                        >
                                            ← Poprzednia
                                        </button>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={pLoading}
                                            onClick={() =>
                                                selectedMonoVersionId &&
                                                fetchMonoPublishers(selectedMonoVersionId, (pPageMeta.page ?? 0) + 1, pPageMeta.size, publisherTitleQuery)
                                            }

                                        >
                                            Następna →
                                        </button>
                                        <div className={styles.pageInfo}>
                                            strona: {pPageMeta.page ?? 0} • size: {pPageMeta.size ?? 20}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className={styles.rightColumn}>
                        <div className={styles.actionsCard}>
                            <h3>Import monografii</h3>
                            <p>PDF</p>

                            <form onSubmit={importMono} style={{ display: 'grid', gap: 10 }}>
                                <input type="file" accept=".pdf,.zip" onChange={(e) => setMFile(e.target.files?.[0] ?? null)} />
                                <input className={styles.searchInput} placeholder="label" value={mLabel} onChange={(e) => setMLabel(e.target.value)} />
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button className={styles.primaryBtn} type="submit" disabled={mUploading}>
                                        {mUploading ? 'Wysyłanie…' : 'Importuj'}
                                    </button>
                                    <button type="button" className={styles.ghostBtn} onClick={() => { setMFile(null); setMLabel(''); }}>
                                        Wyczyść
                                    </button>
                                </div>
                            </form>
                        </div>



                        <div className={styles.actionsCard} style={{ marginTop: 16 }}>
                            <h3>Zadania (MONO)</h3>
                            <p>Statusy jobów aktualizują się automatycznie.</p>

                            {jobsForTab.length === 0 ? (
                                <div className={styles.muted}>Brak uruchomionych zadań.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {jobsForTab.slice(0, 8).map((j) => (
                                        <div
                                            key={j.jobId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 10,
                                                padding: 10,
                                                borderRadius: 12,
                                                border: '1px solid var(--border)',
                                                background: 'linear-gradient(180deg,#fff,#fcfdff)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ fontWeight: 900 }}>
                                                    jobId: {j.jobId} {j.versionId ? `• v${j.versionId}` : ''}
                                                </div>
                                                <div className={styles.muted}>{j.type ?? '—'} {j.error ? `• error: ${j.error}` : ''}</div>
                                            </div>
                                            <span className={`${styles.badge} ${badgeClassForJob(j.status)}`}>{j.status ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===================== MODALS: MEiN ===================== */}
            <Modal
                open={versionModalOpen}
                title="Szczegóły wersji MEiN"
                onClose={() => {
                    setVersionModalOpen(false);
                    setVersionDetails(null);
                }}
            >
                {!versionDetails ? (
                    <div className={styles.empty}>Brak danych.</div>
                ) : (
                    <div className={styles.kvGrid}>
                        <div className={styles.kvKey}>ID</div>
                        <div className={styles.kvVal}>{versionDetails.id ?? versionDetails.versionId ?? '—'}</div>

                        <div className={styles.kvKey}>Label</div>
                        <div className={styles.kvVal}>{versionDetails.label ?? '—'}</div>

                        <div className={styles.kvKey}>Source filename</div>
                        <div className={styles.kvVal}>{versionDetails.sourceFilename ?? '—'}</div>

                        <div className={styles.kvKey}>Journals</div>
                        <div className={styles.kvVal}>{versionDetails.journals ?? '—'}</div>

                        <div className={styles.kvKey}>Journal codes</div>
                        <div className={styles.kvVal}>{versionDetails.journalCodes ?? '—'}</div>

                        {'active' in versionDetails && (
                            <>
                                <div className={styles.kvKey}>Active</div>
                                <div className={styles.kvVal}>{String(!!versionDetails.active)}</div>
                            </>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                open={journalModalOpen}
                title="Szczegóły czasopisma"
                onClose={() => {
                    setJournalModalOpen(false);
                    setJournalModalData(null);
                    setJournalModalError(null);
                }}
            >
                {journalModalLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : journalModalError ? (
                    <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                        Błąd: {journalModalError}
                    </div>
                ) : journalModalData ? (
                    <>
                        <div className={styles.kvGrid} style={{ marginBottom: 12 }}>
                            <div className={styles.kvKey}>UID</div>
                            <div className={styles.kvVal}>{journalModalData?.uid ?? '—'}</div>

                            <div className={styles.kvKey}>Tytuł 1</div>
                            <div className={styles.kvVal}>{journalModalData?.title1 ?? '—'}</div>

                            <div className={styles.kvKey}>Tytuł 2</div>
                            <div className={styles.kvVal}>{journalModalData?.title2 ?? '—'}</div>

                            <div className={styles.kvKey}>ISSN</div>
                            <div className={styles.kvVal}>{journalModalData?.issn ?? '—'}</div>

                            <div className={styles.kvKey}>ISSN (2)</div>
                            <div className={styles.kvVal}>{journalModalData?.issn2 ?? '—'}</div>

                            <div className={styles.kvKey}>EISSN</div>
                            <div className={styles.kvVal}>{journalModalData?.eissn ?? '—'}</div>

                            <div className={styles.kvKey}>EISSN (2)</div>
                            <div className={styles.kvVal}>{journalModalData?.eissn2 ?? '—'}</div>

                            <div className={styles.kvKey}>Punkty</div>
                            <div className={styles.kvVal}>{journalModalData?.points ?? '—'}</div>
                        </div>

                        <h4 style={{ margin: '10px 0' }}>Kody</h4>
                        {!Array.isArray(journalModalData?.codes) || journalModalData.codes.length === 0 ? (
                            <div className={styles.muted}>Brak kodów.</div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {journalModalData.codes.slice(0, 80).map((c: any, idx: number) => (
                                    <span key={idx} className={`${styles.badge} ${styles.badgeMuted}`}>
                    {c.code} — {c.name}
                  </span>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.empty}>Brak danych.</div>
                )}
            </Modal>

            {/* ===================== MODALS: MONO ===================== */}
            <Modal
                open={monoVersionModalOpen}
                title="Szczegóły wersji monografii"
                onClose={() => {
                    setMonoVersionModalOpen(false);
                    setMonoVersionModalData(null);
                    setMonoVersionModalError(null);
                }}
            >
                {monoVersionModalLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : monoVersionModalError ? (
                    <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                        Błąd: {monoVersionModalError}
                    </div>
                ) : monoVersionModalData ? (
                    <>
                        <div className={styles.kvGrid} style={{ marginBottom: 12 }}>
                            <div className={styles.kvKey}>ID</div>
                            <div className={styles.kvVal}>{monoVersionModalData?.id ?? '—'}</div>

                            <div className={styles.kvKey}>Label</div>
                            <div className={styles.kvVal}>{monoVersionModalData?.label ?? '—'}</div>

                            <div className={styles.kvKey}>Source filename</div>
                            <div className={styles.kvVal}>{monoVersionModalData?.sourceFilename ?? monoVersionModalData?.filename ?? '—'}</div>

                            {'publishers' in monoVersionModalData && (
                                <>
                                    <div className={styles.kvKey}>Publishers</div>
                                    <div className={styles.kvVal}>{monoVersionModalData?.publishers ?? '—'}</div>
                                </>
                            )}
                        </div>

                        <details>
                            <summary className={styles.muted} style={{ cursor: 'pointer' }}>
                                Pokaż JSON (debug)
                            </summary>
                            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(monoVersionModalData, null, 2)}</pre>
                        </details>
                    </>
                ) : (
                    <div className={styles.empty}>Brak danych.</div>
                )}
            </Modal>

            <Modal
                open={publisherModalOpen}
                title="Szczegóły publishera"
                onClose={() => {
                    setPublisherModalOpen(false);
                    setPublisherModalData(null);
                    setPublisherModalError(null);
                }}
            >
                {publisherModalLoading ? (
                    <div className={styles.loading}>Ładowanie…</div>
                ) : publisherModalError ? (
                    <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
                        Błąd: {publisherModalError}
                    </div>
                ) : publisherModalData ? (
                    <>
                        <div className={styles.kvGrid} style={{ marginBottom: 12 }}>
                            <div className={styles.kvKey}>ID</div>
                            <div className={styles.kvVal}>{publisherModalData?.id ?? publisherModalData?.publisherId ?? '—'}</div>

                            <div className={styles.kvKey}>Nazwa</div>
                            <div className={styles.kvVal}>{publisherModalData?.name ?? publisherModalData?.publisherName ?? publisherModalData?.title ?? '—'}</div>

                            {'points' in publisherModalData && (
                                <>
                                    <div className={styles.kvKey}>Punkty</div>
                                    <div className={styles.kvVal}>{publisherModalData?.points ?? '—'}</div>
                                </>
                            )}

                            {'monographs' in publisherModalData && (
                                <>
                                    <div className={styles.kvKey}>Monografie</div>
                                    <div className={styles.kvVal}>{publisherModalData?.monographs ?? '—'}</div>
                                </>
                            )}
                        </div>

                        <details>
                            <summary className={styles.muted} style={{ cursor: 'pointer' }}>
                                Pokaż JSON (debug)
                            </summary>
                            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(publisherModalData, null, 2)}</pre>
                        </details>
                    </>
                ) : (
                    <div className={styles.empty}>Brak danych.</div>
                )}
            </Modal>
        </div>
    );
}

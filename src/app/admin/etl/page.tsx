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
    progressPercent?: number;
    phase?: string;
    message?: string;
    createdAt: number;
    done: boolean;
};

type InlineMsg = { kind: 'error' | 'success' | 'info'; text: string } | null;

function InlineNotice({ msg }: { msg: InlineMsg }) {
    if (!msg) return null;

    const base: React.CSSProperties = {
        fontSize: 12,
        fontWeight: 700,
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        whiteSpace: 'pre-wrap',
    };

    const style: React.CSSProperties =
        msg.kind === 'error'
            ? { ...base, background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }
            : msg.kind === 'success'
                ? { ...base, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }
                : { ...base, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' };

    return <div style={style}>{msg.text}</div>;
}

function FieldError({ text }: { text?: string | null }) {
    if (!text) return null;
    return (
        <div style={{ fontSize: 12, fontWeight: 800, color: '#9f1239', marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {text}
        </div>
    );
}

function isJobDone(status?: string) {
    const s = String(status ?? '').toUpperCase();
    return ['GOTOWE', 'POWODZENIE', 'ZAKOŃCZONE', 'NIEPOWODZENIE', 'BŁĄD', 'ANULOWANE', 'DONE', 'SUCCESS', 'FINISHED', 'FAILED', 'ERROR', 'CANCELLED'].includes(s);
}

function badgeClassForJob(status?: string) {
    const s = String(status ?? '').toUpperCase();
    if (s === 'RUNNING' || s === 'IN_PROGRESS' || s === 'PENDING' || s === 'QUEUED') return styles.badgeWorker;
    if (s === 'DONE' || s === 'SUCCESS' || s === 'FINISHED') return styles.badgeMuted;
    if (s === 'FAILED' || s === 'ERROR') return styles.badgeAdmin;
    return styles.badgeMuted;
}

function translateBackendMessage(msg: string): string {
    const m = String(msg || '').trim();
    if (!m) return 'Wystąpił błąd.';

    // ETL / MEiN / MONO – z Twoich serwisów
    if (m === 'Not found the mein version') return 'Nie znaleziono wersji MEiN.';
    if (m === 'No MEiN article version with this id') return 'Nie ma wersji MEiN (artykuły) o takim ID.';
    if (m === 'Not found the cycle') return 'Nie znaleziono cyklu ewaluacji.';
    if (m === 'This version is already active') return 'Ta wersja jest już aktywna.';
    if (m === 'This mein is now active') return 'Wersja MEiN została ustawiona jako aktywna.';
    if (m === 'This version is already deactivate') return 'Ta wersja jest już zdezaktywowana.';
    if (m === 'This mein is now deactivate') return 'Wersja MEiN została zdezaktywowana.';

    if (m === 'Mein version mono not found') return 'Nie znaleziono wersji MEiN (monografie).';
    if (m === 'Mein publisher not found') return 'Nie znaleziono wydawnictwa (publisher).';
    if (m === 'Not found the mein mono version') return 'Nie znaleziono wersji MEiN (monografie).';
    if (m === 'No MeinMonoVersion with this id') return 'Nie ma wersji monografii o takim ID.';

    if (m === 'MEiN version deletion started or already in progress')
        return 'Usuwanie wersji MEiN (artykuły) zostało uruchomione lub już trwa.';
    if (m === 'MEiN mono version deletion started or already in progress')
        return 'Usuwanie wersji MEiN (monografie) zostało uruchomione lub już trwa.';

    if (m === 'Article recalculation started or already in progress')
        return 'Przeliczanie punktów (artykuły) zostało uruchomione lub już trwa.';
    if (m === 'Monograph cycle recalculation started or already in progress')
        return 'Przeliczanie punktów (monografie) zostało uruchomione lub już trwa.';

    // ogólne
    if (m === 'Job not found') return 'Nie znaleziono zadania.';
    return m;
}

function parseErrorText(text: string, status: number) {
    const t = String(text || '').trim();
    if (!t) return `Błąd (${status}).`;

    try {
        const json = JSON.parse(t);
        const msg = json?.message || json?.error || json?.detail || t;
        return translateBackendMessage(String(msg));
    } catch {
        return translateBackendMessage(t);
    }
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

function ConfirmModal(props: {
    open: boolean;
    title: string;
    message: string;
    loading?: boolean;
    confirmText?: string;
    cancelText?: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    if (!props.open) return null;

    return (
        <div className={styles.modalOverlay} onMouseDown={props.onCancel}>
            <div className={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>{props.title}</h3>
                    <button className={styles.ghostBtn} onClick={props.onCancel} disabled={props.loading}>
                        {props.cancelText ?? 'Anuluj'}
                    </button>
                </div>

                <div style={{ padding: 12, whiteSpace: 'pre-line' }}>{props.message}</div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, paddingTop: 0 }}>
                    <button className={styles.ghostBtn} onClick={props.onCancel} disabled={props.loading}>
                        {props.cancelText ?? 'Anuluj'}
                    </button>
                    <button className={styles.primaryBtn} onClick={props.onConfirm} disabled={props.loading}>
                        {props.loading ? 'Trwa…' : props.confirmText ?? 'Potwierdź'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ETLAdminPage() {
    const { initialized } = useAuth();
    const [tab, setTab] = useState<'articles' | 'monos'>('articles');

    // lokalne komunikaty (przy imporcie, bez belki u góry)
    const [meinMsg, setMeinMsg] = useState<InlineMsg>(null);
    const [monoMsg, setMonoMsg] = useState<InlineMsg>(null);
    const meinMsgT = useRef<number | null>(null);
    const monoMsgT = useRef<number | null>(null);

    function pushMein(kind: NonNullable<InlineMsg>['kind'], text: string) {
        setMeinMsg({ kind, text });
        if (meinMsgT.current) window.clearTimeout(meinMsgT.current);
        meinMsgT.current = window.setTimeout(() => setMeinMsg(null), 4500);
    }

    function pushMono(kind: NonNullable<InlineMsg>['kind'], text: string) {
        setMonoMsg({ kind, text });
        if (monoMsgT.current) window.clearTimeout(monoMsgT.current);
        monoMsgT.current = window.setTimeout(() => setMonoMsg(null), 4500);
    }

    useEffect(() => {
        setMeinMsg(null);
        setMonoMsg(null);
    }, [tab]);

    // confirm modal
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('');
    const [confirmMessage, setConfirmMessage] = useState('');
    const confirmActionRef = useRef<(() => Promise<void>) | null>(null);

    function openConfirm(title: string, message: string, action: () => Promise<void>) {
        setConfirmTitle(title);
        setConfirmMessage(message);
        confirmActionRef.current = action;
        setConfirmOpen(true);
    }
    function closeConfirm() {
        setConfirmOpen(false);
        confirmActionRef.current = null;
    }

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
    const [aFileErr, setAFileErr] = useState<string | null>(null);
    const [aLabelErr, setALabelErr] = useState<string | null>(null);

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
    const [mFileErr, setMFileErr] = useState<string | null>(null);
    const [mLabelErr, setMLabelErr] = useState<string | null>(null);

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
        void fetchMeinVersions(0, vPageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // ---------------- when select MEiN version -> journals ----------------
    useEffect(() => {
        if (!initialized) return;

        if (!selectedVersionId) {
            setJournals([]);
            return;
        }

        setJournalTitleInput('');
        setJournalTitleQuery('');
        void fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedVersionId, initialized]);

    // ---------------- when switch to monographs first time -> load mono versions ----------------
    useEffect(() => {
        if (!initialized) return;
        if (tab !== 'monos') return;
        if (monoVersions.length > 0) return;
        void fetchMonoVersions(0, mvPageMeta.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, initialized]);

    // ---------------- when select mono version -> publishers ----------------
    useEffect(() => {
        if (!initialized) return;

        if (!selectedMonoVersionId) {
            setPublishers([]);
            return;
        }

        setPublisherTitleInput('');
        setPublisherTitleQuery('');
        void fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, '');
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
            void pollJobsOnce();
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
                                    progressPercent: data?.progressPercent ?? x.progressPercent,
                                    phase: data?.phase ?? x.phase,
                                    message: data?.message ?? x.message,
                                    done,
                                }
                                : x
                        )
                    );

                    if (done) {
                        if (j.scope === 'MEIN') {
                            void fetchMeinVersions(vPageMeta.page, vPageMeta.size);
                            if (selectedVersionId) void fetchMeinJournals(selectedVersionId, jPageMeta.page, jPageMeta.size, journalTitleQuery);
                        } else {
                            void fetchMonoVersions(mvPageMeta.page, mvPageMeta.size);
                            if (selectedMonoVersionId) void fetchMonoPublishers(selectedMonoVersionId, pPageMeta.page, pPageMeta.size, publisherTitleQuery);
                        }
                    }
                } catch {
                    // ignoruj polling
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
                const msg = parseErrorText(text, res.status);
                setVError(msg);
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];
            const meta = data?.pageMeta ?? data?.page ?? data?.page_meta ?? { page, size };

            setVersions(Array.isArray(items) ? items : []);
            setVPageMeta(meta);

            if (!selectedVersionId && Array.isArray(items) && items.length > 0) {
                const first = items[0];
                const id = Number(first?.id ?? first?.versionId ?? first?.version_id);
                if (id > 0) setSelectedVersionId(id);
            }
        } catch (e: any) {
            setVersions([]);
            setVError(translateBackendMessage(String(e?.message ?? e)));
        } finally {
            setVLoading(false);
        }
    }

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
                setJError(parseErrorText(text, res.status));
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.meinJournals ?? [];
            const meta = data?.pageMeta ?? data?.page ?? data?.page_meta ?? { page, size };

            setJournals(Array.isArray(items) ? items : []);
            setJPageMeta(meta);
        } catch (e: any) {
            setJournals([]);
            setJError(translateBackendMessage(String(e?.message ?? e)));
        } finally {
            setJLoading(false);
        }
    }

    async function importMein(e?: React.FormEvent) {
        e?.preventDefault();

        setAFileErr(null);
        setALabelErr(null);

        let ok = true;
        if (!aFile) {
            setAFileErr('Wybierz plik.');
            ok = false;
        }
        if (!aLabel.trim()) {
            setALabelErr('Podaj label.');
            ok = false;
        }
        if (!ok) {
            pushMein('error', 'Uzupełnij wymagane pola.');
            return;
        }

        setAUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', aFile!);
            fd.append('label', aLabel.trim());

            const res = await authFetch('/api/etl/admin/import', { method: 'POST', body: fd as any } as RequestInit);
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(parseErrorText(text, res.status));

            const data = text ? JSON.parse(text) : null;

            if (data?.alreadyImported) {
                pushMein('info', 'Plik został już zaimportowany wcześniej.');
                await fetchMeinVersions(0, vPageMeta.size);
                return;
            }

            const newVersionId = Number(data?.versionId ?? data?.version_id ?? 0);
            pushMein('success', newVersionId > 0 ? `Import zakończony (wersja v${newVersionId}).` : 'Import zakończony.');

            await fetchMeinVersions(0, vPageMeta.size);
            if (newVersionId > 0) setSelectedVersionId(newVersionId);

            setAFile(null);
            setALabel('');
        } catch (err: any) {
            pushMein('error', err?.message ?? 'Błąd importu.');
        } finally {
            setAUploading(false);
        }
    }

    async function deleteMeinVersion(versionId: number, label?: string) {
        openConfirm(
            'Usuń wersję MEiN',
            `Czy na pewno chcesz usunąć wersję MEiN (artykuły)?\n${label ? `Label: ${label}\n` : ''}Wersja: v${versionId}\n\nOperacja uruchomi zadanie asynchroniczne.`,
            async () => {
                try {
                    const res = await authFetch(`/api/etl/admin/deleteMeinVersion?versionId=${versionId}`, { method: 'DELETE' });
                    const text = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(parseErrorText(text, res.status));

                    const data = text ? JSON.parse(text) : null;
                    const jobId = Number(data?.jobId ?? 0);

                    pushMein('success', translateBackendMessage(String(data?.message ?? 'Zadanie usuwania uruchomione.')));

                    if (jobId) {
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
                    }

                    await fetchMeinVersions(vPageMeta.page, vPageMeta.size);
                    closeConfirm();
                } catch (err: any) {
                    pushMein('error', err?.message ?? 'Błąd usuwania.');
                    closeConfirm();
                }
            }
        );
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
            if (!res.ok) throw new Error(parseErrorText(text, res.status));

            const data = text ? JSON.parse(text) : null;
            setJournalModalData(data?.item ?? data);
        } catch (e: any) {
            setJournalModalError(translateBackendMessage(String(e?.message ?? e)));
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
                setMvError(parseErrorText(text, res.status));
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? data?.item ?? [];
            const meta = data?.pageMeta ?? data?.page ?? data?.page_meta ?? { page, size };

            setMonoVersions(Array.isArray(items) ? items : []);
            setMvPageMeta(meta);

            if (!selectedMonoVersionId && Array.isArray(items) && items.length > 0) {
                const first = items[0];
                const id = Number(first?.id ?? first?.versionId ?? first?.version_id);
                if (id > 0) setSelectedMonoVersionId(id);
            }
        } catch (e: any) {
            setMonoVersions([]);
            setMvError(translateBackendMessage(String(e?.message ?? e)));
        } finally {
            setMvLoading(false);
        }
    }

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
                setPError(parseErrorText(text, res.status));
                return;
            }

            const data = text ? JSON.parse(text) : null;
            const items = data?.items ?? [];
            const meta = data?.pageMeta ?? data?.page ?? data?.page_meta ?? { page, size };

            setPublishers(Array.isArray(items) ? items : []);
            setPPageMeta(meta);
        } catch (e: any) {
            setPublishers([]);
            setPError(translateBackendMessage(String(e?.message ?? e)));
        } finally {
            setPLoading(false);
        }
    }

    async function importMono(e?: React.FormEvent) {
        e?.preventDefault();

        setMFileErr(null);
        setMLabelErr(null);

        let ok = true;
        if (!mFile) {
            setMFileErr('Wybierz plik PDF.');
            ok = false;
        }
        if (!mLabel.trim()) {
            setMLabelErr('Podaj label.');
            ok = false;
        }
        if (!ok) {
            pushMono('error', 'Uzupełnij wymagane pola.');
            return;
        }

        setMUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', mFile!);
            fd.append('label', mLabel.trim());

            const res = await authFetch('/api/etl/admin/importPDF', { method: 'POST', body: fd as any } as RequestInit);
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(parseErrorText(text, res.status));

            const data = text ? JSON.parse(text) : null;

            if (data?.alreadyImported) {
                pushMono('info', 'Plik został już zaimportowany wcześniej.');
                await fetchMonoVersions(0, mvPageMeta.size);
                return;
            }

            const newVersionId = Number(data?.versionId ?? data?.version_id ?? 0);
            pushMono('success', newVersionId > 0 ? `Import monografii zakończony (wersja v${newVersionId}).` : 'Import monografii zakończony.');

            await fetchMonoVersions(0, mvPageMeta.size);
            if (newVersionId > 0) setSelectedMonoVersionId(newVersionId);

            setMFile(null);
            setMLabel('');
        } catch (err: any) {
            pushMono('error', err?.message ?? 'Błąd importu monografii.');
        } finally {
            setMUploading(false);
        }
    }

    async function deleteMonoVersion(versionId: number, label?: string) {
        openConfirm(
            'Usuń wersję monografii',
            `Czy na pewno chcesz usunąć wersję MEiN (monografie)?\n${label ? `Label: ${label}\n` : ''}Wersja: v${versionId}\n\nOperacja uruchomi zadanie asynchroniczne.`,
            async () => {
                try {
                    const res = await authFetch(`/api/etl/admin/deleteMeinMonoVersion?versionId=${versionId}`, { method: 'DELETE' });
                    const text = await res.text().catch(() => '');
                    if (!res.ok) throw new Error(parseErrorText(text, res.status));

                    const data = text ? JSON.parse(text) : null;
                    const jobId = Number(data?.jobId ?? 0);

                    pushMono('success', translateBackendMessage(String(data?.message ?? 'Zadanie usuwania uruchomione.')));

                    if (jobId) {
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
                    }

                    await fetchMonoVersions(mvPageMeta.page, mvPageMeta.size);
                    closeConfirm();
                } catch (err: any) {
                    pushMono('error', err?.message ?? 'Błąd usuwania monografii.');
                    closeConfirm();
                }
            }
        );
    }

    async function openMonoVersionDetails(versionId: number) {
        setMonoVersionModalOpen(true);
        setMonoVersionModalLoading(true);
        setMonoVersionModalError(null);
        setMonoVersionModalData(null);

        try {
            const res = await authFetch(`/api/etl/admin/getMeinMonoVersion?versionId=${versionId}`, { method: 'GET' });
            const text = await res.text().catch(() => '');
            if (!res.ok) throw new Error(parseErrorText(text, res.status));

            const data = text ? JSON.parse(text) : null;
            setMonoVersionModalData(data?.version ?? data);
        } catch (e: any) {
            setMonoVersionModalError(translateBackendMessage(String(e?.message ?? e)));
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
            if (!res.ok) throw new Error(parseErrorText(text, res.status));

            const data = text ? JSON.parse(text) : null;
            setPublisherModalData(data?.publisher ?? data);
        } catch (e: any) {
            setPublisherModalError(translateBackendMessage(String(e?.message ?? e)));
        } finally {
            setPublisherModalLoading(false);
        }
    }

    if (!initialized) return <div className={styles.page}>Ładowanie…</div>;

    const jobsForTab = jobs.filter((j) => (tab === 'articles' ? j.scope === 'MEIN' : j.scope === 'MONO'));

    return (
        <div className={styles.page}>
            <header className={styles.headerRow}>
                <h1 className={styles.title}>Panel admin — ETL</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className={tab === 'articles' ? styles.primaryBtn : styles.ghostBtn} onClick={() => setTab('articles')}>
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <h2 style={{ margin: 0 }}>Wersje MEiN</h2>
                            <button className={styles.ghostBtn} onClick={() => void fetchMeinVersions(vPageMeta.page, vPageMeta.size)} disabled={vLoading}>
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
                                                            void deleteMeinVersion(id, label);
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
                                onClick={() => void fetchMeinVersions(Math.max(0, (vPageMeta.page ?? 0) - 1), vPageMeta.size)}
                            >
                                ← Poprzednia
                            </button>
                            <button className={styles.pageBtn} disabled={vLoading} onClick={() => void fetchMeinVersions((vPageMeta.page ?? 0) + 1, vPageMeta.size)}>
                                Następna →
                            </button>
                            <div className={styles.pageInfo}>
                                strona: {vPageMeta.page ?? 0} • size: {vPageMeta.size ?? 20}
                            </div>
                        </div>

                        <div className={styles.bigCardFull} style={{ marginTop: 18 }}>
                            <div className={styles.cardHeader}>
                                <div className={styles.bigAvatar}>{selectedVersionId ? `V${selectedVersionId}` : '—'}</div>
                                <div>
                                    <h3 className={styles.cardTitle}>{selectedVersionId ? `Lista czasopism (v${selectedVersionId})` : 'Lista czasopism'}</h3>
                                    <div className={styles.muted}>{selectedVersion ? `label: ${selectedVersion.label ?? '—'}` : 'Wybierz wersję po lewej.'}</div>
                                </div>

                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <input
                                        className={styles.searchInput}
                                        placeholder="Szukaj czasopisma po tytule…"
                                        value={journalTitleInput}
                                        onChange={(e) => setJournalTitleInput(e.target.value)}
                                        style={{ minWidth: 260 }}
                                    />

                                    <button
                                        className={styles.primaryBtn}
                                        disabled={!selectedVersionId || jLoading}
                                        onClick={() => {
                                            if (!selectedVersionId) return;
                                            const q = journalTitleInput.trim();
                                            setJournalTitleQuery(q);
                                            void fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, q);
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
                                            void fetchMeinJournals(selectedVersionId, 0, jPageMeta.size, '');
                                        }}
                                    >
                                        Reset
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedVersionId || jLoading}
                                        onClick={() => selectedVersionId && void fetchMeinJournals(selectedVersionId, jPageMeta.page, jPageMeta.size, journalTitleQuery)}
                                    >
                                        Odśwież
                                    </button>
                                </div>
                            </div>

                            {jLoading ? (
                                <div className={styles.loading}>Ładowanie…</div>
                            ) : jError ? (
                                <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
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
                                            const title = j.title1 ?? j.title ?? j.uid ?? '—';
                                            const issn = j.issn || j.issn2 ? `ISSN: ${[j.issn, j.issn2].filter(Boolean).join(' • ')}` : '';
                                            const eissn = j.eissn || j.eissn2 ? `EISSN: ${[j.eissn, j.eissn2].filter(Boolean).join(' • ')}` : '';
                                            const points = j.points != null ? `${j.points} pkt` : '';
                                            const meta = [issn, eissn, points].filter(Boolean).join('  |  ');

                                            return (
                                                <div key={j.uid ?? jid} className={styles.disciplineItem}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ fontWeight: 900 }}>{title}</div>
                                                        <div className={styles.muted}>{meta || '—'}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className={styles.infoBtn} onClick={() => selectedVersionId && void openJournalDetails(selectedVersionId, jid)}>
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
                                                void fetchMeinJournals(selectedVersionId, Math.max(0, (jPageMeta.page ?? 0) - 1), jPageMeta.size, journalTitleQuery)
                                            }
                                        >
                                            ← Poprzednia
                                        </button>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={jLoading}
                                            onClick={() => selectedVersionId && void fetchMeinJournals(selectedVersionId, (jPageMeta.page ?? 0) + 1, jPageMeta.size, journalTitleQuery)}
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
                                <div>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.xml,.zip,.csv"
                                        onChange={(e) => {
                                            setAFile(e.target.files?.[0] ?? null);
                                            setAFileErr(null);
                                        }}
                                    />
                                    <FieldError text={aFileErr} />
                                </div>

                                <div>
                                    <input
                                        className={styles.searchInput}
                                        placeholder="label"
                                        value={aLabel}
                                        onChange={(e) => {
                                            setALabel(e.target.value);
                                            setALabelErr(null);
                                        }}
                                    />
                                    <FieldError text={aLabelErr} />
                                </div>

                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className={styles.primaryBtn} type="submit" disabled={aUploading}>
                                        {aUploading ? 'Wysyłanie…' : 'Importuj'}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.ghostBtn}
                                        onClick={() => {
                                            setAFile(null);
                                            setALabel('');
                                            setAFileErr(null);
                                            setALabelErr(null);
                                            setMeinMsg(null);
                                        }}
                                        disabled={aUploading}
                                    >
                                        Wyczyść
                                    </button>

                                    {/* komunikat obok przycisków */}
                                    <div style={{ minWidth: 240, flex: 1 }}>
                                        <InlineNotice msg={meinMsg} />
                                    </div>
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
                                                    Zadanie #{j.jobId} {j.versionId ? `• v${j.versionId}` : ''}
                                                </div>
                                                <div className={styles.muted}>
                                                    {j.type ?? '—'}
                                                    {typeof j.progressPercent === 'number' ? ` • ${j.progressPercent}%` : ''}
                                                    {j.phase ? ` • ${j.phase}` : ''}
                                                    {j.error ? ` • błąd: ${translateBackendMessage(j.error)}` : ''}
                                                    {!j.error && j.message ? ` • ${translateBackendMessage(j.message)}` : ''}
                                                </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <h2 style={{ margin: 0 }}>Wersje monografii</h2>
                            <button className={styles.ghostBtn} onClick={() => void fetchMonoVersions(mvPageMeta.page, mvPageMeta.size)} disabled={mvLoading}>
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
                                                            void openMonoVersionDetails(id);
                                                        }}
                                                    >
                                                        Szczegóły
                                                    </button>
                                                    <button
                                                        className={styles.dangerBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void deleteMonoVersion(id, label);
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
                                onClick={() => void fetchMonoVersions(Math.max(0, (mvPageMeta.page ?? 0) - 1), mvPageMeta.size)}
                            >
                                ← Poprzednia
                            </button>
                            <button className={styles.pageBtn} disabled={mvLoading} onClick={() => void fetchMonoVersions((mvPageMeta.page ?? 0) + 1, mvPageMeta.size)}>
                                Następna →
                            </button>
                            <div className={styles.pageInfo}>
                                strona: {mvPageMeta.page ?? 0} • size: {mvPageMeta.size ?? 20}
                            </div>
                        </div>

                        <div className={styles.bigCardFull} style={{ marginTop: 18 }}>
                            <div className={styles.cardHeader}>
                                <div className={styles.bigAvatar}>{selectedMonoVersionId ? `M${selectedMonoVersionId}` : '—'}</div>
                                <div>
                                    <h3 className={styles.cardTitle}>{selectedMonoVersionId ? `Publisherzy (v${selectedMonoVersionId})` : 'Publisherzy'}</h3>
                                    <div className={styles.muted}>{selectedMonoVersion ? `label: ${selectedMonoVersion.label ?? '—'}` : 'Wybierz wersję po lewej.'}</div>
                                </div>

                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <input
                                        className={styles.searchInput}
                                        placeholder="Szukaj publishera po tytule…"
                                        value={publisherTitleInput}
                                        onChange={(e) => setPublisherTitleInput(e.target.value)}
                                        style={{ minWidth: 260 }}
                                    />

                                    <button
                                        className={styles.primaryBtn}
                                        disabled={!selectedMonoVersionId || pLoading}
                                        onClick={() => {
                                            if (!selectedMonoVersionId) return;
                                            const q = publisherTitleInput.trim();
                                            setPublisherTitleQuery(q);
                                            void fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, q);
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
                                            void fetchMonoPublishers(selectedMonoVersionId, 0, pPageMeta.size, '');
                                        }}
                                    >
                                        Reset
                                    </button>

                                    <button
                                        className={styles.ghostBtn}
                                        disabled={!selectedMonoVersionId || pLoading}
                                        onClick={() => selectedMonoVersionId && void fetchMonoPublishers(selectedMonoVersionId, pPageMeta.page, pPageMeta.size, publisherTitleQuery)}
                                    >
                                        Odśwież
                                    </button>
                                </div>
                            </div>

                            {pLoading ? (
                                <div className={styles.loading}>Ładowanie…</div>
                            ) : pError ? (
                                <div className={styles.empty} style={{ whiteSpace: 'pre-wrap' }}>
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
                                            const title = p?.title ?? p?.name ?? p?.publisherName ?? '—';
                                            const parts: string[] = [];
                                            if (p?.level != null && String(p.level).trim() !== '') parts.push(`poziom: ${p.level}`);
                                            if (p?.points != null && String(p.points).trim() !== '') parts.push(`pkt: ${p.points}`);
                                            const meta = parts.join('  |  ');

                                            return (
                                                <div key={pid || title} className={styles.disciplineItem}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ fontWeight: 900 }}>{title}</div>
                                                        <div className={styles.muted}>{meta || '—'}</div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className={styles.infoBtn} onClick={() => pid && void openPublisherDetails(pid)} disabled={!pid}>
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
                                                void fetchMonoPublishers(selectedMonoVersionId, Math.max(0, (pPageMeta.page ?? 0) - 1), pPageMeta.size, publisherTitleQuery)
                                            }
                                        >
                                            ← Poprzednia
                                        </button>
                                        <button
                                            className={styles.pageBtn}
                                            disabled={pLoading}
                                            onClick={() =>
                                                selectedMonoVersionId && void fetchMonoPublishers(selectedMonoVersionId, (pPageMeta.page ?? 0) + 1, pPageMeta.size, publisherTitleQuery)
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
                                <div>
                                    <input
                                        type="file"
                                        accept=".pdf,.zip"
                                        onChange={(e) => {
                                            setMFile(e.target.files?.[0] ?? null);
                                            setMFileErr(null);
                                        }}
                                    />
                                    <FieldError text={mFileErr} />
                                </div>

                                <div>
                                    <input
                                        className={styles.searchInput}
                                        placeholder="label"
                                        value={mLabel}
                                        onChange={(e) => {
                                            setMLabel(e.target.value);
                                            setMLabelErr(null);
                                        }}
                                    />
                                    <FieldError text={mLabelErr} />
                                </div>

                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className={styles.primaryBtn} type="submit" disabled={mUploading}>
                                        {mUploading ? 'Wysyłanie…' : 'Importuj'}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.ghostBtn}
                                        onClick={() => {
                                            setMFile(null);
                                            setMLabel('');
                                            setMFileErr(null);
                                            setMLabelErr(null);
                                            setMonoMsg(null);
                                        }}
                                        disabled={mUploading}
                                    >
                                        Wyczyść
                                    </button>

                                    {/* komunikat obok przycisków */}
                                    <div style={{ minWidth: 240, flex: 1 }}>
                                        <InlineNotice msg={monoMsg} />
                                    </div>
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
                                                    Zadanie #{j.jobId} {j.versionId ? `• v${j.versionId}` : ''}
                                                </div>
                                                <div className={styles.muted}>
                                                    {j.type ?? '—'}
                                                    {typeof j.progressPercent === 'number' ? ` • ${j.progressPercent}%` : ''}
                                                    {j.phase ? ` • ${j.phase}` : ''}
                                                    {j.error ? ` • błąd: ${translateBackendMessage(j.error)}` : ''}
                                                    {!j.error && j.message ? ` • ${translateBackendMessage(j.message)}` : ''}
                                                </div>
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
                        <div className={styles.kvKey}>Wersja</div>
                        <div className={styles.kvVal}>v{versionDetails.id ?? versionDetails.versionId ?? '—'}</div>

                        <div className={styles.kvKey}>Label</div>
                        <div className={styles.kvVal}>{versionDetails.label ?? '—'}</div>

                        <div className={styles.kvKey}>Plik</div>
                        <div className={styles.kvVal}>{versionDetails.sourceFilename ?? '—'}</div>

                        <div className={styles.kvKey}>Czasopisma</div>
                        <div className={styles.kvVal}>{versionDetails.journals ?? '—'}</div>

                        <div className={styles.kvKey}>Kody</div>
                        <div className={styles.kvVal}>{versionDetails.journalCodes ?? '—'}</div>

                        {'isActive' in versionDetails || 'active' in versionDetails ? (
                            <>
                                <div className={styles.kvKey}>Aktywna</div>
                                <div className={styles.kvVal}>{String(!!(versionDetails.isActive ?? versionDetails.active))}</div>
                            </>
                        ) : null}
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
                            <div className={styles.kvKey}>Tytuł 1</div>
                            <div className={styles.kvVal}>{journalModalData?.title1 ?? journalModalData?.title ?? '—'}</div>

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
                    <div className={styles.kvGrid}>
                        <div className={styles.kvKey}>Wersja</div>
                        <div className={styles.kvVal}>v{monoVersionModalData?.id ?? monoVersionModalData?.versionId ?? '—'}</div>

                        <div className={styles.kvKey}>Label</div>
                        <div className={styles.kvVal}>{monoVersionModalData?.label ?? '—'}</div>

                        <div className={styles.kvKey}>Plik</div>
                        <div className={styles.kvVal}>{monoVersionModalData?.sourceFilename ?? monoVersionModalData?.filename ?? '—'}</div>

                        {'publishers' in monoVersionModalData ? (
                            <>
                                <div className={styles.kvKey}>Publisherzy</div>
                                <div className={styles.kvVal}>{monoVersionModalData?.publishers ?? '—'}</div>
                            </>
                        ) : null}
                    </div>
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
                    <div className={styles.kvGrid}>
                        <div className={styles.kvKey}>Nazwa</div>
                        <div className={styles.kvVal}>{publisherModalData?.title ?? publisherModalData?.name ?? '—'}</div>

                        <div className={styles.kvKey}>Punkty</div>
                        <div className={styles.kvVal}>{publisherModalData?.points ?? '—'}</div>

                        <div className={styles.kvKey}>Poziom</div>
                        <div className={styles.kvVal}>{publisherModalData?.level ?? '—'}</div>

                        <div className={styles.kvKey}>Wersja</div>
                        <div className={styles.kvVal}>{publisherModalData?.versionId ? `v${publisherModalData.versionId}` : '—'}</div>
                    </div>
                ) : (
                    <div className={styles.empty}>Brak danych.</div>
                )}
            </Modal>

            {/* ===================== CONFIRM MODAL (shared) ===================== */}
            <ConfirmModal
                open={confirmOpen}
                title={confirmTitle}
                message={confirmMessage}
                onCancel={closeConfirm}
                onConfirm={() => void (confirmActionRef.current ? confirmActionRef.current() : Promise.resolve())}
                confirmText="Potwierdź"
                cancelText="Anuluj"
                loading={false}
            />
        </div>
    );
}

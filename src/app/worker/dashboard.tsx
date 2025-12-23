'use client';

import React from 'react';
import styles from '../../login/styles.module.css';
import Link from 'next/link';

export default function WorkerDashboard() {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>W</div>
                    <h1 className={styles.title}>Panel pracownika</h1>
                    <p className={styles.subtitle}>Tutaj znajdziesz swoje zadania i zasoby.</p>
                </div>

                <ul>
                    <li><Link href="/monograph/admin" className={styles.link}>Moje monografie</Link></li>
                    <li><Link href="/article/worker/listMyPublication" className={styles.link}>Moje publikacje</Link></li>
                </ul>
            </div>
        </div>
    );
}
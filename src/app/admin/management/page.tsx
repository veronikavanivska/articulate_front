'use client';

import React from 'react';
import styles from '../../login/styles.module.css';
import Link from 'next/link';

export default function AdminManagement() {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>AD</div>
                    <h1 className={styles.title}>Panel administratora</h1>
                    <p className={styles.subtitle}>Narzędzia administracyjne</p>
                </div>

                <ul>
                    <li><Link href="/article/admin/listPublication" className={styles.link}>Zarządzaj publikacjami</Link></li>
                    <li><Link href="/article/admin/listDisciplines" className={styles.link}>Dyscypliny</Link></li>
                </ul>
            </div>
        </div>
    );
}
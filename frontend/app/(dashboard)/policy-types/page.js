'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { HEALTH_POLICY_TYPE, POLICY_TYPES } from '@/lib/healthPolicy';
import { useToast } from '@/components/ToastProvider';
import styles from '@/components/policy-report.module.css';

const DEFAULT_TYPES = POLICY_TYPES;

export default function PolicyTypesPage() {
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get('/policies?page=1&limit=1000')
      .then(data => {
        if (active) setPolicies(data.policies || []);
      })
      .catch(error => {
        console.error('Failed to load policy types:', error);
        toast.error('Failed to load policy type data.');
        if (active) setPolicies([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast]);

  const typeCounts = useMemo(() => {
    return policies.reduce((counts, policy) => {
      const type = policy.policy_type || HEALTH_POLICY_TYPE;
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
  }, [policies]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Policy Types</h1>
          <p>Manage enabled policy categories for health, motor, and one-time travel insurance servicing.</p>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Types</span>
          <span className={styles.statValue}>{DEFAULT_TYPES.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Classified Policies</span>
          <span className={styles.statValue}>{loading ? '-' : policies.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Unclassified</span>
          <span className={styles.statValue}>{loading ? '-' : policies.filter(policy => !policy.policy_type).length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Policies</span>
          <span className={styles.statValue}>{loading ? '-' : policies.length}</span>
        </div>
      </div>

      <div className={styles.typeGrid}>
        {DEFAULT_TYPES.map(type => (
          <article className={styles.typeCard} key={type.name}>
            <h3>{type.name}</h3>
            <p>{type.description}</p>
            <div className={styles.typeMeta}>
              <span>Current policies</span>
              <strong>{typeCounts[type.name] || 0}</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

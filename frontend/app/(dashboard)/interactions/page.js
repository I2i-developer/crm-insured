'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

export default function InteractionsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const policyId = searchParams.get('policy');

  const [interactions, setInteractions] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState(policyId || '');
  const [newRemark, setNewRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  useEffect(() => {
    if (selectedPolicy) {
      fetchInteractions(selectedPolicy);
    } else {
      setInteractions([]);
      setLoading(false);
    }
  }, [selectedPolicy]);

  const fetchPolicies = async () => {
    try {
      const data = await api.get('/policies?limit=100');
      setPolicies(data.policies || []);
      if (policyId) {
        setSelectedPolicy(policyId);
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error);
      toast.error('Failed to load policies.');
    }
  };

  const fetchInteractions = async (pid) => {
    setLoading(true);
    try {
      const data = await api.get(`/interactions?policy=${pid}`);
      setInteractions(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch interactions:', error);
      toast.error('Failed to load interaction history.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPolicy || !newRemark.trim()) return;

    setSubmitting(true);
    try {
      await api.post('/interactions', { policy_id: selectedPolicy, remark: newRemark });
      setNewRemark('');
      toast.success('Remark added successfully.');
      fetchInteractions(selectedPolicy);
    } catch (error) {
      toast.error(error.message || 'Failed to add remark.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (log) => {
    setEditingId(log.id);
    setEditText(log.remark);
  };

  const handleSaveEdit = async (logId) => {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      await api.put(`/interactions/${logId}`, { remark: editText });
      setEditingId(null);
      setEditText('');
      toast.success('Remark updated successfully.');
      fetchInteractions(selectedPolicy);
    } catch (error) {
      toast.error(error.message || 'Failed to update remark.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleDelete = async (logId) => {
    const confirmed = await toast.confirm({
      title: 'Delete remark?',
      message: 'This communication note will be permanently removed.',
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/interactions/${logId}`);
      toast.success('Remark deleted successfully.');
      fetchInteractions(selectedPolicy);
    } catch (error) {
      toast.error(error.message || 'Failed to delete remark.');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const currentPolicy = policies.find(p => p.id === selectedPolicy);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Interaction Logs</h1>
        <p>Track and manage all client communications</p>
      </header>

      <div className={styles.bentoGrid}>
        <div className={`${styles.bentoCard} ${styles.policySelectCard}`}>
          <h2>Select Policy</h2>
          <select
            value={selectedPolicy}
            onChange={(e) => setSelectedPolicy(e.target.value)}
            className={styles.policySelect}
          >
            <option value="">-- Choose a policy --</option>
            {policies.map(p => (
              <option key={p.id} value={p.id}>
                {p.client_name} - {p.policy_number}
              </option>
            ))}
          </select>

          {currentPolicy && (
            <div className={styles.policyDetails}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Client</span>
                <span className={styles.detailValue}>{currentPolicy.client_name}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Company</span>
                <span className={styles.detailValue}>{currentPolicy.insurance_company}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Policy #</span>
                <span className={styles.detailValue}>{currentPolicy.policy_number}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span className={`${styles.badge} ${styles[`badge${currentPolicy.status.replace(/\s+/g, '')}`]}`}>
                  {currentPolicy.status}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Due Date</span>
                <span className={styles.detailValue}>
                  {new Date(currentPolicy.due_date).toLocaleDateString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={`${styles.bentoCard} ${styles.addRemarkCard}`}>
          <h2>Add Remark</h2>
          <form onSubmit={handleSubmit}>
            <textarea
              value={newRemark}
              onChange={(e) => setNewRemark(e.target.value)}
              placeholder="Enter your note or remark about this client..."
              rows={4}
              required
              className={styles.remarkInput}
            />
            <button
              type="submit"
              disabled={!selectedPolicy || !newRemark.trim() || submitting}
              className={styles.submitBtn}
            >
              {submitting ? 'Adding...' : 'Add Remark'}
            </button>
          </form>
        </div>

        <div className={`${styles.bentoCard} ${styles.timelineCard}`}>
          <h2>Interaction History</h2>
          {loading ? (
            <div className={styles.loadingState}>Loading...</div>
          ) : !selectedPolicy ? (
            <div className={styles.emptyState}>
              <TimelineIcon />
              <p>Select a policy to view interaction history</p>
            </div>
          ) : interactions.length === 0 ? (
            <div className={styles.emptyState}>
              <TimelineIcon />
              <p>No interactions recorded yet</p>
              <small>Add your first remark using the form</small>
            </div>
          ) : (
            <div className={styles.timeline}>
              {interactions.map((log, index) => (
                <div key={log.id} className={styles.timelineItem}>
                  <div className={styles.timelineLine}>
                    <div className={styles.timelineDot}></div>
                    {index < interactions.length - 1 && <div className={styles.lineConnector}></div>}
                  </div>
                  <div className={styles.timelineContent}>
                    {editingId === log.id ? (
                      <div className={styles.editForm}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className={styles.remarkInput}
                          rows={3}
                        />
                        <div className={styles.editActions}>
                          <button
                            onClick={() => handleSaveEdit(log.id)}
                            disabled={savingEdit || !editText.trim()}
                            className={styles.saveBtn}
                            title="Save remark"
                            aria-label="Save remark"
                          >
                            {savingEdit ? '...' : <SaveIcon />}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className={styles.cancelBtn}
                            title="Cancel editing"
                            aria-label="Cancel editing"
                          >
                            <CancelIcon />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={styles.remark}>{log.remark}</p>
                        <div className={styles.remarkMeta}>
                          <span className={styles.timestamp}>{formatDate(log.created_at)}</span>
                          <div className={styles.remarkActions}>
                            <button onClick={() => handleEdit(log)} className={styles.actionBtn} title="Edit remark" aria-label="Edit remark"><EditIcon /></button>
                            <button onClick={() => handleDelete(log.id)} className={`${styles.actionBtn} ${styles.deleteBtn}`} title="Delete remark" aria-label="Delete remark"><DeleteIcon /></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18"/>
      <path d="M8 6V4h8v2"/>
      <path d="M19 6l-1 15H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <path d="M17 21v-8H7v8"/>
      <path d="M7 3v5h8"/>
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18"/>
      <path d="m6 6 12 12"/>
    </svg>
  );
}

const TimelineIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

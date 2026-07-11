'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { LEAD_PRIORITIES, LEAD_STAGES } from '@/lib/validation';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const emptyForm = {
  client_name: '',
  phone: '',
  email: '',
  source: '',
  priority: 'Medium',
  expected_premium: '',
  next_follow_up: '',
  notes: ''
};

function getClientInitial(name) {
  const cleaned = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, '')
    .trim();
  return (cleaned.charAt(0) || 'C').toUpperCase();
}

export default function LeadsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search: '', stage: '', priority: '' });
  const [form, setForm] = useState(emptyForm);
  const [remarkDrafts, setRemarkDrafts] = useState({});

  useEffect(() => {
    fetchLeads();
  }, [filters]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const data = await api.get(`/leads?${params.toString()}`);
      setLeads(data.leads || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load leads.');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const open = leads.filter(lead => !['Converted', 'Lost'].includes(lead.stage)).length;
    const hot = leads.filter(lead => lead.priority === 'High').length;
    const followUps = leads.filter(lead => {
      if (!lead.next_follow_up) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const followUp = new Date(lead.next_follow_up);
      followUp.setHours(0, 0, 0, 0);
      return followUp <= today && lead.stage !== 'Converted';
    }).length;
    const pipeline = leads.reduce((sum, lead) => sum + Number(lead.expected_premium || 0), 0);
    return { open, hot, followUps, pipeline };
  }, [leads]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/leads', {
        ...form,
        expected_premium: form.expected_premium || 0,
        next_follow_up: form.next_follow_up || null
      });
      setForm(emptyForm);
      toast.success('Lead created successfully.');
      fetchLeads();
    } catch (error) {
      toast.error(error.message || 'Failed to create lead.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (leadId, updates) => {
    try {
      const data = await api.put(`/leads/${leadId}`, updates);
      setLeads(current => current.map(lead => lead.id === leadId ? data.lead : lead));
      toast.success('Lead updated.');
    } catch (error) {
      toast.error(error.message || 'Failed to update lead.');
    }
  };

  const handleDelete = async (leadId) => {
    const confirmed = await toast.confirm({
      title: 'Delete lead?',
      message: 'This will remove the lead and all of its remarks.',
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/leads/${leadId}`);
      setLeads(current => current.filter(lead => lead.id !== leadId));
      toast.success('Lead deleted.');
    } catch (error) {
      toast.error(error.message || 'Failed to delete lead.');
    }
  };

  const handleRemark = async (leadId) => {
    const remark = (remarkDrafts[leadId] || '').trim();
    if (!remark) {
      toast.warning('Please enter a remark before adding it.');
      return;
    }

    try {
      await api.post(`/leads/${leadId}/remarks`, { remark });
      setRemarkDrafts(current => ({ ...current, [leadId]: '' }));
      toast.success('Remark added.');
      fetchLeads();
    } catch (error) {
      toast.error(error.message || 'Failed to add remark.');
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount || 0);

  const formatDate = (date) => {
    if (!date) return 'No follow-up';
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Lead Management</h1>
          <p>Capture incoming health policy leads, follow up on time, and keep remarks focused.</p>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <SummaryCard label="Open Leads" value={summary.open} />
        <SummaryCard label="High Priority" value={summary.hot} tone="danger" />
        <SummaryCard label="Due Follow-ups" value={summary.followUps} tone="warning" />
        <SummaryCard label="Pipeline Value" value={formatCurrency(summary.pipeline)} tone="success" />
      </section>

      <section className={styles.workspace}>
        <form className={styles.formPanel} onSubmit={handleCreate}>
          <div className={styles.panelTitle}>
            <h2>New Incoming Lead</h2>
            <span>Health policy only</span>
          </div>
          <label>
            Client name
            <input value={form.client_name} onChange={(e) => setForm(prev => ({ ...prev, client_name: e.target.value }))} required />
          </label>
          <div className={styles.twoCols}>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
            </label>
          </div>
          <div className={styles.twoCols}>
            <label>
              Source
              <input value={form.source} placeholder="Referral, website, walk-in" onChange={(e) => setForm(prev => ({ ...prev, source: e.target.value }))} />
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}>
                {LEAD_PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.twoCols}>
            <label>
              Expected premium
              <input type="number" min="0" value={form.expected_premium} onChange={(e) => setForm(prev => ({ ...prev, expected_premium: e.target.value }))} />
            </label>
            <label>
              Next follow-up
              <input type="date" value={form.next_follow_up} onChange={(e) => setForm(prev => ({ ...prev, next_follow_up: e.target.value }))} />
            </label>
          </div>
          <label>
            Notes
            <textarea value={form.notes} rows="4" onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Lead'}</button>
        </form>

        <div className={styles.leadPanel}>
          <div className={styles.filters}>
            <input
              placeholder="Search lead, phone, email..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
            <select value={filters.stage} onChange={(e) => setFilters(prev => ({ ...prev, stage: e.target.value }))}>
              <option value="">All stages</option>
              {LEAD_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
            <select value={filters.priority} onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}>
              <option value="">All priorities</option>
              {LEAD_PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>

          {loading ? (
            <div className={styles.state}>Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className={styles.state}>No leads found.</div>
          ) : (
            <div className={styles.leadList}>
              {leads.map(lead => {
                const remarks = lead.lead_remarks || [];
                const remarkLimitReached = remarks.length >= 5;
                return (
                  <article className={styles.leadCard} key={lead.id}>
                    <div className={styles.leadTop}>
                      <div className={styles.avatar}>{getClientInitial(lead.client_name)}</div>
                      <div>
                        <h2>{lead.client_name}</h2>
                        <p>{lead.phone || 'No phone'} {lead.email ? `| ${lead.email}` : ''}</p>
                      </div>
                      <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(lead.id)}>Delete</button>
                    </div>

                    <div className={styles.leadMeta}>
                      <span>Source <strong>{lead.source || 'Direct'}</strong></span>
                      <span>Premium <strong>{formatCurrency(lead.expected_premium)}</strong></span>
                      <span>Follow-up <strong>{formatDate(lead.next_follow_up)}</strong></span>
                    </div>

                    <div className={styles.controls}>
                      <select value={lead.stage} onChange={(e) => handleUpdate(lead.id, { stage: e.target.value })}>
                        {LEAD_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                      <select value={lead.priority} onChange={(e) => handleUpdate(lead.id, { priority: e.target.value })}>
                        {LEAD_PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </div>

                    {lead.notes && <p className={styles.notes}>{lead.notes}</p>}

                    <div className={styles.remarks}>
                      <div className={styles.remarksHeader}>
                        <strong>Remarks</strong>
                        <span>{remarks.length}/5</span>
                      </div>
                      {remarks.length > 0 ? (
                        <ul>
                          {remarks.map(item => (
                            <li key={item.id}>
                              <p>{item.remark}</p>
                              <time>{new Date(item.created_at).toLocaleString('en-IN')}</time>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.noRemarks}>No remarks yet.</p>
                      )}
                      <div className={styles.remarkInput}>
                        <input
                          value={remarkDrafts[lead.id] || ''}
                          disabled={remarkLimitReached}
                          placeholder={remarkLimitReached ? 'Maximum 5 remarks reached' : 'Add a short remark'}
                          onChange={(e) => setRemarkDrafts(prev => ({ ...prev, [lead.id]: e.target.value }))}
                        />
                        <button type="button" disabled={remarkLimitReached} onClick={() => handleRemark(lead.id)}>Add</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone = 'primary' }) {
  return (
    <div className={`${styles.summaryCard} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

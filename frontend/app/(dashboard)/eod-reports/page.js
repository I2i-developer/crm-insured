'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import DatePicker from '@/components/DatePicker';
import styles from './page.module.css';

const emptyForm = {
  report_date: '',
  work_summary: '',
  achievements: '',
  challenges: '',
  next_day_plan: '',
  leads_contacted: 0,
  policies_closed: 0,
  renewals_completed: 0
};

const statusLabels = {
  submitted: 'Awaiting Review',
  reviewed: 'Reviewed',
  needs_changes: 'Changes Requested'
};

function localDateValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

function roleLabel(role) {
  return { team_head: 'Team Head', team_member: 'Team Member' }[role] || role;
}

export default function EodReportsPage() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, report_date: localDateValue() });
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '', user_id: '' });
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem('user') || 'null'));
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
      const data = await api.get(`/eod-reports${params.size ? `?${params}` : ''}`);
      setReports(data.reports || []);
      setSelected(current => current ? (data.reports || []).find(item => item.id === current.id) || null : null);
    } catch (error) {
      toast.error(error.message || 'Failed to load EOD reports.');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const canSubmit = ['team_head', 'team_member'].includes(user?.role);
  const canReview = ['super_admin', 'admin'].includes(user?.role);
  const submitters = useMemo(() => {
    const map = new Map();
    reports.forEach(report => {
      if (report.user_id) map.set(report.user_id, report.submitter?.name || report.submitter_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);
  const summary = useMemo(() => ({
    total: reports.length,
    submitted: reports.filter(report => report.status === 'submitted').length,
    reviewed: reports.filter(report => report.status === 'reviewed').length,
    needsChanges: reports.filter(report => report.status === 'needs_changes').length
  }), [reports]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  };

  const submitReport = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put('/eod-reports', { ...form, id: editingId });
        toast.success('EOD report updated and sent to all Admins for review.');
      } else {
        await api.post('/eod-reports', form);
        toast.success('EOD report submitted to all Admins for review.');
      }
      setForm({ ...emptyForm, report_date: localDateValue() });
      setEditingId('');
      await fetchReports();
    } catch (error) {
      toast.error(error.message || 'Failed to submit EOD report.');
    } finally {
      setSaving(false);
    }
  };

  const reviseReport = (report) => {
    setEditingId(report.id);
    setForm({
      report_date: report.report_date,
      work_summary: report.work_summary || '',
      achievements: report.achievements || '',
      challenges: report.challenges || '',
      next_day_plan: report.next_day_plan || '',
      leads_contacted: report.leads_contacted || 0,
      policies_closed: report.policies_closed || 0,
      renewals_completed: report.renewals_completed || 0
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId('');
    setForm({ ...emptyForm, report_date: localDateValue() });
  };

  const deleteReport = async report => {
    const permanent = canReview;
    const confirmed = await toast.confirm({
      title: permanent ? 'Permanently delete EOD report?' : 'Remove EOD report from your view?',
      message: permanent
        ? `This will permanently delete ${report.submitter?.name || report.submitter_name}'s report for ${formatDate(report.report_date)}. This cannot be undone.`
        : `The report for ${formatDate(report.report_date)} will be hidden from your account but retained for Admin review.`,
      confirmLabel: permanent ? 'Delete permanently' : 'Remove report'
    });
    if (!confirmed) return;

    setDeletingId(report.id);
    try {
      const data = await api.delete(`/eod-reports?id=${encodeURIComponent(report.id)}`);
      toast.success(data.message);
      setSelected(null);
      if (editingId === report.id) cancelEdit();
      await fetchReports();
    } catch (error) {
      toast.error(error.message || 'Failed to delete EOD report.');
    } finally {
      setDeletingId('');
    }
  };

  const reviewReport = async (status) => {
    if (!selected) return;
    setReviewing(true);
    try {
      await api.patch('/eod-reports', { id: selected.id, status, reviewer_notes: reviewNotes });
      toast.success(status === 'reviewed' ? 'EOD report reviewed.' : 'Changes requested from the submitter.');
      setReviewNotes('');
      await fetchReports();
    } catch (error) {
      toast.error(error.message || 'Failed to review EOD report.');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>EOD Reports</h1>
          <p>{canReview ? 'Review daily execution reports submitted by Team Heads and Team Members.' : 'Record today’s activity, outcomes, blockers, and next working-day priorities.'}</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={fetchReports} disabled={loading} title="Refresh reports">
          <RefreshIcon /> Refresh
        </button>
      </header>

      <section className={styles.summaryGrid}>
        <SummaryCard label="Reports" value={summary.total} tone="blue" icon={<ReportIcon />} />
        <SummaryCard label="Awaiting Review" value={summary.submitted} tone="amber" icon={<ClockIcon />} />
        <SummaryCard label="Reviewed" value={summary.reviewed} tone="green" icon={<CheckIcon />} />
        <SummaryCard label="Changes Requested" value={summary.needsChanges} tone="red" icon={<ReturnIcon />} />
      </section>

      {canSubmit && (
        <form className={styles.reportForm} onSubmit={submitReport}>
          <div className={styles.panelHeader}>
            <div><h2>{editingId ? 'Edit Daily Report' : 'Submit Daily Report'}</h2><p>Only the date and work summary are required. Reports are locked after approval.</p></div>
            <div className={styles.dateField}><DatePicker label="Report date" value={form.report_date} onChange={value => setForm(current => ({ ...current, report_date: value }))} maxDate={localDateValue()} required /></div>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>Work summary<textarea name="work_summary" value={form.work_summary} onChange={handleFormChange} rows="4" placeholder="What was completed today? Include important client, policy, and follow-up activity." required /></label>
            <label>Key achievements<textarea name="achievements" value={form.achievements} onChange={handleFormChange} rows="3" placeholder="Wins, closures, or progress made" /></label>
            <label>Challenges or blockers<textarea name="challenges" value={form.challenges} onChange={handleFormChange} rows="3" placeholder="Items requiring support or escalation" /></label>
            <label className={styles.wideField}>Next working-day plan<textarea name="next_day_plan" value={form.next_day_plan} onChange={handleFormChange} rows="3" placeholder="Priority actions planned for the next working day" /></label>
          </div>
          <div className={styles.activityRow}>
            <label>Leads contacted<input type="number" min="0" name="leads_contacted" value={form.leads_contacted} onChange={handleFormChange} /></label>
            <label>Policies closed<input type="number" min="0" name="policies_closed" value={form.policies_closed} onChange={handleFormChange} /></label>
            <label>Renewals completed<input type="number" min="0" name="renewals_completed" value={form.renewals_completed} onChange={handleFormChange} /></label>
            <div className={styles.submitActions}>
              {editingId && <button type="button" className={styles.cancelButton} onClick={cancelEdit}>Cancel</button>}
              <button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Submit EOD Report'}</button>
            </div>
          </div>
        </form>
      )}

      <section className={styles.reportsPanel}>
        <div className={styles.panelHeader}>
          <div><h2>{canReview ? 'Organization EOD Reports' : 'My Reports'}</h2><p>Select a report to inspect its complete daily update.</p></div>
          <div className={styles.filters}>
            <select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))} aria-label="Filter by review status">
              <option value="">All statuses</option><option value="submitted">Awaiting Review</option><option value="reviewed">Reviewed</option><option value="needs_changes">Changes Requested</option>
            </select>
            {canReview && (
              <select value={filters.user_id} onChange={event => setFilters(current => ({ ...current, user_id: event.target.value }))} aria-label="Filter by submitter">
                <option value="">All submitters</option>{submitters.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            )}
            <DatePicker compact value={filters.date_from} onChange={value => setFilters(current => ({ ...current, date_from: value }))} maxDate={localDateValue()} placeholder="From date" />
            <DatePicker compact value={filters.date_to} onChange={value => setFilters(current => ({ ...current, date_to: value }))} maxDate={localDateValue()} placeholder="To date" />
          </div>
        </div>

        <div className={styles.reportWorkspace}>
          <div className={styles.reportList}>
            {loading ? <div className={styles.emptyState}>Loading reports...</div> : reports.length === 0 ? <div className={styles.emptyState}>No EOD reports found for these filters.</div> : reports.map(report => (
              <button type="button" key={report.id} className={`${styles.reportRow} ${selected?.id === report.id ? styles.selectedRow : ''}`} onClick={() => { setSelected(report); setReviewNotes(report.reviewer_notes || ''); }}>
                <span className={styles.avatar}>{(report.submitter?.name || report.submitter_name || 'U').charAt(0).toUpperCase()}</span>
                <span className={styles.reportIdentity}><strong>{report.submitter?.name || report.submitter_name}</strong><small>{roleLabel(report.role_at_submission)} · {formatDate(report.report_date)}</small></span>
                <span className={`${styles.statusPill} ${styles[report.status]}`}>{statusLabels[report.status]}</span>
              </button>
            ))}
          </div>

          <div className={styles.reportDetail}>
            {!selected ? <div className={styles.emptyState}>Select a report to view its details.</div> : (
              <>
                <div className={styles.detailHeader}>
                  <div><span>{formatDate(selected.report_date)}</span><h3>{selected.submitter?.name || selected.submitter_name}</h3><p>{roleLabel(selected.role_at_submission)} - Submitted {new Date(selected.submitted_at).toLocaleString('en-IN')}</p></div>
                  <div className={styles.detailActions}>
                    <span className={`${styles.statusPill} ${styles[selected.status]}`}>{statusLabels[selected.status]}</span>
                    {canSubmit && selected.user_id === user?.id && selected.status !== 'reviewed' && <button type="button" className={styles.iconAction} onClick={() => reviseReport(selected)} title="Edit EOD report"><EditIcon /></button>}
                    {(canReview || (canSubmit && selected.user_id === user?.id)) && <button type="button" className={`${styles.iconAction} ${styles.deleteAction}`} onClick={() => deleteReport(selected)} disabled={deletingId === selected.id} title={canReview ? 'Permanently delete EOD report' : 'Remove EOD report'}>{deletingId === selected.id ? '...' : <DeleteIcon />}</button>}
                  </div>
                </div>
                <DetailBlock title="Work Summary" value={selected.work_summary} />
                {(selected.achievements || selected.challenges) && <div className={styles.detailGrid}>{selected.achievements && <DetailBlock title="Key Achievements" value={selected.achievements} />}{selected.challenges && <DetailBlock title="Challenges / Blockers" value={selected.challenges} />}</div>}
                {selected.next_day_plan && <DetailBlock title="Next Working-Day Plan" value={selected.next_day_plan} />}
                {(selected.leads_contacted > 0 || selected.policies_closed > 0 || selected.renewals_completed > 0) && <div className={styles.numberGrid}>{selected.leads_contacted > 0 && <Metric label="Leads Contacted" value={selected.leads_contacted} />}{selected.policies_closed > 0 && <Metric label="Policies Closed" value={selected.policies_closed} />}{selected.renewals_completed > 0 && <Metric label="Renewals Completed" value={selected.renewals_completed} />}</div>}
                {selected.reviewer_notes && <div className={styles.reviewNote}><strong>Admin review note</strong><p>{selected.reviewer_notes}</p></div>}
                {canReview && selected.status !== 'reviewed' && (
                  <div className={styles.reviewBox}>
                    <label>Review notes<textarea rows="3" value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} placeholder="Add feedback or explain requested changes" /></label>
                    <div><button type="button" className={styles.changesButton} onClick={() => reviewReport('needs_changes')} disabled={reviewing}>Request Changes</button><button type="button" className={styles.approveButton} onClick={() => reviewReport('reviewed')} disabled={reviewing}>Mark Reviewed</button></div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }) { return <div className={`${styles.summaryCard} ${styles[tone]}`}><span className={styles.summaryIcon}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>; }
function DetailBlock({ title, value }) { return <div className={styles.detailBlock}><strong>{title}</strong><p>{value || 'No update provided.'}</p></div>; }
function Metric({ label, value }) { return <div className={styles.metric}><strong>{value || 0}</strong><span>{label}</span></div>; }
function RefreshIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg>; }
function ReportIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>; }
function ReturnIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 7-5 5 5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></svg>; }
function EditIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>; }
function DeleteIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>; }

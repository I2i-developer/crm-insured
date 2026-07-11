'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

export default function ImportPoliciesPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];

    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      const message = 'Please select a valid CSV or Excel file';
      setError(message);
      toast.error(message);
      return;
    }

    setSelectedFile(file);
    setError('');
    setSuccess('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const fakeEvent = { target: { files: [file] } };
      handleFileSelect(fakeEvent);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      const message = 'Please select a file first';
      setError(message);
      toast.warning(message);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const data = await api.upload('/policies/import', formData);

      const message = `Successfully imported ${data.imported} policies. ${data.failed > 0 ? `${data.failed} failed.` : ''}`;
      setSuccess(message);
      toast.success(message);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setTimeout(() => router.push('/policies'), 2000);
    } catch (err) {
      const message = err.message || 'Failed to import file';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Import Policies</h1>
        <p>Upload CSV or Excel file to bulk import policies</p>
      </header>

      <div className={styles.instructions}>
        <h3>File Requirements</h3>
        <ul>
          <li>Supported formats: CSV, XLSX</li>
          <li>Required columns: client_name, insurance_company, policy_number, premium_amount, due_date, issuance_date</li>
          <li>Optional columns: policy_type, payment_due_date, phone, email, status</li>
          <li>For this CRM, policy_type should be Health Insurance. Blank values are treated as Health Insurance.</li>
          <li>Date format: YYYY-MM-DD or MM/DD/YYYY</li>
        </ul>
      </div>

      <div
        className={styles.dropZone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFileSelect}
          className={styles.fileInput}
        />
        <div className={styles.dropContent}>
          <UploadIcon />
          <p>Drag & drop your file here, or <span className={styles.browseLink}>browse</span></p>
          <span className={styles.fileTypes}>CSV, XLSX files only</span>
        </div>
      </div>

      {selectedFile && (
        <div className={styles.selectedFile}>
          <FileIcon />
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{selectedFile.name}</span>
            <span className={styles.fileSize}>{(selectedFile.size / 1024).toFixed(2)} KB</span>
          </div>
          <button onClick={() => {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }} className={styles.removeFile}>
            <CloseIcon />
          </button>
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}
      {success && <div className={styles.successMsg}>{success}</div>}

      <div className={styles.actions}>
        <button onClick={() => router.back()} className={styles.cancelBtn}>
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!selectedFile || loading}
          className={styles.uploadBtn}
        >
          {loading ? 'Importing...' : 'Import Policies'}
        </button>
      </div>

      <div className={styles.template}>
        <h3>Download Template</h3>
        <p>Use this template to ensure your data is formatted correctly:</p>
        <button onClick={() => {
          const headers = ['client_name', 'policy_type', 'insurance_company', 'policy_number', 'premium_amount', 'due_date', 'payment_due_date', 'issuance_date', 'phone', 'email', 'status'];
          const sampleRow = ['John Doe', 'Health Insurance', 'HDFC', 'POL-001', '1500.00', '2026-05-15', '2026-05-01', '2025-05-15', '+919876543210', 'john@example.com', 'Pending'];
          const csv = [headers.join(','), sampleRow.join(',')].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'policy_import_template.csv';
          a.click();
        }} className={styles.downloadBtn}>
          <DownloadIcon /> Download CSV Template
        </button>
      </div>
    </div>
  );
}

const UploadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17,8 12,3 7,8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const FileIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './date-picker.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplay(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export default function DatePicker({ label, value, onChange, maxDate, placeholder = 'Select date', compact = false, required = false }) {
  const rootRef = useRef(null);
  const selectedDate = parseDate(value);
  const maximumDate = parseDate(maxDate) || new Date();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || maximumDate);

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [value]);

  useEffect(() => {
    const close = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells = Array(firstDay).fill(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);

  const nextMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  const canMoveNext = nextMonth <= maximumDate;
  const chooseDate = date => {
    if (!date || date > maximumDate) return;
    onChange(toDateValue(date));
    setOpen(false);
  };

  const picker = (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`} ref={rootRef}>
      <button type="button" className={styles.trigger} onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <CalendarIcon />
        <span className={value ? styles.value : styles.placeholder}>{formatDisplay(value) || placeholder}</span>
        <ChevronDownIcon />
      </button>
      {required && <input className={styles.hiddenInput} tabIndex="-1" aria-hidden="true" value={value} onChange={() => {}} required />}
      {open && (
        <div className={styles.popover} role="dialog" aria-label={label || placeholder}>
          <div className={styles.calendarHeader}>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} title="Previous month"><ChevronLeftIcon /></button>
            <strong>{viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" onClick={() => canMoveNext && setViewDate(nextMonth)} disabled={!canMoveNext} title="Next month"><ChevronRightIcon /></button>
          </div>
          <div className={styles.weekdays}>{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
          <div className={styles.days}>
            {days.map((date, index) => {
              if (!date || date > maximumDate) return <span className={styles.emptyDay} key={`empty-${index}`} />;
              const dateValue = toDateValue(date);
              const isSelected = dateValue === value;
              const isToday = dateValue === toDateValue(maximumDate);
              return (
                <button type="button" key={dateValue} className={`${styles.day} ${isSelected ? styles.selectedDay : ''} ${isToday ? styles.today : ''}`} onClick={() => chooseDate(date)} aria-pressed={isSelected}>
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className={styles.calendarFooter}>
            <button type="button" onClick={() => chooseDate(maximumDate)}>Today</button>
            {!required && value && <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );

  return label ? <label className={styles.field}><span>{label}{required ? ' *' : ''}</span>{picker}</label> : picker;
}

function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>; }
function ChevronLeftIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function ChevronRightIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>; }

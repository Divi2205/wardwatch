// =====================================================================
// utils.js : labels, colours and formatting shared by all components
// =====================================================================

// Default map centre (Chennai). Change this to your own ward.
export const MAP_CENTER = [13.0418, 80.2341];
export const MAP_ZOOM = 12;

export const STATUS_LABELS = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
  rejected: 'Rejected'
};

export const STATUS_COLORS = {
  submitted: '#5b6470',
  acknowledged: '#1f5fad',
  in_progress: '#9a6200',
  resolved: '#2f7d4f',
  closed: '#1e5235',
  reopened: '#c2410c',
  rejected: '#8a8f96'
};

export const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export const OPEN_STATUSES = ['submitted', 'acknowledged', 'in_progress', 'reopened'];

export const isOpen = (status) => OPEN_STATUSES.includes(status);

export const isOverdue = (issue) => isOpen(issue.status) && Number(issue.hours_open) > Number(issue.sla_hours);

export function timeAgo(dateString) {
  const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function formatDate(dateString) {
  return new Date(dateString).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export function formatHours(h) {
  if (h === null || h === undefined) return '–';
  h = Number(h);
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  const rest = Math.round(h % 24);
  return rest ? `${d} d ${rest} h` : `${d} d`;
}

// Only allow in-app paths as login redirect targets (blocks //evil.com)
export function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

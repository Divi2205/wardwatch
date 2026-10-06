// Small status and priority labels used across pages.
import { PRIORITY_LABELS, STATUS_LABELS } from '../utils';

export function StatusBadge({ status }) {
  return <span className="badge" data-status={status}>{STATUS_LABELS[status] || status}</span>;
}

// Solid = confirmed by an officer. Dashed = the system's suggestion.
export function PriorityTag({ issue }) {
  if (issue.priority) {
    return <span className="priority" data-p={issue.priority}>{PRIORITY_LABELS[issue.priority]}</span>;
  }
  return (
    <span
      className="priority suggested"
      data-p={issue.suggested_priority}
      title="Suggested automatically, not yet confirmed by an officer"
    >
      {PRIORITY_LABELS[issue.suggested_priority]} (suggested)
    </span>
  );
}

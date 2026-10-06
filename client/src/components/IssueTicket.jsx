// One issue in a list: status stripe on the left, key facts below.
import { Link } from 'react-router-dom';
import { PriorityTag, StatusBadge } from './Badges';
import { isOverdue, timeAgo } from '../utils';

export default function IssueTicket({ issue, active = false, ...events }) {
  return (
    <Link
      className={`ticket${active ? ' is-active' : ''}`}
      data-status={issue.status}
      data-id={issue.id}
      to={`/issues/${issue.id}`}
      {...events}
    >
      <div className="ticket-top">
        <h3>{issue.title}</h3>
      </div>
      <div className="meta">
        <span>{issue.category_label}</span>
        {issue.landmark && <span>{issue.landmark}</span>}
        <span>{timeAgo(issue.created_at)}</span>
      </div>
      <div className="row">
        <StatusBadge status={issue.status} />
        <PriorityTag issue={issue} />
        {issue.supporters > 0 && (
          <span className="backers">
            {issue.supporters} {issue.supporters === 1 ? 'neighbour' : 'neighbours'} also affected
          </span>
        )}
        {isOverdue(issue) && <span className="flag-overdue">Past target time</span>}
      </div>
    </Link>
  );
}

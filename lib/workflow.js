// ---------------------------------------------------------------------
// Status workflow rules. The server is the single source of truth for
// which status can follow which, so the admin UI cannot skip steps.
// ---------------------------------------------------------------------

const STATUSES = ['submitted', 'acknowledged', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected'];
const OPEN_STATUSES = ['submitted', 'acknowledged', 'in_progress', 'reopened'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// What an ADMIN may move an issue to from each status.
// "resolved -> closed" and "resolved -> reopened" belong to the reporter.
const ADMIN_TRANSITIONS = {
  submitted: ['acknowledged', 'in_progress', 'rejected'],
  acknowledged: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  reopened: ['in_progress'],
  resolved: [],
  closed: [],
  rejected: []
};

function nextStatusesForAdmin(current) {
  return ADMIN_TRANSITIONS[current] || [];
}

function canAdminMove(from, to) {
  return nextStatusesForAdmin(from).includes(to);
}

module.exports = { STATUSES, OPEN_STATUSES, PRIORITIES, nextStatusesForAdmin, canAdminMove };

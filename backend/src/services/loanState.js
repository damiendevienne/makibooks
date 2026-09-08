const LOAN_STATUSES = Object.freeze(['requested', 'refused', 'cancelled', 'active', 'returned']);

const ALLOWED_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['active', 'refused', 'cancelled']),
  active: Object.freeze(['cancelled', 'returned']),
  refused: Object.freeze([]),
  cancelled: Object.freeze([]),
  returned: Object.freeze([]),
});

function canTransition(from, to) {
  return LOAN_STATUSES.includes(from) && ALLOWED_TRANSITIONS[from].includes(to);
}

module.exports = { LOAN_STATUSES, ALLOWED_TRANSITIONS, canTransition };

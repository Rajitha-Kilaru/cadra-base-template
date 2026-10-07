// lifecycle.js — pure transition table. No DB, no Express.
// The ONLY legal moves. Moving to the current status is INVALID_TRANSITION.

const TRANSITIONS = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED', 'BACKORDERED'],
  BACKORDERED: ['CONFIRMED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const STATUSES = Object.keys(TRANSITIONS);

const LINE_EDITABLE = ['DRAFT', 'SUBMITTED'];

function canTransition(from, to) {
  if (!(from in TRANSITIONS)) return false;
  return TRANSITIONS[from].includes(to);
}

module.exports = { TRANSITIONS, STATUSES, LINE_EDITABLE, canTransition };
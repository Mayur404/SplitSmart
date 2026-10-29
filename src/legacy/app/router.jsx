/** Shared route labels used by the legacy workflow controller and React shell. */
export const VIEW_TITLES = Object.freeze({
  dashboard: 'Overview',
  groups: 'Group Roster',
  bill: 'Bill & Receipt Entry',
  assign: 'Assign Items',
  breakdown: 'Individual Shares',
  settlements: 'Settle Up',
  settings: 'Settings',
  claim: 'Claim Your Items',
});

export function getViewTitle(view) {
  return VIEW_TITLES[view] || 'SplitSmart';
}

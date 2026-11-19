/** GitHub and community features. All balancing for contributions lives here. */

/**
 * GitHub activity helps the farm, with a ceiling so empty commits don't pay: what counts is the
 * number of distinct days with public contributions in the last `windowDays`, up to `maxDays`.
 */
export const GITHUB_BONUS = {
  /** Faster crop growth and animal production per active day. */
  perActiveDay: 0.02,
  maxDays: 5,
  windowDays: 7,
  /** Real minutes between syncs (the public GitHub API allows few calls without a login). */
  syncCooldownMinutes: 30,
};

/** Public GitHub events that count as a contribution. */
export const CONTRIBUTION_EVENTS: readonly string[] = [
  'PushEvent',
  'PullRequestEvent',
  'PullRequestReviewEvent',
  'IssuesEvent',
  'IssueCommentEvent',
  'CreateEvent',
  'ReleaseEvent',
];

/**
 * Every WebDCS check the extension knows how to run.
 *
 * Adding a check means adding a folder entry here and a script under checks/.
 * The session handling, tab discovery, frame merging, error mapping and
 * logging are shared — a new check only has to read its page.
 *
 * `files` are injected in order into the same isolated world, so a check can
 * rely on a helper loaded before it. `timeoutMs` bounds the whole run.
 */
export const CHECKS = Object.freeze({
  dcm: {
    id: 'dcm',
    label: 'DCM cases waiting for response',
    files: ['checks/dcm-parse.js', 'checks/dcm.js'],
    timeoutMs: 25_000,
    /** Which in-page failure codes this check can raise, for the app's benefit. */
    failureCodes: ['BELL_NOT_FOUND', 'PANEL_NOT_LOADED', 'DCM_NOT_FOUND'],
  },
  // performance: { ... }
  // internalRecalls: { ... }
});

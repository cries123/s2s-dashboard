/**
 * Every check the extension knows how to run.
 *
 * Adding a check means adding an entry here and a script under checks/.
 * The session handling, tab discovery, frame merging, error mapping and
 * logging are shared — a new check only has to read its page.
 *
 * `files` are injected in order into the same isolated world, so a check can
 * rely on a helper loaded before it. `timeoutMs` bounds the whole run.
 * `tabPatterns` says which tabs the check can live in (the default is the
 * dealer portal). `notFound` is the error to report when no tab or frame had
 * what the check needs — each check knows what "nothing there" means for it.
 */
import { DPM_TAB_PATTERNS } from '../lib/session.js';

export const CHECKS = Object.freeze({
  /** How many DCM cases are waiting, from the portal header's notification tooltip. */
  dcm: {
    id: 'dcm',
    label: 'DCM cases waiting for response',
    files: ['checks/dcm-parse.js', 'checks/dcm.js'],
    timeoutMs: 25_000,
    notFound: {
      code: 'BELL_NOT_FOUND',
      message: 'The notification control could not be found on the WebDCS page.',
    },
  },

  /** The cases themselves — number, due date, VIN, customer — from the DCM Dashboard page. */
  dcmCases: {
    id: 'dcmCases',
    label: 'DCM case details',
    files: ['checks/dcm-parse.js', 'checks/dcm-dashboard.js'],
    timeoutMs: 25_000,
    notFound: {
      code: 'PAGE_NOT_OPEN',
      message: 'No open tab is showing the DCM Dashboard. Open it in WebDCS and try again.',
    },
  },

  /** Every metric card on the open DPM view: which are red, and the Service Lane verdict. */
  dpmCards: {
    id: 'dpmCards',
    label: 'DPM metric cards',
    files: ['checks/dpm-parse.js', 'checks/dpm-cards.js'],
    timeoutMs: 25_000,
    tabPatterns: DPM_TAB_PATTERNS,
    notFound: {
      code: 'PAGE_NOT_OPEN',
      message: 'No open tab is showing DPM. Open DPM from the dealer portal, go to the view you want, and try again.',
    },
  },

  // internalRecalls: { ... }
});

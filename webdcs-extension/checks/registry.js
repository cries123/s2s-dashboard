/**
 * Every check the extension knows how to run.
 *
 * Adding a check means adding an entry here and a script under checks/.
 * The session handling, tab discovery, frame merging, error mapping and
 * logging are shared — a new check only has to read its page.
 *
 * `files` are injected in order into the same isolated world, so a check can
 * rely on a helper loaded before it. `timeoutMs` bounds the whole run.
 * `marker` names the probe marker a tab must carry to be this check's page,
 * so a check is only ever run in the tab that is that page. `reloadBeforeRead`
 * reloads that tab first — for pages whose numbers are baked in at load time.
 * `notFound` is what to say when no readable tab was that page.
 */
export const CHECKS = Object.freeze({
  /** How many DCM cases are waiting, from the portal header's notification tooltip. */
  dcm: {
    id: 'dcm',
    label: 'DCM cases waiting for response',
    files: ['checks/dcm-parse.js', 'checks/dcm.js'],
    timeoutMs: 25_000,
    marker: /DCMNotification|notif/i,
    // The tooltip is rendered into the page when it loads; a portal tab left
    // open all afternoon still shows the afternoon it was opened.
    reloadBeforeRead: true,
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
    marker: /case-table|dcm-nav/,
    reloadBeforeRead: true,
    notFound: {
      code: 'PAGE_NOT_OPEN',
      message:
        'No readable tab is showing the DCM Dashboard. Open it from the red DCM notification, then click the assistant icon on that tab and choose Allow this site.',
    },
  },

  /** Every metric card on the open DPM view: which are red, and the Service Lane verdict. */
  dpmCards: {
    id: 'dpmCards',
    label: 'DPM metric cards',
    files: ['checks/dpm-parse.js', 'checks/dpm-cards.js'],
    timeoutMs: 25_000,
    marker: /ready:dpm/,
    // DPM is a single-page app; a reload would throw away the view the user
    // navigated to. Its own "Data updated" stamp says how fresh it is.
    reloadBeforeRead: false,
    notFound: {
      code: 'PAGE_NOT_OPEN',
      message:
        'No readable tab is showing DPM. Open DPM from the dealer portal, go to the view you want, then click the assistant icon on that tab and choose Allow this site.',
    },
  },

  // internalRecalls: { ... }
});

# ADR 0001 — How the dashboard automates WebDCS

**Status:** accepted · **Date:** 2026-09-23

## Question

The dashboard needs to read things out of Hyundai WebDCS — first, how many DCM
cases are waiting for a dealer response — using the user's own authenticated
session, without touching their password or 2FA.

## What was investigated

**An official API.** None exists for dealers. WebDCS (`wdcs.hyundaidealer.com`)
is an SAP NetWeaver Portal (`/irj/portal/...`, iViews). The only integration
Hyundai offers is DMS-vendor certification through Oxlo — a B2B channel for
systems like PBS, not something a dealership can call. The user manuals are
PDFs and do not document the notification area. So: no API, scrape the UI.

**Server-side browser automation (Playwright, Puppeteer, Selenium).** Rejected.
The app runs on Netlify functions — no persistent process, so a browser holding
a 2FA'd session has nowhere to live. It would also mean moving the user's
session to a machine that is not theirs, and WebDCS's own login page refuses
non-browser clients ("iView is not compatible with your browser"), which is a
strong signal it would fight headless access.

**A local agent (Node + Playwright on the user's PC).** Workable but heavier:
something to install and keep running, and it would either drive its own
browser (the user signs in there instead of their normal one) or attach to
Chrome's debugging port, which exposes every tab.

**A browser extension.** Chosen.

## Decision

A Manifest V3 extension, `webdcs-extension/`, that the dashboard talks to over
Chrome's `externally_connectable` channel.

```
S2S Dashboard (page)                    Extension (service worker)         WebDCS tab
 chrome.runtime.sendMessage(id, msg) ─▶ verify origin                       (user signed in)
                                        find WebDCS tab
                                        probe session ──── executeScript ─▶ _probe.js   (read-only)
                                        run check     ──── executeScript ─▶ dcm.js      (reads bell)
                          ◀───────────  { ok, dcmCasesWaiting, log }
```

- The user signs in and completes 2FA in their own tab, exactly as today.
- The extension never sees credentials, never reads cookies or storage, makes
  no network requests, and has only the `scripting` permission on
  `*.hyundaidealer.com`.
- It accepts messages only from `https://salestoservice.net` and `localhost`,
  and checks the origin on every message.
- What crosses back to the page is a count, a session state, an error code and
  a redacted technical log. Diagnostics are structural (tag/id/class/aria)
  with text stripped.
- No server changes. Nothing is stored anywhere in v1.

## Shape

| Piece | Role |
|---|---|
| `lib/session.js` | Find the WebDCS tab, fold per-frame probe results into one state. Shared by every check. |
| `checks/_probe.js` | Injected, read-only: is this frame a sign-in form, a 2FA prompt, an expired notice, or a signed-in page? |
| `checks/registry.js` | The list of checks. Adding one is an entry here plus a script. |
| `checks/dcm-parse.js` | Pure text rules. Loaded as a global before the check, and required directly by the tests. |
| `checks/dcm.js` | The DCM check: find bell → open → read → restore. |
| `background.js` | Message router, origin guard, timeouts, error mapping. |
| `src/lib/webdcs/*` | App side: protocol mirror, client, wording. |
| `src/components/dashboard/webdcs/WebDcsPanel.tsx` | The page. |

SAP Portal pages nest content in iframes, so both the probe and the check run
in every same-origin frame; the background script picks the frame that found
what it was looking for.

## What the first real run taught us (2026-09-23)

The selectors were written blind and the first run returned the structural
snapshot as designed. It showed the dealer portal is a **SharePoint site at
`www.hyundaidealer.com`** (`/_layouts/15/`, `SitePages`, `ctl00_` control ids)
that SSO-redirects into the SAP WebDCS. The "bell" is
`a#ctl00_DCMNotification1_lnkCaption` — an SSO link, so clicking it navigates
away — and beside it, already in the DOM inside `div.tooltipBox`, sits
`table.notification` with the notification rows as a hover tooltip.

So the DCM check now hovers rather than clicks, reads the table with
`textContent` (`innerText` is empty for hidden elements, which is why the
snapshot showed `textLen: 0`), and parses label/count rows. The generic
click-the-bell path remains as a fallback, with SSO links excluded so it can
never navigate the user away. What is still unknown is the exact wording of
those three rows; on an undecided read the redacted cell text comes back so
the format can be pinned in one more pass.

Session detection is the same: candidate markers, with a `unknown` state
surfaced rather than guessed at.

## Consequences

- Only works in Chrome/Edge on a desktop; the page says so elsewhere.
- Each user installs the extension once (unpacked, or later via a store
  listing / enterprise policy).
- A stable `key` in the manifest fixes the extension ID, so the app hardcodes
  it and there is no pairing step.
- Future checks (performance, internal recalls) reuse session handling and
  add one injected script each.
- Dealer policy: this reads a page the user is authorized to view, in their
  own browser, with no bypass. Confirm against the dealer agreement and HMA
  acceptable-use before rolling out to other users.

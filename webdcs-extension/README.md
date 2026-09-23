# S2S WebDCS Assistant (browser extension)

Reads DCM case counts from **your own signed-in WebDCS tab** and hands the
number to the S2S Dashboard. It never sees your password or 2FA code — you
sign in exactly as you do today; the extension only reads the page afterwards.

Architecture and the reasons behind it: `docs/adr/0001-webdcs-automation-architecture.md`.

## Install (unpacked, Chrome or Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → choose this `webdcs-extension` folder.
4. Confirm the ID shown is `bfmmmlookgfoldppkocabfhoiflnfibm`. It is fixed by
   the `key` in `manifest.json`, so the dashboard can find it without setup.

Reload the extension from that page after pulling changes.

## Use

1. In the dashboard, open **Manager → WebDCS** and click **Open WebDCS**.
2. Sign in and complete 2FA in that tab as normal.
3. Back in the dashboard, the status turns to **WebDCS ready**. Click
   **Run WebDCS check**.

## What it can and cannot touch

- Permissions: `scripting` on `*.hyundaidealer.com` only. No `tabs`, no
  `storage`, no `cookies`, no network.
- Accepts messages only from `https://salestoservice.net` and `localhost`.
- Result payload: count, state, error code, redacted log. Nothing else leaves
  the tab. Diagnostics are structural (tag/id/class/aria) and contain no text.
- On a sign-in or 2FA screen it stops and says so. It never retries
  authentication.

## Adding a check

1. Add `checks/<name>.js` — an injected script returning
   `{ ok, count|..., log }`, `{ ok:false, code, diagnostic }`, or `{ skipped:true }`
   for frames that don't apply.
2. Register it in `checks/registry.js`.
3. Mirror any new error codes in `src/lib/webdcs/protocol.ts` (a test enforces
   this) and add wording in `src/lib/webdcs/presentation.ts`.

## Dealer policy

This reads a page you are already authorized to view, in your own browser,
with no credential handling and no bypass of WebDCS controls. Confirm against
your dealer agreement and HMA acceptable-use terms before rolling it out to
other users.

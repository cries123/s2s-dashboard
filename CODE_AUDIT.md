# Code & Functionality Audit — Service to Sales Dashboard

Findings from a full read-through of every major feature area, verified against the actual code (not guessed). Organized by how much it matters: security first, then bugs that produce wrong data or crashes, then missing/half-built functionality, then lower-priority cleanup.

---

## 1. Security — cross-dealership data exposure

This is the one category worth fixing before anything else, because it affects customer PII across all three dealerships, not just one feature.

**Customers, appointments, recalls, and performance data aren't scoped by dealership in Firestore's own security rules.** `firestore.rules` lines 167, 174, 178, 217, 221, and 226 allow any approved user to read and write the entire `customers`, `appointmentTracker`, `appointmentSchedule`, `vehicleRecalls`, `recallCampaignLeads`, and `performance` collections — with no check that the record belongs to the reader's own dealership. Compare that to `dispatchOrders` and `vehicleInventory` a few lines down, which correctly check `data.dealershipId == userDealershipId()`. The gap isn't intentional; it's just inconsistent with the pattern used elsewhere in the same file.

This isn't theoretical — the app's own code exercises the hole. `src/hooks/useCustomers.ts` (lines 41–44) runs an **unfiltered** query against the customers collection whenever `dealershipId === 'hyundai'`, which is the app's default fallback, then filters client-side. In practice that means every Hyundai staff member's browser downloads Ford/Lincoln's and Nissan/Mazda's customer names, phones, emails, and vehicle info too, just to display only the Hyundai subset. `RecallCampaignOutreach.tsx` and `VehicleRecalls.tsx` do the same thing against `recallCampaignLeads` and `vehicleRecalls`.

**Six PBS ("PartnerHUB") API routes have no authentication at all.** In `server/handlers/pbsRoutes.ts`, `/api/pbs/test-connection`, `/api/pbs/contact-get`, `/api/pbs/contact-vehicle-get`, `/api/pbs/repair-order-get`, `/api/pbs/appointment-get`, and `/api/pbs/parts-invoice-get` (lines 60–129) are mounted with no login check whatsoever — contrast with the sibling `/api/pbs/sync/*` routes a few dozen lines later, which correctly require `resolvePbsSyncCaller`. Anyone who finds the URL can POST to these and pull live customer/vehicle/RO/invoice data out of PartnerHUB using the server's own stored credentials, no account needed.

**`/api/outreach/bulk` is also unauthenticated** (`server/handlers/registerOutreachRoutes.ts` line 124) — it sends SMS/email through the dealership's own Twilio/SendGrid accounts to whatever recipient list is POSTed to it, with no login required. That's an open relay risk on top of the data exposure.

**Smaller items in the same vein:** `/api/pbs/sync/status` leaks internal config/diagnostics to anonymous callers; the `aiUsageLogs` collection accepts writes from *any* signed-in user, including ones who haven't been approved yet (`firestore.rules` line ~231); `systemLogs` writes are similarly open to any signed-in account; and the shared-secret check used for the PBS cron auth isn't a constant-time comparison, which is a minor timing-attack surface.

None of this needs a rewrite — it's a matter of adding the same `dealershipId` check and `resolveApprovedUser`/`resolvePbsSyncCaller` calls that already exist and are used correctly elsewhere in the same files. I'd treat this as the first thing to fix, especially with real customer PII in these tables.

---

## 2. Bugs — wrong data or broken behavior, not just security

**Advisor named "Jay" gets silently deleted.** `AdvisorPerformance.tsx` (lines 133–140) has a hardcoded, case-insensitive check that auto-purges any advisor literally named "Jay" from Firestore on every page load, with no confirmation and no error handling if the delete fails. This reads like a leftover debug/test artifact — worth removing outright, and worth checking whether any real advisor happens to share that name.

**Editing appointment volume for a day that's already been saved silently reverts to the old number.** In `Appointments.tsx`, `handleSave` (lines 370–392) always pre-fills the breakdown modal from the *previously saved* total, not the number just typed in — so a day with 15 saved, edited to 18, and confirmed without noticing the modal still shows 15, ends up saved as 15 again. The increase is lost with no warning.

**"Archive & Restart Monthly" isn't atomic and can silently overwrite a prior month's snapshot.** `handleArchiveAndReset` (`Appointments.tsx` lines 120–263) does its archive writes and its reset writes as separate, unprotected `setDoc` calls with no check that the target month wasn't already archived. A network drop mid-operation, or an accidental double-click, can quietly clobber the true month-end record.

**Historical month view is half-live.** When a manager picks a past month from the "View Period" dropdown to audit old numbers, the Appt Forecast / Labor Pace / Month-End Projections cards at the top of Operations keep showing *live current-month* data instead of the selected month's — while the panels below correctly switch. Nothing on screen indicates the mismatch.

**Daily pace calculation is often wrong first thing in the morning.** `appointmentForecast.ts`'s `salesPaceWorkingDays` (lines 104–120) compares today's appointment count against the wrong reference date when the last DMS report is a few days stale and nobody's logged today's count yet — which is the normal state most mornings. The effect is an inflated labor/parts pace estimate until someone enters that day's number.

**Fixed Ops Forecast presets silently override the dealership's configured billing period.** Clicking Conservative/Balanced/Aggressive in `FixedOpsForecast.tsx` (`applyPreset`, lines 947–1035) always recalculates billing days for *next* month, even for a dealership explicitly configured to track the *current* month — quietly skewing every projection on the page until the settings listener happens to re-fire.

**Fixed Ops Forecast's current-month holiday calendar is wrong.** The current-month version of `isFederalHoliday` (lines 292–321) is missing Juneteenth, Columbus Day, and Veterans Day (all present in the next-month version a few dozen lines up), and has a bogus extra rule that misclassifies some December Mondays as holidays. This throws off billing-day counts and every projection built on them.

**Dispatch board's queue alert misses the most common case.** The waiting-queue sound/visual alert in `DispatchBoard.tsx` (lines 1263–1271) only fires when the queue count increases *and* was already non-empty — so the everyday case of "queue was empty, one new car shows up" never triggers it.

**Dispatch tickets can silently double-count as "written today."** `dispatchTransitions.ts` (lines 105–148) resets a ticket's creation date to "today" whenever it moves out of the unassigned queue — but the overnight sweep that's supposed to catch stale carryover tickets never touches tickets still sitting in that queue. A ticket queued yesterday and finally dispatched this morning gets counted as new business today.

**Two dispatchers can both fill the "last slot" in a lane at once.** Lane-capacity checks in `DispatchBoard.tsx` (lines 687–710) are pure client-side reads with no transaction, so two people dragging cards into the same nearly-full lane at the same moment can both succeed, silently exceeding the configured capacity.

**Manager "Approve manager" button is dead on arrival.** `AdminEnrollmentQueue.tsx` shows a working-looking "Approve manager" button to every manager, but Firestore rules (lines 85–130) unconditionally block non-admin managers from approving another manager — directly contradicting the app's own admin panel, which says only system admins can do this. Every click just fails.

**PBS sync can report "Success" while actually failing.** `server/pbs/pbsSync.ts` catches advisor/technician/dispatch sync errors internally but never surfaces them as a real failure — the sync panel shows a green success card even when PartnerHUB rejected part of the sync (bad credentials, API change, etc.), and the actual error text gets truncated out of view.

**Profile edits can clobber concurrently-synced data.** `ProfileModal`'s save writes back a stale full snapshot of the customer record rather than a targeted update, so editing one field while, say, a PBS sync updates `recentVisits` in the background can overwrite that sync.

---

## 3. Gaps — functionality that's missing, half-built, or silently dead

A few of these are direct fallout from removing PDF import — worth knowing which manual-entry paths still need finishing:

**Advisor "Upsells" card is permanently empty now.** PDF import used to populate advisor upsell data; the new manual-entry form has no fields for it at all, so every advisor card just says "No upsell data available" going forward, for every dealership, with nothing telling a manager this is expected.

**Fixed Ops Forecast's "Forecast Generator" only accepts fake demo data.** The only remaining input path is a dropdown of three hardcoded sample reports — there's no way to paste or upload a real DMS report anymore, even though the header still calls it a "DMS Report Parser." For a dealership that isn't on PBS, this screen currently can't do anything useful.

**Pot of Gold's roster is hardcoded, not per-dealership.** The technician and advisor name lists are fixed module-level constants (the same six names for every dealership) rather than pulled from each dealership's actual roster the way Advisor Performance does — so a second or third dealership using this tab is tracking names that aren't their actual staff.

**"Format Validator" button does nothing.** It's wired to a hardcoded `alert("Data validation check: OK...")` regardless of what's actually in the data — worth either building real validation or removing the button so it doesn't create false confidence.

**Month-end archive never captures appointment volume**, which is the headline number the Operations page is built around — advisor and tech performance get archived, but appointment counts don't.

**A saved "which advisors count toward the forecast" setting is never actually applied** — a manager can deselect an advisor in settings and the forecast rollup won't change, because nothing reads that setting back.

**Contact log is write-only.** Nothing in the app surfaces a customer's logged contact history back to the user — "View Interaction Log" just reopens the profile modal, which doesn't show it.

**Bulk recall outreach marks every selected customer as "contacted" after only actually messaging the first one.**

**New customers can be enrolled with no phone and no email while service alerts default to on**, which means an alert can be silently un-actionable from day one.

---

## 4. Lower-priority improvements

A shorter list of real but non-urgent issues, if useful to have on record: duplicated tenant-scoping logic copy-pasted five times in `Appointments.tsx` instead of reusing the existing shared helper; unmemoized forecast recalculation on every render (fine today, will matter if the calculation grows); an unbounded RO-number substring search that produces noisy false-positive matches on short numeric queries; a new `AudioContext` created and torn down on every dispatch-queue alert instead of being reused; a stale `AdminPanel.tsx` query where both branches of a conditional are identical (leftover from an incomplete refactor); and a client-side admin-permission check for changing staff roles that's drifted out of sync with the shared permission helper used everywhere else, which is the kind of thing that reintroduces bugs the next time either one gets edited alone.

---

*Every item above was verified by reading the actual source, not inferred from naming or comments. File and line references are current as of this audit.*

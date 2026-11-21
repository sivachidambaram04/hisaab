# Hisaab Build Log

## Stage 1: Core logic
- **What was built**:
  - Created project structure under `hisaab/` with `data/sample-data.json` and `data/sample-expected.json`.
  - Implemented pure ledger functions in `logic.js` (no DOM, no browser APIs, no external packages): balance computation (`credit - payment`), total outstanding, newest-first entry ordering, replace-only JSON import skipping entries for unknown phones with loaded/skipped counts, validation for 10-digit phone, positive whole-rupee integer amount, duplicate phone refusal, and Indian digit grouping (`formatRupees`).
  - Created `tests/logic.test.js` using Node's built-in `node:test`.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `data/sample-data.json`, `data/sample-expected.json`
- **Test / check output**:
  - `node --test`: **PASS** (11/11 tests passed, 0 failed; verified 8 customers, total `11820`, every customer balance matching `data/sample-expected.json`, Ravi `9000000101` = `670`, Ravi entries newest first, invalid/duplicate phones refused, invalid amounts refused, customer with no entries = `Rs 0`, import replaces data and skips unknown-phone entries).
- **Problems found & fixes**: None.

## Stage 2: Screens and storage
- **What was built**:
  - Created mobile-first UI in `index.html` and `styles.css` (375 px first, 44 px+ tap targets, no sideways scroll).
  - Wired `app.js` to `logic.js` and `localStorage` under key `hisaab.v1`.
  - Home screen shows `#total-outstanding`, add-customer form, and customer rows `[data-customer="<phone>"]` with `[data-balance]` inside.
  - Customer page shows current computed balance, newest-first entry list, add credit/payment form, and Back button.
  - Added pure `formatDisplayDate` and `deserializeState` in `logic.js` so empty or corrupt `localStorage` recovers safely without crashing.
- **Files changed**: `index.html`, `styles.css`, `app.js`, `logic.js`, `tests/logic.test.js`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (13/13 tests passed, 0 failed).
  - HTTP preview verified (`200 OK` on `/`, `/app.js`, `/logic.js`).
- **Problems found & fixes**: None.

## Stage 3: Import, screenshot, reminder
- **What was built**:
  - Added JSON import box (`#import-box`) and import button (`#import-go`) on the home screen; replaces data via `importLedger`, skips unknown-phone entries, and displays loaded/skipped counts via `formatImportSummary`.
  - Added payment screenshot file input (`#shot-input`) shown when Payment is selected; compresses images on an offscreen `<canvas>` to max 480 px wide JPEG (`0.72` quality) before storing in `hisaab.v1`, falls back to saving the entry without the screenshot with a clear alert if `localStorage` is full, and renders `img[data-shot]` on saved entries.
  - Added WhatsApp reminder link `a[data-remind="<phone>"]` on every customer row with `href="https://wa.me/91<phone>?text=<message>"` carrying shop name, customer name, and Indian-grouped balance (e.g. `Rs 2,810`), or account-clear wording when balance is `0`.
  - Added pure `buildReminderMessage`, `buildWhatsAppUrl`, and `formatImportSummary` in `logic.js` with unit tests.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `styles.css`, `app.js`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (17/17 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Stage 4: Date and phone polish + README
- **What was built**:
  - Added pure `resolveToday(search, fallbackNow)` in `logic.js` honouring `?today=YYYY-MM-DD` (with fallback to local date if absent or invalid) and wired it into `app.js` for default entry dates.
  - Polished 375 px phone layout in `styles.css` (stacked `.field-row` on `< 420px` so native date inputs never overflow or crowd the amount field, 44 px+ tap targets throughout).
  - Wrote `README.md` documenting what Hisaab is, how to run it locally and deploy statically, how to run `node --test`, and storage limits.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `app.js`, `styles.css`, `README.md`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (19/19 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Stage 5: Self-check (Core)
- **What was built / checked**:
  - Verified all 9 PRD acceptance criteria in real headless Chromium at `375 x 812` viewport with `?today=2026-11-15` and `data/sample-data.json` loaded.
- **Files changed**: `BUILD_LOG.md`
- **Test / check output**:
  - `node --test`: **PASS** (19/19 tests passed).
  - Headless Chromium 375 px self-check:
    - PRD 1 (Add customer & refuse 9-digit phone): **PASS**
    - PRD 2 (Add credit Rs 250 & `?today=2026-11-15` default date): **PASS**
    - PRD 3 (Sample import: 8 customers, `#total-outstanding` = `Rs 11,820`, Ravi = `Rs 670`): **PASS**
    - PRD 4 (Ravi's entries newest first: 25 Oct payment `Rs 1,500` above 23 Oct credit `Rs 180`): **PASS**
    - PRD 5 & 7 (Payment screenshot resized from 640 px PNG to 480 px JPEG + balance survives reload): **PASS**
    - PRD 6 (WhatsApp `a[data-remind="9000000101"]` href `https://wa.me/919000000101?text=...` with shop name, Ravi Kumar, Rs 670): **PASS**
    - PRD 8 (Import customer with no entries loads cleanly as `Rs 0`): **PASS**
    - PRD 9 (375 px layout: `scrollWidth === 375`, 0 tap targets under 44 px, 0 console/page errors): **PASS**
- **Problems found & fixes**: None.

## Bonus 1: Search
- **What was built**:
  - Added pure `filterCustomers(customers, query)` in `logic.js` matching name (case-insensitive) or phone substring.
  - Added `#customer-search` search input on the home screen; filters visible customer rows live while keeping `#total-outstanding` for the whole shop and showing a clear empty state when no customers match.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `app.js`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (20/20 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Bonus 2: Edit and delete an entry
- **What was built**:
  - Assigned/preserved stable entry `id`s on `addEntry` and `importLedger` in `logic.js`, and implemented pure `updateEntry(state, entryId, patch)` and `deleteEntry(state, entryId)`.
  - Added inline `Edit` form (type, amount, date, note, Save/Cancel with validation) and two-tap inline `Delete` confirmation (`Confirm delete` / `Cancel`) on every entry card on the customer page.
  - Customer balance and `#total-outstanding` recalculate dynamically from entries after every edit or delete and persist to `hisaab.v1`.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `app.js`, `styles.css`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (22/22 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Bonus 3: CSV export
- **What was built**:
  - Added pure `escapeCsvValue` and `exportLedgerCsv(customers, entries)` in `logic.js` generating RFC-4180 CSV (`customer_name,phone,date,type,amount,note`).
  - Added `#export-csv-btn` ("Export CSV") in the Import & Backup card on the home screen; triggers a `hisaab-YYYY-MM-DD.csv` download honouring `?today=` and displays an export confirmation message.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `styles.css`, `app.js`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (24/24 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Bonus 4: Overdue list
- **What was built**:
  - Added pure `daysBetweenDates` and `getOverdueCustomers(customers, entries, todayStr)` in `logic.js`; filters to customers with `balance > 0`, computes days since last payment (or earliest credit if never paid) against `todayStr` (honouring `?today=YYYY-MM-DD`), and sorts descending by days overdue (tie-broken by balance desc, then name).
  - Added `All` (`#tab-all`) and `Overdue` (`#tab-overdue`) tabs in the Customers card on the home screen; displays `<N> days since last payment` (`data-overdue-days`) on overdue rows while keeping `[data-customer]`, `[data-balance]`, and `a[data-remind]` intact.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `styles.css`, `app.js`
- **Test / check output**:
  - First run: **FAIL** (24/26 passed, 2 failed with `ReferenceError: getOverdueCustomers is not defined` in `tests/logic.test.js`).
  - After fix: `node --check app.js && node --check logic.js && node --test`: **PASS** (26/26 tests passed, 0 failed).
- **Problems found & fixes**:
  - `getOverdueCustomers` import was dropped during concurrent edits to `tests/logic.test.js`. Added the import and verified all 26 tests pass.

## Bonus 5: UPI payment link in reminders
- **What was built**:
  - Added pure `validateUpiId` and `buildUpiPayUrl({ upiId, shop, amount })` in `logic.js` generating `upi://pay?pa=...&pn=...&am=...&cu=INR` links for positive balances, and updated `buildReminderMessage` / `buildWhatsAppUrl` to embed the UPI link inside WhatsApp reminders when configured.
  - Preserved `upiId` in `createEmptyState`, `importLedger`, and `deserializeState` under `hisaab.v1`.
  - Added one-field Shop UPI ID setting card (`#upi-form`, `#upi-id-input`, `#upi-save-btn`) on the home screen and a direct `Pay via UPI` link (`a[data-upi-link]`) on the customer page when a UPI ID is saved and balance > 0.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `app.js`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (29/29 tests passed, 0 failed).
- **Problems found & fixes**:
  - While editing `app.js` for Bonus 5, noticed that a concurrent edit during Bonus 4 had dropped `getOverdueCustomers`, `tabAll`, `tabOverdue`, and `activeTab` from the top of `app.js`. Restored all four alongside the Bonus 5 additions.

## Bonus 6: Hindi and Telugu labels (English default)
- **What was built**:
  - Added complete English (`en`, default), Hindi (`hi`), and Telugu (`te`) label dictionaries (`LABELS`, `getLabels`) in `logic.js`, and persisted `lang` inside `hisaab.v1`.
  - Added `<select id="lang-select">` in the top utility bar (`44 px` height) and wired all static (`[data-i18n]`) and dynamic UI labels in `app.js` to switch immediately across English, Hindi, and Telugu without altering required selectors or rupee formatting.
  - Updated `README.md` to mention all bonus features.
- **Files changed**: `logic.js`, `tests/logic.test.js`, `index.html`, `styles.css`, `app.js`, `README.md`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (31/31 tests passed, 0 failed).
- **Problems found & fixes**: None.

## Final Self-Check (375 px, Core + All 6 Bonus Items)
- **What was checked**:
  - Ran full headless Chromium verification at `375 x 812` viewport against the live static server with `data/sample-data.json` loaded, `?today=2026-11-15` and `?today=2026-11-20`, plus `node --test`.
- **Files changed**: `BUILD_LOG.md`
- **Test / check output**:
  - `node --test`: **PASS** (31/31 tests passed, 0 failed).
  - Headless Chromium 375 px checks:
    1. Import sample (`#import-box` + `#import-go`): 8 customers, `#total-outstanding` = `Rs 11,820`, every customer balance matches `data/sample-expected.json`, Ravi = `Rs 670` — **PASS**
    2. WhatsApp reminder `a[data-remind="9000000101"]` (`https://wa.me/919000000101?text=...`) contains shop name, Ravi Kumar, `Rs 670` — **PASS**
    3. Refusals for 9-digit phone, duplicate phone, and zero amount — **PASS**
    4. Ravi's page entry order: 25 Oct 2026 Payment `Rs 1,500` above 23 Oct 2026 Credit `Rs 180` — **PASS**
    5. Payment screenshot (`#shot-input` -> `img[data-shot]` resized to 480 px JPEG) and balance (`Rs 600`) survive reload — **PASS**
    6. Clear site data + import customer with no entries loads cleanly as `Rs 0` with account-clear reminder — **PASS**
    7. Bonus 1 (Search): typing `rav` leaves only Ravi (`9000000101`) — **PASS**
    8. Bonus 2 (Edit & Delete): editing payment (`Rs 600` -> `Rs 500`) and deleting it (`Rs 500` -> `Rs 670`) recalculates balance and total — **PASS**
    9. Bonus 3 (CSV export): exports 38 entries with RFC-4180 escaping — **PASS**
    10. Bonus 4 (Overdue list + `?today=`): Prakash Rao top at `61 days` on `?today=2026-11-15` and `66 days` on `?today=2026-11-20`; Ravi at `21 days` -> `26 days` — **PASS**
    11. Bonus 5 (UPI link): saving `lakshmistore@upi` embeds `upi://pay?pa=lakshmistore%40upi...&am=670&cu=INR` in WhatsApp reminders and customer detail `Pay via UPI` link — **PASS**
    12. Bonus 6 (Hindi / Telugu dropdown): switches labels to Hindi (`कुल बकाया`) and Telugu (`మొత్తం బాకీ`) with English default — **PASS**
    13. 375 px layout & console errors: `scrollWidth === 375` across Home (EN/HI/TE), Customer Detail, and Inline Edit; 0 tap targets under 44 px; 0 console/page errors — **PASS**
- **Problems found & fixes**: None.

## Fix: Stale browser module cache breaking JS execution after Stage 2
- **Problem found**:
  - After Siva opened the preview at Stage 2 and later reloaded for final checks, the browser loaded the new `index.html` and `app.js` while reusing the cached Stage 2 `logic.js` (missing exports added in Stages 3–6). ES module linking failed before `app.js` ran, causing Import JSON clicks to do nothing and Add Customer to fall back to a native HTML GET submit (`/?name=Ravi+Kumar&phone=9000000101`).
- **Fix applied**:
  - Added cache-busting query strings (`?v=2`) to `styles.css` and `app.js` in `index.html` and to `./logic.js` in `app.js`.
  - Restarted the preview HTTP server with `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` headers.
- **Files changed**: `index.html`, `app.js`, `BUILD_LOG.md`
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (31/31 tests passed, 0 failed).
  - Full 375 px headless Chromium check: **PASS** (14/14 checks passed, 0 console errors).

## Fix: Handle sandboxed storage gracefully + standalone preview artifact
- **Problem found**:
  - Siva's DevTools screenshot showed Antigravity's `FetchSandboxPort` proxy returning HTTP 400 when forwarding `localhost:8000`, which prevented `app.js`/`logic.js` from loading in the remote port-forwarded preview pane.
- **Fix applied**:
  - Updated `trySaveState` in `app.js` to distinguish `QuotaExceededError` (real storage full, keeping screenshot fallback) from `SecurityError` (storage disabled in sandboxed preview frames, allowing smooth in-memory operation with warning).
  - Created a standalone self-contained preview artifact `hisaab_preview.html` (in the artifact directory, outside the project repo) so Siva can test Hisaab directly in the preview pane without needing `FetchSandboxPort`.
- **Files changed**: `app.js`, `BUILD_LOG.md` (project repo untouched structurally; standalone preview saved as artifact)
- **Test / check output**:
  - `node --check app.js && node --check logic.js && node --test`: **PASS** (31/31 tests passed, 0 failed).
  - Headless Chromium check on standalone `hisaab_preview.html` over `file://`: **PASS** (`Loaded 8 customers and 38 entries.`, `Rs 11,820`, Ravi `Rs 670`, 0 errors).

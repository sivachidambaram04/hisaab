# Hisaab

Hisaab is a lightweight digital credit ledger (khata) for a kirana shop, built with plain HTML, CSS, and JavaScript (ES modules). There is no framework, no build step, no npm packages, no backend, and no AI.

## Features
- Track customers by name and 10-digit phone number (duplicate and invalid phones refused).
- Record **Credit** (goods given) and **Payment** (money received) entries in whole rupees as integers.
- Balances per customer and shop **Total Outstanding** are always calculated live from entries, never stored.
- Customer pages list entries newest first.
- Attach payment screenshots (compressed to max 480 px wide JPEG before saving, with graceful fallback if browser storage is full).
- One-tap WhatsApp reminder links (`https://wa.me/91<phone>?text=...`) carrying the shop name, customer name, and Indian-formatted balance.
- Replace-only JSON import with unknown-phone skipping and load counts, plus CSV export.
- Customer search by name or phone, inline edit/delete for entries, overdue list sorted by days since last payment, optional shop UPI ID embedded as a `upi://pay` link in WhatsApp reminders, and English / Hindi / Telugu label selector.
- Persists locally in browser `localStorage` under the key `hisaab.v1`.
- Mobile-first layout designed for 375 px screens with 44 px+ tap targets and no sideways scroll.
- Supports `?today=YYYY-MM-DD` in the URL for deterministic date behavior.

## How to run
Serve the project folder with any static file server (ES modules require HTTP rather than `file://`):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` (or `http://localhost:8000/?today=2026-11-15`) in a browser.

To deploy as a static site (for example on Vercel):
- **Framework preset**: Other
- **Build command**: *(empty)*
- **Output directory**: *(empty / repository root)*

## How to test
All money, balance, date, reminder, and import logic lives in `logic.js` (pure functions, no DOM) and is tested with Node's built-in test runner (Node 20+):

```bash
node --test
```

## Storage & limits
- Data is stored only in your browser's `localStorage` under `hisaab.v1`. Clearing site data removes it.
- Browser storage is typically ~5 MB. Payment screenshots are resized to 480 px wide JPEG; if storage fills up, Hisaab shows a message and saves the payment entry without the image.

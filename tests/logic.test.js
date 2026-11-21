import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createEmptyState,
  validatePhone,
  validateAmount,
  addCustomer,
  addEntry,
  updateEntry,
  deleteEntry,
  getCustomerBalance,
  getAllBalances,
  getTotalOutstanding,
  getCustomerEntries,
  importLedger,
  formatRupees,
  formatDisplayDate,
  deserializeState,
  buildReminderMessage,
  buildWhatsAppUrl,
  formatImportSummary,
  resolveToday,
  filterCustomers,
  exportLedgerCsv,
  getOverdueCustomers,
  validateUpiId,
  buildUpiPayUrl,
  LABELS,
  getLabels,
  extractAmount,
} from '../logic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleDataRaw = readFileSync(join(__dirname, '../data/sample-data.json'), 'utf8');
const sampleExpected = JSON.parse(
  readFileSync(join(__dirname, '../data/sample-expected.json'), 'utf8')
);

describe('Sample data import and balances', () => {
  it('loads 8 customers and computes total outstanding = 11820', () => {
    const result = importLedger(sampleDataRaw);
    assert.equal(result.ok, true);
    assert.equal(result.state.customers.length, 8);
    assert.equal(result.counts.customersLoaded, 8);
    assert.equal(result.counts.skippedUnknownPhone, 0);

    const total = getTotalOutstanding(result.state.customers, result.state.entries);
    assert.equal(total, 11820);
    assert.equal(total, sampleExpected.total_outstanding);
  });

  it('matches every customer balance in data/sample-expected.json and Ravi (9000000101) = 670', () => {
    const { state } = importLedger(sampleDataRaw);
    const balances = getAllBalances(state.customers, state.entries);

    assert.equal(getCustomerBalance(state.entries, '9000000101'), 670);
    assert.deepEqual(balances, sampleExpected.balances);

    for (const customer of state.customers) {
      assert.equal(Object.hasOwn(customer, 'balance'), false);
    }
  });

  it('orders Ravi entries newest first (25 Oct payment above 23 Oct credit)', () => {
    const { state } = importLedger(sampleDataRaw);
    const raviEntries = getCustomerEntries(state.entries, '9000000101');

    assert.equal(raviEntries.length, 6);
    assert.equal(raviEntries[0].date, '2026-10-25');
    assert.equal(raviEntries[0].type, 'payment');
    assert.equal(raviEntries[0].amount, 1500);

    assert.equal(raviEntries[1].date, '2026-10-23');
    assert.equal(raviEntries[1].type, 'credit');
    assert.equal(raviEntries[1].amount, 180);

    for (let i = 1; i < raviEntries.length; i += 1) {
      assert.ok(raviEntries[i - 1].date >= raviEntries[i].date);
    }
  });
});

describe('Validation: phone, amount, and duplicate phone', () => {
  it('refuses 9-digit, 11-digit, and non-numeric phones', () => {
    assert.equal(validatePhone('900000010').ok, false);
    assert.equal(validatePhone('90000001011').ok, false);
    assert.equal(validatePhone('90000abc01').ok, false);
    assert.equal(validatePhone('').ok, false);
    assert.equal(validatePhone('9000000101').ok, true);
  });

  it('refuses duplicate phone when adding a customer', () => {
    let state = createEmptyState('Test Shop');
    const first = addCustomer(state, { name: 'Ravi Kumar', phone: '9000000101' });
    assert.equal(first.ok, true);
    state = first.state;

    const dup = addCustomer(state, { name: 'Other Ravi', phone: '9000000101' });
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already exists/i);
  });

  it('refuses 9-digit phone via addCustomer', () => {
    const state = createEmptyState('Test Shop');
    const res = addCustomer(state, { name: 'Ravi Kumar', phone: '900000010' });
    assert.equal(res.ok, false);
  });

  it('refuses zero, negative, decimal, and non-numeric amounts', () => {
    assert.equal(validateAmount(0).ok, false);
    assert.equal(validateAmount(-50).ok, false);
    assert.equal(validateAmount(12.5).ok, false);
    assert.equal(validateAmount('12.5').ok, false);
    assert.equal(validateAmount('abc').ok, false);
    assert.equal(validateAmount('').ok, false);
    assert.equal(validateAmount(250).ok, true);
    assert.equal(validateAmount('250').ok, true);
  });
});

describe('Balances and entry ordering', () => {
  it('computes balance = credit minus payments dynamically and keeps newest-added first on same date', () => {
    let state = createEmptyState('Test Shop');
    state = addCustomer(state, { name: 'Ravi Kumar', phone: '9000000101' }).state;
    assert.equal(getCustomerBalance(state.entries, '9000000101'), 0);

    state = addEntry(state, {
      phone: '9000000101',
      type: 'credit',
      amount: 250,
      date: '2026-11-15',
      note: 'rice',
    }).state;
    assert.equal(getCustomerBalance(state.entries, '9000000101'), 250);

    state = addEntry(state, {
      phone: '9000000101',
      type: 'payment',
      amount: 100,
      date: '2026-11-15',
      note: 'cash',
    }).state;
    assert.equal(getCustomerBalance(state.entries, '9000000101'), 150);

    const list = getCustomerEntries(state.entries, '9000000101');
    assert.equal(list[0].note, 'cash');
    assert.equal(list[1].note, 'rice');
  });
});

describe('Import edge cases', () => {
  it('imports a customer with no entries as Rs 0', () => {
    const res = importLedger({
      shop: 'Quiet Store',
      customers: [{ name: 'Meena', phone: '9000000999' }],
      entries: [],
    });
    assert.equal(res.ok, true);
    assert.equal(res.counts.customersLoaded, 1);
    assert.equal(res.counts.entriesLoaded, 0);
    assert.equal(getCustomerBalance(res.state.entries, '9000000999'), 0);
    assert.equal(formatRupees(getCustomerBalance(res.state.entries, '9000000999')), 'Rs 0');
    assert.equal(getTotalOutstanding(res.state.customers, res.state.entries), 0);
  });

  it('replaces earlier data instead of merging and skips entries for unknown phones with counts', () => {
    const first = importLedger(sampleDataRaw);
    assert.equal(first.state.customers.length, 8);

    const replacement = importLedger(
      JSON.stringify({
        shop: 'New Shop',
        customers: [{ name: 'Asha', phone: '9111111111' }],
        entries: [
          {
            phone: '9111111111',
            type: 'credit',
            amount: 500,
            date: '2026-11-10',
            note: 'oil',
          },
          {
            phone: '9000000101',
            type: 'credit',
            amount: 999,
            date: '2026-11-10',
            note: 'unknown customer from old shop',
          },
          {
            phone: '9222222222',
            type: 'payment',
            amount: 100,
            date: '2026-11-11',
            note: 'also unknown',
          },
        ],
      })
    );

    assert.equal(replacement.ok, true);
    assert.equal(replacement.state.shop, 'New Shop');
    assert.equal(replacement.state.customers.length, 1);
    assert.equal(replacement.counts.customersLoaded, 1);
    assert.equal(replacement.counts.entriesLoaded, 1);
    assert.equal(replacement.counts.skippedUnknownPhone, 2);
    assert.equal(getTotalOutstanding(replacement.state.customers, replacement.state.entries), 500);
  });
});

describe('Rupee formatting', () => {
  it('formats whole rupees with Indian digit grouping', () => {
    assert.equal(formatRupees(0), 'Rs 0');
    assert.equal(formatRupees(670), 'Rs 670');
    assert.equal(formatRupees(2810), 'Rs 2,810');
    assert.equal(formatRupees(11820), 'Rs 11,820');
    assert.equal(formatRupees(1234567), 'Rs 12,34,567');
  });
});

describe('Date display and storage deserialization', () => {
  it('formats YYYY-MM-DD dates for display without timezone shift', () => {
    assert.equal(formatDisplayDate('2026-10-25'), '25 Oct 2026');
    assert.equal(formatDisplayDate('2026-09-08'), '8 Sep 2026');
  });

  it('returns empty state safely when storage is empty or corrupt', () => {
    const empty = deserializeState(null);
    assert.equal(empty.corrupt, false);
    assert.deepEqual(empty.state.customers, []);
    assert.deepEqual(empty.state.entries, []);

    const corrupt = deserializeState('{not valid json');
    assert.equal(corrupt.corrupt, true);
    assert.deepEqual(corrupt.state.customers, []);

    const wrongShape = deserializeState('{"foo":"bar"}');
    assert.equal(wrongShape.corrupt, true);
    assert.deepEqual(wrongShape.state.customers, []);

    const valid = deserializeState(sampleDataRaw);
    assert.equal(valid.corrupt, false);
    assert.equal(valid.state.customers.length, 8);
  });
});

describe('WhatsApp reminders and import summary', () => {
  it('builds reminder message and wa.me URL with shop name, customer name, and Indian grouped balance', () => {
    const url = buildWhatsAppUrl({
      phone: '9000000103',
      shop: 'Lakshmi Provision Store (fictional)',
      customerName: 'Mohd Irfan',
      balance: 2810,
    });
    assert.ok(url.startsWith('https://wa.me/9190000103?text=') === false);
    assert.ok(url.startsWith('https://wa.me/919000000103?text='));
    const decoded = decodeURIComponent(url.split('?text=')[1]);
    assert.match(decoded, /Lakshmi Provision Store/);
    assert.match(decoded, /Mohd Irfan/);
    assert.match(decoded, /Rs 2,810/);
  });

  it('uses account-clear wording when balance is zero', () => {
    const msg = buildReminderMessage({
      shop: 'Lakshmi Store',
      customerName: 'Ravi Kumar',
      balance: 0,
    });
    assert.match(msg, /Ravi Kumar/);
    assert.match(msg, /Lakshmi Store/);
    assert.match(msg, /clear/i);
  });

  it('keeps payment screenshot data URL only on payment entries', () => {
    let state = createEmptyState('Test');
    state = addCustomer(state, { name: 'Ravi', phone: '9000000101' }).state;
    const pay = addEntry(state, {
      phone: '9000000101',
      type: 'payment',
      amount: 100,
      date: '2026-11-15',
      note: 'UPI',
      shot: 'data:image/jpeg;base64,/9j/4AAQ',
    });
    assert.equal(pay.ok, true);
    assert.equal(pay.entry.shot, 'data:image/jpeg;base64,/9j/4AAQ');

    const cred = addEntry(pay.state, {
      phone: '9000000101',
      type: 'credit',
      amount: 100,
      date: '2026-11-15',
      note: 'rice',
      shot: 'data:image/jpeg;base64,/9j/4AAQ',
    });
    assert.equal(cred.ok, true);
    assert.equal(cred.entry.shot, undefined);
  });

  it('formats import summary with loaded and skipped counts', () => {
    const summary = formatImportSummary({
      customersLoaded: 8,
      entriesLoaded: 38,
      skippedUnknownPhone: 2,
      skippedInvalidEntries: 0,
      skippedCustomers: 0,
    });
    assert.match(summary, /Loaded 8 customers and 38 entries/);
    assert.match(summary, /Skipped 2 entries for unknown phones/);
  });
});

describe('Today date resolution (?today=YYYY-MM-DD)', () => {
  it('honours valid ?today=YYYY-MM-DD query parameter', () => {
    const fallback = new Date(2026, 10, 20);
    assert.equal(resolveToday('?today=2026-11-15', fallback), '2026-11-15');
    assert.equal(resolveToday('?foo=1&today=2026-11-15&bar=2', fallback), '2026-11-15');
  });

  it('falls back to local date when ?today is absent or invalid', () => {
    const fallback = new Date(2026, 10, 20); // 2026-11-20
    assert.equal(resolveToday('', fallback), '2026-11-20');
    assert.equal(resolveToday('?today=not-a-date', fallback), '2026-11-20');
    assert.equal(resolveToday('?today=2026-02-30', fallback), '2026-11-20');
  });
});

describe('Bonus 1: Customer search', () => {
  it('filters customers by name (case-insensitive) or phone substring', () => {
    const { state } = importLedger(sampleDataRaw);

    const byName = filterCustomers(state.customers, 'rav');
    assert.equal(byName.length, 1);
    assert.equal(byName[0].phone, '9000000101');

    const byPhone = filterCustomers(state.customers, '0106');
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0].name, 'Fatima Begum');

    const all = filterCustomers(state.customers, '   ');
    assert.equal(all.length, 8);

    const none = filterCustomers(state.customers, 'zzzz');
    assert.equal(none.length, 0);
  });
});

describe('Bonus 2: Edit and delete entries', () => {
  it('updates an entry and recalculates customer balance and total outstanding', () => {
    const { state: initial } = importLedger(sampleDataRaw);
    const raviEntries = getCustomerEntries(initial.entries, '9000000101');
    const latestPayment = raviEntries[0]; // 2026-10-25 payment 1500
    assert.ok(latestPayment.id);

    const edited = updateEntry(initial, latestPayment.id, {
      amount: 1000,
      note: 'corrected UPI',
    });
    assert.equal(edited.ok, true);
    // Payment reduced by 500 -> balance increases from 670 to 1170; total 11820 -> 12320
    assert.equal(getCustomerBalance(edited.state.entries, '9000000101'), 1170);
    assert.equal(getTotalOutstanding(edited.state.customers, edited.state.entries), 12320);

    const invalid = updateEntry(edited.state, latestPayment.id, { amount: 0 });
    assert.equal(invalid.ok, false);
  });

  it('deletes an entry and recalculates customer balance and total outstanding', () => {
    const { state: initial } = importLedger(sampleDataRaw);
    const raviEntries = getCustomerEntries(initial.entries, '9000000101');
    const oct23Credit = raviEntries[1]; // 2026-10-23 credit 180

    const deleted = deleteEntry(initial, oct23Credit.id);
    assert.equal(deleted.ok, true);
    assert.equal(getCustomerEntries(deleted.state.entries, '9000000101').length, 5);
    assert.equal(getCustomerBalance(deleted.state.entries, '9000000101'), 490);
    assert.equal(getTotalOutstanding(deleted.state.customers, deleted.state.entries), 11640);

    const missing = deleteEntry(deleted.state, 'nonexistent');
    assert.equal(missing.ok, false);
  });
});

describe('Bonus 3: CSV export', () => {
  it('exports header plus all 38 sample entries matching the data', () => {
    const { state } = importLedger(sampleDataRaw);
    const csv = exportLedgerCsv(state.customers, state.entries);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'customer_name,phone,date,type,amount,note');
    assert.equal(lines.length, 39);
    assert.equal(lines[1], 'Ravi Kumar,9000000101,2026-09-27,credit,250,groceries');
  });

  it('escapes commas and double quotes properly in CSV cells', () => {
    let state = createEmptyState('Shop');
    state = addCustomer(state, { name: 'Rao, Jr.', phone: '9000000199' }).state;
    state = addEntry(state, {
      phone: '9000000199',
      type: 'credit',
      amount: 300,
      date: '2026-11-15',
      note: 'rice, "sona masoori"',
    }).state;
    const csv = exportLedgerCsv(state.customers, state.entries);
    const lines = csv.split('\n');
    assert.equal(lines[1], '"Rao, Jr.",9000000199,2026-11-15,credit,300,"rice, ""sona masoori"""');
  });
});

describe('Bonus 4: Overdue list', () => {
  it('sorts overdue customers by days since last payment using today date (?today=)', () => {
    const { state } = importLedger(sampleDataRaw);

    const asOfNov15 = getOverdueCustomers(state.customers, state.entries, '2026-11-15');
    assert.equal(asOfNov15.length, 8);
    // Prakash Rao last paid 2026-09-15 -> 61 days
    assert.equal(asOfNov15[0].customer.phone, '9000000105');
    assert.equal(asOfNov15[0].daysSinceLastPayment, 61);
    // Anjali Reddy last paid 2026-10-02 -> 44 days
    assert.equal(asOfNov15[1].customer.phone, '9000000104');
    assert.equal(asOfNov15[1].daysSinceLastPayment, 44);
    // Ravi Kumar last paid 2026-10-25 -> 21 days (last)
    assert.equal(asOfNov15[7].customer.phone, '9000000101');
    assert.equal(asOfNov15[7].daysSinceLastPayment, 21);

    const asOfNov20 = getOverdueCustomers(state.customers, state.entries, '2026-11-20');
    assert.equal(asOfNov20[0].daysSinceLastPayment, 66);
    assert.equal(asOfNov20[7].daysSinceLastPayment, 26);
  });

  it('excludes customers with zero balance and handles never-paid customers', () => {
    let state = createEmptyState('Shop');
    state = addCustomer(state, { name: 'Clear Customer', phone: '9000000201' }).state;
    state = addCustomer(state, { name: 'Never Paid', phone: '9000000202' }).state;
    state = addEntry(state, {
      phone: '9000000202',
      type: 'credit',
      amount: 400,
      date: '2026-11-05',
      note: 'goods',
    }).state;

    const list = getOverdueCustomers(state.customers, state.entries, '2026-11-15');
    assert.equal(list.length, 1);
    assert.equal(list[0].customer.phone, '9000000202');
    assert.equal(list[0].neverPaid, true);
    assert.equal(list[0].daysSinceLastPayment, 10);
  });
});

describe('Bonus 5: UPI payment link in reminders', () => {
  it('validates UPI IDs and builds upi://pay links for positive amounts', () => {
    assert.equal(validateUpiId('lakshmistore@upi').ok, true);
    assert.equal(validateUpiId('').ok, true);
    assert.equal(validateUpiId('invalid upi').ok, false);
    assert.equal(validateUpiId('no-at-sign').ok, false);

    const upi = buildUpiPayUrl({
      upiId: 'lakshmistore@upi',
      shop: 'Lakshmi Store',
      amount: 670,
    });
    assert.ok(upi.startsWith('upi://pay?pa=lakshmistore%40upi'));
    assert.match(upi, /&am=670&cu=INR$/);

    assert.equal(buildUpiPayUrl({ upiId: 'lakshmistore@upi', shop: 'Lakshmi Store', amount: 0 }), '');
    assert.equal(buildUpiPayUrl({ upiId: '', shop: 'Lakshmi Store', amount: 670 }), '');
  });

  it('includes upi://pay link inside WhatsApp reminder text when UPI ID is set and balance > 0', () => {
    const waUrl = buildWhatsAppUrl({
      phone: '9000000101',
      shop: 'Lakshmi Store',
      customerName: 'Ravi Kumar',
      balance: 670,
      upiId: 'lakshmistore@upi',
    });
    const decoded = decodeURIComponent(waUrl.split('?text=')[1]);
    assert.match(decoded, /upi:\/\/pay\?pa=lakshmistore%40upi/);
    assert.match(decoded, /&am=670/);

    const zeroMsg = buildReminderMessage({
      shop: 'Lakshmi Store',
      customerName: 'Ravi Kumar',
      balance: 0,
      upiId: 'lakshmistore@upi',
    });
    assert.equal(zeroMsg.includes('upi://pay'), false);
  });

  it('preserves upiId across state serialization and deserialization', () => {
    const state = { ...createEmptyState('Shop'), upiId: 'lakshmistore@upi' };
    const { state: reloaded, corrupt } = deserializeState(JSON.stringify(state));
    assert.equal(corrupt, false);
    assert.equal(reloaded.upiId, 'lakshmistore@upi');
  });
});

describe('Bonus 6: Hindi and Telugu labels (English default)', () => {
  it('provides complete non-empty label sets for en, hi, and te and defaults to en', () => {
    const enKeys = Object.keys(LABELS.en).sort();
    assert.deepEqual(Object.keys(LABELS.hi).sort(), enKeys);
    assert.deepEqual(Object.keys(LABELS.te).sort(), enKeys);

    for (const lang of ['en', 'hi', 'te']) {
      for (const key of enKeys) {
        assert.ok(typeof LABELS[lang][key] === 'string' && LABELS[lang][key].length > 0);
      }
    }

    assert.equal(getLabels().totalOutstanding, 'Total Outstanding');
    assert.equal(getLabels('unknown').totalOutstanding, 'Total Outstanding');
    assert.equal(getLabels('hi').totalOutstanding, 'कुल बकाया');
    assert.equal(getLabels('te').totalOutstanding, 'మొత్తం బాకీ');
  });

  it('persists selected language across serialization and defaults unknown to en', () => {
    const state = { ...createEmptyState('Shop'), lang: 'te' };
    const { state: reloaded } = deserializeState(JSON.stringify(state));
    assert.equal(reloaded.lang, 'te');

    const bad = deserializeState(JSON.stringify({ ...state, lang: 'fr' }));
    assert.equal(bad.state.lang, 'en');
  });
});

describe('Screenshot OCR amount extraction (extractAmount)', () => {
  it('reads UPI success screen with ₹, commas, and 12-digit UPI Ref', () => {
    assert.equal(
      extractAmount('Paid to Ravi Kumar ₹1,500 Payment successful UPI Ref 412345678901'),
      1500
    );
  });

  it('reads Rs. with decimals and rounds to whole rupees', () => {
    assert.equal(extractAmount('Rs. 670.00 sent'), 670);
    assert.equal(extractAmount('INR 2810'), 2810);
    assert.equal(extractAmount('Paid Rs 1,249.60'), 1250);
  });

  it('returns null when only phone number, date, time, and year are present', () => {
    assert.equal(extractAmount('Ravi Kumar 9000000101 on 25 Oct 2026 at 14:32'), null);
    assert.equal(extractAmount('Call +91 9000000101 · 2026-10-25 09:45 AM'), null);
  });

  it('reads amount while ignoring alphanumeric Transaction ID', () => {
    assert.equal(extractAmount('Amount ₹250 Transaction ID T2610251234567890'), 250);
  });

  it('returns null for empty or non-numeric text and respects 1..500000 range', () => {
    assert.equal(extractAmount(''), null);
    assert.equal(extractAmount('   '), null);
    assert.equal(extractAmount('Paid 500001'), null);
    assert.equal(extractAmount('Paid 0'), null);
  });

  it('prefers numbers near payment keywords and falls back to largest plausible number', () => {
    assert.equal(extractAmount('Store 12 · Payment successful 1,500 · Ref 998877665544'), 1500);
    assert.equal(extractAmount('Item 50\nSubtotal 420'), 420);
  });
});

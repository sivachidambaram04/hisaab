// Pure ledger logic for Hisaab. No DOM, no browser APIs, no external packages.
// Balances are always derived from entries and never stored.

export const STORAGE_KEY = 'hisaab.v1';

export function createEmptyState(shop = 'Hisaab') {
  const cleanShop = typeof shop === 'string' && shop.trim() ? shop.trim() : 'Hisaab';
  return {
    shop: cleanShop,
    upiId: '',
    lang: 'en',
    customers: [],
    entries: [],
  };
}

export function validatePhone(phone) {
  if (typeof phone !== 'string') {
    return { ok: false, error: 'Phone number must be exactly 10 digits.' };
  }
  const clean = phone.trim();
  if (!/^\d{10}$/.test(clean)) {
    return { ok: false, error: 'Phone number must be exactly 10 digits (numbers only).' };
  }
  return { ok: true, phone: clean };
}

export function validateAmount(amount) {
  let value;
  if (typeof amount === 'number') {
    if (!Number.isInteger(amount) || !Number.isSafeInteger(amount)) {
      return { ok: false, error: 'Amount must be a whole number of rupees.' };
    }
    value = amount;
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: 'Amount must be a positive whole number of rupees.' };
    }
    value = Number(trimmed);
    if (!Number.isSafeInteger(value)) {
      return { ok: false, error: 'Amount is too large.' };
    }
  } else {
    return { ok: false, error: 'Amount must be a positive whole number of rupees.' };
  }

  if (value <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  return { ok: true, amount: value };
}

export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [year, month, day] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function validateCustomer(input, existingCustomers = []) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Customer details are required.' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Customer name is required.' };
  }

  const phoneCheck = validatePhone(input.phone);
  if (!phoneCheck.ok) {
    return phoneCheck;
  }

  const duplicate = existingCustomers.some((c) => c.phone === phoneCheck.phone);
  if (duplicate) {
    return { ok: false, error: `A customer with phone ${phoneCheck.phone} already exists.` };
  }

  return {
    ok: true,
    customer: {
      name,
      phone: phoneCheck.phone,
    },
  };
}

export function addCustomer(state, input) {
  const check = validateCustomer(input, state.customers);
  if (!check.ok) {
    return check;
  }
  return {
    ok: true,
    customer: check.customer,
    state: {
      ...state,
      customers: [...state.customers, check.customer],
    },
  };
}

function generateEntryId(entries = []) {
  const used = new Set(entries.map((e) => e && e.id).filter(Boolean));
  let n = entries.length + 1;
  while (used.has(`e${n}`)) {
    n += 1;
  }
  return `e${n}`;
}

export function validateEntry(input, customers = [], fallbackId = '') {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Entry details are required.' };
  }

  const phoneCheck = validatePhone(input.phone);
  if (!phoneCheck.ok) {
    return phoneCheck;
  }

  const customerExists = customers.some((c) => c.phone === phoneCheck.phone);
  if (!customerExists) {
    return { ok: false, error: `No customer found for phone ${phoneCheck.phone}.` };
  }

  const type = typeof input.type === 'string' ? input.type.trim() : '';
  if (type !== 'credit' && type !== 'payment') {
    return { ok: false, error: 'Entry type must be credit or payment.' };
  }

  const amountCheck = validateAmount(input.amount);
  if (!amountCheck.ok) {
    return amountCheck;
  }

  const date = typeof input.date === 'string' ? input.date.trim() : '';
  if (!isValidDateString(date)) {
    return { ok: false, error: 'Date must be a valid YYYY-MM-DD date.' };
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : fallbackId || '';

  const entry = {
    ...(id ? { id } : {}),
    phone: phoneCheck.phone,
    type,
    amount: amountCheck.amount,
    date,
    note,
  };

  if (type === 'payment' && typeof input.shot === 'string' && input.shot.trim()) {
    entry.shot = input.shot.trim();
  }

  return { ok: true, entry };
}

export function addEntry(state, input) {
  const fallbackId = generateEntryId(state.entries);
  const check = validateEntry(input, state.customers, fallbackId);
  if (!check.ok) {
    return check;
  }
  return {
    ok: true,
    entry: check.entry,
    state: {
      ...state,
      entries: [...state.entries, check.entry],
    },
  };
}

export function updateEntry(state, entryId, patch) {
  const index = state.entries.findIndex((e) => e.id === entryId);
  if (index === -1) {
    return { ok: false, error: 'Entry not found.' };
  }
  const existing = state.entries[index];
  const merged = {
    ...existing,
    ...patch,
    id: existing.id,
    phone: existing.phone,
  };
  const check = validateEntry(merged, state.customers, existing.id);
  if (!check.ok) {
    return check;
  }
  const nextEntries = state.entries.slice();
  nextEntries[index] = check.entry;
  return {
    ok: true,
    entry: check.entry,
    state: {
      ...state,
      entries: nextEntries,
    },
  };
}

export function deleteEntry(state, entryId) {
  const index = state.entries.findIndex((e) => e.id === entryId);
  if (index === -1) {
    return { ok: false, error: 'Entry not found.' };
  }
  const nextEntries = state.entries.filter((e) => e.id !== entryId);
  return {
    ok: true,
    state: {
      ...state,
      entries: nextEntries,
    },
  };
}

export function getCustomerBalance(entries, phone) {
  let balance = 0;
  for (const entry of entries) {
    if (entry.phone !== phone) continue;
    if (entry.type === 'credit') {
      balance += entry.amount;
    } else if (entry.type === 'payment') {
      balance -= entry.amount;
    }
  }
  return balance;
}

export function getAllBalances(customers, entries) {
  const balances = {};
  for (const customer of customers) {
    balances[customer.phone] = 0;
  }
  for (const entry of entries) {
    if (!Object.hasOwn(balances, entry.phone)) continue;
    if (entry.type === 'credit') {
      balances[entry.phone] += entry.amount;
    } else if (entry.type === 'payment') {
      balances[entry.phone] -= entry.amount;
    }
  }
  return balances;
}

export function getTotalOutstanding(customers, entries) {
  const balances = getAllBalances(customers, entries);
  let total = 0;
  for (const phone of Object.keys(balances)) {
    total += balances[phone];
  }
  return total;
}

export function getCustomerEntries(entries, phone) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.phone === phone)
    .sort((a, b) => {
      if (a.entry.date !== b.entry.date) {
        return b.entry.date.localeCompare(a.entry.date);
      }
      return b.index - a.index;
    })
    .map(({ entry }) => entry);
}

function normalizeImportPhone(rawPhone) {
  let str;
  if (typeof rawPhone === 'number') {
    if (!Number.isFinite(rawPhone) || !Number.isInteger(rawPhone)) return '';
    str = String(rawPhone);
  } else if (typeof rawPhone === 'string') {
    str = rawPhone;
  } else {
    return '';
  }

  let cleaned = str.replace(/[\s\-()[\].]/g, '');
  if (cleaned.startsWith('+91') && /^\d{10}$/.test(cleaned.slice(3))) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12 && /^\d{12}$/.test(cleaned)) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11 && /^\d{11}$/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

function normalizeImportType(rawType) {
  return typeof rawType === 'string' ? rawType.trim().toLowerCase() : rawType;
}

function normalizeImportAmount(rawAmount) {
  if (typeof rawAmount === 'string') {
    const trimmed = rawAmount.trim();
    if (/^\d+\.0{1,2}$/.test(trimmed)) {
      return trimmed.split('.')[0];
    }
    return trimmed;
  }
  return rawAmount;
}

function normalizeImportDate(rawDate) {
  return typeof rawDate === 'string' ? rawDate.trim() : rawDate;
}

export function importLedger(rawInput) {
  let parsed = rawInput;
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return { ok: false, error: 'Paste JSON data before importing.' };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: 'Invalid JSON format. Could not parse input.' };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Import data must be a JSON object.' };
  }

  if (!Array.isArray(parsed.customers)) {
    return { ok: false, error: 'Import data must contain a "customers" array.' };
  }

  if (parsed.entries !== undefined && parsed.entries !== null && !Array.isArray(parsed.entries)) {
    return { ok: false, error: 'Import "entries" must be an array.' };
  }

  const shop =
    typeof parsed.shop === 'string' && parsed.shop.trim() ? parsed.shop.trim() : 'Hisaab';

  const customers = [];
  let skippedCustomers = 0;

  for (const rawCustomer of parsed.customers) {
    const normalizedCustomer =
      rawCustomer && typeof rawCustomer === 'object'
        ? { ...rawCustomer, phone: normalizeImportPhone(rawCustomer.phone) }
        : rawCustomer;
    const check = validateCustomer(normalizedCustomer, customers);
    if (check.ok) {
      customers.push(check.customer);
    } else {
      skippedCustomers += 1;
    }
  }

  const knownPhones = new Set(customers.map((c) => c.phone));
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries = [];
  let skippedUnknownPhone = 0;
  let skippedInvalidEntries = 0;

  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      skippedInvalidEntries += 1;
      continue;
    }

    const normalizedEntry = {
      ...rawEntry,
      phone: normalizeImportPhone(rawEntry.phone),
      type: normalizeImportType(rawEntry.type),
      amount: normalizeImportAmount(rawEntry.amount),
      date: normalizeImportDate(rawEntry.date),
    };

    const phoneCheck = validatePhone(normalizedEntry.phone);
    if (!phoneCheck.ok || !knownPhones.has(phoneCheck.phone)) {
      skippedUnknownPhone += 1;
      continue;
    }

    const entryCheck = validateEntry(normalizedEntry, customers, generateEntryId(entries));
    if (!entryCheck.ok) {
      skippedInvalidEntries += 1;
      continue;
    }

    entries.push(entryCheck.entry);
  }

  const upiId =
    typeof parsed.upiId === 'string' && validateUpiId(parsed.upiId).ok
      ? parsed.upiId.trim()
      : '';
  const lang =
    parsed.lang === 'hi' || parsed.lang === 'te' || parsed.lang === 'en'
      ? parsed.lang
      : 'en';

  return {
    ok: true,
    state: {
      shop,
      upiId,
      lang,
      customers,
      entries,
    },
    counts: {
      customersLoaded: customers.length,
      entriesLoaded: entries.length,
      skippedUnknownPhone,
      skippedInvalidEntries,
      skippedCustomers,
    },
  };
}

export function formatIndianNumber(amount) {
  const num = Math.trunc(Number(amount) || 0);
  const negative = num < 0;
  const digits = String(Math.abs(num));
  if (digits.length <= 3) {
    return negative ? `-${digits}` : digits;
  }
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const formatted = `${groupedRest},${lastThree}`;
  return negative ? `-${formatted}` : formatted;
}

export function formatRupees(amount) {
  const num = Math.trunc(Number(amount) || 0);
  if (num < 0) {
    return `-Rs ${formatIndianNumber(Math.abs(num))}`;
  }
  return `Rs ${formatIndianNumber(num)}`;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatDisplayDate(dateStr) {
  if (!isValidDateString(dateStr)) {
    return typeof dateStr === 'string' ? dateStr : '';
  }
  const [year, month, day] = dateStr.trim().split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

export function deserializeState(raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    return { state: createEmptyState(), corrupt: false };
  }
  const result = importLedger(raw);
  if (!result.ok) {
    return { state: createEmptyState(), corrupt: true };
  }
  return { state: result.state, corrupt: false };
}

export function validateUpiId(upiId) {
  if (typeof upiId !== 'string') {
    return { ok: false, error: 'Enter a valid UPI ID (e.g. shop@upi).' };
  }
  const clean = upiId.trim();
  if (!clean) {
    return { ok: true, upiId: '' };
  }
  if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(clean)) {
    return { ok: false, error: 'UPI ID must look like name@bank (no spaces).' };
  }
  return { ok: true, upiId: clean };
}

export function buildUpiPayUrl({ upiId, shop, amount }) {
  const check = validateUpiId(upiId || '');
  if (!check.ok || !check.upiId) return '';
  const intAmount = Math.trunc(Number(amount) || 0);
  if (intAmount <= 0) return '';
  const shopName = typeof shop === 'string' && shop.trim() ? shop.trim() : 'Hisaab';
  return `upi://pay?pa=${encodeURIComponent(check.upiId)}&pn=${encodeURIComponent(shopName)}&am=${intAmount}&cu=INR`;
}

export function buildReminderMessage({ shop, customerName, balance, upiId = '' }) {
  const shopName = typeof shop === 'string' && shop.trim() ? shop.trim() : 'Hisaab';
  const name = typeof customerName === 'string' && customerName.trim() ? customerName.trim() : 'Customer';
  const amount = Math.trunc(Number(balance) || 0);

  if (amount > 0) {
    const upiUrl = buildUpiPayUrl({ upiId, shop: shopName, amount });
    const payPart = upiUrl ? ` Pay via UPI: ${upiUrl}` : '';
    return `Namaste ${name}, reminder from ${shopName}: your pending balance is ${formatRupees(amount)}. Please pay at your convenience.${payPart} Thank you.`;
  }
  if (amount < 0) {
    return `Namaste ${name}, update from ${shopName}: your account is clear with an advance of ${formatRupees(Math.abs(amount))}. Thank you.`;
  }
  return `Namaste ${name}, update from ${shopName}: your account is clear (${formatRupees(0)} pending). Thank you.`;
}

export function buildWhatsAppUrl({ phone, shop, customerName, balance, upiId = '' }) {
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const message = buildReminderMessage({ shop, customerName, balance, upiId });
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function formatImportSummary(counts) {
  const parts = [
    `Loaded ${counts.customersLoaded} ${counts.customersLoaded === 1 ? 'customer' : 'customers'} and ${counts.entriesLoaded} ${counts.entriesLoaded === 1 ? 'entry' : 'entries'}.`,
  ];
  if (counts.skippedUnknownPhone > 0) {
    parts.push(
      `Skipped ${counts.skippedUnknownPhone} ${counts.skippedUnknownPhone === 1 ? 'entry' : 'entries'} for unknown phones.`
    );
  }
  if (counts.skippedInvalidEntries > 0) {
    parts.push(
      `Skipped ${counts.skippedInvalidEntries} invalid ${counts.skippedInvalidEntries === 1 ? 'entry' : 'entries'}.`
    );
  }
  if (counts.skippedCustomers > 0) {
    parts.push(
      `Skipped ${counts.skippedCustomers} invalid or duplicate ${counts.skippedCustomers === 1 ? 'customer' : 'customers'}.`
    );
  }
  return parts.join(' ');
}

export function resolveToday(search = '', fallbackNow = new Date()) {
  if (typeof search === 'string' && search.trim()) {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const param = params.get('today');
    if (param && isValidDateString(param)) {
      return param.trim();
    }
  }
  const dt = fallbackNow instanceof Date ? fallbackNow : new Date();
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function filterCustomers(customers, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...customers];
  return customers.filter(
    (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
  );
}

export function escapeCsvValue(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportLedgerCsv(customers, entries) {
  const nameByPhone = new Map(customers.map((c) => [c.phone, c.name]));
  const header = 'customer_name,phone,date,type,amount,note';
  const rows = [header];
  for (const entry of entries) {
    if (!nameByPhone.has(entry.phone)) continue;
    rows.push(
      [
        escapeCsvValue(nameByPhone.get(entry.phone)),
        escapeCsvValue(entry.phone),
        escapeCsvValue(entry.date),
        escapeCsvValue(entry.type),
        escapeCsvValue(entry.amount),
        escapeCsvValue(entry.note || ''),
      ].join(',')
    );
  }
  return rows.join('\n');
}

export function daysBetweenDates(fromDateStr, toDateStr) {
  if (!isValidDateString(fromDateStr) || !isValidDateString(toDateStr)) {
    return 0;
  }
  const [fy, fm, fd] = fromDateStr.trim().split('-').map(Number);
  const [ty, tm, td] = toDateStr.trim().split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function getOverdueCustomers(customers, entries, todayStr) {
  const balances = getAllBalances(customers, entries);
  const overdue = [];

  for (const customer of customers) {
    const balance = balances[customer.phone] ?? 0;
    if (balance <= 0) continue;

    let lastPaymentDate = null;
    let firstCreditDate = null;

    for (const entry of entries) {
      if (entry.phone !== customer.phone) continue;
      if (entry.type === 'payment') {
        if (!lastPaymentDate || entry.date > lastPaymentDate) {
          lastPaymentDate = entry.date;
        }
      } else if (entry.type === 'credit') {
        if (!firstCreditDate || entry.date < firstCreditDate) {
          firstCreditDate = entry.date;
        }
      }
    }

    const referenceDate = lastPaymentDate || firstCreditDate || todayStr;
    const rawDays = daysBetweenDates(referenceDate, todayStr);
    const daysSinceLastPayment = Math.max(0, rawDays);

    overdue.push({
      customer,
      balance,
      lastPaymentDate,
      neverPaid: !lastPaymentDate,
      daysSinceLastPayment,
    });
  }

  overdue.sort((a, b) => {
    if (b.daysSinceLastPayment !== a.daysSinceLastPayment) {
      return b.daysSinceLastPayment - a.daysSinceLastPayment;
    }
    if (b.balance !== a.balance) {
      return b.balance - a.balance;
    }
    return a.customer.name.localeCompare(b.customer.name);
  });

  return overdue;
}

export const LABELS = {
  en: {
    subtitle: 'Shop Ledger',
    totalOutstanding: 'Total Outstanding',
    addCustomerHeading: 'Add Customer',
    customerNameLabel: 'Customer name',
    customerPhoneLabel: 'Phone (10 digits)',
    addCustomerBtn: 'Add Customer',
    customersHeading: 'Customers',
    tabAll: 'All',
    tabOverdue: 'Overdue',
    searchPlaceholder: 'Search by name or phone...',
    emptyCustomers: 'No customers yet. Add your first customer above.',
    emptySearch: 'No customers match your search.',
    emptyOverdue: 'No overdue customers.',
    remind: 'Remind',
    importHeading: 'Import & Backup',
    importLabel: 'Paste shop JSON (replaces current data)',
    importBtn: 'Import JSON',
    exportCsvBtn: 'Export CSV',
    upiHeading: 'UPI Payment Link',
    upiLabel: 'Shop UPI ID (added to WhatsApp reminders)',
    upiSaveBtn: 'Save UPI ID',
    backBtn: '← Back',
    currentBalance: 'Current Balance',
    payViaUpi: 'Pay via UPI',
    addEntryHeading: 'Add Entry',
    creditOption: 'Credit (Gave goods)',
    paymentOption: 'Payment (Received)',
    amountLabel: 'Amount (Rs)',
    dateLabel: 'Date',
    noteLabel: 'Note (optional)',
    shotLabel: 'Payment screenshot (optional)',
    saveCreditBtn: 'Save Credit',
    savePaymentBtn: 'Save Payment',
    entriesHeading: 'Entries',
    emptyEntries: 'No entries yet. Add a credit or payment above.',
    creditBadge: 'Credit',
    paymentBadge: 'Payment',
    editBtn: 'Edit',
    deleteBtn: 'Delete',
    confirmDeleteBtn: 'Confirm delete',
    saveBtn: 'Save',
    cancelBtn: 'Cancel',
    typeLabel: 'Type',
    daysSincePayment: 'days since last payment',
    noPaymentYet: 'No payment yet',
  },
  hi: {
    subtitle: 'दुकान खाता',
    totalOutstanding: 'कुल बकाया',
    addCustomerHeading: 'ग्राहक जोड़ें',
    customerNameLabel: 'ग्राहक का नाम',
    customerPhoneLabel: 'फ़ोन (10 अंक)',
    addCustomerBtn: 'ग्राहक जोड़ें',
    customersHeading: 'ग्राहक',
    tabAll: 'सभी',
    tabOverdue: 'बकाया',
    searchPlaceholder: 'नाम या फ़ोन से खोजें...',
    emptyCustomers: 'अभी कोई ग्राहक नहीं है। ऊपर पहला ग्राहक जोड़ें।',
    emptySearch: 'आपकी खोज से कोई ग्राहक नहीं मिला।',
    emptyOverdue: 'कोई बकाया ग्राहक नहीं है।',
    remind: 'रिमाइंडर',
    importHeading: 'इम्पोर्ट और बैकअप',
    importLabel: 'दुकान का JSON पेस्ट करें (मौजूदा डेटा बदलेगा)',
    importBtn: 'JSON इम्पोर्ट करें',
    exportCsvBtn: 'CSV डाउनलोड',
    upiHeading: 'UPI भुगतान लिंक',
    upiLabel: 'दुकान की UPI ID (WhatsApp रिमाइंडर में जुड़ेगी)',
    upiSaveBtn: 'UPI ID सेव करें',
    backBtn: '← वापस',
    currentBalance: 'वर्तमान बकाया',
    payViaUpi: 'UPI से भुगतान',
    addEntryHeading: 'एंट्री जोड़ें',
    creditOption: 'उधार (सामान दिया)',
    paymentOption: 'भुगतान (पैसे मिले)',
    amountLabel: 'राशि (Rs)',
    dateLabel: 'तारीख',
    noteLabel: 'नोट (वैकल्पिक)',
    shotLabel: 'भुगतान स्क्रीनशॉट (वैकल्पिक)',
    saveCreditBtn: 'उधार सेव करें',
    savePaymentBtn: 'भुगतान सेव करें',
    entriesHeading: 'एंट्रीज़',
    emptyEntries: 'अभी कोई एंट्री नहीं है। ऊपर उधार या भुगतान जोड़ें।',
    creditBadge: 'उधार',
    paymentBadge: 'भुगतान',
    editBtn: 'बदलें',
    deleteBtn: 'हटाएँ',
    confirmDeleteBtn: 'हटाना पक्का करें',
    saveBtn: 'सेव करें',
    cancelBtn: 'रद्द करें',
    typeLabel: 'प्रकार',
    daysSincePayment: 'दिन से भुगतान नहीं',
    noPaymentYet: 'अभी तक भुगतान नहीं',
  },
  te: {
    subtitle: 'దుకాణం ఖాతా',
    totalOutstanding: 'మొత్తం బాకీ',
    addCustomerHeading: 'కస్టమర్‌ను జోడించండి',
    customerNameLabel: 'కస్టమర్ పేరు',
    customerPhoneLabel: 'ఫోన్ (10 అంకెలు)',
    addCustomerBtn: 'కస్టమర్ జోడించు',
    customersHeading: 'కస్టమర్లు',
    tabAll: 'అందరూ',
    tabOverdue: 'బాకీ ఉన్నవారు',
    searchPlaceholder: 'పేరు లేదా ఫోన్‌తో వెతకండి...',
    emptyCustomers: 'ఇంకా కస్టమర్లు లేరు. పైన మొదటి కస్టమర్‌ను జోడించండి.',
    emptySearch: 'మీ శోధనకు కస్టమర్లు దొరకలేదు.',
    emptyOverdue: 'బాకీ ఉన్న కస్టమర్లు లేరు.',
    remind: 'రిమైండర్',
    importHeading: 'ఇంపోర్ట్ & బ్యాకప్',
    importLabel: 'దుకాణం JSON పేస్ట్ చేయండి (ప్రస్తుత డేటా మారుతుంది)',
    importBtn: 'JSON ఇంపోర్ట్',
    exportCsvBtn: 'CSV ఎక్స్‌పోర్ట్',
    upiHeading: 'UPI చెల్లింపు లింక్',
    upiLabel: 'దుకాణం UPI ID (WhatsApp రిమైండర్‌లో చేరుతుంది)',
    upiSaveBtn: 'UPI ID సేవ్',
    backBtn: '← వెనుకకు',
    currentBalance: 'ప్రస్తుత బాకీ',
    payViaUpi: 'UPI ద్వారా చెల్లించండి',
    addEntryHeading: 'ఎంట్రీ జోడించండి',
    creditOption: 'అప్పు (సరుకు ఇచ్చాం)',
    paymentOption: 'చెల్లింపు (డబ్బు వచ్చింది)',
    amountLabel: 'మొత్తం (Rs)',
    dateLabel: 'తేదీ',
    noteLabel: 'నోట్ (ఐచ్ఛికం)',
    shotLabel: 'చెల్లింపు స్క్రీన్‌షాట్ (ఐచ్ఛికం)',
    saveCreditBtn: 'అప్పు సేవ్ చేయండి',
    savePaymentBtn: 'చెల్లింపు సేవ్ చేయండి',
    entriesHeading: 'ఎంట్రీలు',
    emptyEntries: 'ఇంకా ఎంట్రీలు లేవు. పైన అప్పు లేదా చెల్లింపు జోడించండి.',
    creditBadge: 'అప్పు',
    paymentBadge: 'చెల్లింపు',
    editBtn: 'మార్చు',
    deleteBtn: 'తొలగించు',
    confirmDeleteBtn: 'తొలగింపు నిర్ధారించు',
    saveBtn: 'సేవ్',
    cancelBtn: 'రద్దు',
    typeLabel: 'రకం',
    daysSincePayment: 'రోజులుగా చెల్లింపు లేదు',
    noPaymentYet: 'ఇంకా చెల్లింపు లేదు',
  },
};

export function getLabels(lang = 'en') {
  return LABELS[lang] || LABELS.en;
}

const OCR_MIN_AMOUNT = 1;
const OCR_MAX_AMOUNT = 500000;
const PAYMENT_KEYWORD_RE =
  /^(?:paid|sent|received|amount|payment|successful|debited|credited|total)$/i;
const CURRENCY_WORD_RE = /^(?:rs\.?|inr|₹)$/i;
const MONTH_WORD_RE =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i;
const AMPM_WORD_RE = /^(?:a\.?m\.?|p\.?m\.?)$/i;
const RUPEE_MISREAD_FIRST_RE = /^[237ZETF%=~]|^[^0-9]/;

function parsePlausibleRupees(rawNumber) {
  if (typeof rawNumber !== 'string') return null;
  const cleaned = rawNumber.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < OCR_MIN_AMOUNT || rounded > OCR_MAX_AMOUNT) return null;
  return rounded;
}

export function parseCroppedAmount(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/\s+/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!cleaned) return null;
  const match = cleaned.match(/(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return parsePlausibleRupees(match[1]);
}

export function cutLeadingSymbolAmount(tokenText) {
  if (typeof tokenText !== 'string') return null;
  const trimmed = tokenText.trim();
  if (trimmed.length < 2) return null;
  const stripped = trimmed.replace(/^(?:Rs\.?|INR|₹)\s*/i, '');
  const candidate = stripped !== trimmed ? stripped : trimmed.slice(1);
  return parseCroppedAmount(candidate);
}

function getWordHeight(word) {
  if (!word || !word.bbox) return 0;
  const h = Number(word.bbox.y1) - Number(word.bbox.y0);
  return Number.isFinite(h) && h > 0 ? h : 0;
}

function computeMedian(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanTokenEdges(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[(["']+/, '')
    .replace(/[),;:"'!?]+$/, '')
    .replace(/\.$/, '');
}

function isNearbySpatial(wordA, wordB, medianHeight) {
  if (!wordA?.bbox || !wordB?.bbox) return true;
  const ay = (wordA.bbox.y0 + wordA.bbox.y1) / 2;
  const by = (wordB.bbox.y0 + wordB.bbox.y1) / 2;
  const refH = medianHeight > 0 ? medianHeight : Math.max(getWordHeight(wordA), getWordHeight(wordB), 16);
  return Math.abs(ay - by) <= refH * 3.2;
}

function tokenizePlainText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ text: token, bbox: null, pass: 'text' }));
}

function extractNumericParts(token) {
  // Reject masked account numbers (e.g. XXXXXXX5546, ****9096)
  if (/[xX*]{2,}/.test(token)) return null;
  // Reject dates & times (25/10/2026, 2026-10-25, 14:32)
  if (/[:/]/.test(token) || /\d-\d/.test(token)) return null;

  let hasCurrencyPrefix = false;
  let body = token;

  // Explicit currency prefix: ₹, Rs, Rs., INR
  const curPrefix = body.match(/^(₹|Rs\.?|INR)(.+)$/i);
  if (curPrefix) {
    hasCurrencyPrefix = true;
    body = curPrefix[2].trim();
  }

  // Explicit currency suffix: 1500₹, 1500Rs, 1500INR
  let hasCurrencySuffix = false;
  const curSuffix = body.match(/^(.+?)(₹|Rs\.?|INR)$/i);
  if (curSuffix) {
    hasCurrencySuffix = true;
    body = curSuffix[1].trim();
  }

  // Reject alphanumeric IDs with 6+ digits attached to letters (e.g. T2610251234567890)
  if (/^[A-Za-z]+\d{6,}[A-Za-z0-9]*$/.test(token) || /^\d{6,}[A-Za-z]/.test(token)) {
    return null;
  }

  // Optional single misread rupee glyph right before a number (e.g. $69500.00, X69500.00, Z69500.00, %1,500)
  let hasLeadingMisreadChar = false;
  if (!hasCurrencyPrefix && /^[^0-9\s][0-9]/.test(body)) {
    const firstChar = body[0];
    const rest = body.slice(1);
    const isKnownGlyph = /[ZETF%=~$¥€£¢₹]/.test(firstChar);
    const restHasMoneyShape = /[,.]/.test(rest);
    if (isKnownGlyph || restHasMoneyShape) {
      hasLeadingMisreadChar = true;
      body = rest;
    }
  }

  // Body must now be a clean number (optional commas, optional 1-2 decimals)
  if (!/^\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(body)) {
    return null;
  }

  const intPart = body.split('.')[0].replace(/,/g, '');
  // Reject 10-digit phone numbers and 11+ digit reference IDs
  if (intPart.length >= 10) return null;

  const hasTwoDecimals = /\.\d{2}$/.test(body);
  const hasCommas = body.includes(',');
  const amount = parsePlausibleRupees(body);
  if (amount === null) return null;

  return {
    amount,
    intDigits: intPart.length,
    hasCurrency: hasCurrencyPrefix || hasCurrencySuffix,
    hasLeadingMisreadChar,
    hasTwoDecimals,
    hasCommas,
  };
}

export function pickAmount(input) {
  let words;
  if (typeof input === 'string') {
    if (!input.trim()) return null;
    words = tokenizePlainText(input);
  } else if (Array.isArray(input)) {
    words = input.filter((w) => w && typeof w.text === 'string' && w.text.trim());
  } else {
    return null;
  }

  if (words.length === 0) return null;

  // Group words by OCR pass so heights are normalised cleanly within each pass
  const passes = new Map();
  for (const word of words) {
    const key = word.pass || 'default';
    if (!passes.has(key)) passes.set(key, []);
    passes.get(key).push(word);
  }

  let bestCandidate = null;

  for (const passWords of passes.values()) {
    const heights = passWords.map(getWordHeight).filter((h) => h > 0);
    const medianHeight = computeMedian(heights);
    const maxHeight = heights.length ? Math.max(...heights) : 0;

    for (let i = 0; i < passWords.length; i += 1) {
      const word = passWords[i];
      const token = cleanTokenEdges(word.text);
      if (!token) continue;

      const parsed = extractNumericParts(token);
      if (!parsed) continue;

      const prev1 = i > 0 ? cleanTokenEdges(passWords[i - 1].text) : '';
      const prev2 = i > 1 ? cleanTokenEdges(passWords[i - 2].text) : '';
      const next1 = i + 1 < passWords.length ? cleanTokenEdges(passWords[i + 1].text) : '';
      const next2 = i + 2 < passWords.length ? cleanTokenEdges(passWords[i + 2].text) : '';

      // Reject phone prefix (+91 / 91) right before a 10-digit number
      if ((token === '91' || token === '+91') && /^\d{10}$/.test(next1)) {
        continue;
      }

      // Reject numbers that are part of a date or time (e.g. "25 Oct 2026", "10 AM")
      const isDatePart =
        (MONTH_WORD_RE.test(next1) && isNearbySpatial(word, passWords[i + 1], medianHeight)) ||
        (MONTH_WORD_RE.test(prev1) && isNearbySpatial(word, passWords[i - 1], medianHeight)) ||
        (MONTH_WORD_RE.test(prev2) && /^\d{1,2}$/.test(prev1) && isNearbySpatial(word, passWords[i - 2], medianHeight)) ||
        (AMPM_WORD_RE.test(next1) && isNearbySpatial(word, passWords[i + 1], medianHeight));
      if (isDatePart) continue;

      const height = getWordHeight(word);
      const heightRatio = medianHeight > 0 && height > 0 ? height / medianHeight : 1;
      const isHeadline = medianHeight > 0 && heightRatio >= 1.5;
      const isTallest = maxHeight > 0 && height >= maxHeight * 0.95 && isHeadline;

      const adjacentCurrency =
        parsed.hasCurrency ||
        (CURRENCY_WORD_RE.test(prev1) && isNearbySpatial(word, passWords[i - 1], medianHeight)) ||
        (CURRENCY_WORD_RE.test(next1) && isNearbySpatial(word, passWords[i + 1], medianHeight));

      // Reject bare standalone years (1900-2099) without currency, decimals, commas, or headline size
      if (
        !adjacentCurrency &&
        !parsed.hasTwoDecimals &&
        !parsed.hasCommas &&
        !isHeadline &&
        parsed.amount >= 1900 &&
        parsed.amount <= 2099
      ) {
        continue;
      }

      // Check for nearby payment keyword within 2 tokens (and spatially close when bboxes exist)
      let nearKeyword = false;
      for (let offset = -2; offset <= 2; offset += 1) {
        if (offset === 0) continue;
        const j = i + offset;
        if (j < 0 || j >= passWords.length) continue;
        const neighbor = passWords[j];
        if (
          PAYMENT_KEYWORD_RE.test(cleanTokenEdges(neighbor.text)) &&
          isNearbySpatial(word, neighbor, medianHeight)
        ) {
          nearKeyword = true;
          break;
        }
      }

      // Reject 1- or 2-digit tokens without currency symbol, nearby keyword, or tallest headline status
      if (parsed.intDigits <= 2 && !adjacentCurrency && !nearKeyword && !isTallest) {
        continue;
      }

      let score = 0;
      if (isHeadline) {
        score += 60;
        if (heightRatio >= 2.0) score += 10;
      }
      if (parsed.hasTwoDecimals) score += 25;
      if (adjacentCurrency) score += 35;
      if (nearKeyword) score += 25;
      if (parsed.hasCommas) score += 10;

      // Require a strong enough signal; never guess from a bare uncontextualised number
      if (score < 25) continue;

      const needsFirstSymbolCut =
        isHeadline && token.length >= 5 && RUPEE_MISREAD_FIRST_RE.test(token);

      const candidate = {
        amount: parsed.amount,
        text: token,
        word,
        score,
        heightRatio,
        isHeadline,
        needsFirstSymbolCut,
      };

      if (
        !bestCandidate ||
        candidate.score > bestCandidate.score ||
        (candidate.score === bestCandidate.score && candidate.heightRatio > bestCandidate.heightRatio) ||
        (candidate.score === bestCandidate.score &&
          candidate.heightRatio === bestCandidate.heightRatio &&
          candidate.amount > bestCandidate.amount)
      ) {
        bestCandidate = candidate;
      }
    }
  }

  return bestCandidate;
}










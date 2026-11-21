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
    const check = validateCustomer(rawCustomer, customers);
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

    const phoneCheck = validatePhone(rawEntry.phone);
    if (!phoneCheck.ok || !knownPhones.has(phoneCheck.phone)) {
      skippedUnknownPhone += 1;
      continue;
    }

    const entryCheck = validateEntry(rawEntry, customers, generateEntryId(entries));
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








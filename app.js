import {
  STORAGE_KEY,
  createEmptyState,
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
  buildWhatsAppUrl,
  formatImportSummary,
  resolveToday,
  filterCustomers,
  exportLedgerCsv,
  getOverdueCustomers,
  validateUpiId,
  buildUpiPayUrl,
  getLabels,
  pickAmount,
  parseCroppedAmount,
} from './logic.js?v=4';

const MAX_SHOT_WIDTH = 480;
const SHOT_JPEG_QUALITY = 0.72;
const OCR_TARGET_WIDTH = 1200;
const OCR_CONTRAST_FACTOR = 1.6;
const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const el = {
  langSelect: document.getElementById('lang-select'),
  storageAlert: document.getElementById('storage-alert'),
  homeView: document.getElementById('home-view'),
  customerView: document.getElementById('customer-view'),
  shopTitle: document.getElementById('shop-title'),
  totalOutstanding: document.getElementById('total-outstanding'),

  addCustomerForm: document.getElementById('add-customer-form'),
  customerNameInput: document.getElementById('customer-name'),
  customerPhoneInput: document.getElementById('customer-phone'),
  customerError: document.getElementById('customer-error'),
  tabAll: document.getElementById('tab-all'),
  tabOverdue: document.getElementById('tab-overdue'),
  customerSearch: document.getElementById('customer-search'),
  customerCount: document.getElementById('customer-count'),
  customersEmpty: document.getElementById('customers-empty'),
  customerList: document.getElementById('customer-list'),

  importBox: document.getElementById('import-box'),
  importGo: document.getElementById('import-go'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  importError: document.getElementById('import-error'),
  importStatus: document.getElementById('import-status'),

  upiForm: document.getElementById('upi-form'),
  upiIdInput: document.getElementById('upi-id-input'),
  upiError: document.getElementById('upi-error'),
  upiStatus: document.getElementById('upi-status'),

  backBtn: document.getElementById('back-btn'),
  detailName: document.getElementById('detail-name'),
  detailPhone: document.getElementById('detail-phone'),
  detailBalance: document.getElementById('detail-balance'),
  detailUpiLink: document.getElementById('detail-upi-link'),

  addEntryForm: document.getElementById('add-entry-form'),
  entryAmountInput: document.getElementById('entry-amount'),
  entryDateInput: document.getElementById('entry-date'),
  entryNoteInput: document.getElementById('entry-note'),
  shotField: document.getElementById('shot-field'),
  shotInput: document.getElementById('shot-input'),
  shotOcrStatus: document.getElementById('shot-ocr-status'),
  entryError: document.getElementById('entry-error'),
  entryStatus: document.getElementById('entry-status'),
  entrySubmitBtn: document.getElementById('entry-submit-btn'),
  entryCount: document.getElementById('entry-count'),
  entriesEmpty: document.getElementById('entries-empty'),
  entryList: document.getElementById('entry-list'),
};

let state = createEmptyState();
let selectedPhone = null;
let editingEntryId = null;
let confirmingDeleteId = null;
let activeTab = 'all';
let ocrRunId = 0;
let tesseractLoadPromise = null;

function getTodayString() {
  return resolveToday(window.location.search);
}

function labels() {
  return getLabels(state.lang || 'en');
}

function applyStaticLabels() {
  const t = labels();
  document.documentElement.lang = state.lang || 'en';
  el.langSelect.value = state.lang || 'en';
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.getAttribute('data-i18n');
    if (key && Object.hasOwn(t, key)) {
      node.textContent = t[key];
    }
  }
  el.customerSearch.placeholder = t.searchPlaceholder;
  syncEntryTypeControls();
}

function showStorageAlert(message) {
  if (!message) {
    el.storageAlert.textContent = '';
    el.storageAlert.hidden = true;
    return;
  }
  el.storageAlert.textContent = message;
  el.storageAlert.hidden = false;
}

function showMessage(node, message) {
  if (!message) {
    node.textContent = '';
    node.hidden = true;
    return;
  }
  node.textContent = message;
  node.hidden = false;
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const { state: loaded, corrupt } = deserializeState(raw);
    if (corrupt) {
      showStorageAlert(
        'Saved data was unreadable and could not be loaded. Started with an empty ledger.'
      );
    }
    return loaded;
  } catch {
    showStorageAlert('Browser storage is unavailable. Changes will not survive a reload.');
    return createEmptyState();
  }
}

function trySaveState(nextState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return 'ok';
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
      return 'quota';
    }
    return 'unavailable';
  }
}

function saveState(nextState) {
  const status = trySaveState(nextState);
  if (status === 'quota') {
    showStorageAlert('Browser storage is full. Could not save changes.');
  } else if (status === 'unavailable') {
    showStorageAlert('Browser storage is unavailable. Changes will not survive a reload.');
  }
  return status === 'ok';
}

function compressScreenshot(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        if (!origW || !origH) {
          reject(new Error('Selected image has invalid dimensions.'));
          return;
        }
        const scale = origW > MAX_SHOT_WIDTH ? MAX_SHOT_WIDTH / origW : 1;
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process screenshot image.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        try {
          resolve(canvas.toDataURL('image/jpeg', SHOT_JPEG_QUALITY));
        } catch {
          reject(new Error('Could not compress screenshot image.'));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function loadTesseract() {
  if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
    return Promise.resolve(window.Tesseract);
  }
  if (tesseractLoadPromise) {
    return tesseractLoadPromise;
  }
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN_URL;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
        resolve(window.Tesseract);
      } else {
        tesseractLoadPromise = null;
        reject(new Error('Tesseract.js failed to initialize.'));
      }
    };
    script.onerror = () => {
      tesseractLoadPromise = null;
      script.remove();
      reject(new Error('Could not load Tesseract.js from CDN.'));
    };
    document.head.append(script);
  });
  return tesseractLoadPromise;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file for OCR.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image for OCR.'));
      img.onload = () => {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        if (!origW || !origH) {
          reject(new Error('Image has invalid dimensions.'));
          return;
        }
        resolve(img);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function drawOriginalCanvas(img) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = origW;
  canvas.height = origH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare original OCR canvas.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, origW, origH);
  ctx.drawImage(img, 0, 0, origW, origH);
  return canvas;
}

function applyGrayscaleContrast(ctx, width, height, contrastFactor = OCR_CONTRAST_FACTOR) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrasted = Math.max(
      0,
      Math.min(255, Math.round((gray - 128) * contrastFactor + 128))
    );
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawEnhancedOcrCanvas(img) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const scale = OCR_TARGET_WIDTH / origW;
  const targetW = Math.max(1, Math.round(origW * scale));
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare enhanced OCR canvas.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  applyGrayscaleContrast(ctx, targetW, targetH);
  return canvas;
}

function buildCroppedDigitsCanvas(srcCanvas, word, tokenText) {
  const bbox = word && word.bbox;
  if (!bbox) return null;

  let cutX = null;
  if (Array.isArray(word.symbols) && word.symbols.length >= 2 && word.symbols[0]?.bbox) {
    const symX1 = Number(word.symbols[0].bbox.x1);
    if (Number.isFinite(symX1) && symX1 > bbox.x0 && symX1 < bbox.x1) {
      cutX = symX1;
    }
  }
  if (cutX === null) {
    const charCount = Math.max(2, String(tokenText || word.text || '').length);
    cutX = bbox.x0 + (bbox.x1 - bbox.x0) / charCount;
  }

  const wordH = Math.max(1, bbox.y1 - bbox.y0);
  const padX = Math.max(2, Math.round(wordH * 0.15));
  const padY = Math.max(2, Math.round(wordH * 0.2));

  const sx = Math.max(0, Math.floor(cutX));
  const sy = Math.max(0, Math.floor(bbox.y0 - padY));
  const sx1 = Math.min(srcCanvas.width, Math.ceil(bbox.x1 + padX));
  const sy1 = Math.min(srcCanvas.height, Math.ceil(bbox.y1 + padY));
  const sw = sx1 - sx;
  const sh = sy1 - sy;
  if (sw < 4 || sh < 4) return null;

  const scale = 3;
  const margin = 16;
  const cw = sw * scale + margin * 2;
  const ch = sh * scale + margin * 2;

  const crop = document.createElement('canvas');
  crop.width = cw;
  crop.height = ch;
  const ctx = crop.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, margin, margin, sw * scale, sh * scale);
  applyGrayscaleContrast(ctx, cw, ch);
  return crop;
}

function extractWordsFromResult(result, passName) {
  const data = result && result.data;
  if (!data) return [];

  let rawWords = [];
  if (Array.isArray(data.words) && data.words.length > 0) {
    rawWords = data.words;
  } else if (Array.isArray(data.blocks)) {
    for (const block of data.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const w of line.words || []) {
            rawWords.push(w);
          }
        }
      }
    }
  }

  return rawWords
    .filter((w) => w && typeof w.text === 'string' && w.text.trim())
    .map((w) => ({
      text: w.text,
      bbox: w.bbox || null,
      symbols: Array.isArray(w.symbols) ? w.symbols : [],
      pass: passName,
    }));
}

function resetShotOcr() {
  ocrRunId += 1;
  showMessage(el.shotOcrStatus, '');
}

async function readAmountFromScreenshot(file) {
  if (getSelectedEntryType() !== 'payment' || !file) {
    resetShotOcr();
    return;
  }

  ocrRunId += 1;
  const runId = ocrRunId;
  showMessage(el.shotOcrStatus, 'Reading amount from screenshot...');

  let worker = null;
  try {
    const [Tesseract, img] = await Promise.all([loadTesseract(), loadImageFromFile(file)]);
    if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
      return;
    }

    const origCanvas = drawOriginalCanvas(img);
    const enhancedCanvas = drawEnhancedOcrCanvas(img);

    worker = await Tesseract.createWorker('eng');
    if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
      return;
    }

    await worker.setParameters({ tessedit_pageseg_mode: '11' });

    const pass1 = await worker.recognize(origCanvas, {}, { blocks: true });
    if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
      return;
    }

    const pass2 = await worker.recognize(enhancedCanvas, {}, { blocks: true });
    if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
      return;
    }

    const mergedWords = [
      ...extractWordsFromResult(pass1, 'orig'),
      ...extractWordsFromResult(pass2, 'enhanced'),
    ];

    let picked = mergedWords.length > 0 ? pickAmount(mergedWords) : null;
    if (!picked) {
      const combinedText = `${pass1?.data?.text || ''}\n${pass2?.data?.text || ''}`;
      picked = pickAmount(combinedText);
    }

    let finalAmount = picked ? picked.amount : null;

    if (picked && picked.needsFirstSymbolCut && picked.word && picked.word.bbox) {
      const srcCanvas = picked.word.pass === 'enhanced' ? enhancedCanvas : origCanvas;
      const cropCanvas = buildCroppedDigitsCanvas(srcCanvas, picked.word, picked.text);
      if (cropCanvas) {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: '0123456789.,',
          });
          const cropRes = await worker.recognize(cropCanvas);
          if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
            return;
          }
          const croppedAmount = parseCroppedAmount(cropRes?.data?.text || '');
          if (croppedAmount !== null) {
            finalAmount = croppedAmount;
          }
        } catch {
          // Keep original picked.amount if the cropped re-read fails.
        }
      }
    }

    if (runId !== ocrRunId || getSelectedEntryType() !== 'payment' || !selectedPhone) {
      return;
    }

    if (finalAmount !== null) {
      showMessage(el.shotOcrStatus, `Read amount: ${formatRupees(finalAmount)}. Please check it.`);
      if (!el.entryAmountInput.value.trim()) {
        el.entryAmountInput.value = String(finalAmount);
      }
    } else {
      showMessage(el.shotOcrStatus, 'Could not read an amount. Enter it yourself.');
    }
  } catch {
    if (runId === ocrRunId && getSelectedEntryType() === 'payment' && selectedPhone) {
      showMessage(el.shotOcrStatus, 'Could not read an amount. Enter it yourself.');
    }
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

function getSelectedEntryType() {
  const checked = el.addEntryForm.querySelector('input[name="type"]:checked');
  return checked ? checked.value : 'credit';
}

function syncEntryTypeControls() {
  const t = labels();
  const type = getSelectedEntryType();
  const isPayment = type === 'payment';
  el.entrySubmitBtn.textContent = isPayment ? t.savePaymentBtn : t.saveCreditBtn;
  el.shotField.hidden = !isPayment;
  if (!isPayment) {
    el.shotInput.value = '';
    resetShotOcr();
  }
}

function openCustomer(phone) {
  const exists = state.customers.some((c) => c.phone === phone);
  if (!exists) return;
  selectedPhone = phone;
  editingEntryId = null;
  confirmingDeleteId = null;
  showMessage(el.entryError, '');
  showMessage(el.entryStatus, '');
  el.entryDateInput.value = getTodayString();
  el.entryAmountInput.value = '';
  el.entryNoteInput.value = '';
  el.shotInput.value = '';
  resetShotOcr();
  syncEntryTypeControls();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function closeCustomer() {
  selectedPhone = null;
  editingEntryId = null;
  confirmingDeleteId = null;
  resetShotOcr();
  showMessage(el.customerError, '');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderHome() {
  const t = labels();
  el.shopTitle.textContent = state.shop || 'Hisaab';
  const total = getTotalOutstanding(state.customers, state.entries);
  el.totalOutstanding.textContent = formatRupees(total);

  const isOverdueTab = activeTab === 'overdue';
  el.tabAll.classList.toggle('is-active', !isOverdueTab);
  el.tabAll.setAttribute('aria-selected', String(!isOverdueTab));
  el.tabOverdue.classList.toggle('is-active', isOverdueTab);
  el.tabOverdue.setAttribute('aria-selected', String(isOverdueTab));

  const balances = getAllBalances(state.customers, state.entries);
  const query = el.customerSearch.value;
  let rowsToRender;

  if (isOverdueTab) {
    const overdue = getOverdueCustomers(state.customers, state.entries, getTodayString());
    const allowedPhones = new Set(filterCustomers(state.customers, query).map((c) => c.phone));
    rowsToRender = overdue
      .filter((item) => allowedPhones.has(item.customer.phone))
      .map((item) => ({
        customer: item.customer,
        balance: item.balance,
        overdueItem: item,
      }));
  } else {
    rowsToRender = filterCustomers(state.customers, query).map((customer) => ({
      customer,
      balance: balances[customer.phone] ?? 0,
      overdueItem: null,
    }));
  }

  el.customerCount.textContent = String(rowsToRender.length);
  el.customersEmpty.hidden = rowsToRender.length > 0;
  if (rowsToRender.length === 0) {
    if (query.trim() && state.customers.length > 0) {
      el.customersEmpty.textContent = t.emptySearch;
    } else if (isOverdueTab) {
      el.customersEmpty.textContent = t.emptyOverdue;
    } else {
      el.customersEmpty.textContent = t.emptyCustomers;
    }
  }

  el.customerList.replaceChildren();

  for (const { customer, balance, overdueItem } of rowsToRender) {
    const li = document.createElement('li');
    li.className = 'customer-row';
    li.setAttribute('data-customer', customer.phone);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'customer-row-btn';
    btn.addEventListener('click', () => openCustomer(customer.phone));

    const meta = document.createElement('span');
    meta.className = 'customer-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'customer-name';
    nameEl.textContent = customer.name;

    const phoneEl = document.createElement('span');
    phoneEl.className = 'customer-phone';
    phoneEl.textContent = customer.phone;

    meta.append(nameEl, phoneEl);

    if (overdueItem) {
      const overdueEl = document.createElement('span');
      overdueEl.className = 'customer-overdue';
      overdueEl.setAttribute('data-overdue-days', String(overdueItem.daysSinceLastPayment));
      overdueEl.textContent = overdueItem.neverPaid
        ? `${t.noPaymentYet} · ${overdueItem.daysSinceLastPayment} ${t.daysSincePayment}`
        : `${overdueItem.daysSinceLastPayment} ${t.daysSincePayment}`;
      meta.append(overdueEl);
    }

    const balEl = document.createElement('span');
    balEl.className = `customer-balance ${balance > 0 ? 'balance-due' : 'balance-clear'}`;
    balEl.setAttribute('data-balance', '');
    balEl.textContent = formatRupees(balance);

    btn.append(meta, balEl);

    const remindLink = document.createElement('a');
    remindLink.className = 'remind-btn';
    remindLink.setAttribute('data-remind', customer.phone);
    remindLink.href = buildWhatsAppUrl({
      phone: customer.phone,
      shop: state.shop,
      customerName: customer.name,
      balance,
      upiId: state.upiId,
    });
    remindLink.target = '_blank';
    remindLink.rel = 'noopener noreferrer';
    remindLink.textContent = t.remind;
    remindLink.setAttribute('aria-label', `Send WhatsApp reminder to ${customer.name}`);

    li.append(btn, remindLink);
    el.customerList.append(li);
  }
}

function buildEntryEditForm(entry) {
  const t = labels();
  const form = document.createElement('form');
  form.className = 'entry-edit-form';
  form.noValidate = true;

  const typeField = document.createElement('div');
  typeField.className = 'field';
  const typeLabel = document.createElement('label');
  typeLabel.textContent = t.typeLabel;
  const typeSelect = document.createElement('select');
  typeSelect.name = 'type';
  const optCredit = document.createElement('option');
  optCredit.value = 'credit';
  optCredit.textContent = t.creditBadge;
  const optPayment = document.createElement('option');
  optPayment.value = 'payment';
  optPayment.textContent = t.paymentBadge;
  typeSelect.append(optCredit, optPayment);
  typeSelect.value = entry.type;
  typeField.append(typeLabel, typeSelect);

  const amtField = document.createElement('div');
  amtField.className = 'field';
  const amtLabel = document.createElement('label');
  amtLabel.textContent = t.amountLabel;
  const amtInput = document.createElement('input');
  amtInput.type = 'text';
  amtInput.inputMode = 'numeric';
  amtInput.name = 'amount';
  amtInput.value = String(entry.amount);
  amtField.append(amtLabel, amtInput);

  const dateField = document.createElement('div');
  dateField.className = 'field';
  const dateLabel = document.createElement('label');
  dateLabel.textContent = t.dateLabel;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.name = 'date';
  dateInput.value = entry.date;
  dateField.append(dateLabel, dateInput);

  const noteField = document.createElement('div');
  noteField.className = 'field';
  const noteLabel = document.createElement('label');
  noteLabel.textContent = t.noteLabel;
  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.name = 'note';
  noteInput.value = entry.note || '';
  noteField.append(noteLabel, noteInput);

  const errEl = document.createElement('p');
  errEl.className = 'form-error';
  errEl.setAttribute('role', 'alert');
  errEl.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = t.saveBtn;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost btn-sm';
  cancelBtn.textContent = t.cancelBtn;
  cancelBtn.addEventListener('click', () => {
    editingEntryId = null;
    renderCustomerDetail();
  });

  actions.append(saveBtn, cancelBtn);
  form.append(typeField, amtField, dateField, noteField, errEl, actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showMessage(errEl, '');
    const result = updateEntry(state, entry.id, {
      type: typeSelect.value,
      amount: amtInput.value,
      date: dateInput.value,
      note: noteInput.value,
    });
    if (!result.ok) {
      showMessage(errEl, result.error);
      return;
    }
    state = result.state;
    saveState(state);
    editingEntryId = null;
    render();
  });

  return form;
}

function renderCustomerDetail() {
  const t = labels();
  const customer = state.customers.find((c) => c.phone === selectedPhone);
  if (!customer) {
    selectedPhone = null;
    render();
    return;
  }

  const balance = getCustomerBalance(state.entries, customer.phone);
  el.detailName.textContent = customer.name;
  el.detailPhone.textContent = customer.phone;
  el.detailBalance.textContent = formatRupees(balance);

  const upiUrl = buildUpiPayUrl({ upiId: state.upiId, shop: state.shop, amount: balance });
  if (upiUrl) {
    el.detailUpiLink.href = upiUrl;
    el.detailUpiLink.hidden = false;
  } else {
    el.detailUpiLink.removeAttribute('href');
    el.detailUpiLink.hidden = true;
  }

  const entries = getCustomerEntries(state.entries, customer.phone);
  el.entryCount.textContent = String(entries.length);
  el.entriesEmpty.hidden = entries.length > 0;

  el.entryList.replaceChildren();

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.setAttribute('data-entry-id', entry.id || '');
    li.setAttribute('data-entry-type', entry.type);
    li.setAttribute('data-date', entry.date);

    if (editingEntryId && entry.id === editingEntryId) {
      li.append(buildEntryEditForm(entry));
      el.entryList.append(li);
      continue;
    }

    const top = document.createElement('div');
    top.className = 'entry-top';

    const badge = document.createElement('span');
    badge.className = `entry-badge entry-badge-${entry.type}`;
    badge.textContent = entry.type === 'credit' ? t.creditBadge : t.paymentBadge;

    const amt = document.createElement('span');
    amt.className = `entry-amount entry-amount-${entry.type}`;
    amt.textContent = formatRupees(entry.amount);

    top.append(badge, amt);

    const meta = document.createElement('div');
    meta.className = 'entry-meta';

    const note = document.createElement('span');
    note.className = 'entry-note';
    note.textContent = entry.note || '—';

    const date = document.createElement('span');
    date.className = 'entry-date';
    date.textContent = formatDisplayDate(entry.date);

    meta.append(note, date);
    li.append(top, meta);

    if (entry.shot) {
      const img = document.createElement('img');
      img.setAttribute('data-shot', '');
      img.src = entry.shot;
      img.alt = 'Payment screenshot';
      li.append(img);
    }

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    if (confirmingDeleteId && entry.id === confirmingDeleteId) {
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'btn btn-danger-solid btn-sm';
      confirmBtn.setAttribute('data-confirm-delete', entry.id);
      confirmBtn.textContent = t.confirmDeleteBtn;
      confirmBtn.addEventListener('click', () => {
        const res = deleteEntry(state, entry.id);
        if (res.ok) {
          state = res.state;
          saveState(state);
        }
        confirmingDeleteId = null;
        render();
      });

      const cancelDelBtn = document.createElement('button');
      cancelDelBtn.type = 'button';
      cancelDelBtn.className = 'btn btn-ghost btn-sm';
      cancelDelBtn.textContent = t.cancelBtn;
      cancelDelBtn.addEventListener('click', () => {
        confirmingDeleteId = null;
        renderCustomerDetail();
      });

      actions.append(confirmBtn, cancelDelBtn);
    } else {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.setAttribute('data-edit-entry', entry.id || '');
      editBtn.textContent = t.editBtn;
      editBtn.addEventListener('click', () => {
        confirmingDeleteId = null;
        editingEntryId = entry.id;
        renderCustomerDetail();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.setAttribute('data-delete-entry', entry.id || '');
      delBtn.textContent = t.deleteBtn;
      delBtn.addEventListener('click', () => {
        editingEntryId = null;
        confirmingDeleteId = entry.id;
        renderCustomerDetail();
      });

      actions.append(editBtn, delBtn);
    }

    li.append(actions);
    el.entryList.append(li);
  }
}

function render() {
  applyStaticLabels();
  const showingCustomer = Boolean(selectedPhone);
  el.homeView.hidden = showingCustomer;
  el.customerView.hidden = !showingCustomer;

  if (showingCustomer) {
    renderCustomerDetail();
  } else {
    renderHome();
  }
}

el.langSelect.addEventListener('change', () => {
  const nextLang = el.langSelect.value;
  state = {
    ...state,
    lang: nextLang === 'hi' || nextLang === 'te' ? nextLang : 'en',
  };
  saveState(state);
  render();
});

el.addCustomerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  showMessage(el.customerError, '');

  const result = addCustomer(state, {
    name: el.customerNameInput.value,
    phone: el.customerPhoneInput.value,
  });

  if (!result.ok) {
    showMessage(el.customerError, result.error);
    return;
  }

  state = result.state;
  saveState(state);
  el.addCustomerForm.reset();
  render();
});

el.tabAll.addEventListener('click', () => {
  activeTab = 'all';
  renderHome();
});

el.tabOverdue.addEventListener('click', () => {
  activeTab = 'overdue';
  renderHome();
});

el.customerSearch.addEventListener('input', () => {
  renderHome();
});

el.importGo.addEventListener('click', () => {
  showMessage(el.importError, '');
  showMessage(el.importStatus, '');

  const result = importLedger(el.importBox.value);
  if (!result.ok) {
    showMessage(el.importError, result.error);
    return;
  }

  state = result.state;
  saveState(state);
  el.importBox.value = '';
  el.upiIdInput.value = state.upiId || '';
  showMessage(el.importStatus, formatImportSummary(result.counts));
  render();
});

el.upiForm.addEventListener('submit', (event) => {
  event.preventDefault();
  showMessage(el.upiError, '');
  showMessage(el.upiStatus, '');

  const check = validateUpiId(el.upiIdInput.value);
  if (!check.ok) {
    showMessage(el.upiError, check.error);
    return;
  }

  state = { ...state, upiId: check.upiId };
  saveState(state);
  el.upiIdInput.value = state.upiId;
  showMessage(
    el.upiStatus,
    state.upiId
      ? `Saved UPI ID (${state.upiId}). Reminders now include a UPI pay link.`
      : 'Cleared UPI ID.'
  );
  render();
});

el.exportCsvBtn.addEventListener('click', () => {
  showMessage(el.importError, '');
  const csv = exportLedgerCsv(state.customers, state.entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hisaab-${getTodayString()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage(
    el.importStatus,
    `Exported ${state.entries.length} ${state.entries.length === 1 ? 'entry' : 'entries'} to CSV.`
  );
});

el.backBtn.addEventListener('click', closeCustomer);

el.addEntryForm.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'type') {
    syncEntryTypeControls();
  }
});

el.shotInput.addEventListener('change', () => {
  if (getSelectedEntryType() !== 'payment') {
    resetShotOcr();
    return;
  }
  const file = el.shotInput.files && el.shotInput.files[0];
  if (!file) {
    resetShotOcr();
    return;
  }
  readAmountFromScreenshot(file);
});

el.addEntryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedPhone) return;
  showMessage(el.entryError, '');
  showMessage(el.entryStatus, '');

  const type = getSelectedEntryType();
  let shotDataUrl = '';

  if (type === 'payment' && el.shotInput.files && el.shotInput.files[0]) {
    try {
      shotDataUrl = await compressScreenshot(el.shotInput.files[0]);
    } catch (err) {
      showMessage(el.entryError, err instanceof Error ? err.message : 'Could not read screenshot.');
      return;
    }
  }

  const baseEntry = {
    phone: selectedPhone,
    type,
    amount: el.entryAmountInput.value,
    date: el.entryDateInput.value,
    note: el.entryNoteInput.value,
  };

  const result = addEntry(state, shotDataUrl ? { ...baseEntry, shot: shotDataUrl } : baseEntry);
  if (!result.ok) {
    showMessage(el.entryError, result.error);
    return;
  }

  const saveStatus = trySaveState(result.state);
  if (saveStatus === 'ok') {
    state = result.state;
  } else if (saveStatus === 'unavailable') {
    state = result.state;
    showStorageAlert('Browser storage is unavailable. Changes will not survive a reload.');
  } else if (shotDataUrl) {
    // Storage full: keep the payment entry without the screenshot.
    const withoutShot = addEntry(state, baseEntry);
    if (withoutShot.ok && trySaveState(withoutShot.state) === 'ok') {
      state = withoutShot.state;
      showStorageAlert('Storage is full, so the payment was saved without the screenshot.');
    } else {
      showStorageAlert('Browser storage is full. Could not save entry.');
      return;
    }
  } else {
    showStorageAlert('Browser storage is full. Could not save entry.');
    return;
  }

  resetShotOcr();
  el.entryAmountInput.value = '';
  el.entryNoteInput.value = '';
  el.shotInput.value = '';
  el.entryDateInput.value = getTodayString();
  render();
});

// Initialize
state = loadState();
el.upiIdInput.value = state.upiId || '';
el.entryDateInput.value = getTodayString();
render();

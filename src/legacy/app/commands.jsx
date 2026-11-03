/** SplitSmart — Natural-language / voice commands and receipt scanning. */
import { uid } from '../state.jsx';
import { toPaise, unrollItem, undoUnrollItem } from '../algorithm.jsx';
import { GEMINI_API_KEY, GEMINI_CONFIGURED } from '../../config/gemini.jsx';
import { setScanState } from '../ui-enhance.jsx';
import { scanReceipt, scanReceiptParallel } from '../vision.jsx';
import { updateModelAvailabilityUI } from '../quota.jsx';
import { $, S, currentBill, esc, icon, members, toast } from './core.jsx';
import { renderAssign } from './views/assign.jsx';
import { renderBill } from './views/bill.jsx';

/**
 * Normalizes voice and text input:
 * - strips surrounding quotes
 * - strips trailing sentence punctuation (.,!?;:)
 * - converts spoken numbers into digits ("person one" -> "Person 1")
 */
export function normalizeSpokenText(text) {
  if (!text) return '';
  let cleaned = String(text)
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.,!?;:]+$/, '')
    .trim();

  // Normalize spoken numbers for common default member names
  cleaned = cleaned
    .replace(/\bperson\s+one\b/gi, 'Person 1')
    .replace(/\bperson\s+two\b/gi, 'Person 2')
    .replace(/\bperson\s+three\b/gi, 'Person 3')
    .replace(/\bperson\s+four\b/gi, 'Person 4')
    .replace(/\bperson\s+five\b/gi, 'Person 5')
    .replace(/\bperson\s+six\b/gi, 'Person 6')
    .replace(/\bperson\s+seven\b/gi, 'Person 7')
    .replace(/\bperson\s+eight\b/gi, 'Person 8')
    .replace(/\bperson\s+nine\b/gi, 'Person 9')
    .replace(/\bperson\s+ten\b/gi, 'Person 10');

  return cleaned;
}

export function executeNaturalLanguageCommand(text) {
  if (!text || !text.trim()) return;
  const bill = currentBill();
  if (!bill) return;

  const raw = text.trim();
  const cleaned = normalizeSpokenText(raw);
  const lower = cleaned.toLowerCase();
  const items = bill.items || [];
  const groupMembers = members();

  // Pattern 1: Clear all
  if (['clear all', 'reset all', 'clear assignments', 'reset assignments'].includes(lower)) {
    items.forEach(i => i.assignments = []);
    toast('Cleared all item assignments.');
    renderAssign();
    return;
  }

  // Pattern 2: Clear item X
  const clearMatch = lower.match(/^clear\s+(?:assignment\s+(?:for\s+)?)?(?:item\s+)?(.+)$/);
  if (clearMatch) {
    const targetStr = clearMatch[1].trim();
    const itemNum = parseInt(targetStr.replace(/^#/, ''), 10);
    const targetItem = !isNaN(itemNum) ? items[itemNum - 1] : items.find(i => i.name.toLowerCase().includes(targetStr));
    if (targetItem) {
      targetItem.assignments = [];
      toast(`Cleared assignments for "${targetItem.name}".`);
      renderAssign();
    } else {
      toast(`No item matching "${targetStr}" found.`, true);
    }
    return;
  }

  // Pattern 3: Split all remaining / Split equally
  if (['split all', 'split equally', 'split remaining', 'split all items'].includes(lower)) {
    const allIds = groupMembers.map(m => m.id);
    let count = 0;
    items.forEach(item => {
      if (!item.assignments || item.assignments.length === 0) {
        item.assignments = [...allIds];
        count++;
      }
    });
    toast(`Split ${count} unassigned item(s) equally across all members.`);
    renderAssign();
    return;
  }

  // Pattern 4: Auto split by diet
  if (['auto split by diet', 'split by diet', 'auto split', 'diet split'].includes(lower)) {
    let changed = 0;
    items.forEach(item => {
      if (item.category === 'VEG') {
        const eligible = groupMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
        if (eligible.length) { item.assignments = eligible; changed++; }
      } else if (item.category === 'NON-VEG') {
        const eligible = groupMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
        if (eligible.length) { item.assignments = eligible; changed++; }
      }
    });
    toast(`Dietary preferences applied to ${changed} item(s).`);
    renderAssign();
    return;
  }

  // Pattern 5: Unroll quantities
  if (['unroll quantities', 'unroll all', 'unroll'].includes(lower)) {
    let unrolledAny = false;
    const nextItems = [];
    const unrollHistory = [];
    items.forEach(item => {
      const res = unrollItem(item);
      if (res) {
        unrolledAny = true;
        unrollHistory.push({ original: item, unrolled: res });
        nextItems.push(...res);
      } else {
        nextItems.push(item);
      }
    });
    if (unrolledAny) {
      S.previousUnrolls.push({ type: 'batch', records: unrollHistory });
      bill.items = nextItems;
      toast('All quantities unrolled into individual units.');
      renderAssign();
    } else {
      toast('No items with quantity > 1 found to unroll.');
    }
    return;
  }

  // Pattern 6: Undo unroll
  if (['undo unroll', 'regroup', 'restore unroll'].includes(lower)) {
    if (!S.previousUnrolls.length) {
      toast('No unrolled quantities to undo.');
      return;
    }
    const last = S.previousUnrolls.pop();
    if (last.type === 'single') {
      bill.items = undoUnrollItem(bill.items, last.original);
    } else if (last.type === 'batch') {
      let cur = bill.items;
      last.records.forEach(r => { cur = undoUnrollItem(cur, r.original); });
      bill.items = cur;
    }
    toast('Restored original grouped quantities.');
    renderAssign();
    return;
  }

  // Pattern 7: Assign / Put / Split / Share / Give / Add <item> to/on/between/with/for <target>
  let itemQuery = null;
  let targetQuery = null;

  const assignMatch = lower.match(/^(?:assign|put|split|share|give|add)\s+(.+?)\s+(?:to|on|between|with|for)\s+(.+)$/);
  if (assignMatch) {
    itemQuery = assignMatch[1].trim();
    targetQuery = assignMatch[2].trim();
  } else {
    // Shorthand pattern: "<item> to/for/with <target>" (e.g. "naan to Rahul", "biryani for Sneha")
    const shortMatch = lower.match(/^(.+?)\s+(?:to|for|with)\s+(.+)$/);
    if (shortMatch) {
      itemQuery = shortMatch[1].trim();
      targetQuery = shortMatch[2].trim();
    }
  }

  if (itemQuery && targetQuery) {
    // Strip trailing punctuation from targetQuery
    targetQuery = targetQuery.replace(/[.,!?;:]+$/, '').trim();

    // Resolve item
    let targetItem = null;
    const itemNum = parseInt(itemQuery.replace(/^item\s+/i, '').replace(/^[#]/, ''), 10);
    if (!isNaN(itemNum) && items[itemNum - 1]) {
      targetItem = items[itemNum - 1];
    } else {
      const cleanItemQ = itemQuery.toLowerCase().trim();
      let matchingItems = items.filter(i => i.name.toLowerCase().trim() === cleanItemQ);
      if (matchingItems.length === 0) {
        matchingItems = items.filter(i => i.name.toLowerCase().includes(cleanItemQ));
      }
      if (matchingItems.length === 0) {
        matchingItems = items.filter(i => cleanItemQ.includes(i.name.toLowerCase().trim()));
      }

      if (matchingItems.length === 0) {
        toast(`No item found matching "${itemQuery}".`, true);
        return;
      } else if (matchingItems.length > 1) {
        showAmbiguityDialog(
          `Multiple items matched "${itemQuery}". Please choose one:`,
          matchingItems.map(i => ({ label: `${i.name} (Qty ${i.quantity})`, value: i.id })),
          selectedId => {
            const itm = items.find(i => i.id === selectedId);
            if (itm) applyAssignmentToItem(itm, targetQuery);
          }
        );
        return;
      }
      targetItem = matchingItems[0];
    }

    applyAssignmentToItem(targetItem, targetQuery);
    return;
  }

  // If local pattern matching didn't match, attempt Gemini Voice Model NLP if configured
  if (GEMINI_CONFIGURED) {
    toast('Analyzing with Gemini Voice Model…');
    interpretTextWithGemini(cleaned).then(parsed => {
      if (parsed && parsed.intent) {
        if (parsed.intent === 'clear') {
          if (parsed.item) {
            const itm = items.find(i => i.name.toLowerCase().includes(parsed.item.toLowerCase()));
            if (itm) {
              itm.assignments = [];
              toast(`Cleared assignments for "${itm.name}".`);
              renderAssign();
              return;
            }
          }
          items.forEach(i => i.assignments = []);
          toast('Cleared all item assignments.');
          renderAssign();
          return;
        }
        if (parsed.intent === 'split-all') {
          const allIds = groupMembers.map(m => m.id);
          items.forEach(i => { if (!i.assignments?.length) i.assignments = [...allIds]; });
          toast('Split unassigned items equally across all members.');
          renderAssign();
          return;
        }
        if (parsed.intent === 'split-diet') {
          let count = 0;
          items.forEach(i => {
            if (i.category === 'VEG') {
              const eligible = groupMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
              if (eligible.length) { i.assignments = eligible; count++; }
            }
          });
          toast(`Dietary preferences applied to ${count} item(s).`);
          renderAssign();
          return;
        }
        if (parsed.intent === 'assign' && parsed.item) {
          const itm = items.find(i => i.name.toLowerCase().includes(parsed.item.toLowerCase())) || items[0];
          if (itm && parsed.target) {
            applyAssignmentToItem(itm, parsed.target);
            return;
          }
        }
      }
      toast('Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"', true);
    }).catch(() => {
      toast('Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"', true);
    });
    return;
  }

  toast('Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"', true);
}

export function applyAssignmentToItem(item, targetQuery) {
  const groupMembers = members();
  let assignees = [];

  const normTarget = String(targetQuery || '')
    .toLowerCase()
    .replace(/[.,!?;:]+$/, '')
    .trim();

  if (['everyone', 'everybody', 'all', 'all of us', 'all members'].includes(normTarget)) {
    assignees = groupMembers.map(m => m.id);
  } else if (['veg', 'vegetarians', 'veg members', 'veg people'].includes(normTarget)) {
    assignees = groupMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
  } else if (['non-veg', 'nonveg', 'non vegetarians', 'non-vegetarians'].includes(normTarget)) {
    assignees = groupMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
  } else if (normTarget.includes(' and ') || normTarget.includes(',')) {
    const parts = normTarget.split(/(?:,|\sand\s)/).map(s => s.trim().replace(/[.,!?;:]+$/, '')).filter(Boolean);
    parts.forEach(p => {
      const match = groupMembers.find(m => {
        const mn = m.name.toLowerCase().trim();
        return mn === p || mn.includes(p) || p.includes(mn);
      });
      if (match) assignees.push(match.id);
    });
  } else {
    const matches = groupMembers.filter(m => {
      const mn = m.name.toLowerCase().trim();
      return mn === normTarget || mn.includes(normTarget) || normTarget.includes(mn);
    });
    if (matches.length === 0) {
      toast(`No group member found matching "${targetQuery}".`, true);
      return;
    } else if (matches.length > 1) {
      showAmbiguityDialog(
        `Multiple members matched "${targetQuery}". Select one:`,
        matches.map(m => ({ label: m.name, value: m.id })),
        selectedId => {
          item.assignments = [selectedId];
          toast(`Assigned ${item.name} to ${matches.find(m => m.id === selectedId)?.name}.`);
          renderAssign();
        }
      );
      return;
    }
    assignees = [matches[0].id];
  }

  if (assignees.length === 0) {
    toast('No eligible members matched.', true);
    return;
  }

  item.assignments = [...new Set(assignees)];
  toast(`Assigned "${item.name}" to ${assignees.map(id => groupMembers.find(m => m.id === id)?.name).join(', ')}.`);
  renderAssign();
}

export function showAmbiguityDialog(prompt, choices, onSelect) {
  $('#ambiguity-prompt').textContent = prompt;
  const container = $('#ambiguity-choices');
  container.innerHTML = choices.map(c => `
    <button type="button" class="button button-secondary" data-choice-val="${esc(c.value)}" style="width:100%;justify-content:flex-start;margin-bottom:8px;">
      ${esc(c.label)}
    </button>
  `).join('');

  S.pendingAmbiguityAction = onSelect;
  $('#ambiguity-dialog').showModal();
}

/**
 * Gemini Natural Language Command Parser
 */
export async function interpretTextWithGemini(userText) {
  if (!GEMINI_CONFIGURED) return null;
  const bill = currentBill();
  const items = (bill?.items || []).map(i => i.name);
  const grpMembers = members().map(m => m.name);

  const prompt = `You are the natural language command parser for SplitSmart bill splitting app.
Current bill items: ${JSON.stringify(items)}
Current group members: ${JSON.stringify(grpMembers)}
User command: "${userText}"

Interpret the user's intent. Output ONLY a valid JSON object in this format (no markdown):
{
  "intent": "assign" | "clear" | "split-all" | "split-diet" | "unroll" | "undo-unroll",
  "item": "<matched bill item name or null>",
  "target": "<matched member name, 'everyone', 'veg', 'non-veg', or null>"
}`;

  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ];

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (resp.status === 404) continue;
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const cleanJson = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Gemini Voice Audio Interpreter
 */
export async function interpretAudioWithGemini(audioBlob, mimeType) {
  if (!GEMINI_CONFIGURED) throw new Error('Gemini API key is not configured.');
  const base64 = await blobToBase64(audioBlob);
  const bill = currentBill();
  const items = (bill?.items || []).map(i => i.name);
  const grpMembers = members().map(m => m.name);

  const cleanMime = (mimeType || 'audio/webm').split(';')[0];
  const prompt = `You are the voice command interpreter for SplitSmart bill splitting app.
Current items on the bill: ${JSON.stringify(items)}
Current members: ${JSON.stringify(grpMembers)}

Listen to the audio command. Determine what the user said and what they want to do.
Output ONLY a JSON object in this format (no markdown):
{
  "transcript": "<transcription of what the user said>",
  "intent": "assign" | "clear" | "split-all" | "split-diet" | "unroll" | "undo-unroll",
  "item": "<closest matched item name from the bill or null>",
  "target": "<matched member name, 'everyone', 'veg', 'non-veg', or null>"
}`;

  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ];

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: cleanMime, data: base64 } },
              { text: prompt }
            ]
          }]
        })
      });
      if (resp.status === 404) continue;
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const cleanJson = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch {
      continue;
    }
  }
  throw new Error('Gemini Voice Model could not process audio.');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Receipt Scanning State & Stale Scan Protection
export let activeScanId = 0;
let activeScanAbortController = null;

export function getActiveScanId() {
  return activeScanId;
}

export function cancelActiveScan() {
  activeScanId++;
  if (activeScanAbortController) {
    try { activeScanAbortController.abort(); } catch {}
    activeScanAbortController = null;
  }
  const btn = $('#scan-btn');
  if (btn) btn.disabled = false;
  setScanState('idle');
}

if (typeof document !== 'undefined') {
  document.addEventListener('splitsmart:cancel-scan', () => cancelActiveScan());
}

// Receipt Scanning Handler (Parallel Model Racing)
export async function handleReceiptScan() {
  const fileInput = $('#receipt-upload');
  const file = fileInput?.files?.[0];
  if (!file) {
    toast('Please select or capture a receipt image first.', true);
    return;
  }

  if (!GEMINI_CONFIGURED) {
    toast('Receipt scanning is not enabled on this deployment.', true);
    return;
  }

  const currentScanId = ++activeScanId;
  if (activeScanAbortController) {
    try { activeScanAbortController.abort(); } catch {}
  }
  activeScanAbortController = new AbortController();
  const signal = activeScanAbortController.signal;

  const btn = $('#scan-btn');
  const statusBox = $('#scan-status');

  if (btn) btn.disabled = true;
  setScanState('scanning');
  if (statusBox) statusBox.innerHTML = '<span class="sc-progress-text">Racing multiple AI models…</span>';

  try {
    const onProgress = (msg) => {
      if (currentScanId !== activeScanId) return;
      if (statusBox) statusBox.innerHTML = `<span class="sc-progress-text">${esc(msg)}</span>`;
    };

    const receipt = await scanReceiptParallel(file, GEMINI_API_KEY, { signal }, onProgress);

    // Stale scan protection: discard if canceled or superseded
    if (currentScanId !== activeScanId) return;

    if (!receipt || receipt.isBillReceipt === false) {
      const reason = receipt?.reason ? ` ${receipt.reason}` : '';
      throw new Error(`This image doesn't appear to be a bill or receipt. Please upload a valid bill.${reason}`);
    }

    const b = currentBill();
    if (b) {
      b.restaurantName = receipt.merchantName || receipt.restaurantName || 'Scanned Receipt';
      b.taxRates = receipt.taxRates ? { ...receipt.taxRates } : null;
      b.tax = { ...receipt.tax };
      b.fixedAmounts = receipt.fixedAmounts ? { ...receipt.fixedAmounts } : null;
      b.taxBasis = receipt.taxBasis || 'independent';
      b.taxBasisConfirmed = receipt.taxBasisConfirmed;
      b.taxBasisReason = receipt.taxBasisReason;
      b.discount = receipt.discount || 0;
      b.statedTotal = receipt.statedGrandTotal;
      b.calculatedTotal = receipt.calculatedGrandTotal;
      b.hasDiscrepancy = receipt.hasDiscrepancy;
      b.discrepancyAmount = receipt.discrepancyAmount;
      b.items = receipt.items.map(it => ({
        id: uid('item'),
        name: it.name,
        quantity: it.quantity,
        unitPaise: toPaise(it.unitPrice),
        totalPaise: Math.round(toPaise(it.unitPrice) * it.quantity),
        category: it.category,
        assignments: []
      }));
      const winningModelLabel = receipt.winningModelLabel || receipt.winningModel || 'Gemini';
      S.scanNotice = { count: receipt.items.length, modelLabel: winningModelLabel };
      toast(`Receipt scanned successfully · ${winningModelLabel}`);
      renderBill();
      S.scanNotice = null;
    }
  } catch (err) {
    if (currentScanId !== activeScanId) return;
    if (err?.name === 'AbortError') {
      return;
    }
    setScanState('error');
    updateModelAvailabilityUI();

    const isModelUnavailable = err.message.includes('All configured AI models are currently unavailable');
    const isValidationRejection = err.message.includes("doesn't appear to be a bill") ||
                                  err.message.includes("couldn't identify a readable bill") ||
                                  err.message.includes('Bill not detected');

    if (isModelUnavailable) {
      const formatted = esc(err.message).replace(/\n/g, '<br>');
      if (statusBox) {
        statusBox.innerHTML = `<div class="sc-note is-error">${icon('warning')} <div style="font-size:12.5px; line-height:1.5;">${formatted}</div></div>`;
      }
      toast('All configured AI models are currently unavailable. Check model status below.', true);
    } else {
      const displayMsg = isValidationRejection
        ? err.message
        : `${err.message} You can retry, or enter items manually.`;
      if (statusBox) {
        statusBox.innerHTML = `<div class="sc-note is-error">${icon('warning')} <span>${esc(displayMsg)}</span></div>`;
      }
      toast(displayMsg, true);
    }
  } finally {
    if (currentScanId === activeScanId) {
      if (btn) btn.disabled = false;
      activeScanAbortController = null;
    }
  }
}

// Global Voice State
let activeMediaStream = null;
let activeMediaRecorder = null;
let activeAudioChunks = [];

export function stopVoiceCommand() {
  const micBtn = $('#mic-btn');
  if (micBtn) {
    micBtn.innerHTML = icon('mic');
    micBtn.setAttribute('aria-label', 'Start voice command');
    micBtn.title = 'Voice command';
    micBtn.classList.remove('is-listening');
  }

  if (S.recognitionInstance) {
    try { S.recognitionInstance.stop(); } catch { /* ignore */ }
    S.recognitionInstance = null;
  }

  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    try { activeMediaRecorder.stop(); } catch { /* ignore */ }
    activeMediaRecorder = null;
  }

  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach(track => track.stop());
    activeMediaStream = null;
  }
  S.isVoiceListening = false;
}

// Voice Command Handler (Dual Engine: Web Speech API with Gemini Voice Model Fallback)
export async function handleVoiceCommand() {
  const micBtn = $('#mic-btn');

  // If already listening, stop
  if (S.isVoiceListening) {
    stopVoiceCommand();
    toast('Voice listening stopped.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  if (!SpeechRecognition && !hasGetUserMedia) {
    toast('Voice input is not supported in this browser. Type your command instead.', true);
    return;
  }

  const updateListeningUI = (listening) => {
    S.isVoiceListening = listening;
    if (!micBtn) return;
    micBtn.innerHTML = listening ? icon('square') : icon('mic');
    micBtn.setAttribute('aria-label', listening ? 'Stop listening' : 'Start voice command');
    micBtn.title = listening ? 'Click to stop listening' : 'Voice command';
    micBtn.classList.toggle('is-listening', listening);
  };

  // Gemini Audio Voice Model capture
  const startGeminiVoiceCapture = async () => {
    if (!hasGetUserMedia) {
      toast('Microphone access is not supported in this browser.', true);
      updateListeningUI(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeMediaStream = stream;
      activeAudioChunks = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      activeMediaRecorder = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) activeAudioChunks.push(e.data);
      };

      recorder.onstop = async () => {
        updateListeningUI(false);
        stream.getTracks().forEach(t => t.stop());
        activeMediaStream = null;
        activeMediaRecorder = null;

        const blobType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(activeAudioChunks, { type: blobType });

        if (audioBlob.size < 100) return;

        toast('Processing voice command with Gemini Voice Model…');
        try {
          const parsed = await interpretAudioWithGemini(audioBlob, blobType);
          if (parsed?.transcript) {
            const input = $('#command-input');
            if (input) input.value = parsed.transcript;
            executeNaturalLanguageCommand(parsed.transcript);
          } else if (parsed?.intent) {
            executeNaturalLanguageCommand(parsed.item ? `assign ${parsed.item} to ${parsed.target || 'everyone'}` : parsed.intent);
          }
        } catch (err) {
          toast(err.message || 'Could not understand audio. Try typing your command.', true);
        }
      };

      recorder.start(250);
      updateListeningUI(true);
      toast('Gemini Voice Model listening… Speak clearly, then click Stop.');

      // Auto stop after 9 seconds of recording
      setTimeout(() => {
        if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
          activeMediaRecorder.stop();
        }
      }, 9000);

    } catch (err) {
      updateListeningUI(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast('Microphone permission was denied. Allow microphone access to use Voice.', true);
      } else {
        toast('Could not access microphone: ' + (err.message || err.name), true);
      }
    }
  };

  // If SpeechRecognition is supported: try Web Speech API first
  if (SpeechRecognition) {
    try {
      const recognition = new SpeechRecognition();
      S.recognitionInstance = recognition;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        updateListeningUI(true);
        toast('Listening… Speak your command.');
      };

      recognition.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        updateListeningUI(false);
        if (!transcript) return;
        const input = $('#command-input');
        if (input) input.value = transcript;
        executeNaturalLanguageCommand(transcript);
      };

      recognition.onerror = event => {
        updateListeningUI(false);
        S.recognitionInstance = null;

        // If network error (common on Linux Chromium / Brave) or service blocked, fallback to Gemini Voice Model!
        if (['network', 'service-not-allowed'].includes(event.error) && GEMINI_CONFIGURED && hasGetUserMedia) {
          toast('Falling back to Gemini Voice Model…');
          startGeminiVoiceCapture();
          return;
        }

        const messages = {
          'not-allowed': 'Microphone permission was denied. Allow microphone access to use Voice.',
          'service-not-allowed': 'Voice recognition service is blocked. Try typing your command.',
          'audio-capture': 'No microphone was found. Check your microphone and try again.',
          'no-speech': 'No speech was detected. Try clicking Voice again.',
          'network': 'Speech recognition network error. Try typing or check your connection.'
        };
        if (event.error !== 'aborted') {
          toast(messages[event.error] || `Voice error: ${event.error}`, true);
        }
      };

      recognition.onend = () => {
        updateListeningUI(false);
        if (S.recognitionInstance === recognition) S.recognitionInstance = null;
      };

      recognition.start();
      return;
    } catch (err) {
      if (GEMINI_CONFIGURED && hasGetUserMedia) {
        startGeminiVoiceCapture();
        return;
      }
      toast('Voice input could not start: ' + err.message, true);
    }
  } else if (GEMINI_CONFIGURED && hasGetUserMedia) {
    startGeminiVoiceCapture();
  } else {
    toast('Voice input is not supported in this browser. Type your command instead.', true);
  }
}

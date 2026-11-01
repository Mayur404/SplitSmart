/** SplitSmart — Natural-language / voice commands and receipt scanning. */
import { uid } from '../state.jsx';
import { toPaise } from '../algorithm.jsx';
import { GEMINI_API_KEY, GEMINI_CONFIGURED } from '../../config/gemini.jsx';
import { setScanState } from '../ui-enhance.jsx';
import { scanReceipt } from '../vision.jsx';
import { $, S, currentBill, esc, icon, members, toast } from './core.jsx';
import { renderAssign } from './views/assign.jsx';
import { renderBill } from './views/bill.jsx';

export function executeNaturalLanguageCommand(text) {
  if (!text || !text.trim()) return;
  const bill = currentBill();
  if (!bill) return;

  const raw = text.trim();
  const lower = raw.toLowerCase();
  const items = bill.items || [];
  const groupMembers = members();

  // Pattern 1: Clear all
  if (lower === 'clear all' || lower === 'reset all') {
    items.forEach(i => i.assignments = []);
    toast('Cleared all item assignments.');
    renderAssign();
    return;
  }

  // Pattern 2: Clear item X
  const clearMatch = lower.match(/^clear\s+(?:assignment\s+(?:for\s+)?)?(?:item\s+)?(.+)$/);
  if (clearMatch) {
    const targetStr = clearMatch[1].trim();
    const itemNum = parseInt(targetStr, 10);
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

  // Pattern 3: Assign / Put / Split <item> to/on/between <target>
  const assignMatch = lower.match(/^(?:assign|put|split)\s+(.+?)\s+(?:to|on|between)\s+(.+)$/);
  if (!assignMatch) {
    toast('Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"', true);
    return;
  }

  const itemQuery = assignMatch[1].trim();
  const targetQuery = assignMatch[2].trim();

  // Resolve item
  let targetItem = null;
  const itemNum = parseInt(itemQuery.replace(/^item\s+/, ''), 10);
  if (!isNaN(itemNum) && items[itemNum - 1]) {
    targetItem = items[itemNum - 1];
  } else {
    const matchingItems = items.filter(i => i.name.toLowerCase().includes(itemQuery));
    if (matchingItems.length === 0) {
      toast(`No item found matching "${itemQuery}".`, true);
      return;
    } else if (matchingItems.length > 1) {
      // Ambiguous item match
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
}

export function applyAssignmentToItem(item, targetQuery) {
  const groupMembers = members();
  let assignees = [];

  if (targetQuery === 'everyone' || targetQuery === 'everybody' || targetQuery === 'all') {
    assignees = groupMembers.map(m => m.id);
  } else if (targetQuery === 'veg' || targetQuery === 'vegetarians') {
    assignees = groupMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
  } else if (targetQuery === 'non-veg' || targetQuery === 'nonveg') {
    assignees = groupMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
  } else if (targetQuery.includes(' and ')) {
    const names = targetQuery.split(' and ').map(s => s.trim());
    names.forEach(n => {
      const match = groupMembers.find(m => m.name.toLowerCase().includes(n));
      if (match) assignees.push(match.id);
    });
  } else {
    const matches = groupMembers.filter(m => m.name.toLowerCase().includes(targetQuery));
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

// Receipt Scanning Handler
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

  const btn = $('#scan-btn');
  const statusBox = $('#scan-status');

  btn.disabled = true;
  setScanState('scanning');
  statusBox.innerHTML = '<span class="sc-progress-text">Compressing image…</span>';

  try {
    const onProgress = (msg) => {
      if (statusBox) statusBox.innerHTML = `<span class="sc-progress-text">${esc(msg)}</span>`;
    };

    // Model choice is intentionally internal: the scanner owns automatic
    // model selection and fallback so users never need to choose a model.
    const receipt = await scanReceipt(file, GEMINI_API_KEY, 'auto', onProgress);
    const b = currentBill();
    if (b) {
      b.restaurantName = receipt.restaurantName;
      b.tax = { ...receipt.tax };
      b.discount = receipt.discount;
      b.statedTotal = receipt.statedGrandTotal;
      b.items = receipt.items.map(it => ({
        id: uid('item'),
        name: it.name,
        quantity: it.quantity,
        unitPaise: toPaise(it.unitPrice),
        totalPaise: Math.round(toPaise(it.unitPrice) * it.quantity),
        category: it.category,
        assignments: []
      }));
       S.scanNotice = { count: receipt.items.length };
       toast('Receipt scanned successfully. Review the extracted items.');
      renderBill();
      S.scanNotice = null;   // shown once, in the freshly rendered scanner
    }
  } catch (err) {
    setScanState('error');
    statusBox.innerHTML = `<div class="sc-note is-error">${icon('warning')} <span>${esc(err.message)} You can retry, or enter items manually.</span></div>`;
  } finally {
    btn.disabled = false;
  }
}

// Voice Command Handler (Web Speech API). Keep one instance alive until the
// browser's end event so rapid clicks cannot create competing recognizers.
export function handleVoiceCommand() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('Voice input is not supported in this browser. Type your command instead.', true);
    return;
  }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (!window.isSecureContext && !localHost) {
    toast('Voice input requires HTTPS or localhost for microphone access. Type your command instead.', true);
    return;
  }

  if (S.recognitionInstance) {
    try { S.recognitionInstance.stop(); } catch { /* already stopped */ }
    return;
  }

  const recognition = new SpeechRecognition();
  S.recognitionInstance = recognition;
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  const updateButton = listening => {
    const micBtn = $('#mic-btn');
    if (!micBtn) return;
    micBtn.innerHTML = listening ? 'Stop' : icon('mic');
    micBtn.setAttribute('aria-label', listening ? 'Stop listening' : 'Start voice command');
    micBtn.classList.toggle('is-listening', listening);
  };

  recognition.onstart = () => updateButton(true);
  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;
    const input = $('#command-input');
    if (input) input.value = transcript;
    executeNaturalLanguageCommand(transcript);
  };
  recognition.onerror = event => {
    const messages = {
      'not-allowed': 'Microphone permission was denied. Allow microphone access to use Voice.',
      'service-not-allowed': 'Voice recognition is blocked by the browser. Allow microphone access or type your command.',
      'audio-capture': 'No microphone was found. Check your microphone and try again.',
      'no-speech': 'No speech was detected. Try Voice again and speak clearly.',
      'network': 'Voice recognition could not reach the browser service. Try again or type your command.'
    };
    if (event.error !== 'aborted') toast(messages[event.error] || `Voice recognition error: ${event.error}.`, true);
    updateButton(false);
  };
  recognition.onend = () => {
    updateButton(false);
    if (S.recognitionInstance === recognition) S.recognitionInstance = null;
  };

  try {
    recognition.start();
  } catch (error) {
    updateButton(false);
    if (S.recognitionInstance === recognition) S.recognitionInstance = null;
    toast(error.name === 'NotAllowedError'
      ? 'Microphone permission was denied. Allow microphone access to use Voice.'
      : 'Voice input could not start. Try again or type your command.', true);
  }
}

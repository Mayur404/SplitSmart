/**
 * SplitSmart — state.jsx
 * Minimal Local Persistence, Roster Management, Session State, Backup, and Restore.
 */

const STORAGE_KEYS = {
  settings: 'splitsmart:v1:settings',
  rosters: 'splitsmart:v1:rosters',
  recent: 'splitsmart:v1:recent'
};

// In-memory fallback if localStorage is disabled, throws QuotaExceededError, or in private browsing
const memoryStore = {};

let storageAvailable = true;
try {
  const testKey = '__splitsmart_test__';
  localStorage.setItem(testKey, '1');
  localStorage.removeItem(testKey);
} catch {
  storageAvailable = false;
}

export function isStorageAvailable() {
  return storageAvailable;
}

export function read(key, fallback) {
  const storageKey = STORAGE_KEYS[key] || key;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return memoryStore[key] ?? fallback;
    return JSON.parse(raw);
  } catch {
    return memoryStore[key] ?? fallback;
  }
}

export function write(key, value) {
  memoryStore[key] = value;
  const storageKey = STORAGE_KEYS[key] || key;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  delete memoryStore[key];
  const storageKey = STORAGE_KEYS[key] || key;
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate unique local IDs.
 */
export function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Clean and validate member profile.
 */
export function sanitizeMember(raw, index = 1) {
  const dietaryTags = ['VEG', 'NON-VEG', 'ANY'];
  const tag = dietaryTags.includes(raw.dietaryTag) ? raw.dietaryTag : 'ANY';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('person'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : `Person ${index}`,
    upiId: typeof raw.upiId === 'string' ? raw.upiId.trim().slice(0, 120) : '',
    dietaryTag: tag,
    example: !!raw.example
  };
}

/**
 * Preset roster templates:
 * - Roommates (4)
 * - Friends (6)
 * - Class Outing (30)
 * Marked with example: true so users know to edit them before use.
 */
export function templates() {
  const makeExample = (name, upi, diet) => ({
    id: uid('person'),
    name,
    upiId: upi,
    dietaryTag: diet,
    example: true
  });

  return [
    {
      id: uid('tpl'),
      name: 'Roommates',
      members: [
        makeExample('Aman', 'aman@okhdfcbank', 'ANY'),
        makeExample('Sneha', 'sneha@icici', 'VEG'),
        makeExample('Rahul', 'rahul@oksbi', 'NON-VEG'),
        makeExample('Pooja', 'pooja@axl', 'VEG')
      ]
    },
    {
      id: uid('tpl'),
      name: 'Friends',
      members: [
        makeExample('Vikram', 'vikram@paytm', 'ANY'),
        makeExample('Ananya', 'ananya@oksbi', 'VEG'),
        makeExample('Karan', 'karan@okhdfcbank', 'NON-VEG'),
        makeExample('Rhea', 'rhea@axl', 'ANY'),
        makeExample('Dev', 'dev@icici', 'VEG'),
        makeExample('Meera', 'meera@okaxis', 'NON-VEG')
      ]
    },
    {
      id: uid('tpl'),
      name: 'Class Outing',
      members: Array.from({ length: 30 }, (_, i) => ({
        id: uid('person'),
        name: `Student ${i + 1}`,
        upiId: '',
        dietaryTag: i % 3 === 0 ? 'VEG' : i % 3 === 1 ? 'NON-VEG' : 'ANY',
        example: true
      }))
    }
  ];
}

/**
 * Create a fresh group.
 */
export function freshRoster(name = 'New group', count = 0) {
  return {
    id: uid('group'),
    name: name.trim().slice(0, 80) || 'New group',
    primaryPayerId: null,
    members: Array.from({ length: Math.min(30, count) }, (_, i) => ({
      id: uid('person'),
      name: `Person ${i + 1}`,
      upiId: '',
      dietaryTag: 'ANY',
      example: true
    }))
  };
}

/**
 * Retrieve saved groups.
 */
export function getRosters() {
  const raw = read('rosters', null);
  if (!Array.isArray(raw)) {
    // If no rosters stored yet, provide default starter group
    const initial = [freshRoster('Flatmates', 4)];
    saveRosters(initial);
    return initial;
  }

  return raw
    .filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.members))
    .map(g => ({
      id: g.id,
      name: g.name.slice(0, 80),
      primaryPayerId: typeof g.primaryPayerId === 'string' ? g.primaryPayerId : null,
      members: g.members.slice(0, 30).map((m, i) => sanitizeMember(m, i + 1))
    }));
}

export function saveRosters(rosters) {
  const clean = rosters.map(g => ({
    id: g.id,
    name: g.name.trim().slice(0, 80),
    primaryPayerId: g.primaryPayerId || null,
    members: g.members.slice(0, 30).map((m, i) => ({
      id: m.id,
      name: m.name.trim().slice(0, 60),
      upiId: (m.upiId || '').trim().slice(0, 120),
      dietaryTag: ['VEG', 'NON-VEG', 'ANY'].includes(m.dietaryTag) ? m.dietaryTag : 'ANY',
      example: !!m.example
    }))
  }));
  return write('rosters', clean);
}

/**
 * User Settings (theme, selected model, warning threshold).
 * The Gemini API key is no longer stored here — it comes from VITE_GEMINI_API_KEY (src/config/gemini.jsx).
 */
export function getSettings() {
  const s = read('settings', {});
  // One-time cleanup: drop any API key an older version saved to localStorage.
  if (s && (s.apiKey || s.saveKey)) { delete s.apiKey; delete s.saveKey; write('settings', s); }
  return {
    theme: s?.theme === 'dark' ? 'dark' : 'light',
    selectedModel: typeof s?.selectedModel === 'string' && s.selectedModel ? s.selectedModel : 'auto',
    upiThresholdPaise: Number.isInteger(s?.upiThresholdPaise) ? s.upiThresholdPaise : 200000 // ₹2,000
  };
}

export function saveSettings(settings) {
  const clean = {
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    selectedModel: typeof settings.selectedModel === 'string' && settings.selectedModel ? settings.selectedModel : 'auto',
    upiThresholdPaise: Number.isInteger(settings.upiThresholdPaise) ? settings.upiThresholdPaise : 200000
  };
  return write('settings', clean);
}

/**
 * Recent Outing / Bill summaries (max 5 sessions).
 */
export function getRecent() {
  const raw = read('recent', []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => r && typeof r.id === 'string' && typeof r.restaurantName === 'string' && Number.isInteger(r.totalPaise))
    .slice(0, 5);
}

export function saveRecent(recent) {
  return write('recent', recent.slice(0, 5));
}

/**
 * Export JSON backup.
 * Strictly excludes API keys, image data, and temporary cache.
 */
export function exportBackup() {
  return {
    version: 1,
    exportDate: new Date().toISOString(),
    rosters: getRosters(),
    settings: {
      theme: getSettings().theme,
      upiThresholdPaise: getSettings().upiThresholdPaise
    }
  };
}

/**
 * Validate imported JSON backup.
 */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== 1) return false;
  if (!Array.isArray(data.rosters) || data.rosters.length > 50) return false;

  return data.rosters.every(g => {
    if (!g || typeof g.name !== 'string' || !g.name.trim()) return false;
    if (!Array.isArray(g.members) || g.members.length > 30) return false;
    return g.members.every(m => {
      return m && typeof m.name === 'string' && m.name.trim() && ['VEG', 'NON-VEG', 'ANY'].includes(m.dietaryTag);
    });
  });
}

/**
 * Import JSON backup.
 */
export function importBackup(data) {
  if (!validateBackup(data)) {
    throw new Error('This backup file is invalid, corrupted, or from an unsupported version.');
  }
  const clean = data.rosters.map(g => ({
    id: uid('group'),
    name: g.name.trim().slice(0, 80),
    primaryPayerId: null,
    members: g.members.slice(0, 30).map((m, i) => sanitizeMember(m, i + 1))
  }));
  saveRosters(clean);
  return clean;
}

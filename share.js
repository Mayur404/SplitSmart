/**
 * SplitSmart — share.js
 * Stateless WhatsApp Self-Claim, Compressed URL State, and Claim Importing.
 *
 * Fully resilient: Includes native vanilla JS LZ-String compressor/decompressor
 * so sharing works 100% offline even if CDN libraries are blocked by corporate firewalls.
 */

// Native LZ-String implementation for 100% offline / CDN-blocked fallback
const keyStrUriSafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const baseReverseDic = {};

function getBaseValue(alphabet, character) {
  if (!baseReverseDic[alphabet]) {
    baseReverseDic[alphabet] = {};
    for (let i = 0; i < alphabet.length; i++) {
      baseReverseDic[alphabet][alphabet.charAt(i)] = i;
    }
  }
  return baseReverseDic[alphabet][character];
}

function nativeCompress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed == null) return '';
  let i, value, context_dictionary = {}, context_dictionaryToCreate = {}, context_c = '', context_wc = '', context_w = '',
    context_enlargeIn = 2, context_dictSize = 3, context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0, ii;

  for (ii = 0; ii < uncompressed.length; ii += 1) {
    context_c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
      context_dictionary[context_c] = context_dictSize++;
      context_dictionaryToCreate[context_c] = true;
    }
    context_wc = context_w + context_c;
    if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
      context_w = context_wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
        if (context_w.charCodeAt(0) < 256) {
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 8; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 16; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      context_dictionary[context_wc] = context_dictSize++;
      context_w = String(context_c);
    }
  }

  if (context_w !== '') {
    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
      if (context_w.charCodeAt(0) < 256) {
        for (i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
        }
        value = context_w.charCodeAt(0);
        for (i = 0; i < 8; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      } else {
        value = 1;
        for (i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1) | value;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = 0;
        }
        value = context_w.charCodeAt(0);
        for (i = 0; i < 16; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      delete context_dictionaryToCreate[context_w];
    } else {
      value = context_dictionary[context_w];
      for (i = 0; i < context_numBits; i++) {
        context_data_val = (context_data_val << 1) | (value & 1);
        if (context_data_position == bitsPerChar - 1) {
          context_data_position = 0;
          context_data.push(getCharFromInt(context_data_val));
          context_data_val = 0;
        } else {
          context_data_position++;
        }
        value = value >> 1;
      }
    }
    context_enlargeIn--;
    if (context_enlargeIn == 0) {
      context_enlargeIn = Math.pow(2, context_numBits);
      context_numBits++;
    }
  }

  value = 2;
  for (i = 0; i < context_numBits; i++) {
    context_data_val = (context_data_val << 1) | (value & 1);
    if (context_data_position == bitsPerChar - 1) {
      context_data_position = 0;
      context_data.push(getCharFromInt(context_data_val));
      context_data_val = 0;
    } else {
      context_data_position++;
    }
    value = value >> 1;
  }

  while (true) {
    context_data_val = (context_data_val << 1);
    if (context_data_position == bitsPerChar - 1) {
      context_data.push(getCharFromInt(context_data_val));
      break;
    } else context_data_position++;
  }
  return context_data.join('');
}

function nativeDecompress(length, resetValue, getNextValue) {
  let dictionary = [], next, enlargeIn = 4, dictSize = 4, numBits = 3, entry = '', result = [],
    i, w, bits, resb, maxpower, power, c,
    data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (i = 0; i < 3; i += 1) {
    dictionary[i] = i;
  }

  bits = 0;
  maxpower = Math.pow(2, 2);
  power = 1;
  while (power != maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position == 0) {
      data.position = resetValue;
      data.val = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (next = bits) {
    case 0:
      bits = 0;
      maxpower = Math.pow(2, 8);
      power = 1;
      while (power != maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 1:
      bits = 0;
      maxpower = Math.pow(2, 16);
      power = 1;
      while (power != maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 2:
      return '';
  }
  dictionary[3] = c;
  w = c;
  result.push(c);
  while (true) {
    if (data.index > length) {
      return '';
    }

    bits = 0;
    maxpower = Math.pow(2, numBits);
    power = 1;
    while (power != maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position == 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (c = bits) {
      case 0:
        bits = 0;
        maxpower = Math.pow(2, 8);
        power = 1;
        while (power != maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        bits = 0;
        maxpower = Math.pow(2, 16);
        power = 1;
        while (power != maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
    }

    if (enlargeIn == 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else {
      if (c === dictSize) {
        entry = w + w.charAt(0);
      } else {
        return null;
      }
    }
    result.push(entry);

    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;

    if (enlargeIn == 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }
  }
}

function nativeCompressToEncodedURIComponent(input) {
  if (input == null) return '';
  return nativeCompress(input, 6, function(a) { return keyStrUriSafe.charAt(a); });
}

function nativeDecompressFromEncodedURIComponent(input) {
  if (input == null) return '';
  if (input === '') return null;
  input = input.replace(/ /g, '+');
  return nativeDecompress(input.length, 32, function(index) { return getBaseValue(keyStrUriSafe, input.charAt(index)); });
}

/**
 * Build minimum payload required for self-claims.
 * Strictly excludes API keys, image data, and private roster information.
 */
export function makeSharePayload(session, members, items) {
  return {
    version: 1,
    sessionId: String(session.id || 'outing'),
    outing: String(session.restaurantName || 'Shared Outing').slice(0, 80),
    date: String(session.date || '').slice(0, 10),
    participants: members.map(m => String(m.name).trim().slice(0, 60)),
    items: items.map(item => ({
      id: String(item.id),
      name: String(item.name || 'Item').trim().slice(0, 80),
      quantity: Math.max(1, Number(item.quantity) || 1),
      costPaise: Math.trunc(Number(item.totalPaise) || 0)
    }))
  };
}

/**
 * Encode payload to compressed URL component using LZ-String (or native fallback).
 */
export function encodeShare(payload) {
  const json = JSON.stringify(payload);

  // Use window.LZString if available; otherwise use our built-in native compressor
  const compressFn = (typeof window !== 'undefined' && window.LZString?.compressToEncodedURIComponent)
    ? window.LZString.compressToEncodedURIComponent
    : nativeCompressToEncodedURIComponent;

  let compressed;
  try {
    compressed = compressFn(json);
  } catch {
    compressed = nativeCompressToEncodedURIComponent(json);
  }

  // URLs longer than ~6000 characters may be truncated by messaging apps or browsers
  if (compressed && compressed.length > 6000) {
    throw new Error('This bill has too many items to fit in a single share link. Consider splitting into multiple bills.');
  }

  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' && window.location?.pathname ? window.location.pathname : '';

  return `${origin}${pathname}#data=${compressed}`;
}

/**
 * Safely decode and validate shared state from URL hash.
 */
export function decodeShare(hash) {
  try {
    let clean = (hash || '').trim();
    // Decode if fully URL encoded (e.g. %23data%3D...)
    if (clean.startsWith('%23') || clean.includes('%3D') || clean.includes('%3d')) {
      try {
        clean = decodeURIComponent(clean);
      } catch {}
    }
    clean = clean.replace(/^#/, '').trim();

    let rawData = '';
    if (clean.startsWith('data=')) {
      rawData = clean.slice(5);
    } else if (clean.includes('data=')) {
      const match = clean.match(/[?&#]?data=([^&]+)/);
      rawData = match ? match[1] : clean;
    } else {
      rawData = clean;
    }

    // If rawData contains URL encoding (like %2B for +), decode it
    if (rawData.includes('%')) {
      try {
        rawData = decodeURIComponent(rawData);
      } catch {}
    }

    if (!rawData || rawData.length > 15000) {
      throw new Error('Share link data is empty or corrupted.');
    }

    const decompressFn = (typeof window !== 'undefined' && window.LZString?.decompressFromEncodedURIComponent)
      ? window.LZString.decompressFromEncodedURIComponent
      : nativeDecompressFromEncodedURIComponent;

    let decompressed = '';
    const candidates = [
      rawData,
      rawData.replace(/ /g, '+'),
      rawData.replace(/\s+/g, '+')
    ];

    for (const cand of candidates) {
      try {
        decompressed = decompressFn(cand);
        if (decompressed && decompressed.startsWith('{')) break;
      } catch {}
      try {
        decompressed = nativeDecompressFromEncodedURIComponent(cand);
        if (decompressed && decompressed.startsWith('{')) break;
      } catch {}
    }

    if (!decompressed) {
      throw new Error('Unable to decompress bill data. The link may have been truncated by a chat app.');
    }

    const p = JSON.parse(decompressed);

    // Validate schema
    if (p.version !== 1) {
      throw new Error('This shared link was created with an incompatible version.');
    }
    if (typeof p.sessionId !== 'string' || !p.sessionId) {
      throw new Error('Missing session identifier in shared link.');
    }
    if (!Array.isArray(p.participants) || p.participants.length === 0 || p.participants.length > 30) {
      throw new Error('Participant roster is missing or exceeds limit (30).');
    }
    if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 100) {
      throw new Error('Item list is empty or exceeds limit (100).');
    }

    // Validate items
    for (const item of p.items) {
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isInteger(item.costPaise)) {
        throw new Error('Malformed item in shared data.');
      }
    }

    return p;
  } catch (err) {
    throw new Error(err.message || 'Unable to open this shared bill link.');
  }
}

/**
 * Format a participant's claim into a standard versioned message.
 * e.g. SPLITSMART_CLAIM:{"version":1,"sessionId":"bill-123","user":"Aman","itemIds":["i1","i2"]}
 */
export function claimMessage(payload, userName, claimedItemIds) {
  const claimData = {
    version: 1,
    sessionId: payload.sessionId,
    user: String(userName).trim(),
    itemIds: claimedItemIds
  };
  return `SPLITSMART_CLAIM:${JSON.stringify(claimData)}`;
}

/**
 * Parse and validate a claim message pasted by the host.
 */
export function parseClaim(messageText, currentPayload = null, existingClaims = []) {
  if (!messageText || typeof messageText !== 'string') {
    throw new Error('Please paste a valid SPLITSMART_CLAIM message.');
  }

  const match = messageText.match(/SPLITSMART_CLAIM:(\{.*\})/);
  if (!match) {
    throw new Error('No valid SplitSmart claim found in the pasted message. Make sure to paste the full message starting with SPLITSMART_CLAIM:');
  }

  let claim;
  try {
    claim = JSON.parse(match[1]);
  } catch {
    throw new Error('The claim data inside the message is corrupted or malformed.');
  }

  if (claim.version !== 1) {
    throw new Error('Unsupported claim version.');
  }

  if (currentPayload) {
    if (claim.sessionId !== currentPayload.sessionId) {
      throw new Error(`This claim belongs to a different session (${claim.sessionId}) than the current bill (${currentPayload.sessionId}).`);
    }
    if (Array.isArray(currentPayload.participants) && !currentPayload.participants.includes(claim.user)) {
      throw new Error(`Participant "${claim.user}" is not in this bill's member list.`);
    }
    if (Array.isArray(currentPayload.items)) {
      const validIds = new Set(currentPayload.items.map(i => i.id));
      for (const id of claim.itemIds) {
        if (!validIds.has(id)) {
          throw new Error(`Item ID "${id}" does not exist in the current bill.`);
        }
      }
    }
  }

  if (!Array.isArray(claim.itemIds) || claim.itemIds.length === 0) {
    throw new Error('The claim contains no items.');
  }

  // Check for duplicate claims from same user
  const alreadyClaimed = existingClaims.some(c => c.user === claim.user && c.itemIds.some(id => claim.itemIds.includes(id)));
  if (alreadyClaimed) {
    throw new Error(`A claim has already been imported for ${claim.user} with overlapping items.`);
  }

  return claim;
}

/**
 * Generate WhatsApp share intent URL.
 */
export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

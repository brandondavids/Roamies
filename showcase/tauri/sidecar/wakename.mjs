// The wake word's name, chosen by the user ("Hey Jarvis"). The voice helpers (voice/main.swift, voice-win/src/wake.rs,
// WakeWord.set_name) apply the same rule; this one turns a typed name into one to save, or says why not, before it gets
// that far. E.V. is said "Ee-vee" and written "E.V."; Roamies answers to its greeting too.
export const DEFAULT_WAKE_NAME = 'E.V.';
export const DEFAULT_WAKE_DISPLAY = 'E.V.';
// Words people say all the time: as a wake name, "Hey there"-style chatter would wake Roamies.
const COMMON = new Set(['hello', 'there', 'okay', 'yeah', 'thanks', 'sorry', 'right', 'what', 'this', 'that', 'with', 'have',
  'just', 'like', 'about', 'would', 'could', 'really', 'maybe', 'guys', 'everyone', 'everybody', 'buddy', 'listen', 'look',
  'siri', 'alexa', 'google']);

/** Typed text → { ok: true, name } (name '' means back to the defaults, E.V. and Roamies) or { ok: false, why }. */
export function cleanWakeName(raw) {
  const t = String(raw ?? '').trim().replace(/^(hey|hi)[\s,]+/i, '');
  // The app's own name, however it's typed: "E.V.", "Ee-vee", "Eevee", "Evie", "Eve"; or Roamies.
  const flat = t.replace(/[^a-z]/gi, '').toLowerCase();
  if (!t || flat === 'roamies' || flat === 'roamie' || ['ev', 'eve', 'eevee', 'evie'].includes(flat)) return { ok: true, name: '' };
  if (/\s/.test(t)) return { ok: false, why: 'Just one word, please, like Jarvis.' };
  const w = t.replace(/[^\p{L}]/gu, '');
  if (w.length !== t.length) return { ok: false, why: 'Letters only, please.' };
  if (w.length < 4) return { ok: false, why: 'At least 4 letters, so it isn\'t heard by mistake.' };
  if (w.length > 20) return { ok: false, why: "That's a bit long. 20 letters at most." };
  if (COMMON.has(w.toLowerCase())) return { ok: false, why: `"${w}" comes up in everyday talk (or wakes another assistant), so I'd wake by mistake. Pick a name.` };
  return { ok: true, name: w[0].toUpperCase() + w.slice(1).toLowerCase() };
}

/** The name as it's said (for the helpers and for speech): the default is E.V. */
export const wakeName = (config) => config?.wakeName || DEFAULT_WAKE_NAME;
/** The name as it's written on screen and in the prompt: the default is E.V. */
export const wakeDisplay = (config) => config?.wakeName || DEFAULT_WAKE_DISPLAY;

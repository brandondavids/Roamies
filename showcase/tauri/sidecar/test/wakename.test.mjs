// The wake word's name: what can be saved, and why not. Run: npm test
import assert from 'node:assert/strict';
import { DEFAULT_WAKE_DISPLAY, DEFAULT_WAKE_NAME, cleanWakeName, wakeDisplay, wakeName } from '../wakename.mjs';

assert.deepEqual(cleanWakeName('Jarvis'), { ok: true, name: 'Jarvis' });
assert.deepEqual(cleanWakeName('  jarvis '), { ok: true, name: 'Jarvis' });
assert.deepEqual(cleanWakeName('Hey Jarvis'), { ok: true, name: 'Jarvis' }, 'the greeting is dropped');
assert.deepEqual(cleanWakeName('hi, NOVA'), { ok: true, name: 'Nova' });
assert.equal(cleanWakeName('Zoë').ok, false, 'under 4 letters');
assert.deepEqual(cleanWakeName('Chloë'), { ok: true, name: 'Chloë' }, 'letters beyond English');
<<<<<<< Updated upstream
assert.deepEqual(cleanWakeName(''), { ok: true, name: '' }, 'empty: back to E.V.');
assert.deepEqual(cleanWakeName('Eve'), { ok: true, name: '' }, 'E.V. is the assistant\'s own name, not a custom one');
// The name is E.V., said "Ee-vee": every way of typing it means the assistant's own name too.
for (const own of ['E.V.', 'E. V.', 'e.v', 'Eevee', 'Ee-vee', 'ee vee', 'Evie', 'EV']) {
  assert.deepEqual(cleanWakeName(own), { ok: true, name: '' }, `${own} is E.V.`);
}
assert.deepEqual(cleanWakeName('Roamies'), { ok: true, name: '' });
=======
assert.deepEqual(cleanWakeName(''), { ok: true, name: '' }, 'empty: back to the defaults');
assert.deepEqual(cleanWakeName('E.V.'), { ok: true, name: '' }, 'E.V. is a default');
assert.deepEqual(cleanWakeName('Eevee'), { ok: true, name: '' }, 'so is how it is said');
assert.deepEqual(cleanWakeName('EV'), { ok: true, name: '' });
assert.deepEqual(cleanWakeName('Eve'), { ok: true, name: '' });
assert.deepEqual(cleanWakeName('Roamies'), { ok: true, name: '' }, 'Roamies is a default too');
>>>>>>> Stashed changes
assert.deepEqual(cleanWakeName('roamie'), { ok: true, name: '' });
assert.deepEqual(cleanWakeName('Hey Roamies'), { ok: true, name: '' }, 'greeting and all');
for (const bad of ['Bob', 'Mr Jarvis', 'R2D2', 'Jar-vis', 'okay', 'Alexa', 'x'.repeat(21)]) {
  const r = cleanWakeName(bad);
  assert.equal(r.ok, false, `${bad} is refused`);
  assert.ok(r.why.length > 5, 'with a reason');
}
<<<<<<< Updated upstream
assert.equal(wakeName({}), 'E.V.');
=======
assert.equal(wakeName({}), 'Eevee', 'said as Eevee');
>>>>>>> Stashed changes
assert.equal(wakeName({ wakeName: 'Jarvis' }), 'Jarvis');
assert.equal(wakeDisplay({}), 'E.V.', 'written as E.V.');
assert.equal(wakeDisplay({ wakeName: 'Jarvis' }), 'Jarvis');
assert.equal(DEFAULT_WAKE_NAME, 'Eevee');
assert.equal(DEFAULT_WAKE_DISPLAY, 'E.V.');
console.log('wake name tests: passed');

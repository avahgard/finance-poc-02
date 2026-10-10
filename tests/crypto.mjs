import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encryptNote, decryptNote, randomBytes, toBase64Url, fromBase64Url} from '../crypto.js';

test('AES-GCM round trip, fresh salts/IVs, and ciphertext-only envelope', async () => {
  const note = 'Fictional test 11.75 BYN';
  const input = randomBytes(32);
  const first = await encryptNote(note, input);
  const second = await encryptNote(note, input);
  assert.equal(await decryptNote(first, input), note);
  assert.deepEqual(Object.keys(first).sort(), ['ciphertext', 'hkdfSalt', 'iv']);
  assert.equal(fromBase64Url(first.hkdfSalt).length, 32);
  assert.equal(fromBase64Url(first.iv).length, 12);
  assert.equal(fromBase64Url(first.ciphertext).length, new TextEncoder().encode(note).length + 16);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.hkdfSalt, second.hkdfSalt);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.ok(!JSON.stringify(first).includes(note));
});

test('incorrect key material is rejected', async () => {
  const envelope = await encryptNote('Fictional test', randomBytes(32));
  await assert.rejects(decryptNote(envelope, randomBytes(32)), {name: 'OperationError'});
});

test('ciphertext, authentication tag, IV, salt, and truncation tampering are rejected', async () => {
  const input = randomBytes(32);
  const envelope = await encryptNote('Fictional test', input);
  for (const field of ['ciphertext', 'iv', 'hkdfSalt']) {
    const bytes = fromBase64Url(envelope[field]);
    bytes[0] ^= 1;
    await assert.rejects(decryptNote({...envelope, [field]: toBase64Url(bytes)}, input), {name: 'OperationError'});
  }
  const bytes = fromBase64Url(envelope.ciphertext);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(decryptNote({...envelope, ciphertext: toBase64Url(bytes)}, input), {name: 'OperationError'});
  await assert.rejects(decryptNote({...envelope, ciphertext: toBase64Url(bytes.slice(0, 8))}, input), {name: 'OperationError'});
});

// Deliberately tiny test cryptography. NOT production audited.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const AAD = textEncoder.encode('finance-poc-02:aes-gcm:payload:v1');
const INFO = textEncoder.encode('finance-poc-02:hkdf:aes256:v1');
export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
export const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const fromBase64Url = text => {
  const base64 = text.replace(/-/g,'+').replace(/_/g,'/');
  const decoded = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
};

async function deriveKey(prfOutput, salt) {
  const input = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'HKDF',hash:'SHA-256',salt,info:INFO}, input,
    {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
export async function encryptNote(note, prfOutput) {
  const hkdfSalt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveKey(prfOutput, hkdfSalt);
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD}, key, textEncoder.encode(note));
  return {hkdfSalt:toBase64Url(hkdfSalt),iv:toBase64Url(iv),ciphertext:toBase64Url(ciphertext)};
}
export async function decryptNote(envelope, prfOutput) {
  const key = await deriveKey(prfOutput,fromBase64Url(envelope.hkdfSalt));
  const plaintext = await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:fromBase64Url(envelope.iv),additionalData:AAD},key,
    fromBase64Url(envelope.ciphertext)
  );
  return textDecoder.decode(plaintext);
}

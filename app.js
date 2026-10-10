import {openDB,readVault,saveVault} from './db.js';
import {randomBytes,toBase64Url,fromBase64Url,encryptNote,decryptNote} from './crypto.js';

const byId = id => document.getElementById(id);
let vault = null;
let busy = false;
let unlocked = false;
let lockRevision = 0;

function status(message, isError=false) {
  const element = byId('message');
  element.textContent = message;
  element.classList.toggle('error',isError);
}
function lock() {
  lockRevision++;
  unlocked = false;
  byId('secret').textContent = '';
  byId('secret-zone').hidden = true;
  byId('lock-state').textContent = 'Заблокировано';
  byId('lock-state').style.color = '#ffbf8b';
  byId('lock').hidden = true;
  byId('unlock').hidden = false;
}
function showDecrypted(value) {
  unlocked = true;
  byId('secret').textContent = value; // never use innerHTML for user data
  byId('secret-zone').hidden = false;
  byId('lock-state').textContent = 'Разблокировано';
  byId('lock-state').style.color = '#a9eac2';
  byId('lock').hidden = false;
  byId('unlock').hidden = true;
}
function render() {
  const pending = vault?.status === 'pending';
  const ready = !!vault?.envelope;
  byId('enroll-panel').hidden = ready;
  byId('enroll').hidden = pending;
  byId('finish').hidden = !pending;
  byId('unlock-panel').hidden = !ready;
  byId('technical-panel').hidden = !ready;
  if (ready) {
    byId('encrypted').textContent = `${fromBase64Url(vault.envelope.ciphertext).byteLength} байт шифртекста`;
    byId('prf-status').textContent = 'Проверен при создании';
  }
}
function errorText(error) {
  if (error?.name === 'NotAllowedError') return 'Запрос отменён, отклонён системой или истёк тайм-аут. Данные остались заблокированы.';
  if (error?.name === 'NotSupportedError') return 'WebAuthn/PRF недоступен в этом браузере или для выбранного Passkey.';
  if (error?.name === 'SecurityError') return 'Ограничение безопасности WebAuthn. Открой PWA по HTTPS в отдельном окне.';
  if (error?.name === 'OperationError') return 'Не удалось расшифровать данные. Ключ или содержимое не совпадают.';
  return `Ошибка: ${error?.name || 'Unknown'} — ${error?.message || 'Без деталей'}`;
}
async function withBusy(callback) {
  if (busy) return;
  busy = true;
  for (const element of document.querySelectorAll('button')) element.disabled = true;
  try { await callback(); }
  catch (error) {
    lock();
    status(errorText(error),true);
    byId('prf-status').textContent = 'Ошибка / отмена';
  }
  finally {
    busy = false;
    for (const element of document.querySelectorAll('button')) element.disabled = false;
  }
}
function ensureAvailable() {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get || !crypto?.subtle || !window.indexedDB) {
    throw new Error('Secure Context, IndexedDB, WebAuthn и Web Crypto обязательны для этого POC.');
  }
}
async function obtainPRF(credentialId,salt) {
  const credential = await navigator.credentials.get({publicKey: {
    challenge: randomBytes(32),
    allowCredentials:[{type:'public-key',id:fromBase64Url(credentialId)}],
    userVerification:'required',
    timeout:60000,
    extensions:{prf:{eval:{first:salt}}}
  }});
  if (!credential || credential.id !== credentialId) throw new Error('Получен другой Passkey.');
  const output = credential.getClientExtensionResults()?.prf?.results?.first;
  if (!output || new Uint8Array(output).byteLength !== 32) {
    throw new Error('Passkey подтвердился, но PRF не вернул 32-байтный секрет. Этот POC не может безопасно разблокировать данные.');
  }
  return new Uint8Array(output);
}
async function createNew() {
  ensureAvailable();
  if (vault) throw new Error('Тестовая запись или незавершённая регистрация уже существует.');
  status('Шаг 1: создаём Passkey через системный диалог…');
  const prfSalt = randomBytes(32);
  const credential = await navigator.credentials.create({publicKey: {
    challenge:randomBytes(32),
    rp:{name:'Finance POC-02'},
    user:{id:randomBytes(24),name:'local-poc-02',displayName:'Finance POC-02 (test)'},
    pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
    attestation:'none',
    timeout:60000,
    extensions:{prf:{eval:{first:prfSalt}},credProps:true}
  }});
  if (!credential?.id) throw new Error('Passkey не был создан.');
  // No plaintext or encryption key is ever persisted as part of enrollment.
  const pending = {version:1,status:'pending',credentialId:credential.id,
    prfSalt:toBase64Url(prfSalt),createdAt:new Date().toISOString()};
  await saveVault(pending);
  vault = pending;
  render();
  status('Шаг 1 завершён. Введи вымышленную заметку и нажми «Шаг 2» для проверки PRF и шифрования.');
}
async function finishSetup() {
  ensureAvailable();
  if (vault?.status !== 'pending') throw new Error('Сначала создай Passkey.');
  const note = byId('note').value.trim();
  if (!note) throw new Error('Введи вымышленную тестовую запись.');
  status('Шаг 2: подтверди Passkey для получения секрета PRF…');
  const prfResult = await obtainPRF(vault.credentialId,fromBase64Url(vault.prfSalt));
  const envelope = await encryptNote(note,prfResult);
  const candidate = {...vault,status:'ready',envelope};
  const checked = await decryptNote(envelope,prfResult);
  if (checked !== note) throw new Error('Проверка шифрования не прошла.');
  await saveVault(candidate);
  vault = candidate;
  byId('note').value = '';
  lock();
  render();
  status('PASS: тестовая запись зашифрована и сохранена. Нажми «Разблокировать» для независимой проверки.');
}
async function unlock() {
  ensureAvailable();
  if (!vault) throw new Error('Тестовая запись ещё не создана.');
  lock();
  const revision = lockRevision;
  status('Ожидание системного подтверждения Passkey…');
  const prfResult = await obtainPRF(vault.credentialId,fromBase64Url(vault.prfSalt));
  const secret = await decryptNote(vault.envelope,prfResult);
  // A late authentication/decryption must not undo an intervening auto-lock.
  if (revision !== lockRevision || document.hidden) {
    throw new DOMException('Приложение было скрыто или заблокировано во время разблокировки.', 'NotAllowedError');
  }
  showDecrypted(secret);
  byId('prf-status').textContent = 'PASS — PRF + AES-GCM decrypt';
  status('PASS: данные успешно расшифрованы после подтверждения системой.');
}
function installAutoLock() {
  document.addEventListener('visibilitychange', () => { if (document.hidden && unlocked) lock(); });
  window.addEventListener('pagehide',lock);
}
async function installOffline() {
  const online = () => { byId('network').textContent = navigator.onLine ? 'Возможно онлайн' : 'Офлайн'; };
  window.addEventListener('online',online);
  window.addEventListener('offline',online);
  online();
  if (!('serviceWorker' in navigator)) {
    byId('cache').textContent = 'Не поддерживается';
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    const cache = await caches.open('finance-poc-02-static-v1');
    const entries = await cache.keys();
    byId('cache').textContent = entries.length >= 9 ? 'Готов' : 'Кэш неполный';
  } catch (error) {
    byId('cache').textContent = 'Ошибка';
    status(`Ошибка offline-кэша: ${error.message}`,true);
  }
}
async function main() {
  installAutoLock();
  byId('enroll').addEventListener('click',()=>withBusy(createNew));
  byId('finish').addEventListener('click',()=>withBusy(finishSetup));
  byId('unlock').addEventListener('click',()=>withBusy(unlock));
  byId('lock').addEventListener('click',()=>{lock();status('Тестовая запись заблокирована.');});
  byId('support').textContent = (window.isSecureContext && !!window.PublicKeyCredential && !!crypto?.subtle) ? 'API доступны' : 'API недоступны';
  try {
    const db = await openDB();
    db.close();
    vault = await readVault();
    byId('db-status').textContent = 'Работает';
    render();
    status(vault?.status === 'pending' ? 'Passkey уже создан. Введи тестовую заметку и нажми «Шаг 2».' : vault ? 'Зашифрованная запись найдена. Для просмотра нужна разблокировка.' : 'Готово. Создай Passkey для теста.');
  } catch (error) {
    byId('db-status').textContent = 'Ошибка';
    status(errorText(error),true);
  }
  installOffline();
}
main();

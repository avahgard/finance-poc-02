// Desktop logic checks only. WebAuthn is mocked; this cannot establish iPhone PRF support.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.POC02_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const assets = ['index.html', 'app.js', 'crypto.js', 'db.js', 'sw.js', 'styles.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png'};
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = url.pathname === '/finance-poc-02/' ? 'index.html' : url.pathname.replace(/^\/finance-poc-02\//, '');
  if (!assets.includes(file)) { response.writeHead(404); response.end(); return; }
  try {
    response.writeHead(200, {'Content-Type': types[path.extname(file)], 'Cache-Control':'no-cache'});
    response.end(await fs.readFile(path.join(root, file)));
  } catch { response.writeHead(500); response.end(); }
});

async function mockCredentials() {
  // Generated fictional material stays inside this disposable browser context.
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  window.pocMock = {mode:'ok', gets:0, creates:0, key, id};
  Object.defineProperty(navigator, 'credentials', {value: {
    create: async ({publicKey: options}) => {
      if (options.authenticatorSelection.userVerification !== 'required' || options.authenticatorSelection.residentKey !== 'required') throw new Error('Registration requirements missing');
      if (options.rp.id || options.attestation !== 'none') throw new Error('Unexpected RP override or attestation');
      window.pocMock.creates++;
      return {id};
    },
    get: async ({publicKey: options}) => {
      const state = window.pocMock;
      state.gets++;
      if (options.userVerification !== 'required' || options.extensions.prf.eval.first.byteLength !== 32 || options.allowCredentials.length !== 1) throw new Error('PRF assertion requirements missing');
      if (state.mode === 'cancel') throw new DOMException('Fictional cancellation', 'NotAllowedError');
      if (state.mode === 'defer') await new Promise(resolve => { state.release = resolve; });
      const output = state.mode === 'wrong-key' ? crypto.getRandomValues(new Uint8Array(32)) : key;
      return {id: state.mode === 'wrong-id' ? 'different-credential' : id,
        getClientExtensionResults: () => state.mode === 'unsupported' ? {} : {prf:{results:{first:output.buffer}}}};
    }
  }});
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.POC02_URL || `http://127.0.0.1:${server.address().port}/finance-poc-02/`;
  const browser = await chromium.launch({headless:true, ...(process.env.POC02_BROWSER ? {executablePath:process.env.POC02_BROWSER} : {})});
  const context = await browser.newContext();
  await context.addInitScript(mockCredentials);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon.ico')) errors.push('browser console error'); });
  const click = async id => { await page.locator(`#${id}`).click(); await page.waitForFunction(() => !document.getElementById('unlock').disabled); };
  const hidden = async () => {
    assert.equal(await page.locator('#secret').textContent(), '');
    assert.equal(await page.locator('#secret-zone').isVisible(), false);
  };
  const mode = async value => page.evaluate(value => { window.pocMock.mode = value; }, value);
  const record = () => page.evaluate(async () => { const {readVault} = await import('./db.js'); const value = await readVault(); return {status:value.status, keys:Object.keys(value).sort(), envelopeKeys:value.envelope ? Object.keys(value.envelope).sort() : [], hasPlaintext:JSON.stringify(value).includes('Fictional browser test')}; });
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('db-status').textContent === 'Работает' && document.getElementById('cache').textContent === 'Готов');
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    for (const asset of assets) assert.equal((await context.request.get(new URL(asset,url).href)).status(), 200);
    await click('enroll');
    assert.deepEqual(await record(), {status:'pending',keys:['createdAt','credentialId','prfSalt','status','version'],envelopeKeys:[],hasPlaintext:false});
    await page.locator('#note').fill('Fictional browser test');
    await mode('unsupported');
    await click('finish');
    assert.equal((await record()).status, 'pending');
    await hidden();
    assert.ok(!(await page.locator('#message').textContent()).includes('PASS'));
    await mode('ok');
    await click('finish');
    assert.deepEqual(await record(), {status:'ready',keys:['createdAt','credentialId','envelope','prfSalt','status','version'],envelopeKeys:['ciphertext','hkdfSalt','iv'],hasPlaintext:false});
    assert.equal(await page.locator('#note').inputValue(), '');
    await hidden();
    await click('unlock');
    assert.equal(await page.locator('#secret').textContent(), 'Fictional browser test');
    await click('lock');
    await hidden();
    for (const value of ['cancel','unsupported','wrong-key','wrong-id']) {
      await mode(value); await click('unlock'); await hidden();
      assert.ok(!(await page.locator('#message').textContent()).includes('PASS'));
    }
    await mode('ok');
    await click('unlock');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await hidden();
    // A late WebAuthn completion must not undo pagehide auto-lock.
    await mode('defer');
    await page.locator('#unlock').click();
    await page.waitForFunction(() => !!window.pocMock.release);
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.pocMock.release(); });
    await page.waitForFunction(() => !document.getElementById('unlock').disabled);
    await hidden();
    await page.locator('#unlock').click();
    await page.waitForFunction(() => !!window.pocMock.release && document.getElementById('unlock').disabled);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true, value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.pocMock.release();
    });
    await page.waitForFunction(() => !document.getElementById('unlock').disabled);
    await hidden();
    await page.evaluate(() => { delete document.hidden; });
    await mode('ok'); await click('unlock');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true, value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await hidden();
    await page.evaluate(() => { delete document.hidden; });
    // Preserve mock material only in test memory across reload; never print it.
    const mock = await page.evaluate(() => ({id:window.pocMock.id,key:Array.from(window.pocMock.key)}));
    await context.addInitScript(({id,key}) => {
      window.pocMock.id = id;
      // Update the mocked methods after each navigation to use the same fictional credential.
      navigator.credentials.create = async () => ({id});
      navigator.credentials.get = async () => ({id,getClientExtensionResults:()=>({prf:{results:{first:new Uint8Array(key).buffer}}})});
    }, mock);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await page.evaluate(async () => {
      const names = await caches.keys();
      if (names.length !== 1 || names[0] !== 'finance-poc-02-static-v1') return false;
      const cache = await caches.open(names[0]);
      const requests = await cache.keys();
      return requests.length === 9 && requests.every(request => new URL(request.url).pathname.startsWith('/finance-poc-02/'));
    }), true);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('db-status').textContent === 'Работает');
    await hidden();
    await click('unlock');
    assert.equal(await page.locator('#secret').textContent(), 'Fictional browser test');
    await click('lock');
    await page.evaluate(async () => {
      const {readVault,saveVault} = await import('./db.js');
      const {fromBase64Url,toBase64Url} = await import('./crypto.js');
      const value = await readVault();
      const bytes = fromBase64Url(value.envelope.ciphertext); bytes[0] ^= 1;
      value.envelope.ciphertext = toBase64Url(bytes); await saveVault(value);
    });
    await page.reload();
    await page.waitForFunction(() => document.getElementById('db-status').textContent === 'Работает');
    await click('unlock'); await hidden();
    assert.ok(!(await page.locator('#message').textContent()).includes('PASS'));
    assert.deepEqual(errors, []);
    console.log('PASS: desktop mocked WebAuthn logic, actual Web Crypto/IndexedDB, failure paths, subpath assets, and offline shell/reload. iPhone PRF/Face ID/offline unlock: NOT TESTED.');
  } finally { await context.close(); await browser.close(); }
}
run().catch(error => { console.error(`FAIL: ${error.name}\n${error.stack?.split('\n').filter(line => /^\s+at /.test(line)).join('\n') || 'browser check'}`); process.exitCode = 1; }).finally(() => server.close());

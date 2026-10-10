import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base = 'https://avahgard.github.io/finance-poc-02/';
const assets = ['index.html','styles.css','app.js','crypto.js','db.js','sw.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','README.md','.nojekyll'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = new URL('../', import.meta.url);
const home = await fetch(base, {cache:'no-store'});
assert.equal(home.status, 200);
assert.equal(new URL(home.url).protocol, 'https:');
assert.equal(hash(new Uint8Array(await home.arrayBuffer())), hash(await readFile(new URL('index.html', root))));
for (const asset of assets) {
  const response = await fetch(new URL(asset, base), {cache:'no-store'});
  assert.equal(response.status, 200, `${asset} HTTP status`);
  assert.equal(hash(new Uint8Array(await response.arrayBuffer())), hash(await readFile(new URL(asset, root))), `${asset} published bytes`);
  if (asset.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  console.log(`PASS: HTTPS 200 and matching SHA-256: ${asset}`);
}
console.log('PASS: published root and all required assets match validated local source.');

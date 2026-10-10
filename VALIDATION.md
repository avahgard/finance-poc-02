# Finance POC-02 builder validation — 2026-10-10

This isolated fictional-data experiment is not a production security system.

Source archive SHA-256: `13966f4e12e3850b5e79249aac6459f4767a3a2258e08b20bb029004ee8469ae`.
The archive is preserved. POC-01 was not read, modified, or redeployed.

## Results before publication

- PASS: `node --check` for app.js, crypto.js, db.js, sw.js and the test runners.
- PASS: 3 focused Node Web Crypto tests: AES-256-GCM round trip, fresh 32-byte HKDF salts/12-byte IVs, wrong-key rejection, ciphertext/tag/IV/salt tampering and truncated ciphertext rejection.
- PASS: headless desktop Edge browser at `/finance-poc-02/`: actual IndexedDB transactions/persistence, ciphertext-only ready record, metadata-only pending record, no plaintext/key in stored schema, input clearing after save, and locked startup/reload.
- PASS: mocked WebAuthn logic: separate enrollment/PRF actions, required user verification, explicit 32-byte PRF result, canceled request, absent PRF, wrong credential and wrong key all fail closed. Missing PRF never produces a success message or ready encrypted record.
- PASS: regression for late unlock after pagehide and while hidden, manual lock, and visibility auto-lock.
- PASS: relative manifest/start/scope, all static assets, actual Service Worker install/control, nine public-shell cache entries, offline reload, and mocked offline unlock. Corrupted IndexedDB ciphertext stays hidden and does not produce PASS.
- PASS: no runtime JavaScript/console errors in the focused browser campaign; no servers, frameworks, CDN resources or application dependencies added.
- BLOCKED / awaiting real device: iPhone Safari/Home Screen Passkey PRF, OS authentication method, offline unlock after force-close/restart and real system-dialog cancellation. No iPhone PASS is claimed.

## Confirmed defect fixed

`app.js`: an authentication completing after pagehide could undo auto-lock and reveal the note. The browser regression failed on the archive source, then passed with a lock revision and visibility check immediately before displaying the decrypted value. Crypto and WebAuthn requirements were preserved.

`README.md`: deployment address, focused check instructions and limitation boundaries. Added `tests/crypto.mjs`, `tests/browser.cjs`, `tests/verify-live.mjs`, and this report. All other archive files retain their original bytes.

## Reproduce

```text
node --check app.js
node --check crypto.js
node --check db.js
node --check sw.js
node --test tests/crypto.mjs
node tests/browser.cjs
node tests/verify-live.mjs
```

The browser runner uses an already installed Playwright module and desktop browser, configurable through `POC02_PLAYWRIGHT` and `POC02_BROWSER`. It starts a loopback static server for POC-02 only, uses a fresh disposable browser context and generated fictional PRF material, and logs only check results. `POC02_URL=https://avahgard.github.io/finance-poc-02/` selects the published app. No mock credential/key material is shipped in application code or saved to IndexedDB.

## Real iPhone acceptance

Use the complete README test plan in the installed Home Screen app. Record device/iOS version, exact PRF errors, Face ID/device passcode/other method, online reopen, Airplane Mode with Wi-Fi off, force-close/reopen, cancellation while locked, and device restart while offline. Only a real-device PRF output followed by successful authenticated decryption and all persistence/offline/cancellation checks can establish the requested technical acceptance. Unsupported PRF/offline Passkey use is BLOCKED/UNSUPPORTED, not PASS.

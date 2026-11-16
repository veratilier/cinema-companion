import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('service worker intercepts only exact app-shell URLs', async () => {
  const listeners = {};
  const self = {
    registration: { scope: 'https://example.test/cinema/' },
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const caches = { match: async () => undefined, open: async () => ({ put() {} }) };
  vm.runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), { self, URL, Set, caches, fetch: async () => ({ ok: false }) });
  const intercepted = (url) => {
    let handled = false;
    listeners.fetch({ request: { method: 'GET', url }, respondWith() { handled = true; } });
    return handled;
  };
  assert.equal(intercepted('https://example.test/cinema/app.js'), true);
  assert.equal(intercepted('https://example.test/cinema/app.js?token=secret'), false);
  assert.equal(intercepted('https://example.test/cinema/api/user'), false);
  assert.equal(intercepted('https://example.test/cinema/watch/123/stream?ticket=secret'), false);
});

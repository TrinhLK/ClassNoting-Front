import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

it('manual start without a provider uses the API provider so Meet mic gating stays enabled', async () => {
  const code = readFileSync(path.resolve('extension/src/background.js'), 'utf8');
  const startAudioCapture = vi.fn().mockResolvedValue(undefined);
  const tabs = new Map();
  const create = vm.runInNewContext(
    code.slice(code.indexOf('async function tryEnsureSession('), code.indexOf('async function ensureSession(')) + '\ntryEnsureSession',
    {
      getSettings: async () => ({autoStart:false, consent:false}),
      getAuth: async () => ({uid:'u'}), tabs,
      apiFetch: async () => ({ok:true, json:async () => ({sessionId:'s', provider:'meet', startedAt:1000})}),
      persistTabs: vi.fn(), setBadge: vi.fn(), pushSession: vi.fn(), startAudioCapture,
    },
  );
  await expect(create(9, {url:'https://meet.google.com/abc-defg-hij'}, {manual:true})).resolves.toMatchObject({sessionId:'s'});
  expect(startAudioCapture).toHaveBeenCalledWith(9, 's', 'meet');
  expect(tabs.get(9).provider).toBe('meet');
});

it('opens the web tab recorder for the same metadata session and reuses its tab', async () => {
  const code = readFileSync(path.resolve('extension/src/background.js'), 'utf8');
  const tabs = new Map([[9, { sessionId: 'session-a' }]]);
  const createTab = vi.fn(async () => ({ id: 42 }));
  const updateTab = vi.fn();
  const create = vm.runInNewContext(
    code.slice(code.indexOf('async function startAudioCapture('), code.indexOf('\nasync function stopAudioCapture')) + '\nstartAudioCapture',
    { tabs, URLSearchParams, getSettings: async () => ({appOrigin:'https://noting.io.vn'}), setAudioState: vi.fn(), persistTabs: vi.fn(),
      chrome: { tabs: { create: createTab, get: async () => ({id:42}), update: updateTab } },
    },
  );
  await create(9, 'session-a');
  expect(createTab).toHaveBeenCalledWith({url:'https://noting.io.vn/live?extensionSessionId=session-a&capture=tab'});
  await create(9, 'session-a');
  expect(createTab).toHaveBeenCalledOnce();
  expect(updateTab).toHaveBeenCalledWith(42, {active:true});
});

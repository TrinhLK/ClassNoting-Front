import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve('extension/src/content.js'), 'utf8');
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__classNotingCollectorLoaded;
});

it('starts collecting when a session arrives, survives restart, and uses durable message IDs', () => {
  vi.useFakeTimers();
  const messages: any[] = [];
  const listeners: any[] = [];
  const root = document.createElement('div');
  const block = document.createElement('div');
  block.setAttribute('data-message-id', 'spaces/test/messages/123');
  root.append(block);
  vi.stubGlobal('chrome', { runtime: {
    sendMessage: (msg: any, cb: any) => { messages.push(msg); cb?.({}); },
    onMessage: { addListener: (fn: any) => listeners.push(fn) },
  } });
  vi.stubGlobal('ClassNotingShared', { detectProvider: () => 'meet' });
  vi.stubGlobal('ClassNotingPlatforms', { meet: {
    chatRoot: () => root, captionRoot: () => null,
    findChatBlocks: () => [block], parseChatBlock: () => ({ sender: 'An', text: 'Chào' }),
    scrapeRoster: () => [{ id: 'p1', name: 'An' }],
    sampleActiveSpeaker: () => '', microphoneMuted: () => true,
  } });
  (0, eval)(source);
  (0, eval)(source); // declarative and recovery injection must not double-send
  expect(listeners).toHaveLength(1);
  vi.advanceTimersByTime(6000);
  expect(messages.filter(m => m.type === 'CN_EVENTS')).toEqual([]);
  const dispatch = (msg: any) => listeners[0](msg, {}, () => {});
  dispatch({ type: 'CN_SESSION', sessionId: 's1', ownerDisplayName: 'An' });
  vi.advanceTimersByTime(6000);
  const batches = messages.filter(m => m.type === 'CN_EVENTS');
  expect(batches).toHaveLength(1);
  expect(batches[0].events).toEqual(expect.arrayContaining([
    {kind: 'participants', participants: [{id: 'p1', name: 'An'}]},
    {kind: 'chat', messages: [expect.objectContaining({id: 'meet_spaces/test/messages/123', sender: 'An', text: 'Chào'})]},
  ]));
  dispatch({ type: 'CN_STOP' });
  dispatch({ type: 'CN_SESSION', sessionId: 's2', ownerDisplayName: 'An' });
  vi.advanceTimersByTime(2000);
  expect(messages.filter(m => m.type === 'CN_EVENTS')).toHaveLength(2);
});

it('publishes caption identity during continuous speech instead of waiting for silence', async () => {
  vi.useFakeTimers();
  const messages: any[] = [];
  const listeners: any[] = [];
  const root = document.createElement('div');
  root.innerHTML = '<div class="nMcdL"><span>Xin chào</span></div>';
  vi.stubGlobal('chrome', {runtime:{
    sendMessage: (msg: any, cb: any) => {messages.push(msg); cb?.({});},
    onMessage:{addListener:(fn: any) => listeners.push(fn)},
  }});
  vi.stubGlobal('ClassNotingShared', {detectProvider:()=> 'meet'});
  vi.stubGlobal('ClassNotingPlatforms', {meet:{
    chatRoot:()=>null, captionRoot:()=>root, scrapeRoster:()=>[],
    microphoneMuted:()=>false, sampleActiveSpeaker:()=>'',
    parseCaptionNode:()=>({name:'You', text:root.textContent}),
    captionMergeKey:(text: string)=>text,
    shouldMergeCaption:(a: any,b: any)=>b.body.startsWith(a.body),
  }});
  (0,eval)(source);
  listeners[0]({type:'CN_SESSION', sessionId:'s',ownerDisplayName:'An'}, {}, ()=>{});
  const captions = () => messages.flatMap(m=>m.events || []).flatMap(e=>e.captions || []);
  expect(captions()).toEqual([expect.objectContaining({speaker:'An',isSelf:true,text:'Xin chào'})]);
  await vi.advanceTimersByTimeAsync(300);
  root.querySelector('span')!.textContent = 'Xin chào mọi người';
  await vi.advanceTimersByTimeAsync(1);
  expect(captions()).toHaveLength(2);
  expect(captions()[1]).toMatchObject({id:captions()[0].id, speaker:'An',text:'Xin chào mọi người'});
  await vi.advanceTimersByTimeAsync(300);
  root.querySelector('span')!.textContent = 'Chào các bạn'; // Google revises earlier words
  await vi.advanceTimersByTimeAsync(1);
  expect(captions().at(-1)).toMatchObject({start:captions()[0].start, speaker:'An',text:'Chào các bạn'});
});

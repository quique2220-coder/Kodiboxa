import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/participant-navigation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, URLSearchParams };
vm.runInNewContext(compiled, context);
const { participantLocation } = context.exports;
const query = (url) => new URL(url, 'https://example.test').searchParams;

test('selecting an event persists its ID across reload', () => {
  const selected = participantLocation('', { event: 'chosen-event' });
  assert.equal(query(selected).get('event'), 'chosen-event');
  // The next mount gets the same search string from the browser location.
  assert.equal(new URLSearchParams(new URL(selected, 'https://example.test').search).get('event'), 'chosen-event');
});
test('changing tabs retains the selected event and other query parameters', () => {
  const url = participantLocation('?event=chosen-event&tab=now&checkout=success', { tab: 'pass' });
  assert.equal(query(url).get('event'), 'chosen-event');
  assert.equal(query(url).get('tab'), 'pass');
  assert.equal(query(url).get('checkout'), 'success');
});
test('switching events replaces rather than duplicates the ID and retains the tab', () => {
  const url = participantLocation('?event=old-event&tab=schedule', { event: 'new-event' });
  assert.deepEqual(query(url).getAll('event'), ['new-event']);
  assert.equal(query(url).get('tab'), 'schedule');
});
test('pinning a default event while navigating preserves it for reload', () => {
  const url = participantLocation('?tab=now', { event: 'current-event', tab: 'ask' });
  assert.equal(query(url).get('event'), 'current-event');
  assert.equal(query(url).get('tab'), 'ask');
});
test('empty parameters produce the participant route without a dangling query', () => {
  assert.equal(participantLocation('', {}), '/participant');
});

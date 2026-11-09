import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/kode-assistant.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { answerWithKode, KODE_PROMPTS } = context.exports;
const event = { id: 'ev1', title: 'Builder Summit', description: 'A real event description.', location: 'Main Hall', startsAt: '2026-11-10T10:00:00Z' };
const session = { id: 's1', eventId: 'ev1', title: 'Build together', presenterName: 'A presenter', startsAt: '2026-11-10T11:00:00Z', status: 'scheduled' };
const fixture = (overrides = {}) => ({
  preview: false,
  user: { id: 'u1', role: 'participant' },
  events: [event], sessions: [session], registrations: [], announcements: [],
  ...overrides,
});

test('all suggested prompts have specific answers and useful links', () => {
  for (const prompt of KODE_PROMPTS) {
    const response = answerWithKode(prompt, fixture());
    assert.ok(!response.text.startsWith("I can't answer open-ended"));
    assert.ok(response.links.length > 0);
  }
});

test('personal schedule only uses events registered by the current user', () => {
  const ws = fixture({ registrations: [{ userId: 'someone-else', eventId: 'ev1' }] });
  assert.ok(!answerWithKode('My schedule', ws).text.includes(session.title));
  ws.registrations.push({ userId: 'u1', eventId: 'ev1' });
  assert.ok(answerWithKode('My schedule', ws).text.includes(session.title));
});

test('pases do not expose registration codes or someone else’s registrations', () => {
  const response = answerWithKode('Where is my pass?', fixture({
    registrations: [{ userId: 'someone-else', eventId: 'ev1', passCode: 'PRIVATE-CODE' }],
  }));
  assert.match(response.text, /no registrations yet/);
  assert.ok(!response.text.includes('PRIVATE-CODE'));
});

test('anonymous visitors are sent to sign in for personal passes', () => {
  const response = answerWithKode('My pass', fixture({ user: null }));
  assert.ok(response.links.some(l => l.href === '/sign-in'));
});

test('preview data is clearly identified', () => {
  assert.match(answerWithKode('Explore events', fixture({ preview: true, user: null })).text, /^Sample workspace:/);
});

test('live and empty live states are grounded in real workspace data', () => {
  assert.match(answerWithKode("What's live?", fixture()).text, /no live sessions/);
  assert.ok(answerWithKode("What's live?", fixture({ sessions: [{ ...session, status: 'live' }] })).text.includes(session.title));
});

test('participant never gets an admin navigation link', () => {
  assert.ok(!answerWithKode('dashboard', fixture()).links.some(l => l.href === '/dashboard'));
  assert.ok(answerWithKode('dashboard', fixture({ user: { id: 'u1', role: 'admin' } })).links.some(l => l.href === '/dashboard'));
});

test('Ollama and unknown topics never pretend to be generative AI', () => {
  assert.match(answerWithKode('Ollama', fixture()).text, /not connected/);
  assert.match(answerWithKode('write a poem', fixture()).text, /can't answer open-ended/);
});

test('Spanish input still receives English guidance', () => {
  assert.match(answerWithKode('donde esta mi pase', fixture()).text, /You have no registrations/);
});

test('event details link to existing event routes', () => {
  const response = answerWithKode('Builder Summit', fixture());
  assert.ok(response.text.includes(event.description));
  assert.equal(response.links[0].href, '/events/ev1');
});

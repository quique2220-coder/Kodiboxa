import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/caption-recognition.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { captionRecognitionOptions, captionReadiness } = context.exports;

test('a provider connection alone must not show that microphone capture is ready', () => {
  let calls = 0;
  const readiness = captionReadiness(() => { calls++; });
  readiness.sessionStarted();
  assert.equal(calls, 0);
  readiness.audioStarted();
  assert.equal(calls, 1);
  readiness.sessionStarted();
  readiness.audioStarted();
  assert.equal(calls, 1);
});
test('audio may start before the provider session acknowledgment', () => {
  let calls = 0;
  const readiness = captionReadiness(() => { calls++; });
  readiness.audioStarted();
  assert.equal(calls, 0);
  readiness.sessionStarted();
  assert.equal(calls, 1);
});

for (const language of ['en', 'es']) {
  test(`recognizes ${language} as the source, not the translation language`, () => {
    assert.equal(captionRecognitionOptions(language).languageCode, language);
  });
}
test('requires the call microphone rather than silently falling back to another device', () => {
  assert.equal(captionRecognitionOptions('en', 'selected-device').microphone.deviceId.exact, 'selected-device');
  assert.equal(captionRecognitionOptions('es').microphone.deviceId, undefined);
});
test('filters background speech and captures mono speech with gain and echo control', () => {
  const options = captionRecognitionOptions('en');
  assert.equal(options.filterBackgroundAudio, true);
  assert.equal(options.microphone.channelCount, 1);
  assert.equal(options.microphone.echoCancellation, true);
  assert.equal(options.microphone.noiseSuppression, true);
  assert.equal(options.microphone.autoGainControl, true);
});
test('preserves verbatim speech and gives context for product names without rewriting transcripts', () => {
  const options = captionRecognitionOptions('en');
  assert.equal(options.noVerbatim, false);
  assert.ok(options.keyterms.includes('KODELOTH'));
  assert.equal(options.transcriptEdit, undefined);
  assert.equal(options.vadSilenceThresholdSecs, 1.5);
});

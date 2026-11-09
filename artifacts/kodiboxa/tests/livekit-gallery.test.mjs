import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

const source = readFileSync(new URL('../src/lib/livekit-gallery.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { galleryTracks } = context.exports;
const track = (identity, source = 'camera', canPublish = true, isLocal = false) => ({
  source, participant: { identity, isLocal, permissions: { canPublish } },
});
const tracks = [
  track('presenter'), track('presenter', 'screen_share'),
  track('attendee'), track('observer', 'camera', false),
];
test('attendee view excludes the presenter, shared screen and receive-only observers', () => {
  const result = galleryTracks(tracks, 'attendees', 'presenter', 'presenter');
  assert.equal(result.length, 1);
  assert.equal(result[0].participant.identity, 'attendee');
});
test('all-video view retains presenter cameras, attendee cameras and screen sharing', () => {
  assert.equal(galleryTracks(tracks, 'all', 'presenter', 'presenter').length, 3);
});
test('admin observers never get their own empty local tile', () => {
  assert.equal(galleryTracks([track('admin', 'camera', true, true)], 'all', 'admin', 'presenter').length, 0);
});
test('attendees can see their own camera tile', () => {
  assert.equal(galleryTracks([track('attendee', 'camera', true, true)], 'attendees', 'participant', 'presenter').length, 1);
});
test('camera-off placeholders stay visible without a publication', () => {
  const placeholder = track('attendee');
  assert.equal(galleryTracks([placeholder], 'attendees', 'presenter', 'presenter')[0], placeholder);
});
test('leaving the session removes the attendee tile', () => {
  assert.equal(galleryTracks([], 'attendees', 'presenter', 'presenter').length, 0);
});

function renderGallery(view, incoming) {
  const stageSource = readFileSync(new URL('../src/components/livekit-stage.tsx', import.meta.url), 'utf8');
  const stage = { exports: {}, require(name) {
    if (name === 'react') return { ...React, useState: () => [view, () => {}] };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === 'livekit-client') return { Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } } };
    if (name === '@/lib/livekit-gallery') return context.exports;
    if (name === '@livekit/components-react') return {
      useTracks: () => incoming,
      GridLayout: ({ tracks }) => React.createElement('div', {}, `${tracks.length} video tiles`),
      ParticipantTile: () => null,
    };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(stageSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, stage);
  return renderToStaticMarkup(React.createElement(stage.exports.LiveKitStage, { role: 'presenter', presenterId: 'presenter' }));
}
test('attendee gallery renders both view options, media states and camera-off attendees', () => {
  const attendee = track('attendee');
  Object.assign(attendee.participant, { name: 'Guest speaker', isCameraEnabled: false, isMicrophoneEnabled: true });
  const html = renderGallery('attendees', [track('presenter'), attendee]);
  assert.match(html, /All video/);
  assert.match(html, /Attendee cameras/);
  assert.match(html, /Guest speaker/);
  assert.match(html, /Camera off · Microphone on/);
  assert.match(html, /1 attendees connected · 0 cameras on/);
});
test('empty attendee gallery explains that people need to join the live session', () => {
  assert.match(renderGallery('attendees', [track('presenter')]), /No attendees are connected yet/);
});

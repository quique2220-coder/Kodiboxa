# KODIBOXA: live media, caption capture and translation

Apply these checks when a change affects LiveKit, microphone capture, caption
providers, translation, session lifecycle or their UI.

## Media roles and controls

- Presenter and confirmed-attendee tokens may publish camera and microphone.
  Only presenters may publish screen video and screen-share audio.
- Keep token grants aligned with the sources actually requested by the controls.
  Screen-share audio is a separate source from screen video.
- Preserve receive-only admin monitoring, except when that admin is the explicitly
  assigned presenter.
- Keep attendee cameras discoverable in the gallery. Exclude observer placeholders
  from attendee counts and do not mistake camera-off tiles for disconnected attendees.
- Camera, microphone and screen sharing require deliberate user activation.
  Joining, restoring a view, polling or reconnecting must not activate hardware.
- Restore only explicit join intent for the same authenticated user and authorized
  live session. Clear it on leave, session end or identity change.
- Preserve requested microphone noise suppression, echo cancellation and supported
  voice isolation. Do not claim every browser honors these requests.
- Local media operations must not end unrelated tracks. Synthetic test captures
  need independently owned tracks too.

## Caption privacy and lifecycle

- Caption capture requires fresh explicit consent separate from joining the call.
  Reloads and reconnects must not silently resume third-party audio capture.
- Stop the independent caption capture when the call microphone is muted, replaced
  or unpublished, or when the session disconnects, ends or is left.
- Stopping captions must not stop or mute the call microphone.
- Do not equate provider session connection with microphone audio transmission.
  Detect startup failure and distinguish streaming audio from recognized speech.
- Use the selected call microphone when identifiable. Do not silently switch to
  another microphone if a specifically requested device is unavailable.
- Require a clear source-language choice. Keep original recognition separate from
  translation; do not rewrite original speech with a language model to conceal errors.
- Preserve both English-to-Spanish and Spanish-to-English paths.
- Keep committed lines duplicate-safe, ordered and bounded. Handle slow translation,
  queue pressure, failed requests, expired leases and stale requests after Stop/Start.
- Partial drafts must not be presented as committed, shared captions.
- Never expose provider credentials or log audio, transcript content or temporary tokens.
  Retention and recording claims must match actual storage and provider behavior.

## Accessibility and honest status

- Preserve captions without requiring the attendee's camera or microphone.
- Do not advertise ASL interpretation as operational unless a real supported
  interpretation service is connected. Mascot animation is not ASL translation.
- Do not infer distraction, attention, understanding or emotion from camera footage.
  Voluntary check-ins, if implemented, must not turn nonresponse into an attention score.
- Report device or browser limitations clearly rather than silently falling back
  to a fake stream, transcript or successful state.

## Starting points

Inspect `artifacts/api-server/src/lib/livekit.ts`,
`artifacts/api-server/src/lib/captions.ts`,
`artifacts/kodiboxa/src/components/livekit-session.tsx`,
`artifacts/kodiboxa/src/components/livekit-stage.tsx` and
`artifacts/kodiboxa/src/hooks/use-live-captions.ts` as relevant to the diff.

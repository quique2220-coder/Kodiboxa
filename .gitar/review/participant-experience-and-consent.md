# KODIBOXA: participant experience, accessibility and consent

Apply these checks to attendee-facing pages, authentication, KODELOTH, CRM,
communications and voluntary participation features.

## Product boundaries

- Keep interface copy, help and mascot responses in English. Spoken content and
  explicitly selected translations may be English or Spanish.
- The user's mascot is KODELOTH: the blue axolotl with pink gills and the supplied
  hoodie/laptop identity. Do not replace it with unrelated artwork or rename it.
- Login and signup both need the animated mascot and password-privacy reaction.
  Mascot logic must not read, store, log or transmit password values.
- Respect reduced-motion preferences, keyboard access, readable labels and visible
  loading, error, empty and success states.
- Keep participant pages focused on event details, registration, schedule, live
  sessions and passes. Do not expose raw pass hashes or admin-only operational counts.
- Do not hide a real action behind a decorative control or silently replace provider
  failures with mocked answers, successful statuses or demo data.

## Voluntary participation

- If live check-ins or polls are introduced, make participation optional and explain
  who can see the answer before submission.
- Camera or microphone access is not consent to face analysis, gaze tracking,
  recording or third-party transcription.
- Do not classify attendees as distracted or inattentive from camera imagery,
  camera-off state, tab visibility or failure to answer a prompt.
- Do not block attendance, passes or other unrelated functions because an attendee
  skips a voluntary prompt.
- Restrict identified answers and organizer-only results on the server, not just
  through frontend visibility. Never publish a nonresponder list as an attention score.

## CRM and communications

- Event registration is not marketing consent. Keep transactional event messages
  separate from promotional campaigns.
- Email and SMS permissions are independently granted for the specific destination.
  Organizers may record withdrawal, not grant permission on an attendee's behalf.
- Revalidate permission and destination when sending, not only when creating a draft.
  A phone/destination change must not inherit consent for a previous recipient.
- Preserve unsubscribe and archive exclusions during synchronization and delivery.
- A deleted or unavailable source event must leave the campaign audience empty,
  not broaden it to all contacts.
- Protect contacts, exports, integration credentials and webhook destinations with
  server-side authorization. Do not expose private contact details for networking
  without the participant's explicit sharing choice.
- Retries must not send duplicate messages. An unconfigured provider must produce a
  clear unavailable/setup state rather than marking a message delivered.

## Starting points

Review the affected participant/authentication component and follow calls into
`artifacts/api-server/src/lib/crm-contacts.ts`,
`artifacts/api-server/src/lib/crm-campaigns.ts` and
`artifacts/api-server/src/lib/crm-integrations.ts` when those domains are changed.

import type { Workspace } from '@workspace/api-client-react';

export type KodeLink = { label: string; href: string };
export type KodeReply = { text: string; links: KodeLink[] };

export const KODE_GREETING = "I'm KODELOTH, your KODIBOXA guide. I can help with events, schedules, registration and your pass. I use the information available in this app; no AI model is connected yet.";
export const KODE_PROMPTS = ['Explore events', "What's live?", 'My schedule', 'Where is my pass?', 'How do I ask a question?'];
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const date = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Explicitly rule-based, read-only guide. Only the current, server-authorized
 * workspace is supplied. This does not invoke an LLM or execute commands.
 */
export function answerWithKode(text: string, ws: Workspace): KodeReply {
  const q = normalized(text);
  const signedIn = !!ws.user && !ws.preview;
  const participant = '/participant';
  const reply = (message: string, links: KodeLink[] = []): KodeReply => ({
    text: `${ws.preview ? 'Sample workspace: this is example data, not your personal account.\n\n' : ''}${message}`,
    links,
  });
  const link = (label: string, href: string): KodeLink => ({ label, href });
  const ownRegs = signedIn ? ws.registrations.filter(r => r.userId === ws.user!.id) : [];
  const selectedEvent = ws.events.find(e => q.includes(normalized(e.title)));
  const eventSessions = ws.sessions.filter(s => !selectedEvent || s.eventId === selectedEvent.id);
  if (/ollama|inteligencia|modelo|artificial|\bia\b|\bai\b/.test(q)) {
    return reply("I'm currently an interactive guide using rules and KODIBOXA data, not generative AI. Ollama is not connected yet. Your messages are not sent to an external provider.");
  }
  if (/pase|entrada|ticket|\bqr\b|pass/.test(q)) {
    if (!signedIn) return reply('To get your personal pass, sign in, open the Participant view and register for an event. A pass requires a real registration.', [link('Sign in', '/sign-in'), link('Participant view', `${participant}?tab=pass`)]);
    return reply(ownRegs.length
      ? `You have ${ownRegs.length} registration(s). Open My pass, select the event and show your QR at the door. Don't share your pass code in the chat.`
      : 'You have no registrations yet. In the Participant view, select an event and choose Register. Your pass will appear once registration is confirmed.',
    [link('Open my pass', `${participant}?tab=pass`), link('Explore events', '/events')]);
  }
  if (/inscri|registr|register|apuntar|sign up|signup/.test(q)) {
    return reply("Open the Participant view, select an event and choose Register. Sign-in is required. The app checks availability and creates your pass; I don't register you through the chat.", [link('Participant view', participant), ...(!signedIn ? [link('Sign in', '/sign-in')] : [])]);
  }
  if (/pregunt|duda|question|ponente|presentador/.test(q)) {
    return reply("In Participant → Questions, select a session, write your question and submit it. You'll need an account. The presenter's answer will appear there once it is published.", [link('Ask a question', `${participant}?tab=ask`)]);
  }
  if (/anuncio|aviso|novedad|announcement|update/.test(q)) {
    const announcements = ws.announcements.slice(0, 3);
    return reply(announcements.length ? announcements.map(a => `${a.title}\n${a.text}`).join('\n\n') : 'There are no announcements for the events visible to your account.', [link('View updates', `${participant}?tab=updates`)]);
  }
  if (/vivo|live|directo|ahora/.test(q)) {
    const live = eventSessions.filter(s => s.status === 'live');
    return reply(live.length ? `Live sessions:\n${live.map(s => `• ${s.title} — ${s.presenterName || 'Presenter to be confirmed'}`).join('\n')}` : 'There are no live sessions right now among your visible events.', [link("What's on now", participant), link('View schedule', `${participant}?tab=schedule`)]);
  }
  if (/agenda|horario|schedule|sesion|session|proxim|upcoming|timetable/.test(q)) {
    const registeredIds = new Set(ownRegs.map(r => r.eventId));
    const personal = /mi agenda|mis sesiones|my schedule|my sessions/.test(q);
    const sessions = eventSessions
      .filter(s => s.status !== 'ended' && (!personal || registeredIds.has(s.eventId)))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5);
    return reply(sessions.length
      ? `${personal ? 'Sessions for your registered events' : selectedEvent ? `Schedule for ${selectedEvent.title}` : 'Published schedule'}:\n${sessions.map(s => `• ${s.title} — ${date(s.startsAt)}`).join('\n')}\n\nTimes use your browser's time zone.`
      : personal ? 'There are no pending sessions for your registrations. Explore events and register to get started.' : 'There are no upcoming sessions published for this selection.',
    [link('Open schedule', `${participant}?tab=schedule`), link('Explore events', '/events')]);
  }
  if (/admin|participant|dashboard|panel|vista/.test(q)) {
    return reply('The Participant view brings together your events, schedule, questions, updates and pass. Administration is for event management and requires permission. Switching views does not change your role.', [link('Participant view', participant), ...(ws.preview || ws.user?.role === 'admin' ? [link('Administration', '/dashboard')] : [])]);
  }
  if (/evento|event|conferencia|taller/.test(q) || selectedEvent) {
    const events = selectedEvent ? [selectedEvent] : ws.events.slice(0, 5);
    return reply(events.length ? events.map(e => `${e.title}\n${date(e.startsAt)} · ${e.location || 'Location to be confirmed'}\n${selectedEvent ? e.description : ''}`).join('\n\n') : 'There are no events available to your account right now.',
    events.map(e => link(e.title, `/events/${encodeURIComponent(e.id)}`)));
  }
  if (/hola|hello|buenas|gracias|ayuda|help/.test(q)) {
    return reply("Hello! I'm here to help you find your way. Ask about events, what's live, the schedule or how to get your pass.", [link('Explore events', '/events'), link('Participant view', participant)]);
  }
  return reply("I can't answer open-ended questions like an AI model yet. I can help with events, schedules, live sessions, registration, passes, announcements and questions for presenters. Which would you like help with?", [link('Participant view', participant), link('Explore events', '/events')]);
}

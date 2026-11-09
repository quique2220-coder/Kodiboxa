import { useState } from 'react';
import { MessageCircleQuestion, Megaphone, Trash2 } from 'lucide-react';
import type { Question, Session, Announcement } from './_types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Empty, Pill } from './_bits';
import { useCommand, fmtStamp } from './_workspace';

export function QuestionItem({ q, session, canAnswer }: { q: Question; session?: Session; canAnswer: boolean }) {
  const [reply, setReply] = useState('');
  const [open, setOpen] = useState(false);
  const cmd = useCommand();
  return (
    <li className="rise border-b border-border/70 px-5 py-4 last:border-0" data-testid={`row-question-${q.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{q.author}</span>
            {session && <span>on {session.title}</span>}
            <span className="font-mono">{fmtStamp(q.createdAt)}</span>
          </div>
          <p className="mt-1 text-[15px] leading-snug">{q.text}</p>
          {q.answer && (
            <div className="mt-2 border-l-2 border-ok pl-3 text-sm text-muted-foreground"><span className="font-semibold text-ok">Answer </span>{q.answer}</div>
          )}
        </div>
        <Pill status={q.status} />
      </div>
      {canAnswer && q.status === 'open' && (
        open ? (
          <div className="mt-3 flex gap-2">
            <Input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write the answer shown to attendees" data-testid={`input-answer-${q.id}`} />
            <Button disabled={!reply.trim() || cmd.pending} onClick={() => cmd.run({ action: 'answer_question', id: q.id, text: reply.trim() }, () => setOpen(false))} data-testid={`button-submit-answer-${q.id}`}>Answer</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2 -ml-2 text-primary" onClick={() => setOpen(true)} data-testid={`button-answer-${q.id}`}>Answer this</Button>
        )
      )}
    </li>
  );
}

export function QuestionList({ questions, sessions, canAnswer }: { questions: Question[]; sessions: Session[]; canAnswer: (q: Question) => boolean }) {
  if (!questions.length) return <Empty icon={<MessageCircleQuestion className="h-6 w-6" />} title="No questions yet" body="Questions from the floor and the stream land here in real time." />;
  const sorted = [...questions].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  return (
    <ul>
      {sorted.map((q) => <QuestionItem key={q.id} q={q} session={sessions.find((s) => s.id === q.sessionId)} canAnswer={canAnswer(q)} />)}
    </ul>
  );
}

export function AskBox({ sessions }: { sessions: Session[] }) {
  const cmd = useCommand();
  const [sid, setSid] = useState(sessions[0]?.id ?? '');
  const [text, setText] = useState('');
  if (!sessions.length) return null;
  return (
    <div className="space-y-2">
      <select value={sid} onChange={(e) => setSid(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" data-testid="select-ask-session">
        {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}{s.status === 'live' ? ' (live)' : ''}</option>)}
      </select>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question for the presenter" data-testid="input-question" />
      <Button className="w-full" disabled={!text.trim() || !sid || cmd.pending} onClick={() => cmd.run({ action: 'ask_question', sessionId: sid, text: text.trim() }, () => setText(''))} data-testid="button-ask">Send question</Button>
    </div>
  );
}

export function AnnouncementList({ items, canDelete }: { items: Announcement[]; canDelete: boolean }) {
  const cmd = useCommand();
  if (!items.length) return <Empty icon={<Megaphone className="h-6 w-6" />} title="No announcements" body="Room changes, delays and reminders will show here." />;
  return (
    <ul>
      {[...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => (
        <li key={a.id} className="rise flex gap-3 border-b border-border/70 px-5 py-4 last:border-0" data-testid={`row-announcement-${a.id}`}>
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-tape" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{a.title}</div>
            <p className="text-sm text-muted-foreground">{a.text}</p>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{a.author} / {fmtStamp(a.createdAt)}</div>
          </div>
          {canDelete && (
            <Button size="icon" variant="ghost" disabled={cmd.pending} onClick={() => cmd.run({ action: 'delete_announcement', id: a.id })} aria-label="Delete announcement" data-testid={`button-delete-announcement-${a.id}`}><Trash2 className="h-4 w-4" /></Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AnnounceForm({ eventId }: { eventId: string }) {
  const cmd = useCommand();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  return (
    <div className="space-y-2 border-b border-border p-5">
      <Input value={title} maxLength={180} onChange={(e) => setTitle(e.target.value)} placeholder="Headline, e.g. Keynote moved to Hall A" data-testid="input-announcement-title" />
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Details attendees need" data-testid="input-announcement-text" />
      <div className="flex justify-end">
        <Button disabled={!title.trim() || !text.trim() || cmd.pending} onClick={() => cmd.run({ action: 'post_announcement', eventId, title: title.trim(), text: text.trim() }, () => { setTitle(''); setText(''); })} data-testid="button-post-announcement">
          <Megaphone className="mr-2 h-4 w-4" />Broadcast
        </Button>
      </div>
    </div>
  );
}

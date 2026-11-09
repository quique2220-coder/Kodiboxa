import { useEffect, useState } from 'react';
import { Mic2, Play, Square } from 'lucide-react';
import type { Session, Workspace } from '@workspace/api-client-react';
import { WS, PageHeader, Pill, Empty, Panel, SignInToAct } from '@/components/bits';
import { QuestionList } from '@/components/qa';
import { Button } from '@/components/ui/button';
import { useGetLiveKitStatus } from '@workspace/api-client-react';
import { access, useCommand, duration, fmtTime, fmtDay } from '@/lib/workspace';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { LiveKitIntentJanitor, LiveKitSession } from '@/components/livekit-session';

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function Stage({ s, ws, canAct, adminView, assignedToCurrentUser }: { s: Session; ws: Workspace; canAct: boolean; adminView: boolean; assignedToCurrentUser: boolean }) {
  const now = useNow();
  const cmd = useCommand();
  const liveKitStatus = useGetLiveKitStatus();
  const { hour24 } = usePrefs();
  const end = new Date(s.endsAt).getTime();
  const started = s.startedAt ? new Date(s.startedAt).getTime() : null;
  const elapsed = started ? (s.endedAt ? new Date(s.endedAt).getTime() : now) - started : 0;
  const remaining = end - now;
  const over = s.status === 'live' && remaining < 0;
  const qs = ws.questions.filter((q) => q.sessionId === s.id);
  const room = ws.rooms.find((r) => r.id === s.roomId);
  return (
    <section className={cn('rise overflow-hidden rounded-2xl border bg-card shadow-sm', s.status === 'live' ? 'border-live/40' : 'border-card-border')} data-testid={`card-stage-${s.id}`}>
      <div className="grid md:grid-cols-[1fr_300px]">
        <div className="p-6">
          <div className="flex items-center gap-2"><Pill status={s.status} /><span className="font-mono text-xs text-muted-foreground">{fmtDay(s.startsAt)} / {fmtTime(s.startsAt, hour24)} to {fmtTime(s.endsAt, hour24)} / {room?.name}</span></div>
          <h2 className="mt-3 text-2xl font-bold leading-tight">{s.title}</h2>
          {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
          <div className="mt-5 flex gap-2">
            {canAct && s.status === 'scheduled' && <Button className="bg-live text-white hover:bg-live/90" disabled={cmd.pending || liveKitStatus.isLoading || liveKitStatus.isError || !liveKitStatus.data?.configured} onClick={() => cmd.run({ action: 'start_session', id: s.id })} data-testid={`button-go-live-${s.id}`}><Play className="mr-2 h-4 w-4" />Go live</Button>}
            {canAct && s.status === 'live' && <Button variant="outline" disabled={cmd.pending} onClick={() => cmd.run({ action: 'end_session', id: s.id })} data-testid={`button-end-session-${s.id}`}><Square className="mr-2 h-4 w-4" />End session</Button>}
            {!canAct && s.status !== 'ended' && <SignInToAct label="Presenter sign-in required" />}
          </div>
          {canAct && s.status === 'scheduled' && liveKitStatus.data && !liveKitStatus.data.configured && (
            <p className="mt-3 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100" data-testid={`text-livekit-setup-stage-${s.id}`}>
              {liveKitStatus.data.setupMessage}
            </p>
          )}
          {canAct && s.status === 'scheduled' && liveKitStatus.isError && (
            <p className="mt-3 text-xs text-destructive" data-testid={`error-livekit-status-stage-${s.id}`}>LiveKit readiness could not be checked. Verify that the API Server is running.</p>
          )}
        </div>
        <div className={cn('flex flex-col justify-center p-6 text-center', s.status === 'live' ? 'bg-sidebar text-sidebar-foreground' : 'bg-muted/60')}>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">{s.status === 'live' ? (over ? 'over time' : 'remaining') : s.status === 'ended' ? 'ran for' : 'starts at'}</div>
          <div className={cn('mt-1 font-mono text-5xl font-semibold tabular-nums', over && 'text-live')} data-testid={`text-timer-${s.id}`}>
            {s.status === 'live' ? duration(Math.abs(remaining)) : s.status === 'ended' ? duration(elapsed) : fmtTime(s.startsAt, hour24)}
          </div>
          {s.status === 'live' && <div className="mt-2 font-mono text-xs opacity-70">elapsed {duration(elapsed)}</div>}
        </div>
      </div>
      {s.status === 'live' && !ws.preview && (
        <div className="border-t-4 border-live/60 bg-sidebar/5 p-4 sm:p-5" data-testid={`section-presenter-studio-${s.id}`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="onair-dot h-2.5 w-2.5 rounded-full bg-live" />
            <h3 className="font-display text-lg font-bold">{adminView && !assignedToCurrentUser ? 'Live session monitor' : 'Presenter studio'}</h3>
          </div>
          <LiveKitSession session={s} mode={adminView && !assignedToCurrentUser ? 'admin' : 'presenter'} adminTools={adminView} />
        </div>
      )}
      <div className="border-t border-border">
        <div className="px-5 pt-3 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Audience questions / {qs.filter((q) => q.status === 'open').length} open</div>
        <QuestionList questions={qs} sessions={[s]} canAnswer={() => canAct} />
      </div>
    </section>
  );
}

export default function Presenter() {
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        if (!a.preview && !a.isPresenter && !a.isAdmin) return <Empty icon={<Mic2 className="h-6 w-6" />} title="Presenter access only" body="An administrator assigns the presenter role." />;
        const mine = ws.sessions
          .filter((s) => a.preview || a.isAdmin || s.presenterId === a.user?.id)
          .sort((x, y) => (x.status === 'live' ? -1 : 0) - (y.status === 'live' ? -1 : 0) || x.startsAt.localeCompare(y.startsAt));
        return (
          <>
            <LiveKitIntentJanitor sessions={ws.sessions} />
            <PageHeader kicker={a.isAdmin ? 'All sessions (admin view)' : 'Your sessions'} title="Presenter desk" sub="Start on cue, watch the clock, answer the room." />
            {mine.length ? <div className="space-y-5">{mine.map((s) => <Stage key={s.id} s={s} ws={ws} canAct={a.isAdmin || (a.isPresenter && s.presenterId === a.user?.id)} adminView={a.isAdmin} assignedToCurrentUser={s.presenterId === a.user?.id} />)}</div>
              : <Panel><Empty icon={<Mic2 className="h-6 w-6" />} title="No sessions assigned" body="When an organizer assigns you to a session it appears here." /></Panel>}
          </>
        );
      }}
    </WS>
  );
}

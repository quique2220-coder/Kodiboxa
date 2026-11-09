import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, type RoomOptions } from 'livekit-client';
import { useUser } from '@clerk/react';
import type { Session } from '@workspace/api-client-react';
import {
  getGetLiveKitSessionParticipantsQueryKey,
  useCreateLiveKitSessionToken,
  useGetLiveKitSessionParticipants,
  useGetLiveKitStatus,
} from '@workspace/api-client-react';

import '@livekit/components-styles';
import { LiveCaptionsPanel } from '@/components/live-captions-panel';
import { LiveKitStage } from '@/components/livekit-stage';

export const TRANSCRIPTION_TOPIC = 'kodiboxa.transcription.v1';
export const TRANSLATION_TOPIC = 'kodiboxa.translation.v1';

type Mode = 'presenter' | 'participant' | 'admin';

type LiveKitSessionProps = {
  session: Session;
  mode: Mode;
  authorized?: boolean;
  adminTools?: boolean;
};

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: {
    noiseSuppression: true,
    echoCancellation: true,
    voiceIsolation: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

function intentKey(userId: string, sessionId: string) {
  return `kodiboxa.livekit.joined.${userId}.${sessionId}`;
}
function readIntent(userId: string | null | undefined, sessionId: string) {
  if (!userId) return false;
  try { return window.sessionStorage.getItem(intentKey(userId, sessionId)) === '1'; } catch { return false; }
}
function writeIntent(userId: string | null | undefined, sessionId: string, on: boolean) {
  if (!userId) return;
  try {
    if (on) window.sessionStorage.setItem(intentKey(userId, sessionId), '1');
    else window.sessionStorage.removeItem(intentKey(userId, sessionId));
  } catch { /* storage unavailable */ }
}

/** Clears stored join intent for any session the workspace reports as not live. Render from parents that may unmount LiveKitSession. */
export function LiveKitIntentJanitor({ sessions }: { sessions: Pick<Session, 'id' | 'status'>[] }) {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const signature = sessions.filter((s) => s.status !== 'live').map((s) => s.id).join(',');
  useEffect(() => {
    if (!userId || !signature) return;
    for (const id of signature.split(',')) writeIntent(userId, id, false);
  }, [userId, signature]);
  return null;
}

function Controls({ role, onDeviceError }: { role: Mode; onDeviceError: (message: string) => void }) {
  if (role === 'admin') {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70" data-testid="text-livekit-receive-only">
        Admin monitor · viewing only. Camera and microphone are not available for observers.
      </p>
    );
  }
  return (
    <div className="kodi-controls rounded-xl border border-[hsl(var(--tape))]/40 bg-white/[0.05] p-2" data-testid="controls-livekit">
      <ControlBar
        variation="verbose"
        saveUserChoices={false}
        controls={{ camera: true, microphone: true, screenShare: role === 'presenter', chat: false, leave: false, settings: false }}
        onDeviceError={({ source }) =>
          onDeviceError(`${source === Track.Source.ScreenShare ? 'Screen share' : source === Track.Source.Microphone ? 'Microphone' : 'Camera'} access is blocked or unavailable. Allow device permissions in your browser, close other apps using the device, or open this page in a new tab.`)}
      />
    </div>
  );
}

function AdminRoomAttendance({ sessionId }: { sessionId: string }) {
  const participants = useGetLiveKitSessionParticipants(sessionId, {
    query: {
      queryKey: getGetLiveKitSessionParticipantsQueryKey(sessionId),
      refetchInterval: 5000,
    },
  });
  const monitor = participants.data;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.035] p-4" data-testid="panel-livekit-participants">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold text-white">Room attendance</h3>
        <span className="font-mono text-xs text-white/65" data-testid="text-livekit-participant-count">
          {participants.isLoading ? 'Loading…' : `${monitor?.participantCount ?? 0} connected`}
        </span>
      </div>
      {participants.isError ? (
        <p className="mt-3 text-sm text-rose-200" data-testid="error-livekit-participants">Attendance could not be refreshed.</p>
      ) : participants.isLoading ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-white/10" data-testid="skeleton-livekit-participants" />
      ) : monitor?.participants.length ? (
        <ul className="mt-3 divide-y divide-white/10" data-testid="list-livekit-participants">
          {monitor.participants.map((person) => (
            <li key={person.identity} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`row-livekit-participant-${person.identity}`}>
              <span className="font-medium text-white/90">{person.name || person.identity}</span>
              <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/50">
                <span>{person.role}</span>
                {person.cameraEnabled && <span>Camera</span>}
                {person.microphoneEnabled && <span>Mic</span>}
                {person.screenSharing && <span>Screen share</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/60" data-testid="state-livekit-no-participants">No attendees are connected yet.</p>
      )}
    </section>
  );
}

function RoomBody({ role, sessionId, presenterId, adminTools, onDeviceError }: { role: Mode; sessionId: string; presenterId: string | null; adminTools: boolean; onDeviceError: (m: string) => void }) {
  return (
    <div className="space-y-4">
      <RoomAudioRenderer />
      <Controls role={role} onDeviceError={onDeviceError} />
      <LiveKitStage role={role} presenterId={presenterId} />
      <LiveCaptionsPanel sessionId={sessionId} role={role} />
      {(role === 'admin' || (role === 'presenter' && adminTools)) && <AdminRoomAttendance sessionId={sessionId} />}
    </div>
  );
}

export function LiveKitSession({ session, mode, authorized = true, adminTools = false }: LiveKitSessionProps) {
  const status = useGetLiveKitStatus();
  const tokenRequest = useCreateLiveKitSessionToken();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const [credentials, setCredentials] = useState<{ url: string; token: string; role: Mode } | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [closed, setClosed] = useState(false);
  const [joining, setJoining] = useState(false);
  const autoTried = useRef(false);
  const prevUser = useRef<string | null | undefined>(undefined);
  const mutateRef = useRef(tokenRequest.mutateAsync);
  mutateRef.current = tokenRequest.mutateAsync;
  const leaving = useRef(false);
  const mounted = useRef(false);
  const attempt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const isAdmin = mode === 'admin';
  const isLive = session.status === 'live';
  const configured = !!status.data?.configured;
  const actionLabel = mode === 'presenter' ? 'Open presenter studio' : isAdmin ? 'Monitor live session' : 'Join live session';

  const enter = useCallback(async () => {
    setError('');
    setClosed(false);
    setDropped(false);
    if (!isLoaded || !userId) {
      setError('Sign in before joining this live session.');
      return;
    }
    if (!authorized) {
      setError('A confirmed event registration is required to join this session.');
      return;
    }
    if (!configured) {
      setError(status.data?.setupMessage || 'Live streaming is not configured yet.');
      return;
    }
    setJoining(true);
    const requestAttempt = ++attempt.current;
    try {
      const issued = await mutateRef.current({ id: session.id });
      if (!mounted.current || requestAttempt !== attempt.current) return;
      leaving.current = false;
      setConnected(false);
      setCredentials({ url: issued.url, token: issued.token, role: issued.role });
      writeIntent(userId, session.id, true);
    } catch (cause) {
      if (!mounted.current || requestAttempt !== attempt.current) return;
      setError(cause instanceof Error ? cause.message : 'The live session could not be joined. Please try again.');
    } finally {
      if (mounted.current && requestAttempt === attempt.current) setJoining(false);
    }
  }, [authorized, configured, status.data?.setupMessage, session.id, userId, isLoaded]);

  const exit = () => {
    attempt.current += 1;
    leaving.current = true;
    writeIntent(userId, session.id, false);
    setCredentials(null);
    setConnected(false);
    setDropped(false);
    setError('');
    setClosed(true);
    setJoining(false);
  };

  // Auth changes: clear previous user's intent and drop the connection.
  useEffect(() => {
    if (!isLoaded) return;
    if (prevUser.current !== undefined && prevUser.current !== userId) {
      attempt.current += 1;
      if (prevUser.current) writeIntent(prevUser.current, session.id, false);
      leaving.current = true;
      setCredentials(null);
      setConnected(false);
      setJoining(false);
      autoTried.current = true;
    }
    prevUser.current = userId;
  }, [isLoaded, userId, session.id]);

  // Session ended: clear intent and disconnect.
  useEffect(() => {
    if (!isLive || !authorized) {
      attempt.current += 1;
      writeIntent(userId, session.id, false);
      leaving.current = true;
      setCredentials(null);
      setConnected(false);
      setJoining(false);
    }
  }, [isLive, authorized, userId, session.id]);

  // Single auto-rejoin after reload, only with prior explicit intent.
  useEffect(() => {
    if (autoTried.current || !isLoaded || !userId || !isLive || !authorized || status.isLoading) return;
    autoTried.current = true;
    if (!readIntent(userId, session.id)) return;
    if (!configured) { writeIntent(userId, session.id, false); return; }
    void enter();
  }, [isLoaded, userId, isLive, authorized, status.isLoading, configured, session.id, enter]);

  const onConnected = useCallback(() => { setConnected(true); setDropped(false); setError(''); }, []);
  const onDisconnected = useCallback(() => {
    setConnected(false);
    if (leaving.current) return;
    setCredentials(null);
    setDropped(true);
    setError('The live connection ended or could not be established.');
  }, []);
  const onRoomError = useCallback(() => setError('The live session encountered an error. Check your connection and device permissions.'), []);
  const onMediaFailure = useCallback(() => setError('Camera or microphone access is blocked or unavailable. Allow device permissions in your browser, close other apps using the camera, or open this page in a new tab.'), []);
  const roomOptions = useMemo(() => ROOM_OPTIONS, []);

  useEffect(() => {
    if (!credentials || connected) return;
    const timeout = window.setTimeout(() => {
      leaving.current = true;
      setCredentials(null);
      setDropped(true);
      setError('Connection timed out. Select Reconnect to try again.');
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [credentials, connected]);

  if (credentials) {
    const role = credentials.role;
    return (
      <section className="overflow-hidden rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] text-white" data-testid={`panel-livekit-session-${session.id}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.17em] text-white/55" data-testid="status-livekit-connection">
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-amber-400'}`} />
              {connected ? 'Connected' : 'Connecting'}
            </div>
            <h3 className="mt-1 truncate font-display text-lg font-bold">{session.title}</h3>
            <p className="mt-1 text-xs text-white/60">
              {role === 'presenter' ? 'Presenter studio · camera, microphone and screen share' : role === 'admin' ? 'Admin monitor · viewing only' : 'Participant · camera and microphone'}
            </p>
          </div>
          <button type="button" onClick={exit} className="rounded-lg border border-white/25 px-4 py-2 text-xs font-semibold hover:bg-white/10" data-testid={`button-exit-livekit-${session.id}`}>
            Leave session
          </button>
        </header>
        <div className="space-y-3 p-3 sm:p-5">
          {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100" data-testid="error-livekit-connection">{error}</p>}
          {role !== 'admin' && (
            <p className="text-xs leading-relaxed text-white/70" data-testid="text-livekit-camera-help">
              Camera and microphone start off. Use the controls below to turn them on, then allow browser access.
              {' '}Microphone noise reduction, echo cancellation and voice isolation are requested where supported by your browser.
              {' '}<a href={window.location.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[hsl(var(--tape))] underline" data-testid="link-livekit-new-tab">Open in a new tab if device access is blocked.</a>
            </p>
          )}
          <LiveKitRoom
            serverUrl={credentials.url}
            token={credentials.token}
            connect
            audio={false}
            video={false}
            options={roomOptions}
            onConnected={onConnected}
            onDisconnected={onDisconnected}
            onError={onRoomError}
            onMediaDeviceFailure={onMediaFailure}
          >
            <RoomBody role={role} sessionId={session.id} presenterId={session.presenterId} adminTools={adminTools} onDeviceError={setError} />
          </LiveKitRoom>
        </div>
      </section>
    );
  }

  const busy = joining || tokenRequest.isPending;
  return (
    <div className="space-y-2" data-testid={`livekit-entry-${session.id}`}>
      <button
        type="button"
        onClick={() => void enter()}
        disabled={!isLoaded || !userId || status.isLoading || status.isError || !configured || busy || !authorized || !isLive}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-sidebar px-5 text-sm font-semibold text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar/90 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${isAdmin ? 'button-monitor' : mode === 'presenter' ? 'button-presenter-studio' : 'button-join-live'}-${session.id}`}
      >
        {busy ? 'Connecting…' : status.isLoading ? 'Checking stream…' : dropped ? 'Reconnect' : actionLabel}
      </button>
      <p className="text-xs leading-relaxed text-muted-foreground" data-testid="text-livekit-entry-mode">
        {mode === 'presenter'
          ? 'Your assigned session: open the studio to turn on your camera, microphone and screen share.'
          : isAdmin
            ? 'Admin monitoring is receive-only. The assigned presenter must open their studio and enable their camera.'
            : 'Interactive session: join to see the presenter and turn on your own camera and microphone when you are ready.'}
      </p>
      {!authorized && mode === 'participant' && (
        <p className="text-xs text-muted-foreground" data-testid={`text-livekit-registration-required-${session.id}`}>
          Confirmed event registration is required to join.
        </p>
      )}
      {status.data && !status.data.configured && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100" data-testid="text-livekit-setup-message">
          {status.data.setupMessage}
        </p>
      )}
      {status.isError && (
        <p className="text-xs text-destructive" data-testid="error-livekit-status">Streaming availability could not be checked.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="error-livekit-session">
          {error}{dropped && ' Select Reconnect to try again.'}
        </p>
      )}
      {closed && <p className="text-xs text-muted-foreground" data-testid={`text-livekit-left-${session.id}`}>You left this live session.</p>}
    </div>
  );
}

export default LiveKitSession;

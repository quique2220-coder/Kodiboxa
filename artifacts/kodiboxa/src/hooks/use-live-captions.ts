import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import { CommitStrategy, RealtimeEvents, Scribe, type RealtimeConnection } from '@elevenlabs/client';
import { captionReadiness, captionRecognitionOptions } from '@/lib/caption-recognition';
import {
  getGetSessionCaptionsQueryKey,
  heartbeatSessionCaptions,
  publishSessionCaption,
  startSessionCaptions,
  stopSessionCaptions,
  useGetSessionCaptions,
  type SessionCaption,
  type SessionCaptions,
} from '@workspace/api-client-react';

export const CAPTION_TOPIC = 'kodiboxa.translation.v1';
const QUEUE_MAX = 8;
const START_TIMEOUT_MS = 20_000;

export type CaptureStatus = 'idle' | 'starting' | 'running' | 'stopping';
type Lang = 'en' | 'es';
type QueueItem = { segmentId: string; text: string; gen: number };

function isCaption(value: unknown): value is SessionCaption {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.id === 'string' && typeof c.text === 'string' && typeof c.createdAt === 'string'
    && (c.sourceLanguage === 'en' || c.sourceLanguage === 'es')
    && (c.translationStatus === 'pending' || c.translationStatus === 'ready' || c.translationStatus === 'unavailable');
}

function merge(list: SessionCaption[], incoming: SessionCaption) {
  const next = list.filter((c) => c.id !== incoming.id);
  next.push(incoming);
  next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return next.slice(-50);
}

function safeMessage(cause: unknown, fallback: string) {
  let text = '';
  if (cause instanceof Error) text = cause.message;
  else if (cause && typeof cause === 'object') {
    const r = cause as Record<string, unknown>;
    text = typeof r.error === 'string' ? r.error : typeof r.message === 'string' ? r.message : '';
  }
  text = text.replace(/(token|sk_|xi-)[^\s]*/gi, '[redacted]').slice(0, 220).trim();
  return text ? `${fallback} ${text}` : fallback;
}

/** Reads the shared caption feed: polling history + trusted server packets merged by id. */
export function useCaptionFeed(sessionId: string) {
  const queryClient = useQueryClient();
  const room = useRoomContext();
  const queryKey = getGetSessionCaptionsQueryKey(sessionId);
  const feed = useGetSessionCaptions(sessionId, { query: { queryKey, refetchInterval: 3000 } });

  const mergeCaption = useCallback((caption: SessionCaption) => {
    queryClient.setQueryData<SessionCaptions>(getGetSessionCaptionsQueryKey(sessionId), (old) =>
      old ? { ...old, captions: merge(old.captions, caption) } : { captions: [caption], active: true, sourceLanguage: caption.sourceLanguage });
  }, [queryClient, sessionId]);

  useEffect(() => {
    const receive = (data: Uint8Array, participant: unknown, _kind: unknown, topic?: string) => {
      if (topic !== CAPTION_TOPIC || participant !== undefined) return; // trusted server sender only
      if (data.byteLength > 16_384) return;
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
        if (isCaption(parsed)) mergeCaption(parsed);
      } catch { /* ignore malformed packet */ }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [room, mergeCaption]);

  return { feed, mergeCaption };
}

/** Presenter-only capture: Scribe realtime with its own mic capture, gated on the LiveKit mic. */
export function useCaptionCapture(sessionId: string, mergeCaption: (c: SessionCaption) => void) {
  const { localParticipant, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [partial, setPartial] = useState('');
  const [queued, setQueued] = useState(0);

  const gen = useRef(0);
  const conn = useRef<RealtimeConnection | null>(null);
  const lease = useRef<string | null>(null);
  const queue = useRef<QueueItem[]>([]);
  const draining = useRef(false);
  const trackId = useRef<string | null>(null);
  const startTimer = useRef<number | undefined>(undefined);
  const speechTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const mergeRef = useRef(mergeCaption);
  mergeRef.current = mergeCaption;

  const micTrack = () => localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;

  const halt = useCallback((reason: string, isError: boolean) => {
    gen.current += 1;
    window.clearTimeout(startTimer.current);
    window.clearTimeout(speechTimer.current);
    const c = conn.current;
    conn.current = null;
    if (c) { try { c.close(); } catch { /* already closed */ } } // closes Scribe's own tracks only
    queue.current = [];
    trackId.current = null;
    const leaseId = lease.current;
    lease.current = null;
    if (leaseId) void stopSessionCaptions(sessionId, { leaseId }).catch(() => undefined);
    if (!mounted.current) return;
    setPartial('');
    setQueued(0);
    setStatus('idle');
    if (isError) setError(reason); else if (reason) setNotice(reason);
  }, [sessionId]);
  const haltRef = useRef(halt);
  haltRef.current = halt;

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length) {
        const item = queue.current[0];
        const leaseId = lease.current;
        if (item.gen !== gen.current || !leaseId) { queue.current = []; break; }
        try {
          const saved = await publishSessionCaption(sessionId, { leaseId, segmentId: item.segmentId, text: item.text });
          if (item.gen === gen.current) mergeRef.current(saved);
        } catch (cause) {
          if (item.gen === gen.current && mounted.current) {
            haltRef.current(safeMessage(cause, 'Captions stopped because a line could not be shared. Start again when ready.'), true);
          }
        }
        // An old request may finish after Stop -> Start. Never remove a new generation's item.
        if (queue.current[0] === item) queue.current.shift();
        if (mounted.current) setQueued(queue.current.length);
      }
    } finally { draining.current = false; }
  }, [sessionId]);

  const start = useCallback(async (sourceLanguage: Lang) => {
    setError(''); setNotice('');
    const track = micTrack();
    if (connectionState !== ConnectionState.Connected) { setError('Reconnect to the live room before starting captions.'); return; }
    if (!isMicrophoneEnabled || !track || track.readyState !== 'live') { setError('Turn on your LiveKit microphone first, then start captions.'); return; }
    const my = ++gen.current;
    setStatus('starting');
    startTimer.current = window.setTimeout(() => {
      if (gen.current === my) haltRef.current('Captions could not confirm a connection and microphone audio within 20 seconds. Check microphone permission, close other apps using the device, and try again.', true);
    }, START_TIMEOUT_MS);
    try {
      const issued = await startSessionCaptions(sessionId, { sourceLanguage, consent: true });
      if (gen.current !== my) { void stopSessionCaptions(sessionId, { leaseId: issued.leaseId }).catch(() => undefined); return; }
      lease.current = issued.leaseId;
      const current = micTrack();
      if (!current || !current.enabled || current.readyState !== 'live') { haltRef.current('Your microphone turned off before captions started.', true); return; }
      trackId.current = current.id;
      const connection = Scribe.connect({
        ...captionRecognitionOptions(issued.sourceLanguage, current.getSettings().deviceId),
        token: issued.token,
        commitStrategy: CommitStrategy.VAD,
      });
      conn.current = connection;
      const fail = (fallback: string) => (data: unknown) => { if (gen.current === my) haltRef.current(safeMessage(data, fallback), true); };
      let recognized = false;
      const readiness = captionReadiness(() => {
        if (gen.current !== my) return;
        window.clearTimeout(startTimer.current);
        setStatus('running');
        speechTimer.current = window.setTimeout(() => {
          if (gen.current === my && !recognized) setNotice('Microphone audio is streaming, but no words have been recognized. Confirm the spoken language and microphone, speak close to it, and pause briefly after your sentence.');
        }, 15_000);
      });
      const heardWords = (text: string) => {
        if (!text.trim()) return;
        recognized = true;
        window.clearTimeout(speechTimer.current);
        setNotice('');
      };
      connection.on(RealtimeEvents.SESSION_STARTED, readiness.sessionStarted);
      connection.on(RealtimeEvents.AUDIO_STARTED, readiness.audioStarted);
      connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
        if (gen.current !== my) return;
        heardWords(data.text ?? '');
        setPartial(data.text ?? '');
      });
      connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        if (gen.current !== my) return;
        setPartial('');
        const text = (data.text ?? '').trim().slice(0, 2000);
        if (!text) return;
        heardWords(text);
        if (queue.current.length >= QUEUE_MAX) { setNotice('Captions are backed up; a line was dropped.'); return; }
        queue.current.push({ segmentId: crypto.randomUUID(), text, gen: my });
        setQueued(queue.current.length);
        void drain();
      });
      connection.on(RealtimeEvents.AUTH_ERROR, fail('The caption provider rejected the session. Start again.'));
      connection.on(RealtimeEvents.QUOTA_EXCEEDED, fail('The caption provider quota is exhausted. Ask an admin to check ElevenLabs usage.'));
      connection.on(RealtimeEvents.RATE_LIMITED, fail('The caption provider is rate limiting requests. Wait a moment and start again.'));
      connection.on(RealtimeEvents.ERROR, fail('The caption provider reported an error. Captions stopped.'));
      connection.on(RealtimeEvents.CLOSE, () => { if (gen.current === my) haltRef.current('The caption provider closed the connection. Start again when ready.', true); });
    } catch (cause) {
      if (gen.current === my) haltRef.current(safeMessage(cause, 'Captions could not start.'), true);
    }
  }, [connectionState, isMicrophoneEnabled, sessionId, drain]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => halt('Captions stopped. Your microphone in the room is unchanged.', false), [halt]);

  // Stop when the LiveKit mic is muted, unpublished, or replaced, or the room is not connected.
  const active = status === 'starting' || status === 'running';
  useEffect(() => {
    if (!active) return;
    if (connectionState !== ConnectionState.Connected) { haltRef.current('Captions stopped because the room connection was interrupted.', true); return; }
    if (!isMicrophoneEnabled) { haltRef.current('Captions stopped because your microphone was muted.', true); return; }
    const t = microphoneTrack?.track?.mediaStreamTrack;
    if (trackId.current && (!t || t.id !== trackId.current || t.readyState !== 'live')) haltRef.current('Captions stopped because your microphone changed. Start again to use the new device.', true);
  }, [active, connectionState, isMicrophoneEnabled, microphoneTrack]);

  useEffect(() => {
    if (!active) return;
    const onChange = () => haltRef.current('Captions stopped because your microphone changed. Start again to use the new device.', true);
    const onMute = (pub: { source?: Track.Source }) => { if (pub.source === Track.Source.Microphone) haltRef.current('Captions stopped because your microphone was muted.', true); };
    const liveTrack = micTrack();
    const onEnded = () => haltRef.current('Captions stopped because the session microphone ended.', true);
    liveTrack?.addEventListener('ended', onEnded);
    localParticipant.on('localTrackUnpublished', onMute);
    localParticipant.on('trackMuted', onMute);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      localParticipant.off('localTrackUnpublished', onMute);
      localParticipant.off('trackMuted', onMute);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
      liveTrack?.removeEventListener('ended', onEnded);
    };
  }, [active, localParticipant]);

  // Keep the server lease alive (expires after 60s without traffic). Any failure stops capture; no auto-restart.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const leaseId = lease.current;
      if (!leaseId) return;
      const my = gen.current;
      heartbeatSessionCaptions(sessionId, { leaseId }).catch((cause: unknown) => {
        if (gen.current === my) haltRef.current(safeMessage(cause, 'Captions stopped because the server lease could not be renewed. Start again when ready.'), true);
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [active, sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; haltRef.current('', false); };
  }, [sessionId]);

  return { status, error, notice, partial, queued, start, stop, micOn: isMicrophoneEnabled,
    microphoneLabel: microphoneTrack?.track?.mediaStreamTrack.label || 'Browser default microphone',
    clearError: () => setError('') };
}

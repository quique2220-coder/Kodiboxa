import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useCreateSessionDiagnostic, type SessionDiagnosticInput } from '@workspace/api-client-react';
import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

type Report = (event: SessionDiagnosticInput['event'], source: SessionDiagnosticInput['source'], durationMs?: number) => void;
const ignored: Report = () => undefined;
const Diagnostics = createContext<Report>(ignored);
export const useSessionDiagnostic = () => useContext(Diagnostics);

export function useDiagnosticReporter(sessionId: string) {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const mutation = useCreateSessionDiagnostic();
  const send = useRef(mutation.mutateAsync);
  send.current = mutation.mutateAsync;
  const lastSent = useRef(new Map<string, number>());
  const generation = useRef(0);
  const change = useCallback((value: boolean) => {
    enabledRef.current = value;
    generation.current++;
    setEnabled(value); setFailed(false); lastSent.current.clear();
  }, []);
  const report = useCallback<Report>((event, source, durationMs) => {
    if (!enabledRef.current) return;
    const key = `${event}:${source}`;
    const now = Date.now();
    if (now - (lastSent.current.get(key) || 0) < 5000) return;
    lastSent.current.set(key, now);
    const current = generation.current;
    const data: SessionDiagnosticInput = {
      consent: true, event, source,
      ...(durationMs !== undefined && Number.isFinite(durationMs)
        ? { durationMs: Math.min(600000, Math.max(0, Math.round(durationMs))) } : {}),
    };
    // No raw errors, browser/device names, URLs, audio or caption text.
    void send.current({ id: sessionId, data }).then(
      () => { if (current === generation.current) setFailed(false); },
      () => { if (current === generation.current) setFailed(true); },
    );
  }, [sessionId]);
  return { enabled, failed, setEnabled: change, report };
}

export function DiagnosticConsent({ state, dark = false }: { state: ReturnType<typeof useDiagnosticReporter>; dark?: boolean }) {
  return <div className={`rounded-lg border p-3 text-xs ${dark ? 'border-white/10 bg-white/[0.03] text-white/70' : 'border-border bg-muted/40 text-muted-foreground'}`} data-testid="panel-diagnostic-consent">
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={state.enabled} onChange={e => state.setEnabled(e.target.checked)} data-testid="checkbox-technical-diagnostics" />
      <span>Share technical connection diagnostics. Optional: sends connection/device failure categories and caption startup timings. Does not send audio, video, caption text, device names or participant details to Dash0. Turn off to stop future reports.</span>
    </label>
    {state.failed && <p role="status" className="mt-2 text-amber-200" data-testid="status-diagnostic-failure">A diagnostic could not be sent. Your live session is unaffected.</p>}
  </div>;
}

export function SessionConnectionDiagnostics() {
  const room = useRoomContext();
  const report = useSessionDiagnostic();
  useEffect(() => {
    let startedAt = 0;
    const reconnecting = () => { startedAt = performance.now(); report('connection_reconnecting', 'connection'); };
    const reconnected = () => { report('connection_ready', 'connection', startedAt ? performance.now() - startedAt : undefined); startedAt = 0; };
    room.on(RoomEvent.Reconnecting, reconnecting);
    room.on(RoomEvent.Reconnected, reconnected);
    return () => { room.off(RoomEvent.Reconnecting, reconnecting); room.off(RoomEvent.Reconnected, reconnected); };
  }, [room, report]);
  return null;
}

export function SessionDiagnosticsProvider({ report, children }: { report: Report; children: ReactNode }) {
  return <Diagnostics.Provider value={report}>{children}</Diagnostics.Provider>;
}

import { useEffect, useRef, useState } from 'react';
import type { SessionCaption } from '@workspace/api-client-react';
import { useCaptionCapture, useCaptionFeed } from '@/hooks/use-live-captions';
import { useSessionDiagnostic } from '@/components/session-diagnostics';

type View = 'original' | 'en' | 'es' | 'both';
type Lang = 'en' | 'es';
const LANG: Record<Lang, string> = { en: 'English', es: 'Spanish' };
const VIEWS: { id: View; label: string }[] = [
  { id: 'original', label: 'Original' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Spanish' }, { id: 'both', label: 'Both' },
];

function lineFor(c: SessionCaption, view: View) {
  const translated = c.translationStatus === 'ready' && c.translation ? c.translation : null;
  const note = c.translationStatus === 'pending' ? 'Translating…' : c.translationStatus === 'unavailable' ? 'Translation unavailable' : null;
  if (view === 'original') return { main: c.text, sub: null, note: null };
  if (view === 'both') return { main: c.text, sub: translated, note: translated ? null : note };
  if (c.sourceLanguage === view) return { main: c.text, sub: null, note: null };
  return translated ? { main: translated, sub: null, note: null } : { main: c.text, sub: null, note };
}

function Caption({ c, view }: { c: SessionCaption; view: View }) {
  const l = lineFor(c, view);
  const time = new Date(c.createdAt);
  return (
    <li className="rise grid grid-cols-[auto_1fr] gap-x-3" data-testid={`row-caption-${c.id}`}>
      <span className="pt-1 font-mono text-[9px] uppercase tracking-wider text-white/40">
        {Number.isNaN(time.getTime()) ? '' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <div className="min-w-0 border-l-2 border-[hsl(var(--tape))]/70 pl-3">
        <div className="font-mono text-[9px] uppercase tracking-wider text-white/45">{c.speakerName || 'Presenter'} · {c.sourceLanguage.toUpperCase()}</div>
        <p className="text-[15px] leading-snug text-white/95" data-testid={`text-caption-main-${c.id}`}>{l.main}</p>
        {l.sub && <p className="mt-0.5 text-sm leading-snug text-[hsl(var(--lagoon))]" data-testid={`text-caption-translation-${c.id}`}>{l.sub}</p>}
        {l.note && <p className="mt-0.5 font-mono text-[10px] text-amber-200/80" data-testid={`status-caption-translation-${c.id}`}>{l.note}</p>}
      </div>
    </li>
  );
}

function PresenterControls({ sessionId, serverActive, mergeCaption }: { sessionId: string; serverActive: boolean; mergeCaption: (c: SessionCaption) => void }) {
  const cap = useCaptionCapture(sessionId, mergeCaption);
  const report = useSessionDiagnostic();
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (cap.status === 'starting') {
      startedAt.current = performance.now();
      report('captions_starting', 'captions');
    } else if (cap.status === 'running') {
      report('captions_ready', 'captions', startedAt.current === null ? undefined : performance.now() - startedAt.current);
    }
  }, [cap.status, report]);
  useEffect(() => {
    if (cap.error) report('captions_failed', 'captions');
  }, [cap.error, report]);
  const [lang, setLang] = useState<Lang | ''>('');
  const [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false);
  const busy = cap.status === 'starting' || cap.status === 'running';
  const other: Lang = lang === 'en' ? 'es' : 'en';

  return (
    <div className="mt-3 rounded-lg border border-[hsl(var(--tape))]/30 bg-[hsl(var(--tape))]/[0.06] p-3" data-testid="panel-caption-presenter">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-mono text-[10px] uppercase tracking-wider text-white/60" htmlFor="select-caption-source">I am speaking</label>
        <select id="select-caption-source" value={lang} disabled={busy} onChange={(e) => setLang(e.target.value as Lang)}
          className="rounded-md border border-white/20 bg-[hsl(228_36%_10%)] px-2 py-1 text-xs text-white disabled:opacity-50" data-testid="select-caption-source">
          <option value="" disabled>Choose spoken language</option>
          <option value="en">English</option><option value="es">Spanish</option>
        </select>
        {lang && <span className="text-xs text-white/55" data-testid="text-caption-target">translated to {LANG[other]}</span>}
        <div className="ml-auto">
          {busy ? (
            <button type="button" onClick={cap.stop} className="rounded-md bg-[hsl(var(--live))] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110" data-testid="button-caption-stop">
              {cap.status === 'starting' ? 'Cancel start' : 'Stop captions'}
            </button>
          ) : (
            <button type="button" onClick={() => { cap.clearError(); setConsent(false); setAsking(true); }} disabled={!cap.micOn || !lang || asking}
              className="rounded-md bg-[hsl(var(--tape))] px-3 py-1.5 text-xs font-semibold text-[hsl(228_40%_12%)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-caption-start">
              Start captions
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-white/65" data-testid="text-caption-accuracy-help">
        Choose the language you are speaking, not the translation language. Use headphones and speak close to your microphone.
      </p>
      <p className="mt-1 text-[11px] text-white/55" data-testid="text-caption-microphone">
        Microphone: {cap.microphoneLabel}. Background speech filtering is enabled.
      </p>
      {!busy && !cap.micOn && <p className="mt-2 text-xs text-white/60" data-testid="text-caption-mic-required">Turn on your microphone in the controls above to enable captions.</p>}
      {!busy && serverActive && <p className="mt-2 text-xs text-amber-200/90" data-testid="text-caption-server-active">Captions are active in another presenter tab or are still stopping. Stop them in the original tab, or wait up to 60 seconds for an inactive capture to expire. Nothing resumes automatically.</p>}
      {asking && !busy && (
        <div className="mt-3 space-y-2 rounded-md border border-white/15 bg-black/20 p-3 text-xs leading-relaxed text-white/80" data-testid="dialog-caption-consent">
          <p className="font-semibold text-white">Before you start live captions</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Your browser opens a separate microphone capture and streams that audio to ElevenLabs for transcription.</li>
            <li>Transcribed text is sent to OpenAI for {lang ? LANG[lang] : 'the selected language'} to {LANG[other]} translation.</li>
            <li>Captions are shared with everyone in this session and kept temporarily (last 50 lines, about 30 minutes). They are not a recording.</li>
            <li>AI transcription and translation can make mistakes. Service costs may apply.</li>
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[hsl(var(--tape))]" data-testid="checkbox-caption-consent" />
            <span>I understand and consent to start captions for this session.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!consent || !lang} onClick={() => { if (!lang) return; setAsking(false); setConsent(false); void cap.start(lang); }}
              className="rounded-md bg-[hsl(var(--tape))] px-3 py-1.5 font-semibold text-[hsl(228_40%_12%)] disabled:opacity-45" data-testid="button-caption-confirm">Agree and start</button>
            <button type="button" onClick={() => { setAsking(false); setConsent(false); }} className="rounded-md border border-white/20 px-3 py-1.5 hover:bg-white/10" data-testid="button-caption-cancel">Cancel</button>
          </div>
        </div>
      )}
      {cap.status === 'starting' && <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/60" data-testid="status-caption-starting">Connecting and waiting for microphone audio…</p>}
      {cap.status === 'running' && (
        <p className="mt-2 min-h-[1.25rem] text-xs italic text-white/55" data-testid="text-caption-partial">
          {cap.partial ? `Draft (not shared yet): ${cap.partial}` : 'Audio streaming. Speak, then pause briefly to finish a caption.'}{cap.queued > 0 && <span className="ml-2 font-mono not-italic text-white/40">{cap.queued} sending</span>}
        </p>
      )}
      {cap.error && <p role="alert" className="mt-2 rounded-md border border-rose-300/25 bg-rose-400/10 px-2 py-1.5 text-xs text-rose-100" data-testid="error-caption-capture">{cap.error}</p>}
      {cap.notice && !cap.error && <p className="mt-2 text-xs text-white/60" data-testid="text-caption-notice">{cap.notice}</p>}
    </div>
  );
}

export function LiveCaptionsPanel({ sessionId, role }: { sessionId: string; role: 'presenter' | 'participant' | 'admin' }) {
  const { feed, mergeCaption } = useCaptionFeed(sessionId);
  const [view, setView] = useState<View>('both');
  const [help, setHelp] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const data = feed.data;
  const captions = data?.captions ?? [];
  const last = captions[captions.length - 1];
  const report = useSessionDiagnostic();
  const openedAt = useRef(performance.now());
  const firstReported = useRef(false);
  const translationFailure = useRef<string | null>(null);
  useEffect(() => {
    if (captions.length && !firstReported.current) {
      firstReported.current = true;
      report('caption_first_result', 'captions', performance.now() - openedAt.current);
    }
    if (last?.translationStatus === 'unavailable' && translationFailure.current !== last.id) {
      translationFailure.current = last.id;
      report('caption_translation_failed', 'captions');
    }
  }, [captions.length, last?.id, last?.translationStatus, report]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.translationStatus, view]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.035] p-4" data-testid="panel-livekit-captions">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60" data-testid="status-caption-active">
          <span className={`h-2 w-2 rounded-full ${data?.active ? 'onair-dot bg-[hsl(var(--live))]' : 'bg-white/25'}`} />
          {data?.active ? `Captions live · ${data.sourceLanguage === 'es' ? 'ES to EN' : 'EN to ES'}` : 'Captions off'}
        </div>
        <div role="radiogroup" aria-label="Caption language" className="ml-auto flex overflow-hidden rounded-md border border-white/15">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${view === v.id ? 'bg-[hsl(var(--tape))] text-[hsl(228_40%_12%)]' : 'text-white/70 hover:bg-white/10'}`}
              data-testid={`button-caption-view-${v.id}`}>{v.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setHelp((h) => !h)} className="text-[11px] text-white/60 underline-offset-2 hover:underline" data-testid="button-caption-help">
          {help ? 'Hide how-to' : 'How it works'}
        </button>
      </div>

      {help && (
        <ol className="mt-3 list-decimal space-y-1 rounded-md bg-white/[0.04] p-3 pl-7 text-xs leading-relaxed text-white/70" data-testid="text-caption-howto">
          <li>The presenter turns on their microphone, picks the language they speak, and selects Start captions.</li>
          <li>After consenting, spoken lines appear here for everyone, with an automatic English or Spanish translation.</li>
          <li>Choose Original, English, Spanish, or Both above. Your choice only affects your screen.</li>
          <li>Captions stop when the presenter mutes, switches microphone, disconnects, or selects Stop. Restarting always needs a fresh start.</li>
        </ol>
      )}

      {feed.isLoading ? (
        <div className="mt-3 space-y-2" data-testid="skeleton-captions">
          {[72, 54, 64].map((w) => <div key={w} className="h-4 animate-pulse rounded bg-white/10" style={{ width: `${w}%` }} />)}
        </div>
      ) : feed.isError && !data ? (
        <div className="mt-3 flex items-center gap-3 text-xs text-rose-200" data-testid="error-captions">
          Captions could not be loaded.
          <button type="button" onClick={() => void feed.refetch()} className="rounded border border-rose-200/30 px-2 py-0.5 hover:bg-rose-200/10" data-testid="button-captions-retry">Retry</button>
        </div>
      ) : captions.length ? (
        <ul ref={listRef} className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1" aria-live="polite" data-testid="list-captions">
          {captions.map((c) => <Caption key={c.id} c={c} view={view} />)}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-white/55" data-testid="state-captions-empty">
          {data?.active ? 'Captions are on. Lines will appear as the presenter speaks.' : 'No captions yet. They appear here when the presenter starts live captions.'}
        </p>
      )}

      {role === 'presenter' && (
        <PresenterControls sessionId={sessionId} serverActive={!!data?.active} mergeCaption={mergeCaption} />
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/45">
        <span data-testid="text-caption-privacy">Temporary AI transcript: last 50 lines for about 30 minutes, not a recording. May contain errors.</span>
        <span data-testid="text-caption-asl">ASL interpretation: not yet connected.</span>
      </div>
    </section>
  );
}

export default LiveCaptionsPanel;

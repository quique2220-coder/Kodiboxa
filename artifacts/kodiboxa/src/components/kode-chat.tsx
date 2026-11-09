import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { MessageCircle, Send, RotateCcw, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/lib/workspace';
import { answerWithKode, KODE_GREETING, KODE_PROMPTS, type KodeReply } from '@/lib/kode-assistant';
import KodeGills from './kode-gills';
import avatar from '@/assets/kode-studio-avatar.webp';
import './kode-chat.css';

type Message = KodeReply & { id: number; from: 'kode' | 'user' };
const initial = (): Message[] => [{ id: 0, from: 'kode', text: KODE_GREETING, links: [] }];

export default function KodeChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(initial);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const { data: ws, isError } = useWorkspace();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  const scrollArea = useRef<HTMLDivElement>(null);
  const identity = ws?.preview ? 'preview' : ws?.user?.id ?? 'anonymous';

  useEffect(() => {
    clearTimeout(timer.current);
    setMessages(initial());
    setInput('');
    setBusy(false);
    return () => clearTimeout(timer.current);
  }, [identity]);

  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages, busy, open]);

  const reset = () => {
    clearTimeout(timer.current);
    setMessages(initial());
    setBusy(false);
    setInput('');
  };

  const send = (text: string) => {
    const clean = text.trim().slice(0, 800);
    if (!clean || busy) return;
    setInput('');
    setMessages(prev => [...prev.slice(-38), { id: ++sequence.current, from: 'user', text: clean, links: [] }]);
    setBusy(true);
    // Small reading animation, not simulated network or AI inference.
    const response = ws ? answerWithKode(clean, ws) : {
      text: isError ? "I couldn't load the app data. Please try again when the connection is restored." : 'The app data is still loading. Please try again in a moment.',
      links: [],
    };
    timer.current = setTimeout(() => {
      setMessages(prev => [...prev, { id: ++sequence.current, from: 'kode', ...response }]);
      setBusy(false);
    }, 380);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); send(input); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="kode-launcher" data-testid="button-kode-chat" aria-label="Open chat with KODELOTH">
          <span className="kode-launcher-avatar"><KodeGills /></span>
          <span className="hidden sm:block"><strong className="block text-sm">Chat with KODELOTH</strong><span className="block text-[11px] opacity-75">Your event companion</span></span>
          <MessageCircle className="h-4 w-4 sm:ml-2" />
        </button>
      </DialogTrigger>
      <DialogContent className="kode-chat-panel gap-0 overflow-hidden rounded-3xl border-border p-0" data-testid="kode-chat-panel">
        <header className="flex items-center gap-3 border-b border-border bg-muted/50 px-5 py-4 pr-12">
          <img src={avatar} alt="" className="h-11 w-12 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold">KODELOTH, your companion</DialogTitle>
            <DialogDescription className="text-xs">Interactive guide · AI not connected</DialogDescription>
          </div>
          <button onClick={reset} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label="Reset conversation" title="Reset conversation" data-testid="button-reset-chat"><RotateCcw className="h-4 w-4" /></button>
        </header>
        <div className="kode-chat-hero">
          <span className={`kode-hero-art ${busy ? 'kode-is-reading' : focused ? 'kode-is-listening' : 'kode-is-idle'}`} role="img" aria-label="KODELOTH, the axolotl, with a laptop"><KodeGills mode={busy ? 'busy' : focused ? 'focused' : 'idle'} /></span>
          <div><span className="font-mono text-[10px] uppercase tracking-widest text-primary">{busy ? 'Checking the information' : focused ? "I'm listening" : "Let's find your way"}</span><p className="mt-1 text-sm font-semibold">Your event, without the guesswork.</p></div>
        </div>
        <div ref={scrollArea} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with KODELOTH" data-testid="kode-messages">
          {messages.map(m => (
            <div key={m.id} className={m.from === 'user' ? 'ml-8 rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground' : 'mr-5 rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-4 py-3'}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{m.from === 'user' ? 'You' : 'KODELOTH'}</div>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{m.text}</p>
              {!!m.links.length && <div className="mt-3 flex flex-wrap gap-2">{m.links.map(l => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">{l.label}</Link>)}</div>}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />KODELOTH is checking the data…</div>}
        </div>
        <div className="border-t border-border bg-card px-4 pb-4 pt-3">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested questions">
            {KODE_PROMPTS.map(p => <button key={p} onClick={() => send(p)} disabled={busy} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">{p}</button>)}
          </div>
          <form onSubmit={submit} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="kode-message">Message for KODELOTH</label>
            <input id="kode-message" value={input} onChange={e => setInput(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={800} autoComplete="off" placeholder="Ask about your event…" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" data-testid="input-kode-message" />
            <Button type="submit" disabled={busy || !input.trim()} className="h-11 w-11 rounded-xl p-0" aria-label="Send message" data-testid="button-send-kode"><Send className="h-4 w-4" /></Button>
          </form>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3 shrink-0" />Rule-based guide · Temporary history · Never share passwords</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

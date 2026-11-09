import { useQueryClient } from '@tanstack/react-query';
import {
  useGetWorkspace,
  getGetWorkspaceQueryKey,
  useExecuteCommand,
  type CommandInput,
  type Workspace,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function useWorkspace() {
  return useGetWorkspace({ query: { queryKey: getGetWorkspaceQueryKey(), refetchInterval: 5000 } });
}

export function errorMessage(e: unknown): string {
  const x = e as { message?: string; data?: { error?: string; message?: string } } | null;
  return x?.data?.error ?? x?.data?.message ?? x?.message ?? 'Something went wrong';
}

export function useCommand() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useExecuteCommand({
    mutation: {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        qc.invalidateQueries({ predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (key === '/api/room-operations' || key.startsWith('/api/rooms/'));
        } });
        toast({ title: r.message || 'Done' });
      },
      onError: (e) => toast({ title: 'Action not completed', description: errorMessage(e), variant: 'destructive' }),
    },
  });
  return {
    run: (data: CommandInput, onDone?: () => void, onError?: () => void) => m.mutate({ data }, { onSuccess: () => onDone?.(), onError: () => onError?.() }),
    pending: m.isPending,
  };
}

export function access(ws?: Workspace) {
  const user = ws?.user ?? null;
  const signedIn = !!user && !ws?.preview;
  const role = signedIn ? user!.role : null;
  return {
    user,
    signedIn,
    preview: ws?.preview ?? true,
    role,
    isAdmin: role === 'admin',
    isPresenter: role === 'presenter' || role === 'admin',
  };
}

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', o);
export const fmtDate = (s: string) => dtf({ month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s));
export const fmtDay = (s: string) => dtf({ weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(s));
export const fmtTime = (s: string, h24 = false) => dtf({ hour: 'numeric', minute: '2-digit', hour12: !h24 }).format(new Date(s));
export const fmtStamp = (s: string) => dtf({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(s));

export function toLocalInput(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export function duration(ms: number) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${neg ? '-' : ''}${h ? `${h}:` : ''}${p(m)}:${p(sec)}`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

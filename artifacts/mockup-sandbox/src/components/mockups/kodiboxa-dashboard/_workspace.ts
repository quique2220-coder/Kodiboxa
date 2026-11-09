import type { Workspace, CommandInput } from './_types';
import snapshot from './_snapshot.json';

// Isolated, read-only public workspace snapshot for design previews only.
const data = snapshot as unknown as Workspace;
export function useWorkspace() {
  return { data, isLoading: false, isError: false, error: null, refetch: () => undefined };
}
export function useCommand() {
  return { pending: false, run: (_data: CommandInput, _onDone?: () => void) => {
    window.alert('This is a read-only design preview. Use the live KODIBOXA app to make changes.');
  } };
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Preview data unavailable'; }
export function access(ws?: Workspace) {
  const user = ws?.user ?? null;
  const signedIn = !!user && !ws?.preview;
  const role = signedIn ? user!.role : null;
  return { user, signedIn, preview: ws?.preview ?? true, role, isAdmin: role === 'admin', isPresenter: role === 'presenter' || role === 'admin' };
}
const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', o);
export const fmtDate = (s: string) => dtf({ month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s));
export const fmtDay = (s: string) => dtf({ weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(s));
export const fmtTime = (s: string, h24 = false) => dtf({ hour: 'numeric', minute: '2-digit', hour12: !h24 }).format(new Date(s));
export const fmtStamp = (s: string) => dtf({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(s));

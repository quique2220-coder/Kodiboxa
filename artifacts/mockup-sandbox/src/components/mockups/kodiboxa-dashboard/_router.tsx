import { createContext, useContext, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
const Context = createContext<{ location: string; navigate: (s: string) => void }>({ location: '/participant', navigate: () => undefined });
export function PreviewRouter({ children }: { children: ReactNode }) {
  const [location, navigate] = useState('/participant');
  return <Context.Provider value={{ location, navigate }}>{children}</Context.Provider>;
}
export function useLocation(): [string, (s: string) => void] {
  const c = useContext(Context);
  return [c.location.split('?')[0], c.navigate];
}
export function useSearch() { return useContext(Context).location.split('?')[1] ?? ''; }
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useContext(Context);
  return <a {...props} href={href} onClick={e => { e.preventDefault(); onClick?.(e); if (href?.startsWith('/participant')) navigate(href); }} />;
}
export function Redirect(_props: { to: string }) { return null; }
export function QRCodeSVG({ size }: { value: string; size: number; fgColor?: string; bgColor?: string; level?: string }) {
  return <svg width={size} height={size} role="img" aria-label="Read-only pass preview"><rect width="100%" height="100%" fill="#eee" /><text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="12">QR preview only</text></svg>;
}

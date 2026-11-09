import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="dot-grid flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-card-border bg-card text-center shadow-lg">
        <div className="tape-stripe h-3" />
        <div className="p-8">
          <div className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Wrong door</div>
          <div className="mt-2 font-display text-6xl font-extrabold">404</div>
          <p className="mt-2 text-sm text-muted-foreground">This room is not on the floor plan.</p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="link-not-found-home">Back to the lobby</Link>
        </div>
      </div>
    </div>
  );
}

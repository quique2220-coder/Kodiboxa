import Participant from './_RefinedParticipant';
import { PrefsProvider } from './_prefs';
import { PreviewRouter } from './_router';
import './_group.css';
import './_refined.css';

export default function Refined() {
  return (
    <PrefsProvider>
      <PreviewRouter>
        <main className="min-h-screen bg-background p-7 text-foreground">
          <div className="mb-6 rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground">Refined dashboard · extracted from the updated app · read-only sample data</div>
          <Participant />
        </main>
      </PreviewRouter>
    </PrefsProvider>
  );
}

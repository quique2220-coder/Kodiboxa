import { useState } from 'react';
import { GridLayout, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { galleryTracks, isSessionAttendee } from '@/lib/livekit-gallery';

export function LiveKitStage({ role, presenterId }: {
  role: 'admin' | 'presenter' | 'participant';
  presenterId: string | null;
}) {
  const [view, setView] = useState<'all' | 'attendees'>('all');
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ], { onlySubscribed: false });
  const visible = galleryTracks(tracks, view, role, presenterId);
  const attendees = tracks.filter((track) =>
    track.source === Track.Source.Camera && isSessionAttendee(track.participant, presenterId));
  const camerasOn = attendees.filter((track) => track.participant.isCameraEnabled).length;

  return (
    <section className="space-y-3" data-testid="section-livekit-gallery">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Video view" className="flex flex-wrap gap-2">
          {([['all', 'All video'], ['attendees', 'Attendee cameras']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${view === id ? 'border-[hsl(var(--tape))] bg-[hsl(var(--tape))] text-[hsl(228_40%_12%)]' : 'border-white/20 text-white/75 hover:bg-white/10'}`}
              data-testid={`button-video-view-${id}`}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-white/65" aria-live="polite" data-testid="text-attendee-camera-count">
          {attendees.length} attendees connected · {camerasOn} cameras on
        </p>
      </div>
      <div className="relative h-[min(56vh,520px)] min-h-[260px] overflow-hidden rounded-xl border border-white/10 bg-[hsl(228_36%_8%)]" data-testid="grid-livekit-stage">
        {visible.length ? (
          <GridLayout tracks={visible} style={{ height: '100%' }}><ParticipantTile /></GridLayout>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-white/65" data-testid="state-livekit-no-video">
            {view === 'attendees'
              ? 'No attendees are connected yet. Their camera tiles will appear when they join this live session.'
              : 'Waiting for people to join and share video.'}
          </div>
        )}
      </div>
      {view === 'attendees' && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs text-white/65">Attendees control their own camera and microphone. A camera-off tile does not mean the attendee has left.</p>
          {!!attendees.length && (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Connected attendees" data-testid="list-livekit-attendee-media">
              {attendees.map(({ participant }) => (
                <li key={participant.identity} className="rounded-lg border border-white/10 px-3 py-2">
                  <p className="truncate text-sm font-semibold">{participant.name || 'Attendee'}{participant.isLocal ? ' (You)' : ''}</p>
                  <p className="mt-1 text-xs text-white/60">
                    Camera {participant.isCameraEnabled ? 'on' : 'off'} · Microphone {participant.isMicrophoneEnabled ? 'on' : 'off'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

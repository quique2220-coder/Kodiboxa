type GalleryParticipant = {
  identity: string;
  isLocal: boolean;
  permissions?: { canPublish?: boolean };
};

export function isSessionAttendee(participant: GalleryParticipant, presenterId: string | null) {
  return participant.identity !== presenterId && participant.permissions?.canPublish === true;
}

export function galleryTracks<T extends { source: string; participant: GalleryParticipant }>(
  tracks: T[],
  view: 'all' | 'attendees',
  role: 'admin' | 'presenter' | 'participant',
  presenterId: string | null,
) {
  return tracks.filter((track) => {
    if (role === 'admin' && track.participant.isLocal) return false;
    if (track.participant.permissions?.canPublish === false) return false;
    return view === 'all' || (track.source === 'camera' && isSessionAttendee(track.participant, presenterId));
  });
}

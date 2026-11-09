/** Keep attendee context in the URL, without storing credentials or device state. */
export function participantLocation(search: string, change: { event?: string; tab?: string }) {
  const params = new URLSearchParams(search);
  if (change.event !== undefined) params.set('event', change.event);
  if (change.tab !== undefined) params.set('tab', change.tab);
  const query = params.toString();
  return `/participant${query ? `?${query}` : ''}`;
}

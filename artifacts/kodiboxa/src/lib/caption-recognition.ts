/** A connected provider is not proof that the browser is sending microphone audio. */
export function captionReadiness(onReady: () => void) {
  let session = false;
  let audio = false;
  let ready = false;
  const check = () => {
    if (!ready && session && audio) {
      ready = true;
      onReady();
    }
  };
  return {
    sessionStarted: () => { session = true; check(); },
    audioStarted: () => { audio = true; check(); },
  };
}

/** Keep source speech verbatim; translation happens separately on the server. */
export function captionRecognitionOptions(language: 'en' | 'es', deviceId?: string) {
  return {
    modelId: 'scribe_v2_realtime',
    languageCode: language,
    filterBackgroundAudio: true,
    vadSilenceThresholdSecs: 1.5,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 300,
    noVerbatim: false,
    keyterms: ['KODIBOXA', 'KODELOTH', 'LiveKit'],
    microphone: {
      // A plain string is only a preference and can silently select another mic.
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  };
}

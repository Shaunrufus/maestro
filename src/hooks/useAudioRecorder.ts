// src/hooks/useAudioRecorder.ts
// Phase 2 — Real audio recording via expo-av
// Install: npx expo install expo-av
//
// Usage in StudioScreen:
//   const { isRecording, startRecording, stopRecording, recordingUri } = useAudioRecorder();

import { useState, useCallback } from 'react';
import { Audio } from 'expo-av';

export interface RecordingState {
  isRecording:  boolean;
  recordingUri: string | null;
  durationMs:   number;
  error:        string | null;
}

export const useAudioRecorder = () => {
  const [recording,    setRecording   ] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [durationMs,   setDurationMs  ] = useState(0);
  const [isRecording,  setIsRecording ] = useState(false);
  const [error,        setError       ] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request mic permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setError('Microphone permission denied'); return; }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: false,
      });

      // High-quality WAV recording options
      const { recording: rec } = await Audio.Recording.createAsync({
        android: {
          extension:          '.wav',
          outputFormat:       Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder:       Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate:         44100,
          numberOfChannels:   1,
          bitRate:            128000,
        },
        ios: {
          extension:          '.wav',
          outputFormat:       Audio.IOSOutputFormat.LINEARPCM,
          audioQuality:       Audio.IOSAudioQuality.MAX,
          sampleRate:         44100,
          numberOfChannels:   1,
          bitRate:            128000,
          bitDepthHint:       16,
          linearPCMBitDepth:  16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat:   false,
        },
        web: { mimeType: 'audio/wav', bitsPerSecond: 128000 },
      });

      rec.setOnRecordingStatusUpdate(status => {
        if (status.isRecording) setDurationMs(status.durationMillis);
      });

      setRecording(rec);
      setIsRecording(true);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recording) return null;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordingUri(uri);
      setRecording(null);
      setIsRecording(false);

      // Reset audio mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return uri;
    } catch (e: any) {
      setError(e.message ?? 'Failed to stop recording');
      return null;
    }
  }, [recording]);

  return { isRecording, recordingUri, durationMs, error, startRecording, stopRecording };
};

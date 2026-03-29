import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

class AudioService {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;
  private uri: string | null = null;

  async startRecording() {
    try {
      // 1. Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('Permission not granted');

      // 2. Set mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // 3. Create recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async stopRecording() {
    try {
      if (!this.recording) return;

      await this.recording.stopAndUnloadAsync();
      this.uri = this.recording.getURI();
      this.recording = null;
      console.log('Recording stopped. URI:', this.uri);

      return this.uri;
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  }

  async playRecording() {
    try {
      if (!this.uri) return;

      const { sound } = await Audio.Sound.createAsync({ uri: this.uri });
      this.sound = sound;
      await this.sound.playAsync();
      console.log('Playback started');

      this.sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.sound?.unloadAsync();
        }
      });
    } catch (err) {
      console.error('Failed to play recording', err);
    }
  }

  getRecordingStatus() {
    return this.recording;
  }
}

export const audioService = new AudioService();

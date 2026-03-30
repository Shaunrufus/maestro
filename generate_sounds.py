import wave, struct, math, os

def make_wav(filename, freq):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    sample_rate = 44100
    duration_sec = 0.8
    with wave.open(filename, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        for i in range(int(sample_rate * duration_sec)):
            t = float(i) / sample_rate
            # Add simple decay envelope
            env = max(0, 1.0 - (t / duration_sec))
            value = int(32767.0 * math.sin(2.0 * math.pi * freq * t) * env)
            f.writeframes(struct.pack('<h', value))

print("Generating dummy audio samples...")
make_wav('c:/Maestro/assets/sounds/keys.wav', 261.63)       # C4
make_wav('c:/Maestro/assets/sounds/guitar.wav', 164.81)     # E3
make_wav('c:/Maestro/assets/sounds/tabla.wav', 130.81)      # C3
make_wav('c:/Maestro/assets/sounds/flute.wav', 523.25)      # C5
make_wav('c:/Maestro/assets/sounds/sitar.wav', 146.83)      # D3
make_wav('c:/Maestro/assets/sounds/orchestral.wav', 329.63) # E4
print("Done!")

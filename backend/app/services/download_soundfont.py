#!/usr/bin/env python3
"""Download GeneralUser GS SoundFont if not already present."""
import os, sys, urllib.request, zipfile, io

SF2_DIR  = os.path.join(os.path.dirname(__file__), '..', '..', 'soundfonts')
SF2_PATH = os.path.join(SF2_DIR, 'GeneralUser_GS.sf2')

# Direct link to GeneralUser GS v1.471 (smaller, ~30 MB, MIT-compatible license)
SF2_URL = "https://archive.org/download/generaluser-gs-v.-1.471/GeneralUser_GS_v1.471.sf2"

# Fallback: TimGM6mb (~6MB, very small but decent)
SF2_URL_FALLBACK = "https://archive.org/download/timgm-6-mb/TimGM6mb.sf2"
SF2_PATH_FALLBACK = os.path.join(SF2_DIR, 'TimGM6mb.sf2')


def download_soundfont():
    """Download a GM SoundFont for instrument rendering."""
    os.makedirs(SF2_DIR, exist_ok=True)

    # Check if we already have one
    if os.path.isfile(SF2_PATH) and os.path.getsize(SF2_PATH) > 1_000_000:
        print(f"[SoundFont] Already present: {SF2_PATH} ({os.path.getsize(SF2_PATH) / 1e6:.1f} MB)")
        return SF2_PATH

    if os.path.isfile(SF2_PATH_FALLBACK) and os.path.getsize(SF2_PATH_FALLBACK) > 500_000:
        print(f"[SoundFont] Fallback present: {SF2_PATH_FALLBACK}")
        return SF2_PATH_FALLBACK

    # Try downloading GeneralUser GS
    for url, path in [(SF2_URL, SF2_PATH), (SF2_URL_FALLBACK, SF2_PATH_FALLBACK)]:
        try:
            print(f"[SoundFont] Downloading from {url}...")
            req = urllib.request.urlopen(url, timeout=3.0)
            if req.status == 200:
                with open(path, 'wb') as f:
                    f.write(req.read())
                size = os.path.getsize(path)
                print(f"[SoundFont] Downloaded: {path} ({size / 1e6:.1f} MB)")
                return path
            else:
                print(f"[SoundFont] Download failed ({url}): HTTP {req.status}")
        except Exception as e:
            print(f"[SoundFont] Download failed ({url}): {e}")
            continue

    print("[SoundFont] WARNING: No SoundFont available. Falling back to pure synthesis.")
    return None


def get_soundfont_path():
    """Get the path to the best available SoundFont."""
    if os.path.isfile(SF2_PATH):
        return SF2_PATH
    if os.path.isfile(SF2_PATH_FALLBACK):
        return SF2_PATH_FALLBACK
    return download_soundfont()


if __name__ == "__main__":
    path = download_soundfont()
    if path:
        print(f"Ready: {path}")
    else:
        print("No SoundFont downloaded")
        sys.exit(1)

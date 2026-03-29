# MAESTRO — Complete Master Reference
## Single source of truth for AI agents, developers, and future Claude sessions

> **READ THIS FIRST in every new Claude/AI conversation about MAESTRO.**
> Paste this file contents or upload it so the AI has full context instantly.

---

## Project Identity

- **App name**: MAESTRO (change ONLY in `app.json` "displayName" — zero code changes)
- **Type**: Virtual Recording Studio — iOS + Android
- **Target**: Indian market first, then global
- **Vision**: Feel like sitting in a real physical recording studio. No feature compromise.
- **Differentiator vs Suno AI**: Human vocal performance is primary; AI is the coach/engineer, not the generator.
- **GitHub**: `Shaunrufus/maestro`
- **Developer**: Shaun (solo until user traction, then hire/invest)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo SDK 51, TypeScript |
| State | Zustand (`src/store/useStudioStore.ts`) |
| Backend | FastAPI (Python) on Railway |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage (audio files) |
| Auth | Supabase Auth — Google OAuth + email magic link |
| AI / Guru | Anthropic Claude (`claude-sonnet-4-6`) |
| Pitch detection | librosa pyin (backend) |
| Pitch correction | librosa pitch_shift pipeline |
| Payments | Razorpay (India) + Stripe (global, Phase 3) |
| OTA updates | Expo EAS Update |
| CI/CD | GitHub Actions → EAS Build → Railway |

---

## Local Paths

```
C:\Maestro\                          ← Project root
├── App.tsx                          ← Entry point (zero-dep Phase 1 version is active)
├── app.json                         ← App name lives HERE. SDK 51.
├── eas.json                         ← EAS build config
├── package.json
├── src/
│   ├── theme/index.ts               ← All colors, spacing, typography tokens
│   ├── store/useStudioStore.ts      ← Global Zustand state
│   ├── screens/
│   │   ├── StudioScreen.tsx         ← Main studio
│   │   ├── OnboardingScreen.tsx     ← 3-slide intro
│   │   ├── LoginScreen.tsx          ← Google OAuth + email magic link
│   │   ├── GuruScreen.tsx           ← Guru AI chat
│   │   ├── LyricsScreen.tsx         ← Lyrics editor EN/HI/TE
│   │   ├── PaywallScreen.tsx        ← Razorpay subscription
│   │   ├── SupportScreens.tsx       ← MySongs, Discover, Profile
│   │   ├── MultitrackScreen.tsx     ← Phase 3 DAW (Record/Edit/Mix modes)
│   │   ├── CompingScreen.tsx        ← Phase 3 vocal comp editor
│   │   └── MixModeScreen.tsx        ← Phase 3 mix + export
│   ├── navigation/
│   │   ├── AppNavigator.tsx         ← Bottom tabs (authenticated)
│   │   └── AuthNavigator.tsx        ← Onboarding → Login
│   ├── hooks/
│   │   └── useAudioRecorder.ts      ← Real mic recording via expo-av
│   └── services/
│       ├── supabase.ts              ← DB client + helpers (⚠ fill in URL+key)
│       └── autotuneService.ts       ← POST to backend (⚠ fill in BACKEND_URL)
├── backend/
│   ├── Procfile                     ← Railway start command
│   ├── railway.toml                 ← Railway config
│   ├── requirements.txt             ← Python deps
│   └── app/
│       ├── main.py                  ← FastAPI app, all routers registered
│       ├── routes/
│       │   ├── audio_routes.py      ← /audio/autotune, /audio/analyze
│       │   ├── guru_routes.py       ← /guru/chat, /guru/analyze, /guru/lyrics
│       │   └── multitrack_routes.py ← /multitrack/* (Phase 3)
│       └── services/
│           ├── autotune.py          ← librosa pitch correction pipeline
│           ├── guru.py              ← Claude as Guru (4 agents)
│           └── comping.py           ← Vocal comp: score, plan, render, crossfade
```

---

## Three Things to Fill In Before Phase 2 Works

1. **`src/services/supabase.ts`** — replace `SUPABASE_URL` and `SUPABASE_ANON` with your Supabase project values (supabase.com → Settings → API)
2. **`src/services/autotuneService.ts`** — replace `BACKEND_URL` with your Railway URL after deploy
3. **`src/screens/GuruScreen.tsx`** and **`LyricsScreen.tsx`** — replace `GURU_BACKEND` / `BACKEND` with same Railway URL

---

## Monetization

| Plan | Price | What you get |
|------|-------|-------------|
| Free | ₹0 | Keyboard, Guitar, 3 recordings/day |
| Monthly | ₹199/month | All instruments, unlimited recordings, advanced Guru |
| Annual | ₹1,499/year | Same as monthly, save 37% |
| Global | $4.99/month | Same plans via Stripe |

Payment gateway: Razorpay (India). Install `react-native-razorpay` and fill in `PaywallScreen.tsx`.
Note: Razorpay requires a custom Expo build (not plain Expo Go). Run `eas build --profile development`.

---

## AI Agents — Guru Persona

The user NEVER sees "Claude" or any model name. They see only **GURU** — a music teacher persona.

Guru routes internally to 4 agents:

| Agent | Triggered by | Tools it calls |
|-------|-------------|----------------|
| Vocal Coach | After recording, via Guru button | `/guru/analyze` (pitch, timing, energy) |
| Lyrics Guru | Lyrics screen, Guru chat | `/guru/lyrics` (generate, rewrite, translate) |
| Producer | Instrument picker, session setup | `music.suggest_instruments`, `music.arrange_backing` |
| Mix Engineer | Mix Mode screen | `/multitrack/mixdown` |

System prompt key principle: "Preserve musicality and emotion; avoid robotic-sounding results."

---

## Phase Status

### Phase 1 — DONE ✅
- [x] Expo project at `C:\Maestro\` running on Expo Go
- [x] GitHub repo: `Shaunrufus/maestro`
- [x] Supabase project created
- [x] Studio Screen UI (dark aesthetic, glows, waveform, record button, instruments, Guru button)
- [x] Design system in `src/theme/index.ts`
- [x] All Phase 1 component files delivered

### Phase 2 — Files delivered, wiring pending
- [x] Navigation stack (AppNavigator + AuthNavigator)
- [x] Onboarding (3 slides)
- [x] Login (Google OAuth + magic link)
- [x] Guru AI chat screen
- [x] Lyrics Editor (EN/HI/TE, mood selector, AI suggestions)
- [x] Paywall (Razorpay, monthly/annual)
- [x] My Songs, Discover, Profile screens
- [x] useAudioRecorder hook (real mic via expo-av)
- [x] Supabase client + SQL schema
- [x] FastAPI backend (autotune + guru routes)
- [ ] **TODO: Paste Supabase URL + key**
- [ ] **TODO: Deploy backend to Railway + paste URL**
- [ ] **TODO: Configure Razorpay keys**
- [ ] **TODO: Run `npm install` for Phase 2 deps**

### Phase 3 — Files delivered, activate after Phase 2 users
- [x] Zustand global store (`useStudioStore.ts`)
- [x] MultitrackScreen (Record/Edit/Mix modes, track lanes, faders)
- [x] CompingScreen (take lanes, AI best-comp, crossfades, region editor)
- [x] MixModeScreen (EQ preview, genre presets, loudness targets, export)
- [x] Backend: comping.py (score_take, build_comp_plan, render_comp, crossfade)
- [x] Backend: multitrack_routes.py (comp-suggest, render-comp, mixdown)
- [ ] **TODO: Wire real Supabase Storage take fetching in comping routes**
- [ ] **TODO: Add community/challenges screens**
- [ ] **TODO: Duet recording feature**
- [ ] **TODO: Beat maker (drum pads + pattern sequencer)**
- [ ] **TODO: MusicGen AI backing track generation**

---

## Phase 2 Install Commands

Run from `C:\Maestro\`:

```cmd
npx expo install expo-av expo-web-browser expo-auth-session
npx expo install @supabase/supabase-js
npm install react-native-url-polyfill zustand
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

Then replace `App.tsx` with the Phase 2 version (has NavigationContainer + auth gate).

---

## Backend Deploy to Railway

```
1. Push backend/ folder to GitHub (same repo is fine)
2. railway.app → New Project → Deploy from GitHub
3. Select your repo, set Root Directory: backend
4. Add environment variables:
   - ANTHROPIC_API_KEY = sk-ant-... (from console.anthropic.com)
   - SUPABASE_URL = https://YOUR.supabase.co  (optional, for storage)
   - SUPABASE_SERVICE_KEY = ...              (optional, for storage)
5. Deploy. Copy the URL (e.g. https://maestro-backend.railway.app)
6. Paste it into 3 files: autotuneService.ts, GuruScreen.tsx, LyricsScreen.tsx
7. Test: curl https://maestro-backend.railway.app/health
```

---

## OTA Update Commands

```cmd
# Push a JS-only change (no review needed, users get it immediately)
eas update --branch production --message "Fix auto-tune slider"

# Rollback if something breaks
eas update --branch production --republish --group PREVIOUS_GROUP_ID

# Deploy to staging first (beta testers only)
eas update --branch staging --message "Test new Guru UI"
```

---

## DAW Features — Phase 3 Detail (from uploaded report)

### Vocal Comping Workflow
1. User records multiple takes of same section (loop recording)
2. Each take appears as a lane in CompingScreen
3. AI scores each take: pitch_accuracy (35%), timing (25%), energy (20%), presence (20%)
4. AI suggests best comp — selects different takes for different regions
5. Crossfades auto-applied: 5ms on consonants, 15-20ms on vowels
6. User can manually override any region by tapping and reassigning
7. "Render Comp" produces final seamless vocal file

### Crossfade Rules (critical for natural sound)
- Hard consonants (p,t,k,b,d,g): 5ms crossfade
- Soft consonants (s,f,v,z): 8-10ms
- Vowels (a,e,i,o,u): 15-20ms
- Never crossfade mid-breath or mid-word

### Mix Presets
| Preset | Key settings |
|--------|-------------|
| Clean Pop | +2dB hi-shelf, 0.6 compression ratio, 0.2 reverb |
| Lo-Fi | Low-pass 8kHz, tape saturation, vinyl noise |
| Worship | Open hall reverb, soft knee compression, airy highs |
| Bollywood | +3dB mid boost, punchy compression, plate reverb |
| Hip-Hop | +4dB sub, heavy compression, tight room reverb |
| Classical | Minimal processing, natural dynamics, concert hall |

### Loudness Targets
- Spotify: -14 LUFS
- YouTube: -14 LUFS
- Apple Music: -16 LUFS
- Instagram/Reels: -14 LUFS

---

## Revenue Model (for investor conversations)

| Users | Paid (10%) | Monthly net |
|-------|-----------|-------------|
| 2,000 | 200 | ~₹22,000 |
| 15,000 | 1,500 | ~₹1.6L |
| 50,000 | 5,000 | ~₹5.5L |
| 200,000 | 20,000 | ~₹22L |
| Global 50k | 5,000 | ~$18,000 |

---

## Connected Tools & Credentials

| Tool | Purpose | Status |
|------|---------|--------|
| Asana | Task tracking | ✅ Connected. Project GID: `1213838581796437` |
| Supabase | DB + Auth + Storage | ✅ Project created. Need URL+key in code |
| Figma | Design (limited free plan) | ⚠ Free tier — 3 pages only. Design in code instead |
| Railway | Backend hosting | ⏳ Not yet deployed |
| Anthropic | Guru AI (Claude) | ⏳ Need API key from console.anthropic.com |
| Razorpay | Indian payments | ⏳ Need keys from razorpay.com |
| GitHub | Source control | ✅ `Shaunrufus/maestro` |
| Expo EAS | OTA + builds | ⏳ Run `eas login` to connect |
| Google Play | Android store | ⏳ $25 one-time registration |
| Apple App Store | iOS store | ⏳ $99/year enrollment |

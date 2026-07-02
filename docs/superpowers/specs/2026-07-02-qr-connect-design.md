# QR Connect — Design Spec

**Date:** 2026-07-02
**Status:** Draft for review
**Repo:** `Seasons_AIv02` (mobile only — no schema change)

## Goal

Let a user show a **QR code for their profile** and **scan someone else's** to jump straight to that person's profile, where the existing **Connect / Follow** controls take over. QR is a scannable `@handle`.

## Approach (recommended, confirmed)

- **Scan does not auto-connect.** It resolves the scanned handle to a user and **opens that person's `ProfileScreen`**, which already renders Connect/Follow with correct status. This gives consent + context and reuses proven code — no new relationship flow.
- **Payload = the profile URL** `https://seasonz.ai/@<handle>`. Forward-compatible with the future web profiles and with native-camera/universal-link deep-linking later. The in-app scanner just extracts the handle from it (and also tolerates a bare `@handle` / `handle`).

## What already exists (verified)

- **Add actions are done:** `ProfileScreen` (props `{ userId }`) already uses `useConnectionStatus`, `useSendConnectionRequest`, `useIsFollowing`, `useFollow`, `useUnfollow` — it shows the right Connect/Follow state for another user.
- **Navigation:** `goToProfile('other', userId)` in `App.tsx` opens another user's `ProfileScreen`.
- **Handles** are unique (`profiles.handle`), so they're a stable QR payload. (No existing handle→id hook — we add a tiny one.)

## What's new (all Expo Go–compatible, no dev build)

### Dependencies
`npx expo install react-native-qrcode-svg react-native-svg expo-camera` — all supported in Expo Go.

### 1. Handle resolution
A small async helper `resolveHandleToUserId(handle): Promise<string | null>`:
```ts
const { data } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
return data?.id ?? null;
```
(Handles are stored lowercase; normalise the scanned handle to lowercase first.)

### 2. Payload parsing (pure, tested)
`extractHandle(payload: string): string | null` in `src/lib/qrHandle.ts`:
- Accepts `https://seasonz.ai/@growthparent`, `seasonz.ai/@growthparent`, `@growthparent`, or `growthparent`.
- Returns the normalised handle (lowercase, no `@`), or `null` if it's not a Seasonz code (so random QR codes are ignored).
- `buildProfileUrl(handle): string` → `https://seasonz.ai/@<handle>` (used by the QR display).

### 3. "My code" (QR display)
A component showing the current user's avatar + name + `@handle` and a **QR** (`react-native-qrcode-svg`) encoding `buildProfileUrl(handle)`. Copy: "Have someone scan this to find you on Seasonz."

### 4. Scanner
A camera scanner (`expo-camera`, barcode mode) with:
- **Permission handling** — request on open; a clear denied state with a "grant in Settings" path.
- On a successful scan: `extractHandle` → if `null`, ignore (keep scanning). Else `resolveHandleToUserId`:
  - **own handle** → gentle "That's your own code."
  - **unknown** → "No Seasonz profile found for that code."
  - **resolved** → close the scanner and `goToProfile('other', userId)`.
- Debounce so one code fires once.

### 5. Entry point + wiring
- A single **"Let's connect" entry in the profile panel** (connect-themed label) opens a modal with two modes: **My code** / **Scan** (a segmented toggle). The modal is titled "Let's connect".
- The modal is mounted in `App.tsx` (like the other sheets) with an `onOpenProfile` callback wired to `goToProfile('other', id)` so a scan can navigate.
- **One entry point only** for v1 — no Connections-screen scan shortcut (kept focused).

## Error handling / edge cases

- Camera permission denied → explain + Settings deep link; "My code" still works.
- Non-Seasonz QR → ignored (no error spam).
- Own code → friendly message, no self-connect.
- Unknown / deleted handle → "not found" message.
- Simulator has no camera → scanning is device-only; "My code" renders anywhere.

## Testing

- **Pure unit tests** for `extractHandle` (all accepted formats + rejects non-Seasonz strings) and `buildProfileUrl`.
- Scanner, camera permission, and navigation verified by running on a **physical device**.

## Out of scope (future)

- Universal links / app-scheme deep-linking so the phone's native camera opens the app (this v1 uses the in-app scanner).
- Group QR codes / event check-in codes.
- Auto-connect-on-scan (deliberately not doing this).
- vCard / share-sheet export.

## File map (anticipated)

- `package.json` — add `react-native-qrcode-svg`, `react-native-svg`, `expo-camera`.
- `src/lib/qrHandle.ts` (+ test) — `extractHandle`, `buildProfileUrl`.
- `src/hooks/useResolveHandle.ts` (or inline helper) — `resolveHandleToUserId`.
- `src/components/QrCodeCard.tsx` — the "My code" display.
- `src/components/QrScanner.tsx` — the camera scanner + permission states.
- `src/components/QrConnectSheet.tsx` — the modal shell with My code / Scan toggle.
- `src/App.tsx` — profile-panel "QR code" row + mount `QrConnectSheet` with `onOpenProfile`.

## Decisions (locked)

- Profile-panel entry + modal title: **"Let's connect"** (connect-themed).
- **One entry point** (profile panel) for v1 — no Connections scan shortcut.

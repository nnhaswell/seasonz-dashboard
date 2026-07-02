# QR Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user show a QR code for their profile and scan someone else's to open that person's profile (where the existing Connect/Follow controls take over).

**Architecture:** QR payload is `https://seasonz.ai/@<handle>`. A pure helper extracts the handle from a scan; a lookup resolves it to a user id; the scanner navigates to that user's existing `ProfileScreen` (no auto-connect). Reached from a "Let's connect" row in the profile panel opening a My code / Scan modal. Mobile only, no schema change.

**Tech Stack:** React Native/Expo, `react-native-qrcode-svg` + `react-native-svg` (display), `expo-camera` (scan), Supabase, Vitest. All deps are Expo Go–compatible (no dev build).

**Spec:** `docs/superpowers/specs/2026-07-02-qr-connect-design.md`

**Repo:** `Seasons_AIv02` = `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02` (work on branch `feat/qr-connect`).

---

## File Structure

- `package.json` — add `react-native-qrcode-svg`, `react-native-svg`, `expo-camera`.
- Create: `src/lib/qrHandle.ts` (+ `src/lib/qrHandle.test.ts`) — `extractHandle`, `buildProfileUrl`.
- Create: `src/lib/resolveHandle.ts` — `resolveHandleToUserId`.
- Create: `src/components/QrCodeCard.tsx` — "My code" display.
- Create: `src/components/QrScanner.tsx` — camera scanner + permission states.
- Create: `src/components/QrConnectSheet.tsx` — modal shell (My code / Scan toggle).
- Modify: `src/components/index.ts` — export `QrConnectSheet`.
- Modify: `src/App.tsx` — `onLetsConnect` prop + "let's connect" row in `ProfilePanel`; mount `QrConnectSheet`.

Existing pieces reused: `goToProfile('other', userId)` (App.tsx) navigates to another user's `ProfileScreen`, which already renders Connect/Follow. Current-user handle via `useProfile(authUser.id).handle`.

---

## Task 1: Add dependencies

**Files:** `package.json`

- [ ] **Step 1: Install (Expo-pinned versions)**

Run from `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`:
```bash
npx expo install react-native-qrcode-svg react-native-svg expo-camera
```
Expected: all three added to `package.json` dependencies. (`react-native-svg` and `expo-camera` are Expo-SDK modules — they run in Expo Go; no custom dev build needed.)

- [ ] **Step 2: Add the camera permission message to app config (for future dev builds)**

In `app.json`, add the expo-camera plugin under `expo.plugins` (create the array if missing), so a dev build declares the camera usage string. Expo Go already has camera permission, so this is forward-looking:
```json
[
  "expo-camera",
  { "cameraPermission": "Seasonz uses the camera to scan a friend's QR code." }
]
```
Read `app.json` first and merge into the existing `plugins` array; don't clobber other plugins.

- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json app.json
git commit -m "chore(mobile): add qrcode-svg, react-native-svg, expo-camera for QR connect"
```

---

## Task 2: `extractHandle` + `buildProfileUrl` (TDD)

**Files:** Create `src/lib/qrHandle.ts`, Test `src/lib/qrHandle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/qrHandle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractHandle, buildProfileUrl } from './qrHandle';

describe('extractHandle', () => {
  it('reads the handle from a full profile URL', () => {
    expect(extractHandle('https://seasonz.ai/@growthparent')).toBe('growthparent');
  });
  it('reads it without the scheme', () => {
    expect(extractHandle('seasonz.ai/@growthparent')).toBe('growthparent');
  });
  it('reads a bare @handle', () => {
    expect(extractHandle('@growthparent')).toBe('growthparent');
  });
  it('reads a seasonz.ai path without the @', () => {
    expect(extractHandle('https://seasonz.ai/growthparent')).toBe('growthparent');
  });
  it('normalises case and trims', () => {
    expect(extractHandle('  https://seasonz.ai/@GrowthParent  ')).toBe('growthparent');
  });
  it('ignores non-Seasonz codes (no @, no seasonz.ai)', () => {
    expect(extractHandle('https://example.com/foo')).toBeNull();
    expect(extractHandle('just some text')).toBeNull();
    expect(extractHandle('')).toBeNull();
  });
  it('rejects malformed handles', () => {
    expect(extractHandle('@ab')).toBeNull();               // too short
    expect(extractHandle('@' + 'x'.repeat(21))).toBeNull(); // too long
    expect(extractHandle('@bad handle')).toBe(null);        // space → truncated then re-checked
  });
});

describe('buildProfileUrl', () => {
  it('builds the profile URL', () => {
    expect(buildProfileUrl('growthparent')).toBe('https://seasonz.ai/@growthparent');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run src/lib/qrHandle.test.ts`
Expected: FAIL — cannot find module `./qrHandle`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/qrHandle.ts`:
```ts
// Parse a scanned QR payload into a Seasonz handle, and build the shareable URL.

const HANDLE_RE = /^[a-z0-9._]{3,20}$/;

/**
 * Extract a normalised handle from a scanned payload, or null if it isn't a
 * Seasonz code. Accepts `https://seasonz.ai/@handle`, `seasonz.ai/@handle`,
 * `@handle`, and `seasonz.ai/handle`. Random codes (no `@`, no seasonz.ai) → null.
 */
export function extractHandle(payload: string): string | null {
  if (!payload) return null;
  const s = payload.trim();

  let raw: string | null = null;
  const at = s.lastIndexOf('@');
  if (at >= 0) {
    raw = s.slice(at + 1);
  } else if (/seasonz\.ai\//i.test(s)) {
    raw = s.slice(s.lastIndexOf('/') + 1);
  }
  if (raw == null) return null;

  const handle = raw.split(/[/?#\s]/)[0].trim().toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}

/** The shareable profile URL encoded in a user's QR code. */
export function buildProfileUrl(handle: string): string {
  return `https://seasonz.ai/@${handle}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/qrHandle.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/qrHandle.ts src/lib/qrHandle.test.ts
git commit -m "feat(mobile): extractHandle + buildProfileUrl for QR connect"
```

---

## Task 3: `resolveHandleToUserId`

**Files:** Create `src/lib/resolveHandle.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/resolveHandle.ts`:
```ts
import { supabase } from '@/lib/supabase';

/** Resolve a handle to a user id, or null if no such profile. Handles are
 *  stored lowercase. */
export async function resolveHandleToUserId(handle: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle.toLowerCase())
    .maybeSingle();
  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors under `src/` (pre-existing `supabase/functions/` Deno errors are unrelated — ignore).

- [ ] **Step 3: Commit**
```bash
git add src/lib/resolveHandle.ts
git commit -m "feat(mobile): resolveHandleToUserId lookup"
```

---

## Task 4: `QrCodeCard` (My code)

**Files:** Create `src/components/QrCodeCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/QrCodeCard.tsx`:
```tsx
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { useCurrentUser, useProfile } from '@/hooks';
import { buildProfileUrl } from '@/lib/qrHandle';

/** Shows the current user's profile QR (dark modules on white for reliable scanning). */
export function QrCodeCard() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile(user?.id);
  const handle = profile?.handle ?? null;

  return (
    <View style={styles.wrap}>
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>
            {(profile?.display_name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.name}>{profile?.display_name ?? 'you'}</Text>
      {handle && <Text style={styles.handle}>@{handle}</Text>}

      <View style={styles.qrPanel}>
        {handle ? (
          <QRCode value={buildProfileUrl(handle)} size={200} color="#0b0d10" backgroundColor="#ffffff" />
        ) : (
          <Text style={styles.qrEmpty}>Set a username to get your code.</Text>
        )}
      </View>

      <Text style={styles.caption}>Have someone scan this to find you on Seasonz.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: Spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceHigh },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  name: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text, marginTop: 10 },
  handle: { ...Typography.bodySm, color: Colors.textMuted, marginTop: 2 },
  qrPanel: { backgroundColor: '#ffffff', padding: 16, borderRadius: Radius.lg, marginTop: Spacing.lg, alignItems: 'center', justifyContent: 'center', minWidth: 232, minHeight: 232 },
  qrEmpty: { ...Typography.bodySm, color: '#555', textAlign: 'center', maxWidth: 180 },
  caption: { ...Typography.bodySm, color: Colors.textMuted, marginTop: Spacing.lg, textAlign: 'center', maxWidth: 240 },
});
```
NOTE: `react-native-qrcode-svg` ships its own types. If `npx tsc --noEmit` reports "Could not find a declaration file for module 'react-native-qrcode-svg'", add `src/types/react-native-qrcode-svg.d.ts` with `declare module 'react-native-qrcode-svg';` and note it in the commit. Also confirm `useProfile`'s row exposes `avatar_url` and `display_name` (it does — `ProfileRow`); if a field name differs, use the actual one.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors (add the `.d.ts` shim if the QR lib lacks types).

- [ ] **Step 3: Commit**
```bash
git add src/components/QrCodeCard.tsx src/types/react-native-qrcode-svg.d.ts 2>/dev/null; git add src/components/QrCodeCard.tsx
git commit -m "feat(mobile): QrCodeCard (my profile QR)"
```

---

## Task 5: `QrScanner`

**Files:** Create `src/components/QrScanner.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/QrScanner.tsx`:
```tsx
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { useCurrentUser } from '@/hooks';
import { extractHandle } from '@/lib/qrHandle';
import { resolveHandleToUserId } from '@/lib/resolveHandle';

interface Props {
  /** Called with the resolved user id when a valid Seasonz code is scanned. */
  onResolved: (userId: string) => void;
}

export function QrScanner({ onResolved }: Props) {
  const { data: user } = useCurrentUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // fire once per code

  async function onBarcodeScanned({ data }: { data: string }) {
    if (lock.current || busy) return;
    const handle = extractHandle(data);
    if (!handle) return; // ignore non-Seasonz codes, keep scanning
    lock.current = true;
    setBusy(true);
    setMessage(null);
    const id = await resolveHandleToUserId(handle);
    setBusy(false);
    if (!id) {
      setMessage(`No Seasonz profile found for @${handle}.`);
      setTimeout(() => { lock.current = false; }, 1200);
      return;
    }
    if (id === user?.id) {
      setMessage('That’s your own code.');
      setTimeout(() => { lock.current = false; }, 1200);
      return;
    }
    onResolved(id);
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to scan a code.</Text>
        {permission.canAskAgain ? (
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnTxt}>Allow camera</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.permBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.permBtnTxt}>Open Settings</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View style={styles.reticle} pointerEvents="none" />
      <Text style={styles.hint}>Point at a Seasonz QR code</Text>
      {busy && <View style={styles.busy}><ActivityIndicator color="#fff" /></View>}
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  camera: { width: 260, height: 260, borderRadius: Radius.lg, overflow: 'hidden' },
  reticle: { position: 'absolute', top: 20, width: 220, height: 220, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  hint: { ...Typography.bodySm, color: Colors.textMuted, marginTop: Spacing.md },
  busy: { position: 'absolute', top: 118, alignSelf: 'center' },
  message: { ...Typography.bodySm, color: Colors.season.past, marginTop: 8, textAlign: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.md },
  permText: { ...Typography.bodySm, color: Colors.textMuted, textAlign: 'center', maxWidth: 220 },
  permBtn: { backgroundColor: Colors.accent, borderRadius: Radius.full, paddingVertical: 12, paddingHorizontal: 22 },
  permBtnTxt: { color: Colors.accentInk, fontFamily: 'Inter_700Bold', fontSize: 14 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors. (`CameraView`, `useCameraPermissions` are exported by `expo-camera`.)

- [ ] **Step 3: Commit**
```bash
git add src/components/QrScanner.tsx
git commit -m "feat(mobile): QrScanner (camera + permissions + resolve)"
```

---

## Task 6: `QrConnectSheet` (modal shell)

**Files:** Create `src/components/QrConnectSheet.tsx`, Modify `src/components/index.ts`

- [ ] **Step 1: Write the component**

Create `src/components/QrConnectSheet.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { QrCodeCard } from './QrCodeCard';
import { QrScanner } from './QrScanner';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Navigate to a scanned user's profile. */
  onOpenProfile: (userId: string) => void;
}

export function QrConnectSheet({ visible, onClose, onOpenProfile }: Props) {
  const [mode, setMode] = useState<'code' | 'scan'>('code');

  // Reset to "My code" each time it opens.
  useEffect(() => { if (visible) setMode('code'); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Let’s connect</Text>

          <View style={styles.toggle}>
            {(['code', 'scan'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
                <Text style={[styles.tabTxt, mode === m && styles.tabTxtOn]}>{m === 'code' ? 'My code' : 'Scan'}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'code' ? (
            <QrCodeCard />
          ) : (
            <QrScanner onResolved={(id) => { onClose(); onOpenProfile(id); }} />
          )}

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing['2xl'], alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, marginBottom: Spacing.lg },
  toggle: { flexDirection: 'row', backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, padding: 3 },
  tab: { paddingVertical: 8, paddingHorizontal: 26, borderRadius: Radius.full },
  tabOn: { backgroundColor: Colors.accent },
  tabTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textMuted },
  tabTxtOn: { color: Colors.accentInk },
  close: { alignItems: 'center', paddingVertical: 14, marginTop: Spacing.md },
  closeTxt: { ...Typography.bodySm, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
});
```

- [ ] **Step 2: Export it**

In `src/components/index.ts`, add:
```ts
export { QrConnectSheet } from './QrConnectSheet';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors.

- [ ] **Step 4: Commit**
```bash
git add src/components/QrConnectSheet.tsx src/components/index.ts
git commit -m "feat(mobile): QrConnectSheet (My code / Scan modal)"
```

---

## Task 7: Wire into the profile panel (`App.tsx`)

**Files:** Modify `src/App.tsx`

Context: `ProfilePanel` is presentational and opens sheets via callbacks (`onEditUsername`, etc.); the sheets are mounted in `App.tsx` with `useState` flags. `goToProfile('other', userId)` opens another user's `ProfileScreen`.

- [ ] **Step 1: Add the prop + row to `ProfilePanel`**

In `src/App.tsx`, add `onLetsConnect: () => void;` to the `ProfilePanelProps` interface (next to `onEditUsername`), add `onLetsConnect,` to the destructured props, and add a link row next to the existing "username" row (copy its exact classes):
```tsx
        <Pressable style={profilePanelStyles.linkRow} onPress={() => { onClose(); onLetsConnect(); }}>
          <Text style={profilePanelStyles.linkLabel}>let’s connect</Text>
        </Pressable>
```

- [ ] **Step 2: Mount `QrConnectSheet`**

Add `QrConnectSheet` to the `@/components` import. Add a state flag near the other sheet flags:
```tsx
  const [letsConnectOpen, setLetsConnectOpen] = useState(false);
```
Pass the prop where `<ProfilePanel ... />` is rendered (next to `onEditUsername={...}`):
```tsx
              onLetsConnect={() => setLetsConnectOpen(true)}
```
Mount the sheet near the other sheets (e.g. next to `<UsernameEditSheet ... />`):
```tsx
            <QrConnectSheet
              visible={letsConnectOpen}
              onClose={() => setLetsConnectOpen(false)}
              onOpenProfile={(id) => goToProfile('other', id)}
            />
```
Read the file to place these at the right spots; match surrounding style. Do not change unrelated logic.

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit` (zero `src/` errors). Then `npx vitest run` (all pass).

- [ ] **Step 4: Commit**
```bash
git add src/App.tsx
git commit -m "feat(mobile): Let's connect entry in profile panel"
```

---

## Task 8: End-to-end verification

**No code changes — drive the flow (camera needs a physical device).**

- [ ] **Step 1: Suite + typecheck**
```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
npx tsc --noEmit && npx vitest run
```
Expected: zero `src/` errors; all tests pass (incl. `qrHandle`).

- [ ] **Step 2: My code**

Open the app → profile panel → **let's connect** → **My code**: your avatar, name, `@handle`, and a scannable QR render. (A user with no handle sees the "set a username" hint.)

- [ ] **Step 3: Scan (physical device)**

On device, **Scan** → grant camera → point at another user's Seasonz QR (or a `https://seasonz.ai/@<their-handle>` code) → their **ProfileScreen** opens, showing Connect/Follow. Point at your own code → "That's your own code." Point at a random QR → nothing happens (ignored). Point at `https://seasonz.ai/@unknownxyz` → "No Seasonz profile found."

- [ ] **Step 4: Connect works**

On the opened profile, tap **Connect** → the existing connection-request flow fires (verify a pending request appears as it does from Discover).

---

## Self-Review

**1. Spec coverage**
- Deps (qrcode-svg, svg, expo-camera), Expo Go–compatible → Task 1. ✓
- Payload `https://seasonz.ai/@handle`; `extractHandle` (tolerant, rejects non-Seasonz); `buildProfileUrl` → Task 2. ✓
- `resolveHandleToUserId` → Task 3. ✓
- "My code" QR display → Task 4. ✓
- Scanner: permission handling, own/unknown/resolved, debounce, ignore non-Seasonz → Task 5. ✓
- Scan opens the person's profile (no auto-connect) via `goToProfile('other', id)` → Tasks 6–7. ✓
- Single "Let's connect" entry in the profile panel; My code / Scan toggle → Tasks 6–7. ✓
- Edge cases (own code, unknown, denied camera, non-Seasonz) → Tasks 5, 8. ✓
- No Connections shortcut (locked decision) → not built. ✓
- Pure tests for `extractHandle`/`buildProfileUrl`; camera device-only → Tasks 2, 8. ✓

**2. Placeholder scan:** No TBD/TODO; complete code in every code step. Task 4 names a concrete conditional fallback (`.d.ts` shim) rather than leaving it vague. `<their-handle>` in Task 8 is an operator-substituted runtime value. ✓

**3. Type consistency:** `extractHandle(string): string | null` and `buildProfileUrl(string): string` (Task 2) are consumed by `QrScanner`/`QrCodeCard` (Tasks 4–5) unchanged. `resolveHandleToUserId(string): Promise<string|null>` (Task 3) matches its use in `QrScanner`. `QrScanner` prop `onResolved(userId)` ↔ `QrConnectSheet` (Task 6) ↔ `onOpenProfile(userId)` ↔ `goToProfile('other', userId)` (Task 7). `QrConnectSheet` props `{ visible, onClose, onOpenProfile }` match the App.tsx mount. ✓

# Expo / EAS Deploy Guide

Reference for deploying **Velo Flow** (`loan-glass`) via EAS. Written for both humans and LLM agents.

- **App name:** Velo Flow · **slug:** `loan-glass`
- **EAS project ID:** `8c7fb2bb-76fa-433b-b807-044234164ec5`
- **Owner account:** `hkumardev`
- **Bundle/package:** `com.hkumardev.veloflow` (iOS + Android)
- **Dashboard:** https://expo.dev/accounts/hkumardev/projects/loan-glass

## Mental model (read this first)

There are **two different things** people call "deploy":

1. **OTA update** (`eas update`) — ships JS/asset changes to apps **already installed**. Fast (~1 min). Cannot change native code.
2. **Build** (`eas build`) — produces a new installable binary (APK/AAB/IPA). Needed for native changes, new dependencies with native code, or app-store releases. Slow (~10–20 min, cloud).

### The delivery chain that trips everyone up

```
eas update --branch <BRANCH>  →  CHANNEL  →  installed BUILD
```

- An OTA update is published to a **branch**.
- A **channel** maps to a branch.
- A **build** has a channel **baked in at build time** (from `eas.json` `build.<profile>.channel`).
- An update reaches a device **only if**: the installed build's channel → branch chain points at the branch you published to, **and** the build's **runtime version matches** the update's runtime version.

**A build with no `channel` in its profile receives NO updates, ever.** You cannot attach a channel to an already-installed app — you must rebuild. (This was the original bug here: builds had no channel, so published updates never appeared.)

## Current config

`eas.json` profiles → channels:

| Profile       | Channel        | Distribution | Notes                         |
|---------------|----------------|--------------|-------------------------------|
| `development` | `development`  | internal     | dev client                    |
| `preview`     | `preview`      | internal     | points to `production` branch  |
| `production`  | `production`   | store        | points to `production` branch  |

`app.json`:
- `runtimeVersion.policy: "appVersion"` → runtime version = `version` field (currently `1.0.0`). **Bumping `version` creates a new runtime → old installs stop receiving updates until rebuilt.**
- `updates.url: https://u.expo.dev/8c7fb2bb-76fa-433b-b807-044234164ec5`

Channels auto-link to a same-named branch on first build.

## Standard workflows

### A. Ship a JS-only change to existing installs (OTA)

```bash
git add -A && git commit -m "<short message>"
git push origin main
eas update --branch production --message "<short message>"
```

Publish updates exclusively to the **`production`** branch. The `preview` channel has been re-pointed to `production`, so both preview/test builds and production builds pull their OTA updates from this single branch.

### B. Make a new installable build

```bash
# Android preview (internal, easiest to sideload)
eas build --platform android --profile preview

# Production (store)
eas build --platform android --profile production
eas build --platform ios --profile production
```

> ⚠️ The **first** build for a platform/profile needs a **keystore (Android) / signing (iOS)** generated. This requires an **interactive** prompt — it **cannot run with `--non-interactive`** (fails with "Generating a new Keystore is not supported in --non-interactive mode"). Run it in a real terminal and answer **Yes**. Once credentials exist on the Expo server, later builds can use `--non-interactive`.

After a build finishes, install it on the device, then OTA updates to the matching branch will flow.

## Diagnose "I published an update but don't see it"

Run these and check each link in the chain:

```bash
eas channel:list                 # does a channel exist and link to your branch?
eas branch:list                  # which branches have updates?
eas build:list --limit 5         # what profile/channel/runtime did the installed build use?
eas update:list --branch <name>  # is the update actually on that branch?
```

Checklist:
1. **Does the installed build have a channel?** If the build was made before `channel` was added to `eas.json`, it has none → **rebuild required**. No update will ever reach it.
2. **Channel → branch link exists?** `eas channel:list` should show the channel pointing at your branch.
3. **Runtime match?** Update's runtime version must equal the build's. Bumping `app.json` `version` breaks this until you rebuild.
4. **Published to the right branch?** Must match the build's channel→branch.
5. **App relaunched?** expo-updates downloads in the background and applies on **next cold start** (kill and reopen, twice if needed).
6. **Not Expo Go / dev mode?** OTA only applies to release/standalone builds, not Expo Go.

## Gotchas specific to this project

- Builds historically used the `preview` profile (Android, internal distribution). Channels were added to `eas.json` on 2026-06-17; **any build before that has no channel and cannot receive OTA updates** — it must be rebuilt.
- `eas-cli` in this env is older than latest; the upgrade banner is harmless.
- Keep commit messages short (4–5 words) per owner preference.
- Do **not** add `Co-Authored-By` to commits.

## iOS deployment — read before promising anything

The owner asked "I need it for iOS / I use Expo Go, scan a QR and use it offline without my laptop running." Here is the ground truth so a future agent does not over-promise:

### Hard facts
1. **Expo Go is NOT a standalone app.** It always loads a JS bundle from somewhere — either the laptop's `npx expo start` (Metro) or Expo's cloud. It can never be a true offline home-screen app by itself.
2. **The classic `expo publish` → open-in-Expo-Go flow was removed in SDK 50+.** This project is SDK 54. EAS Update only feeds **real builds**, not Expo Go.
3. **Runtime mismatch blocks Expo Go.** `app.json` has `runtimeVersion.policy: "appVersion"` → updates publish with runtime `1.0.0`. Expo Go only loads updates matching its own runtime (`exposdk:54.0.0`), so it filters these out. An `appVersion`-pinned runtime targets standalone builds, period.
4. **Native Google Sign-In.** App uses native Google/Gmail OAuth (`com.googleusercontent...` scheme). That native code does not exist in Expo Go, so login/Gmail sync cannot run in Expo Go even if the runtime matched.
5. **Any install on a physical iPhone requires an Apple Developer account ($99/yr).** Apple mandates code signing. There is NO iOS shortcut around this. The first iOS build is interactive (logs into Apple, generates dist cert + provisioning profile) — cannot use `--non-interactive`.

### What actually works on iOS
- **With laptop, free, now:** `npx expo start` → scan QR in Expo Go. Only works while Metro runs on the laptop. The owner's stated "offline without laptop" goal is NOT achievable this way.
- **Without laptop (the real goal):** a standalone iOS build. Requires Apple Developer account. Then:

```bash
# First build is INTERACTIVE — run in a real terminal, log into Apple when prompted
eas build --platform ios --profile production    # TestFlight / App Store route
# then:
eas submit --platform ios --profile production    # uploads to App Store Connect → TestFlight

# OR ad-hoc internal install:
eas device:create                                 # register the iPhone's UDID first
eas build --platform ios --profile preview        # ad-hoc build installs directly on registered device
```

After any real build is installed, `eas update --branch production` OTA updates flow to it automatically (channel + runtime already match).

### Decision the owner still needs to make
The blocker is the **Apple Developer account**. If a future agent is asked to "deploy for iOS," confirm the owner has (or will create) an Apple Developer account before starting — without it, only the Mac iOS Simulator build is possible (free, but not a real device).

### Status as of 2026-06-22
- The `preview` branch was deleted to simplify the OTA update pipeline to a single branch.
- The `preview` channel was updated to point directly to the `production` branch.
- Both `production` and `preview` build channels are now powered by the `production` update branch (runtime `1.0.0`, android+ios).
- Standard OTA updates are published using: `eas update --branch production --message "<msg>"`.

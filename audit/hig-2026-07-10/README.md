# Adaptive Keyboard HIG Audit

Date: 2026-07-10

## Scope

Combined UI, UX, responsive-layout, and accessibility review of the initial
camera setup flow, the settings inspector, diagnostics, and the narrow-screen
layout. Camera and MIDI permissions were not activated during this audit.

## Overall assessment

The desktop hierarchy is strong: the camera is the primary content, the setup
action is obvious, and the inspector uses familiar controls consistently. The
largest gaps are responsive behavior, progressive disclosure during setup, and
accessible state communication.

## Priority recommendations

1. On narrow screens, keep the setup progress horizontal or show only the
   current step. Reset the camera frame's 420px minimum height and default the
   Help window to collapsed so it cannot cover the inspector.
2. Treat setup as a guided readiness flow. Disable calibration actions until
   the camera is live and either make the numbered step order match the
   inspector or replace it with an unordered readiness checklist.
3. Increase mobile hit areas to 44x44px. Current measured examples include the
   22px Help close button, 36px note and MIDI icon buttons, and 26px toggle.
4. Expose selected state semantically for Keyboard Range and Split Anchor using
   `aria-pressed` or radio semantics. Their current state is visual only.
5. Show determinate SoundFont loading progress, plus failure and retry actions.
   This matters because the bundled SoundFont is large and can remain in a
   loading state for a noticeable time.
6. Respect `prefers-reduced-motion` for Help, Diagnostics, segmented-control,
   and prompt animations.
7. Simplify Diagnostics into compact label/value rows. The nested readout tiles
   create more visual weight than this secondary information needs.
8. Reserve translucent blur for floating navigation or contextual surfaces.
   Solid inspector groups would improve hierarchy and may reduce compositing
   work while camera tracking is active.

## Evidence

- `01-initial-desktop.png`: Desktop initial state.
- `02-settings-lower.png`: Keyboard, MIDI, and Split Anchor controls.
- `03-diagnostics-expanded.png`: Diagnostics disclosure opening.
- `04-diagnostics-details.png`: Diagnostics readout hierarchy.
- `05-mobile-initial.png`: 390x844 initial state.
- `06-mobile-settings.png`: 390px-wide settings flow.

## Apple references

- https://developer.apple.com/design/human-interface-guidelines
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://developer.apple.com/design/human-interface-guidelines/accessibility
- https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- https://developer.apple.com/design/human-interface-guidelines/motion
- https://developer.apple.com/videos/play/wwdc2024/10085/

## Verification limits

Screenshots and DOM inspection can identify layout, semantics, target-size, and
likely contrast or motion risks. They do not prove VoiceOver behavior, real
camera permission recovery, MIDI hot-plug behavior, loading performance on a
slow network, or full WCAG compliance. Those require device and assistive-
technology testing.

# Mobile usability verification — 25 October 2026

## Implemented fixes

- Navigation opens as a dismissible modal drawer on screens up to 760px, with an explicit close button and backdrop. Search stays unfocused until selected. Focus stays inside the drawer; Escape and Android Back close it, and focus returns to the control that opened it. Choosing a destination focuses its content. Resizing to desktop closes the drawer and releases its scroll lock.
- Bottom navigation hides only when an editable field is focused and the visible viewport shrinks enough to indicate a software keyboard. Hardware keyboards, browser address bars, pinch zoom, rotation and desktop layouts preserve navigation.
- Assignment marking forms stack on small screens; long resource rows wrap. Small-screen header controls fit narrow widths, and focus targets have scroll margins.
- The offline notice no longer overlays the top navigation. Failed initial network-status lookup falls back to browser connectivity without an unhandled rejection.
- Reduced-motion preferences are respected in the learning portal and authentication pages.

## Completed checks

- Strict TypeScript and production Vite build.
- 27 mobile regression tests: update signature/compatibility and active-quiz guards; native runtime compatibility; biometric errors/identity isolation; local/remote API routing; learning continuation; quiz schedule time conversion; keyboard detection and viewport event lifecycle; Android Back consumption by an overlay.
- Four sample reviewer assessment/routing regressions.
- Staff login via the supported secure authentication capability: the website returned **Incorrect email or password**. No successful authenticated session was established. No learner records, attempts, settings or files were changed by the browser checks.

## Not yet verified

No Android device/emulator or mobile viewport emulation control is exposed in this session. Unit tests simulate viewport and native Back events; they are not physical-device end-to-end tests. A successful staff session is still required for protected admin UI checks. A separate test learner session is needed for learner writes; do not use a real learner's graded attempt as a disposable test.

## Remaining on-device acceptance checks

At 320/360/390/430px and landscape, in both themes:

1. Sign in, reload/restore the session and verify role-specific navigation.
2. Open Menu and More without raising the keyboard. Search deliberately, close by the close button/backdrop/Back, and verify page scroll and focus recover. Android Back with no overlay should navigate normally.
3. Open lessons, expand notes, play a video, download one material and export ZIP; complete a disposable activity and check continuation/gating.
4. Submit a disposable assignment attachment, inspect validation and mentor feedback; review it from a test admin context without altering actual grades.
5. Join a disposable scheduled quiz before/after room opening, use each lifeline and limits, toggle countdown, answer each question type, reconnect, finish, inspect position/results and permitted retakes.
6. Inspect learner profiles, scores/standing, attendance, leaderboard, announcements, calendar and settings. Crop a disposable profile image and inspect the full-size preview.
7. Test notification permission/device registration, biometric cancellation/success, native share sheet, external links, interrupted network and reconnect on Android.
8. Check About & Help update staging/application and preserve the active-quiz update guard.

Production-only access, file download permissions, biometric hardware, notifications, OS keyboard geometry and physical-device performance remain pending until tested on a device with valid sessions.

# Mobile browser review — 25 October 2026

Scope: the real website in a signed-in administrator session. The user clarified that this review is for mobile browsers, not the Android app.

## Browser checks completed

The admin-only `/responsive-preview` displays the real portal in a same-origin iframe at explicit viewport dimensions. It uses the existing administrator session and the normal protected APIs. It does not grant a role, create a session or substitute sample records. This checks responsive CSS and browser interaction; it does not emulate Safari, touch hardware or an operating-system keyboard.

- All 19 administrator sections were opened during 320px and 430px sweeps: Overview, Calendar, Applications, Profile requests, Students, Certificates, Leaderboard, Mentors, Stories, Announcements, Learning, Class Activity, Assignments, Attendance, Live class, Live quiz, Settings, Security, About & Help.
- Core sections were checked in dark mode: Overview, Students, Learning, Live quiz, Settings and Security. The original light preference was restored after the review.
- Quiz builder and Security were rechecked at 320px, 360px and 390px after the clipping fixes. Their controls stay within the screen. These forms previously extended to x=473px and x=424px respectively on a 320px viewport, even though the page hid horizontal overflow.
- Assignment summary cards now measure 117px, 117px and 243px at 320px, rather than squeezing three labels into narrow columns. Assignment submission tab navigation loads the existing review cards. No results were published or rejected.
- At 932px landscape, Learning and Settings rendered without page overflow.
- More opens a modal menu and focuses its non-editable panel, not search. Filtering to Attendance works. Close restores focus to More and releases the page scroll lock. Shift+Tab stays inside the menu; Escape closes it. Selecting Attendance closes the menu and focuses its main content.
- Searching the learner directory and opening the full-profile panel worked. The profile panel and full-size profile picture fit the 430px screen; the picture loaded, and both viewers closed correctly.
- No page-wide horizontal overflow or visible error alerts were found in the measured screens. Horizontal tabs and code blocks intentionally scroll within their containers.

These are browser-driven checks performed in this session, not a new unattended Playwright test suite. The assignment endpoint sometimes finished after the browser tool's short locator deadline; subsequent rendered-state inspection confirmed that the data loaded.

## Improvements deployed

- Dismissible phone navigation with backdrop, close control, focus containment, Escape and Android Back handling, focus restoration and desktop-resize cleanup.
- Bottom navigation responds to a focused editable field plus a substantially reduced visual viewport. Hardware keyboards, browser bars, pinch zoom and rotation do not falsely hide it in regression tests.
- Single-column quiz builder grids and shrinkable fieldsets/controls prevent clipped inputs/selects.
- Profile-picture upload controls and file inputs fit small screens.
- Assignment summary cards use two columns and a full-width final card on phones; the submission-tab wording is shorter.
- Small-screen marking forms stack, long resource rows wrap, focus targets have scroll margins, and reduced-motion preferences are respected.
- Admin Settings includes **Open responsive preview** so the same real views can be inspected at 320, 360, 390, 430, 768 and 1280px, with a portrait/landscape toggle.

## Automated validation

- Strict TypeScript and production Vite build passed after the changes.
- 27 mobile regression tests passed, including keyboard/viewport lifecycle, native Back, signed updates, API routing, biometric error handling, learning continuation and quiz scheduling.
- 109 backend tests and four reviewer tests passed during the preceding mobile interaction pass. No backend changes were made in this responsive-layout pass.

## Remaining limits

- A student account was not supplied. Learner-only end-to-end actions—submitting assignments/activities, joining and completing a live quiz, using lifelines, retakes and learner gating—were not exercised in this administrator session.
- Publishing grades, editing real assessments, scheduling a live session, changing academy policies, sending announcements, deleting records and changing access were deliberately not performed as test actions.
- Safari-specific rendering, actual touch/keyboard behavior, downloads/upload round trips and flaky-network reconnection still need a browser/device test with disposable learner data.
- Native Android installation, biometric hardware, notification delivery and native file sharing are outside the clarified mobile-browser scope.

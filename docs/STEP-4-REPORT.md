# OPUS — Step 4 Delivery Report: Frontend split + Back-button logout

Date: 2026-07-15

## Part 1 — App.jsx split (4,358 lines → 21 modules)
The single monolith is now a 505-line root plus focused modules. Code was moved by an AST script (byte-identical component bodies; only imports/exports added), not rewritten. No design, style, or behavior changes beyond Part 2.

```
frontend/src/
├── App.jsx                     root: routing, session, guards, portal composition
├── lib/
│   ├── api.js                  API_BASE, apiRequest, session cache, cookies
│   ├── router.js               path maps, navigateTo, inactivity limits
│   └── constants.js            nav items, role helpers, formatters
├── components/
│   ├── ui.jsx                  PageHeader, StatCard, Badge, EmptyState, FilterInput/Select, Toast, SessionVerificationScreen
│   ├── Sidebar.jsx             shared staff+user sidebar (role-driven menu)
│   ├── TopBar.jsx
│   └── HelpSupportPage.jsx
├── portals/user/               DashboardPage, JobSearchPage, CalendarPage, SettingsPage, MyApplicationsPage, ProfileResumePage
└── portals/staff/              StaffLoginPage, RecruiterRegisterPage, RecruiterPortalPage, AdminPage,
                                AdminInternalApplicationsPage, AdminPortalSection, SuperAdminPortalSection
```
The shared staff shell is preserved: Recruiter/Admin/Super Admin still render through the same Sidebar + TopBar with role-based menus and routes, exactly as your spec requires.

## Part 2 — Back-button logout (your explicit decision)
Implemented so a genuine browser Back/Forward press while signed in ends the session immediately, while ordinary in-app navigation does not.

Mechanism: `navigateTo` (all app-initiated navigation) sets `window.__opusInternalNavigation = true` around its synchronous popstate dispatch. The app's popstate handler treats any popstate **without** that flag as a real browser Back/Forward and calls `handleLogout('back')`. Refs (`currentUserRef`, `handleLogoutRef`) give the once-registered handler live values. After logout the guard sees no user, so there is no logout loop. Combined with the existing server-side session revocation and `Cache-Control: no-store`, protected content cannot be re-exposed through history.

## Verification
- Production build (`vite build`) succeeds — Vite resolves and bundles every import, so this alone proves all cross-module references are valid. Bundle size unchanged from pre-split baseline (~329 kB / 89.6 kB gzipped).
- jsdom render smoke test on the built bundle: evaluates with no throw, renders the login UI (8,150 chars into #root), zero non-network console errors.
- Back-button logic unit-tested in jsdom, 3/3:
  1. app-initiated navigation → no logout, path updates ✔
  2. genuine browser Back → logout fires ✔
  3. Back after logout → no logout loop, path updates ✔

## Known limitations
- Full click-through in a real browser (actual history stack, bfcache) is the final confirmation; the jsdom tests cover the decision logic, not every browser's bfcache nuance.
- This is a deliberately aggressive UX (you chose it twice). Reversible by removing the `handleLogout('back')` branch if you change your mind.

## Next: Step 5 — build the 9 stub pages, dynamic Super Admin permissions editor, resume upload with permission-checked download, and CSV/PDF/ICS exports.

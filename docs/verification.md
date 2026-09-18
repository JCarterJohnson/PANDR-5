# Preview 0.2.0 verification

Checked September 17, 2026.

| Check | Evidence |
| --- | --- |
| Training rules / persistence / exports / cloud conflicts / native OAuth security | 88 tests pass; TypeScript and production build pass. |
| Database privacy | Live transaction verifies owner read/write, other-user read/update/insert denial, reassignment prevention, anonymous denial; fixtures rolled back. Security advisor reports no findings. |
| Public Google login | Production Vercel app creates and loads the owner's Google account. Google app is External / In production with basic identity scopes only. |
| Native Google login | Packaged macOS ARM64 app opens system browser, receives one-use callback, loads same account. Login persists after quitting and relaunching. |
| Workout synchronization | 100 kg, anchor 8 reps at 1 RIR entered on web; desktop restores the unfinished workout and 102.5 kg next-load guidance. |
| Preferences | Both directions synchronize; open desktop Settings updates a remote rest-timer change from 120 to 135. Restored to 120 after check. |
| Export | Native CSV saved through macOS save dialog. 195 rows, including 22 active-set rows, settings, plan, target volumes, full catalog, and muscle contributions. |
| Local separation | Preexisting local test workout remained separate when signing into the fresh account. |
| Offline / mobile | Earlier preview passed offline reload, retained logging, and 390px mobile workout UI checks. Account networking remains online-only. |

Temporary account test workout and preference changes were removed after verification. Local QA artifacts are ignored by git under `docs/qa/`.

Limitations: Windows, Linux, and Intel Mac are packaging checks only; no physical iOS/Android installation check. Packages are unsigned. Free-tier services have quotas and inactivity policies. These checks do not establish unlimited retention or uptime.

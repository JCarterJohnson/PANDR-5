# Support hearts

Apply `support-votes.sql` after the main `schema.sql`. This separate feature does not change training records or backups. The hosted project uses the `account_support_votes` migration.

Each signed-in account can keep one active heart. The primary key prevents duplicates, row policies restrict writing/reading to its owner, and clients cannot alter timestamps or the shared count. Removing a heart or deleting its account decrements the count. The timestamp records when a currently active heart was cast; this is not a lifetime click count or an archive of removed votes. Multiple accounts belonging to one person are still separate accounts.

Only the total is public. A private, non-callable trigger atomically maintains it, so the browser never downloads voter identities or calculates the shared number. The read RPC runs with the caller's permissions and returns a consistent total and own-vote state. It is refreshed when Settings opens, on focus/reconnection, and every minute while visible. Votes require a connection and are displayed only after a confirmed read. Uncertain writes must be read again before another toggle. Upvotes do not affect workout saving or training decisions.

Run `verify-support-votes.sql` as the database administrator to check ownership, duplicate retries, unvotes, aggregate tampering, anonymous access, timestamps and account deletion. Its synthetic users and votes exist only inside a rolled-back transaction. Browser scenarios in `tests/browser/support.e2e.ts` use an isolated service fixture, including a committed write whose response is lost.

These hearts do not transfer to rankings on third-party discovery sites.

## Verification — September 20, 2026

The live SQL Editor passed `verify-support-votes.sql`; all fixtures rolled back. The public HTTP endpoint returned `200` with a genuine zero and `voted: false` afterward. The full app suite passed 125 automated tests and 10 browser flows, including desktop voting, double clicks, reload persistence, uncertain responses, signed-out behavior and mobile dark mode. The security advisor reported no database findings; its existing leaked-password-protection warning remains unrelated to this Google-only sign-in flow.

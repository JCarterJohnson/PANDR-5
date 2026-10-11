# Delete a previous cycle

History offers deletion only for an ended cycle that is no longer current. The first confirmation names the cycle and counts its saved workouts and recovery check-ins. The second asks “Are you really sure?” and requires **Delete permanently**. Cancel, close, and Escape dismiss either confirmation without deleting anything. While deletion is being acknowledged, closing is disabled.

Deleting a cycle removes its archived plan, workouts, and recovery check-ins. Strength assessments, bodyweight observations, current plan, current cycle, and the workout in progress are preserved. No live user cycle is deleted by tests or deployment.

## Account implementation

Apply `supabase/cycle-deletion.sql` after the existing schema. The `pandr_delete_closed_cycle(expected_revision, cycle_id)` public invoker wrapper delegates to a private database-owned function with an empty search path. The private schema is not exposed through the public API. It takes the caller from `auth.uid()` rather than accepting an account ID. Anonymous callers have no execute permission; authenticated users have no direct workout-record DELETE grant.

The function locks the caller's profile row, checks the last acknowledged revision, rejects the current/unended cycle and a workout referring to the chosen cycle, and checks the manifest is complete. It removes only the chosen cycle's metadata and its sessions/check-ins, including their superseded immutable versions. Missing legacy `cycleId` means the first original cycle, matching the existing app rule. Remaining record order and contents are preserved.

The app requires an acknowledged snapshot with no pending metadata or history edits. It validates the returned account against the expected deletion, saves the new synchronization baseline, then shows the result. Network failures keep the rendered history until an acknowledged response. Concurrent profile changes fail before deletion and ask the user to refresh. Ordinary sync detects records removed since its baseline, so a stale open device cannot silently resurrect deleted history.

`supabase/verify-cycle-deletion.sql` uses disposable fixture accounts in a transaction and rolls back. It checks ownership, revision conflicts, current-cycle protection, workout protection, legacy records, other-cycle preservation, strength preservation, and permissions.

The production function was installed on October 10, 2026. The transaction-only verification passed against the hosted database and rolled back all fixture changes. No account history was deleted during deployment.

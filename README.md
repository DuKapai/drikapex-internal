# DRIKAPEX INTERNAL

DRIKAPEX INTERNAL is a static Next.js application with a group website at `/`,
an administration dashboard at `/dashboard/` and a virtual office at `/office/`.
Supabase Auth and database roles determine the user's destination after login.

## Stack

- Node.js 20.9 or later
- Next.js 16.4.6, React 19.3.1, TypeScript 5.9
- Three.js 0.187 for the procedurally created office scene
- Supabase Auth and the Supabase Data API, using a public browser key
- Static export to `out/` for hosting that serves static files

The static export has no Next.js server routes. Account deletion is handled by
the protected `delete-account` and `account-deletion-workflow` Supabase Edge
Functions; account status and role changes are constrained by database RLS.

The original standalone HTML/CSS/JavaScript prototype files are grouped in
[`legacy/`](./legacy/) for reference and are not the active application
entrypoint. Run the Next.js app as described below, and deploy the generated
`out/` directory rather than serving the repository root or opening HTML files
directly. The legacy prototype is not a production authentication system.

## Local setup

1. Install Node.js 20.9+ and dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env.local`. The project URL is prefilled from the
   supplied Supabase project; set its public publishable key (or legacy anon
   key):

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://mymhtunpsmlbkjrnetnx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
   NEXT_PUBLIC_SUPABASE_RLS_READY=false
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3000`. Configure email/password sign-in in the
   existing Supabase Auth project to use the login form.

Never put a Supabase `service_role` key in a `NEXT_PUBLIC_*` variable, source
file, or browser bundle. `.env.local` is ignored by Git; `.env.example` contains
no key. The publishable/anon key is intentionally public and is
**not** an authorization mechanism.

## Existing database contract and setup

The project URL and SQL schema were supplied. A public Supabase key and
pre-existing RLS policies were not. This implementation does not create,
rename, or alter the application tables:

- `employees`, `profiles`
- `roles`, `permissions`, `user_roles`, `role_permissions`
- `documents`, `document_categories`
- `notifications`, `notification_reads`
- `audit_logs`

The signed-in office uses the supplied table and column definitions:

- Overview: aggregate counts from `employees`, `documents`, and `notifications`.
- People: employee directory read/create/edit/delete, gated by the matching
  `personnel.*` permissions.
- Documents: metadata read/create/edit/delete with the existing
  `document_categories` relationship. File storage is not enabled.
- Notifications: active notification list, per-user read state, and
  permission-gated create/edit/delete actions.
- Office roster: employee names, roles, and `employees.avatar_url` where
  available, joined to active profiles and assigned roles.
- Identity: the current account's `profiles`, `user_roles`, and role permissions.

## Access areas and roles

- After the centralized permission migration is enabled, the designated Owner
  and role ID `1` (`ADMIN`) can access the administration dashboard; `MANAGER`
  and `MEMBER` use the office and cannot access the dashboard.
- Owner has every capability. ADMIN capabilities are controlled by role
  defaults and per-user overrides. An ADMIN can create and edit eligible
  lower-level accounts; deleting an account requires Owner approval.
- Login uses Supabase Auth email/password accounts. There is no public
  registration or default password. Authorized Owner and ADMIN users can
  provision accounts from the dashboard.

Client-side routing only controls the interface. Database RLS and server-side
checks are the security boundary. Review and deploy the coordinated SQL
policies and Edge Functions before setting `NEXT_PUBLIC_SUPABASE_RLS_READY=true`
in a frontend environment. The flag is a safety acknowledgment, not a security
control. Do not blindly rerun legacy policy scripts against an existing project.

The historical [`supabase/bootstrap-accounts.sql`](./supabase/bootstrap-accounts.sql)
is retired and deliberately stops without modifying accounts or permissions.
The centralized permission migration in
[`supabase/permission-control.sql`](./supabase/permission-control.sql) and its
dependent policies and Edge Functions must be deployed together before enabling
the role/permission interface. Until then it remains read-only and legacy role
routing remains in effect.
The migration records its initial role and permission setup so a later rerun
does not undo customized role assignments or permission defaults.

After the coordinated migration, the designated Owner and ADMIN can access the
dashboard; MANAGER uses the office and cannot access the dashboard. The Owner
reviews sensitive requests, including administrator requests to delete accounts.
Do not enable `NEXT_PUBLIC_PERMISSION_OVERRIDES_READY` before verifying these
backend controls and all deployed privileged Edge Functions.

Keep passwords in an approved password manager. Sign in at `/login/`. The
dashboard provides account management, role and individual permissions, and
Owner approval. Account creation uses the protected `create-account` Edge
Function; direct account deletion is reserved for Owner. Password recovery uses
the owner-assisted PIN flow below. Existing users need a `profiles` row and
a role assignment to appear in Accounts and sign in.

### Owner-assisted PIN password recovery

The login page requests a four-digit PIN using the account's login email.
When the email secrets below are configured, the server generates the PIN
for an eligible account and emails it only to the owner inbox in
`RECOVERY_NOTIFY_EMAIL` (never to the employee). The request is also listed
in **Dashboard → Accounts → Password recovery requests** (visible only to an
active Owner, role ID 1) as "PIN sent to the owner's email". The owner
independently verifies the employee's identity and shares the code
privately. If email is not configured or delivery fails, the request stays
in that Dashboard queue: the owner clicks **Issue PIN**, confirms, and
shares the displayed code. The code is never saved in browser storage or as
plaintext in the database. The employee enters it on the same login page,
sets a new password, and returns to sign in.

A pending request expires after 30 minutes. An emailed PIN is valid until
the request expires; a PIN issued from the Dashboard expires after 10
minutes. Every PIN is single-use and permits at most five
attempts per account in 30 minutes. Each account may request (or resend) a
PIN once every 60 seconds and at most five times in 30 minutes; there is also
a limit of 30 requests overall per minute. A limited request returns HTTP 429
with `retryAfter` (seconds) and leaves the pending request and its PIN valid;
the login page shows a countdown and enables **Resend PIN** when it ends. A
successful resend invalidates earlier PINs for that account, so only the PIN
in the newest owner email works. Reloading the page loses the recovery
session; start again after the countdown. If the password update
cannot be confirmed due to a connection failure, try signing in with the new
password before requesting another PIN.

This flow requires deployment and configuration; it is not enabled by merely
building the frontend. Before production, back up the database, review and
apply [`supabase/password-recovery.sql`](./supabase/password-recovery.sql)
in the correct Supabase project's SQL Editor. Then set the Edge Function
secrets listed below in Supabase Dashboard → Edge Functions → Secrets. From
the project directory, deploy the function with the Supabase CLI:

```powershell
supabase login
supabase link --project-ref mymhtunpsmlbkjrnetnx
supabase functions deploy password-recovery --project-ref mymhtunpsmlbkjrnetnx
```

The function intentionally allows unauthenticated requests; its RPCs and
private state must remain inaccessible to `anon` and `authenticated`. A 404
from the recovery endpoint means the function is not deployed; a 503 means it
is deployed but missing configuration or unable to complete a server request.
After backend deployment, test with a dedicated account before deploying the
updated static frontend (`npm run build`, then publish `out/` to the existing
static host). The login UI source and backend must both be deployed for users
to see the updated status messages and use PIN recovery.
Set the following Edge Function secrets privately in Supabase; never put
their values in source, frontend variables, documentation, or chat:

- `RECOVERY_HMAC_SECRET`: independently generated cryptographically random
  secret, at least 32 characters.
- `RECOVERY_ALLOWED_ORIGINS`: comma-separated exact site origins, including
  the actual frontend host. This recovery-specific setting takes precedence
  over the shared `APP_ALLOWED_ORIGINS`; do not change other functions'
  allowlists. Include local origins only when they are in use.
- `RESEND_API_KEY`: Resend API key with sending access restricted to the
  verified sender domain.
- `RECOVERY_EMAIL_FROM`: verified sender, e.g.
  `DRIKAPEX INTERNAL <no-reply@drikapex.com>`.
- `RECOVERY_NOTIFY_EMAIL`: comma-separated owner inbox(es) that receive
  recovery PINs.

The three email secrets are optional as a group; without all of them the
Dashboard-only flow is used. Check Resend → Logs when an email is missing.

Deployment can also use Dashboard → Edge Functions → Deploy a new function →
Via Editor: copy the exact content of
[`supabase/functions/password-recovery/index.ts`](./supabase/functions/password-recovery/index.ts),
name it `password-recovery`, deploy, and switch **Verify JWT with legacy
secret** off in this function's settings. Public recovery actions use random
capabilities; owner actions still validate the user's Auth JWT and current
Owner role on the server. Never turn off authorization checks in the code.

Verify queue delivery, owner-only issuance, expiry, attempt limits,
and password changes using a dedicated test account before rollout. Rate
limits can temporarily block legitimate users under heavy traffic; monitor
and investigate repeated recovery requests. The existing email-link recovery
callback remains supported for previously issued links, and requires the
appropriate Supabase Auth redirect URL configuration.

The owner queue refreshes every 30 seconds while visible and has a manual
refresh button. If the owner loses a PIN after leaving the page, the employee
must start a new request after the cooldown. The sole owner cannot recover
their own account without another signed-in owner; a Supabase administrator
must use the existing Auth recovery procedure in that case. Expired challenge
rows older than one day are pruned on subsequent recovery requests; account
rate-limit hashes contain no plaintext email and can be periodically pruned
by an administrator once their challenge rows are gone and limits have expired.

### Administrator account deletion approval

After applying `rls-policies.sql`, also run
[`supabase/account-deletion-requests.sql`](./supabase/account-deletion-requests.sql)
to create the RLS-protected approval queue. Deploy the new Edge Function:

```powershell
supabase functions deploy account-deletion-workflow --project-ref mymhtunpsmlbkjrnetnx
```

In Dashboard → Accounts, an authorized ADMIN can request deletion of another
account, including another ADMIN, but not the designated Owner. Owner can
approve or reject the request; after approval only the requesting ADMIN can
execute it. Owner can delete eligible accounts directly. The function rechecks
authorization and request status on every action; browser UI checks are not
the security boundary. The queue is visible to the requester and Owner through
RLS and refreshes automatically while the dashboard is visible.
Document file storage/upload is not enabled. The browser does not insert audit
entries; deletion audit records are written by the Edge Function using its
server-only service-role key. Permission/schema failures are shown as safe
messages rather than silently treated as empty results.

### Deploy account deletion

The function requires the Supabase CLI and a verified project link. From this
project directory:

```powershell
supabase login
supabase link --project-ref mymhtunpsmlbkjrnetnx
supabase secrets set APP_ALLOWED_ORIGINS=https://YOUR-PRODUCTION-ORIGIN
supabase functions deploy delete-account --project-ref mymhtunpsmlbkjrnetnx
supabase functions deploy account-deletion-workflow --project-ref mymhtunpsmlbkjrnetnx
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge
Functions. If setting these manually in a different environment, store the
service-role key only as a server-side secret. Never expose it in the frontend,
source files, or a `NEXT_PUBLIC_*` variable. `APP_ALLOWED_ORIGINS` must contain
the exact deployed site origin (comma-separated if multiple origins are
required); the default allows only localhost for local development. The
function verifies the caller's Auth session, active profile, role hierarchy,
and prevents self-deletion. A failed audit insert is explicitly reported even
if Supabase has already deleted the account.

Before using the data views, verify in the existing Supabase project that:

- Email/password Auth is enabled and existing accounts have valid Auth users.
- The coordinated RLS policies and permission migration have been reviewed
  and applied, and each account has only intended role assignments.
- The project exposes the existing tables through the Supabase Data API.
- Both account deletion Edge Functions have been deployed with the production
  origin allowlist before enabling deletion and approval.
- Storage bucket names and policies are confirmed before enabling document
  upload/download.
- Any additional privileged account provisioning, password reset, or audit
  operation is implemented and authorized server-side.

The account approval workflow adds the `account_deletion_requests` table via
its separate SQL migration; the application data schema otherwise remains
unchanged. If a data request is denied, adjust policies only after reviewing
the access requirement; do not make a table public to silence the warning.

## Monthly work schedule

After the team and month-lock migrations, apply
[`supabase/monthly-report-sections.sql`](./supabase/monthly-report-sections.sql)
before deploying the grouped report UI. It adds a saved group name to each
task and private storage/RPCs for monthly difficulties and proposals without
changing task visibility or assignments. Existing tasks start in **CÔNG VIỆC
CHUNG** because the original import had no group field; they are not
classified by guessing from their titles.

The form generates numbered groups from saved task data. Staff can choose
**CÔNG VIỆC CHUNG**, **MINECRAFT/PIKAMC**, **WEBSITE/SERVER**, or enter another
name. Names differing only in case, whitespace or Unicode composition share
one group. Changing a task's group requires **Lưu nhóm**; **Hủy sửa** discards
the change. The new-task RPC saves the task, assignees and group atomically.

Sections **II. KHÓ KHĂN, VƯỚNG MẮC** and **III. ĐỀ XUẤT, KIẾN NGHỊ** are
separate monthly sections below task results. Active staff can read their
contents. For difficulties, the server reveals the author only to the author
and ADMIN/MANAGER; proposal authors are visible to active staff. Authors and
ADMIN/MANAGER can edit/delete notes. Notes require explicit save, reject blank
content, confirm deletion, and check revisions to prevent stale overwrites.
Unsaved notes block changing the report month; month locks protect notes as
well as tasks, including writes made outside the UI. Updates poll every ten
seconds without replacing drafts. Reading a note never returns its author ID.

The office sidebar includes **Công việc tháng**. Active staff can see and edit
only tasks assigned to themselves, and create tasks for themselves. Active
ADMIN/MANAGER accounts can see all tasks, assign them to
active profiles, edit and delete them. The work list loads from Supabase for
the selected report month. An empty employee view does not imply the month
has no tasks; managers can check assignments for that month.
Tasks support multiple assignees; when
an employee selects a colleague, their own account is kept in the team. Role
ID `1` (Owner) can assign work without being included. The controls are enforced by the separate
[`supabase/monthly-tasks.sql`](./supabase/monthly-tasks.sql) RLS policies;
run it after `rls-policies.sql` and review existing policies before enabling it.
Then review and apply
[`supabase/monthly-task-people.sql`](./supabase/monthly-task-people.sql) and
[`supabase/monthly-task-teams.sql`](./supabase/monthly-task-teams.sql) to add
the roster and team assignments and migrate existing single-assignee records.
For an existing installation, do not re-run the base schema merely to install
the roster API, as it replaces task policies and grants. Presence also requires
reviewing and applying
[`supabase/workspace-presence.sql`](./supabase/workspace-presence.sql) after
`monthly-tasks.sql`. It validates each heartbeat through the signed-in Supabase
session and expires online leases after 90 seconds; access tokens are not
stored or displayed. Review and apply
[`supabase/monthly-task-locks.sql`](./supabase/monthly-task-locks.sql) after
the team migration. It binds lock management to the designated active owner
account at installation, permits locking past months only, and blocks writes
for everyone until unlocked. If lock status cannot be checked, the interface
keeps tasks visible but temporarily disables edits. Back up the database and
verify all migrations and permissions before enabling the updated interface.
Historical rows without a uniquely matched account remain visible only to
administrators and managers until they assign a profile. Moving a row into a
different month is not automatic: the report month and work date are separate.
The work cards edit existing fields directly: text saves on blur, while selectors
save on change. New tasks default to "Đang thực hiện". Updates compare
the field's original value to avoid overwriting a concurrent change; if saving
fails, the draft remains available for retry or cancellation. Cancel or press
Escape while editing text to discard unsaved changes; changes already saved
cannot be undone this way. Date and month picker changes, including clearing
a date, are applied only after confirmation. The list polls
Supabase every 10 seconds when no edits are pending. It is not a realtime
subscription, and polling pauses while an edit is unsaved.
The collapsible filter area above the work cards searches all fields or narrows
the search to people, work, or time. Field filters can be combined, and edits
that are not yet saved remain visible even if they do not match the filters.
Search and filters apply to the selected report month.
The office menu collapses when opening monthly work and can be reopened from
the top bar. The monthly workspace does not currently export a report.

To prepare a historical import, export an XLSX backup from the source sheet,
then run these commands with paths outside the deployed application:

```powershell
.\scripts\prepare-monthly-import.ps1 -Workbook C:\private\schedule.xlsx -OutputJson C:\private\schedule.json -Year 2026
.\scripts\create-monthly-import-sql.ps1 -InputJson C:\private\schedule.json -OutputSql C:\private\schedule-import.sql
```

Inspect the JSON and generated SQL, back up the target database, then execute
the SQL in the correct Supabase project's SQL editor. It maps the five or six
columns by header name, preserves the source tab month, original status, note,
assignee name and date, and flags date/month discrepancies in the interface.
It associates a source name only when exactly one active profile matches its
display name, username or linked employee name. When names differ, an optional
private JSON mapping file can explicitly associate `source_assignee` with
`profile_name` (the exact profile display name); pass its path with
`-MappingJson`. Each mapped source must exist in the import and each target
must identify exactly one active profile, or the import is rolled back.
Review the SQL result listing
unmatched names and assign those records manually in the office interface.
Re-running the same import skips existing source rows rather than overwriting
subsequent edits. Row-based source keys are stable only while the original
sheet rows are not reordered; do not reimport a reordered sheet without review.
This is a one-time snapshot, not live synchronization with Google Sheets.
The source workbook and generated import files contain operational data and
must not be deployed publicly or committed to source control.

## Individual permission overrides

The role-default and per-account permission interface is behind
`NEXT_PUBLIC_PERMISSION_OVERRIDES_READY`, which defaults to false. Enable it
only after deploying and verifying `permission-control.sql`, its dependent
policies, and the account creation and deletion Edge Functions. Do not apply
the older `permission-overrides.sql` in isolation. Set the public flag in each
frontend build environment; it is embedded at build time.

## Validation and static hosting

```sh
npm test
npm run lint
npm run build
```

`npm run build` exports the site into `out/`. Preview the generated files with
`npm run preview` (or any static HTTP server). A hosting path such as a
GitHub Pages repository subpath may require a deployment-specific `basePath`
and asset-path setting; it has not been guessed here.

## Reference and provenance

The supplied product requirements name
[`khanh020905/my-office`](https://github.com/khanh020905/my-office) as a
high-level reference. The reference application's source and assets were not
opened, imported, or copied. The Drikapex scene, UI, and application code are
implemented independently.

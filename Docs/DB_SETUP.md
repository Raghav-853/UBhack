# Tiger Data connection setup

This is shared connection groundwork while team ownership is undecided. It adds a read-only readiness check, not application tables or a persistence integration.

## Local setup

Use Python 3.10 or newer. In PowerShell, from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-db.txt
if (-not (Test-Path -LiteralPath .env.local)) {
    Copy-Item -LiteralPath .env.example -Destination .env.local
}
```

Set the real `DATABASE_URL` in `.env.local` using the provider's connection URL. Keep the URL quoted, percent-encode reserved characters in URL credentials, and retain `sslmode=require` or a stricter supported verification mode. An existing process-level `DATABASE_URL` takes precedence.

```powershell
.\.venv\Scripts\python.exe scripts\check_tiger_db.py
```

The script requires TLS, sets a ten-second connection timeout and statement timeout, starts a read-only session, queries metadata, and rolls back. It prints capability results rather than the host, user, password, or connection string. Provider error messages are redacted. `sslmode=require` encrypts the connection; it does not establish full server-certificate identity verification.

Success proves connection readiness. Extension status and advertised CREATE privilege are reported separately. It does not prove successful schema migrations, inserts, history queries, or a completed Tiger Data sponsor integration.

## Verified on November 7, 2026

After syncing repository commit `4754edd`, a read-only check of the teammate-provided service confirmed:

- Authenticated connection and `SELECT 1` succeeded.
- TLS 1.3 was active with `sslmode=require`.
- PostgreSQL reported version `18.6`; TimescaleDB `2.31.0` was installed.
- The connection used a read-only transaction, which was rolled back.
- The current role advertised CREATE privilege on the `public` schema.
- None of the five application tables proposed in the master plan existed in `public` at check time.

No application schema or data was changed. An isolated temporary Python client was used for the initial verification; the pinned requirements record its Psycopg version and the local dotenv version.

## Existing tracked credentials

`Docs/tiger-cloud-db-29101-credentials.txt` is already tracked in Git. The new ignore rule prevents new matching files from being added normally; it does not remove this file or its earlier contents from Git history.

The credential owner should rotate the exposed password in Tiger Data and share the replacement through the team's private secret mechanism. Update each developer's ignored `.env.local`. Coordinate removal of the tracked file from the repository; retaining a local copy while removing its index entry is possible with `git rm --cached -- Docs/tiger-cloud-db-29101-credentials.txt`. A normal deletion commit does not erase prior Git objects or replace password rotation.

## Next shared contract

Once ownership is assigned, agree the run and state contracts before creating tables. Start with `runs` and atomic `comparison_snapshots`; add segment telemetry when the simulation produces real state. Follow [the master plan](MASTER_EXECUTION_PLAN.md) for shared simulation time, policy isolation, checkpoint contents, and acceptance checks.

References: [Psycopg installation](https://www.psycopg.org/psycopg3/docs/basic/install), [PostgreSQL connection options](https://www.postgresql.org/docs/current/libpq-connect.html).

"""Check Tiger Data connectivity using read-only queries and redacted output."""

import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

try:
    import psycopg
    from dotenv import load_dotenv
except ImportError:
    print(json.dumps({"ok": False, "error": "Install requirements-db.txt first."}))
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[1]
APP_TABLES = (
    "runs",
    "road_segment_telemetry",
    "observations",
    "dispatch_events",
    "comparison_snapshots",
)


def check_database(database_url):
    uri = urlsplit(database_url)
    if uri.scheme not in {"postgres", "postgresql"} or not uri.hostname:
        raise ValueError("Invalid PostgreSQL URL")
    sslmode = parse_qs(uri.query).get("sslmode", ["require"])[0]
    if sslmode not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("TLS is required")

    with psycopg.connect(
        database_url,
        sslmode=sslmode,
        connect_timeout=10,
        application_name="SnowTwin-readiness-check",
        options="-c default_transaction_read_only=on -c statement_timeout=10000",
    ) as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = {"ok": cursor.fetchone()[0] == 1}
                cursor.execute("SHOW transaction_read_only")
                result["read_only"] = cursor.fetchone()[0] == "on"
                cursor.execute("SHOW server_version")
                result["postgres_version"] = cursor.fetchone()[0]
                cursor.execute(
                    "SELECT ssl, version FROM pg_stat_ssl "
                    "WHERE pid = pg_backend_pid()"
                )
                tls = cursor.fetchone()
                result["tls_active"] = bool(tls and tls[0])
                result["tls_version"] = tls[1] if tls else None
                result["sslmode"] = sslmode
                cursor.execute(
                    "SELECT extversion FROM pg_extension "
                    "WHERE extname = 'timescaledb'"
                )
                extension = cursor.fetchone()
                result["timescaledb_version"] = extension[0] if extension else None
                cursor.execute(
                    "SELECT has_schema_privilege(current_user, 'public', 'CREATE')"
                )
                result["public_schema_create_privilege"] = cursor.fetchone()[0]
                cursor.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = ANY(%s)",
                    (list(APP_TABLES),),
                )
                present = {row[0] for row in cursor.fetchall()}
                result["application_tables_present"] = {
                    name: name in present for name in APP_TABLES
                }
                result["ok"] = (
                    result["ok"] and result["read_only"] and result["tls_active"]
                )
                return result
        finally:
            connection.rollback()


def main():
    # Process environment takes precedence; interpolation could alter passwords.
    load_dotenv(ROOT / ".env.local", override=False, interpolate=False)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print(json.dumps({"ok": False, "error": "Set DATABASE_URL or .env.local."}))
        return 1
    try:
        result = check_database(database_url)
    except Exception as error:
        # Provider messages can contain connection details; never print them.
        result = {
            "ok": False,
            "error_type": type(error).__name__,
            "sqlstate": getattr(error, "sqlstate", None),
            "error": "Database check failed; connection details are redacted.",
        }
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

# Supabase Pause Prevention

Keep free-tier Supabase projects active by pinging them on a schedule. Free projects pause after about 7 days without activity; this service updates a `_keepalive` row every few days.

## Quick start

**Requirements:** Node.js 18+

```bash
git clone <repo-url> supabase-pause-prevention
cd supabase-pause-prevention
npm install
npm run setup
```

Verify:

```bash
npm run ping
```

## Deploy on a VPS with PM2

Run from the project directory so `.env` is found:

```bash
pm2 start npm --name supabase-keepalive -- start
pm2 save
pm2 startup
```

## How it works

Each ping cycle, per project:

1. `PATCH` on `public._keepalive` (sets `pinged_at`) via REST with the anon key
2. Auth admin fallback, if a service role key is configured

Each ping **updates** `_keepalive.pinged_at` (a real DB write). Run `sql/keepalive.sql` once per project; re-run it if the table already exists from an older setup.

Default interval: **1 day**. Override with `PING_INTERVAL_DAYS=3` in `.env`. Optional `serviceRoleKey` bypasses missing anon UPDATE policy and enables auth admin fallback.

## Configuration

See `.env.example`. Multiple projects use `SUPABASE_PROJECTS` JSON (takes precedence over single-project vars).

## Notes

- Unpause paused projects in the dashboard before pinging.
- If the VPS is down for 7+ days, projects can still pause.

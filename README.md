# Supabase Pause Prevention

Keep free-tier Supabase projects active by pinging them on a schedule. Free projects pause after about 7 days without API activity; this service issues a lightweight database `SELECT` every few days so they stay awake.

## Quick start

**Requirements:** Node.js 18+

```bash
git clone <repo-url> supabase-pause-prevention
cd supabase-pause-prevention
npm install
npm run setup
```

The setup wizard will:

1. Ask for your project URL and anon key (Dashboard → Project Settings → API)
2. Optionally create a `_keepalive` table in each project (needs the database password once)
3. Test connections and write a `.env` file

Verify everything works:

```bash
npm run ping
```

## Deploy on a VPS with PM2

Run from the project directory so `.env` is found:

```bash
pm2 start npm --name supabase-keepalive -- start
pm2 save
pm2 startup   # run the command it prints so the service survives reboot
```

Useful commands:

```bash
pm2 logs supabase-keepalive
pm2 restart supabase-keepalive
pm2 stop supabase-keepalive
```

## How it works

On each ping cycle the service tries, per project:

1. `SELECT` from `public._keepalive` via the REST API (anon key)
2. Auth admin API fallback, if a service role key is configured

The `_keepalive` table is a single-row table with RLS allowing anon read access. Setup can create it automatically, or you can run `sql/keepalive.sql` manually in the SQL Editor.

Default ping interval is every **3 days**. Override with:

```env
PING_INTERVAL_DAYS=6
```

## Configuration

Copy `.env.example` to `.env`, or let `npm run setup` generate it.

**Single project:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_PROJECT_NAME=my-app
# SUPABASE_SERVICE_ROLE_KEY=optional-fallback
# SUPABASE_TABLE=_keepalive
# PING_INTERVAL_DAYS=3
```

**Multiple projects** (`SUPABASE_PROJECTS` takes precedence):

```env
SUPABASE_PROJECTS=[{"name":"app-one","url":"https://one.supabase.co","anonKey":"..."},{"name":"app-two","url":"https://two.supabase.co","anonKey":"...","serviceRoleKey":"..."}]
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Interactive wizard — configure projects and create tables |
| `npm run ping` | Run one ping cycle and exit (useful for testing) |
| `npm start` | Start the keep-alive daemon |

## Notes

- Unpause any already-paused projects in the Supabase dashboard before setup or pings will fail.
- If this VPS is down for 7+ days, projects can still pause.
- The anon key is enough when `_keepalive` exists; the service role key is only a fallback.

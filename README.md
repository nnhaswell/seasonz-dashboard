# Seasonz — seasonz.ai

The public site + operator dashboards for Seasonz, a productive social network
where life is organized in seasons (past · present · future). Next.js 15 (App
Router) on Vercel, backed by Supabase.

## Routes

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Public | Landing page + waitlist signup (→ `waitlist` table) |
| `/login` | Public | Email OTP / password sign-in for champions & admins |
| `/champion/[groupId]/…` | Champion | Group champion dashboard |
| `/superuser/…` | Superuser | Admin dashboard (overview, users, groups, champions, summaries, analytics) |

After login, `/login` routes by role: superusers → `/superuser/overview`,
champions → their group, otherwise → `/403`.

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run type-check`.

## Environment variables

Set these locally in `.env.local` and in the Vercel project settings.

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS — never expose to the client |
| `ANTHROPIC_API_KEY` | server | Claude (knowledge generation) |
| `RESEND_API_KEY` | server | Transactional email |
| `EMAIL_FROM` | server | e.g. `hello@seasonz.ai` |

`.env.local` is gitignored — never commit it.

## Database

Migrations live in `supabase/migrations/` and run against the linked Supabase
project (shared with the mobile app). Apply with the Supabase CLI, e.g.:

```bash
npx supabase db query --linked --file supabase/migrations/<file>.sql
```

Key tables this app reads/writes: `waitlist` (public insert, superuser read),
`profiles`, `groups`, `group_members`.

## Deploying to Vercel

1. Push to GitHub and **Import** the repo in Vercel (Next.js auto-detected).
2. Add the env vars above under **Project → Settings → Environment Variables**.
3. Deploy, then add the **`seasonz.ai`** domain and configure DNS as Vercel instructs.
4. In **Supabase → Authentication → URL Configuration**: set **Site URL** to
   `https://seasonz.ai` and add `https://seasonz.ai/auth/callback` to **Redirect URLs**.

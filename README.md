# M ADVISORY

Online real-estate advisory platform for M Properties (legal entity: Симкас Пропертиз ХХК).
Next.js 16 · TypeScript (strict) · Tailwind 4 · Supabase PostgreSQL/Auth/Storage · RLS · Zod · QPay.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, state machines and route map.

## Run locally (no external accounts needed)

Requirements: Node 22+, PostgreSQL 15+ on localhost (user `postgres` / password `postgres`).

```bash
npm install
cp .env.example .env.local          # set SESSION_SECRET to a long random string
npm run db:reset                    # creates m_advisory, applies supabase/local shim + migrations
npm run db:seed-dev                 # demo staff accounts, password DevPassword123
npm run dev                         # http://localhost:3000
```

Demo accounts: `admin@m-advisory.local` (super admin), `branch1@…` (branch admin),
`advisor@…`, `reviewer@…`. Register any email as a client.

All prices are seeded as **proposed**. Nothing can be ordered until a super admin approves
them in `/admin/pricing`. Locally, payment uses the mock provider ("Туршилтын төлбөр хийх").

## Tests

```bash
npm test                            # 71 tests: RLS, permissions, workflow, payments, reports, validation
npm run build && npm start          # then, in another shell:
node tests/e2e/smoke.mjs            # 28-step browser test: order, pay, assign, report, review, PDF download
```

`npm test` recreates the `m_advisory_test` database each run.

## Production setup

Step-by-step guide (Mongolian): [`docs/DEPLOY.md`](docs/DEPLOY.md). In short:

1. **Supabase** (Tokyo): run `supabase/migrations/` in order (SQL editor or `supabase db push`).
   Do **not** run `supabase/local/`. Auth: email confirmation on, Site URL = `APP_URL`,
   redirect `APP_URL/auth/callback`, custom SMTP (Resend).
2. **Vercel**: import the repo, set the production block of `.env.example` plus
   `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`. The app refuses to start in production
   with local auth, local storage or mock payments. `vercel.json` schedules `/api/cron` daily
   (payment reconciliation, email outbox, document retention purge).
3. **QPay**: merchant username, password and invoice code for Симкас Пропертиз ХХК.
   Test against `merchant-sandbox.qpay.mn` first.
4. **First super admin** (SQL editor, once, after registering on the site):
   `insert into memberships (user_id, role, branch_id) select id, 'SUPER_ADMIN', null from auth.users where email = '…';`
5. In the staff dashboard: rename branches, approve prices, review service texts.
   Legal pages (`/legal/terms`, `/legal/privacy`) are drafts until approved by counsel.

CI (`.github/workflows/ci.yml`) runs typecheck, the test suite against Postgres 16 and
the production build on every push and pull request.

## Security notes

- Every user query runs as `authenticated` with the user's JWT claims → RLS applies.
- Workflow writes go only through `app.*` functions; app roles have no INSERT/UPDATE on orders/payments.
- Payment callbacks are authenticated with an HMAC in the callback URL and never trusted:
  the server asks the provider whether the invoice is paid and checks the amount.
- Rate limiting is in-memory per instance; move to a shared store before scaling out.

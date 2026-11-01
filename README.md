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
npm test                            # 55 tests: RLS, permissions, workflow, payments, validation
npm run build && npm start          # then, in another shell:
node tests/e2e/smoke.mjs            # 19-step browser test of the full M CHECK journey
```

`npm test` recreates the `m_advisory_test` database each run.

## Production setup

1. **Supabase**: create a project; run the files in `supabase/migrations/` in order
   (`supabase db push` or the SQL editor). Do **not** run `supabase/local/`.
   Auth → enable email confirmations; set Site URL to `APP_URL` and add `APP_URL/auth/callback`.
2. **Vercel**: import the repo; set env vars from `.env.example` (production block), with
   `APP_ENV=production`, `AUTH_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`, `PAYMENT_PROVIDER=qpay`.
   The app refuses to start in production with local auth, local storage or mock payments.
3. **QPay**: needs M Properties' merchant username, password, invoice code. Run the adapter
   against `merchant-sandbox.qpay.mn` first and confirm the field names with QPay's docs.
4. **Bootstrap the first super admin** (SQL editor, once):
   `insert into memberships (user_id, role) select id, 'SUPER_ADMIN' from profiles where email = '…';`
5. Rename the seeded branches (`Салбар 1`, `Салбар 2`) to the real branch names.
6. Schedule `reconcileOpenPayments()` (e.g. Vercel Cron) and enable Supabase PITR backups.

## Security notes

- Every user query runs as `authenticated` with the user's JWT claims → RLS applies.
- Workflow writes go only through `app.*` functions; app roles have no INSERT/UPDATE on orders/payments.
- Payment callbacks are authenticated with an HMAC in the callback URL and never trusted:
  the server asks the provider whether the invoice is paid and checks the amount.
- Rate limiting is in-memory per instance; move to a shared store before scaling out.

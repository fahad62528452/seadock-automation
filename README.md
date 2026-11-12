# SeaDock

Operations management for a seafood processing and distribution business.

## Run the app

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

By default `SEADOCK_DATA_SOURCE=mock`, so the UI works without a live database.

## Supabase / PostgreSQL (Step 2)

1. Create a Supabase project.
2. Copy the project URL, anon key, and service-role key into `.env.local`.
3. Apply migrations:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

Or start a local stack:

```bash
npm run db:start
npm run db:reset
```

4. Switch services to PostgreSQL when ready:

```bash
SEADOCK_DATA_SOURCE=supabase
```

Validate migration files without Postgres:

```bash
npm run db:validate
```

See [docs/database-architecture.md](docs/database-architecture.md) for tables, relationships, and the batch traceability model.

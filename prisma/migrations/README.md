# Database migrations

This project originally synced its schema with `prisma db push`. `0_init` is a
**baseline** migration that captures the schema exactly as `db push` had already
created it on the live database — it is not meant to be run against that database.

## One-time cutover to `prisma migrate deploy`

The production database (Railway) already has every table/index from `0_init`
because they were applied via `db push`. Running `migrate deploy` against it
as-is would try to `CREATE TABLE` on tables that already exist and fail. You must
**baseline** it once so Prisma records `0_init` as already applied:

```bash
# Run once, against the production DATABASE_URL:
npx prisma migrate resolve --applied 0_init
```

Then switch the deploy command in the `Dockerfile` from:

```
npx prisma db push
```

to:

```
npx prisma migrate deploy
```

After that, every schema change follows the normal flow:

```bash
# during development, against a dev database:
npx prisma migrate dev --name <change_name>
# commit the generated prisma/migrations/<timestamp>_<change_name>/ folder;
# `migrate deploy` applies it automatically on the next deploy.
```

Until the baseline command above has been run against production, the `Dockerfile`
intentionally still uses `db push` (without `--accept-data-loss`, so a destructive
change fails the deploy instead of silently dropping data).

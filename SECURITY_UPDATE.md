# Dependency security update

This handoff intentionally removes the old `package-lock.json`. The previous lock pinned vulnerable versions of Drizzle ORM and older Vite/esbuild tooling.

Pinned direct versions in this package after the Next.js 16 security migration:

- `drizzle-orm` 0.45.2
- `next` 16.3.4
- `react` / `react-dom` 19.2.8
- `postcss` 8.5.28
- `vitest` 3.2.7
- `eslint-config-next` 16.3.4

`drizzle-kit` was removed from this release. Couchlist does not need it at runtime: migrations are applied by `drizzle-orm/node-postgres/migrator` from the committed SQL migration files. Removing the CLI also removes its old `@esbuild-kit` dependency chain from normal installs.

## First install

From the project root:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
npm audit
npm run check
npm run build
```

`npm install` will create a fresh `package-lock.json`. Keep that newly generated lockfile and commit it with the project after the checks pass. The Dockerfiles intentionally use `npm ci`, so generate and keep this fresh lockfile before testing Docker or deploying from GitHub.

Do not use `npm audit fix --force` as a substitute for reviewing package upgrades.

## Why Next.js 16

Next.js 15.5.x still vendors `postcss@8.4.31` inside the `next` package. A root npm override does not cleanly replace that private nested copy and can make `npm ls` report `ELSPROBLEMS`. Couchlist therefore upgrades to Next.js 16.3.4 instead of carrying an invalid override.

The migration also replaces the removed `next lint` command with the ESLint CLI and renames `middleware.ts` to `proxy.ts`, as required by the Next.js 16 upgrade path.

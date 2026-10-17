# Environments at a glance

| Env         | Purpose                         | Frontend                 | Backend              | Database                 |
|-------------|---------------------------------|--------------------------|----------------------|--------------------------|
| local       | your laptop                     | `npm run dev`            | `uvicorn --reload`   | Docker Postgres          |
| development | team integration (auto deploy)  | Vercel preview           | Render (dev)         | Neon branch `dev`        |
| uat         | client/QA testing, prod mirror  | Vercel (uat)             | Render (uat)         | Neon branch `uat`        |
| production  | live users                      | Vercel (production)      | Render (prod, 2+)    | Neon `main` + backups    |

Git branches: `develop` -> development, `release/*` -> uat, `main` -> production.

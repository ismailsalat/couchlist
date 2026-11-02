# v9.6 validation error fix

The final v9.5 HTTP failures were real application error-handling failures, not
another database or Windows launcher issue.

`@couchlist/shared` throws Zod validation errors. In a Next.js production build,
the shared workspace and web app can be bundled through different module graphs.
That can make a Zod error fail a strict `instanceof ZodError` check in the web
handler even though it is a valid Zod error. The handler then treated ordinary
bad input as an internal error and returned HTTP 500.

v9.6 keeps the normal `instanceof` check and adds a narrow cross-bundle fallback
for objects with Zod's public `name === "ZodError"` and `issues` array shape.
This restores HTTP 400 / `CL_VALIDATION_FAILED` for invalid rating and progress
without weakening handling for unrelated exceptions.

A regression unit test covers both normal Zod errors and a prototype-stripped
cross-bundle Zod-shaped error.

# Next.js 16 local cleanup

If you upgraded this project by copying files over an older Couchlist folder, delete the old Next.js 15 middleware file before building:

```cmd
del apps\web\src\middleware.ts
```

Next.js 16 uses `apps/web/src/proxy.ts`. Having both files present causes the build to fail.

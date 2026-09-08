# syntax=docker/dockerfile:1
# Couchlist Discord bot.

FROM node:22-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false CI=true
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @couchlist/shared \
 && npm run build --workspace @couchlist/db \
 && npm run build --workspace @couchlist/bot

FROM base AS runtime
ENV NODE_ENV=production
RUN useradd --create-home --uid 10001 couchlist

COPY --from=build --chown=couchlist:couchlist /app/node_modules ./node_modules
COPY --from=build --chown=couchlist:couchlist /app/package.json ./package.json
COPY --from=build --chown=couchlist:couchlist /app/packages ./packages
COPY --from=build --chown=couchlist:couchlist /app/apps/bot ./apps/bot

USER couchlist

# The web service owns migrations; the bot only reads the schema it expects.
CMD ["node", "apps/bot/dist/index.js"]

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 SPARK_HOST=0.0.0.0
ENV UV_THREADPOOL_SIZE=16
RUN groupadd --system --gid 1001 spark && useradd --system --uid 1001 --gid spark spark
COPY --from=production-dependencies --chown=spark:spark /app/node_modules ./node_modules
COPY --from=builder --chown=spark:spark /app/.next ./.next
COPY --from=builder --chown=spark:spark /app/public ./public
COPY --from=builder --chown=spark:spark /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=spark:spark /app/package.json ./package.json
COPY --from=builder --chown=spark:spark /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=spark:spark /app/scripts ./scripts
COPY --from=builder --chown=spark:spark /app/src ./src
COPY --from=builder --chown=spark:spark /app/server.mjs ./server.mjs
COPY --chown=spark:spark docker/entrypoint.sh /usr/local/bin/spark-entrypoint
RUN chmod 0555 /usr/local/bin/spark-entrypoint
USER spark
EXPOSE 3000
ENTRYPOINT ["spark-entrypoint"]
CMD ["node", "server.mjs"]

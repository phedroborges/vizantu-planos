# Vizantu Planos — imagem de produção para VPS (EasyPanel / Docker)
# Build: Next.js 16 + pnpm 11 + Node 22. Storage local em disco (volume persistente).

FROM node:22.13.1-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --- Dependências (roda os build scripts liberados: esbuild, sharp) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build do Next ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Imagem final ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DRIVER=local \
    DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/next.config.ts ./
# Diretório de dados (planos, metadados, aprovações). Monte um volume persistente aqui.
RUN mkdir -p /data
EXPOSE 3000
CMD ["pnpm", "start"]

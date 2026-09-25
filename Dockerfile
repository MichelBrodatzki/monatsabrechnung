FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/monatsabrechnung.db

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "build"]

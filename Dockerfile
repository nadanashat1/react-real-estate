FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 DATA_DIR=/var/real-estate
EXPOSE 4174
CMD ["node", "--experimental-sqlite", "server/index.mjs"]
# For local SQLite mode, mount a persistent volume at /var/real-estate.
# On ephemeral hosts use DATABASE_URL which stores capped demo image bytes in the database.

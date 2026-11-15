FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

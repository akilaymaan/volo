FROM node:24.13.0-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.13.0-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_MODE=postgres
COPY --from=build /app ./
EXPOSE 3000
# Apply migrations separately; supply the pooled DATABASE_URL only at runtime.
CMD ["npm", "start"]

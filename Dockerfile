# OPUS production image: builds the frontend, then serves it from the backend.
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && (npm ci --omit=dev || npm install --omit=dev)
# Backend source
COPY backend/ ./backend/
# Built frontend (served statically by the backend)
COPY --from=frontend /app/frontend/dist ./frontend/dist
# Uploaded files live on a mounted volume in production
RUN mkdir -p /app/backend/uploads
EXPOSE 5000
WORKDIR /app/backend
# Run migrations then start (migrations are idempotent).
CMD ["sh", "-c", "node db/migrate.js && node server.js"]

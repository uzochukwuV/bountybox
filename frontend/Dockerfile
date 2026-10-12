# BountyBox frontend — static Vite build served by nginx.
#
# The image is built WITHOUT configuration: VITE_* values arrive at run time and
# are injected into index.html by docker-entrypoint.sh. See src/lib/env.js.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# .env is not copied (see .dockerignore); this builds with empty VITE_* values.
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

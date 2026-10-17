# Builds the static site and serves it with nginx.
# Use with: docker build --build-arg MODE=production -t localshop-web .
FROM node:20-alpine AS build
ARG MODE=production
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx vite build --mode $MODE

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY js ./js
COPY css ./css
COPY assets ./assets
COPY index.html dialogue-editor.html ./
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]

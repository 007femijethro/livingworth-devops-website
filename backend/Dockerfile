FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
EXPOSE 5000
USER node
CMD ["npm", "start"]

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY bin ./bin
COPY lib ./lib
COPY demo ./demo

ENTRYPOINT ["node", "bin/queue-sentinel.js"]

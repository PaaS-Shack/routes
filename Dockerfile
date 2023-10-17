FROM node:18-alpine

ENV NODE_ENV=production

RUN mkdir /app

WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json ./

RUN npm install --production

COPY . .

CMD ["npm", "start"]

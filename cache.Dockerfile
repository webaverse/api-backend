FROM node:14

WORKDIR /usr/src/app

RUN apk add --update nodejs npm

EXPOSE 8080

ENV PRODUCTION=true

COPY package*.json ./

RUN npm Install

COPY . .

CMD [ "node", "src/ipfs/index.js" ]
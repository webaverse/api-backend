FROM node:14

WORKDIR /usr/src/app

ENV PRODUCTION=true

EXPOSE 8080

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "src/api/index.js" ]
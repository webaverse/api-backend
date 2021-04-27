FROM node:14

WORKDIR /usr/src/app

RUN apt-get update

RUN apt-get -y install nodejs

RUN npm install -g npm

EXPOSE 8080

ENV PRODUCTION=true

COPY package*.json ./

RUN npm Install

COPY . .

CMD [ "node", "src/cache/index.js" ]
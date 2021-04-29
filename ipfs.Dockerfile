FROM ipfs/go-ipfs:master-latest

WORKDIR /usr/src/app

# IPFS host is exposed on 8081
EXPOSE 8081

ENV PRODUCTION=true

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "src/ipfs/index.js" ]
#!/bin/bash

PUBLIC_DNS = $1
PRIVATE_IP = $2

scp -o StrictHostKeyChecking=no -i keys/server.pem world-server.zip ubuntu@$PUBLIC_DNS:~
ssh -o StrictHostKeyChecking=no -i keys/server.pem -t ubuntu@$PUBLIC_DNS << EOF
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash 
    export NVM_DIR="$([ -z "\${XDG_CONFIG_HOME-}" ] && printf %s "\${HOME}/.nvm" || printf %s "\${XDG_CONFIG_HOME}/nvm")"
    [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    nvm install 14
    nvm use 14
    cd world-server/
    sudo apt-get dist-upgrade -y
    sudo apt-get update -y
    sudo apt-get install build-essential -y
    sudo apt-get install python -y
    sudo apt-get install python3 -y
    sudo apt-get install unzip -y
    unzip world-server.zip -d ./
    npm i forever -g
    mkdir node_modules/dialog/certs/ 
    cp -r certs/ node_modules/dialog/
    cd node_modules/dialog/ 
    MEDIASOUP_LISTEN_IP=${PRIVATE_IP} MEDIASOUP_ANNOUNCED_IP=${PRIVATE_IP} DEBUG=\${DEBUG:='*mediasoup* *INFO* *WARN* *ERROR*'} INTERACTIVE=\${INTERACTIVE:='false'} forever start index.js
EOF
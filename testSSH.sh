#!/bin/bash

PRIVATE_IP=$1

ssh -o StrictHostKeyChecking=no -i keys/server.pem ubuntu@$PRIVATE_IP << EOF
    echo all good
    exit
EOF
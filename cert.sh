#!/bin/bash

udo certbot certonly --server https://acme-v02.api.letsencrypt.org/directory --manual -d 'proxy.webaverse.com, *.proxy.webaverse.com'

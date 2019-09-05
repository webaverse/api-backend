#!/bin/bash

sudo certbot certonly --server https://acme-v02.api.letsencrypt.org/directory --manual -d 'webaverse.com, *.webaverse.com, *.proxy.webaverse.com, exokit.org, *.exokit.org, *.proxy.exokit.org'

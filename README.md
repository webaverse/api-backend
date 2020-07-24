# exokit-backend

Node server hosted on AWS, mainly used for REST endpoints.

## Dev Setup

1. `npm install`

2. Create a `config.json` and paste this in: 

```
{
    "accessKeyId": "<ACCESS_KEY_ID>",
    "secretAccessKey": "<SECRET_ACCESS_KEY>"
}
```

You can get these credentials from Avaer.

3. Create a `cert/` folder. Create 2 new files inside: `fullchain.pem` and `privkey.pem`. Ask Avaer for the certificates.

4. `npm run start` (forever) or `npm run dev` (nodemon).

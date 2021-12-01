
# API BACKEND

## To Use

To clone and run App you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) v.17(which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

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


### Technologies

The App primarily uses the following technologies

* [NodeJS](https://nodejs.org/)

---

### Directory Structure

```bash
**Root**
│
├─ index.js <-- This file starts the api-backend and register all major routes in itself.
├─ config.json <-- This file controls all of the environment variables in the application.
```

---

### Registered Routes

| Domain  | Route | Usage |
|--|--|--|
| login.exokit.org | `_handleLogin` | Provides the application with the functionality to login via Discrod, Email, Twitter & Github  |
| accounts.webaverse.com | `_handleAccounts` | Fetch accounts from redis server   |
| ai.webaverse.com| `_handleAi` | Handle the openAI codex compiling request from the app.webaverse   |

### Config.json

```json

{

		"accessKeyId"			: "<AWS ID>",
		"secretAccessKey"		: "<AWS Key>",
		"infuraProjectId"		: "<infuraProjectId>",
		"infuraProjectSecret"	: "<infuraProjectSecret>",
		"discordApiToken"		: "<discordApiToken>",
		"discordClientId"		: "<discordClientId>",
		"discordClientSecret"	: "<discordClientSecret>",
		"twitterId"				: "<twitterId>",
		"twitterConsumerKey"	: "<twitterConsumerKey>",
		"twitterConsumerSecret"	: "<twitterConsumerSecret>",
		"twitterAccessToken"	: "<twitterAccessToken>",
		"twitterAccessTokenSecret": "<twitterAccessTokenSecret>",
		"ngrokToken"			: "<ngrokToken>",
		"twitterWebhookPort"	: 123456,
		"mainnetMnemonic"		: "some key",
		"rinkebyMnemonic"		: "some key",
		"polygonMnemonic"		: "some key",
		"testnetpolygonMnemonic": "some key",
		"treasuryMnemonic"		: "some key",
		"encryptionMnemonic"	: "some key",
		"infuraKey"				: "<infuraKey>",
		"polygonVigilKey"		: "<polygonVigilKey>",
		"redisKey"				: "<redisKey>",
		"devPassword"			: "<openai>",
		"openAiKey"				: "<openAiKey>"

}

```
____
### Development Mode

The application uses vite to hot reload itself automatically if there are any changes to any files. To start the App in dev mode, run:

```bash
npm run dev
```
**note** 
Any changes inside the `packages` folder won't recompile automatically and so will require restarting the entire development server by just running again: `npm run dev`


---



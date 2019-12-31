const WebSocket = require('ws');
const { discordBot } = require('./discordBot.js')
const createKeccakHash = require('keccak')
const BN = require('bn.js');
const fetch = require("node-fetch")

const main = async () => {

    const discordClient = await discordBot()
    discordChannel = discordClient.channels.get("660532635428454451");
    const ws = new WebSocket('wss://rinkeby.infura.io/ws/v3/db401ebec15c4b319bff5e15779e9349');
    const address = `0x192510a46854d86aE4B72124Bc82Fa31C8E388cD`
    let filter = null
    let botOnline = false

    const testUrl = (url) => {
        return new Promise(async (accept, reject) => {
            const response = await fetch(url, {
                method: "GET"
            })
            if(response.ok){
                accept(`\`\`\`yaml\n${url} is online, status code: ${response.status}\`\`\``) 
            }
            else{
                accept(`\`\`\`diff\n-${url} is down with status code: ${response.status}\`\`\``) 
            }
        })
    }

    const endpoints = [
        "https://dev.exokit.org/",
        "https://root.exokit.org/",
        "https://web.exokit.org/",
        "https://exokit.org/",
        "https://linux.exokit.org/",
        "https://store.exokit.org/",
        "https://sync.exokit.org/",
        "https://payments.exokit.org/",
        "https://content.exokit.org/",
        "https://docs.exokit.org/",
        "https://git.exokit.org/",
        "https://login.exokit.org/",
        "https://upload.exokit.org/",
        "https://grid.exokit.org/",
        "https://multplayer.exokit.org/",
        "https://tokens.exokit.org/",
        "https://presence.exokit.org/",
        "https://editor.exokit.org/",
        "https://browser.exokit.org/",
        "https://land.exokit.org/",
        "https://spatial-engine.exokit.org/",
        "https://meshing.exokit.org/"
    ]

    const admins = [
        "141677977929777152", // Chris
        "284377201233887233" // Avaer
    ]

    const RPS = [
        "rock",
        "paper",
        "scissors"
    ]

    const RPS_scores = new Map()

    let signupList = []

    ws.addEventListener('open', (event) => {

        discordClient.on('message', async (msg) => {
            if (msg.content.slice(0, 1) === '!') {

                let functionHash = null;
                let ethCall

                const command = msg.content.slice(1).split(", ")[0]
                let param = msg.content.slice(1).split(", ")[1]

                switch(command){
                    case "getId()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('getId(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(param.slice(2), 16).toString(16, 64)
                            msg.reply(`Calling ${command} with: ${param}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        }
                        break;
                    case "uri()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('uri(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(param, 16).toString(16, 64)
                            msg.reply(`Calling ${command} with: ${param}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id": 999999}))
                        }
                        break;
                    case "getTx()":
                        if(botOnline){
                            param = param
                            msg.reply(`Calling ${command} with: ${param}`);
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getTransactionByHash","params": [param],"id":1}))
                        } 
                        break;
                    case "getHash()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('getHash(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(param, 16).toString(16, 64)
                            msg.reply(`Calling ${command} with: ${param}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        } 
                        break;
                    case "help":
                        discordChannel.send(`\`\`\`!<FUNCTION_NAME()>, <PARAM>\nBlockchain Functions: getTx(uint256 hash), getId(uint256 hash), uri(uint256 id), getHash(uint256 id)\nOther Functions: testUrl(), testEndpoints()\nM3 Meeting: !signup, !signupList\nRock, paper, scissors: !RPS start\nStart bot: !start\nStop bot: !stop \`\`\``)
                        break;
                    case "start":
                        if(admins.includes(msg.author.id)){
                            botOnline = true;
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_newFilter","params":[{"address": address}],"id":2}))
                            discordChannel.send(`Blockchain Bot is Online!. I'm taking orders and looking for new transactions. \`!help\` for more info`)
                        }
                        else{
                            discordChannel.send(`Sorry, only admins can turn me on...`)
                        }
                        break;
                    case "stop":
                        if(admins.includes(msg.author.id)){
                            botOnline = false;
                            discordChannel.send(`Blockchain Bot is Offline!. I'm going to sleep now, \`!start\` to wake me up. zzz \`!help\` for more info`)
                        }
                        else{
                            discordChannel.send(`Sorry, only admins can turn me off...`)
                        }
                        break;
                    case "testUrl()":
                        const result = await testUrl(param)
                        msg.reply(result)
                        break;
                    case "testEndpoints()":
                        if(admins.includes(msg.author.id)){
                            endpoints.forEach(async (url) => {
                                let status = await testUrl(url)
                                discordChannel.send(status)
                            })
                        }
                        else{
                            discordChannel.send(`Sorry, only admins can test endpoints...`)
                        }
                        break;
                    case "signup":
                        signupList.push(msg.author.username)
                        msg.reply(`Thanks for signing up for the next M3 meeting! See you there! Beep Boop`)
                        break;
                    case "signupList":
                        let message = "Discord users who have signed up for the next M3:\n\n";
                        signupList.forEach((user) => {
                            message += "- " + user + "\n"
                        })
                        discordChannel.send(`\`\`\`${message}\`\`\``)
                        break;
                    case "RPS start":
                        msg.reply(`\`\`\`Lets play: Rock, Paper, Scissors!\nBest out of 3 wins the game... I promise to not look at chat...\nHow-To-Play: RPS, <rock, paper, scissors>\`\`\``)
                        break;
                    case "RPS":

                        const checkScore = (score) => {
                            if(score.user === 3){
                                msg.reply(`\`\`\`Awww, Good job... you win this time... maybe I should start looking at the chat...\`\`\``)
                                RPS_scores.delete(msg.author.id)
                                
                            }
                            else if(score.bot === 3){
                                msg.reply(`\`\`\`Haha, I Win!... how could you expect to beat a robot? Better luck next time...\`\`\``)
                                RPS_scores.delete(msg.author.id)
                            }
                        }

                        let userScore = RPS_scores.get(msg.author.id)
                        if(!userScore){
                            RPS_scores.set(msg.author.id, {user: 0, bot: 0})
                            userScore = {user: 0, bot: 0}
                        }
                        const choice = RPS[Math.floor(Math.random() * Math.floor(3))]
                        msg.reply(`\`\`\`${choice}\`\`\``)
                        if(choice === param){
                            msg.reply(`\`\`\`Tie!\nScore: ${msg.author.username}: ${userScore.user} Exokitty: ${userScore.bot}\`\`\``)
                            break;
                        }
                        if(choice === "rock" && param == "scissors"){
                            userScore.bot++
                            RPS_scores.set(msg.author.id, userScore)
                            msg.reply(`\`\`\`I win!\nScore: ${msg.author.username}: ${userScore.user} Exokitty: ${userScore.bot}\`\`\``)
                            checkScore(userScore)
                            break;
                        }
                        if(choice === "scissors" && param == "paper"){
                            userScore.bot++
                            RPS_scores.set(msg.author.id, userScore)
                            msg.reply(`\`\`\`I win!\nScore: ${msg.author.username}: ${userScore.user} Exokitty: ${userScore.bot}\`\`\``)
                            checkScore(userScore)
                            break;
                        }
                        if(choice === "paper" && param == "rock"){
                            userScore.bot++
                            RPS_scores.set(msg.author.id, userScore)
                            msg.reply(`\`\`\`I win!\nScore: ${msg.author.username}: ${userScore.user} Exokitty: ${userScore.bot}\`\`\``)
                            checkScore(userScore)
                            break;
                        }
                        else{
                            userScore.user++
                            RPS_scores.set(msg.author.id, userScore)
                            msg.reply(`\`\`\`You win!\nScore: ${msg.author.username}: ${userScore.user} Exokitty: ${userScore.bot}\`\`\``)
                            checkScore(userScore)
                            break;
                        }
                    default:
                        discordChannel.send(`hmmm I do not recognize that command... \`!help\` for more info`)
                        break;
                }

            }
        });
    });

    ws.addEventListener('message', function (event) {

        const json = JSON.parse(event.data)
        console.log(json)

        if(botOnline){
            // Discord responses
            if(json.id === 1){
                if(json.result){
                    if(typeof json.result === "string"){
                        discordChannel.send(`\`\`\`Actual Result: ${json.result}\`\`\``)
                        let output = new Buffer.from(json.result.slice(2), 'hex').toString('utf8')
                        discordChannel.send(`\`\`\`Buffer.from() result: ${output}\`\`\``)
                    }
                    else{
                        discordChannel.send(`\`\`\`Result: ${JSON.stringify(json.result, null, 2)}\`\`\``)
                    }
                }
                else if(json.result === null){
                    discordChannel.send(`\`\`\`Result: ${json.result}\`\`\``)
                }
                else if(json.error){
                    discordChannel.send(`\`\`\`ERROR: ${json.error.message}\`\`\``)
                }
            }

            // URI() response
            if(json.id === 999999){
                let output = new Buffer.from(json.result.slice(2), 'hex').toString('utf8')
                url = output.split("Z")[1]

                fetch(encodeURI(url), {
                    method: "GET"
                })
                .then(response => response.json())
                .then(json => {
                    discordChannel.send(`Token:`)
                    discordChannel.send(`\`\`\`Name: ${decodeURI(json.name)}\nDescription: ${decodeURI(json.description)}\`\`\``)
                    discordChannel.send(`Exokit Editor URL:`)
                    discordChannel.send(json.external_url.split("%")[0])
                    discordChannel.send(`Image:`)
                    discordChannel.send(json.image.split("%")[0])
                })
            }
            
            // New minting responses
            if(json.id === 2){
                let id = 3
                filter = json.result;
                const poll = setInterval(() => {
                    ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getFilterChanges","params":[filter],"id": id}))
                    id++
                }, 10000);
            }
            if(json.result && json.result.length > 0 && json.id > 2  && json.id != 999999){
                discordChannel.send(`New pending transaction: \`\`\`${JSON.stringify(json.result, null, 2)}\`\`\``)
            }
        }
    });
}

main();
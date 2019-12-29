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

    ws.addEventListener('open', (event) => {

        discordClient.on('message', async (msg) => {
            if (msg.content.slice(0, 1) === '!') {

                let functionHash = null;
                let ethCall

                const command = msg.content.slice(1).split(", ")[0]
                let param = msg.content.slice(1).split(", ")[1]
                console.log(param)

                switch(command){
                    case "getId()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('getId(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(param.slice(2), 16).toString(16, 256 * 2)
                            msg.reply(`Calling ${command} with: ${param}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        }
                        break;
                    case "uri()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('uri(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(param, 16).toString(16, 256 * 2)
                            msg.reply(`Calling ${command} with: ${param}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        }
                        break;
                    case "getTx()":
                        if(botOnline){
                            param = param
                            msg.reply(`Calling ${command} with: ${param}`);
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getTransactionByHash","params": [param],"id":1}))
                        } 
                        break;
                    case "help":
                        discordChannel.send(`\`\`\`!<FUNCTION_NAME()>, <PARAM>\n Blockchain Functions: getTx(uint256 hash), getId(uint256 hash), uri(uint256 id)\n Other Functions: testUrl(), testEndpoints()\n Start bot: !start \n Stop bot: !stop \`\`\``)
                        break;
                    case "start":
                        botOnline = true;
                        ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_newFilter","params":[{"address": address}],"id":2}))
                        discordChannel.send(`Blockchain Bot is Online!. I'm taking orders and looking for new transactions. \`!help\` for more info`)
                        break;
                    case "stop":
                        botOnline = false;
                        discordChannel.send(`Blockchain Bot is Offline!. I'm going to sleep now, \`!start\` to wake me up. zzz \`!help\` for more info`)
                        break;
                    case "testUrl()":
                        const result = await testUrl(param)
                        msg.reply(result)
                        break;
                    case "testEndpoints()":
                        endpoints.forEach(async (url) => {
                            let status = await testUrl(url)
                            msg.reply(status)
                        })
                        break;
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
                        let output = new Buffer.from(json.result.slice(2), 'hex').toString('utf8')
                        discordChannel.send(`\`\`\`Result: ${output}\`\`\``)
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
            
            // New minting responses
            if(json.id === 2){
                let id = 3
                filter = json.result;
                const poll = setInterval(() => {
                    ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getFilterChanges","params":[filter],"id": id}))
                    id++
                }, 10000);
            }
            if(json.result && json.result.length > 0 && json.id > 2){
                discordChannel.send(`New pending transaction: \`\`\`${JSON.stringify(json.result, null, 2)}\`\`\``)
            }
        }
    });
}

main();
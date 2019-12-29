const WebSocket = require('ws');
const { discordBot } = require('./discordBot.js')
const createKeccakHash = require('keccak')
const BN = require('bn.js');
const btoa = require('btoa')

const main = async () => {

    const discordClient = await discordBot()
    discordChannel = discordClient.channels.get("660532635428454451");
    const ws = new WebSocket('wss://rinkeby.infura.io/ws/v3/db401ebec15c4b319bff5e15779e9349');
    const address = `0x192510a46854d86aE4B72124Bc82Fa31C8E388cD`
    let filter = null
    let botOnline = false

    ws.addEventListener('open', function (event) {

        discordClient.on('message', msg => {
            if (msg.content.slice(0, 1) === '!') {

                let functionHash = null;
                let param = null;
                let ethCall


                switch(msg.content.slice(1).split(",")[0]){
                    case "getId()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('getId(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(msg.content.slice(1).split(", ")[1].slice(2), 16).toString(16, 256 * 2)
                            msg.reply(`Calling ${msg.content.slice(1).split(", ")[0]} with: ${msg.content.slice(1).split(", ")[1]}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        }
                        break;
                    case "uri()":
                        if(botOnline){
                            functionHash = `0x${createKeccakHash('keccak256').update('uri(uint256)').digest('hex').slice(0, 8)}`
                            param = new BN(msg.content.slice(1).split(", ")[1], 16).toString(16, 256 * 2)
                            msg.reply(`Calling ${msg.content.slice(1).split(", ")[0]} with: ${msg.content.slice(1).split(", ")[1]}`);
                            ethCall = functionHash + param
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_call","params": [{"to": address, "data": ethCall}, "latest"],"id":1}))
                        }
                        break;
                    case "getTx()":
                        if(botOnline){
                            param = msg.content.slice(1).split(", ")[1]
                            msg.reply(`Calling ${msg.content.slice(1).split(", ")[0]} with: ${msg.content.slice(1).split(", ")[1]}`);
                            ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getTransactionByHash","params": [param],"id":1}))
                        } 
                        break;
                    case "help":
                        discordChannel.send(`\`\`\`<FUNCTION_NAME()>, <PARAM> \n Blockchain Functions: getTx(uint256 hash), getId(uint256 hash), uri(uint256 id) \n Start bot: !start \n Stop bot: !stop\`\`\``)
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
                    default:
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
const WebSocket = require('ws');
const { discordBot } = require('./discordBot.js')

const main = async () => {

    const discordClient = await discordBot()
    discordChannel = discordClient.channels.get("660532635428454451");

    const ws = new WebSocket('wss://rinkeby.infura.io/ws/v3/db401ebec15c4b319bff5e15779e9349');

    const address = `0x192510a46854d86aE4B72124Bc82Fa31C8E388cD`

    // Connection opened
    ws.addEventListener('open', function (event) {
        console.log("open")
        // Filter for our address
        ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_newFilter","params":[{"address": address}],"id":1}))
    });

    // Listen for messages
    ws.addEventListener('message', function (event) {
        const json = JSON.parse(event.data)
        console.log(json)
        if(json.id === 1){
            let id = 2
            const poll = setInterval(() => {
                ws.send(JSON.stringify({"jsonrpc":"2.0","method":"eth_getFilterChanges","params":[json.result],"id": id}))
                id++
            }, 10000);
        }
        if(json.result.length && json.id !== 1){
            discordChannel.send(`New pending transaction: \`\`\`${JSON.stringify(json.result, null, 2)}\`\`\``)
        }
    });
}

main();
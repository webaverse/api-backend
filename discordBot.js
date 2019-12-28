const Discord = require('discord.js');
const { discordBotToken } = require('./secrets.js')

const discordBot = () => {
    return new Promise((accept, reject) => {
        const client = new Discord.Client();
        client.login(discordBotToken)
        client.once('ready', () => {
            console.log('Discord Bot Ready!');
            accept(client)
        });
    })
}

module.exports = {
    discordBot
};


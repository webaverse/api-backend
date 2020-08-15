const { XRChannelConnection } = require('./xrrtc.js');

const main = () => {
    const roomId = 'meta';
    const channelConnection = new XRChannelConnection(`wss://ec2-13-57-40-111.us-west-1.compute.amazonaws.com/?c=${encodeURIComponent(roomId)}`);
    channelConnection.addEventListener('peerconnection', e => {
        const peerConnection = e.data;
        console.log(peerConnection);
    });
    peerConnection.send('pose', {
        position: [1, 2, 3],
    });
}

main();
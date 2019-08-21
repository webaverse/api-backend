#!/usr/bin/env node

const chromium = require('chrome-aws-lambda');
const robot = require('robotjs');

robot.setXDisplayName(process.env.DISPLAY);
robot.setMouseDelay(0);

(async () => {
const u = process.argv[2];
const peerConnectionId = process.argv[3];

let result = null;
let error = null;
let browser = null;

chromium.args.push('--use-fake-ui-for-media-stream');
// chromium.args.splice(chromium.args.indexOf('--start-maximized'), 1);
chromium.defaultViewport.width = 1920;
chromium.defaultViewport.height = 1080;

try {
  browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  let page = await browser.newPage();
  page.on('console', msg => {
    console.log(msg.args().join(' '));
  });
  page.on('dialog', d => {
    console.log('got dialog', d);
  });
  page.on('popup', p => {
    console.log('got popup', p);
  });

  await page.setViewport({
    width: 1980,
    height: 1024,
    deviceScaleFactor: 1,
  });

  await page.goto(u);

  console.log('eval 1');

  const interval = setInterval(() => {
    console.log('pos', robot.getMousePos());
    robot.moveMouse(683, 197);
    robot.mouseClick();
    robot.moveMouse(260, 230);
    robot.mouseClick();
    robot.moveMouse(737, 536);
    robot.mouseClick();
  }, 1000);

  const media = await page.evaluate(async ({peerConnectionId}) => {
    try {
      function _randomString() {
        return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
      }

      console.log('lol 1');
      const mediaStreamPromise = navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      console.log('lol 2');
      const mediaStream = await mediaStreamPromise;
      console.log('lol 3', mediaStream);

      const connectionId = _randomString();
      const peerConnectionConfig = {
        iceServers: [
          {'urls': 'stun:stun.stunprotocol.org:3478'},
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
      };
      const peerConnection = new RTCPeerConnection(peerConnectionConfig);
      console.log('lol 4', mediaStream.getVideoTracks().length);
      peerConnection.addTrack(mediaStream.getVideoTracks()[0], mediaStream);
      peerConnection.onicecandidate = e => {
        const {candidate} = e;
        s.send(JSON.stringify({
          method: 'iceCandidate',
          src: connectionId,
          dst: peerConnectionId,
          candidate,
        }));
      };

      console.log('lol 5');

      const s = new WebSocket('wss://presence.webaverse.com/');
      s.onopen = () => {
        console.log('browser presence socket open');

        peerConnection.createOffer()
          .then(offer => {
            peerConnection.setLocalDescription(offer);

            console.log('browser send offer 1');
            console.log('browser send offer 2' + JSON.stringify({
              method: 'respondBrowser',
              src: connectionId,
              dst: peerConnectionId,
              offer,
            }));

            s.send(JSON.stringify({
              method: 'respondBrowser',
              src: connectionId,
              dst: peerConnectionId,
              offer,
            }));
          })
          .catch(err => {
            console.warn(err.stack);
          });
      };
      s.onmessage = e => {
        console.log('browser got message', e.data);
        
        const data = JSON.parse(e.data);
        const {method} = data;
        if (method === 'answer') {
          const {answer} = data;
          peerConnection.setRemoteDescription(answer);
        } else if (method === 'iceCandidate') {
          const {candidate} = data;
          peerConnection.addIceCandidate(candidate)
            .catch(err => {
              console.warn('add ice candidate error', err.stack);
            });
        }
      };

      console.log('lol 6');

      await new Promise((accept, reject) => {
        peerConnection.onconnectionstatechange = e => {
          const {connectionState} = e;
          console.log('connection state change', connectionState);
          if (connectionState === 'connected') {
            accept();
          } else if (connectionState == 'failed') {
            reject(new Error('rtc peer connection failed'));
          }
        };
      });

      console.log('lol 7');
    } catch(err) {
      console.warn(err.stack);
    }
  }, {
    peerConnectionId,
  });

  clearInterval(interval);

  console.log('eval 2');

  console.log('got media', media);

  // console.log('got anchors', anchors);

  /* result = await page.screenshot({
    type: 'jpeg',
    fullPage: true,
  }); */
} catch (err) {
  console.warn(err.stack);
} finally {
  if (browser !== null) {
    await browser.close();
  }
}

})();

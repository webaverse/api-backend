#!/usr/bin/env node

const chromium = require('chrome-aws-lambda');
const robot = require('robotjs');

robot.setMouseDelay(0);

(async () => {
const u = process.argv[2];
const peerConnectionId = process.argv[3];

let result = null;
let error = null;
let browser = null;

/* chromium.args.splice(chromium.args.indexOf('--start-maximized'), 1);
chromium.defaultViewport.width = 1280;
chromium.defaultViewport.height = 1280; */

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
    robot.moveMouse(1167, 186);
    robot.mouseClick();
    robot.moveMouse(744, 219);
    robot.mouseClick();
    robot.moveMouse(1215, 522);
    robot.mouseClick();
  }, 1000);

  const media = await page.evaluate(async () => {
    try {
      function _randomString() {
        return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
      }

      console.log('lol 1');
      const mediaPromise = navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      console.log('lol 2');
      const media = await mediaPromise;
      console.log('lol 3', media);

      const connectionId = _randomString();
      const peerConnectionConfig = {
        iceServers: [
          {'urls': 'stun:stun.stunprotocol.org:3478'},
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
      };
      const peerConnection = new RTCPeerConnection(peerConnectionConfig);
      const videoTrack = mediaPromise.getVideoTracks()[0];
      peerConnection.addTrack(videoTrack);
      peerConnection.onicecandidate = e => {
        const {candidate} = e;
        s.send(JSON.stringify({
          method: 'iceCandidate',
          src: connectionId,
          dst: peerConnectionId,
          candidate,
        }));
      };

      const s = new WebSocket('wss://presence.webaverse.com/');
      s.onopen = () => {
        console.log('browser presence socket open');

        peerConnection.createOffer()
          .then(offer => {
            peerConnection.setLocalDescription(offer);

            s.send(JSON.stringify({
              method: 'respondBrowser',
              src: connectionId,
              dst: peerConnectionId,
              offer,
            }));
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
    } catch(err) {
      console.warn(err.stack);
    }
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

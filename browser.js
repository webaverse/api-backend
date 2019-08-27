#!/usr/bin/env node

const path = require('path');
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

const {args} = chromium;
args.splice(args.indexOf('--start-maximized'), 1);
args.push('--window-position=0,0');
args.push('--window-size=1920,1920');
console.log('got args', args);
chromium.defaultViewport.width = 1920;
chromium.defaultViewport.height = 1920;

try {
  browser = await chromium.puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  // const page2 = await browser.newPage();
  const page2 = (await browser.pages())[0];
  await page2.goto(u);

  let rtcInterval = null;
  const _startRtc = () => {
    console.log('start rtc');
    rtcInterval = setInterval(() => {
      console.log('tick rtc');
      // console.log('pos', robot.getMousePos());

      robot.moveMouse(1163, 182);
      robot.mouseClick();
      // robot.moveMouse(740, 218);
      robot.moveMouse(732, 261);
      robot.mouseClick();
      robot.moveMouse(1214, 524);
      robot.mouseClick();
    }, 200);
  };
  const _endRtc = () => {
    console.log('end rtc');
    clearInterval(rtcInterval);
    rtcInterval = null;
  };

  const page = await browser.newPage();
  let down = false;
  page.on('console', async msg => {
    const args = await Promise.all(msg.args().map(handle => handle.jsonValue()));
    console.log(args);

    if (args.length >= 1 && args[0] === 'startRtc') {
      _startRtc();
    } else if (args.length >= 1 && args[0] === 'endRtc') {
      _endRtc();
    } else if (args.length >= 2 && args[0] === 'rtcMessage') {
      const data = args[1];
      const j = (() => {
        try {
          return JSON.parse(data);
        } catch (err) {
          return null;
        }
      })();
      if (j) {
        const {method} = j;
        switch (method) {
          case 'mousemove': {
            const {x, y} = j;
            if (down) {
              robot.moveDrag(x, y);
            } else {
              robot.moveMouse(x, y);
            }
            break;
          }
          case 'mousedown': {
            robot.mouseToggle('down');
            down = true;
            break;
          }
          case 'mouseup': {
            robot.mouseToggle('up');
            down = false;
            break;
          }
          case 'click': {
            robot.mouseClick();
            break;
          }
          default: {
            break;
          }
        }
      }
    }
  });
  page.on('dialog', d => {
    console.log('got dialog', d);
  });
  page.on('popup', p => {
    console.log('got popup', p);
  });
  page.on('error', err => {
    console.warn(err.toString());
  });
  page.on('pageerror', err => {
    console.warn(err.toString());
  });

  await page.setViewport({
    width: 1920,
    height: 1920,
    deviceScaleFactor: 1,
  });

  // await page.goto(u);
  await page.goto(`file://${path.join(__dirname, 'blank.html')}`);

  console.log('eval 1');

  const media = await page.evaluate(async ({peerConnectionId}) => {
    try {
      function _randomString() {
        return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
      }

      const mediaStreamPromise = navigator.mediaDevices.getDisplayMedia({
        video: true/* {
          mandatory: {
            // chromeMediaSource: 'screen',
            displaySurface: 'browser',
          },
          optional: [],
        } */,
        audio: false,
      });
      console.log('lol 2');

      setTimeout(() => {
        console.log('startRtc');
      });
      const mediaStream = await mediaStreamPromise;
      console.log('endRtc');

      console.log('lol 3 ' + JSON.stringify(mediaStream));

      const connectionId = _randomString();
      const peerConnectionConfig = {
        iceServers: [
          {'urls': 'stun:stun.stunprotocol.org:3478'},
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
      };
      const peerConnection = new RTCPeerConnection(peerConnectionConfig);
      console.log('lol 4 ' + mediaStream.getVideoTracks().length + ' ' + JSON.stringify(mediaStream.getVideoTracks()[0].getSettings()));
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
      const dataChannel = peerConnection.createDataChannel('browser', {id: 0, negotiated: true});
      dataChannel.onopen = () => {
        console.log('browser got data channel', !!dataChannel);
        dataChannel.onmessage = e => {
          console.log('rtcMessage', e.data);
        };
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

              if (!candidate) {
                return peerConnection.addIceCandidate({candidate: '', sdpMid: null, sdpMLineIndex: null})
                  .catch(err => {
                    console.warn('add ice candidate error', err.stack);
                  });
              }
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

      /* await new Promise((accept, reject) => {
        setTimeout(accept, 1000*60*1000);
      }); */

      console.log('lol 8');
    } catch(err) {
      console.warn(err.stack);
    }
  }, {
    peerConnectionId,
  });

  console.log('eval 2');

  console.log('got media', media);

  await new Promise((accept, reject) => {
    process.stdin.resume();
    process.stdin.on('end', () => {
      accept();
    });
  });

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

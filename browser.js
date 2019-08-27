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

const {args} = chromium;
args.splice(args.indexOf('--start-maximized'), 1);
args.push('--window-position=0,0');
args.push('--window-size=1920,1080');
chromium.defaultViewport.width = 1920;
chromium.defaultViewport.height = 1080;

try {
  browser = await chromium.puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  let page = await browser.newPage();
  page.on('console', msg => {
    console.log(JSON.stringify(msg.args()));
  });
  page.on('dialog', d => {
    console.log('got dialog', d);
  });
  page.on('popup', p => {
    console.log('got popup', p);
  });

  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  await page.goto(u);

  const _console1 = msg => {
    const args = msg.args();
    if (args.length > 0 && (args[0] + '') === 'startRtc') {
      const rtcInterval = setInterval(() => {
        // console.log('pos', robot.getMousePos());

        robot.moveMouse(1163, 182);
        robot.mouseClick();
        robot.moveMouse(740, 218);
        robot.mouseClick();
        robot.moveMouse(1214, 524);
        robot.mouseClick();
      }, 500);

      page.removeListener('console', _console1);
      const _console2 = () => {
        const args = msg.args();
        if (args.length > 0 && (args[0] + '') === 'endRtc') {
          clearInterval(rtcInterval);

          page.removeListener('console', _console2);
        }
      };
      page.on('console', _console2);
    }
  };
  page.on('console', _console1);

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
      peerConnection.ondatachannel = e => {
        const {channel} = e;
        let down = false;
        channel.onmessage = e => {
          const {data} = e;
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
              /* case 'click': {
                robot.mouseClick();
                break;
              } */
              default: {
                break;
              }
            }
          }
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

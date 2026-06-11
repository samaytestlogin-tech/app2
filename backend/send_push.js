const webPush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY || 'BKLtvWU6Ub89F667k8bmXw4ngUdHYY__aU7a8ZdpLRBAARHBWDaSzu8TBFWqOnMvCVHJ_YNhmx3Rlpz6Z94TqIU';
const privateKey = process.env.VAPID_PRIVATE_KEY || '9INjmgP2dibUxlpHWxSCeRiF3g75mZbiVV80ZOhY12E';

webPush.setVapidDetails(
  'mailto:support@antigravity.chat',
  publicKey,
  privateKey
);

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node send_push.js <subscription_json> <payload_json>');
  process.exit(1);
}

const subscription = JSON.parse(args[0]);
const payload = args[1];

webPush.sendNotification(subscription, payload)
  .then(response => {
    console.log('Push sent successfully:', response.statusCode);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error sending push notification:', err);
    process.exit(1);
  });

// index.js (no dotenv needed)
'use strict';
const admin = require('firebase-admin');

// If the key file is in the same folder:
const serviceAccount = require('./test-notification-f518c-firebase-adminsdk-fbsvc-268e7146a4.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * Usage:
 * node index.js <FCM_TOKEN> "Title" "Body" --image=https://your.cdn.com/banner.jpg --data='{"screen":"OrderDetail","orderId":"123"}'
 * or:
 * node index.js <FCM_TOKEN> "Title" "Body" --data=screen=OrderDetail,orderId=123
 */

const rawArgs = process.argv.slice(2);
const positional = [];
const flags = {};

for (const a of rawArgs) {
  if (a.startsWith('--')) {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    flags[k] = rest.join('='); // support values containing '='
  } else {
    positional.push(a);
  }
}

const [token, title = 'Hello', body = 'From Node'] = positional;
if (!token) {
  console.error('Usage: node index.js <FCM_TOKEN> [title] [body] [--image=URL] [--data=JSON|k=v,k2=v2]');
  process.exit(1);
}

const image = flags.image; // public HTTPS URL, ideally ≤1MB

// Parse --data (JSON first; fallback to comma sep key=value)
let data = {};
if (flags.data) {
  try {
    const parsed = JSON.parse(flags.data);
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    data = flags.data.split(',').reduce((acc, pair) => {
      const [k, ...rest] = pair.split('=');
      if (k) acc[k.trim()] = (rest.join('=') || '').trim();
      return acc;
    }, {});
  }
}
// Ensure all data values are strings (FCM data payload requirement)
for (const k of Object.keys(data)) data[k] = String(data[k]);

const message = {
  token,

  // Shown by system UI (Android & iOS foreground/background when allowed)
  notification: { title, body },

  // ANDROID
  android: {
    priority: 'high',
    notification: {
      channelId: 'default',           // must exist in your RN app
      sound: 'default',
      ...(image ? { imageUrl: image } : {}), // big picture on Android
    },
    data: {}, // reserved, but keep empty so nothing odd goes here
  },

  // iOS / APNs
  apns: {
    headers: {
      // 10 = immediate, 5 = background
      'apns-priority': '10',
    },
    payload: {
      aps: {
        alert: { title, body },
        sound: 'default',
        // Needed for rich media via Notification Service Extension
        'mutable-content': 1,
        // If you ever want silent/background, set 'content-available': 1 (and remove alert/sound)
        // 'content-available': 1,
      },
    },
    // FCM-specific options for iOS rich media (image in banner)
    ...(image ? { fcm_options: { image } } : {}),
  },

  // Custom key/value payload your app reads (strings only)
  data,
};

admin
  .messaging()
  .send(message)
  .then((id) => {
    console.log('✅ Sent! Message ID:', id);
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Send failed:', e.code, e.message);
    if (e.code === 'messaging/registration-token-not-registered') {
      console.error('Token invalid/expired or app uninstalled. Get a fresh token.');
    }
    process.exit(1);
  });

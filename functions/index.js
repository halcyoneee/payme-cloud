const functions = require('firebase-functions');
const admin = require('firebase-admin');
const get = require('lodash.get');
const waterfall = require('async/waterfall');

admin.initializeApp(functions.config().firebase);

/* Listens for new payment added to /users/{userId}/payments/{paymentId}
and sends a notification to relevant payee(s) user */
exports.pushNotification = functions.database
    .ref('/users/{userId}/payments/{paymentId}')
    .onCreate((snapshot, context) => {
        const userId = context.params.userId;
        const paymentId = context.params.paymentId;
        // console.log(`STEP 1: ${userId} with new payment ${paymentId}`);

        const paymentData = snapshot.val();
        const paymentType = paymentData.mType;

        // return Promise.resolve();
        waterfall([
            function (callback) {
                if (paymentType === 'owe') {
                    // console.log(`STEP 2.1: Found payee ${userId}`);

                    const ref = admin.database().ref(`/users`);
                    ref.orderByKey().equalTo(userId).once("value", (snapshot) => {
                        // console.log('STEP 2.2: INSIDE OF SNAPSHOT');

                        snapshot.forEach((childSnapshot) => {
                            const childKey = childSnapshot.key;
                            const childData = childSnapshot.val();
                            // console.log('STEP 2.3: Key '+ childKey);
                            const token = get(childData, 'token', null);
                            // console.log('STEP 2.4: TOKEN = ',token);
                            if (token) {
                                return callback(null, token);
                            } else {
                                return callback(`No device token found in ${userId}`);
                            }
                        });
                    });
                } else {
                    return callback("skip", "");
                }
            },
            function (token, callback) {
                // console.log('STEP 3, setting up notification to be sent');
                const message = `You owe ${paymentData.mName} $${paymentData.mAmount}.`;
                const payload = {
                    notification: {
                        // title: 'PayMe',
                        body: message,
                        sound: "default"
                    }
                };
                /* Create an options object that contains the time to live for the notification and the priority. */
                const options = {
                    priority: "normal",
                    timeToLive: 60 * 60 * 24 //24 hours
                };

                const result = admin.messaging().sendToDevice(token, payload, options);
                return callback(null, result);
            }
        ], (err, result) => {
            // console.log('STEP 4, final callback','\nerr ',err,'\nresult ',result);
            if (err === "skip") {
                return Promise.resolve();
            } else if (err) {
                return Promise.reject(err);
            }
            
            return result;
        });
        
        // console.log('right after waterfall ',userId);
        return Promise.resolve();
    });
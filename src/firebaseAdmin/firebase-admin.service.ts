// /* eslint-disable prettier/prettier */
// import { Injectable } from '@nestjs/common';
// import * as admin from 'firebase-admin';
// import { serviceAccount } from '../certs/firebase-adminsdk';

// @Injectable()
// export class FirebaseAdminService {
//   private readonly messaging: admin.messaging.Messaging;

//   constructor() {
//     if (!admin.apps.length) {
//       admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
//       });
//     }
//     this.messaging = admin.messaging();
//   }

//   async sendToDevice(
//     deviceToken: string,
//     payload: {
//       notification?: { title: string; body: string };
//       data?: { [key: string]: string };
//     },
//   ) {
//     const message: admin.messaging.Message = {
//       token: deviceToken,
//       notification: payload.notification,
//       data: payload.data,
//       android: { priority: 'high' },
//       apns: { payload: { aps: { sound: 'default' } } },
//     };

//     try {
//       const result = await this.messaging.send(message);
//       return { success: true, result };
//     } catch (error) {
//       console.error('Firebase Error:', error);
//       return { success: false, error };
//     }
//   }
// }

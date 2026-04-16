// /* eslint-disable prettier/prettier */

// import { Controller, Post, Body } from '@nestjs/common';
// import { FirebaseAdminService } from './firebase-admin.service';

// @Controller('firebase')
// export class FirebaseAdminController {
//   constructor(private readonly firebaseService: FirebaseAdminService) {}

//   @Post('send-notification')
//   async sendNotification(
//     @Body()
//     body: {
//       token: string;
//       title: string;
//       body: string;
//       data?: { [key: string]: string };
//     },
//   ) {
//     return this.firebaseService.sendToDevice(body.token, {
//       notification: {
//         title: body.title,
//         body: body.body,
//       },
//       data: body.data,
//     });
//   }
// }

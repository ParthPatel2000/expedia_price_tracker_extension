const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

exports.watchSendEmailFlag = onDocumentUpdated(
    "users/{userId}/emailRequests/send",
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const userId = event.params.userId;

      // Only trigger if `sendEmail` changed from false (or missing) to true
      if (
        (!before.sendEmail || before.sendEmail === false) &&
        after.sendEmail === true
      ) {
        const price = after.price;

        if (price && price > 0) {
          logger.info(`📧 Sending email for user ${userId} with price ${price}`);

          // Your email sending logic here
          // e.g., call Nodemailer, SendGrid, etc.

          // Mark as handled to prevent re-trigger
          await event.data.after.ref.set(
              {sendEmail: false, processed: true},
              {merge: true},
          );
        } else {
          logger.warn(`⚠️ Email not sent for ${userId}: Missing or zero price`);

          await event.data.after.ref.set({sendEmail: false}, {merge: true});
        }
      } else {
        logger.debug(`🔁 No actionable change for ${userId}`);
      }

      return;
    },
);

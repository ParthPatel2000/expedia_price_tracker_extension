const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASS = defineSecret("EMAIL_PASS");

exports.watchSendEmailFlag = onDocumentUpdated(
    {
      document: "users/{userId}/emailRequests/send",
      secrets: [EMAIL_USER, EMAIL_PASS], // 🔑 inject secrets
    },
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const userId = event.params.userId;

      if (
        (!before.sendEmail || before.sendEmail === false) &&
      after.sendEmail === true
      ) {
        const price = after.price;
        const recipient = after.email;

        if (price && recipient) {
          logger.info(`📧 Sending email for user ${userId} to ${recipient}`);

          try {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: EMAIL_USER.value(),
                pass: EMAIL_PASS.value(),
              },
            });

            await transporter.sendMail({
              from: `"Your App Name" <${EMAIL_USER.value()}>`,
              to: recipient,
              subject: "Your Hotel Prices",
              text: `Here are your prices:\n\n` +
                `${JSON.stringify(price, null, 2)}`,
            });

            logger.info(`✅ Email sent successfully to ${recipient}`);

            await event.data.after.ref.set(
                {sendEmail: false, processed: true},
                {merge: true},
            );
          } catch (err) {
            logger.error(`❌ Failed to send email: ${err.message}`);
          }
        } else {
          logger.warn(`⚠️ Email not sent: Missing price or recipient`);
          await event.data.after.ref.set({sendEmail: false}, {merge: true});
        }
      }
    },
);

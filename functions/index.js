const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASS = defineSecret("EMAIL_PASS");

exports.sendEmailOnCreate = onDocumentCreated(
    {
      document: "users/{userId}/emailRequests/send",
      secrets: [EMAIL_USER, EMAIL_PASS],
    },
    async (event) => {
      const data = event.data.data();
      const userId = event.params.userId;

      const prices = data.prices;
      const recipient = data.email;

      if (!prices || !recipient) {
        logger.warn(`⚠️ Missing prices or email for user ${userId}`);
        return;
      }

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
          html: pricesToHtmlTable(prices),
        });

        logger.info(`✅ Email sent to ${recipient} for user ${userId}`);

        // Delete the document after sending
        await event.data.ref.delete();
        logger.info(`🗑️ Deleted email request document after processing.`);
      } catch (err) {
        logger.error(`❌ Email failed for user ${userId}: ${err.message}`);
        await event.data.ref.delete();
      }
    },
);


/**
 * Converts a prices object to an HTML table string.
 *
 * @param {Object} prices - An object containing hotel price data.
 * Each key is a hotel name, and each value is an object with:
 *   - price: string (e.g., "$71")
 *   - timestamp: string (ISO date format)
 *
 * @return {string} HTML string representing a table with hotel prices and
 *   last updated timestamps formatted as UTC date-time.
 */
function pricesToHtmlTable(prices) {
  let rows = "";

  for (const [hotel, data] of Object.entries(prices)) {
    const price = data.price || "N/A";
    const timestamp = data.timestamp ?
      new Date(data.timestamp).toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) :
      "N/A";

    rows += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${hotel}</td>
        <td
          style="padding: 8px; border: 1px solid #ddd; text-align: right;"
        >${price}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${timestamp}</td>
      </tr>
    `;
  }

  return `
    <table 
    style="border-collapse: collapse; width: 100%; max-width: 600px; 
    font-family: Arial, sans-serif;">
      <thead>
        <tr>
          <th 
          style="padding: 8px; border: 1px solid #ddd; background-color:
           #f4f4f4; text-align: left;">Hotel</th>
          <th 
          style="padding: 8px; border: 1px solid #ddd; background-color:
           #f4f4f4;">Price</th>
          <th 
          style="padding: 8px; border: 1px solid #ddd; background-color:
           #f4f4f4;">Last Updated (UTC)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

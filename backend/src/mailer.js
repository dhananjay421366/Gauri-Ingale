import nodemailer from "nodemailer";

const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
const transporterReady = configured
    ? Promise.resolve(nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      }))
    : nodemailer.createTestAccount().then((account) => nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: { user: account.user, pass: account.pass },
      })).catch((error) => {
          console.warn(`[mail:dev] Could not create Ethereal test mailbox: ${error.message}`);
          return null;
      });

export async function sendAlertEmail(alert, recipients) {
    if (!recipients.length) return;
    const message = {
        from: process.env.MAIL_FROM || process.env.SMTP_USER || "infolab@localhost",
        to: recipients.join(","),
        subject: `[INFOLAB ${alert.severity}] ${alert.type}`,
        text: `${alert.message}\n\nAlert type: ${alert.type}\nSeverity: ${alert.severity}`,
        html: `<div style="font-family:Arial,sans-serif"><h2>INFOLAB alert</h2><p><strong>${alert.message}</strong></p><p>Type: ${alert.type}<br>Severity: ${alert.severity}</p></div>`,
    };
    const transporter = await transporterReady;
    if (!transporter) {
        console.log(`[mail:dev] Alert created but no mail transport is available: ${message.subject}`);
        return;
    }
    const info = await transporter.sendMail(message);
    const preview = nodemailer.getTestMessageUrl(info);
    console.log(`[mail] alert sent to ${message.to}${preview ? ` · preview: ${preview}` : ""}`);
}

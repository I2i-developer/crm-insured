// const sgMail = require('sendgrid/mail');
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY;

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

const sendEmail = async (to, subject, message) => {
  try {
    if (!apiKey) {
      console.log('[MOCK EMAIL] To:', to, 'Subject:', subject, 'Message:', message);
      return { success: true, mock: true, message: 'Email sent (mock mode)' };
    }

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@insurancerenewal.com',
      subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Insurance Renewal Notification</h2>
          <p style="color: #666; line-height: 1.6;">${message}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            This is an automated message from the Insurance Renewal Management Portal.
          </p>
        </div>
      `
    };

    const [response] = await sgMail.send(msg);

    return {
      success: true,
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id']
    };
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = { sendEmail };

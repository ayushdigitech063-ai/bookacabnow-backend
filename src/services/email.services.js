const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "test@example.com",
    pass: process.env.EMAIL_PASS || "dummy_password"
  }
});

const sendVerificationEmail = async (toEmail, token) => {
  const verificationUrl = `${process.env.APP_BASE_URL || "http://localhost:5000"}/api/v1/auth/verify-email?token=${token}`;

  // Development/Local mode: Free testing on terminal console
  if (process.env.NODE_ENV !== "production") {
    console.log("\n=======================================================");
    console.log(`[TEST EMAIL DISPATCH] To: ${toEmail}`);
    console.log(`Verification URL: ${verificationUrl}`);
    console.log("=======================================================\n");
    return true;
  }

  const mailOptions = {
    from: `"Cab Aggregator Platform" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Verify Your Account",
    html: `
      <h2>Welcome to Cab Platform</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${verificationUrl}" target="_blank">Verify Email</a>
      <p>This link is valid for 24 hours.</p>
    `
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };
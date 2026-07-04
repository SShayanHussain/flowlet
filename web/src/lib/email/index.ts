/**
 * Dev-stubbed email service.
 * In production, this would use Resend, SendGrid, etc.
 */

export async function sendVerificationEmail(email: string, token: string) {
  if (process.env.NODE_ENV === "development") {
    console.log("=========================================");
    console.log(`✉️ EMAIL STUB: Verify Email`);
    console.log(`To: ${email}`);
    console.log(`Link: http://localhost:3000/verify-email?token=${token}`);
    console.log("=========================================");
  } else {
    console.warn("Real email sending not implemented yet!");
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (process.env.NODE_ENV === "development") {
    console.log("=========================================");
    console.log(`✉️ EMAIL STUB: Password Reset`);
    console.log(`To: ${email}`);
    console.log(`Link: http://localhost:3000/reset-password?token=${token}`);
    console.log("=========================================");
  } else {
    console.warn("Real email sending not implemented yet!");
  }
}

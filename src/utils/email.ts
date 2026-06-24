import { Resend } from "resend";
import { config } from "../config";

function getResend(): Resend {
  return new Resend(config.resendApiKey);
}

export async function sendMagicLinkEmail(to: string, loginUrl: string): Promise<void> {
  if (!config.resendApiKey) {
    console.log(`[magic-link] ${to}: ${loginUrl}`);
    return;
  }

  await getResend().emails.send({
    from: config.fromEmail,
    to,
    subject: "Your MedSchedule login link",
    html: `
      <p>Click the link below to sign in to MedSchedule. It expires in 15 minutes.</p>
      <p><a href="${loginUrl}" style="font-size:16px;font-weight:bold;">Sign in to MedSchedule</a></p>
      <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!config.resendApiKey) {
    console.log(`[password-reset] ${to}: ${resetUrl}`);
    return;
  }

  await getResend().emails.send({
    from: config.fromEmail,
    to,
    subject: "Reset your MedSchedule password",
    html: `
      <p>Click the link below to reset your password. It expires in 15 minutes.</p>
      <p><a href="${resetUrl}" style="font-size:16px;font-weight:bold;">Reset password</a></p>
      <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
    `,
  });
}

export async function sendStaffInviteEmail(to: string, inviteUrl: string, facilityName: string): Promise<void> {
  if (!config.resendApiKey) {
    console.log(`[staff-invite] ${to}: ${inviteUrl}`);
    return;
  }

  await getResend().emails.send({
    from: config.fromEmail,
    to,
    subject: `You've been invited to join ${facilityName} on MedSchedule`,
    html: `
      <p>You've been invited to join <strong>${facilityName}</strong> on MedSchedule.</p>
      <p>Click the link below to create your account. This invitation expires in 7 days.</p>
      <p><a href="${inviteUrl}" style="font-size:16px;font-weight:bold;">Accept invitation</a></p>
      <p style="color:#888;font-size:12px;">If you weren't expecting this, you can ignore this email.</p>
    `,
  });
}

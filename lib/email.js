import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@renoisethemes.com';

export async function sendPasswordReset(email, resetUrl) {
  if (!resend) {
    console.log('[EMAIL] Resend not configured. Reset URL:', resetUrl);
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your Renoise Themes password',
      html: `<p>Hi,</p>
        <p>You requested a password reset for your Renoise Themes account.</p>
        <p><a href="${resetUrl}" style="color:#6b9f40;">Click here to reset your password</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #2e2e34;">
        <p style="color:#787880;font-size:11px;">Renoise Themes — renoisethemes.com</p>`,
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    });

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL] Failed to send password reset:', err);
    return { success: false, error: err.message };
  }
}

export async function sendWelcome(email, username) {
  if (!resend) {
    console.log('[EMAIL] Resend not configured. Welcome email skipped for', email);
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to Renoise Themes',
      html: `<p>Hi ${username},</p>
        <p>Welcome to <strong>Renoise Themes</strong> — the community gallery for Renoise color themes.</p>
        <p>Start exploring: <a href="https://renoisethemes.com" style="color:#6b9f40;">renoisethemes.com</a></p>
        <p>Got a theme? <a href="https://renoisethemes.com/upload" style="color:#6b9f40;">Upload it</a> and share it with the community.</p>
        <hr style="border:none;border-top:1px solid #2e2e34;">
        <p style="color:#787880;font-size:11px;">Renoise Themes — renoisethemes.com</p>`,
      text: `Welcome to Renoise Themes, ${username}!\n\nStart exploring: https://renoisethemes.com`,
    });

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL] Failed to send welcome:', err);
    return { success: false, error: err.message };
  }
}

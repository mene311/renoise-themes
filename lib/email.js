import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@renoisethemes.com';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

export async function sendVerificationEmail(email, username, verifyUrl) {
  if (!resend) {
    console.log('[EMAIL] Resend not configured. Verify URL:', verifyUrl);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@renoisethemes.com',
      to: email,
      subject: 'Verify your email — Renoise Theme Share',
      html: `<div style="font-family:monospace;max-width:480px;margin:0 auto;padding:24px;background:#161618;color:#c8c8d0;border:1px solid #2e2e34;">
        <h2 style="color:#e8e8f0;font-size:16px;">Welcome, ${username}</h2>
        <p style="font-size:14px;line-height:1.6;color:#787880;">Click the button below to verify your email and activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:10px 24px;background:#6b9f40;color:#111;text-decoration:none;font-weight:600;font-size:13px;">Verify Email</a>
        <p style="font-size:11px;color:#505058;">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
      </div>`,
    });
    if (error) console.error('[EMAIL] Verification email failed:', error);
  } catch (err) {
    console.error('[EMAIL] Verification email error:', err);
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


export async function sendFeedbackReply(email, name, originalMessage, replyMessage) {
  if (!resend) {
    console.log('[EMAIL] Resend not configured. Feedback reply skipped for', email);
    return { success: false, error: 'Email service not configured' };
  }

  const safeName = name || 'there';
  const safeReply = escapeHtml(replyMessage);
  const safeOriginal = escapeHtml(originalMessage);
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reply from Renoise Theme Share',
      html: `<div style="font-family:monospace;max-width:560px;margin:0 auto;padding:24px;background:#161618;color:#c8c8d0;border:1px solid #2e2e34;">
        <h2 style="color:#e8e8f0;font-size:16px;margin-top:0;">Reply from Renoise Theme Share</h2>
        <p style="font-size:14px;line-height:1.6;color:#c8c8d0;white-space:pre-wrap;">${safeReply}</p>
        <hr style="border:none;border-top:1px solid #2e2e34;margin:20px 0;">
        <p style="font-size:11px;color:#787880;margin-bottom:4px;">Your original feedback:</p>
        <blockquote style="margin:0;padding:10px 12px;border-left:3px solid #6b9f40;color:#9a9aa2;background:#101012;white-space:pre-wrap;">${safeOriginal}</blockquote>
        <p style="color:#787880;font-size:11px;margin-top:20px;">Renoise Themes — renoisethemes.com</p>
      </div>`,
      text: `Hi ${safeName},

${replyMessage}

---
Your original feedback:
${originalMessage}

Renoise Themes — renoisethemes.com`,
    });

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL] Failed to send feedback reply:', err);
    return { success: false, error: err.message };
  }
}

// Extracted from the original backend/server.js during the Step 2 modular split.
// Code is moved unchanged; only imports/exports were added.

import nodemailer from 'nodemailer';
import { FRONTEND_URL, ADMIN_NOTIFICATION_EMAIL } from './config.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let emailTransporter = null;

function getEmailTransporter() {
  if (emailTransporter) {
    return emailTransporter;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return emailTransporter;
}

async function sendEmailSafely({ to, subject, text, html }) {
  const transporter = getEmailTransporter();

  if (!transporter || !to) {
    console.log(
      `Email skipped for "${subject}". Configure SMTP_USER, SMTP_PASS, and the recipient email in backend/.env.`
    );
    return false;
  }

  try {
    await transporter.sendMail({
      from: {
        name: process.env.EMAIL_FROM_NAME || 'OPUS',
        address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER
      },
      to,
      subject,
      text,
      html
    });

    return true;
  } catch (error) {
    console.error(`Email failed for "${subject}":`, error.message);
    return false;
  }
}

function buildEmailTemplate({
  eyebrow = 'OPUS',
  title,
  message,
  primaryLabel,
  primaryUrl,
  secondaryLabel,
  secondaryUrl
}) {
  const secondaryButton =
    secondaryLabel && secondaryUrl
      ? `
        <a href="${escapeHtml(secondaryUrl)}"
           style="display:inline-block;margin-left:10px;padding:12px 18px;border-radius:10px;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-weight:700;">
          ${escapeHtml(secondaryLabel)}
        </a>
      `
      : '';

  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:30px;">
            <div style="font-size:13px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.08em;">
              ${escapeHtml(eyebrow)}
            </div>
            <h1 style="font-size:25px;line-height:1.25;margin:14px 0 12px;">
              ${escapeHtml(title)}
            </h1>
            <p style="font-size:16px;line-height:1.65;color:#475569;margin:0 0 24px;">
              ${escapeHtml(message)}
            </p>
            <div>
              <a href="${escapeHtml(primaryUrl)}"
                 style="display:inline-block;padding:12px 18px;border-radius:10px;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:800;">
                ${escapeHtml(primaryLabel)}
              </a>
              ${secondaryButton}
            </div>
            <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:26px 0 0;">
              This is an automated OPUS security notification.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendApprovalQueueNotification(user) {
  if (!ADMIN_NOTIFICATION_EMAIL) {
    console.log('Admin notification email is not configured.');
    return false;
  }

  const reviewUrl = `${FRONTEND_URL}/super-admin/approvals`;
  const roleLabel = user.role === 'recruiter' ? 'Recruiter' : 'User';
  const details = user.role === 'recruiter'
    ? `${user.name} from ${user.company || 'an organization'} verified their email and is waiting for Super Admin review.`
    : `${user.name} verified their email and is waiting for Super Admin review as ${user.careerGoal || 'a job seeker'}.`;

  return sendEmailSafely({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: `OPUS — Verified ${roleLabel} Awaiting Approval`,
    text: `${details} Review the pending queue after signing in: ${reviewUrl}`,
    html: buildEmailTemplate({
      title: `Verified ${roleLabel.toLowerCase()} awaiting approval`,
      message: `${details} Sign in to OPUS and approve or decline the request from the Approvals queue in your Super Admin portal.`,
      primaryLabel: 'Review Pending Accounts',
      primaryUrl: reviewUrl
    })
  });
}

async function sendRegistrationVerificationEmail(user, verificationUrl) {
  // OPUS uses a single login page for every role.
  const loginPath = '/login';

  return sendEmailSafely({
    to: user.email,
    subject: 'Verify Your OPUS Email Address',
    text: `Verify your OPUS email address using this link: ${verificationUrl}`,
    html: buildEmailTemplate({
      title: 'Verify your email address',
      message:
        'Please confirm your email address to continue. Once verified, our Super Admin team will review your account — approvals typically take 24 to 48 hours, and we will email you the moment a decision is made. This verification link expires in 24 hours.',
      primaryLabel: 'Verify Email Address',
      primaryUrl: verificationUrl,
      secondaryLabel: 'Return to OPUS',
      secondaryUrl: `${FRONTEND_URL}${loginPath}`
    })
  });
}

async function sendPasswordResetEmail(user, resetUrl) {
  return sendEmailSafely({
    to: user.email,
    subject: 'Reset Your OPUS Password',
    text: `Use this single-use link to reset your OPUS password: ${resetUrl}`,
    html: buildEmailTemplate({
      title: 'Reset your password',
      message:
        'Use this single-use link to choose a new password. The link expires in 30 minutes. Ignore this message if you did not request it.',
      primaryLabel: 'Reset Password',
      primaryUrl: resetUrl
    })
  });
}

async function sendAdminInvitationEmail(invitation, invitationUrl) {
  return sendEmailSafely({
    to: invitation.email,
    subject: 'You Are Invited to Join OPUS as an Admin',
    text: `Complete your Admin registration using this secure invitation: ${invitationUrl}`,
    html: buildEmailTemplate({
      title: 'You have been invited to join OPUS as an Admin 🤝',
      message:
        'Congratulations — a Super Admin has personally invited you to join the OPUS team as an <strong>Administrator</strong>. Click the button below to set up your account and password. This secure invitation expires in 48 hours. Once you complete registration, the Super Admin will give your account a final approval, and you will be ready to go.',
      primaryLabel: 'Accept Admin Invitation',
      primaryUrl: invitationUrl
    })
  });
}

async function sendAccountApprovedEmail(user) {
  // OPUS uses a single login page for every role.
  const loginPath = '/login';
  const loginUrl = `${FRONTEND_URL}${loginPath}?approved=true&email=${encodeURIComponent(
    user.email
  )}`;

  const firstName = String(user.name || '').split(' ')[0] || 'there';

  return sendEmailSafely({
    to: user.email,
    subject: '🎉 Your OPUS Account Is Approved — Welcome Aboard!',
    text:
      `Hi ${firstName}, great news — your OPUS account has been approved! ✅ You can now sign in with your registered email and password and start using the platform. Welcome to OPUS! 🚀`,
    html: buildEmailTemplate({
      eyebrow: 'OPUS · Account Approved',
      title: `Welcome aboard, ${firstName}! 🎉`,
      message:
        'Great news — your OPUS account has been reviewed and <strong>approved</strong> ✅. You can now sign in with your registered email address and password and start exploring everything OPUS has to offer. We are thrilled to have you with us. 🚀',
      primaryLabel: 'Sign In to OPUS',
      primaryUrl: loginUrl
    })
  });
}

async function sendAccountDeclinedEmail(user) {
  const supportUrl = `${FRONTEND_URL}/login`;
  const firstName = String(user.name || '').split(' ')[0] || 'there';
  const reason = String(user.declineReason || '').trim();
  const reasonLine = reason
    ? ` The reviewer noted: \"${escapeHtml(reason)}\".`
    : '';

  return sendEmailSafely({
    to: user.email,
    subject: 'Update on Your OPUS Registration',
    text:
      `Hi ${firstName}, thank you for your interest in OPUS. After review, your registration was not approved at this time.` +
      (reason ? ` Reason: ${reason}.` : '') +
      ' If you believe this was a mistake or would like more information, please contact the administrator who manages your organization\'s OPUS access.',
    html: buildEmailTemplate({
      title: 'An update on your registration',
      message:
        `Hi ${firstName}, thank you for your interest in OPUS. After a careful review, your registration was <strong>not approved at this time</strong>.${reasonLine} ` +
        'If you believe this was a mistake, or you would like more information, please reach out to the administrator who manages your organization\'s OPUS access — they can help review your request.',
      primaryLabel: 'Return to OPUS',
      primaryUrl: supportUrl
    })
  });
}

async function sendEmailChangeVerificationEmail({
  user,
  newEmail,
  verificationUrl
}) {
  return sendEmailSafely({
    to: newEmail,
    subject: 'Verify Your New OPUS Email Address',
    text:
      `Hello ${user.name || 'OPUS user'}, verify your new email address by opening this link: ${verificationUrl}`,
    html: buildEmailTemplate({
      title: 'Verify your new email address',
      message:
        'Confirm this email address to replace the current login email on your OPUS account. The link expires in 30 minutes.',
      primaryLabel: 'Verify New Email',
      primaryUrl: verificationUrl
    })
  });
}

export {
  escapeHtml,
  getEmailTransporter,
  sendEmailSafely,
  buildEmailTemplate,
  sendApprovalQueueNotification,
  sendRegistrationVerificationEmail,
  sendPasswordResetEmail,
  sendAdminInvitationEmail,
  sendAccountApprovedEmail,
  sendAccountDeclinedEmail,
  sendEmailChangeVerificationEmail
};

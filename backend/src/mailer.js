import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpFrom = process.env.SMTP_FROM?.trim();
const adminNotificationEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL)?.trim();

const transporter = smtpHost && smtpFrom
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined
    })
  : null;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function send(message) {
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: smtpFrom, ...message });
    return true;
  } catch (error) {
    console.error('Email delivery failed:', error.message);
    return false;
  }
}

export async function verifyEmailConnection() {
  if (!transporter) return { configured: false, connected: false };
  try { await transporter.verify(); return { configured: true, connected: true }; }
  catch (error) { return { configured: true, connected: false, error: error.message }; }
}

export function sendTestEmail(account) {
  return send({
    to: account.email,
    subject: 'Livingworth Academy email is connected',
    html: `<h2>Email setup successful</h2><p>Hello ${escapeHtml(account.fullName)},</p><p>Your Livingworth Academy notification service is connected and ready.</p><p>Livingworth Academy</p>`
  });
}

export function sendApplicationEmails(applicant) {
  const name = escapeHtml(applicant.fullName);
  const email = escapeHtml(applicant.email);
  const course = escapeHtml(applicant.courseChoice);
  const confirmation = send({
    to: applicant.email,
    subject: 'We received your Livingworth Academy application',
    html: `<h2>Application received</h2><p>Hello ${name},</p><p>Thank you for applying to study <strong>${course}</strong> with Livingworth Academy.</p><p>Your application is awaiting review. We will email you when a decision has been made. You will be able to sign in after approval.</p><p>Livingworth Academy</p>`
  });
  const adminAlert = adminNotificationEmail
    ? send({
        to: adminNotificationEmail,
        subject: `New Livingworth application: ${applicant.fullName}`,
        html: `<h2>New student application</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Course:</strong> ${course}</p><p>Sign in to the administrator portal to review the application.</p>`
      })
    : Promise.resolve(false);
  return Promise.allSettled([confirmation, adminAlert]);
}

export function sendApplicationDecision(applicant, status, rejectionReason = '') {
  const approved = status === 'approved';
  return send({
    to: applicant.email,
    subject: approved
      ? 'Your Livingworth Academy application has been approved'
      : 'Update on your Livingworth Academy application',
    html: approved
      ? `<h2>Welcome to Livingworth Academy</h2><p>Hello ${escapeHtml(applicant.fullName)},</p><p>Your application has been approved. You can now sign in to the student portal using the email address and password you provided during registration.</p><p>Livingworth Academy</p>`
      : `<h2>Application update</h2><p>Hello ${escapeHtml(applicant.fullName)},</p><p>Thank you for your interest in Livingworth Academy. Unfortunately, your application was not approved at this time.</p>${rejectionReason ? `<p><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>` : ''}<p>Livingworth Academy</p>`
  });
}

export function sendPasswordReset(account, resetUrl) {
  return send({
    to: account.email,
    subject: 'Reset your Livingworth Academy password',
    html: `<h2>Password reset</h2><p>Hello ${escapeHtml(account.fullName)},</p><p>Use the link below to create a new password. It expires in 30 minutes and can only be used once.</p><p><a href="${escapeHtml(resetUrl)}">Reset my password</a></p><p>If you did not request this, you can ignore this email.</p><p>Livingworth Academy</p>`
  });
}

export function sendStudentNotification(account, notification) {
  return send({
    to: account.email,
    subject: notification.title,
    html: `<h2>${escapeHtml(notification.title)}</h2><p>Hello ${escapeHtml(account.fullName)},</p><p>${escapeHtml(notification.message)}</p><p>Sign in to your Livingworth Academy student portal to view the update.</p><p>Livingworth Academy</p>`
  });
}

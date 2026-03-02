import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface TxRow {
  payer_name: string;
  amount: number | string;
  utr: string;
  payment_time: Date | string;
  verified: boolean;
  rejected?: boolean;
  session_title?: string;
}

// ─── Daily Report ──────────────────────────────────────────────────────────────

export async function sendDailyReport(
  toEmail: string,
  adminName: string,
  transactions: TxRow[],
  date: string
) {
  if (!transactions || transactions.length === 0) return;

  const totalAmount = transactions.reduce((sum, t) => t.rejected ? sum : sum + parseFloat(String(t.amount)), 0);

  const rows = transactions
    .map(
      (t, i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${t.payer_name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">₹${parseFloat(String(t.amount)).toFixed(2)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${t.utr}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${t.session_title || '-'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${new Date(t.payment_time).toLocaleTimeString('en-IN')}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">
            <span style="padding:2px 8px;border-radius:999px;font-size:11px;background:${t.rejected ? '#fee2e2' : t.verified ? '#dcfce7' : '#fef9c3'};color:${t.rejected ? '#991b1b' : t.verified ? '#166534' : '#713f12'}">
              ${t.rejected ? 'Rejected' : t.verified ? 'Verified' : 'Pending'}
            </span>
          </td>
        </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
    <div style="max-width:700px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <div style="background:#4f46e5;padding:28px 32px;color:white">
        <h1 style="margin:0;font-size:22px">🍫 Chocolate Fund — Daily Report</h1>
        <p style="margin:6px 0 0;opacity:0.85;font-size:14px">Date: ${date}</p>
      </div>
      <div style="padding:24px 32px;background:#eef2ff;border-bottom:1px solid #e0e7ff">
        <p style="margin:0;font-size:16px;color:#3730a3">Hello <strong>${adminName}</strong>, here is your daily transaction summary.</p>
        <div style="margin-top:16px;display:flex;gap:40px">
          <div><p style="margin:0;font-size:13px;color:#6b7280">Total Collected</p><p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#4f46e5">₹${totalAmount.toFixed(2)}</p></div>
          <div><p style="margin:0;font-size:13px;color:#6b7280">Transactions</p><p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#4f46e5">${transactions.length}</p></div>
        </div>
      </div>
      <div style="padding:24px 32px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f1f5f9">
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">#</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Name</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Amount</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">UTR</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Session</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Time</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:600">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;font-size:12px;color:#9ca3af">This is an automated report. Transaction data for ${date} has been archived after this email.</p>
      </div>
    </div>
  </body></html>`;

  await transporter.sendMail({
    from: `"Chocolate Fund" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🍫 Daily Report — ${date} (${transactions.length} payments, ₹${totalAmount.toFixed(2)})`,
    html,
  });
}

// ─── Session Closed Report ─────────────────────────────────────────────────────

export async function sendSessionClosedReport(
  toEmail: string,
  adminName: string,
  { sessionTitle, transactions, closedAt }: { sessionTitle: string; transactions: TxRow[]; closedAt: Date }
) {
  try {
    const totalAmount = transactions.reduce((sum, t) => t.rejected ? sum : sum + parseFloat(String(t.amount)), 0);
    const verifiedCount = transactions.filter(t => t.verified).length;
    const pendingCount = transactions.filter(t => !t.verified && !t.rejected).length;
    const dateStr = new Date(closedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const rows =
      transactions.length === 0
        ? `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af">No transactions were recorded for this session.</td></tr>`
        : transactions
            .map(
              (t, i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">${t.payer_name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#16a34a">₹${parseFloat(String(t.amount)).toFixed(2)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px">${t.utr}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${new Date(t.payment_time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb">
            <span style="padding:2px 8px;border-radius:999px;font-size:11px;background:${t.rejected ? '#fee2e2' : t.verified ? '#dcfce7' : '#fef9c3'};color:${t.rejected ? '#991b1b' : t.verified ? '#166534' : '#713f12'}">
              ${t.rejected ? '❌ Rejected' : t.verified ? '✅ Verified' : '⏳ Pending'}
            </span>
          </td>
        </tr>`
            )
            .join('');

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
      <div style="max-width:700px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <div style="background:#dc2626;padding:28px 32px;color:white">
          <h1 style="margin:0;font-size:22px">🔒 Session Closed — Final Report</h1>
          <p style="margin:6px 0 0;opacity:0.85;font-size:14px">Session: <strong>${sessionTitle}</strong></p>
          <p style="margin:4px 0 0;opacity:0.75;font-size:13px">Closed at: ${dateStr}</p>
        </div>
        <div style="padding:24px 32px;background:#fef2f2;border-bottom:1px solid #fecaca">
          <p style="margin:0 0 16px;font-size:15px;color:#374151">Hello <strong>${adminName}</strong>, your session has been closed.</p>
          <div style="display:flex;gap:32px;flex-wrap:wrap">
            <div style="text-align:center;background:white;padding:16px 24px;border-radius:10px;min-width:100px"><p style="margin:0;font-size:12px;color:#6b7280">Total Collected</p><p style="margin:6px 0 0;font-size:26px;font-weight:700;color:#4f46e5">₹${totalAmount.toFixed(2)}</p></div>
            <div style="text-align:center;background:white;padding:16px 24px;border-radius:10px;min-width:80px"><p style="margin:0;font-size:12px;color:#6b7280">Total</p><p style="margin:6px 0 0;font-size:26px;font-weight:700;color:#374151">${transactions.length}</p></div>
            <div style="text-align:center;background:white;padding:16px 24px;border-radius:10px;min-width:80px"><p style="margin:0;font-size:12px;color:#6b7280">Verified</p><p style="margin:6px 0 0;font-size:26px;font-weight:700;color:#16a34a">${verifiedCount}</p></div>
            <div style="text-align:center;background:white;padding:16px 24px;border-radius:10px;min-width:80px"><p style="margin:0;font-size:12px;color:#6b7280">Pending</p><p style="margin:6px 0 0;font-size:26px;font-weight:700;color:#d97706">${pendingCount}</p></div>
          </div>
        </div>
        <div style="padding:24px 32px;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f1f5f9">
              <th style="padding:10px 14px;text-align:left">#</th>
              <th style="padding:10px 14px;text-align:left">Name</th>
              <th style="padding:10px 14px;text-align:left">Amount</th>
              <th style="padding:10px 14px;text-align:left">UTR</th>
              <th style="padding:10px 14px;text-align:left">Time</th>
              <th style="padding:10px 14px;text-align:left">Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
          <p style="margin:0;font-size:12px;color:#9ca3af">Last 10 closed sessions are stored in your dashboard for reference.</p>
        </div>
      </div>
    </body></html>`;

    await transporter.sendMail({
      from: `"Chocolate Fund" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `🔒 Session Closed: ${sessionTitle} — ₹${totalAmount.toFixed(2)} from ${transactions.length} payment${transactions.length !== 1 ? 's' : ''}`,
      html,
    });
  } catch (err: unknown) {
    console.warn('Session close report email failed:', (err as Error).message);
  }
}

// ─── New Payment Alert ─────────────────────────────────────────────────────────

export async function sendNewPaymentAlert(
  toEmail: string,
  adminName: string,
  {
    payerName,
    amount,
    utr,
    sessionTitle,
    frontendUrl,
  }: { payerName: string; amount: number; utr: string; sessionTitle: string; frontendUrl: string }
) {
  try {
    await transporter.sendMail({
      from: `"Chocolate Fund" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `⚠️ New Payment Pending Verification — ${sessionTitle}`,
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
        <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <div style="background:#4f46e5;padding:24px 28px;color:white">
            <h2 style="margin:0;font-size:20px">🍫 New Payment Submitted</h2>
            <p style="margin:6px 0 0;opacity:0.85;font-size:13px">Action required: verify or reject</p>
          </div>
          <div style="padding:24px 28px">
            <p style="margin:0 0 16px;color:#374151">Hello <strong>${adminName}</strong>, a new payment needs your verification.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr style="background:#f9fafb"><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#6b7280;width:140px">Session</td><td style="padding:10px 14px;border:1px solid #e5e7eb">${sessionTitle}</td></tr>
              <tr><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#6b7280">Payer</td><td style="padding:10px 14px;border:1px solid #e5e7eb">${payerName}</td></tr>
              <tr style="background:#f9fafb"><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#6b7280">Amount</td><td style="padding:10px 14px;border:1px solid #e5e7eb;color:#16a34a;font-weight:700">₹${amount}</td></tr>
              <tr><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#6b7280">UTR</td><td style="padding:10px 14px;border:1px solid #e5e7eb;font-family:monospace;color:#4f46e5">${utr}</td></tr>
            </table>
            <div style="margin-top:20px;text-align:center">
              <a href="${frontendUrl}/dashboard" style="display:inline-block;background:#4f46e5;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open Dashboard →</a>
            </div>
          </div>
        </div>
      </body></html>`,
    });
  } catch (err: unknown) {
    console.warn('Payment alert email failed:', (err as Error).message);
  }
}

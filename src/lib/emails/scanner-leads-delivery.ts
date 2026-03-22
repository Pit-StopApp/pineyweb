export function getScannerLeadsEmail(vars: {
  clientName: string;
  city: string;
  totalLeads: number;
  tier1Leads: number;
  tier2Leads: number;
  templatesUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Leads Are Ready</title>
</head>
<body style="margin:0;padding:0;background-color:#fef9f1;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef9f1;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(48,20,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#316342;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Your Leads Are Ready</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;font-style:italic;">${vars.city} — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#1d1c17;font-size:16px;line-height:1.7;">
                Hi ${vars.clientName},
              </p>
              <p style="margin:0 0 24px;color:#414942;font-size:16px;line-height:1.7;">
                Your latest scan just finished. I've attached a spreadsheet with all the leads from <strong>${vars.city}</strong> — ready for you to review and start reaching out.
              </p>

              <!-- Stats Cards -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td width="33%" style="padding:4px;">
                    <div style="background-color:#f8f3eb;border-radius:8px;padding:16px;text-align:center;">
                      <p style="margin:0;color:#717971;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Total Leads</p>
                      <p style="margin:4px 0 0;color:#316342;font-size:28px;font-weight:700;">${vars.totalLeads}</p>
                    </div>
                  </td>
                  <td width="33%" style="padding:4px;">
                    <div style="background-color:#f8f3eb;border-radius:8px;padding:16px;text-align:center;">
                      <p style="margin:0;color:#717971;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">High Priority</p>
                      <p style="margin:4px 0 0;color:#805533;font-size:28px;font-weight:700;">${vars.tier1Leads}</p>
                    </div>
                  </td>
                  <td width="33%" style="padding:4px;">
                    <div style="background-color:#f8f3eb;border-radius:8px;padding:16px;text-align:center;">
                      <p style="margin:0;color:#717971;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Standard</p>
                      <p style="margin:4px 0 0;color:#414942;font-size:28px;font-weight:700;">${vars.tier2Leads}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;color:#414942;font-size:16px;line-height:1.7;">
                The spreadsheet is attached to this email. Open it up, pick your top targets, and start reaching out when you're ready.
              </p>

              <!-- Templates CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:#f8f3eb;border-radius:8px;padding:20px 24px;border-left:4px solid #805533;">
                    <p style="margin:0 0 8px;color:#1d1c17;font-size:15px;font-weight:700;">Need help with what to say?</p>
                    <p style="margin:0;color:#414942;font-size:14px;line-height:1.6;">
                      I put together outreach templates you can copy/paste. <a href="${vars.templatesUrl}" style="color:#316342;font-weight:700;">View Templates &rarr;</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Sign-off -->
              <p style="margin:0 0 4px;color:#1d1c17;font-size:16px;line-height:1.7;">— Dustin Hartman</p>
              <p style="margin:0;color:#414942;font-size:16px;line-height:1.7;">Piney Web Co.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f3eb;padding:20px 40px;text-align:center;border-top:1px solid rgba(193,201,191,0.3);">
              <p style="margin:0;color:#717971;font-size:12px;">
                Piney Web Co. &bull; Longview, TX &bull; <a href="https://pineyweb.com" style="color:#316342;">pineyweb.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

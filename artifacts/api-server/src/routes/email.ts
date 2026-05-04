import { Router, type Request, type Response } from "express";
import nodemailer from "nodemailer";

const router: Router = Router();

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false },
  });
}

function buildFrom(config: SmtpConfig) {
  const addr = config.fromEmail || config.user;
  return config.fromName ? `"${config.fromName}" <${addr}>` : addr;
}

router.post("/email/send", async (req: Request, res: Response) => {
  const { to, subject, html, text, config } = req.body as {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    config: SmtpConfig;
  };

  if (!to || !subject || !config?.host) {
    res.status(400).json({ success: false, message: "Missing required fields: to, subject, config.host" });
    return;
  }

  try {
    const transporter = createTransporter(config);
    await transporter.sendMail({ from: buildFrom(config), to, subject, html, text });
    res.json({ success: true, message: "Email sent successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Failed to send email");
    res.status(500).json({ success: false, message: msg });
  }
});

router.post("/email/test", async (req: Request, res: Response) => {
  const { to, config } = req.body as { to: string; config: SmtpConfig };

  if (!to || !config?.host) {
    res.status(400).json({ success: false, message: "Missing required fields: to, config.host" });
    return;
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    await transporter.sendMail({
      from: buildFrom(config),
      to,
      subject: "POS System — SMTP Test",
      html: "<p>Your SMTP configuration is working correctly. Z-Reports will be sent to this address.</p>",
      text: "Your SMTP configuration is working correctly.",
    });
    res.json({ success: true, message: "Test email sent successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "SMTP test failed");
    res.status(500).json({ success: false, message: msg });
  }
});

export default router;

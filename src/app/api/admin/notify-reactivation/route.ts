import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email, fullname } = await req.json();

    if (!email || !fullname) {
      return NextResponse.json({ error: "Missing user details" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD, 
      },
    });

    const mailOptions = {
      from: `"DialyGo System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Account Reactivated - DialyGo',
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">Account Reactivated</h2>
          <p>Hello <strong>${fullname}</strong>,</p>
          <p>Your access to the DialyGo system has been successfully reactivated by the HQ Administrator.</p>
          <p>You may now return to the portal and log in using your existing credentials to access your dashboard.</p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #cbd5e1;">
            <p style="font-size: 11px; color: #64748b;">This is an automated security message from the DialyGo system. Please do not reply directly to this email.</p>
          </div>
        </div>
      `,
    };

    // Execute the email send
    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: "Reactivation email sent successfully" });
    
  } catch (error: any) {
    console.error("Nodemailer Error:", error);
    return NextResponse.json({ error: "Failed to send notification email" }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { sendNotification } from '@/utils/notificationService';

export async function POST(req: Request) {
  try {
   const { email, fullname, branchName } = await req.json();

    if (!email || !fullname || !branchName) {
      return NextResponse.json({ error: "Missing assignment details" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD, 
      },
    });

    const mailOptions = {
      from: `"DialyGo HQ" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Branch Assignment Notification: ${branchName}`,
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">Branch Manager Assignment</h2>
          <p>Hello <strong>${fullname}</strong>,</p>
          <p>You have been officially assigned as the Branch Manager for <strong>${branchName}</strong> by the HQ Administrator.</p>
          <p>Please log in to your DialyGo Manager Dashboard to review your facility's capacity, roster staff, and manage incoming patient booking requests.</p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #cbd5e1;">
            <p style="font-size: 11px; color: #64748b;">This is an automated operational message from the DialyGo system.</p>
          </div>
        </div>
      `,
    };
    
    await transporter.sendMail(mailOptions);
    
    await sendNotification(
      email, 
      "Branch Assignment Confirmed", 
      `You have been assigned as the Branch Manager for ${branchName}.`, 
      'Alert'
    );
    
    return NextResponse.json({ success: true, message: "Assignment email sent successfully" });
    
  } catch (error: any) {
    console.error("Nodemailer Error:", error);
    return NextResponse.json({ error: "Failed to send notification email" }, { status: 500 });
  }
}
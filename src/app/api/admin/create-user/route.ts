// src/app/api/admin/create-user/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendNotification } from '@/utils/notificationService'; // Import the utility

export async function POST(req: Request) {
  try {
    const { email, password, fullName } = await req.json();
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! 
    );

    // 1. Create Auth User
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true 
    });

    if (error) throw error;
    
    // Note: Assuming your frontend or another query inserts the user into public.users here...

    // 2. Send Welcome Notification
    await sendNotification(
      email, 
      "Welcome to DialyGo!", 
      `Hello ${fullName || ''}, your account has been successfully created.`, 
      'System'
    );
    
    return NextResponse.json({ success: true, user: data.user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
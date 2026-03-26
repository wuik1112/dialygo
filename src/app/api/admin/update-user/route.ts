import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! 
    );

    // Find the user by email first to get their Auth UUID
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;
    
    const authUser = usersData.users.find(u => u.email === email);
    if (!authUser) throw new Error("User not found in secure Auth system.");

    // Update their password securely
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUser.id, 
      { password: password }
    );

    if (updateError) throw updateError;
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
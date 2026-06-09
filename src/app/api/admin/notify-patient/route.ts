import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client with Service Role Key to safely bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, title, message, type } = body;

    // 1. Basic validation
    if (!user_id || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields (user_id, title, message)' },
        { status: 400 }
      );
    }

    // 2. Insert the notification using the Admin client
    const { error } = await supabaseAdmin.from('notifications').insert([
      {
        user_id,
        title,
        message,
        type: type || 'System',
      },
    ]);

    if (error) {
      console.error("Supabase Admin Insert Error:", error);
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Error sending patient notification via API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
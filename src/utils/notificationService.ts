// src/utils/notificationService.ts
import { createClient } from '@supabase/supabase-js';

// Initialize with Service Role Key to bypass RLS for system actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1. Send a notification to a specific user
export async function sendNotification(email: string, title: string, message: string, type: 'System' | 'Alert' | 'Booking' = 'System') {
  // First, find the integer user_id from the public.users table using the email
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('user_id')
    .eq('user_email', email)
    .single();

  if (!user) return;

  // Insert the notification
  await supabaseAdmin.from('notifications').insert([{
    user_id: user.user_id,
    title,
    message,
    type
  }]);
}

// 2. Broadcast a notification to ALL active users
export async function broadcastNotification(title: string, message: string, type: 'System' | 'Alert' | 'Booking' = 'System') {
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('user_id')
    .eq('user_is_active', true);

  if (!users) return;

  const notifications = users.map(u => ({
    user_id: u.user_id,
    title,
    message,
    type
  }));

  await supabaseAdmin.from('notifications').insert(notifications);
}
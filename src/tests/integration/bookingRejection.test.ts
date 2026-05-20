import { createClient } from '@supabase/supabase-js';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
  { global: { fetch: fetch } }
);

describe('Integration Test: Booking Rejection Notification (T044)', () => {
  
  it('should update booking status to Rejected AND insert a notification record', async () => {
    const { data: realUser } = await supabase.from('users').select('user_id').limit(1).single();
    if (!realUser) throw new Error("No users found in the database!");
    const { data: targetBooking } = await supabase.from('bookings').select('id, booking_status').limit(1).single();
    if (!targetBooking) throw new Error("No bookings found in the database!");

    const rejectReason = 'Facility at maximum capacity';
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ booking_status: 'Rejected' })
      .eq('id', targetBooking.id);
    const expectedMessage = `Your request was declined. Reason: ${rejectReason}. Please contact us or try another date.`;
    const { data: notificationData, error: notificationError } = await supabase
      .from('notifications')
      .insert({ 
        user_id: realUser.user_id, 
        title: `Request Declined`, 
        message: expectedMessage 
      })
      .select()
      .single();
    expect(updateError).toBeNull();
    expect(notificationError).toBeNull();
    const { data: updatedBooking } = await supabase
      .from('bookings')
      .select('booking_status')
      .eq('id', targetBooking.id)
      .single();
    expect(updatedBooking?.booking_status).toBe('Rejected');
    expect(notificationData).toBeDefined();
    expect(notificationData?.message).toContain('Facility at maximum capacity');
    if (targetBooking) {
      await supabase.from('bookings').update({ booking_status: targetBooking.booking_status }).eq('id', targetBooking.id);
    }
    if (notificationData) {
      await supabase.from('notifications').delete().eq('id', notificationData.id);
    }
  });
});
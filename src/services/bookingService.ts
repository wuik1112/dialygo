import { supabase } from '../lib/supabase';

export const bookingService = {
  // 1. Fetch all active branches (for Patient view)
  async getBranches() {
    const { data, error } = await supabase.from('branches').select('id, branch_name, available_slots').order('id');
    if (error) throw new Error(error.message);
    return data;
  },

  // 2. Request a new booking (for Patient view)
  async requestBooking(branchId: number, patientId: number, date: string): Promise<string> {
    const { data, error } = await supabase.rpc('process_booking_request', {
      p_branch_id: branchId, p_patient_id: patientId, p_date: date
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  // 3. Fetch bookings pending review (for Manager view)
  async getPendingBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, booking_date, status,
        patients ( patient_name, last_serology_date ),
        branches ( branch_name )
      `)
      .eq('status', 'PENDING_REVIEW');
    if (error) throw new Error(error.message);
    return data;
  },

  // 4. Approve a pending booking (for Manager view)
  async approveBooking(bookingId: number) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'CONFIRMED' })
      .eq('id', bookingId);
    if (error) throw new Error(error.message);
    return data;
  }
};
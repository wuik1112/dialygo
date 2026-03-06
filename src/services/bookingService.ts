import { supabase } from '../lib/supabase';

export const bookingService = {
  async requestBooking(branchId: number, patientId: number, date: string): Promise<string> {
    const { data, error } = await supabase.rpc('process_booking_request', {
      p_branch_id: branchId,
      p_patient_id: patientId,
      p_date: date
    });

    if (error) {
      console.error("Service Error:", error.message);
      throw new Error(error.message); 
    }
    
    return data as string;
  }
};
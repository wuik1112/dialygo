import { createClient } from '@supabase/supabase-js';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase Environment Variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetch } 
});

describe('Integration Test: Database Concurrency & Race Conditions', () => {

  it('should prevent two patients from booking the exact same machine slot simultaneously', async () => {
    
    const validPatientA = 1002;
    const validPatientB = 1003;
    const validMachineId = 30;
    
    const targetDate = '2030-01-01'; 
    const targetShift = 'Morning (08:00 - 12:00)';

    const requestFromPatientA = supabase.from('bookings').insert({
      patient_id: validPatientA, 
      machine_id: validMachineId,
      booking_date: targetDate,
      booking_session_time: targetShift, 
      booking_status: 'Pending Approval' 
    });

    const requestFromPatientB = supabase.from('bookings').insert({
      patient_id: validPatientB, 
      machine_id: validMachineId,
      booking_date: targetDate,
      booking_session_time: targetShift, 
      booking_status: 'Pending Approval' 
    });

    const results = await Promise.all([requestFromPatientA, requestFromPatientB]);

    const successfulRequests = results.filter(res => res.error === null);
    const failedRequests = results.filter(res => res.error !== null);

    if (successfulRequests.length === 0) {
      console.log("🛑 BOTH REQUESTS FAILED! Here is the exact database error:");
      console.log(failedRequests[0].error);
    }

    expect(successfulRequests.length).toBe(1);
    expect(failedRequests.length).toBe(1);
    expect(failedRequests[0].error?.code).toBe('23505');
    
    await supabase.from('bookings').delete()
      .eq('machine_id', validMachineId)
      .eq('booking_date', targetDate)
      .eq('booking_session_time', targetShift);
  });
});
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { 
  FiActivity, FiClock, FiUsers, FiCheckCircle, 
  FiAlertCircle, FiMapPin, FiPlayCircle 
} from 'react-icons/fi';

export default function NurseDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [nurseData, setNurseData] = useState<any>(null);
  const [todayShift, setTodayShift] = useState<any>(null);
  const [todayPatients, setTodayPatients] = useState<any[]>([]);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchNurseDashboard() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;

        const { data: userData } = await supabase
          .from('users')
          .select('user_id, user_fullname, branch_id, branches(branch_name)')
          .eq('user_email', sessionData.session.user.email)
          .single();

        if (!userData) return;

        const branchInfo = userData.branches as any;
        const branchName = Array.isArray(branchInfo) ? branchInfo[0]?.branch_name : branchInfo?.branch_name;
        
        setNurseData({
          id: userData.user_id,
          name: userData.user_fullname,
          branchId: userData.branch_id,
          branchName: branchName || 'Unassigned'
        });

        const todayStr = new Date().toISOString().split('T')[0];

        const { data: shiftData } = await supabase
          .from('staff_roster')
          .select('*')
          .eq('nurse_id', userData.user_id)
          .eq('shift_date', todayStr)
          .single();
        
        setTodayShift(shiftData);

        // FIX IS HERE: Added session_date to the treatments select query
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select(`
            id,
            booking_session_time,
            patients (
              patient_id,
              patient_blood_type,
              users!inner(user_fullname, user_ic),
              treatments(session_id, session_status, session_date), 
              prescriptions(status)
            )
          `)
          .eq('branch_id', userData.branch_id)
          .eq('booking_date', todayStr)
          .order('booking_session_time', { ascending: true });

        if (error) console.error("Supabase Bookings Error:", error);

        if (bookings) {
          const formattedPatients = bookings.map((b: any) => {
            // Now this will successfully find the treatment because session_date is loaded!
            const todaysTreatment = b.patients.treatments?.find((t:any) => t.session_date === todayStr);
            
            const hasActivePrescription = Array.isArray(b.patients?.prescriptions) 
              ? b.patients.prescriptions.some((p: any) => p.status === 'Active') 
              : false;

            return {
              booking_id: b.id,
              time: b.booking_session_time,
              patient_id: b.patients.patient_id,
              name: b.patients.users?.user_fullname || 'Unknown',
              ic: b.patients.users?.user_ic || 'N/A',
              blood_type: b.patients.patient_blood_type || '?',
              status: todaysTreatment ? todaysTreatment.session_status : 'Pending',
              has_prescription: hasActivePrescription 
            };
          });
          setTodayPatients(formattedPatients);
        }

      } catch (error) {
        console.error('Error fetching nurse dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchNurseDashboard();
  }, []);

  const checkIsTimeValid = (timeString: string) => {
    if (!timeString) return true; 
    
    const match = timeString.match(/(\d{2}):(\d{2})/);
    if (!match) return true;
    
    const shiftHour = parseInt(match[1], 10);
    const shiftMinute = parseInt(match[2], 10);
    
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    
    return currentHour > shiftHour || (currentHour === shiftHour && currentMinute >= shiftMinute);
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center text-blue-600 font-bold'>
        <FiActivity className='text-4xl mb-4 animate-spin' />
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto pb-24">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Welcome, {nurseData?.name}</h1>
          <p className="text-slate-500 font-bold mt-1 flex items-center gap-2">
            <FiMapPin className="text-blue-500" /> {nurseData?.branchName} • Clinical Floor
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">{new Date().toLocaleDateString('en-MY', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </header>

      <div className="space-y-8">
        
        {/* SHIFT ASSIGNMENT */}
        <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-slate-900/20 animate-in fade-in">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3">My Shift Assignment</h3>
          
          {todayShift && todayShift.shift_type === 'WORK' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase">Role</p>
                <p className="text-xl font-black mt-1">{todayShift.shift_role || 'Floor Nurse'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase">Zone / Station</p>
                <p className="text-xl font-black mt-1 flex items-center gap-2">
                  {todayShift.zone_assignment || 'General Ward'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Start</p>
                <p className="font-bold text-lg">{todayShift.start_time.slice(0,5)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">End</p>
                <p className="font-bold text-lg">{todayShift.end_time.slice(0,5)}</p>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <FiClock className="mx-auto text-4xl text-slate-600 mb-3" />
              <p className="font-bold text-slate-300">You are not scheduled for a clinical shift today.</p>
            </div>
          )}
        </div>

        {/* PATIENT QUEUE */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FiUsers className="text-blue-500"/> Today's Ward Roster
            </h2>
            <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-lg text-xs font-black uppercase">{todayPatients.length} Bookings</span>
          </div>
          
          <div className="divide-y divide-slate-100">
            {todayPatients.length > 0 ? (
              todayPatients.map((patient, idx) => {
                const isTimeValid = checkIsTimeValid(patient.time);

                return (
                  <div key={idx} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-black text-lg border border-slate-200 shrink-0">
                        {patient.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-lg text-slate-900">{patient.name}</p>
                          <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded text-[9px] font-black">{patient.blood_type}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-bold mt-1 flex items-center gap-2">
                          <FiClock className="text-slate-400" /> Slot: {patient.time ? patient.time.slice(0,18) : 'Anytime'} • IC: {patient.ic}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      
                      {/* STATE 1: Pending WITH a valid prescription */}
                      {patient.status === 'Pending' && patient.has_prescription && (
                        <>
                          {isTimeValid ? (
                            <Link href={`/nurse/treatments/start?patient_id=${patient.patient_id}&booking_id=${patient.booking_id}`} className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                              <FiPlayCircle className="text-lg" /> Start
                            </Link>
                          ) : (
                            <button disabled className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 text-slate-400 border border-slate-200 font-bold rounded-xl text-sm cursor-not-allowed flex items-center justify-center gap-2">
                              <FiClock className="text-lg" /> Too Early
                            </button>
                          )}
                          
                          {/* EXCEPTION PATH: No-Show */}
                          <button 
                            onClick={async () => {
                              if(confirm('Mark patient as No-Show/Cancelled? This will alert the Manager and the Patient.')) {
                                
                                await supabase.from('bookings').update({ booking_status: 'Cancelled' }).eq('id', patient.booking_id);
                                
                                const { data: patientUser } = await supabase
                                  .from('patients')
                                  .select('user_id')
                                  .eq('patient_id', patient.patient_id)
                                  .single();

                                if (patientUser) {
                                  await supabase.from('notifications').insert([{
                                    user_id: patientUser.user_id,
                                    title: 'URGENT: Missed Dialysis Session',
                                    message: 'You have been marked as a No-Show for your scheduled session today. Please contact your center or submit a Reschedule Request immediately.',
                                    type: 'Alert'
                                  }]);
                                }

                                const { data: managers } = await supabase
                                  .from('users')
                                  .select('user_id')
                                  .eq('branch_id', nurseData.branchId)
                                  .eq('role_id', 3); 

                                if (managers && managers.length > 0) {
                                  const managerNotifs = managers.map(m => ({
                                    user_id: m.user_id,
                                    title: 'Machine Freed: Patient No-Show',
                                    message: `Nurse ${nurseData.name} marked ${patient.name} as a No-Show. A machine is now available for this shift.`,
                                    type: 'System'
                                  }));
                                  await supabase.from('notifications').insert(managerNotifs);
                                }

                                window.location.reload();
                              }
                            }}
                            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 text-slate-500 hover:text-red-600 hover:bg-red-50 font-bold rounded-xl text-sm transition-all text-center"
                          >
                            No-Show
                          </button>
                        </>
                      )}

                      {/* STATE 2: Pending WITHOUT a prescription */}
                      {patient.status === 'Pending' && !patient.has_prescription && (
                        <button disabled className="w-full sm:w-auto px-6 py-3 bg-slate-100 text-slate-400 font-bold rounded-xl text-sm border border-slate-200 cursor-not-allowed flex items-center justify-center gap-2">
                          <FiAlertCircle className="text-lg" /> No Prescription
                        </button>
                      )}

                      {/* STATE 3: Ongoing Treatment */}
                      {patient.status === 'Ongoing' && (
                        <Link href={`/nurse/treatments/monitor?patient_id=${patient.patient_id}&booking_id=${patient.booking_id}`} className="w-full sm:w-auto px-6 py-3 bg-amber-500 text-white font-bold rounded-xl text-sm hover:bg-amber-600 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                          <FiActivity className="text-lg" /> Monitor Vitals
                        </Link>
                      )}

                      {/* STATE 4: Completed Treatment */}
                      {patient.status === 'Completed' && (
                        <span className="w-full sm:w-auto px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                          <FiCheckCircle className="text-lg" /> Discharged
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <FiUsers className="text-4xl text-slate-200 mb-3" />
                <p className="font-bold text-slate-400">No patients scheduled for this branch today.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
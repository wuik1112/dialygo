'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { 
  FiUsers, FiInbox, FiSettings, FiActivity, 
  FiClock, FiAlertTriangle, FiCheckCircle, 
  FiChevronRight, FiMapPin, FiCalendar, FiShield,
  FiUser, FiEdit2, FiDroplet, FiX, FiSearch,
  FiMap, FiHome
} from 'react-icons/fi';

const getLocalISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ManagerDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchData, setBranchData] = useState<any>(null);
  const [managerName, setManagerName] = useState('');
  
  const [timeFilter, setTimeFilter] = useState<'Today' | 'Week' | 'Month' | 'Year'>('Week');
  const [patientSearch, setPatientSearch] = useState('');

  const [dbBookings, setDbBookings] = useState<any[]>([]);
  const [branchPatients, setBranchPatients] = useState<any[]>([]);
  const [branchMachines, setBranchMachines] = useState<any[]>([]);
  
  const [baseMetrics, setBaseMetrics] = useState({
    pendingRequests: 0,
    activeMachines: 0,
    downMachines: 0,
    staffOnDutyToday: 0,
    totalHomePatients: 0
  });

  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [clashWarning, setClashWarning] = useState<string | null>(null);
  const [patientForm, setPatientForm] = useState({
    schedule_pattern: 'MWF',
    preferred_shift: '',
    machine_id: ''
  });

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const email = sessionData.session.user.email;
      const { data: userData } = await supabase.from('users').select('user_id, user_fullname, branch_id').eq('user_email', email).single();
      if (!userData || !userData.branch_id) {
        setError("You currently do not have a branch assigned to your manager profile. Please contact the system administrator to link a branch to your account.");
        return; 
      }
      
      setManagerName(userData.user_fullname);
      const branchId = userData.branch_id;

      const { data: branch } = await supabase.from('branches').select('*').eq('id', branchId).single();
      setBranchData(branch);

      const { data: machinesData } = await supabase.from('machines').select('*').eq('branch_id', branchId);
      setBranchMachines(machinesData || []);

      const { data: patientsData } = await supabase
        .from('patients')
        .select('*, users(user_fullname, user_ic, user_contact_number)')
        .eq('home_branch_id', branchId)
        .order('patient_id', { ascending: true });
      
      const patientsWithMachines = (patientsData || []).map(p => ({
        ...p,
        assigned_machine: (machinesData || []).find(m => m.id === p.assigned_machine_id) || null
      }));
      setBranchPatients(patientsWithMachines);

      const now = new Date();
      const startDateStr = getLocalISODate(now);
      
      const endWindow = new Date(now);
      endWindow.setDate(now.getDate() + 14);
      const endDateStr = getLocalISODate(endWindow);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, patients(*, users(user_fullname, user_ic)), machines(serial_number, model)')
        .eq('branch_id', branchId)
        .gte('booking_date', startDateStr)
        .lte('booking_date', endDateStr);

      setDbBookings(bookings || []);

      const { count: pendingCount } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('branch_id', branchId).like('booking_status', 'Pending%');
      const activeMachines = machinesData?.filter(m => m.status === 'Active' || m.status === 'Reserved').length || 0;
      const downMachines = machinesData?.filter(m => m.status === 'Under Maintenance' || m.status === 'Faulty').length || 0;

      const isSunday = now.getDay() === 0;
      let staffOnDutyToday = 0;

      if (!isSunday) {
        const { data: todayRoster } = await supabase
          .from('staff_roster')
          .select('nurse_id')
          .eq('branch_id', branchId)
          .eq('shift_date', startDateStr)
          .eq('shift_type', 'WORK');
        staffOnDutyToday = new Set(todayRoster?.map(r => r.nurse_id)).size;
      }

      setBaseMetrics({
        pendingRequests: pendingCount || 0,
        activeMachines,
        downMachines,
        staffOnDutyToday,
        totalHomePatients: patientsData?.length || 0
      });

    } catch (error: any) {
      console.error("Dashboard error:", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const { dynamicSchedule, dynamicMetrics } = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 14);

    const dateArray: string[] = [];
    let curr = new Date(startDate);
    while (curr <= endDate) {
      dateArray.push(getLocalISODate(curr));
      curr.setDate(curr.getDate() + 1);
    }

    let calculatedTotalSessions = 0;
    let isolationCount = 0;
    const grouped: Record<string, { Morning: any[], Afternoon: any[], Evening: any[] }> = {};

    dateArray.forEach(dateStr => {
      const dow = new Date(dateStr).getDay(); 
      
      const dbForDate = dbBookings.filter(b => b.booking_date === dateStr);
      const overriddenIds = new Set(dbForDate.map(b => b.patient_id)); 
      
      const activeDbBookings = dbForDate.filter(b => 
        !['Moved', 'Cancelled', 'Cancellation Rejected', 'Reschedule Rejected'].includes(b.booking_status)
      );

      const routineSessions = branchPatients.filter(p => {
        if (overriddenIds.has(p.patient_id)) return false; 
        if (p.schedule_pattern === 'MWF' && [1, 3, 5].includes(dow)) return true;
        if (p.schedule_pattern === 'TTS' && [2, 4, 6].includes(dow)) return true;
        return false;
      }).map(p => ({
        id: `virtual-${p.patient_id}-${dateStr}`,
        patient_id: p.patient_id,
        booking_date: dateStr,
        booking_session_time: p.preferred_shift || 'Unassigned',
        booking_type: 'Home',
        booking_status: 'Scheduled', 
        patients: p,
        machines: p.assigned_machine
      }));

      const allToday = [...activeDbBookings, ...routineSessions];
      
      if (allToday.length > 0) {
        grouped[dateStr] = { Morning: [], Afternoon: [], Evening: [] };
        
        allToday.forEach(session => {
          calculatedTotalSessions++;
          if (session.patients?.hepatitis_b_status === 'Positive' || session.patients?.hepatitis_c_status === 'Positive' || session.patients?.hiv_status === 'Positive') {
            isolationCount++;
          }

          if (session.booking_session_time?.includes('Morning')) grouped[dateStr].Morning.push(session);
          else if (session.booking_session_time?.includes('Afternoon')) grouped[dateStr].Afternoon.push(session);
          else if (session.booking_session_time?.includes('Evening')) grouped[dateStr].Evening.push(session);
          else grouped[dateStr].Morning.push(session);
        });
      }
    });

    return { dynamicSchedule: grouped, dynamicMetrics: { totalSessions: calculatedTotalSessions, isolationCases: isolationCount } };
  }, [dbBookings, branchPatients]);

  const sortedDates = Object.keys(dynamicSchedule).sort();

  useEffect(() => {
    if (!patientForm.machine_id || !patientForm.schedule_pattern || !patientForm.preferred_shift || !selectedPatient) {
      setClashWarning(null); return;
    }
    const conflictingPatient = branchPatients.find(p => p.patient_id !== selectedPatient.patient_id && p.assigned_machine_id?.toString() === patientForm.machine_id && p.schedule_pattern === patientForm.schedule_pattern && p.preferred_shift === patientForm.preferred_shift);
    if (conflictingPatient) {
      const machineInfo = branchMachines.find(m => m.id.toString() === patientForm.machine_id);
      setClashWarning(`CLASH DETECTED: Machine ${machineInfo?.serial_number} is already assigned to ${conflictingPatient.users?.user_fullname} during this timeframe.`);
    } else { setClashWarning(null); }
  }, [patientForm, branchPatients, selectedPatient, branchMachines]);

  const openPatientModal = (patient: any) => {
    setSelectedPatient(patient);
    setPatientForm({
      schedule_pattern: patient.schedule_pattern || 'MWF',
      preferred_shift: patient.preferred_shift || '',
      machine_id: patient.assigned_machine_id?.toString() || ''
    });
    setClashWarning(null); setIsPatientModalOpen(true);
  };

  const handleSavePatientLogistics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clashWarning) return; 
    setIsSaving(true);
    try {
      await supabase.from('patients').update({ 
        schedule_pattern: patientForm.schedule_pattern,
        preferred_shift: patientForm.preferred_shift,
        assigned_machine_id: patientForm.machine_id ? parseInt(patientForm.machine_id) : null
      }).eq('patient_id', selectedPatient.patient_id);
      setIsPatientModalOpen(false);
      fetchDashboardData(); 
    } catch (error: any) { alert(`Error updating patient: ${error.message}`); } finally { setIsSaving(false); }
  };

  // Add this block before the loading check
  if (error) {
    return (
      <div className='min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4'>
        <div className='bg-white p-8 rounded-3xl border border-rose-100 shadow-xl max-w-md w-full text-center'>
          <div className='w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6'>
            <FiAlertTriangle className='text-4xl text-rose-500' />
          </div>
          <h2 className='text-2xl font-black text-slate-800 mb-3'>Action Required</h2>
          <p className='text-slate-500 font-medium mb-8 leading-relaxed'>{error}</p>
          <Link href="/" className='px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors inline-block'>
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && !branchData) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'><FiActivity className='text-4xl mb-4 animate-spin' /><span>Loading Branch Operations...</span></div>
      </div>
    );
  }

  const ShiftSection = ({ title, sessions }: { title: string, sessions: any[] }) => {
    if (sessions.length === 0) return null;
    return (
      <div className='mb-6 last:mb-0'>
        <h3 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2 flex items-center gap-2'>
          <FiClock className='text-blue-500' /> {title}
        </h3>
        <div className='grid grid-cols-1 xl:grid-cols-2 gap-3'>
          {sessions.map(session => {
            const patient = session.patients;
            const isInfectious = patient?.hepatitis_b_status === 'Positive' || patient?.hepatitis_c_status === 'Positive' || patient?.hiv_status === 'Positive';
            return (
              <div key={session.id} className={`p-4 rounded-xl border ${isInfectious ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'} shadow-sm flex flex-col justify-between`}>
                <div className='flex justify-between items-start mb-2'>
                  <div>
                    <h4 className='font-bold text-slate-800 text-sm truncate max-w-[150px]' title={patient?.users?.user_fullname}>{patient?.users?.user_fullname}</h4>
                    <p className='text-xs text-slate-500 mt-0.5 flex items-center gap-1.5'>
                      {session.booking_type === 'Travel' ? <><FiMap /> Travel Guest</> : <><FiHome /> Home Patient</>}
                    </p>
                  </div>
                  {isInfectious && <span className='px-2 py-1 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded flex items-center gap-1 shrink-0'><FiAlertTriangle /> Isolation</span>}
                </div>
                <div className='mt-3 pt-3 border-t border-slate-100/50 flex items-center justify-between text-xs font-bold'>
                  <span className={`flex items-center gap-1.5 ${session.machines ? 'text-slate-600' : 'text-amber-600'}`}>
                    <FiSettings /> {session.machines ? session.machines.serial_number : 'Unassigned'}
                  </span>
                  <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                    session.booking_status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                    session.booking_status === 'Scheduled' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                    session.booking_status === 'Rescheduled' ? 'bg-purple-100 text-purple-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {session.booking_status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const filteredPatients = branchPatients.filter(p => p.users?.user_fullname.toLowerCase().includes(patientSearch.toLowerCase()) || p.users?.user_ic.includes(patientSearch));

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-7xl mx-auto'>
        
        <div className='flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4'>
          <div>
            <p className='text-sm font-bold text-blue-600 mb-1 flex items-center gap-2'><FiCalendar /> {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <h1 className='text-3xl font-black text-slate-800 tracking-tight'>Branch Dashboard</h1>
            <p className='text-slate-500 mt-1 font-medium flex items-center gap-1.5'><FiMapPin /> {branchData?.branch_name} | {managerName}</p>
          </div>
        </div>

        {(baseMetrics.pendingRequests > 0 || baseMetrics.downMachines > 0) && (
          <div className='mb-8 flex flex-col gap-3'>
            {baseMetrics.pendingRequests > 0 && (
              <div className='bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in'>
                <div className='flex items-center gap-3 text-amber-800 font-bold text-sm'>
                  <div className='w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-lg shrink-0'><FiInbox /></div>
                  <p>You have {baseMetrics.pendingRequests} pending exception requests awaiting your approval.</p>
                </div>
                <Link href='/manager/bookings' className='px-5 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors shrink-0'>Review Pipeline</Link>
              </div>
            )}
            {baseMetrics.downMachines > 0 && (
              <div className='bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in'>
                <div className='flex items-center gap-3 text-rose-800 font-bold text-sm'>
                  <div className='w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-lg shrink-0'><FiAlertTriangle /></div>
                  <p>{baseMetrics.downMachines} machines are currently flagged as Faulty or Under Maintenance.</p>
                </div>
                <Link href='/manager/machines' className='px-5 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-colors shrink-0'>Check Inventory</Link>
              </div>
            )}
          </div>
        )}

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
          <div className='bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden'>
            <div className='absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full opacity-50'></div>
            <div className='relative z-10'>
              <div className='flex justify-between items-start mb-2'><p className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>Upcoming Sessions</p><FiActivity className='text-xl text-blue-500' /></div>
              <h3 className='text-3xl font-black text-slate-800'>{dynamicMetrics.totalSessions}</h3>
            </div>
          </div>

          <Link href="/manager/bookings" className={`p-5 rounded-2xl border shadow-sm relative overflow-hidden group transition-all ${baseMetrics.pendingRequests > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
            <div className='relative z-10'>
              <div className='flex justify-between items-start mb-2'><p className={`text-[10px] font-black uppercase tracking-widest ${baseMetrics.pendingRequests > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Pending Approvals</p><FiInbox className={`text-xl ${baseMetrics.pendingRequests > 0 ? 'text-amber-600' : 'text-slate-400'}`} /></div>
              <h3 className={`text-3xl font-black ${baseMetrics.pendingRequests > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{baseMetrics.pendingRequests}</h3>
            </div>
          </Link>

          <Link href="/manager/machines" className='bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden hover:bg-slate-50 transition-colors group'>
            <div className='relative z-10'>
              <div className='flex justify-between items-start mb-2'><p className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>Machine Status</p><FiSettings className='text-xl text-slate-400' /></div>
              <div className='flex items-baseline gap-2'><h3 className='text-3xl font-black text-slate-800'>{baseMetrics.activeMachines}</h3><span className='text-sm font-bold text-slate-500'>Active</span></div>
            </div>
          </Link>

          <Link href="/manager/roster" className='bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden hover:bg-slate-50 transition-colors group'>
            <div className='relative z-10'>
              <div className='flex justify-between items-start mb-2'>
                <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>Staff on Duty (Today)</p>
                <FiUsers className='text-xl text-purple-500' />
              </div>
              <h3 className='text-3xl font-black text-slate-800'>{baseMetrics.staffOnDutyToday}</h3>
            </div>
          </Link>
        </div>

        <div className='bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden mb-8'>
          <div className='p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center'>
            <h2 className='text-lg font-black text-slate-800 flex items-center gap-2'><FiClock className='text-blue-500'/> 14-Day Clinical Schedule</h2>
            <span className='px-3 py-1 bg-white shadow-sm text-slate-600 text-xs font-bold rounded-lg border border-slate-200'>{dynamicMetrics.totalSessions} Sessions</span>
          </div>

          <div className='p-6 overflow-y-auto max-h-[600px] custom-scrollbar'>
            {sortedDates.length === 0 ? (
              <div className='text-center py-16 opacity-50 bg-slate-50 rounded-2xl border border-slate-100'>
                <FiCalendar className='text-5xl mx-auto mb-4 text-slate-400' />
                <h3 className='text-lg font-bold text-slate-700'>No sessions scheduled.</h3>
              </div>
            ) : (
              <div className='space-y-8'>
                {sortedDates.map(dateStr => {
                  const dateObj = new Date(dateStr);
                  const displayDate = dateObj.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  const isToday = dateStr === getLocalISODate(new Date());

                  return (
                    <div key={dateStr} className='relative'>
                      <div className={`sticky top-0 z-10 py-3 mb-4 border-b-2 flex justify-between items-end ${isToday ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white/95 backdrop-blur-sm'}`}>
                        <h3 className={`text-lg font-black ${isToday ? 'text-blue-600' : 'text-slate-800'}`}>{isToday ? 'TODAY: ' : ''}{displayDate}</h3>
                      </div>
                      <ShiftSection title="Morning Shift (07:00 - 11:00)" sessions={dynamicSchedule[dateStr].Morning} />
                      <ShiftSection title="Afternoon Shift (12:00 - 16:00)" sessions={dynamicSchedule[dateStr].Afternoon} />
                      <ShiftSection title="Evening Shift (17:00 - 21:00)" sessions={dynamicSchedule[dateStr].Evening} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className='bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'>
          <div className='p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
            <div>
              <h2 className='text-lg font-black text-slate-800 flex items-center gap-2'><FiUsers className='text-indigo-500'/> Patient Logistics Directory</h2>
            </div>
            <div className='relative w-full md:w-72'>
              <FiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
              <input type="text" placeholder="Search patient name or IC..." value={patientSearch} onChange={e => setPatientSearch(e.target.value)} className='w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium transition-colors shadow-sm' />
            </div>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full text-left border-collapse'>
              <thead>
                <tr className='bg-white border-b border-slate-200'>
                  <th className='p-4 text-xs font-black text-slate-400 uppercase tracking-widest'>Patient Identity</th>
                  <th className='p-4 text-xs font-black text-slate-400 uppercase tracking-widest'>Infection Status</th>
                  <th className='p-4 text-xs font-black text-slate-400 uppercase tracking-widest'>Schedule Pattern</th>
                  <th className='p-4 text-xs font-black text-slate-400 uppercase tracking-widest'>Dedicated Machine</th>
                  <th className='p-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {filteredPatients.length === 0 ? (
                  <tr><td colSpan={5} className='p-8 text-center text-slate-500 font-medium'>No patients match your search.</td></tr>
                ) : (
                  filteredPatients.map(patient => {
                    const isInfectious = patient.hepatitis_b_status === 'Positive' || patient.hepatitis_c_status === 'Positive' || patient.hiv_status === 'Positive';
                    const assignedMachine = patient.assigned_machine;

                    return (
                      <tr key={patient.patient_id} className='hover:bg-slate-50/50 transition-colors'>
                        <td className='p-4'>
                          <div className='flex items-center gap-3'>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isInfectious ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>{patient.users?.user_fullname.charAt(0)}</div>
                            <div><p className='font-bold text-slate-800'>{patient.users?.user_fullname}</p><p className='text-xs text-slate-500 font-medium'>{patient.users?.user_contact_number}</p></div>
                          </div>
                        </td>
                        <td className='p-4'>
                          {isInfectious ? (
                            <span className='px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-wider rounded border border-rose-200 flex items-center w-max gap-1'><FiAlertTriangle /> Isolation Req</span>
                          ) : (
                            <span className='px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded flex items-center w-max gap-1'><FiCheckCircle /> Standard</span>
                          )}
                        </td>
                        <td className='p-4'><div className='flex flex-col gap-1'><span className='text-sm font-bold text-slate-700'>{patient.schedule_pattern || 'Not Set'}</span><span className='text-xs text-slate-500'>{patient.preferred_shift || 'No Shift'}</span></div></td>
                        <td className='p-4'>
                          {assignedMachine ? (
                            <div className='flex flex-col gap-1'><span className='text-sm font-bold text-slate-800'>{assignedMachine.serial_number}</span><span className='text-[10px] text-slate-500 font-bold uppercase tracking-wider'>{assignedMachine.model}</span></div>
                          ) : (<span className='text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200'>Unassigned</span>)}
                        </td>
                        <td className='p-4 text-right'><button onClick={() => openPatientModal(patient)} className='px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all inline-flex items-center gap-1.5 shadow-sm'><FiEdit2 /> Manage</button></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isPatientModalOpen && selectedPatient && (
        <div className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in'>
          <div className='bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden'>
            <div className='px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50'>
              <h3 className='font-black text-slate-800 text-lg flex items-center gap-2'><FiUser /> Patient Logistics</h3>
              <button onClick={() => setIsPatientModalOpen(false)} className='text-slate-400 hover:text-slate-600 text-xl font-bold'><FiX /></button>
            </div>
            
            <div className='p-6 max-h-[75vh] overflow-y-auto custom-scrollbar'>
              <div className='bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-6'>
                <div className='flex-1'>
                  <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1'>Patient Identity</p>
                  <h4 className='text-xl font-black text-slate-800'>{selectedPatient.users?.user_fullname}</h4>
                  <p className='text-sm font-bold text-slate-500 mt-1'>IC: {selectedPatient.users?.user_ic}</p>
                </div>
                <div className='flex-1 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6'>
                  <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2'>Infection Status</p>
                  <div className='flex flex-wrap gap-2'>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded ${selectedPatient.hepatitis_b_status === 'Positive' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700'}`}>Hep B: {selectedPatient.hepatitis_b_status}</span>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded ${selectedPatient.hepatitis_c_status === 'Positive' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700'}`}>Hep C: {selectedPatient.hepatitis_c_status}</span>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded ${selectedPatient.hiv_status === 'Positive' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700'}`}>HIV: {selectedPatient.hiv_status}</span>
                  </div>
                </div>
              </div>

              {clashWarning && (
                <div className='mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 shadow-sm animate-in zoom-in-95'>
                  <FiAlertTriangle className='text-rose-600 text-xl shrink-0 mt-0.5' />
                  <p className='text-sm font-black text-rose-800 leading-snug'>{clashWarning}</p>
                </div>
              )}

              <form id="patient-form" onSubmit={handleSavePatientLogistics} className='space-y-5'>
                <div className='bg-blue-50 border border-blue-100 p-5 rounded-xl'>
                  <label className='block text-xs font-black text-blue-800 uppercase tracking-widest mb-2'>Assigned Shift Schedule</label>
                  <div className='grid grid-cols-2 gap-4'>
                    <select value={patientForm.schedule_pattern} onChange={e => setPatientForm({...patientForm, schedule_pattern: e.target.value})} className='w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700'>
                      <option value="MWF">Mon - Wed - Fri (MWF)</option>
                      <option value="TTS">Tue - Thu - Sat (TTS)</option>
                    </select>
                    <select value={patientForm.preferred_shift} onChange={e => setPatientForm({...patientForm, preferred_shift: e.target.value})} className='w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700'>
                      <option value="">-- Unassigned --</option>
                      <option value="Morning (08:00 - 12:00)">Morning (08:00 - 12:00)</option>
                      <option value="Afternoon (12:00 - 16:00)">Afternoon (12:00 - 16:00)</option>
                      <option value="Evening (17:00 - 21:00)">Evening (17:00 - 21:00)</option>
                    </select>
                  </div>
                </div>

                <div className='bg-amber-50 border border-amber-100 p-5 rounded-xl'>
                  <label className='block text-xs font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center justify-between'>
                    Dedicated Machine Assignment
                    {(selectedPatient.hepatitis_b_status === 'Positive' || selectedPatient.hepatitis_c_status === 'Positive') && <span className='text-[10px] text-rose-600 animate-pulse'>*Isolation Filter Required</span>}
                  </label>
                  <select value={patientForm.machine_id} onChange={e => setPatientForm({...patientForm, machine_id: e.target.value})} className={`w-full p-3 bg-white border ${clashWarning ? 'border-rose-400 focus:border-rose-500 ring-2 ring-rose-100' : 'border-amber-200 focus:border-amber-500'} rounded-lg outline-none font-bold text-slate-700`}>
                    <option value="">-- Unassigned (Floating Pool) --</option>
                    {branchMachines.map(m => {
                      const occupiedMachineIds = new Set(branchPatients.filter(p => p.patient_id !== selectedPatient.patient_id && p.schedule_pattern === patientForm.schedule_pattern && p.preferred_shift === patientForm.preferred_shift && p.assigned_machine_id).map(p => p.assigned_machine_id?.toString()));
                      const mIdStr = m.id.toString();
                      if (!occupiedMachineIds.has(mIdStr) || patientForm.machine_id === mIdStr) {
                        return <option key={m.id} value={m.id}>{mIdStr === selectedPatient.assigned_machine_id?.toString() ? '[CURRENT] ' : ''} {m.model} (SN: {m.serial_number}) {m.has_endotoxin_filter ? '- [Has Endotoxin Filter]' : ''} {occupiedMachineIds.has(mIdStr) ? ' [CLASH DETECTED]' : ''}</option>;
                      }
                      return null;
                    })}
                  </select>
                </div>
              </form>
            </div>
            <div className='p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3'>
              <button type="button" onClick={() => setIsPatientModalOpen(false)} className='px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors'>Cancel</button>
              <button form="patient-form" type="submit" disabled={isSaving || !!clashWarning} className='px-8 py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md disabled:opacity-50 disabled:bg-slate-400 transition-colors'>{isSaving ? 'Saving...' : 'Save Patient Logistics'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
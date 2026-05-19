'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { FiUsers, FiFileText, FiActivity, FiCalendar, FiClock, FiMapPin, FiChevronRight, FiX } from 'react-icons/fi';

// Helper to format dates nicely (e.g., "Mon, Oct 12")
const formatShiftDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Helper to format time (e.g., "08:00:00" -> "08:00")
const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  return timeStr.slice(0, 5); 
};

export default function NephrologistDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalPatients: 0,
    recentPrescriptions: 0,
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  
  // Replaced shifts with ward rounds
  const [upcomingRounds, setUpcomingRounds] = useState<any[]>([]);

  // Leave Modal States
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'ANNUAL_LEAVE',
    reason: '',
    coveringDoctor: ''
  });

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Leave request sent to Clinic Management. The nursing teams will be notified once approved.`);
    setShowLeaveModal(false);
  };

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;

        // 1. Get Nephrologist Info
        const { data: userData } = await supabase
          .from('users')
          .select('user_id, role_id')
          .eq('user_email', sessionData.session.user.email)
          .single();

        if (userData) {
          // 2. GLOBAL VIEW: Fetch ALL Patients across the network
          const { data: patients, error: patientError } = await supabase
            .from('patients')
            .select(`
              patient_id, 
              users!inner(user_fullname, user_ic),
              branches(branch_name),
              prescriptions(updated_at, target_dry_weight)
            `)
            .order('patient_id', { ascending: false }); // Used patient_id since patients table has no created_at

          if (patientError) console.error("Error fetching patients", patientError);

          const totalPatients = patients?.length || 0;
          
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          
          const recentPrescriptions = patients?.filter(p => 
            p.prescriptions && p.prescriptions.length > 0 && 
            new Date(p.prescriptions[0].updated_at) > oneWeekAgo
          ).length || 0;

          setDashboardData({
            totalPatients,
            recentPrescriptions,
          });

          // Show the 5 most recently registered patients across all branches
          setRecentPatients(patients?.slice(0, 5) || []);

          // 3. WARD ROUNDS: Fetch Expected Visits from the new table
          const todayStr = new Date().toISOString().split('T')[0];
          
          if (userData.user_id) {
            const { data: rounds, error: roundsError } = await supabase
              .from('ward_rounds')
              .select('*, branches(branch_name)') // Pull in the branch name so doctor knows where to go
              .eq('doctor_id', userData.user_id)
              .gte('visit_date', todayStr)
              .order('visit_date', { ascending: true })
              .limit(10);
  
            if (roundsError) {
              console.error("Supabase Error fetching ward rounds:", roundsError);
              setUpcomingRounds([]);
            } else {
              setUpcomingRounds(rounds || []);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Clinical Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nephrologist Portal</h1>
      </header>

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl"><FiUsers /></div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Patients (Network)</p>
            <p className="text-3xl font-black text-slate-900">{dashboardData.totalPatients}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl"><FiFileText /></div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Recent Prescriptions</p>
            <p className="text-3xl font-black text-slate-900">{dashboardData.recentPrescriptions}</p>
          </div>
        </div>
      </div>

      {/* 🚀 UPCOMING WARD ROUNDS */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FiMapPin className="text-blue-500" /> Expected Ward Rounds
          </h2>
          <button 
            onClick={() => setShowLeaveModal(true)} 
            className="px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl text-xs hover:bg-blue-100 transition-colors border border-blue-100"
          >
            Notify Absence
          </button>
        </div>
        
        {upcomingRounds.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {upcomingRounds.map((round) => (
              <div key={round.id} className="min-w-[260px] bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-sm shrink-0 snap-start flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <p className="font-black text-base text-blue-400">{formatShiftDate(round.visit_date)}</p>
                  <span className="px-2.5 py-1 bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                    <FiMapPin /> Scheduled
                  </span>
                </div>
                
                <h3 className="text-xl font-black leading-tight mb-4">
                  {round.branches?.branch_name || 'Assigned Branch'}
                </h3>
                
                <div className="flex items-center gap-2 text-sm font-black text-slate-300 bg-white/5 p-3 rounded-xl border border-white/10">
                  <FiClock className="text-blue-400" />
                  {formatTime(round.arrival_time)} - {formatTime(round.departure_time)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center flex flex-col items-center justify-center">
            <FiCalendar className="text-4xl text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-400">No upcoming clinic visits requested by management.</p>
          </div>
        )}
      </div>

      {/* FULL WIDTH PATIENT DIRECTORY */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FiUsers className="text-slate-400"/> Recently Added Patients</h2>
          <Link href="/nephrologist/patients" className="text-sm font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            Open Directory <FiChevronRight />
          </Link>
        </div>
        <div className="divide-y divide-slate-100 flex-1">
          {recentPatients.map((patient) => (
            <div key={patient.patient_id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-5">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xl border border-slate-200 shadow-inner shrink-0">
                  {patient.users?.user_fullname?.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-lg text-slate-900">{patient.users?.user_fullname}</p>
                  <p className="text-xs text-slate-400 font-bold mt-1 flex items-center gap-2">
                    <span className="uppercase tracking-widest">IC: {patient.users?.user_ic}</span> 
                    <span>•</span> 
                    <span className="text-blue-600 flex items-center gap-1"><FiMapPin /> {patient.branches?.branch_name}</span>
                  </p>
                </div>
              </div>
              <Link href={`/nephrologist/patients`} className="w-full sm:w-auto px-6 py-3 bg-white border border-slate-200 text-slate-700 text-center font-bold rounded-xl text-sm hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm">
                Review Medical File
              </Link>
            </div>
          ))}
          {recentPatients.length === 0 && (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <FiUsers className="text-5xl mb-4 opacity-20" />
              <p className="font-bold text-sm">No patients found in the network.</p>
            </div>
          )}
        </div>
      </div>

      {/* LEAVE MODAL */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><FiCalendar /> Notify Clinical Absence</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-red-500"><FiX className="text-2xl" /></button>
            </div>
            
            <form onSubmit={handleLeaveSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Start Date</label>
                  <input type="date" required value={leaveForm.startDate} onChange={e => setLeaveForm({...leaveForm, startDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">End Date</label>
                  <input type="date" required value={leaveForm.endDate} onChange={e => setLeaveForm({...leaveForm, endDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Absence Category</label>
                <select value={leaveForm.leaveType} onChange={e => setLeaveForm({...leaveForm, leaveType: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500">
                  <option value="ANNUAL_LEAVE">Annual Leave / Planned Absence</option>
                  <option value="MEDICAL_LEAVE">Medical Leave (Urgent)</option>
                  <option value="CONFERENCE">Medical Conference / CME</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Covering Physician Details</label>
                <input type="text" placeholder="e.g., Dr. Lim (Ext. 402)" required value={leaveForm.coveringDoctor} onChange={e => setLeaveForm({...leaveForm, coveringDoctor: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500" />
              </div>

              <button type="submit" className="w-full py-4 mt-4 bg-blue-600 text-white rounded-xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
                Submit to Clinic Management
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
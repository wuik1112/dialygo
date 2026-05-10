'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { FiUsers, FiFileText, FiActivity, FiCalendar, FiClock, FiCoffee, FiSun, FiChevronRight, FiX } from 'react-icons/fi';

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
    branchName: ''
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([]);

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
    alert(`Leave request sent to Branch Manager. The nursing team will be notified once approved.`);
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
          .select('user_id, branch_id, branches(branch_name), role_id')
          .eq('user_email', sessionData.session.user.email)
          .single();

        if (userData) {
          const branchInfo = userData.branches as any;
          const resolvedBranchName = Array.isArray(branchInfo) 
            ? branchInfo[0]?.branch_name 
            : branchInfo?.branch_name;

          // 2. Fetch Patients in the same branch
          const { data: patients } = await supabase
            .from('patients')
            .select(`
              patient_id, 
              users!inner(user_fullname, user_ic),
              prescriptions(updated_at, target_dry_weight)
            `)
            .eq('home_branch_id', userData.branch_id);

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
            branchName: resolvedBranchName || 'Unassigned Branch'
          });

          setRecentPatients(patients?.slice(0, 5) || []);

          // 3. NUCLEAR FILTER: Fetch Upcoming Roster Schedule
          const todayStr = new Date().toISOString().split('T')[0];
          
          if (userData.user_id) {
            console.log("Fetching shifts exactly for Doctor ID:", userData.user_id); // For debugging
            
            const { data: shifts, error: shiftError } = await supabase
              .from('staff_roster')
              .select('*')
              .eq('nurse_id', userData.user_id) // STRICT Database filter
              .gte('shift_date', todayStr)
              .order('shift_date', { ascending: true })
              .limit(10);
  
            if (shiftError) {
              console.error("Supabase Error fetching shifts:", shiftError);
              setUpcomingShifts([]);
            } else {
              // STRICT Frontend filter: Physically delete any shift from the array that isn't this exact doctor
              const strictlyMyShifts = (shifts || []).filter(shift => Number(shift.nurse_id) === Number(userData.user_id));
              setUpcomingShifts(strictlyMyShifts);
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
          <span>Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nephrologist Portal</h1>
        <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> {dashboardData.branchName} Overview
        </p>
      </header>

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl"><FiUsers /></div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Patients</p>
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

      {/* 🚀 UPCOMING SCHEDULE */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FiCalendar className="text-blue-500" /> My Upcoming Schedule
          </h2>
          <button 
            onClick={() => setShowLeaveModal(true)} 
            className="px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl text-xs hover:bg-blue-100 transition-colors border border-blue-100"
          >
            Request Leave
          </button>
        </div>
        
        {upcomingShifts.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {upcomingShifts.map((shift) => (
              <div key={shift.id} className="min-w-[260px] bg-white p-5 rounded-3xl border border-slate-200 shadow-sm shrink-0 snap-start flex flex-col justify-between hover:border-blue-200 transition-colors cursor-default">
                <div className="flex justify-between items-start mb-4">
                  <p className="font-black text-base text-slate-900">{formatShiftDate(shift.shift_date)}</p>
                  {shift.shift_type === 'WORK' ? (
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <FiSun /> Duty
                    </span>
                  ) : shift.shift_type === 'OFF_DAY' ? (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <FiCoffee /> Off Day
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <FiCalendar /> Leave
                    </span>
                  )}
                </div>
                
                {shift.shift_type === 'WORK' && (
                  <div className="flex items-center gap-2 text-sm font-black text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <FiClock className="text-blue-500" />
                    {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                  </div>
                )}
                
                {(shift.remarks || shift.shift_role) && shift.shift_type === 'WORK' && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Assignment:</p>
                    <p className="text-xs font-bold text-slate-700 mt-1">{shift.shift_role || 'Ward Rounds'}</p>
                    {shift.remarks && <p className="mt-1 text-xs font-bold text-blue-600 italic">"{shift.remarks}"</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center flex flex-col items-center justify-center">
            <FiCalendar className="text-4xl text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-400">No upcoming shifts scheduled for you by the branch manager.</p>
          </div>
        )}
      </div>

      {/* FULL WIDTH PATIENT DIRECTORY */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FiUsers className="text-slate-400"/> Patients Under Care</h2>
          <Link href="/nephrologist/patients" className="text-sm font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            Open Directory <FiChevronRight />
          </Link>
        </div>
        <div className="divide-y divide-slate-100 flex-1">
          {recentPatients.map((patient) => (
            <div key={patient.patient_id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-5">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xl border border-slate-200 shadow-inner">
                  {patient.users?.user_fullname?.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-lg text-slate-900">{patient.users?.user_fullname}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">IC: {patient.users?.user_ic}</p>
                </div>
              </div>
              <Link href={`/nephrologist/patients`} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-sm hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm">
                Review Medical File
              </Link>
            </div>
          ))}
          {recentPatients.length === 0 && (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <FiUsers className="text-5xl mb-4 opacity-20" />
              <p className="font-bold text-sm">No patients found in your assigned branch.</p>
            </div>
          )}
        </div>
      </div>

      {/* LEAVE MODAL */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><FiCalendar /> Request Clinical Leave</h3>
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Leave Category</label>
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
                Submit to Branch Manager
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
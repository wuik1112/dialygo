'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function ManagerDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  
  // Primary Path 2: System defaults to current date
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Exception Path 3(b): Network Error & Cached Data tracking
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [cachedTimestamp, setCachedTimestamp] = useState<string | null>(null);

  // Alternative Path 3(a): Incomplete Setup tracking
  const [setupStatus, setSetupStatus] = useState<'checking' | 'complete' | 'incomplete'>('checking');

  const [branchData, setBranchData] = useState<any>(null);
  const [metrics, setMetrics] = useState({
    pendingRequests: 0,
    confirmedSessions: 0,
    totalDailyCapacity: 0,
    occupancyRate: 0,
    nursesOnDuty: 0
  });

  // Ref to hold the last successful data snapshot for Exception 3(b)
  const cachedDataRef = useRef<any>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      setIsLoading(true);
      setIsNetworkError(false);

      try {
        // Pre-condition: Authenticate Manager
        const { data: sessionData, error: authErr } = await supabase.auth.getSession();
        if (authErr || !sessionData.session) throw new Error("Authentication failed.");

        const email = sessionData.session.user.email;
        
        // Retrieve manager's assigned branch
        const { data: managerProfile, error: profileErr } = await supabase
          .from('users')
          .select('branch_id')
          .eq('user_email', email)
          .single();

        if (profileErr || !managerProfile?.branch_id) throw new Error("Profile error or no branch assigned.");
        const branchId = managerProfile.branch_id;

        // Primary Path 3 & 4: Retrieve real-time status for machines, rosters, and bookings
        // Using Promise.all to fetch from the tables defined in your ERD simultaneously
        const [branchRes, machinesRes, staffRes, rosterRes, bookingsRes] = await Promise.all([
          supabase.from('branches').select('*').eq('id', branchId).single(),
          supabase.from('machines').select('id').eq('branch_id', branchId),
          supabase.from('users').select('user_id').eq('branch_id', branchId).eq('role_id', 4), // 4 = Nurse
          supabase.from('staff_roster').select('id').eq('branch_id', branchId).eq('shift_date', selectedDate),
          supabase.from('bookings').select('id, status').eq('branch_id', branchId).eq('booking_date', selectedDate)
        ]);

        if (branchRes.error) throw new Error("Database query failed.");

        const branchDetails = branchRes.data;
        const machines = machinesRes.data || [];
        const nurses = staffRes.data || [];
        const roster = rosterRes.data || [];
        const bookings = bookingsRes.data || [];

        // Alternative Path 3(a): Detect if machine inventory or staff roster has not been configured
        if (machines.length === 0 || nurses.length === 0) {
          setSetupStatus('incomplete');
          setIsLoading(false);
          return;
        }

        setSetupStatus('complete');

        // Calculate Metrics for the selected date
        // Note: Using 'PENDING_REVIEW' as strictly defined in your default constraints
        const confirmedCount = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'APPROVED').length;
        const pendingCount = bookings.filter(b => b.status === 'PENDING_REVIEW').length;
        
        // Assuming 3 shifts per machine per day (Morning, Afternoon, Evening) for total capacity
        const dailyCapacity = branchDetails.total_machines * 3; 
        
        // Primary Path 5 & Alternative Path 4(a).2: Occupancy Rate (Booked Slots / Total Capacity * 100)
        let occupancy = 0;
        if (confirmedCount > 0 && dailyCapacity > 0) {
          occupancy = Math.round((confirmedCount / dailyCapacity) * 100);
        }

        const newData = {
          branch: branchDetails,
          metrics: {
            pendingRequests: pendingCount,
            confirmedSessions: confirmedCount,
            totalDailyCapacity: dailyCapacity,
            occupancyRate: occupancy,
            nursesOnDuty: roster.length // Count of shift assignments for the selected date
          },
          timestamp: new Date().toLocaleTimeString()
        };

        // Save successfully fetched data to state and cache
        setBranchData(newData.branch);
        setMetrics(newData.metrics);
        setCachedTimestamp(newData.timestamp);
        cachedDataRef.current = newData;

      } catch (err: any) {
        // Exception Path 3(b): Network error fallback
        setIsNetworkError(true);
        if (cachedDataRef.current) {
          setBranchData(cachedDataRef.current.branch);
          setMetrics(cachedDataRef.current.metrics);
          setCachedTimestamp(cachedDataRef.current.timestamp);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [selectedDate]); // Primary Path 8: Re-fetches data when selectedDate changes

  // Loading State
  if (isLoading && !cachedDataRef.current) {
    return <div className='p-8 text-slate-600 font-sans text-center mt-20'>Loading Real-Time Metrics...</div>;
  }

  // Alternative Path 3(a): Incomplete Setup State
  if (setupStatus === 'incomplete') {
    return (
      <main className='p-8 bg-slate-50 min-h-screen font-sans flex items-center justify-center'>
        <div className='bg-white p-8 rounded-2xl border border-red-200 shadow-lg text-center max-w-md'>
          <div className='text-5xl mb-4'>⚠️</div>
          <h2 className='text-xl font-bold text-slate-900 mb-2'>Incomplete Setup</h2>
          <p className='text-slate-600 mb-6 text-sm leading-relaxed'>
            The system detects that the machine inventory or staff roster has not been configured for this branch.
          </p>
          <Link href="/manager/settings" className='inline-block w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors'>
            Configure Resources
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans'>
      <div className='max-w-7xl mx-auto'>
        
        {/* Exception Path 3(b): Network Error Banner */}
        {isNetworkError && cachedTimestamp && (
          <div className='mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-sm font-bold animate-in fade-in'>
            <span>⚠️</span>
            <span>Unable to load real-time metrics. Displaying cached data from {cachedTimestamp}.</span>
          </div>
        )}

        {/* Dashboard Header */}
        <div className='flex flex-col md:flex-row justify-between items-end mb-8 gap-4'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Branch Dashboard</h1>
            <div className='mt-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3'>
              <span className='inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-bold shadow-sm'>
                <span>🏥</span> {branchData?.branch_name || 'Loading Branch Name...'}
              </span>
              <span className='text-slate-500 text-sm font-medium flex items-center gap-1.5'>
                <span>📍</span> {branchData?.branch_address || 'Address not configured'}
              </span>
            </div>
          </div>
          
          {/* Primary Path 7: Date Picker */}
          <div className='flex flex-col items-end'>
            <label className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'>Viewing Schedule For</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className='px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors'
            />
          </div>
        </div>

        {/* Primary Path 6: Widgets */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md'>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Occupancy Rate</p>
              <p className='text-3xl font-black text-slate-800'>{metrics.occupancyRate}%</p>
            </div>
            <div className='h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl'>📊</div>
          </div>

          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md'>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Confirmed Sessions</p>
              <p className='text-3xl font-black text-slate-800'>
                {metrics.confirmedSessions} <span className='text-sm text-slate-400 font-medium'>/ {metrics.totalDailyCapacity}</span>
              </p>
            </div>
            <div className='h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl'>✅</div>
          </div>

          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md'>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Pending Requests</p>
              <p className={`text-3xl font-black ${metrics.pendingRequests > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
                {metrics.pendingRequests}
              </p>
            </div>
            <div className={`h-14 w-14 rounded-full flex items-center justify-center text-2xl ${metrics.pendingRequests > 0 ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-400'}`}>🔔</div>
          </div>

          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md'>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Nurses on Duty</p>
              <p className='text-3xl font-black text-slate-800'>{metrics.nursesOnDuty}</p>
            </div>
            <div className='h-14 w-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl'>🧑‍⚕️</div>
          </div>
        </div>

        {/* Booking Module Container */}
        <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
          <div className='px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50'>
            <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2'>
              {metrics.pendingRequests > 0 && <span className='w-2 h-2 rounded-full bg-amber-500 animate-pulse'></span>}
              Session Logistics
            </h2>
          </div>
          
          <div className='p-12 flex flex-col items-center justify-center min-h-[250px]'>
            {metrics.confirmedSessions === 0 && metrics.pendingRequests === 0 ? (
              // Alternative Path 4(a).3: Exact Empty State Message
              <div className='text-center animate-in fade-in'>
                <div className='text-4xl mb-3'>🗓️</div>
                <p className='text-slate-500 font-medium text-lg'>No sessions scheduled for this date.</p>
              </div>
            ) : (
              <div className='w-full text-center'>
                <p className='text-slate-600 font-medium mb-4'>
                  You have {metrics.confirmedSessions} confirmed sessions and {metrics.pendingRequests} pending requests for this date.
                </p>
                <Link href='/manager/bookings' className='inline-block px-8 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg transition-all'>
                  Review Bookings Pipeline
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FiUsers, FiSettings, FiBarChart2, FiActivity, FiAlertCircle } from 'react-icons/fi';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // LOGIC FIX: Define the current week's boundary (Monday to Sunday)
        const startOfWeek = new Date(today);
        const dayOfWeek = today.getDay();
        const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startOfWeek.setDate(diffToMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        const startStr = startOfWeek.toISOString().split('T')[0];
        const endStr = endOfWeek.toISOString().split('T')[0];

        const [branchesRes, bookingsRes, patientsRes] = await Promise.all([
          supabase.from('branches').select('id, branch_name, total_machines').eq('status', 'Active'),
          // LOGIC FIX: Filter bookings to ONLY the current week to prevent chart bloat
          supabase.from('bookings').select('branch_id, patient_id, booking_status, booking_date, booking_session_time')
            .neq('booking_status', 'Cancelled')
            .gte('booking_date', startStr)
            .lte('booking_date', endStr),
          supabase.from('patients').select('patient_id, home_branch_id')
        ]);

        if (branchesRes.error || bookingsRes.error || patientsRes.error) throw new Error('Data fetch failed');

        const branches = branchesRes.data || [];
        const bookings = bookingsRes.data || [];
        const patients = patientsRes.data || [];

        // 1. Live Branch Occupancy & Cross-Branch Visits (FIXED MATH)
        let totalActiveTravelers = 0;
        
        const occupancyData = branches.map((branch) => {
          // LOGIC FIX: Daily Capacity = 1 machine handles 3 shifts per day
          const totalDailyCapacity = (branch.total_machines || 0) * 3;
          
          const homePatientsList = patients.filter(p => p.home_branch_id === branch.id);
          
          // Look ONLY at bookings for THIS branch, happening TODAY
          const todaysBookings = bookings.filter(b => b.branch_id === branch.id && b.booking_date === todayStr);
          const totalUsedSlotsToday = todaysBookings.length;

          // Split today's sessions into Home vs Travel Guests
          const travelPatientsToday = todaysBookings.filter(b => !homePatientsList.some(hp => hp.patient_id === b.patient_id)).length;
          const homePatientsToday = totalUsedSlotsToday - travelPatientsToday;

          totalActiveTravelers += travelPatientsToday;

          const occupancy = totalDailyCapacity > 0 
            ? Math.round((totalUsedSlotsToday / totalDailyCapacity) * 100) 
            : 0;

          return {
            uniqueKey: branch.id || branch.branch_name, 
            name: branch.branch_name,
            occupancy,
            homePatients: homePatientsToday,
            travelPatients: travelPatientsToday,
            totalSlots: totalDailyCapacity,
            usedSlots: totalUsedSlotsToday
          };
        });

        // 2. Popular Session Times (Now accurately reflects THIS WEEK)
        let morning = 0, afternoon = 0, evening = 0;
        bookings.forEach(b => {
          const shift = b.booking_session_time?.toLowerCase();
          if (shift?.includes('morning')) morning++;
          else if (shift?.includes('afternoon')) afternoon++;
          else if (shift?.includes('evening')) evening++;
        });
        const maxSessionLoad = Math.max(morning, afternoon, evening, 1);

        // 3. Weekly Patient Load (Now accurately scoped to THIS WEEK)
        const weeklyLoad = [0, 0, 0, 0, 0, 0, 0];
        bookings.forEach(b => {
          if (b.booking_date) {
            const date = new Date(b.booking_date);
            const day = date.getDay(); 
            const index = day === 0 ? 6 : day - 1; 
            if (index >= 0 && index < 7) weeklyLoad[index]++;
          }
        });
        const maxWeeklyLoad = Math.max(...weeklyLoad, 1);

        const totalNetSlots = occupancyData.reduce((acc, b) => acc + b.totalSlots, 0);
        const totalNetUsed = occupancyData.reduce((acc, b) => acc + b.usedSlots, 0);

        setData({
          occupancyData,
          networkUtilization: totalNetSlots > 0 ? Math.round((totalNetUsed / totalNetSlots) * 100) : 0,
          totalMachines: branches.reduce((acc, b) => acc + (b.total_machines || 0), 0),
          totalPatients: patients.length,
          sessionTimes: { morning, afternoon, evening, max: maxSessionLoad },
          crossBranchVisits: totalActiveTravelers,
          weeklyLoad,
          maxWeeklyLoad,
          isEmpty: branches.length === 0 || patients.length === 0
        });
      } catch (err) {
        console.error("Dashboard Logic Error:", err);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  // Standardized Loading Animation
  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Network Telemetry...</span>
        </div>
      </div>
    );
  }

  // UC-02 Exception Path 1: Database Connection Failure
  if (isError) {
    return (
      <main className='p-8 bg-slate-50 min-h-screen flex items-center justify-center font-sans'>
        <div className='max-w-md w-full p-8 bg-white border border-red-100 rounded-3xl shadow-xl text-center'>
          <FiAlertCircle className='text-red-500 text-5xl mx-auto mb-4' />
          <h2 className='text-xl font-bold text-slate-800 mb-2'>Connection Error</h2>
          <p className='text-slate-500 text-sm mb-6'>Unable to load dashboard metrics. Please try again later.</p>
          <button onClick={() => window.location.reload()} className='w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors'>
            Retry Connection
          </button>
        </div>
      </main>
    );
  }

  // UC-02 Exception Path 3: Zero Active Branches / Zero Patient Data
  if (data?.isEmpty) {
    return (
      <main className='p-8 bg-slate-50 min-h-screen flex items-center justify-center font-sans'>
        <div className='text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm'>
          <FiBarChart2 className='text-slate-300 text-6xl mx-auto mb-4' />
          <p className='text-slate-500 font-medium'>No operational data available for the current period.</p>
        </div>
      </main>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans'>
      <div className='max-w-6xl mx-auto'>
        
        <header className='mb-10'>
          <h1 className='text-3xl font-black text-slate-900'>Network Dashboard</h1>
        </header>

        {/* Global KPIs */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-10'>
          <StatCard label="Network Load" value={`${data.networkUtilization}%`} icon={<FiBarChart2 />} />
          <StatCard label="Total Machines" value={data.totalMachines} icon={<FiSettings />} />
          <StatCard label="Registered Patients" value={data.totalPatients} icon={<FiUsers />} />
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
          
          {/* Live Branch Occupancy */}
          <section className='bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden'>
            <div className='p-6 border-b border-slate-100 bg-slate-50/50'>
              <h2 className='font-bold text-slate-800'>Live Branch Occupancy</h2>
            </div>
            <table className='w-full text-left border-collapse'>
              <thead>
                <tr className='text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100'>
                  <th className='p-6 font-black'>Branch Name</th>
                  <th className='p-6 font-black'>Slot Occupancy</th>
                  <th className='p-6 font-black text-right'>Usage</th>
                </tr>
              </thead>
              <tbody>
                {data.occupancyData.map((branch: any) => (
                  <tr key={branch.uniqueKey} className='border-b border-slate-50 hover:bg-slate-50/50 transition-colors'>
                    <td className='p-6 font-bold text-slate-700'>
                      {branch.name}
                      <div className='flex gap-2 mt-2'>
                        <span className='px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-bold'>Home: {branch.homePatients}</span>
                        <span className='px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] rounded font-bold'>Travel: {branch.travelPatients}</span>
                      </div>
                    </td>
                    <td className='p-6 text-sm text-slate-600'>
                      <div className='flex flex-col gap-1.5'>
                        <div className='w-full bg-slate-100 h-1.5 rounded-full overflow-hidden'>
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${branch.occupancy > 85 ? 'bg-red-500' : 'bg-indigo-600'}`} 
                            style={{ width: `${branch.occupancy}%` }}
                          />
                        </div>
                        <span className='text-[10px] font-bold text-slate-400'>{branch.usedSlots} / {branch.totalSlots} Slots</span>
                      </div>
                    </td>
                    <td className='p-6 text-right font-black text-slate-900'>{branch.occupancy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className='space-y-8'>
            {/* Popular Session Times */}
            <section className='bg-white p-8 rounded-3xl border border-slate-200 shadow-sm'>
              <h2 className='text-xs font-black text-slate-400 mb-8 uppercase tracking-[0.2em]'>Popular Session Times</h2>
              <div className='flex items-end gap-6 h-40 border-b border-slate-100 pb-2'>
                <Bar 
                  height={((data?.sessionTimes?.morning || 0) / (data?.sessionTimes?.max || 1)) * 100} 
                  label="Morning" 
                  color="bg-sky-400" 
                  count={data?.sessionTimes?.morning || 0} 
                />
                <Bar 
                  height={((data?.sessionTimes?.afternoon || 0) / (data?.sessionTimes?.max || 1)) * 100} 
                  label="Afternoon" 
                  color="bg-blue-600" 
                  count={data?.sessionTimes?.afternoon || 0} 
                />
                <Bar 
                  height={((data?.sessionTimes?.evening || 0) / (data?.sessionTimes?.max || 1)) * 100} 
                  label="Evening" 
                  color="bg-indigo-800" 
                  count={data?.sessionTimes?.evening || 0} 
                />
              </div>
            </section>

            {/* Cross-Branch Visits & Weekly Load */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
              <div className='bg-emerald-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100 flex flex-col justify-center'>
                <p className='text-[10px] font-black uppercase tracking-widest opacity-80 mb-2'>Cross-Branch Visits</p>
                <div className='text-5xl font-black mb-1'>{data?.crossBranchVisits || 0}</div>
                <p className='text-xs font-bold opacity-90'>Active guest patients today</p>
              </div>

              <div className='bg-white p-6 rounded-3xl border border-slate-200'>
                <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4'>Weekly Patient Load</p>
                <div className='flex items-end gap-1 h-16'>
                  {/* Safely map over weeklyLoad or fallback to an empty array */}
                  {(data?.weeklyLoad || []).map((v: number, i: number) => (
                    <div 
                      key={i} 
                      className='flex-1 bg-slate-200 rounded-sm hover:bg-indigo-400 transition-colors relative group' 
                      style={{ height: `${(v / (data?.maxWeeklyLoad || 1)) * 100}%`, minHeight: '4px' }}
                    >
                      <span className='absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity'>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                <div className='flex justify-between text-[8px] font-bold text-slate-300 uppercase mt-2'>
                  <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon }: any) {
  return (
    <div className='bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm'>
      <div className='h-12 w-12 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center text-xl'>{icon}</div>
      <div>
        <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>{label}</p>
        <p className='text-2xl font-black text-slate-900'>{value}</p>
      </div>
    </div>
  );
}

function Bar({ height, label, color, count }: any) {
  return (
    <div className='flex-1 flex flex-col justify-end group h-full'>
      <span className='opacity-0 group-hover:opacity-100 text-[10px] font-bold text-slate-400 text-center mb-1 transition-opacity'>{count}</span>
      <div className={`${color} rounded-t-xl transition-all duration-700 w-full`} style={{ height: `${height}%`, minHeight: count > 0 ? '10%' : '2px' }}></div>
      <span className='text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center mt-3'>{label}</span>
    </div>
  );
}
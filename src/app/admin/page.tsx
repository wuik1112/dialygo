'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FiUsers, FiSettings, FiBarChart2, FiActivity } from 'react-icons/fi';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [branchesRes, bookingsRes, patientsRes, usersRes] = await Promise.all([
          supabase.from('branches').select('*').eq('status', 'Active'),
          supabase.from('bookings').select('booking_date, booking_session_time, branch_id, patient_id, booking_status'),
          supabase.from('patients').select('user_id, home_branch_id'),
          supabase.from('users').select('user_id, role_id, user_is_active')
        ]);

        if (branchesRes.error) throw branchesRes.error;
        
        const branches = branchesRes.data || [];
        const bookings = bookingsRes.data || [];
        const patients = patientsRes.data || [];
        const users = usersRes.data || [];

        const totalActivePatients = users.filter(u => u.role_id === 5 && u.user_is_active).length;

        let totalNetworkMachines = 0;
        let totalAvailableSlots = 0;
        
        const occupancyData = branches.map(b => {
          totalNetworkMachines += b.total_machines || 0;
          totalAvailableSlots += b.available_slots || 0;
          
          const usedSlots = (b.total_machines || 0) - (b.available_slots || 0);
          const occupancy = b.total_machines ? Math.round((usedSlots / b.total_machines) * 100) : 0;
          
          return { name: b.branch_name, occupancy, usedSlots, total: b.total_machines };
        });

        const networkUtilization = totalNetworkMachines ? Math.round(((totalNetworkMachines - totalAvailableSlots) / totalNetworkMachines) * 100) : 0;

        let morning = 0, afternoon = 0, evening = 0;
        bookings.forEach(b => {
          const shift = b.booking_session_time?.toLowerCase();
          if (shift === 'morning') morning++;
          else if (shift === 'afternoon') afternoon++;
          else if (shift === 'evening') evening++;
        });
        
        const totalSessions = morning + afternoon + evening;
        const maxSessionLoad = Math.max(morning, afternoon, evening, 1);

        const crossBranchVisits = bookings.filter(b => {
          const patientProfile = patients.find(p => p.user_id === b.patient_id);
          return patientProfile && b.branch_id !== patientProfile.home_branch_id;
        }).length;

        const weeklyLoad = [0, 0, 0, 0, 0, 0, 0];
        bookings.forEach(b => {
          if (b.booking_date) {
            const date = new Date(b.booking_date);
            const day = date.getDay();
            const index = day === 0 ? 6 : day - 1;
            weeklyLoad[index]++;
          }
        });
        const maxWeeklyLoad = Math.max(...weeklyLoad, 1);

        setData({
          totalActivePatients,
          networkUtilization,
          totalNetworkMachines,
          branches: occupancyData,
          sessionTimes: { morning, afternoon, evening, total: totalSessions, max: maxSessionLoad },
          crossBranchVisits,
          weeklyLoad,
          maxWeeklyLoad,
          isEmpty: branches.length === 0
        });
        
        setIsError(false);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
        setIsError(true);
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
          <span>Loading Network Telemetry...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <main className='p-8 bg-slate-50 min-h-screen font-sans'>
        <div className='max-w-6xl mx-auto'>
          <div className='p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-center'>
            <h2 className='text-lg font-bold mb-2'>Connection Error</h2>
            <p>Unable to retrieve real-time network data from the database. Please check your connection and try again.</p>
          </div>
        </div>
      </main>
    );
  }

  if (data?.isEmpty) {
    return (
      <main className='p-8 bg-slate-50 min-h-screen font-sans'>
        <div className='max-w-6xl mx-auto text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm'>
          <h1 className='text-2xl font-bold text-slate-800 mb-2'>Network Dashboard</h1>
          <p className='text-slate-500'>No active branches found. Please register branches in the network to view telemetry.</p>
        </div>
      </main>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans'>
      <div className='max-w-6xl mx-auto'>
        
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Network Dashboard</h1>
          <p className='text-slate-500 mt-1 font-medium'>Real-time aggregated data and operational health</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-6'>
          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5'>
            <div className='h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl'><FiUsers /></div>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest'>Total Patients</p>
              <p className='text-3xl font-black text-slate-800'>{data.totalActivePatients}</p>
            </div>
          </div>
          
          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5'>
            <div className='h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl'><FiSettings /></div>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest'>Network Machines</p>
              <p className='text-3xl font-black text-slate-800'>{data.totalNetworkMachines}</p>
            </div>
          </div>

          <div className='bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5'>
            <div className='h-14 w-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl'><FiBarChart2 /></div>
            <div>
              <p className='text-[11px] font-bold text-slate-400 uppercase tracking-widest'>System Utilization</p>
              <p className='text-3xl font-black text-slate-800'>{data.networkUtilization}%</p>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-8'>
          <div className='bg-white p-8 rounded-2xl border border-slate-200 shadow-sm'>
            <h2 className='text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider'>Live Branch Occupancy</h2>
            <div className='space-y-5'>
              {data.branches.map((branch: any) => (
                <div key={branch.name}>
                  <div className='flex justify-between text-sm mb-2'>
                    <span className='font-semibold text-slate-700'>{branch.name}</span>
                    <span className='font-bold text-blue-600'>{branch.occupancy}% <span className='text-slate-400 font-medium text-xs'>({branch.usedSlots}/{branch.total})</span></span>
                  </div>
                  <div className='w-full bg-slate-100 rounded-full h-2.5'>
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-1000 ${branch.occupancy > 85 ? 'bg-red-500' : branch.occupancy > 60 ? 'bg-amber-400' : 'bg-blue-500'}`} 
                      style={{ width: `${branch.occupancy}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className='bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col'>
            <h2 className='text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider'>Popular Session Times</h2>
            <div className='flex items-end gap-4 h-32 mt-auto border-b border-slate-100 pb-2'>
              
              <div className='flex-1 flex flex-col justify-end group relative h-full'>
                {data.sessionTimes.morning > 0 && <span className='text-[10px] font-bold text-slate-400 text-center mb-1'>{data.sessionTimes.morning}</span>}
                <div 
                  className='bg-sky-400 rounded-t-md hover:bg-sky-500 transition-all duration-700 w-full mt-auto' 
                  style={{ height: `${(data.sessionTimes.morning / data.sessionTimes.max) * 100}%`, minHeight: data.sessionTimes.morning > 0 ? '10%' : '0%' }}
                ></div>
              </div>

              <div className='flex-1 flex flex-col justify-end group relative h-full'>
                {data.sessionTimes.afternoon > 0 && <span className='text-[10px] font-bold text-slate-400 text-center mb-1'>{data.sessionTimes.afternoon}</span>}
                <div 
                  className='bg-blue-600 rounded-t-md hover:bg-blue-700 transition-all duration-700 w-full mt-auto' 
                  style={{ height: `${(data.sessionTimes.afternoon / data.sessionTimes.max) * 100}%`, minHeight: data.sessionTimes.afternoon > 0 ? '10%' : '0%' }}
                ></div>
              </div>

              <div className='flex-1 flex flex-col justify-end group relative h-full'>
                {data.sessionTimes.evening > 0 && <span className='text-[10px] font-bold text-slate-400 text-center mb-1'>{data.sessionTimes.evening}</span>}
                <div 
                  className='bg-indigo-800 rounded-t-md hover:bg-indigo-900 transition-all duration-700 w-full mt-auto' 
                  style={{ height: `${(data.sessionTimes.evening / data.sessionTimes.max) * 100}%`, minHeight: data.sessionTimes.evening > 0 ? '10%' : '0%' }}
                ></div>
              </div>

            </div>
            
            <div className='flex gap-4 mt-3'>
              <span className='flex-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Morning</span>
              <span className='flex-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Afternoon</span>
              <span className='flex-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Evening</span>
            </div>
          </div>

          <div className='bg-white p-8 rounded-2xl border border-slate-200 shadow-sm'>
            <h2 className='text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider'>Cross-Branch Mobility</h2>
            <p className='text-xs text-slate-500 mb-6'>Patients currently booked outside their home branch.</p>
            <div className='flex items-center justify-center h-32 bg-emerald-50 rounded-xl border border-emerald-100'>
              <div className='text-center'>
                <div className='text-5xl font-black text-emerald-600'>{data.crossBranchVisits}</div>
                <div className='text-sm font-bold text-emerald-800 mt-2 uppercase tracking-widest'>Active Guest Bookings</div>
              </div>
            </div>
          </div>

          <div className='bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col'>
            <h2 className='text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider'>Weekly System Load</h2>
            <div className='flex items-end gap-2 h-32 mt-auto border-b border-slate-100 pb-2'>
              {data.weeklyLoad.map((count: number, index: number) => (
                <div key={index} className='flex-1 flex flex-col justify-end group relative h-full'>
                  {count > 0 && <span className='text-[10px] font-bold text-slate-400 text-center mb-1'>{count}</span>}
                  <div 
                    className='bg-indigo-500 rounded-t-md hover:bg-indigo-600 transition-all duration-700 w-full mt-auto' 
                    style={{ height: `${(count / data.maxWeeklyLoad) * 100}%`, minHeight: count > 0 ? '10%' : '0%' }}
                  ></div>
                </div>
              ))}
            </div>
            <div className='flex justify-between text-[10px] font-bold text-slate-400 uppercase mt-3 px-1'>
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
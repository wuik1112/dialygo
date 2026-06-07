'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FiUsers, FiSettings, FiBarChart2, FiActivity, FiAlertCircle, FiCalendar, FiFilter } from 'react-icons/fi';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  // NEW: The dashboard now only cares about absolute Start and End dates
  const [activeDateRange, setActiveDateRange] = useState({
    start: new Date().toLocaleDateString('en-CA'),
    end: new Date().toLocaleDateString('en-CA'),
    label: 'Today'
  });

  useEffect(() => {
    setIsLoading(true);
    async function fetchDashboardData() {
      try {
        const today = new Date();
        const todayStr = today.toLocaleDateString('en-CA'); 
        
        const startStr = activeDateRange.start;
        const endStr = activeDateRange.end;

        // Calculate exact days in period for Capacity Math
        const startDateObj = new Date(startStr);
        const endDateObj = new Date(endStr);
        const daysInPeriod = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const [branchesRes, machinesRes, bookingsRes, patientsRes] = await Promise.all([
          supabase.from('branches').select('id, branch_name').eq('status', 'Active'),
          supabase.from('machines').select('branch_id').neq('status', 'Retired'),
          supabase.from('bookings').select('branch_id, patient_id, booking_status, booking_date, booking_session_time')
            .in('booking_status', ['Confirmed', 'Scheduled', 'In Progress', 'Completed', 'Rescheduled'])
            .gte('booking_date', startStr)
            .lte('booking_date', endStr),
          supabase.from('patients').select('patient_id, home_branch_id')
        ]);

        if (branchesRes.error || bookingsRes.error || patientsRes.error) throw new Error('Data fetch failed');

        const branches = branchesRes.data || [];
        const machines = machinesRes.data || [];
        const bookings = bookingsRes.data || [];
        const patients = patientsRes.data || [];

        let totalActiveTravelers = 0;
        
        const occupancyData = branches.map((branch) => {
          const actualMachinesCount = machines.filter(m => m.branch_id === branch.id).length;
          const totalPeriodCapacity = actualMachinesCount * 3 * daysInPeriod; 
          
          const homePatientsList = patients.filter(p => p.home_branch_id === branch.id);
          const periodBookings = bookings.filter(b => b.branch_id === branch.id);
          const totalUsedSlots = periodBookings.length;

          const travelPatientsThisPeriod = periodBookings.filter(b => !homePatientsList.some(hp => hp.patient_id === b.patient_id)).length;
          const homePatientsThisPeriod = totalUsedSlots - travelPatientsThisPeriod;

          totalActiveTravelers += travelPatientsThisPeriod;

          const occupancy = totalPeriodCapacity > 0 
            ? Math.round((totalUsedSlots / totalPeriodCapacity) * 100) 
            : 0;

          return {
            uniqueKey: branch.id || branch.branch_name, 
            name: branch.branch_name,
            occupancy: occupancy > 100 ? 100 : occupancy, 
            homePatients: homePatientsThisPeriod,
            travelPatients: travelPatientsThisPeriod,
            totalSlots: totalPeriodCapacity,
            usedSlots: totalUsedSlots
          };
        });

        let morning = 0, afternoon = 0, evening = 0;
        bookings.forEach(b => {
          const shift = b.booking_session_time?.toLowerCase();
          if (shift?.includes('morning')) morning++;
          else if (shift?.includes('afternoon')) afternoon++;
          else if (shift?.includes('evening')) evening++;
        });
        const maxSessionLoad = Math.max(morning, afternoon, evening, 1);

        const weeklyLoad = [0, 0, 0, 0, 0, 0, 0];
        bookings.forEach(b => {
          if (b.booking_date) {
            const date = new Date(`${b.booking_date}T00:00:00`);
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
          totalMachines: machines.length,
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
  }, [activeDateRange]); // Trigger fetch whenever the exact dates change

  if (isLoading && !data) {
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

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans'>
      <div className='max-w-6xl mx-auto'>
        
        <header className='mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-6'>
          <div>
            <h1 className='text-3xl font-black text-slate-900'>Network Dashboard</h1>
            <p className='text-slate-500 font-medium mt-1 flex items-center gap-2'>
              <FiCalendar className="text-blue-500" /> Viewing: <strong className="text-slate-800">{activeDateRange.label}</strong>
              {isLoading && <FiActivity className="animate-spin text-blue-500 ml-2" />}
            </p>
          </div>
          
          {/* NEW: Advanced Outlook-Style Time Filter */}
          <AdvancedTimeFilter 
            currentRange={activeDateRange} 
            onChange={(newRange: any) => setActiveDateRange(newRange)} 
          />
        </header>

        {data?.isEmpty ? (
          <div className='text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm'>
            <FiBarChart2 className='text-slate-300 text-6xl mx-auto mb-4' />
            <p className='text-slate-500 font-medium'>No operational data available for the selected period.</p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-10'>
              <StatCard label="Network Load" value={`${data.networkUtilization}%`} icon={<FiBarChart2 />} />
              <StatCard label="Total Machines" value={data.totalMachines} icon={<FiSettings />} />
              <StatCard label="Registered Patients" value={data.totalPatients} icon={<FiUsers />} />
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
              <section className='bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden'>
                <div className='p-6 border-b border-slate-100 bg-slate-50/50'>
                  <h2 className='font-bold text-slate-800'>Live Branch Occupancy</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className='w-full text-left border-collapse min-w-[500px]'>
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
                </div>
              </section>

              <div className='space-y-8'>
                <section className='bg-white p-8 rounded-3xl border border-slate-200 shadow-sm'>
                  <h2 className='text-xs font-black text-slate-400 mb-8 uppercase tracking-[0.2em]'>Popular Session Times</h2>
                  <div className='flex items-end gap-6 h-40 border-b border-slate-100 pb-2'>
                    <Bar height={((data?.sessionTimes?.morning || 0) / (data?.sessionTimes?.max || 1)) * 100} label="Morning" color="bg-sky-400" count={data?.sessionTimes?.morning || 0} />
                    <Bar height={((data?.sessionTimes?.afternoon || 0) / (data?.sessionTimes?.max || 1)) * 100} label="Afternoon" color="bg-blue-600" count={data?.sessionTimes?.afternoon || 0} />
                    <Bar height={((data?.sessionTimes?.evening || 0) / (data?.sessionTimes?.max || 1)) * 100} label="Evening" color="bg-indigo-800" count={data?.sessionTimes?.evening || 0} />
                  </div>
                </section>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
                  <div className='bg-emerald-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100 flex flex-col justify-center'>
                    <p className='text-[10px] font-black uppercase tracking-widest opacity-80 mb-2'>Cross-Branch Visits</p>
                    <div className='text-5xl font-black mb-1'>{data?.crossBranchVisits || 0}</div>
                    <p className='text-xs font-bold opacity-90'>Active guest patients in period</p>
                  </div>

                  <div className='bg-white p-6 rounded-3xl border border-slate-200'>
                    <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4'>Day of Week Distribution</p>
                    <div className='flex items-end gap-1 h-16'>
                      {(data?.weeklyLoad || []).map((v: number, i: number) => (
                        <div key={i} className='flex-1 bg-slate-200 rounded-sm hover:bg-indigo-400 transition-colors relative group' style={{ height: `${(v / (data?.maxWeeklyLoad || 1)) * 100}%`, minHeight: '4px' }}>
                          <span className='absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity'>{v}</span>
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
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------
// NEW COMPONENTS
// ---------------------------------------------------------

function AdvancedTimeFilter({ currentRange, onChange }: any) {
  // NEW: Added 'year' to the filter modes
  const [filterMode, setFilterMode] = useState<'preset' | 'month' | 'year' | 'custom'>('preset');
  
  // States for Monthly/Yearly View
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // States for Custom View
  const [customStart, setCustomStart] = useState(new Date().toLocaleDateString('en-CA'));
  const [customEnd, setCustomEnd] = useState(new Date().toLocaleDateString('en-CA'));

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentYear = new Date().getFullYear();
  const years = Array.from({length: 5}, (_, i) => currentYear - 2 + i); // e.g. 2024 to 2028

  const applyPreset = (preset: string) => {
    const today = new Date();
    let start = new Date(today);
    let end = new Date(today);
    let label = preset;

    if (preset === 'Today') {
      // already set
    } else if (preset === 'Tomorrow') {
      start.setDate(today.getDate() + 1);
      end.setDate(today.getDate() + 1);
    } else if (preset === 'This Week') {
      const dayOfWeek = today.getDay();
      const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      start.setDate(diffToMonday);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (preset === 'All Time') {
      start = new Date('2000-01-01');
      end = new Date('2100-01-01');
    }

    onChange({
      start: start.toLocaleDateString('en-CA'),
      end: end.toLocaleDateString('en-CA'),
      label
    });
  };

  const applyMonthFilter = (m: number, y: number) => {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0); // Last day of the month
    onChange({
      start: start.toLocaleDateString('en-CA'),
      end: end.toLocaleDateString('en-CA'),
      label: `${months[m]} ${y}`
    });
  };

  // NEW: Function to filter by entire year (Jan 1 to Dec 31)
  const applyYearFilter = (y: number) => {
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    onChange({
      start: start.toLocaleDateString('en-CA'),
      end: end.toLocaleDateString('en-CA'),
      label: `Year ${y}`
    });
  };

  const applyCustomFilter = () => {
    if (customStart && customEnd) {
      if (new Date(customStart) > new Date(customEnd)) {
        alert("Start date cannot be after end date");
        return;
      }
      onChange({
        start: customStart,
        end: customEnd,
        label: `${customStart} to ${customEnd}`
      });
    }
  };

  // Helper to handle switching modes and auto-applying
  const handleModeSwitch = (mode: any) => {
    setFilterMode(mode);
    if (mode === 'year') applyYearFilter(selectedYear);
    if (mode === 'month') applyMonthFilter(selectedMonth, selectedYear);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-2 flex flex-wrap md:flex-nowrap items-center gap-3">
      
      {/* 1. Mode Selector */}
      <div className="flex items-center gap-2 border-r border-slate-100 pr-3">
        <FiFilter className="text-slate-400 ml-2" />
        <select 
          className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
          value={filterMode}
          onChange={(e) => handleModeSwitch(e.target.value)}
        >
          <option value="preset">Quick Select</option>
          <option value="month">By Month</option>
          <option value="year">By Year</option> {/* NEW OPTION */}
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {/* 2. Dynamic Inputs based on Mode */}
      <div className="flex items-center gap-2">
        {filterMode === 'preset' && (
          <div className="flex gap-1">
            {['Today', 'Tomorrow', 'This Week', 'All Time'].map(preset => (
              <button 
                key={preset}
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentRange.label === preset ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        )}

        {filterMode === 'month' && (
          <div className="flex gap-2">
            <select 
              value={selectedMonth} 
              onChange={(e) => {
                const m = parseInt(e.target.value);
                setSelectedMonth(m);
                applyMonthFilter(m, selectedYear);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
            >
              {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select 
              value={selectedYear} 
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setSelectedYear(y);
                applyMonthFilter(selectedMonth, y);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {/* NEW: Yearly Selection UI */}
        {filterMode === 'year' && (
          <div className="flex gap-2">
            <select 
              value={selectedYear} 
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setSelectedYear(y);
                applyYearFilter(y);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {filterMode === 'custom' && (
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            />
            <span className="text-slate-400 text-xs font-bold">to</span>
            <input 
              type="date" 
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            />
            <button 
              onClick={applyCustomFilter}
              className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// Helper UI Components
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
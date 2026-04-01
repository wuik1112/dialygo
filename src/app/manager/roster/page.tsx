'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { FiActivity, FiCheckCircle, FiXCircle } from 'react-icons/fi';

const getLocalISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

const parseDateLocal = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getLocalDisplayDay = (dateStr: string) => {
  if (!dateStr) return '';
  return parseDateLocal(dateStr).toLocaleDateString('en-MY', { weekday: 'long' });
};

const PATIENTS_PER_NURSE = 4;

export default function ManagerWeeklyRoster() {
  const [isLoading, setIsLoading] = useState(true);
  const [branchData, setBranchData] = useState<any>(null);
  const [nurses, setNurses] = useState<any[]>([]);
  
  const [weeklyRoster, setWeeklyRoster] = useState<any[]>([]);
  const [monthlyRoster, setMonthlyRoster] = useState<any[]>([]);
  
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    nurse_id: '',
    shift_type: 'WORK', 
    startDate: '',
    endDate: '',
    start_time: '08:00',
    end_time: '17:00',
    shift_role: 'Floor Nurse',
    zone_assignment: '',
    break_minutes: '60',
    repeatWeeks: '0' 
  });
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Authentication failed.");
      
      const { data: managerProfile } = await supabase
        .from('users')
        .select('branch_id')
        .eq('user_email', sessionData.session.user.email)
        .single();
        
      if (!managerProfile?.branch_id) throw new Error("No branch assigned.");
      const branchId = managerProfile.branch_id;

      const [branchRes, nursesRes] = await Promise.all([
        supabase.from('branches').select('*').eq('id', branchId).single(),
        // This strictly pulls ONLY nurses currently assigned to your branch
        supabase.from('users').select('user_id, user_fullname, staff(max_weekly_hours)').eq('branch_id', branchId).eq('role_id', 4)
      ]);

      setBranchData(branchRes.data);
      setNurses(nursesRes.data || []);

      const weekStartStr = getLocalISODate(weekDays[0]);
      const weekEndStr = getLocalISODate(weekDays[6]);
      
      // RESTORED: Strictly fetch shifts assigned to THIS branch
      const { data: weekData } = await supabase
        .from('staff_roster')
        .select('*')
        .eq('branch_id', branchId) 
        .gte('shift_date', weekStartStr)
        .lte('shift_date', weekEndStr);
      setWeeklyRoster(weekData || []);

      const monthStartStr = getLocalISODate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
      const monthEndStr = getLocalISODate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0));
      
      // RESTORED: Strictly fetch shifts assigned to THIS branch
      const { data: monthData } = await supabase
        .from('staff_roster')
        .select('shift_date, shift_type')
        .eq('branch_id', branchId) 
        .gte('shift_date', monthStartStr)
        .lte('shift_date', monthEndStr)
        .eq('shift_type', 'WORK'); 
      setMonthlyRoster(monthData || []);

    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentWeekStart, currentMonth]);

  const handleEmptyCellClick = (nurseId: number, dateStr: string) => {
    // Check if the clicked date is a Sunday
    const isSunday = parseDateLocal(dateStr).getDay() === 0;

    setFormData({ 
      nurse_id: nurseId.toString(), 
      // Automatically default to OFF_DAY if it's Sunday
      shift_type: isSunday ? 'OFF_DAY' : 'WORK', 
      startDate: dateStr, 
      endDate: dateStr,
      start_time: '08:00', 
      end_time: '17:00', 
      shift_role: 'Floor Nurse',
      zone_assignment: '',
      break_minutes: '60',
      repeatWeeks: '0' 
    });
    setModalMode('add');
    setMessage({ type: '', text: '' });
    setIsModalOpen(true);
  };

  const handleShiftBlockClick = (shift: any) => {
    setFormData({ 
      nurse_id: shift.nurse_id.toString(), 
      shift_type: shift.shift_type,
      startDate: shift.shift_date,
      endDate: shift.shift_date,
      start_time: shift.start_time ? shift.start_time.slice(0, 5) : '08:00', 
      end_time: shift.end_time ? shift.end_time.slice(0, 5) : '17:00', 
      shift_role: shift.shift_role || 'Floor Nurse',
      zone_assignment: shift.zone_assignment || '',
      break_minutes: shift.break_minutes?.toString() || '60',
      repeatWeeks: '0' 
    });
    setEditingShiftId(shift.id);
    setModalMode('edit');
    setMessage({ type: '', text: '' });
    setIsModalOpen(true);
  };

  const handleDeleteShift = async () => {
    if (!editingShiftId || !window.confirm("Are you sure you want to remove this record?")) return;
    try {
      await supabase.from('staff_roster').delete().eq('id', editingShiftId);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert("Failed to delete: " + err.message);
    }
  };

  const timeToMins = (timeStr: string | null) => {
    if (!timeStr) return 0;
    const cleanStr = timeStr.trim().substring(0, 5); 
    const [h, m] = cleanStr.split(':').map(Number);
    return h * 60 + m;
  };

  const getDatesInRange = (startStr: string, endStr: string) => {
    const dates = [];
    let currentDate = parseDateLocal(startStr);
    const stopDate = parseDateLocal(endStr);
    
    while (currentDate <= stopDate) {
      dates.push(getLocalISODate(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return; 
    
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const nurseId = parseInt(formData.nurse_id);
      const isWork = formData.shift_type === 'WORK';
      const finalEndDate = isWork ? formData.startDate : formData.endDate;

      if (finalEndDate < formData.startDate) {
        throw new Error("End Date cannot be before Start Date.");
      }

      let newStart = 0, newEnd = 0;
      if (isWork) {
        newStart = timeToMins(formData.start_time);
        newEnd = timeToMins(formData.end_time);
        if (newStart >= newEnd) throw new Error("Shift start time must be before end time.");
        
        if (branchData.branch_operating_hours) {
          const timeParts = branchData.branch_operating_hours.split(': ');
          if (timeParts.length >= 2) {
             const [branchStartStr, branchEndStr] = timeParts[1].split(' - ');
             if (branchStartStr && branchEndStr) {
               if (newStart < timeToMins(branchStartStr) || newEnd > timeToMins(branchEndStr)) {
                 throw new Error(`Selected time is outside branch operating hours (${timeParts[1]}).`);
               }
             }
          }
        }
      }

      let datesToProcess = getDatesInRange(formData.startDate, finalEndDate);
      const repeatCount = parseInt(formData.repeatWeeks);

      if (isWork && repeatCount > 0) {
        datesToProcess = [];
        const [y, m, d] = formData.startDate.split('-').map(Number);
        for (let i = 0; i <= repeatCount; i++) {
          const dObj = new Date(y, m - 1, d);
          dObj.setDate(dObj.getDate() + (i * 7));
          datesToProcess.push(getLocalISODate(dObj));
        }
      }

      const lastDateStr = datesToProcess[datesToProcess.length - 1];
      const { data: futureShifts } = await supabase
        .from('staff_roster')
        .select('*')
        .eq('nurse_id', nurseId)
        .gte('shift_date', datesToProcess[0])
        .lte('shift_date', lastDateStr);

      const existingShifts = futureShifts || [];
      const ghostShiftIds: number[] = [];

      for (const targetDate of datesToProcess) {
        const dayShifts = existingShifts.filter(s => s.shift_date === targetDate && s.id !== editingShiftId);
        
        for (let shift of dayShifts) {
          
          // --- GHOST SHIFT CLEANUP ---
          // If the shift belongs to another branch, it's leftover data from before the nurse was transferred.
          if (Number(shift.branch_id) !== Number(branchData.id)) {
            ghostShiftIds.push(shift.id); // Tag it for deletion
            continue; // Skip the conflict check so you can schedule them
          }

          if (!isWork || shift.shift_type !== 'WORK') {
             throw new Error(`Conflict on ${targetDate}: Nurse already has an assignment/leave.`);
          }
          const existStart = timeToMins(shift.start_time);
          const existEnd = timeToMins(shift.end_time);
          if (newStart < existEnd && newEnd > existStart) {
            throw new Error(`Conflict on ${targetDate}: Overlapping with shift (${shift.start_time?.slice(0,5)} - ${shift.end_time?.slice(0,5)}).`);
          }
        }
      }

      // Delete the leftover shifts from the previous branch before saving yours
      if (ghostShiftIds.length > 0) {
         await supabase.from('staff_roster').delete().in('id', ghostShiftIds);
      }

      const payload = datesToProcess.map(dateStr => ({
        branch_id: branchData.id,
        nurse_id: nurseId,
        shift_date: dateStr,
        shift_type: formData.shift_type,
        start_time: isWork ? formData.start_time : null,
        end_time: isWork ? formData.end_time : null,
        shift_role: isWork ? formData.shift_role : null,
        zone_assignment: isWork ? formData.zone_assignment : null,
        break_minutes: isWork ? parseInt(formData.break_minutes || '0') : 0
      }));

      if (modalMode === 'add') {
        const { error } = await supabase.from('staff_roster').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('staff_roster').update({
          shift_type: formData.shift_type,
          start_time: isWork ? formData.start_time : null,
          end_time: isWork ? formData.end_time : null,
          shift_role: isWork ? formData.shift_role : null,
          zone_assignment: isWork ? formData.zone_assignment : null,
          break_minutes: isWork ? parseInt(formData.break_minutes || '0') : 0,
          branch_id: branchData.id 
        }).eq('id', editingShiftId);
        if (error) throw error;
      }

      const actionType = modalMode === 'add' ? 'Assigned to' : 'Updated';
      const notifMsg = isWork 
        ? `You have been ${actionType} a ${formData.shift_role} shift on ${formData.startDate} (${formData.start_time} - ${formData.end_time}).`
        : `Your ${formData.shift_type.replace('_', ' ')} from ${formData.startDate} to ${formData.endDate} has been ${modalMode === 'add' ? 'approved' : 'updated'}.`;

      await supabase.from('notifications').insert({
        user_id: nurseId,
        title: 'Schedule Update',
        message: notifMsg
      });

      setMessage({ type: 'success', text: `Schedule successfully ${modalMode === 'add' ? 'saved' : 'updated'}. Nurse notified.` });
      fetchData();
      setTimeout(() => setIsModalOpen(false), 1000);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const prevWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); };
  const nextWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); };
  const prevMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d); };
  const nextMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d); };

  const getMonthDays = () => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const days: { date: Date, isCurrentMonth: boolean }[] = [];
    
    let startDay = start.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1; 
    for (let i = startDay; i > 0; i--) {
      const prevDate = new Date(start); 
      prevDate.setDate(prevDate.getDate() - i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }
    
    for (let i = 1; i <= end.getDate(); i++) {
      days.push({ date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i), isCurrentMonth: true });
    }
    
    while (days.length % 7 !== 0) {
      const lastDate: Date = days[days.length - 1].date;
      const nextDate: Date = new Date(lastDate); 
      nextDate.setDate(nextDate.getDate() + 1);
      days.push({ date: nextDate, isCurrentMonth: false });
    }
    return days;
  };

  const handleMonthDayClick = (date: Date) => {
    setCurrentWeekStart(getMonday(date));
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };
if (isLoading && !branchData) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'><FiActivity className='text-4xl mb-4 animate-spin' /><span>Loading Duty Roster...</span></div>
      </div>
    );
  }
  const getShiftStyles = (type: string, isForeignBranch: boolean = false) => {
    if (isForeignBranch) return 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300';
    switch(type) {
      case 'ANNUAL_LEAVE': return 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300';
      case 'MEDICAL_LEAVE': return 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300';
      case 'OFF_DAY': return 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:border-slate-400';
      default: return 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300'; 
    }
  };

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-7xl mx-auto'>

        <div className='flex flex-col md:flex-row justify-between items-end mb-8 gap-4'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Staff Schedule</h1>
            <p className='text-slate-500 mt-1 font-medium'>Manage clinical assignments and patient capacity safely.</p>
          </div>
        </div>

        {/* MONTHLY WIDGET */}
        <div className='bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8'>
          <div className='px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center'>
            <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Monthly Coverage Heatmap</h2>
            <div className='flex items-center gap-4'>
              <button onClick={prevMonth} className='text-slate-500 hover:text-slate-800 font-bold'>&larr;</button>
              <span className='font-bold text-slate-800 w-32 text-center'>{currentMonth.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}</span>
              <button onClick={nextMonth} className='text-slate-500 hover:text-slate-800 font-bold'>&rarr;</button>
            </div>
          </div>
          <div className='p-6'>
            <div className='grid grid-cols-7 gap-2'>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className='text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2'>{day}</div>
              ))}
              {getMonthDays().map((dayObj, i) => {
                const dateStr = getLocalISODate(dayObj.date);
                const shiftsToday = monthlyRoster.filter(s => s.shift_date === dateStr).length;
                const weekStartStr = getLocalISODate(weekDays[0]);
                const weekEndStr = getLocalISODate(weekDays[6]);
                const isSelectedWeek = dateStr >= weekStartStr && dateStr <= weekEndStr;
                
                return (
                  <div key={i} onClick={() => handleMonthDayClick(dayObj.date)} className={`h-12 border rounded-lg p-1 flex flex-col items-center justify-between cursor-pointer transition-all hover:border-blue-400 hover:shadow-sm ${!dayObj.isCurrentMonth ? 'opacity-40 bg-slate-50' : 'bg-white'} ${isSelectedWeek ? 'ring-2 ring-blue-200 border-blue-400 bg-blue-50/20' : 'border-slate-100'} ${dateStr === getLocalISODate(new Date()) ? 'font-black text-blue-600' : 'text-slate-700'}`}>
                    <span className='text-xs'>{dayObj.date.getDate()}</span>
                    {shiftsToday > 0 && <span className='w-full text-[9px] font-bold bg-indigo-50 text-indigo-600 rounded text-center'>{shiftsToday} on duty</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* WEEKLY WIDGET */}
        <div className='flex justify-between items-end mb-4'>
          <h2 className='text-lg font-bold text-slate-800 tracking-tight'>Detailed Weekly View</h2>
          <div className='flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm'>
            <button onClick={prevWeek} className='px-4 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors'>&larr;</button>
            <div className='px-6 py-1.5 font-bold text-slate-800 text-sm min-w-[200px] text-center'>
              {weekDays[0].toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <button onClick={nextWeek} className='px-4 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors'>&rarr;</button>
          </div>
        </div>

        <div className='bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto'>
          <table className='w-full text-left border-collapse min-w-[1000px]'>
            <thead>
              <tr className='bg-slate-50 border-b border-slate-200'>
                <th className='p-4 font-bold text-slate-800 uppercase tracking-wider text-xs w-48 sticky left-0 bg-slate-50 z-10 border-r border-slate-200'>
                  Clinical Staff ({nurses.length})
                </th>
                {weekDays.map((date, i) => {
                  const dateStr = getLocalISODate(date);
                  // Safety capacity only counts shifts mapped to this specific branch
                  const workingNursesToday = weeklyRoster.filter(s => s.shift_date === dateStr && s.shift_type === 'WORK' && s.branch_id === branchData?.id).length;
                  const safeCapacity = workingNursesToday * PATIENTS_PER_NURSE;

                  return (
                    <th key={i} className={`p-3 text-center border-r border-slate-100 last:border-0 ${dateStr === getLocalISODate(new Date()) ? 'bg-blue-50/50' : ''}`}>
                      <div className='text-xs font-bold text-slate-400 uppercase tracking-widest mb-1'>{date.toLocaleDateString('en-MY', { weekday: 'short' })}</div>
                      <div className={`text-sm mb-2 ${dateStr === getLocalISODate(new Date()) ? 'text-blue-600 font-black' : 'font-bold text-slate-800'}`}>
                        {date.getDate()} {date.toLocaleDateString('en-MY', { month: 'short' })}
                      </div>
                      <div className={`text-[9px] font-bold uppercase tracking-widest py-1 px-2 rounded-full inline-block ${safeCapacity > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        Safe Cap: {safeCapacity} pts
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {nurses.map(nurse => {
                const nurseShifts = weeklyRoster.filter(s => s.nurse_id === nurse.user_id);
                let totalHours = 0;
                
                nurseShifts.forEach(s => {
                  if (s.shift_type === 'WORK' && s.start_time && s.end_time) {
                    const grossHours = (timeToMins(s.end_time) - timeToMins(s.start_time)) / 60;
                    const breakHours = (s.break_minutes || 0) / 60;
                    totalHours += (grossHours - breakHours);
                  }
                });
                
                const staffRecord = Array.isArray(nurse.staff) ? nurse.staff[0] : nurse.staff;
                const maxHours = staffRecord?.max_weekly_hours || 48;
                const isNearingLimit = totalHours >= maxHours - 4;

                return (
                  <tr key={nurse.user_id} className='group hover:bg-slate-50/50 transition-colors'>
                    <td className='p-4 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 border-r border-slate-200 align-top'>
                      <p className='font-bold text-slate-800 text-sm'>{nurse.user_fullname}</p>
                      <div className='mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest'>
                        <span className='text-slate-400'>Net Hours</span>
                        <span className={isNearingLimit ? 'text-amber-500' : 'text-emerald-500'}>{totalHours.toFixed(1)} / {maxHours}</span>
                      </div>
                      <div className='w-full bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden'>
                        <div className={`h-full rounded-full ${isNearingLimit ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min((totalHours / maxHours) * 100, 100)}%` }}></div>
                      </div>
                    </td>
                    {weekDays.map((date, i) => {
                      const dateStr = getLocalISODate(date);
                      const shift = nurseShifts.find(s => s.shift_date === dateStr);
                      const isForeignBranch = shift && shift.branch_id !== branchData?.id;
                      
                      return (
                        <td key={i} className='p-2 border-r border-slate-100 last:border-0 align-top h-28 min-w-[120px] relative group/cell'>
                          {shift ? (
                            <div onClick={() => handleShiftBlockClick(shift)} className={`h-full w-full border rounded-lg p-2 cursor-pointer transition-colors flex flex-col justify-center items-center text-center group-hover/cell:shadow-sm ${getShiftStyles(shift.shift_type, isForeignBranch)}`}>
                              <span className='text-xs font-black'>
                                {shift.shift_type === 'WORK' ? `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}` : shift.shift_type.replace('_', ' ')}
                              </span>
                              {shift.shift_type === 'WORK' && (
                                <span className='text-[9px] font-medium opacity-80 mt-1 line-clamp-1'>
                                  {isForeignBranch ? 'Other Branch' : shift.shift_role}
                                </span>
                              )}
                              <span className='text-[10px] font-bold uppercase tracking-widest mt-1 opacity-0 group-hover/cell:opacity-100 transition-opacity'>Edit</span>
                            </div>
                          ) : (
                            <div onClick={() => handleEmptyCellClick(nurse.user_id, dateStr)} className='h-full w-full rounded-lg border-2 border-dashed border-transparent hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-colors flex items-center justify-center'>
                              <span className='text-blue-400 opacity-0 group-hover/cell:opacity-100 text-2xl'>+</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className='fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in overflow-y-auto'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8'>
            <div className='px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50'>
              <h3 className='font-bold text-slate-800'>{modalMode === 'add' ? 'Schedule Event' : 'Update Record'}</h3>
              <button onClick={() => setIsModalOpen(false)} className='text-slate-400 hover:text-slate-600 text-xl font-bold'>&times;</button>
            </div>
            
            <form onSubmit={handleSaveShift} className='p-6 space-y-6'>
              
              <div>
                <select value={formData.shift_type} onChange={e => setFormData({...formData, shift_type: e.target.value})} className='text-xl font-bold text-slate-800 border-none outline-none cursor-pointer hover:bg-slate-50 px-2 py-1 rounded-lg w-full -ml-2'>
                  <option value="WORK">Clinical Work Shift</option>
                  <option value="OFF_DAY">Scheduled Off Day</option>
                  <option value="ANNUAL_LEAVE">Annual Leave</option>
                  <option value="MEDICAL_LEAVE">Medical Leave</option>
                  <option value="UNPAID_LEAVE">Unpaid Leave</option>
                </select>
              </div>

              <div>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Staff Member</label>
                <select required disabled={modalMode === 'edit'} value={formData.nurse_id} onChange={e => setFormData({...formData, nurse_id: e.target.value})} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-slate-800 disabled:opacity-70 disabled:cursor-not-allowed'>
                  <option value="" disabled>-- Choose a registered nurse --</option>
                  {nurses.map(nurse => <option key={nurse.user_id} value={nurse.user_id}>{nurse.user_fullname}</option>)}
                </select>
              </div>

              {formData.shift_type === 'WORK' ? (
                <div>
                   <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Date</label>
                   <input type="date" required disabled={modalMode === 'edit'} value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value, endDate: e.target.value})} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 disabled:opacity-70' />
                </div>
              ) : (
                <div className='grid grid-cols-2 gap-4 items-center animate-in slide-in-from-top-2'>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Start Date</label>
                    <input type="date" required disabled={modalMode === 'edit'} value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value, endDate: formData.endDate < e.target.value ? e.target.value : formData.endDate})} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 disabled:opacity-70' />
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>End Date</label>
                    <input type="date" required disabled={modalMode === 'edit'} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 disabled:opacity-70' />
                  </div>
                </div>
              )}

              {/* NEW CLINICAL BLOCK */}
              {formData.shift_type === 'WORK' && (
                <div className='p-5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-4 animate-in slide-in-from-top-2'>
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Start Time</label>
                      <input type="time" required value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} className='w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' />
                    </div>
                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>End Time</label>
                      <input type="time" required value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} className='w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' />
                    </div>
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Shift Role</label>
                      <select required value={formData.shift_role} onChange={e => setFormData({...formData, shift_role: e.target.value})} className='w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800'>
                        <option value="Floor Nurse">Floor Nurse</option>
                        <option value="Shift In-Charge">Shift In-Charge</option>
                        <option value="Triage / Setup">Triage / Setup</option>
                      </select>
                    </div>
                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Zone / Machines</label>
                      <input type="text" placeholder="e.g. Zone A (M1-M4)" value={formData.zone_assignment} onChange={e => setFormData({...formData, zone_assignment: e.target.value})} className='w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' />
                    </div>
                  </div>

                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Unpaid Break (Minutes)</label>
                    <input type="number" min="0" step="15" required value={formData.break_minutes} onChange={e => setFormData({...formData, break_minutes: e.target.value})} className='w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' />
                    <p className='text-[10px] text-slate-400 mt-1 font-medium'>Deducted from weekly max workload calculation.</p>
                  </div>
                </div>
              )}

              {modalMode === 'add' && formData.shift_type === 'WORK' && (
                <div className='animate-in slide-in-from-top-2'>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Repeat Assignment</label>
                  <select value={formData.repeatWeeks} onChange={e => setFormData({...formData, repeatWeeks: e.target.value})} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800'>
                    <option value="0">Does not repeat</option>
                    <option value="1">Weekly on {getLocalDisplayDay(formData.startDate)} (2 times total)</option>
                    <option value="2">Weekly on {getLocalDisplayDay(formData.startDate)} (3 times total)</option>
                    <option value="3">Weekly on {getLocalDisplayDay(formData.startDate)} (1 month total)</option>
                  </select>
                </div>
              )}

              {message.text && (
                <div className={`p-4 rounded-xl font-bold text-sm border flex items-start gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  <span className='mt-0.5'>{message.type === 'success' ? <FiCheckCircle /> : <FiXCircle />}</span>
                  <span>{message.text}</span>
                </div>
              )}

              <div className='pt-4 flex flex-col gap-3 border-t border-slate-100'>
                <div className='flex justify-end gap-3'>
                  <button type="button" onClick={() => setIsModalOpen(false)} className='px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors'>Cancel</button>
                  <button type="submit" disabled={isSaving} className='px-8 py-2.5 text-white bg-blue-600 font-bold rounded-xl shadow-md transition-colors hover:bg-blue-700 disabled:bg-blue-300'>
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {modalMode === 'edit' && (
                  <button type="button" onClick={handleDeleteShift} className='self-start text-xs text-red-600 font-bold hover:underline mt-2'>
                    Delete this record
                  </button>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

    </main>
  );
}
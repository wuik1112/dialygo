'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { 
  FiFileText, FiActivity, FiSearch, FiAlertCircle, 
  FiCheckSquare, FiDownload, FiEye, FiX, FiClock 
} from 'react-icons/fi';

export default function SessionLogs() {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [modalLogs, setModalLogs] = useState<any[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        const { data: userData } = await supabase
          .from('users')
          .select('branch_id')
          .eq('user_email', session.session.user.email)
          .single();
          
        if (!userData) return;

        const { data } = await supabase
          .from('treatments')
          .select(`
            session_id, session_date, start_time, pre_weight, pre_bp, pre_temp, 
            session_postweight, post_bp, fluid_removed, session_complications,
            hemostasis_achieved, needles_intact,
            patients ( users (user_fullname, user_ic) ),
            discharging_nurse:users!treatments_discharged_by_fkey (user_fullname) 
          `)
          .eq('branch_id', userData.branch_id)
          .eq('session_status', 'Completed')
          .order('session_date', { ascending: false })
          .order('start_time', { ascending: false })
          .limit(50);

        setLogs(data || []);
      } catch (err) {
        console.error("Error fetching logs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const name = log.patients?.users?.user_fullname || 'Unknown';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // --- FEATURE 1: EXPORT CSV ---
  const handleExportCSV = () => {
    // 1. Define the Headers
    const headers = [
      'Date', 'Patient Name', 'IC Number', 'Pre-Weight (kg)', 'Post-Weight (kg)', 
      'Fluid Removed (L)', 'Hemostasis Confirmed', 'Needles Intact', 'Clinical Notes & Complications'
    ];

    // 2. Map the data to rows, cleaning up strings for CSV formatting
    const rows = filteredLogs.map(log => {
      const date = new Date(log.session_date).toLocaleDateString('en-GB');
      const name = log.patients?.users?.user_fullname || 'Unknown';
      const ic = log.patients?.users?.user_ic || 'Unknown';
      
      // Wrap notes in quotes and escape internal quotes to prevent CSV layout breaks
      const notes = log.session_complications ? `"${log.session_complications.replace(/"/g, '""')}"` : 'Routine / No Complications';
      
      return [
        date, 
        name, 
        ic, 
        log.pre_weight || '-', 
        log.session_postweight || '-', 
        log.fluid_removed || '-',
        log.hemostasis_achieved ? 'Yes' : 'No', 
        log.needles_intact ? 'Yes' : 'No', 
        notes
      ].join(',');
    });

    // 3. Combine and create a downloadable Blob
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // 4. Create a hidden link and trigger the download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Dialysis_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- FEATURE 2: OPEN CHART MODAL ---
  const openChartModal = async (session: any) => {
    setSelectedSession(session);
    setIsModalLoading(true);
    
    // Fetch the hourly flow sheet for this specific session
    const { data } = await supabase
      .from('session_logs')
      .select('*')
      .eq('session_id', session.session_id)
      .order('log_time', { ascending: true }); // Chronological order
      
    setModalLogs(data || []);
    setIsModalLoading(false);
  };

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 relative">
      <header className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Session Logs</h1>
          <p className="text-slate-500 font-bold mt-1 flex items-center gap-2">
            <FiFileText className="text-blue-500" /> Clinical Audit Trail & Completed Treatments
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input 
              type="text" placeholder="Search patient..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm" 
            />
          </div>
          {/* EXPORT BUTTON */}
          <button 
            onClick={handleExportCSV}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            <FiDownload /> Export CSV
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-12 text-blue-600"><FiActivity className="animate-spin text-4xl" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Date</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Patient</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Pre-Wt</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Post-Wt</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">UF Achieved</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Audit Trail Summary</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.session_id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-slate-700 text-sm">
                    {new Date(log.session_date).toLocaleDateString('en-GB')}
                    <div className="text-xs text-slate-400 font-medium">{log.start_time?.slice(0,5)}</div>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-slate-900 text-sm">{log.patients?.users?.user_fullname || 'Unknown Patient'}</p>
                    <p className="text-xs text-slate-500 font-medium">IC: {log.patients?.users?.user_ic}</p>
                  </td>
                  <td className="p-4 font-bold text-slate-700 text-sm text-center">{log.pre_weight || '-'} kg</td>
                  <td className="p-4 font-bold text-slate-700 text-sm text-center">{log.session_postweight || '-'} kg</td>
                  <td className="p-4 font-black text-emerald-600 text-sm text-center">{log.fluid_removed || '-'} L</td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {log.session_complications ? (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-black uppercase flex items-center gap-1 w-max">
                          <FiAlertCircle /> Notes Attached
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-black uppercase w-max">
                          Routine Session
                        </span>
                      )}
                      
                      {log.hemostasis_achieved && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <FiCheckSquare /> Hemostasis Verified
                        </span>
                      )}

                      <span className="text-[10px] font-bold text-slate-500 mt-1">
                        Discharged by: {log.discharging_nurse?.user_fullname || 'System/Unknown'}
                      </span>
                      
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    {/* VIEW CHART BUTTON */}
                    <button 
                      onClick={() => openChartModal(log)}
                      className="px-4 py-2 bg-white border border-slate-200 text-blue-600 font-bold rounded-lg text-xs hover:bg-blue-50 hover:border-blue-200 transition-colors inline-flex items-center gap-2 shadow-sm"
                    >
                      <FiEye className="text-sm" /> View Chart
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">No completed sessions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --- CHART VIEW MODAL OVERLAY --- */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-900">Clinical Flow Sheet</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {selectedSession.patients?.users?.user_fullname} • {new Date(selectedSession.session_date).toLocaleDateString('en-GB')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSession(null)} 
                className="h-8 w-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                <FiX className="text-lg" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto">
              
              {/* Summary Vitals Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Pre-Dialysis</p>
                  <p className="font-black text-slate-900 mt-1">{selectedSession.pre_weight} kg</p>
                  <p className="text-xs font-bold text-slate-500">{selectedSession.pre_bp}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Post-Dialysis</p>
                  <p className="font-black text-slate-900 mt-1">{selectedSession.session_postweight} kg</p>
                  <p className="text-xs font-bold text-slate-500">{selectedSession.post_bp}</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 sm:col-span-2 flex flex-col justify-center items-center text-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Total Fluid Removed</p>
                  <p className="font-black text-3xl text-emerald-600 mt-1">{selectedSession.fluid_removed} <span className="text-base font-bold">Liters</span></p>
                </div>
              </div>

              {/* Hourly Logs Table */}
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FiClock /> Intradialytic Vitals
              </h3>
              <div className="border border-slate-200 rounded-2xl overflow-hidden mb-8">
                {isModalLoading ? (
                  <div className="p-8 text-center text-blue-500 font-bold animate-pulse">Loading flow sheet...</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase pl-5">Time</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">BP</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">VP</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">TMP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalLogs.map(log => (
                        <tr key={log.log_id}>
                          <td className="p-3 pl-5 font-bold text-slate-700">{log.log_time?.slice(0,5)}</td>
                          <td className="p-3 font-black text-slate-900">{log.log_systolic_bp}/{log.log_diastolic_bp}</td>
                          <td className="p-3 font-medium text-slate-600">{log.log_venous_pressure}</td>
                          <td className="p-3 font-medium text-slate-600">{log.log_transmembrane_pressure}</td>
                        </tr>
                      ))}
                      {modalLogs.length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-slate-400 font-bold">No hourly vitals recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Clinical Notes Section */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5">
                <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FiAlertCircle /> Clinical Notes & Complications
                </h3>
                <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedSession.session_complications || "No complications or interventions logged during this session."}
                </p>
              </div>

            </div>
            
            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase flex justify-center gap-4">
                 <span className={selectedSession.hemostasis_achieved ? 'text-emerald-500' : ''}>Hemostasis: {selectedSession.hemostasis_achieved ? 'Verified' : 'N/A'}</span>
                 <span className={selectedSession.needles_intact ? 'text-emerald-500' : ''}>Access: {selectedSession.needles_intact ? 'Intact' : 'N/A'}</span>
               </p>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
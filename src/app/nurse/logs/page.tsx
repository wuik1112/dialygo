'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { FiFileText, FiActivity, FiSearch, FiAlertCircle, FiCheckSquare, FiDownload, FiEye, FiX, FiClock } from 'react-icons/fi';

export default function SessionLogs() {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [modalLogs, setModalLogs] = useState<any[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;
        const { data: userData } = await supabase.from('users').select('branch_id').eq('user_email', session.session.user.email).single();
        if (!userData) return;

        const { data } = await supabase
          .from('treatments')
          .select(`
            session_id, session_date, start_time, pre_weight, pre_bp, pre_hr, pre_temp, 
            session_postweight, post_bp, post_hr, fluid_removed, actual_weight_loss, kt_v, injections, session_complications,
            hemostasis_achieved, needles_intact, dialyser_model, dialysate_k_level,
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
        console.error(err);
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

  const handleExportCSV = () => {
    const headers = [
      'Date', 'Patient Name', 'IC Number', 'Dialyser', 'Dialysate (K)', 
      'Pre-Weight (kg)', 'Post-Weight (kg)', 'Wt Loss', 'U/F Removed', 'KT/V', 
      'Injections', 'Hemostasis Confirmed', 'Discharged By', 'Clinical Notes'
    ];

    const rows = filteredLogs.map(log => {
      const date = new Date(log.session_date).toLocaleDateString('en-GB');
      const name = log.patients?.users?.user_fullname || 'Unknown';
      const ic = log.patients?.users?.user_ic || 'Unknown';
      const notes = log.session_complications ? `"${log.session_complications.replace(/"/g, '""')}"` : 'Routine / No Complications';
      
      return [
        date, name, ic, log.dialyser_model || '-', log.dialysate_k_level || '-',
        log.pre_weight || '-', log.session_postweight || '-', log.actual_weight_loss || '-', 
        log.fluid_removed || '-', log.kt_v || '-', log.injections || '-',
        log.hemostasis_achieved ? 'Yes' : 'No', 
        log.discharging_nurse?.user_fullname || 'Unknown', notes
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Clinical_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openChartModal = async (session: any) => {
    setSelectedSession(session);
    setIsModalLoading(true);
    const { data } = await supabase.from('session_logs').select('*').eq('session_id', session.session_id).order('log_time', { ascending: true });
    setModalLogs(data || []);
    setIsModalLoading(false);
  };

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 relative">
      <header className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Session Logs</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input type="text" placeholder="Search patient..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 font-bold text-sm" />
          </div>
          <button onClick={handleExportCSV} className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shrink-0 shadow-sm"><FiDownload /> Export CSV</button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-12 text-blue-600"><FiActivity className="animate-spin text-4xl" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase">Date</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase">Patient</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase text-center">Pre-Wt</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase text-center">Post-Wt</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase text-center">Wt Loss / UF</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase">Audit Summary</th>
                <th className="p-4 font-black text-[10px] text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.session_id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-700 text-sm">{new Date(log.session_date).toLocaleDateString('en-GB')}<div className="text-xs text-slate-400 font-medium">{log.start_time?.slice(0,5)}</div></td>
                  <td className="p-4"><p className="font-bold text-slate-900 text-sm">{log.patients?.users?.user_fullname || 'Unknown'}</p><p className="text-xs text-slate-500 font-medium">{log.dialyser_model} • {log.dialysate_k_level}</p></td>
                  <td className="p-4 font-bold text-slate-700 text-sm text-center">{log.pre_weight || '-'} kg</td>
                  <td className="p-4 font-bold text-slate-700 text-sm text-center">{log.session_postweight || '-'} kg</td>
                  <td className="p-4 text-sm text-center font-bold">
                    <span className="text-slate-900">
                      {log.actual_weight_loss ? log.actual_weight_loss : (log.pre_weight && log.session_postweight ? (log.pre_weight - log.session_postweight).toFixed(1) : '-')}
                    </span> <span className="text-slate-400">/</span> <span className="text-emerald-600">{log.fluid_removed || '-'} L</span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {log.session_complications ? <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-black uppercase w-max"><FiAlertCircle className="inline mr-1"/> Notes Attached</span> : <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-black uppercase w-max">Routine Session</span>}
                      {log.hemostasis_achieved && <span className="text-[10px] font-bold text-emerald-600"><FiCheckSquare className="inline mr-1"/> Hemostasis Verified</span>}
                      <span className="text-[10px] font-bold text-slate-500 mt-1">By: {log.discharging_nurse?.user_fullname || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right"><button onClick={() => openChartModal(log)} className="px-4 py-2 bg-white border border-slate-200 text-blue-600 font-bold rounded-lg text-xs hover:bg-blue-50 inline-flex items-center gap-2 shadow-sm"><FiEye className="text-sm" /> View Chart</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-900">Clinical Flow Sheet</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">{selectedSession.patients?.users?.user_fullname} • {new Date(selectedSession.session_date).toLocaleDateString('en-GB')}</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="h-8 w-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"><FiX className="text-lg" /></button>
            </div>

            <div className="p-6 overflow-y-auto">
              
              <div className="flex gap-4 mb-6 border-b border-slate-100 pb-4">
                <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black">DIALYSER: {selectedSession.dialyser_model || 'N/A'}</span>
                <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black">DIALYSATE: {selectedSession.dialysate_k_level || 'N/A'}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Pre-Dialysis</p>
                  <p className="font-black text-slate-900 mt-1">{selectedSession.pre_weight} kg</p>
                  <p className="text-xs font-bold text-slate-500">BP: {selectedSession.pre_bp} • HR: {selectedSession.pre_hr || '-'}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Post-Dialysis</p>
                  <p className="font-black text-slate-900 mt-1">{selectedSession.session_postweight || '-'} kg</p>
                  <p className="text-xs font-bold text-slate-500">BP: {selectedSession.post_bp || '-'} • HR: {selectedSession.post_hr || '-'}</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex flex-col justify-center items-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Fluid Removed</p>
                  <p className="font-black text-2xl text-emerald-600 mt-1">{selectedSession.fluid_removed || '-'} L</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex flex-col justify-center items-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">WT Loss</p>
                  <p className="font-black text-2xl text-emerald-600 mt-1">
                    {/* MATHEMATICAL FALLBACK FOR OLD DATA */}
                    {selectedSession.actual_weight_loss ? selectedSession.actual_weight_loss : (selectedSession.pre_weight && selectedSession.session_postweight ? (selectedSession.pre_weight - selectedSession.session_postweight).toFixed(1) : '-')} kg
                  </p>
                </div>
              </div>

              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><FiClock /> Hourly Flow Sheet</h3>
              <div className="border border-slate-200 rounded-2xl overflow-x-auto mb-8">
                {isModalLoading ? <div className="p-8 text-center text-blue-500 font-bold animate-pulse">Loading flow sheet...</div> : (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase pl-5">Time</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">BP / HR</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">V/P</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">TMP / UF</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">B/F</th>
                        <th className="p-3 font-black text-[10px] text-slate-400 uppercase">HEP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalLogs.map(log => (
                        <tr key={log.log_id}>
                          <td className="p-3 pl-5 font-bold text-slate-700">{log.log_time?.slice(0,5)}</td>
                          <td className="p-3 font-black text-slate-900">{log.log_systolic_bp}/{log.log_diastolic_bp} <span className="text-xs font-medium text-slate-500">({log.log_heart_rate || '-'})</span></td>
                          <td className="p-3 font-medium text-slate-600">{log.log_venous_pressure}</td>
                          <td className="p-3 font-medium text-slate-600">{log.log_transmembrane_pressure} / {log.log_uf_rate || '-'}</td>
                          <td className="p-3 font-medium text-blue-600">{log.log_blood_flow || '-'}</td>
                          <td className="p-3 font-medium text-amber-600">{log.log_heparin || '-'}</td>
                        </tr>
                      ))}
                      {modalLogs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 font-bold">No hourly vitals recorded.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5">
                  <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2"><FiAlertCircle /> Clinical Notes & Complications</h3>
                  <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedSession.session_complications || "Routine treatment. No complications."}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase">KT/V</span><span className="font-bold text-slate-900">{selectedSession.kt_v || '-'}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase">Injection</span><span className="font-bold text-slate-900">{selectedSession.injections || '-'}</span></div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-200"><span className="text-[10px] font-black text-slate-400 uppercase">Discharged By</span><span className="font-bold text-blue-600">{selectedSession.discharging_nurse?.user_fullname || 'Unknown'}</span></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </main>
  );
}
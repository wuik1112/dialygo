'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { FiActivity } from 'react-icons/fi';
import { validateBookingRule } from '@/utils/validationHelpers';
import { broadcastNotification } from '@/utils/notificationService';

export default function SystemRules() {
  const [rules, setRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [inputValues, setInputValues] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, { type: string, text: string }>>({});
  

  async function fetchRules() {
    setIsLoading(true);
    const { data, error } = await supabase.from('rules').select('*').order('rule_id', { ascending: true });
    
    if (data) {
      setRules(data);
      const initialValues: Record<number, string> = {};
      data.forEach(rule => {
        initialValues[rule.rule_id] = rule.rule_value?.toString() || '';
      });
      setInputValues(initialValues);
    }
    if (error) console.error("Error fetching rules:", error);
    setIsLoading(false);
  }

  useEffect(() => {
    fetchRules();
  }, []);

  const handleInputChange = (ruleId: number, value: string) => {
    setInputValues(prev => ({ ...prev, [ruleId]: value }));
    setMessages(prev => ({ ...prev, [ruleId]: { type: '', text: '' } }));
  };

  const handleUpdateRule = async (rule: any) => {
    setSavingId(rule.rule_id);
    setMessages(prev => ({ ...prev, [rule.rule_id]: { type: '', text: '' } }));

    const newValue = inputValues[rule.rule_id];
    const numericValue = parseInt(newValue);

    
    if (isNaN(numericValue) || numericValue <= 0) {
      setMessages(prev => ({ ...prev, [rule.rule_id]: { type: 'error', text: 'Error: Value must be a positive integer greater than zero.' } }));
      setSavingId(null);
      return;
    }

// 1. Map the database rule name to the key expected by our Jest function
    const ruleKey = rule.rule_name === 'Cancellation Cut-off Hours' ? 'cancellation_cutoff' : rule.rule_name;
    
    // 2. Run the pure math function
    const validation = validateBookingRule(ruleKey, numericValue);

    // 3. If it fails, show the error from the function and stop saving
    if (!validation.isValid) {
      setMessages(prev => ({ 
        ...prev, 
        [rule.rule_id]: { type: 'error', text: validation.errorMessage } 
      }));
      setSavingId(null);
      return;
    }


    if (rule.rule_name === 'Global Max Capacity Per Branch') {
      const { data: bookingCounts, error: countError } = await supabase
        .from('bookings')
        .select('branch_id')
        .in('status', ['Confirmed', 'Pending_Approval']);

      if (!countError && bookingCounts) {
        const branchLoads: Record<number, number> = {};
        bookingCounts.forEach((b: any) => {
          branchLoads[b.branch_id] = (branchLoads[b.branch_id] || 0) + 1;
        });

        const highestBranchLoad = Object.values(branchLoads).length > 0 ? Math.max(...Object.values(branchLoads)) : 0;

        if (numericValue < highestBranchLoad) {
          setMessages(prev => ({ 
            ...prev, 
            [rule.rule_id]: { type: 'error', text: 'Cannot apply rule. The new limit is lower than the current active bookings. Please cancel existing bookings first.' } 
          }));
          setSavingId(null);
          return;
        }
      }
    }

    const { error: updateError } = await supabase
      .from('rules')
      .update({ rule_value: numericValue })
      .eq('rule_id', rule.rule_id);

    if (updateError) {
      setMessages(prev => ({ ...prev, [rule.rule_id]: { type: 'error', text: 'Database sync failed.' } }));
    } else {
      setMessages(prev => ({ ...prev, [rule.rule_id]: { type: 'success', text: 'Booking rules updated successfully.' } }));
      setTimeout(() => {
        setMessages(prev => ({ ...prev, [rule.rule_id]: { type: '', text: '' } }));
      }, 3000);
      
      setRules(prevRules => prevRules.map(r => r.rule_id === rule.rule_id ? { ...r, rule_value: numericValue } : r));
    }
    
    setSavingId(null);

    await fetch('/api/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      title: "System Rules Updated",
      message: "The HQ Administrator has updated the system booking parameters. Please review the changes."
    })
  });
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Global Parameters...</span>
        </div>
      </div>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans'>
      <div className='max-w-5xl mx-auto'>
        
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>System Configurations</h1>
        </div>

        <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
          <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center'>
            <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Operational Rules</h2>
            <span className='text-xs font-semibold text-slate-500 bg-slate-200 px-3 py-1 rounded-full'>
              {rules.length} Active Rules
            </span>
          </div>

          <div className='divide-y divide-slate-100'>
            {rules.map(rule => (
              <div key={rule.rule_id} className='p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/30 transition-colors'>
                
                <div className='flex-1 pr-4'>
                  <h3 className='text-base font-bold text-slate-900'>{rule.rule_name}</h3>
                  <p className='text-sm text-slate-500 mt-1.5 leading-relaxed'>{rule.rule_desc}</p>
                  
                  {messages[rule.rule_id]?.text && (
                    <div className={`mt-3 inline-block px-3 py-1.5 rounded-lg text-xs font-bold border ${messages[rule.rule_id].type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {messages[rule.rule_id].text}
                    </div>
                  )}
                </div>

                <div className='flex items-center gap-3 shrink-0'>
                  <input 
                    type='number' 
                    value={inputValues[rule.rule_id] || ''}
                    onChange={(e) => handleInputChange(rule.rule_id, e.target.value)}
                    className='w-28 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-lg font-black text-slate-700 text-center transition-colors'
                  />
                  <button 
                    onClick={() => handleUpdateRule(rule)}
                    disabled={savingId === rule.rule_id || inputValues[rule.rule_id] === rule.rule_value?.toString()}
                    className={`px-6 py-3 rounded-xl font-bold transition-all shadow-sm
                      ${savingId === rule.rule_id 
                        ? 'bg-blue-300 text-white cursor-wait' 
                        : inputValues[rule.rule_id] !== rule.rule_value?.toString()
                          ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }
                    `}
                  >
                    {savingId === rule.rule_id ? 'Saving...' : 'Save'}
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
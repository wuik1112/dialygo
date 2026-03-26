'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { FiChevronLeft, FiPhoneCall, FiChevronDown, FiAlertTriangle } from 'react-icons/fi';

export default function HelpSupport() {
  const router = useRouter();
  const [homeBranch, setHomeBranch] = useState<any>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    async function loadBranchData() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return;
        
        const { data: user } = await supabase.from('users').select('user_id').eq('user_email', session.session.user.email).single();
        if (!user) return;
        
        const { data: patient } = await supabase.from('patients').select('home_branch_id').eq('user_id', user.user_id).single();
        if (patient?.home_branch_id) {
          const { data: branch } = await supabase.from('branches').select('*').eq('id', patient.home_branch_id).single();
          setHomeBranch(branch);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadBranchData();
  }, []);

  const faqs = [
    {
      question: "How do I book a travel dialysis session?",
      answer: "Navigate to the 'Search' tab, find a center in your destination city, add your desired dates and shifts to your cart, and submit the request. Your Home Branch Manager will review your documents before final approval."
    },
    {
      question: "What documents do I need to travel?",
      answer: "You strictly require a Doctor's Referral Letter and a valid Serology Blood Test Report (not older than 6 months). Your Home Centre nurses are responsible for verifying and uploading these to your profile."
    },
    {
      question: "Can I cancel a travel booking?",
      answer: "Yes. Go to the 'Home' tab, select the upcoming travel session, and tap 'Cancel'. Note: Cancellations within 24 hours of the appointment must be done by calling the destination clinic directly."
    },
    {
      question: "What happens if my preferred machine is not available?",
      answer: "The DialyGo system will warn you before booking. If you proceed, the Destination Head Nurse will review your prescription and adjust the machine settings (e.g., Ultrafiltration rate) upon your arrival to ensure a safe treatment."
    }
  ];

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0 border-b border-slate-100'>
        <button onClick={() => router.back()} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-1 font-bold text-sm'>
          <FiChevronLeft className='text-2xl' /> Back
        </button>
        <h1 className='text-lg font-black text-slate-800'>Help & Support</h1>
        <div className='w-14' />
      </div>

      <div className='flex-1 overflow-y-auto p-5 pb-safe custom-scrollbar space-y-6'>
        
        {/* EMERGENCY HOTLINE */}
        <div className='bg-red-600 rounded-3xl p-6 text-white shadow-lg shadow-red-600/20 flex items-center gap-4'>
          <div className='w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl shrink-0'>
            <FiAlertTriangle />
          </div>
          <div className='flex-1'>
            <h2 className='text-base font-black'>Medical Emergency</h2>
            <p className='text-xs text-red-100 font-medium leading-tight mt-0.5'>If you are experiencing severe shortness of breath or chest pain, call 999 immediately.</p>
          </div>
          <button onClick={() => window.open('tel:999')} className='bg-white text-red-600 px-4 py-2.5 rounded-xl font-black text-sm shadow-md active:scale-95 transition-transform'>
            999
          </button>
        </div>

        {/* HOME CENTRE CONTACT */}
        <div>
          <h3 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Contact Home Centre</h3>
          <div className='bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden'>
            <div className='p-5 border-b border-slate-50'>
              <h4 className='text-base font-black text-slate-800'>{homeBranch ? homeBranch.branch_name : 'Your Dialysis Centre'}</h4>
              <p className='text-xs font-bold text-slate-500 mt-1'>For scheduling issues or clinical document updates, please call the clinic directly.</p>
            </div>
            
            <button 
              onClick={() => homeBranch?.branch_contact && window.open(`tel:${homeBranch.branch_contact}`)} 
              className='w-full py-4 flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors text-slate-700 active:bg-slate-100'
            >
              <FiPhoneCall className='text-xl text-blue-600' />
              <span className='text-sm font-black'>Call {homeBranch?.branch_contact || 'Clinic'}</span>
            </button>
          </div>
        </div>

        {/* FAQ ACCORDION */}
        <div>
          <h3 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Frequently Asked Questions</h3>
          <div className='bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden'>
            {faqs.map((faq, index) => (
              <div key={index} className={`border-b border-slate-50 last:border-0 ${openFaq === index ? 'bg-slate-50' : 'bg-white'}`}>
                <button 
                  onClick={() => setOpenFaq(openFaq === index ? null : index)} 
                  className='w-full p-5 flex justify-between items-center text-left focus:outline-none'
                >
                  <span className='text-sm font-black text-slate-800 pr-4'>{faq.question}</span>
                  <FiChevronDown className={`text-lg text-slate-400 transition-transform duration-300 shrink-0 ${openFaq === index ? 'rotate-180 text-blue-600' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className='px-5 pb-5 text-xs font-bold text-slate-500 leading-relaxed text-justify'>
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className='text-center pt-4 pb-2'>
          <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest'>DialyGo Patient Portal v1.0.0</p>
        </div>

      </div>
    </div>
  );
}
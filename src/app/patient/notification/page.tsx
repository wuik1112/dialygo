import NotificationInbox from '../../../components/NotificationInbox';
import PatientBottomNav from '../../../components/PatientBottomNav';

export default function PatientNotifications() {
  return (
    <div className='max-w-md mx-auto w-full bg-slate-50 h-screen h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
        <h1 className='text-center text-xl font-black text-slate-800 tracking-tight'>Notifications</h1>
      </div>

      <div className='flex-1 overflow-y-auto bg-slate-50 custom-scrollbar relative'>
        <NotificationInbox roleType="patient" isMobile={true} />
      </div>

      <PatientBottomNav />
    </div>
  );
}
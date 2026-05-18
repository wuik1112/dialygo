import NotificationInbox from '../../../components/NotificationInbox';

export default function NephrologistNotifications() {
  return (
    <main className="bg-slate-50 min-h-screen pb-24 font-sans">
      <NotificationInbox roleType="nephrologist" returnPath="/nephrologist" />
    </main>
  );
}
import NotificationInbox from '../../../components/NotificationInbox';

export default function ManagerNotifications() {
  return (
    <main className="bg-slate-50 min-h-screen pb-24 font-sans">
      <NotificationInbox roleType="manager" returnPath="/manager" />
    </main>
  );
}
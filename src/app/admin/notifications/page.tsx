import NotificationInbox from '../../../components/NotificationInbox';

export default function AdminNotifications() {
  return (
    <main className="bg-slate-50 min-h-screen pb-24 font-sans">
      <NotificationInbox roleType="admin" returnPath="/admin" />
    </main>
  );
}
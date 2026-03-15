import './globals.css';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en'>
      <body className='flex min-h-screen bg-slate-50'>
        <Sidebar />
        <div className='flex-1 flex flex-col'>
          <Header />
          <main className='flex-1 overflow-y-auto'>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
import './globals.css';
import ClientLayout from './ClientLayout';
import type { Viewport, Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DialyGo',
  description: 'Centralized Dialysis Booking System',
  manifest: '/manifest.json', // <-- ADD THIS LINE
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DialyGo',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, 
  userScalable: false,
  themeColor: '#2563eb', // Matches your Tailwind blue-600
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
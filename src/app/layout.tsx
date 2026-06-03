import './globals.css';
import ClientLayout from './ClientLayout';
import type { Viewport, Metadata } from 'next';

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'DialyGo',
  description: 'Centralized Dialysis Booking System',
  manifest: '/manifest.json', // Links your manifest
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DialyGo',
  },
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
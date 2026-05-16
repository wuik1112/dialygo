import './globals.css';
import ClientLayout from './ClientLayout';
import type { Viewport, Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DialyGo',
  description: 'Centralized Dialysis Booking System',
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
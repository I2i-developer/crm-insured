import './globals.css';
import { AuthProvider } from '@/lib/authContext';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata = {
  title: 'Insurance Renewal Management Portal',
  description: 'A comprehensive insurance renewal management system to track client policies, manage renewals, and automate alerts via email, SMS, and WhatsApp.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

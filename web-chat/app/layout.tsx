import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadsPlease Data Assistant',
  description: 'AI-powered assistant for consumer and business data lists',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

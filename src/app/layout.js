import './globals.css';

export const metadata = {
  title: 'AIS Studio',
  description: 'AI music-video studio — orb canvas UI.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

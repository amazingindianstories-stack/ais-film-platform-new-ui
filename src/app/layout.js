import './globals.css';

export const metadata = {
  title: 'AIS Studio',
  description: 'AI music-video studio — orb canvas UI.',
};

import { Providers } from './Providers';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

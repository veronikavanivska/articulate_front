import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
    title: 'Articulate',
    description: 'Articulate app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    // Add classes here so server-rendered HTML matches client
    return (
        <html lang="en">
        <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
        </body>
        </html>
    );
}
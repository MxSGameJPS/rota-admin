import './globals.css';
import AdminShell from '@/components/AdminShell/AdminShell';

export const metadata = {
  title: 'Rota Admin',
  description: 'Game Master local do Rota da Justiça',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}

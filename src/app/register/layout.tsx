import { AuthProvider } from '@/components/auth-provider';

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}

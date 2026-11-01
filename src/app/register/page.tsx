import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { Card, Container } from "@/components/ui";
import { getAccess, safeNext } from "@/lib/authz";

export const metadata = { title: "Бүртгүүлэх" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getAccess()) redirect(safeNext(next));
  return (
    <Container className="max-w-md py-16">
      <h1 className="font-display text-2xl font-semibold">Бүртгүүлэх</h1>
      <p className="mt-2 text-muted">Имэйлээрээ бүртгүүлээд захиалгаа үргэлжлүүлнэ үү.</p>
      <Card className="mt-8"><RegisterForm next={next} /></Card>
    </Container>
  );
}

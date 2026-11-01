import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { Card, Container } from "@/components/ui";
import { getAccess, safeNext } from "@/lib/authz";

export const metadata = { title: "Нэвтрэх" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getAccess()) redirect(safeNext(next));
  return (
    <Container className="max-w-md py-16">
      <h1 className="font-display text-2xl font-semibold">Нэвтрэх</h1>
      <p className="mt-2 text-muted">Захиалга, төлбөр, тайлангаа нэг дороос хянаарай.</p>
      <Card className="mt-8"><LoginForm next={next} /></Card>
    </Container>
  );
}

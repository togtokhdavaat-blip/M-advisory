"use client";
import { Button, Container } from "@/components/ui";

export default function ErrorPage({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <Container className="py-24 text-center">
      <h1 className="text-xl font-semibold">Алдаа гарлаа</h1>
      <p className="mt-2 text-muted">Түр зуурын алдаа байж магадгүй. Дахин оролдоно уу.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Алдааны код: {error.digest}</p>}
      <Button onClick={reset} className="mt-8">Дахин оролдох</Button>
    </Container>
  );
}

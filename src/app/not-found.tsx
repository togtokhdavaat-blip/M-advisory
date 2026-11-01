import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-5xl font-semibold text-accent">404</p>
      <h1 className="mt-4 text-xl font-semibold">Хуудас олдсонгүй</h1>
      <p className="mt-2 text-muted">Хайсан хуудас байхгүй эсвэл танд үзэх эрх алга.</p>
      <ButtonLink href="/" className="mt-8">Нүүр хуудас руу буцах</ButtonLink>
    </Container>
  );
}

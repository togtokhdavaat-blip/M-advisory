import Link from "next/link";
import { ButtonLink, Card, Container } from "@/components/ui";
import { listServices } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Үйлчилгээ сонгох", "Хамрах хүрээ, үнэ, хугацаатай танилцана."],
  ["Мэдээлэл оруулах", "Хөрөнгийн байршил, төрөл, талбай, баримтаа оруулна."],
  ["Бүртгүүлэх", "Имэйлээр бүртгүүлж, захиалгаа баталгаажуулна."],
  ["Төлбөр төлөх", "QPay-ээр аюулгүй төлнө. Төлбөр орсны дараа ажил эхэлнэ."],
  ["Мэргэжилтэн ажиллах", "Таны захиалгад хариуцсан зөвлөх томилогдоно."],
  ["Тайлан хянагдах", "Өөр мэргэжилтэн тайланг хянаж баталгаажуулна."],
  ["Тайлан хүлээн авах", "Самбараасаа PDF тайлангаа татаж авна."],
];

const PROMISES = [
  ["Зөвхөн таны талд", "Худалдагч, барилгын компаниас тусдаа, ашиг сонирхлын зөрчлийг урьдчилан бичгээр мэдэгдэнэ."],
  ["Нотолгоотой дүгнэлт", "Эрсдэл бүрийг эх сурвалжтай нь бичнэ. Шалгаж чадаагүй зүйлийг «Баталгаажаагүй» гэж тодорхой хэлнэ."],
  ["Хоёр шатны хяналт", "Тайланг бэлтгэсэн зөвлөх биш, өөр мэргэжилтэн хянаж батална."],
  ["Мэдээллийн нууцлал", "Өмчлөлийн баримт хаалттай сан дахь хувийн хадгалалтад байрлана."],
];

export default async function Home() {
  const services = await listServices();
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 font-display text-xs tracking-[0.24em] text-brass">TRUST CREATES VALUE.</p>
            <h1 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">
              Худалдан авахаасаа өмнө эрсдэлээ мэргэжлийн хүнээр шалгуул.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              M ADVISORY нь үл хөдлөх хөрөнгийн баримт, өмчлөл, зах зээлийн үнэ, барилгын компанийн мэдээллийг шалгаж, хянагдсан тайланг онлайнаар хүргэнэ.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/order/m-check">M CHECK захиалах</ButtonLink>
              <ButtonLink href="/services" variant="secondary">Бүх үйлчилгээ</ButtonLink>
            </div>
          </div>
          <Card className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">M CHECK тайланд</p>
            <ul className="space-y-3 text-sm">
              {["Гол дүгнэлт (Executive Summary)", "Баримт бичгийн шалгалтын үр дүн", "Зах зээлийн харьцуулсан шинжилгээ", "Эрсдэл бүрийн түвшин, нотлох эх сурвалж", "Зөвлөмж, дараагийн алхам", "Хянасан, баталсан мэргэжилтний мэдээлэл"].map((t) => (
                <li key={t} className="flex gap-3"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />{t}</li>
              ))}
            </ul>
            <div className="grid grid-cols-4 gap-2 pt-2 text-center text-[11px] font-semibold">
              <span className="rounded-md bg-good-soft px-1 py-1.5 text-good">Бага</span>
              <span className="rounded-md bg-warn-soft px-1 py-1.5 text-warn">Дунд</span>
              <span className="rounded-md bg-bad-soft px-1 py-1.5 text-bad">Өндөр</span>
              <span className="rounded-md bg-surface-2 px-1 py-1.5 text-muted">Баталгаажаагүй</span>
            </div>
          </Card>
        </Container>
      </section>

      <Container className="py-16">
        <h2 className="font-display text-2xl font-semibold">Үйлчилгээ</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link key={s.id} href={`/services/${s.slug}`} className="group rounded-xl border border-line bg-surface p-6 transition hover:border-accent">
              <div className="flex items-center justify-between">
                <p className="font-display font-semibold tracking-wide">{s.name}</p>
                {s.isOrderable ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">Онлайн захиалга</span>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">Удахгүй</span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{s.tagline}</p>
              <p className="mt-4 text-sm font-semibold text-accent group-hover:underline">Дэлгэрэнгүй →</p>
            </Link>
          ))}
        </div>
      </Container>

      <section className="border-y border-line bg-surface">
        <Container className="py-16">
          <h2 className="font-display text-2xl font-semibold">Хэрхэн ажилладаг вэ</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line font-display text-sm font-semibold text-accent">{i + 1}</span>
                <div><p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Container className="py-16">
        <h2 className="font-display text-2xl font-semibold">Бидний амлалт</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PROMISES.map(([t, d]) => (
            <Card key={t}><p className="font-semibold">{t}</p><p className="mt-2 text-sm text-muted">{d}</p></Card>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-xs text-muted">
          M ADVISORY-ийн тайлан нь худалдан авах шийдвэр гаргахад туслах мэргэжлийн дүгнэлт юм. Хууль зүйн дүгнэлт, банк, шүүхэд хүлээн зөвшөөрөгдөх лицензтэй үнэлгээ шаардлагатай тохиолдолд эрх бүхий мэргэжилтэнд холбоно.
        </p>
      </Container>
    </>
  );
}

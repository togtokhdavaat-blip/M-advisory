import { Alert, Container, PageHeader } from "@/components/ui";
import { TERMS_VERSION } from "@/lib/legal";

export const metadata = { title: "Үйлчилгээний нөхцөл" };

export default function TermsPage() {
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow={TERMS_VERSION} title="Платформын үйлчилгээний нөхцөл" />
      <Alert tone="warn" title="Төсөл">Энэ текстийг Симкас Пропертиз ХХК-ийн удирдлага, хуулийн зөвлөх батлах хүртэл төсөл хэвээр байна.</Alert>
      <div className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>1. M ADVISORY платформыг Симкас Пропертиз ХХК (брэнд нэр: M Properties) ажиллуулна.</p>
        <p>2. Үйлчилгээ тус бүрийн хамрах хүрээ, хөлс, хугацаа, нөхцөлийг захиалга баталгаажуулах үед харуулах бөгөөд тухайн үеийн нөхцөл таны захиалгад хадгалагдана.</p>
        <p>3. Бүх төлбөрийг зөвхөн Симкас Пропертиз ХХК-ийн дансанд (QPay-ээр) хүлээн авна. Төлбөр орсноор ажил эхэлнэ.</p>
        <p>4. Тайлан нь худалдан авах шийдвэр гаргахад туслах мэргэжлийн дүгнэлт бөгөөд хууль зүйн дүгнэлт, лицензтэй үнэлгээ биш.</p>
        <p>5. Та өөрийн бүртгэлийн нууц үгийг хамгаалах үүрэгтэй.</p>
      </div>
    </Container>
  );
}

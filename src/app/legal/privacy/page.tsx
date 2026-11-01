import { Alert, Container, PageHeader } from "@/components/ui";
import { PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Хувийн мэдээллийн бодлого" };

export default function PrivacyPage() {
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow={PRIVACY_VERSION} title="Хувийн мэдээллийн бодлого" />
      <Alert tone="warn" title="Төсөл">Хадгалах хугацаа, холбогдох хаягийг удирдлага батлах шаардлагатай.</Alert>
      <div className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>1. Хариуцагч: Симкас Пропертиз ХХК (брэнд нэр: M Properties).</p>
        <p>2. Бид таны нэр, холбоо барих мэдээлэл, хөрөнгийн мэдээлэл, байршуулсан баримтыг зөвхөн захиалсан үйлчилгээг үзүүлэхэд ашиглана.</p>
        <p>3. Өмчлөлийн баримтыг хаалттай хадгалалтад байршуулж, зөвхөн таны захиалгад томилогдсон мэргэжилтэн үзнэ. Татах холбоос богино хугацаанд хүчинтэй.</p>
        <p>4. Хадгалах хугацаа: харилцаа дууссанаас хойш 5 жил; гэрээ байгуулаагүй хүсэлтийг 1 жилийн дараа устгана (батлагдах хүртэл санал).</p>
        <p>5. Та өөрийн мэдээллийг үзэх, засах, зөвшөөрлөө цуцлах эрхтэй.</p>
      </div>
    </Container>
  );
}

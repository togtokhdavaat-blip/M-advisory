import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderForm, type OrderFormValues } from "@/components/order-form";
import { Alert, Container, PageHeader } from "@/components/ui";
import { getAccess } from "@/lib/authz";
import { getServiceBySlug } from "@/lib/catalog";
import { getOrderDetail } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Захиалга" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ service: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { service: slug } = await params;
  const { edit } = await searchParams;
  const data = await getServiceBySlug(slug);
  if (!data) notFound();
  const access = await getAccess();

  if (!data.service.isOrderable) {
    return (
      <Container className="max-w-2xl py-12">
        <PageHeader eyebrow={data.service.name} title="Онлайн захиалга удахгүй нээгдэнэ" />
        <Alert tone="neutral">Энэ үйлчилгээг одоогоор зөвлөхтэй холбогдож захиална.</Alert>
      </Container>
    );
  }

  let initial: OrderFormValues = {};
  if (edit && access) {
    const d = await getOrderDetail(access.user, edit);
    if (d && d.order.status === "draft" && d.property) {
      const p = d.property;
      const owner = d.parties.find((x) => x.party_role === "owner");
      const buyer = d.parties.find((x) => x.party_role === "buyer");
      const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      initial = {
        orderId: d.order.id as string,
        propertyType: s(p.property_type), district: s(p.district), khoroo: s(p.khoroo), address: s(p.address),
        projectName: s(p.project_name), areaSqm: s(p.area_sqm), rooms: s(p.rooms), floor: s(p.floor),
        buildYear: s(p.build_year), registrationNumber: s(p.registration_number), cadastralNumber: s(p.cadastral_number),
        askingPriceMnt: s(p.asking_price_mnt), listingUrl: s(p.listing_url),
        ownerName: s(owner?.full_name), ownerPhone: s(owner?.phone),
        clientIsBuyer: buyer && !buyer.is_client ? "off" : "on", buyerName: buyer && !buyer.is_client ? s(buyer.full_name) : "",
        notes: s(d.order.client_notes),
      };
    }
  }

  return (
    <Container className="max-w-3xl py-12">
      <PageHeader
        eyebrow={`${data.service.name} захиалга`}
        title="Шалгуулах хөрөнгийн мэдээлэл"
        description="Мэдээллээ оруулаад хадгална уу. Төлбөр төлөхөөс өмнө хөлс болон нөхцөлийг дахин харуулна."
      />
      <Suspense>
        <OrderForm serviceSlug={slug} initial={initial} isAuthed={!!access} />
      </Suspense>
    </Container>
  );
}

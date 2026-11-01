-- ============================================================================
-- Seed: branches, service catalogue, price list, requirements.
-- Every price is seeded as status = 'proposed'. Nothing can be ordered or
-- paid until a SUPER_ADMIN approves the price rows in /admin/pricing.
-- Figures come from the M Properties service contract draft (Annex 2/3) and
-- are configuration, not hard-coded business logic.
-- ============================================================================

insert into public.branches (code, name, status) values
  ('UB1', 'Салбар 1', 'active'),
  ('UB2', 'Салбар 2', 'active')
on conflict (code) do nothing;

insert into public.services
  (code, slug, name, tagline, description, deliverable, scope_items, excluded_items, turnaround_text,
   is_active, is_orderable, sort_order, terms_version, terms_text)
values
(
  'M_CHECK', 'm-check', 'M CHECK',
  'Худалдан авахаас өмнөх эрсдэлийн шалгалт',
  'Сонирхож буй үл хөдлөх хөрөнгийн баримт бичиг, өмчлөл, барьцаа, зах зээлийн үнэ, барилгын компанийн мэдээллийг шалгалтын жагсаалтын дагуу хянаж, эрсдэлийн түвшинтэй тайлан гаргана.',
  'Эрсдэлийн шалгалтын тайлан (PDF), эрсдэл тус бүрийн түвшин, нотлох эх сурвалж, зөвлөмж.',
  '["Өмчлөлийн гэрчилгээ, улсын бүртгэлийн мэдээллийн хяналт","Барьцаа, хөрөнгийн хязгаарлалтын шалгалт","Зах зээлийн харьцуулсан үнийн шинжилгээ","Барилгын компани, төслийн мэдээллийн шалгалт (шинэ төсөл)","Захиалгын гэрээний хяналт (шинэ төсөл)","Эрсдэлийн түвшин: Бага / Дунд / Өндөр / Баталгаажаагүй"]'::jsonb,
  '["Шүүх, арбитрт төлөөлөх хуулийн үйлчилгээ","Барилгын инженерийн техникийн экспертиз","Банк, шүүхэд хүлээн зөвшөөрөгдөх лицензтэй үнэлгээ","Нотариат, улсын бүртгэлийн хураамж зэрэг гуравдагч этгээдийн зардал"]'::jsonb,
  'Ашиглалтад орсон хөрөнгө: шаардлагатай баримт ирснээс хойш ажлын 8 цагт. Шинэ төсөл: ажлын 7 өдөр.',
  true, true, 10, 'm-check-v1',
  'M CHECK үйлчилгээний нөхцөл (v1). Үйлчилгээ үзүүлэгч: Симкас Пропертиз ХХК (брэнд нэр: M Properties). 1. Хөлсийг ажил эхлэхээс өмнө 100% төлнө; төлбөр Симкас Пропертиз ХХК-ийн дансанд орсноор ажил эхэлнэ. Хөлсөнд НӨАТ орсон. 2. Тайлан нь худалдан авах шийдвэр гаргахад туслах мэргэжлийн дүгнэлт бөгөөд хууль зүйн дүгнэлт, лицензтэй үнэлгээ биш. 3. "Баталгаажаагүй" гэсэн дүгнэлт нь мэдээлэл хангалтгүй гэсэн утгатай бөгөөд эрсдэлгүй гэсэн үг биш. 4. Гүйцэтгэгчийн хариуцлагын дээд хэмжээ нь төлсөн хөлсний 30% байна. 5. Захиалагчийн өгсөн баримт, мэдээллийг зөвхөн энэ үйлчилгээнд ашиглаж, хувийн мэдээллийн хадгалалтын бодлогын дагуу хадгална.'
),
(
  'M_VALUE', 'm-value', 'M VALUE',
  'Зах зээлийн үнийн шинжилгээ',
  'Ижил төстэй хөрөнгийн гүйлгээ, зарын мэдээлэлд тулгуурлан тухайн хөрөнгийн зах зээлийн үнийг шинжилнэ.',
  'Зах зээлийн үнийн шинжилгээний тайлан.',
  '["Харьцуулсан хөрөнгийн сонголт","Зах зээлийн үнийн тооцоо","Үнийн хэлэлцээрийн зөвлөмж"]'::jsonb,
  '["Банк, шүүхэд хүлээн зөвшөөрөгдөх албан ёсны үнэлгээ"]'::jsonb,
  'Тохиролцсоноор', true, false, 20, 'm-value-v1', ''
),
(
  'M_BUY', 'm-buy', 'M BUY',
  'Худалдан авагчийн бүтэн төлөөлөл',
  'Таны шаардлагад нийцэх хөрөнгийг бүх зах зээлээс хайж, үзлэг зохион байгуулж, шалгалт хийж, үнийн хэлэлцээрээс хаалт хүртэл таны талд ажиллана.',
  'Харьцуулсан санал, M CHECK тайлан, хэлэлцээр, хаалтын дэмжлэг.',
  '["M CONSULT зөвлөгөө багтсан","M CHECK шалгалт багтсан","8 хүртэлх үзлэг","Үнийн хэлэлцээр, хаалтын дэмжлэг"]'::jsonb,
  '["Хуулийн төлөөлөл","Гуравдагч этгээдийн зардал"]'::jsonb,
  'Гэрээний хугацаа 30 хоног', true, false, 30, 'm-buy-v1', ''
),
(
  'M_INVEST', 'm-invest', 'M INVEST',
  'Хөрөнгө оруулалтын дүгнэлт',
  'Үл хөдлөх хөрөнгийн хөрөнгө оруулалтын өгөөж, эрсдэл, хувилбаруудыг шинжилж дүгнэлт гаргана.',
  'Хөрөнгө оруулалтын дүгнэлтийн тайлан.',
  '["Өгөөжийн шинжилгээ","Эрсдэлийн үнэлгээ","Хувилбаруудын харьцуулалт"]'::jsonb,
  '["Ирээдүйн үнийн өсөлт, түрээсийн өгөөжийн баталгаа"]'::jsonb,
  'Тохиролцсоноор', true, false, 40, 'm-invest-v1', ''
),
(
  'M_REPRESENTATION', 'm-representation', 'M REPRESENTATION',
  'Харилцагчийг төлөөлөх үйлчилгээ',
  'Худалдагч, барилгын компани, бусад талуудтай харилцахад таныг мэргэжлийн түвшинд төлөөлнө.',
  'Төлөөллийн үйлчилгээ.',
  '["Талуудтай харилцах","Хэлэлцээр","Баримт бичгийн зохион байгуулалт"]'::jsonb,
  '["Шүүх, арбитрт төлөөлөх хуулийн үйлчилгээ"]'::jsonb,
  'Тохиролцсоноор', true, false, 50, 'm-representation-v1', ''
)
on conflict (code) do nothing;

-- M CHECK price matrix: segment x value band (₮500M / ₮1B), all 'proposed'.
with s as (select id from public.services where code = 'M_CHECK'),
bands(seg, b500, b1000, bmax, label) as (values
  ('apartment'::public.property_type,         200000, 250000, 300000, 'Орон сууц (ашиглалтад орсон)'),
  ('new_project'::public.property_type,       350000, 400000, 450000, 'Шинэ төсөл — 1 төсөл + захиалгын гэрээний хяналт'),
  ('house'::public.property_type,             250000, 300000, 350000, 'Хаус, таунхаус'),
  ('land'::public.property_type,              250000, 300000, 350000, 'Газар'),
  ('office'::public.property_type,            300000, 350000, 400000, 'Оффис'),
  ('retail'::public.property_type,            300000, 350000, 400000, 'Худалдаа, үйлчилгээний талбай'),
  ('commercial_object'::public.property_type, 400000, 450000, 500000, 'Объект (бүтэн барилга, үйлдвэр г.м.)')
)
insert into public.service_prices (service_id, version, segment, value_min_mnt, value_max_mnt, pricing_model, amount_mnt, label, status)
select s.id, 1, b.seg, r.vmin, r.vmax, 'fixed', r.amount, b.label || ' · ' || r.band, 'proposed'
from s, bands b,
lateral (values
  (null::bigint,  500000000::bigint,  b.b500,  '₮500 сая хүртэл'),
  (500000000,     1000000000,         b.b1000, '₮500 сая – ₮1 тэрбум'),
  (1000000000,    null,               b.bmax,  '₮1 тэрбумаас дээш')
) as r(vmin, vmax, amount, band)
where not exists (select 1 from public.service_prices p where p.service_id = s.id);

-- M BUY: percentage of final purchase price by band, minimum ₮2,000,000.
with s as (select id from public.services where code = 'M_BUY')
insert into public.service_prices (service_id, version, segment, value_min_mnt, value_max_mnt, pricing_model, percent_bps, min_fee_mnt, label, status)
select s.id, 1, null, r.vmin, r.vmax, 'percentage', r.bps, 2000000, r.label, 'proposed'
from s, (values
  (null::bigint, 300000000::bigint, 220, '₮300 сая хүртэл · 2.2%'),
  (300000000,    600000000,         180, '₮300–600 сая · 1.8%'),
  (600000000,    1000000000,        150, '₮600 сая – ₮1 тэрбум · 1.5%'),
  (1000000000,   null,              110, '₮1 тэрбумаас дээш · 1.1%')
) as r(vmin, vmax, bps, label)
where not exists (select 1 from public.service_prices p where p.service_id = s.id);

-- Remaining services: priced on request until management sets a price list.
insert into public.service_prices (service_id, version, pricing_model, label, status)
select id, 1, 'quote', 'Үнийн санал авна', 'proposed'
from public.services s
where code in ('M_VALUE', 'M_INVEST', 'M_REPRESENTATION')
  and not exists (select 1 from public.service_prices p where p.service_id = s.id);

-- M CHECK document requirements.
with s as (select id from public.services where code = 'M_CHECK')
insert into public.service_requirements (service_id, code, label, help_text, document_type, is_required, applies_to, sort_order)
select s.id, r.code, r.label, r.help, r.doc, r.req, r.applies, r.ord
from s, (values
  ('ownership_certificate', 'Үл хөдлөх эд хөрөнгийн гэрчилгээ', 'Өмчлөгчийн гэрчилгээний хуулбар эсвэл зураг', 'ownership_certificate', true,
     array['apartment','house','land','office','retail','commercial_object']::public.property_type[], 10),
  ('registry_extract', 'Улсын бүртгэлийн лавлагаа', 'Байгаа бол — e-mongolia эсвэл бүртгэлийн газраас авсан лавлагаа', 'registry_extract', false, null, 20),
  ('cadastral_map', 'Кадастрын зураг', 'Газар болон хаус худалдан авахад', 'cadastral_map', false,
     array['land','house','commercial_object']::public.property_type[], 30),
  ('sales_agreement_draft', 'Худалдах-худалдан авах / захиалгын гэрээний төсөл', 'Шинэ төсөлд заавал, бусад тохиолдолд байгаа бол', 'agreement_draft', false, null, 40),
  ('developer_documents', 'Барилгын компанийн баримт', 'Барилгын зөвшөөрөл, газрын эрх, компанийн гэрчилгээ (байгаа бол)', 'developer_documents', false,
     array['new_project']::public.property_type[], 50),
  ('listing_screenshot', 'Зарын зураг, линк', 'Худалдагчийн зар, үнийн мэдээлэл', 'listing', false, null, 60)
) as r(code, label, help, doc, req, applies, ord)
on conflict (service_id, code) do nothing;

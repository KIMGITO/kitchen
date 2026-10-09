import Image from 'next/image';
import { BodyText, Caption, DishTitle, HeroTitle, PriceLabel, SectionTitle } from '@/components/ui/primitives/Typography';

interface FeaturedDish {
  id: string;
  name: string;
  description: string;
  price: string;
  tag?: string;
  eta: string;
  image: string;
}

interface CheckoutLine {
  id: string;
  qty: number;
  name: string;
  note?: string;
  amount: string;
}

const DISHES: FeaturedDish[] = [
  {
    id: 'nyama-choma',
    name: 'Nyama Choma Platter',
    description: 'Slow-grilled goat, kachumbari, ugali bites and house pili-pili.',
    price: 'KSh 1,450',
    tag: 'Bestseller',
    eta: '25–35 min',
    image: '/og-cover.jpg',
  },
  {
    id: 'tilapia',
    name: 'Whole Fried Tilapia',
    description: 'Crispy lakeside tilapia with sukuma wiki and coconut rice.',
    price: 'KSh 980',
    tag: 'Spicy',
    eta: '20–30 min',
    image: '/og-cover.jpg',
  },
  {
    id: 'biriani',
    name: 'Chicken Biriani',
    description: 'Fragrant coastal rice, tender chicken, raita and kachumbari.',
    price: 'KSh 750',
    eta: '15–25 min',
    image: '/og-cover.jpg',
  },
];

const LINES: CheckoutLine[] = [
  { id: 'l1', qty: 2, name: 'Nyama Choma Platter', note: 'Extra pili-pili', amount: 'KSh 2,900' },
  { id: 'l2', qty: 1, name: 'Whole Fried Tilapia', amount: 'KSh 980' },
  { id: 'l3', qty: 1, name: 'Mango Passion Juice', note: 'No ice', amount: 'KSh 250' },
];

/**
 * Spec showcase: responsive featured-dish grid + checkout summary block.
 * Every text element uses the exact hierarchy utilities from the brief.
 */
export function FeaturedMenuShowcase() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
      {/* ---- Hero ---- */}
      <header className="flex max-w-2xl flex-col gap-3">
        <Caption className="font-semibold uppercase tracking-[0.08em] text-success">Today at Mama Njoroge&apos;s</Caption>
        <HeroTitle>Slow fire, bold coastal flavour</HeroTitle>
        <BodyText>Charcoal-grilled classics and fresh sides, cooked to order and delivered hot across town.</BodyText>
      </header>

      {/* ---- Featured dish grid ---- */}
      <section aria-labelledby="featured-h" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle id="featured-h">Featured dishes</SectionTitle>
          <Caption>Prices include VAT · Delivery calculated at checkout</Caption>
        </div>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DISHES.map((d) => (
            <li key={d.id} className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-line/40">
                <Image src={d.image} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover" />
                {d.tag ? (
                  <span className="absolute left-3 top-3 rounded-full bg-accent px-3 py-1 font-sans text-xs leading-[1.4] text-accent-contrast">
                    {d.tag}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 p-5">
                <DishTitle>{d.name}</DishTitle>
                <BodyText>{d.description}</BodyText>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <PriceLabel>{d.price}</PriceLabel>
                  <Caption>{d.eta}</Caption>
                </div>
                <span className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-accent font-sans text-15px leading-[1.2] text-accent-contrast">
                  Add to order
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Checkout summary ---- */}
      <section aria-labelledby="checkout-h" className="card flex flex-col gap-4 p-5 sm:p-6">
        <SectionTitle id="checkout-h">Your order</SectionTitle>
        <ul className="flex flex-col divide-y divide-line">
          {LINES.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <p className="font-sans text-15px leading-[1.2] text-ink">
                  {l.qty} × {l.name}
                </p>
                {l.note ? <Caption>{l.note}</Caption> : null}
              </div>
              <PriceLabel>{l.amount}</PriceLabel>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1.5 border-t border-line pt-4">
          <div className="flex justify-between">
            <BodyText as="dt">Subtotal</BodyText>
            <PriceLabel as="dd">KSh 4,130</PriceLabel>
          </div>
          <div className="flex justify-between">
            <BodyText as="dt">Delivery</BodyText>
            <PriceLabel as="dd">KSh 150</PriceLabel>
          </div>
          <div className="flex justify-between">
            <p className="font-heading text-xl leading-[1.4] text-ink">Total</p>
            <p className="font-sans text-15px leading-[1.2] text-ink">KSh 4,280</p>
          </div>
        </dl>
        <Caption>Pay with M-Pesa on the next step. Prices are confirmed by the kitchen.</Caption>
      </section>
    </div>
  );
}

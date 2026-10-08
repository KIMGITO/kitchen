import Image from 'next/image';
import Link from 'next/link';
import type { Tenant } from '@/lib/tenant/types';
import { BLUR_DATA_URL } from '@/lib/images/blur';
import { formatMoney } from '@/lib/commerce/money';
import { Icon } from '@/components/ui/primitives/Icon';

/** Full-bleed hero: the cover photo becomes a slowly drifting, heavily blurred backdrop, with the sharp photo framed beside the copy. */
export function Hero({ tenant }: { tenant: Tenant }) {
  const sharp = tenant.profile_url ?? tenant.cover_url;
  const modes = [tenant.pickup_enabled ? 'Pickup' : null, tenant.delivery_enabled ? 'Delivery' : null].filter(Boolean) as string[];
  return (
    <section className="relative isolate overflow-hidden bg-brand text-brand-contrast">
      {tenant.cover_url ? (
        <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden">
          <Image src={tenant.cover_url} alt="" fill priority sizes="100vw" quality={30} className="animate-ken-burns object-cover blur-2xl saturate-150" />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 -z-20">
          <div className="animate-blob absolute -left-24 -top-24 size-[28rem] rounded-full bg-accent/25 blur-3xl" />
          <div className="animate-blob absolute -bottom-32 right-0 size-[32rem] rounded-full bg-brand-soft/20 blur-3xl [animation-delay:-6s]" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-brand/95 via-brand/75 to-brand/95" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-12 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pb-28 md:pt-20">
        <div className="rise-in flex flex-col items-start">
          <p className="text-eyebrow uppercase text-brand-contrast/80">Order online</p>
          <h1 className="mt-3 text-display">{tenant.name}</h1>
          {tenant.description ? <p className="mt-4 max-w-xl text-body-lg text-brand-contrast/90">{tenant.description}</p> : null}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/menu" className="group inline-flex h-12 items-center gap-2 rounded-pill bg-accent px-7 text-body-lg font-medium text-accent-contrast shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised active:scale-95">
              Order now <Icon name="arrow-right" size={20} className="transition-transform group-hover:translate-x-1" />
            </Link>
            {modes.length > 0 ? <p className="inline-flex items-center gap-2 rounded-pill border border-white/30 bg-white/10 px-4 py-2 text-label backdrop-blur"><Icon name="package" size={18} />{modes.join(' · ')}</p> : null}
          </div>
          {tenant.delivery_enabled && tenant.delivery_fee_minor > 0 ? <p className="mt-4 text-caption text-brand-contrast/80">Delivery from {formatMoney(tenant.delivery_fee_minor, tenant.currency)}</p> : null}
        </div>

        {sharp ? (
          <div className="relative hidden animate-float md:block" aria-hidden={false}>
            <div className="relative aspect-[4/5] rotate-2 overflow-hidden rounded-xl shadow-raised ring-1 ring-white/25">
              <Image src={sharp} alt={tenant.name} fill priority sizes="(min-width: 768px) 40vw, 0px" placeholder="blur" blurDataURL={BLUR_DATA_URL} className="object-cover" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

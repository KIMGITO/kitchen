"use client";
import React from "react";
export interface Plan {
  key: string;
  name: string;
  price_minor: number;
  original_price_minor?: number;
  badge?: string;
  isPopular?: boolean;
  theme?: "brand" | "accent" | "promo" | "default";
}
export interface Feature {
  key: string;
  description: string;
}
export interface PlanFeatureMapping {
  plan_key: string;
  feature_key: string;
}
export interface PricingPlansProps {
  plans?: Plan[];
  features?: Feature[];
  pf?: PlanFeatureMapping[];
  formatMoney?: (amount: number) => string;
  onSelectPlan?: (planKey: string) => void;
}
type PlanTheme = "brand" | "accent" | "promo";
function resolveTheme(plan: Plan, index: number): PlanTheme {
  if (
    plan.theme === "brand" ||
    plan.theme === "accent" ||
    plan.theme === "promo"
  )
    return plan.theme;
  if (plan.isPopular) return "accent";
  const cycle: PlanTheme[] = ["brand", "promo", "accent"];
  return cycle[index % cycle.length] ?? "brand";
}
const THEME: Record<
  PlanTheme,
  {
    card: string;
    bar: string;
    badge: string;
    check: string;
    btn: string;
  }
> = {
  brand: {
    card: "bg-surface border-line hover:border-brand hover:shadow-raised",
    bar: "bg-brand",
    badge: "bg-brand text-brand-contrast",
    check: "text-brand",
    btn: "bg-brand-soft text-brand hover:bg-brand hover:text-brand-contrast",
  },
  accent: {
    card: "bg-accent-soft border-accent/50 hover:border-accent hover:shadow-glow",
    bar: "bg-accent",
    badge: "bg-accent text-accent-contrast",
    check: "text-accent",
    btn: "bg-accent text-accent-contrast hover:brightness-105 hover:shadow-glow",
  },
  promo: {
    card: "bg-promo-soft border-promo/30 hover:border-promo hover:shadow-raised",
    bar: "bg-promo",
    badge: "bg-promo text-brand-contrast",
    check: "text-promo",
    btn: "bg-promo text-brand-contrast hover:brightness-105",
  },
};
const THEME_POP: Record<
  PlanTheme,
  { card: string; btn: string; ring: string }
> = {
  brand: {
    card: "bg-tint-alt border-brand",
    btn: "bg-brand text-brand-contrast hover:bg-brand/90",
    ring: "ring-2 ring-brand/20",
  },
  accent: {
    card: "bg-accent-soft border-accent",
    btn: "bg-accent text-accent-contrast hover:brightness-105",
    ring: "ring-2 ring-accent/40",
  },
  promo: {
    card: "bg-promo-soft border-promo",
    btn: "bg-promo text-brand-contrast hover:brightness-105",
    ring: "ring-2 ring-promo/25",
  },
};
export const PricingPlans: React.FC<PricingPlansProps> = ({
  plans = [],
  features = [],
  pf = [],
  formatMoney = (amt) => `$${(amt / 100).toFixed(2)}`,
  onSelectPlan,
}) => {
  return (
    <section className="w-full py-8">
      <div className="no-scrollbar flex  flex-col md:flex  w-full gap-6 overflow-x-auto pb-8 pt-6 lg:grid lg:grid-cols-3 lg:overflow-visible">
        {plans.map((p, i) => {
          const tk = resolveTheme(p, i);
          const t = THEME[tk];
          const pop = p.isPopular ? THEME_POP[tk] : null;
          const cardCls = pop ? `${pop.card} hover:shadow-raised` : t.card;
          const btnCls = pop ? pop.btn : t.btn;
          const ringCls = pop ? pop.ring : "";
          const badgeLabel = p.badge ?? (p.isPopular ? "Most popular" : null);
          const planFeatures = features.filter((f) =>
            pf.some((x) => x.plan_key === p.key && x.feature_key === f.key),
          );
          return (
            <div
              key={p.key}
              className={`group relative flex min-w-[300px] flex-1 flex-col justify-between rounded-lg border-2 p-8 shadow-card transition-all duration-300 hover:-translate-y-2 sm:min-w-[340px] lg:min-w-0 ${cardCls} ${ringCls} ${p.isPopular ? "shadow-raised" : ""}`}
            >
              <div
                aria-hidden
                className={`absolute inset-x-8 top-0 h-1 rounded-b-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${t.bar}`}
              />
              {badgeLabel && (
                <span
                  className={`absolute -top-3.5 right-6 rounded-pill px-3.5 py-1 font-sans text-caption uppercase tracking-wider shadow-card ${t.badge}`}
                >
                  {badgeLabel}
                </span>
              )}
              <div>
                <header className="border-b border-line-soft pb-6">
                  <h3 className="font-display text-h3 tracking-tight text-ink">
                    {p.name}
                  </h3>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
                    {p.price_minor > 0 ? (
                      <>
                        <span className="font-display text-h2 tracking-tight text-ink">
                          {formatMoney(p.price_minor)}
                        </span>
                        {p.original_price_minor &&
                          p.original_price_minor > p.price_minor && (
                            <span className="font-display text-body italic text-ink-soft line-through decoration-promo decoration-2 opacity-80">
                              {formatMoney(p.original_price_minor)}
                            </span>
                          )}
                        <span className="font-sans text-body text-ink-soft">
                          / month
                        </span>
                      </>
                    ) : (
                      <span className="font-display text-h3 italic text-ink">
                        Pricing on request
                      </span>
                    )}
                  </div>
                </header>
                <div className="mt-6">
                  <p className="font-sans text-eyebrow uppercase tracking-wider text-ink-soft">
                    What&apos;s included
                  </p>
                  <ul className="mt-4 space-y-3.5">
                    {planFeatures.length > 0 ? (
                      planFeatures.map((f) => (
                        <li
                          key={f.key}
                          className="flex items-start text-start font-heading gap-x-3 font-sans text-body"
                        >
                          <svg
                            className={`h-5 w-5 flex-shrink-0 ${t.check}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="leading-5 text-ink-muted">
                            {f.description}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="font-sans text-body italic text-ink-soft">
                        No specific features listed.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="mt-8 pt-4">
                <button
                  type="button"
                  onClick={() => onSelectPlan?.(p.key)}
                  className={`w-full rounded-md px-5 py-3.5 text-center font-display text-label tracking-wide transition-all duration-200 active:scale-[0.98] ${btnCls}`}
                >
                  {p.price_minor > 0 ? "Select Plan" : "Contact Sales"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
export default PricingPlans;

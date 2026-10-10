import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { getEntitlements } from '@/lib/auth/entitlements';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { BrandingUploaders } from '@/components/kitchen/BrandingUploaders';
import { minorToShillings } from '@/lib/money-input';
import { createClient } from '@/lib/supabase/server';
import { requestPayoutAccount, saveGeneral, saveHours, saveNotificationSettings, saveOrdering, saveSeo, saveTheme } from '@/lib/actions/kitchen';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { OVERRIDABLE_COLORS, FONT_KEYS } from '@/theme/theme';

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
const COLOR_LABEL: Partial<Record<import('@/theme/theme').ColorRole, string>> = { brand: 'Main colour', 'brand-contrast': 'Text on main colour', accent: 'Button colour', 'accent-contrast': 'Text on buttons', tint: 'Soft background', 'tint-alt': 'Quieter background', promo: 'Promotion colour' };
const FONT_LABEL = { jakarta: 'Plus Jakarta Sans', inter: 'Inter', dmSans: 'DM Sans', playfair: 'Playfair Display' };

export default async function Settings() {
  await requirePermission('settings.manage');
  const [t, ent] = await Promise.all([getTenant(), getEntitlements()]);
  const hours = (t.opening_hours ?? {}) as Record<string, { open: string; close: string } | null>;
  const canTheme = ent.hasFeature('custom_theme');
  const canSms = ent.hasFeature('advanced_notifications');
  const supabase = await createClient();
  const [{ data: ns }, { data: accts }] = await Promise.all([
    supabase.from('tenant_notification_settings').select('*').eq('tenant_id', t.id).maybeSingle(),
    supabase.from('payout_accounts').select('msisdn, account_name, status, created_at').eq('tenant_id', t.id).in('status', ['approved', 'pending_review']).order('created_at', { ascending: false }),
  ]);
  const approved = (accts ?? []).find((a) => a.status === 'approved');
  const pending = (accts ?? []).find((a) => a.status === 'pending_review');

  return (
    <div className="flex flex-col gap-12">
      <h1 className="text-h1 text-ink-muted">Settings</h1>
      <p className="text-body text-ink-soft">Storefront address: <strong>{t.primary_hostname}</strong>{ent.hasFeature('custom_domain') ? '' : ' (custom domains are available on the Pro plan)'}.</p>

      <section aria-labelledby="g-h" className="flex flex-col gap-4">
        <h2 id="g-h" className="text-h2 text-ink-muted">Kitchen details</h2>
        <ActionForm action={saveGeneral} submitLabel="Save details">
          <Input label="Kitchen name" name="name" defaultValue={t.name} required />
          <label className="field">
            <span className="field-label">Description</span>
            <textarea name="description" rows={3} maxLength={500} defaultValue={t.description ?? ''} className="field-input rounded-md border border-line bg-surface px-3.5 py-3 text-body text-ink-muted resize-y" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Contact email" name="contact_email" type="email" defaultValue={t.contact_email ?? ''} />
            <PhoneInput label="Contact phone" name="contact_phone" defaultValue={t.contact_phone} />
          </div>
          <Input label="Address" name="address_text" defaultValue={t.address_text ?? ''} />
        </ActionForm>
      </section>

      <section aria-labelledby="b-h" className="flex flex-col gap-4">
        <h2 id="b-h" className="text-h2 text-ink-muted">Images</h2>
        <BrandingUploaders tenantId={t.id} logo={t.logo_url} cover={t.cover_url} profile={t.profile_url} />
      </section>

      <section aria-labelledby="o-h" className="flex flex-col gap-4">
        <h2 id="o-h" className="text-h2 text-ink-muted">Ordering and delivery</h2>
        <ActionForm action={saveOrdering} submitLabel="Save ordering settings">
          <label className="flex items-center gap-2"><input type="checkbox" name="pickup" defaultChecked={t.pickup_enabled} className="size-4 accent-brand" />Offer pickup</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="delivery" defaultChecked={t.delivery_enabled} className="size-4 accent-brand" />Offer delivery</label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Delivery fee (KSh)" name="delivery_fee" inputMode="numeric" defaultValue={minorToShillings(t.delivery_fee_minor)} />
            <Input label="Minimum order (KSh)" name="min_order" inputMode="numeric" defaultValue={minorToShillings(t.min_order_minor)} />
          </div>
          <p className="text-caption text-ink-soft">Customers pay with M-Pesa, which only accepts whole shillings.</p>
        </ActionForm>
      </section>

      <section aria-labelledby="h-h" className="flex flex-col gap-4">
        <h2 id="h-h" className="text-h2 text-ink-muted">Opening hours</h2>
        <ActionForm action={saveHours} submitLabel="Save opening hours">
          <div className="flex flex-col gap-2">
            {DAYS.map(([k, label]) => (
              <div key={k} className="grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2">
                <span className="text-label text-ink-muted">{label}</span>
                <input aria-label={`${label} opens`} type="time" name={`${k}_open`} defaultValue={hours[k]?.open ?? '09:00'} className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted" />
                <input aria-label={`${label} closes`} type="time" name={`${k}_close`} defaultValue={hours[k]?.close ?? '21:00'} className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted" />
                <label className="flex items-center gap-1 text-caption"><input type="checkbox" name={`${k}_closed`} defaultChecked={k in hours && hours[k] === null} className="accent-brand" />Closed</label>
              </div>
            ))}
          </div>
        </ActionForm>
      </section>

      <section aria-labelledby="n-h" className="flex flex-col gap-4">
        <h2 id="n-h" className="text-h2 text-ink-muted">Notifications</h2>
        <ActionForm action={saveNotificationSettings} submitLabel="Save notification settings">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-label text-ink-muted">Customers receive</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="customer_email" defaultChecked={ns?.customer_email ?? true} className="size-4 accent-brand" />Order updates by email</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="customer_sms" defaultChecked={ns?.customer_sms ?? true} className="size-4 accent-brand" />SMS to customers: receipts and payment alerts{canSms ? ', plus ready / declined / cancelled updates' : ' (ready / declined / cancelled updates need the Advanced plan)'}</label>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-label text-ink-muted">Your team receives</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="kitchen_email" defaultChecked={ns?.kitchen_email ?? true} className="size-4 accent-brand" />New-order emails to {t.contact_email ?? 'your contact email (set one above)'}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="kitchen_sms" defaultChecked={ns?.kitchen_sms ?? false} disabled={!canSms} className="size-4 accent-brand" />New-order SMS{canSms ? '' : ' (Advanced plan)'}</label>
            <PhoneInput label="Phone for SMS alerts" name="kitchen_alert_phone" defaultValue={ns?.kitchen_alert_phone} />
          </fieldset>
        </ActionForm>
      </section>

      <section aria-labelledby="pa-h" className="flex flex-col gap-4">
        <h2 id="pa-h" className="text-h2 text-ink-muted">Payout account</h2>
        <p className="text-body text-ink-soft">Your earnings are paid to one M-Pesa number. New or changed numbers are reviewed by the platform team before any money is sent to them.</p>
        {approved ? <p className="text-body text-ink-muted">Approved number: <strong>****{(approved as { msisdn: string }).msisdn.slice(-4)}</strong> ({(approved as { account_name: string }).account_name})</p> : <p className="text-body text-ink-soft">No approved number yet.</p>}
        {pending ? <p role="status" className="rounded-md bg-accent-soft border border-accent/50 px-3 py-2 text-body text-ink">A request for ****{(pending as { msisdn: string }).msisdn.slice(-4)} is waiting for review.</p> : null}
        <ActionForm action={requestPayoutAccount} submitLabel={approved ? 'Request a change' : 'Request approval'} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input label="M-Pesa number" name="msisdn" type="tel" required />
          <Input label="Name on the number" name="account_name" required minLength={2} />
        </ActionForm>
      </section>

      <section aria-labelledby="s-h" className="flex flex-col gap-4">
        <h2 id="s-h" className="text-h2 text-ink-muted">Search listing</h2>
        <ActionForm action={saveSeo} submitLabel="Save search listing">
          <Input label="Page title" name="seo_title" maxLength={70} defaultValue={t.seo_title ?? ''} hint="Up to 70 characters. Shown in Google results." />
          <Input label="Description" name="seo_description" maxLength={160} defaultValue={t.seo_description ?? ''} hint="Up to 160 characters." />
        </ActionForm>
      </section>

      <section aria-labelledby="t-h" className="flex flex-col gap-4">
        <h2 id="t-h" className="text-h2 text-ink-muted">Colours and fonts</h2>
        {!canTheme ? <p className="rounded-lg bg-accent-soft border border-accent/50 px-4 py-4 text-body text-ink">Custom colours and fonts are part of the Advanced plan. Your storefront uses the standard look.</p> : (
          <>
            <ActionForm action={saveTheme} submitLabel="Save branding">
              <div className="grid gap-4 sm:grid-cols-3">
                {OVERRIDABLE_COLORS.map((c) => (
                  <label key={c} className="flex flex-col gap-1.5">
                    <span className="text-label text-ink-muted">{COLOR_LABEL[c] ?? c}</span>
                    <input type="color" name={`color_${c}`} defaultValue={(t.theme.colors[c] ?? '#000000').startsWith('#') ? (t.theme.colors[c] ?? '#000000') : `#${t.theme.colors[c] ?? '000000'}`} className="h-11 w-full cursor-pointer rounded-md border border-line bg-surface" />
                  </label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-muted">Headline font</span>
                  <select name="font_display" defaultValue={t.theme.fonts.display} className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted">
                    {FONT_KEYS.map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-muted">Body font</span>
                  <select name="font_body" defaultValue={t.theme.fonts.body} className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted">
                    {FONT_KEYS.map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
                  </select>
                </label>
              </div>
            </ActionForm>
            <ActionForm action={saveTheme} submitLabel="Reset to the standard look" variant="outline">
              <input type="hidden" name="reset" value="1" />
            </ActionForm>
          </>
        )}
      </section>
    </div>
  );
}

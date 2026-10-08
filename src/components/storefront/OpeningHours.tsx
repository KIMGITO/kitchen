const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']] as const;
export function OpeningHours({ hours }: { hours: Record<string, unknown> }) {
  const set = DAYS.filter(([k]) => k in hours);
  if (set.length === 0) return null;
  return (
    <dl className="mt-3 grid max-w-xs grid-cols-[3rem_1fr] gap-y-0.5">
      {set.map(([k, label]) => { const h = hours[k] as { open: string; close: string } | null;
        return (<div key={k} className="contents"><dt>{label}</dt><dd>{h ? `${h.open} – ${h.close}` : 'Closed'}</dd></div>); })}
    </dl>
  );
}

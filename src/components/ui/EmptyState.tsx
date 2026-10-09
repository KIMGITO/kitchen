import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './primitives/Icon';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-line/60 bg-surface px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-line/30 text-ink-soft">
        <Icon name="help-circle" size={18} />
      </div>
      <h3 className="text-h3 text-ink-muted">{title}</h3>
      {description ? <p className="text-body text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description }: { title?: string; description?: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger">
        <Icon name="alert-triangle" size={18} />
      </div>
      <h3 className="text-h3 text-danger">{title}</h3>
      {description ? <p className="text-body text-ink-muted">{description}</p> : null}
    </div>
  );
}

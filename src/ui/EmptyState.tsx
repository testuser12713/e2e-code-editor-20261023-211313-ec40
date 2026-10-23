import type { ReactNode } from 'react';

/**
 * A quiet placeholder for an empty region — no folder, no results — with an
 * optional action (design: `.empty-state`, welcome.html sidebar).
 */
export function EmptyState({ title, children, action, testId }: { title: string; children?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="empty-state" data-testid={testId}>
      <p>
        <strong>{title}</strong>
      </p>
      {children ? <p>{children}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

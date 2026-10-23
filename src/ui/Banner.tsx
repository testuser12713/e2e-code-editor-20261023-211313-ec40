import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface BannerProps {
  icon?: IconName;
  children: ReactNode;
  /** Buttons on the right, primary first (design: `.banner-actions`). */
  actions?: ReactNode;
  testId?: string;
}

/**
 * Warning strip at the top of the editor area (design: `.banner.banner-warning`,
 * file-conflict.html with actions, large-file.html read-only without).
 */
export function Banner({ icon = 'warning', children, actions, testId }: BannerProps) {
  return (
    <div className="banner banner-warning" role="alert" data-testid={testId}>
      <Icon name={icon} />
      <div className="banner-text">{children}</div>
      {actions ? <div className="banner-actions">{actions}</div> : null}
    </div>
  );
}

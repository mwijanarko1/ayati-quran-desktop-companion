import type { SVGProps } from 'react';

export type OnboardingIconName =
  | 'chat'
  | 'check'
  | 'cloud'
  | 'command'
  | 'eye'
  | 'globe'
  | 'history'
  | 'key'
  | 'lock'
  | 'mouse'
  | 'power'
  | 'shield'
  | 'spinner'
  | 'verified'
  | 'warning'
  | 'window';

interface OnboardingIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: OnboardingIconName;
  size?: string;
}

export function OnboardingIcon({ name, size = '1.25rem', className, ...props }: OnboardingIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {renderIconPath(name)}
    </svg>
  );
}

function renderIconPath(name: OnboardingIconName) {
  switch (name) {
    case 'chat':
      return (
        <>
          <path d="M5 7.5A4.5 4.5 0 0 1 9.5 3h5A4.5 4.5 0 0 1 19 7.5v3A4.5 4.5 0 0 1 14.5 15H11l-4 4v-4.25A4.5 4.5 0 0 1 5 11z" />
          <path d="M9 8h6M9 11h3.5" />
        </>
      );
    case 'check':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12.3 2.2 2.2 4.8-5" />
        </>
      );
    case 'cloud':
      return (
        <>
          <path d="M7 17.5h9.5a3.5 3.5 0 0 0 .8-6.9A5.7 5.7 0 0 0 6.2 9.3 4.1 4.1 0 0 0 7 17.5Z" />
          <path d="m10 13 2 2 3.5-4" />
        </>
      );
    case 'command':
      return (
        <>
          <path d="M9 9H7.5A2.5 2.5 0 1 1 10 6.5V18a2.5 2.5 0 1 1-2.5-2.5H18A2.5 2.5 0 1 1 15.5 18V6.5A2.5 2.5 0 1 1 18 9Z" />
          <path d="M9 9h6v6H9z" />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      );
    case 'globe':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.2 2.5 3.2 5.3 3.2 8.5s-1 6-3.2 8.5M12 3.5C9.8 6 8.8 8.8 8.8 12s1 6 3.2 8.5" />
        </>
      );
    case 'history':
      return (
        <>
          <path d="M5 6.5A8 8 0 1 1 4 15" />
          <path d="M4.5 3.5v4h4M12 8v4.5l3 1.8" />
        </>
      );
    case 'key':
      return (
        <>
          <circle cx="8" cy="14" r="3.5" />
          <path d="m11 12 8-8M16 7l2 2M14 9l2 2" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect height="9" rx="2" width="12" x="6" y="11" />
          <path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11M12 15v2" />
        </>
      );
    case 'mouse':
      return (
        <>
          <rect height="13" rx="5" width="9" x="7.5" y="4" />
          <path d="M12 4v5M8 10h8M12 20v-3" />
        </>
      );
    case 'power':
      return (
        <>
          <path d="M12 3v8" />
          <path d="M7.2 6.8a7 7 0 1 0 9.6 0" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M12 3.5 5.5 6v5.3c0 4.1 2.6 7.7 6.5 9.2 3.9-1.5 6.5-5.1 6.5-9.2V6z" />
          <path d="m9.5 12.3 1.8 1.8 3.5-4" />
        </>
      );
    case 'spinner':
      return (
        <>
          <path d="M12 3a9 9 0 1 0 9 9" />
          <path d="M21 3v6h-6" />
        </>
      );
    case 'verified':
      return (
        <>
          <path d="m12 3 2.3 2.1 3.1-.2.5 3.1 2.4 2-1.4 2.8.7 3-3 .9-1.7 2.6-2.9-1.2-2.9 1.2-1.7-2.6-3-.9.7-3L3.7 10l2.4-2 .5-3.1 3.1.2z" />
          <path d="m8.8 12.2 2.1 2.1 4.3-4.6" />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="M12 3.5 21 19H3z" />
          <path d="M12 9v4M12 16.5h.01" />
        </>
      );
    case 'window':
      return (
        <>
          <rect height="14" rx="2" width="18" x="3" y="5" />
          <path d="M3 9h18M7 7h.01M10 7h.01" />
        </>
      );
    default:
      return null;
  }
}

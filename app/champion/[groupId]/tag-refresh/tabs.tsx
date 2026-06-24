// app/champion/[groupId]/tag-refresh/tabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TagRefreshTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const base = `/champion/${groupId}/tag-refresh`;
  const tabs = [
    { label: 'Build', href: base },
    { label: 'Library', href: `${base}/library` },
    { label: 'Insights', href: `${base}/insights` },
  ];
  return (
    <div className="flex gap-6 border-b border-white/[0.08] mb-6">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`pb-2.5 text-sm font-semibold ${active ? 'text-white border-b-2 border-accent' : 'text-muted'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

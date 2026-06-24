// app/champion/[groupId]/tag-refresh/layout.tsx
import { TagRefreshTabs } from './tabs';

export default async function TagRefreshLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Tag Refresh</h1>
      <p className="text-sm text-muted mt-1 mb-4">
        Build a word bank and push a quick falling-words game to your members.
      </p>
      <TagRefreshTabs groupId={groupId} />
      {children}
    </div>
  );
}

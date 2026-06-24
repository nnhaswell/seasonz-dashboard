// app/champion/[groupId]/tag-refresh/library/page.tsx
import { listBanks } from '../actions';
import { BankActions } from './bank-actions';

export default async function LibraryPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const banks = await listBanks(groupId);

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-bold text-white mb-4">Library</h2>

      {banks.length === 0 && (
        <div className="card text-sm text-muted">
          No saved banks yet. Build a word bank and hit "Save to Library".
        </div>
      )}

      <div className="flex flex-col gap-2">
        {banks.map((b) => (
          <div key={b.id} className="card flex items-center justify-between !py-3">
            <div>
              <div className="text-sm font-semibold text-white">{b.name}</div>
              <div className="text-xs text-muted mt-0.5">
                {b.wordCount} words · {b.source === 'ai' ? 'AI' : 'manual'}
              </div>
            </div>
            <BankActions groupId={groupId} bankId={b.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

// app/champion/[groupId]/tag-refresh/library/bank-actions.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteBank } from '../actions';

export function BankActions({ groupId, bankId }: { groupId: string; bankId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      try {
        await deleteBank(bankId);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/champion/${groupId}/tag-refresh?bank=${bankId}`}
        className="text-sm font-semibold text-accent"
      >
        Use
      </Link>
      <button onClick={onDelete} disabled={pending} className="text-sm text-faint hover:text-danger disabled:opacity-50">
        {pending ? '…' : 'Delete'}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

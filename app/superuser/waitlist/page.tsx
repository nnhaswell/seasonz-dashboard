import { createClient } from '@/lib/supabase/server'

// Waitlist signups from the public landing page. RLS restricts SELECT to
// superusers, so this list is private to admins.
export default async function WaitlistPage() {
  const supabase = await createClient()

  const { data: entries, error } = await supabase
    .from('waitlist')
    .select('id, email, name, source, created_at')
    .order('created_at', { ascending: false })

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const csvHref =
    'data:text/csv;charset=utf-8,' +
    encodeURIComponent(
      'email,name,joined\n' +
        (entries ?? [])
          .map((e: any) => `${e.email},${(e.name ?? '').replace(/,/g, ' ')},${e.created_at}`)
          .join('\n'),
    )

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Waitlist</h1>
          <p className="text-muted text-sm mt-1">
            {entries?.length ?? 0} {(entries?.length ?? 0) === 1 ? 'signup' : 'signups'} from seasonz.ai
          </p>
        </div>
        {!!entries?.length && (
          <a
            href={csvHref}
            download="seasonz-waitlist.csv"
            className="text-sm text-accent hover:underline"
          >
            Export CSV
          </a>
        )}
      </div>

      {error ? (
        <p className="text-past text-sm">{error.message}</p>
      ) : !entries?.length ? (
        <div className="card text-center py-12">
          <p className="text-muted">No signups yet.</p>
          <p className="text-faint text-sm mt-1">Entries from the landing page appear here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Name</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{e.email}</td>
                  <td className="px-4 py-3 text-sm text-muted">{e.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-faint text-right">{fmt(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

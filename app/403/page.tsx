export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-4xl font-bold text-accent">✦</span>
      <h1 className="text-2xl font-bold text-white">Access restricted</h1>
      <p className="text-muted max-w-sm">
        This dashboard is only available to Seasons Champions and platform admins.
        If you think this is a mistake, reach out to Nathan.
      </p>
      <a
        href="/login"
        className="mt-2 text-sm text-accent hover:underline"
      >
        Back to login
      </a>
    </div>
  )
}

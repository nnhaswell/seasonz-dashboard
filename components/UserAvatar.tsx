interface UserAvatarProps {
  avatarUrl?: string | null
  name?: string | null
  size?: number
  className?: string
}

export function UserAvatar({ avatarUrl, name, size = 40, className = '' }: UserAvatarProps) {
  const initial = name ? name.trim()[0]?.toUpperCase() ?? '?' : '?'
  const px = `${size}px`

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        style={{ width: px, height: px }}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{ width: px, height: px, fontSize: `${Math.round(size * 0.38)}px` }}
      className={`rounded-full bg-surface-high flex items-center justify-center font-semibold text-muted select-none shrink-0 ${className}`}
    >
      {initial}
    </div>
  )
}

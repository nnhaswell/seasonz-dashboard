'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  userName: string
  groups: Array<{ id: string; name: string }>
}

export function PromoteChampionButton({ userId, userName, groups }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handlePromote() {
    if (!selectedGroupId) {
      setError('Please select a group')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Insert or update group membership with champion role
      const { error: insertError } = await supabase
        .from('group_members')
        .upsert({
          group_id: selectedGroupId,
          user_id: userId,
          role: 'champion',
          joined_at: new Date().toISOString(),
        }, {
          onConflict: 'group_id,user_id'
        })

      if (insertError) throw insertError

      // Success - refresh the page
      setIsOpen(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to promote user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="
          px-3 py-1.5 text-xs font-medium
          bg-accent/10 text-accent rounded-lg
          hover:bg-accent/20 transition-colors
        "
      >
        Make Champion
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-low border border-white/[0.08] rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-white mb-2">
              Promote to Champion
            </h2>
            <p className="text-sm text-muted mb-4">
              Make <span className="text-white font-medium">{userName}</span> a champion of:
            </p>

            {/* Group Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-2">
                Select Group
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="
                  w-full bg-surface-high border border-white/[0.08] rounded-lg
                  px-4 py-2.5 text-white text-sm
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                "
              >
                <option value="">Choose a group...</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-past/10 border border-past/20 rounded-lg">
                <p className="text-sm text-past">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={loading}
                className="
                  flex-1 bg-surface-high text-white text-sm font-medium
                  rounded-lg px-4 py-2.5 border border-white/[0.08]
                  hover:border-white/20 transition-colors
                  disabled:opacity-40
                "
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={loading || !selectedGroupId}
                className="
                  flex-1 bg-accent text-accent-ink font-semibold text-sm
                  rounded-lg px-4 py-2.5
                  hover:opacity-90 transition-opacity
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                {loading ? 'Promoting...' : 'Make Champion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

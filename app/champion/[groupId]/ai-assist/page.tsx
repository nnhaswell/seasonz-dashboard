'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ groupId: string }>
}

export default function AIAssistPage({ params }: Props) {
  const [groupId, setGroupId] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const router = useRouter()

  // Unwrap params
  useState(() => {
    params.then(p => setGroupId(p.groupId))
  })

  const templates = [
    {
      id: 'weekly-checkin',
      title: 'Weekly Check-in',
      description: 'A warm, engaging weekly update to your group',
      icon: '✦',
      prompt: `Hey everyone! 👋

Hope you're all doing well this week. I wanted to check in and see how things are going.

What's been on your mind lately? Any wins to celebrate or challenges you're navigating?

Remember, this is a judgment-free space to share where you're at - whether that's Past reflections, Present wins, or Future dreams.

Looking forward to hearing from you! 🌟`,
    },
    {
      id: 'inactive-nudge',
      title: 'Re-engage Inactive Members',
      description: 'Gently bring back members who have been quiet',
      icon: '💭',
      prompt: `Hey there!

I noticed we haven't heard from you in a little while, and I wanted to reach out.

No pressure at all - life gets busy! But I wanted to let you know that this space is here whenever you're ready to share what's going on in your season.

Is there anything I can do to make this group more valuable for you?

We'd love to hear from you when the time feels right. 💙`,
    },
    {
      id: 'celebration',
      title: 'Celebrate a Win',
      description: 'Acknowledge and amplify member achievements',
      icon: '🎉',
      prompt: `Amazing news to share with the group! 🎉

I wanted to take a moment to celebrate [member name]'s recent win: [describe their achievement].

This is exactly the kind of progress we love to see here. It takes courage to share your journey, and even more to take action on it.

Let's all send some encouragement their way! Drop a message below if this inspires you or if you've had a similar experience.

Keep shining! ✨`,
    },
    {
      id: 'discussion-starter',
      title: 'Start a Discussion',
      description: 'Spark meaningful conversation in the group',
      icon: '💬',
      prompt: `Question for the group! 🤔

I've been thinking about [topic] and wanted to get your perspectives.

[Pose a thoughtful question related to transitions, seasons, or personal growth]

Share your thoughts below - I'm curious to hear how you're all approaching this!

No right or wrong answers, just honest conversation. 💭`,
    },
    {
      id: 'resources-share',
      title: 'Share Resources',
      description: 'Provide valuable tools or content to your group',
      icon: '📚',
      prompt: `Resource drop! 📚

I came across something this week that I think could be really valuable for this group:

[Share the resource - article, tool, book, podcast, etc.]

Why I think it's relevant: [Brief explanation of how it connects to the group's themes]

Has anyone else found helpful resources lately? Feel free to share below!

Hope this is useful! 🙌`,
    },
    {
      id: 'reflection-prompt',
      title: 'Reflection Prompt',
      description: 'Guide members through meaningful self-reflection',
      icon: '🌅',
      prompt: `Time for some reflection! 🌅

I want to invite everyone to pause and think about this:

[Your reflection question - could be about Past lessons, Present challenges, or Future aspirations]

Take your time with this one. There's no rush - share when it feels right.

Sometimes the most powerful insights come from slowing down and really sitting with a question.

Looking forward to reading your thoughts. 💫`,
    },
  ]

  function handleUseTemplate(template: typeof templates[0]) {
    setSelectedTemplate(template.prompt)
  }

  function handleGoToMessaging() {
    router.push(`/champion/${groupId}/messaging`)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AI Writing Assist</h1>
        <p className="text-muted text-sm mt-1">
          Ready-to-use templates and prompts for engaging with your group
        </p>
      </div>

      {/* Selected Template Preview */}
      {selectedTemplate && (
        <div className="card mb-6 bg-accent/5 border-accent">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Preview</h3>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-xs text-muted hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-surface-high rounded-lg p-4 mb-4">
            <p className="text-sm text-white whitespace-pre-line">
              {selectedTemplate}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(selectedTemplate)
              }}
              className="
                flex-1 bg-surface-high text-white text-sm font-medium
                rounded-lg px-4 py-2.5 border border-white/[0.08]
                hover:border-white/20 transition-colors
              "
            >
              Copy to clipboard
            </button>
            <button
              onClick={handleGoToMessaging}
              className="
                flex-1 bg-accent text-accent-ink font-semibold text-sm
                rounded-lg px-4 py-2.5
                hover:opacity-90 transition-opacity
              "
            >
              Go to messaging →
            </button>
          </div>
        </div>
      )}

      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-4">
        {templates.map(template => (
          <button
            key={template.id}
            onClick={() => handleUseTemplate(template)}
            className={`
              card text-left hover:border-accent/50 transition-all
              ${selectedTemplate === template.prompt ? 'border-accent bg-accent/5' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{template.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white mb-1">
                  {template.title}
                </h3>
                <p className="text-sm text-muted">
                  {template.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Tips Section */}
      <div className="card mt-6 bg-surface">
        <h3 className="text-sm font-semibold text-white mb-3">
          Tips for personalizing templates
        </h3>
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <span className="text-accent shrink-0">•</span>
            <span>Add specific details about your group's recent conversations</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent shrink-0">•</span>
            <span>Reference members by name when celebrating wins</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent shrink-0">•</span>
            <span>Share your own experiences to build authenticity</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent shrink-0">•</span>
            <span>Adjust the tone to match your natural voice</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

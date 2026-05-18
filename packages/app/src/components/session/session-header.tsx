import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { ReportGenerateButton } from "@/pages/session/composer/report-generate-button"
import type { ReportSkillCommand } from "@/pages/session/report-session-link"

type SessionHeaderProps = {
  skills: ReportSkillCommand[]
  hasReport: boolean
  generating: boolean
  onGenerate: (skillName: string) => Promise<unknown> | void
}

export function SessionHeader(props: SessionHeaderProps) {
  const [rightMount, setRightMount] = createSignal<HTMLElement | null>(null)
  onMount(() => {
    let raf = 0
    const tick = () => {
      const el = document.getElementById("opencode-titlebar-right")
      if (el) {
        setRightMount(el)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    onCleanup(() => cancelAnimationFrame(raf))
  })

  return (
    <Show when={rightMount()}>
      {(mount) => (
        <Portal mount={mount()}>
          <div class="flex items-center gap-2">
            <Show when={props.hasReport && props.skills.length > 0}>
              <ReportGenerateButton
                skills={props.skills}
                onGenerate={props.onGenerate}
                variant="header"
                disabled={props.generating}
              />
            </Show>
          </div>
        </Portal>
      )}
    </Show>
  )
}

import { Button } from "@opencode-ai/ui/button"
import { Popover } from "@opencode-ai/ui/popover"
import { Spinner } from "@opencode-ai/ui/spinner"
import { For, Show, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ReportSkillCommand } from "@/pages/session/report-session-link"

type ReportGenerateButtonProps = {
  skills: ReportSkillCommand[]
  onGenerate: (skillName: string) => Promise<unknown> | void
  variant?: "center" | "header"
  disabled?: boolean
}

export function ReportGenerateButton(props: ReportGenerateButtonProps) {
  const language = useLanguage()
  const [running, setRunning] = createSignal(false)
  const [menuOpen, setMenuOpen] = createSignal(false)

  const isHeader = () => props.variant === "header"
  const label = () =>
    isHeader() ? language.t("session.report.regenerate") : language.t("session.report.generate")
  const runningLabel = () => language.t("session.report.starting")

  const trigger = async (skillName: string) => {
    if (running() || props.disabled) return
    setRunning(true)
    try {
      await props.onGenerate(skillName)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Show
      when={props.skills.length > 1}
      fallback={
        <SingleButton
          isHeader={isHeader()}
          label={running() ? runningLabel() : label()}
          running={running()}
          disabled={!!props.disabled || running() || props.skills.length === 0}
          onClick={() => {
            const first = props.skills[0]
            if (!first) return
            void trigger(first.name)
          }}
        />
      }
    >
      <Popover
        open={menuOpen()}
        onOpenChange={setMenuOpen}
        triggerAs={Button}
        triggerProps={{
          variant: isHeader() ? "ghost" : "primary",
          size: isHeader() ? "small" : "large",
          class: isHeader()
            ? "h-6 px-2.5 text-12-medium text-text-base"
            : "w-full h-12 text-15-medium justify-center",
          disabled: !!props.disabled || running(),
        }}
        trigger={
          <Show when={running()} fallback={label()}>
            <span class="inline-flex items-center gap-2">
              <Spinner class="size-4" />
              {runningLabel()}
            </span>
          </Show>
        }
        class="min-w-[220px] p-1 rounded-md border border-border-weak-base bg-background-base shadow-md"
        gutter={6}
        placement={isHeader() ? "bottom-end" : "top"}
      >
        <div class="flex flex-col">
          <div class="px-2 py-1 text-11-regular text-text-weak">
            {language.t("session.report.menuHeading")}
          </div>
          <For each={props.skills}>
            {(skill) => (
              <button
                type="button"
                class="flex flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-background-stronger"
                onClick={() => {
                  setMenuOpen(false)
                  void trigger(skill.name)
                }}
              >
                <span class="text-13-medium text-text-base">{skill.title ?? skill.name}</span>
                <Show when={skill.description}>
                  <span class="text-11-regular text-text-weak line-clamp-2">{skill.description}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Popover>
    </Show>
  )
}

function SingleButton(props: {
  isHeader: boolean
  label: string
  running: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant={props.isHeader ? "ghost" : "primary"}
      size={props.isHeader ? "small" : "large"}
      class={
        props.isHeader
          ? "h-6 px-2.5 text-12-medium text-text-base"
          : "w-full h-12 text-15-medium justify-center"
      }
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Show when={props.running} fallback={props.label}>
        <span class="inline-flex items-center gap-2">
          <Spinner class="size-4" />
          {props.label}
        </span>
      </Show>
    </Button>
  )
}

import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Markdown } from "@opencode-ai/ui/markdown"
import { isMdxPath, MdxViewer } from "@opencode-ai/ui/mdx"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { getFilename } from "@opencode-ai/shared/util/path"
import { FileProvider, useFile } from "@/context/file"
import { useLanguage } from "@/context/language"

function FileView() {
  const params = useParams()
  const navigate = useNavigate()
  const file = useFile()
  const language = useLanguage()

  const path = createMemo(() => {
    const raw = params.path ?? ""
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })

  const [raw, setRaw] = createSignal(false)

  createEffect(() => {
    const p = path()
    if (!p) return
    setRaw(false)
    void file.load(p)
  })

  const state = createMemo(() => {
    const p = path()
    if (!p) return undefined
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const isMarkdown = createMemo(() => /\.(md|markdown|mdx)$/i.test(path()))
  const isMdx = createMemo(() => isMdxPath(path()))

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(`/${params.dir}/session`, { replace: true })
  }

  return (
    <div class="flex flex-col size-full bg-background-base">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base shrink-0">
        <IconButton
          icon="chevron-left"
          variant="ghost"
          class="size-7 rounded-md"
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        />
        <span class="text-14-medium text-text-strong truncate" title={path()}>
          {getFilename(path()) || path()}
        </span>
        <Show when={path() && getFilename(path()) !== path()}>
          <span class="text-12-regular text-text-weak truncate">{path()}</span>
        </Show>
        <Show when={state()?.loaded && isMarkdown()}>
          <div class="ml-auto flex items-center gap-1 rounded-md border border-border-weak bg-background-stronger p-0.5">
            <IconButton
              icon="eye"
              size="small"
              variant={raw() ? "ghost" : "secondary"}
              class="size-6 rounded-md"
              onClick={() => setRaw(false)}
              aria-label="Preview markdown"
            />
            <IconButton
              icon="code-lines"
              size="small"
              variant={raw() ? "secondary" : "ghost"}
              class="size-6 rounded-md"
              onClick={() => setRaw(true)}
              aria-label="Show raw markdown"
            />
          </div>
        </Show>
      </div>
      <ScrollView class="flex-1 min-h-0">
        <Switch>
          <Match when={state()?.loaded}>
            <Show
              when={isMarkdown() && !raw()}
              fallback={
                <pre class="px-6 pt-6 pb-40 text-13-regular text-text-base whitespace-pre-wrap break-words select-text">
                  {contents()}
                </pre>
              }
            >
              <Show
                when={isMdx()}
                fallback={
                  <div class="px-6 pt-6 pb-40 select-text">
                    <Markdown text={contents()} class="max-w-200 mx-auto" />
                  </div>
                }
              >
                <div class="px-6 pt-6 pb-40 select-text">
                  <MdxViewer text={contents()} path={path() || undefined} />
                </div>
              </Show>
            </Show>
          </Match>
          <Match when={state()?.loading}>
            <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
          </Match>
          <Match when={state()?.error}>
            {(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}
          </Match>
        </Switch>
      </ScrollView>
    </div>
  )
}

export default function FileViewRoute() {
  return (
    <FileProvider>
      <FileView />
    </FileProvider>
  )
}

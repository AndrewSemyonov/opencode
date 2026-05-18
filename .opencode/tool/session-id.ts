// Кастомный opencode-tool: возвращает ID текущей сессии (чата).
// Без зависимости от @opencode-ai/plugin, чтобы инструмент грузился
// в любой рабочей директории (где может не быть node_modules).
// opencode регистрирует default-экспорт как инструмент: { description, args, execute }.

export default {
  description:
    "Возвращает ID текущей сессии opencode. Вызови этот инструмент перед сохранением отчёта и подставь полученное значение в поле sessionId во frontmatter .mdx-отчёта, чтобы по отчёту можно было открыть исходный чат.",
  args: {} as Record<string, never>,
  async execute(_args: Record<string, never>, context: { sessionID: string }) {
    return context.sessionID
  },
}

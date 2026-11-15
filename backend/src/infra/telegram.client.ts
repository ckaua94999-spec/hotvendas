export class TelegramClient {
  constructor(private token: string) {}

  private url(method: string) {
    return `https://api.telegram.org/bot${this.token}/${method}`
  }

  async call(method: string, body: Record<string, unknown>) {
    const response = await fetch(this.url(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return this.read(response)
  }

  async sendPhoto(chatId: string, png: Buffer, caption: string) {
    const form = new FormData()
    form.set('chat_id', chatId)
    form.set('caption', caption)
    form.set('photo', new Blob([new Uint8Array(png)]), 'qr.png')
    return this.read(await fetch(this.url('sendPhoto'), { method: 'POST', body: form }))
  }

  async sendVideoFile(chatId: string, file: Buffer, filename: string, caption: string) {
    const form = new FormData()
    form.set('chat_id', chatId)
    form.set('caption', caption)
    form.set('video', new Blob([new Uint8Array(file)]), filename)
    return this.read(await fetch(this.url('sendVideo'), { method: 'POST', body: form }))
  }

  private async read(response: Response) {
    const json = (await response.json()) as { ok: boolean; description?: string; result?: any; error_code?: number }
    if (!json.ok) {
      const error = new Error(json.description || 'Falha no Telegram') as Error & { blocked?: boolean }
      error.blocked = json.error_code === 403 || /blocked|deactivated/i.test(json.description || '')
      throw error
    }
    return json.result
  }
}

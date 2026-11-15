import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { AuthService } from '../app/auth.service'
import { BotService } from '../app/bot.service'
import { DownsellService } from '../app/downsell.service'
import { PaymentService } from '../app/payment.service'
import { ReportService } from '../app/report.service'
import { SettingsService } from '../app/settings.service'
import { PrismaService } from '../infra/prisma.service'

@Controller()
export class PanelController {
  constructor(
    private auth: AuthService,
    private reports: ReportService,
    private payments: PaymentService,
    private bot: BotService,
    private prisma: PrismaService,
    private settings: SettingsService,
    private downsell: DownsellService,
  ) {}

  private session(req: any, owner = false) {
    const session = this.auth.fromCookie(req.headers.cookie)
    if (!session) throw new UnauthorizedException()
    if (owner && session.role !== 'owner') throw new ForbiddenException()
    return session
  }

  @Get('health')
  health() {
    return { ok: true }
  }

  @Get('dashboard')
  dashboard(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.dashboard(query)
  }

  @Get('series')
  series(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.series(query)
  }

  @Get('funnel')
  funnel(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.funnel(query)
  }

  @Get('users')
  users(@Req() req: any, @Query('q') q?: string) {
    this.session(req)
    return this.reports.users(q)
  }

  @Get('campaigns')
  campaigns(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.campaigns(query)
  }

  @Get('recovery')
  recovery(@Req() req: any) {
    this.session(req)
    return this.reports.recovery()
  }

  @Get('downsell')
  downsellView(@Req() req: any) {
    this.session(req)
    return this.downsell.view()
  }

  @Put('downsell')
  saveDownsell(@Req() req: any, @Body() body: any) {
    const session = this.session(req, true)
    return this.downsell.save(session.sub, body)
  }

  @Get('orders')
  orders(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.orders(query)
  }

  @Get('orders/:id')
  order(@Req() req: any, @Param('id') id: string) {
    this.session(req)
    return this.reports.order(id)
  }

  @Post('orders/:id/reconcile')
  reconcile(@Req() req: any, @Param('id') id: string) {
    const session = this.session(req)
    return this.payments.reconcile(id, session.sub)
  }

  @Get('deliveries')
  deliveries(@Req() req: any) {
    this.session(req)
    return this.prisma.delivery.findMany({ include: { order: { include: { user: true } }, attemptsLog: true }, orderBy: { id: 'desc' }, take: 200 })
  }

  @Post('deliveries/:id/reprocess')
  reprocess(@Req() req: any, @Param('id') id: string) {
    const session = this.session(req)
    return this.bot.reprocess(id, session.sub)
  }

  @Get('finance/summary')
  summary(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.finance(query)
  }

  @Get('finance/transactions')
  transactions(@Req() req: any, @Query() query: any) {
    this.session(req)
    return this.reports.transactions(query)
  }

  @Get('expenses')
  expenses(@Req() req: any) {
    this.session(req)
    return this.reports.expenses()
  }

  @Post('expenses')
  createExpense(@Req() req: any, @Body() body: any) {
    const session = this.session(req, true)
    return this.reports.saveExpense(session.sub, body)
  }

  @Patch('expenses/:id')
  updateExpense(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const session = this.session(req, true)
    return this.reports.saveExpense(session.sub, body, id)
  }

  @Delete('expenses/:id')
  async deleteExpense(@Req() req: any, @Param('id') id: string) {
    const session = this.session(req, true)
    await this.reports.deleteExpense(session.sub, id)
    return { ok: true }
  }

  @Get('settings')
  viewSettings(@Req() req: any) {
    this.session(req)
    return this.reports.settingsView()
  }

  @Put('settings')
  saveSettings(@Req() req: any, @Body() body: any) {
    const session = this.session(req, true)
    return this.reports.saveSettings(session.sub, body)
  }

  @Post('settings/video')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  async video(@Req() req: any, @UploadedFile() file: { buffer: Buffer } | undefined, @Body() body: { kind?: string }) {
    const session = this.session(req, true)
    if (!file) return { error: 'Arquivo ausente' }
    const kind = body.kind === 'delivery' ? 'delivery' : 'presentation'
    const dir = join(process.cwd(), 'storage', 'videos')
    await mkdir(dir, { recursive: true })
    const filename = `${kind}-${Date.now()}.mp4`
    const path = join(dir, filename)
    await writeFile(path, file.buffer)
    const current = await this.prisma.product.findFirst({ orderBy: { active: 'desc' } })
    const data = kind === 'delivery' ? { deliveryPath: path, deliveryFileId: null } : { presentationPath: path, presentationFileId: null }
    const product = current
      ? await this.prisma.product.update({ where: { id: current.id }, data })
      : await this.prisma.product.create({ data: { name: 'Produto', priceCents: 0, ...data } })
    await this.settings.audit(session.sub, 'upload', 'product', product.id, null, { kind })
    return { ok: true, kind }
  }

  @Get('exports/:file')
  async download(@Req() req: any, @Param('file') file: string, @Query() query: any, @Res() res: any) {
    this.session(req)
    const dot = file.lastIndexOf('.')
    const resource = file.slice(0, dot)
    const ext = file.slice(dot + 1)
    if (ext === 'xlsx') {
      const buffer = await this.reports.xlsx(resource, query)
      res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('content-disposition', `attachment; filename="${file}"`)
      res.send(buffer)
      return
    }
    const csv = await this.reports.csv(resource, query)
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="${file}"`)
    res.send(csv)
  }
}

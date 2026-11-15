import { Module } from '@nestjs/common'
import { AuthService } from './app/auth.service'
import { BotService } from './app/bot.service'
import { DownsellService } from './app/downsell.service'
import { PaymentService } from './app/payment.service'
import { RecoveryService } from './app/recovery.service'
import { ReportService } from './app/report.service'
import { SettingsService } from './app/settings.service'
import { AuthController } from './api/auth.controller'
import { HookController } from './api/hook.controller'
import { PanelController } from './api/panel.controller'
import { PrismaService } from './infra/prisma.service'

@Module({
  controllers: [AuthController, HookController, PanelController],
  providers: [PrismaService, SettingsService, AuthService, PaymentService, BotService, RecoveryService, DownsellService, ReportService],
  exports: [PrismaService, SettingsService, AuthService, PaymentService, BotService, RecoveryService, DownsellService, ReportService],
})
export class AppModule {}

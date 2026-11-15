import 'reflect-metadata'
import './main'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { startWorkers } from './main'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  startWorkers(app)
}

bootstrap()

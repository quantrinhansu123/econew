import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { OperationalReminderEntity } from './operational-reminder.entity';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [TypeOrmModule.forFeature([OperationalReminderEntity, TruckEntity, HubEntity])],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}

import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class VendorSettlementConflictFilter extends BaseExceptionFilter {
  catch(error: QueryFailedError, host: ArgumentsHost) {
    const driver = error.driverError as { constraint?: string };
    if (['vendor_settlement_trip_locked', 'FK_vendor_settlement_trip', 'UQ_vendor_settlement_trip'].includes(driver.constraint || '')) {
      return host.switchToHttp().getResponse().status(409).json({
        statusCode: 409,
        message: 'Chuyến đã chốt công nợ kỳ. Không được đổi cước, NCC, ngày khởi hành, hủy hoặc xóa chuyến.',
      });
    }
    super.catch(error, host);
  }
}

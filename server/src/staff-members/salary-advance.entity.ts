import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CashJournalEntryEntity } from '../cash-journal-entries/cash-journal-entry.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { StaffMemberEntity } from './staff-member.entity';

@Entity('salary_advances')
export class SalaryAdvanceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'bigint' }) staff_member_id: string;
  @Column({ type: 'date' }) advance_date: string;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) amount: string;
  @Column({ type: 'bigint' }) fund_id: string;
  @Column({ type: 'bigint', nullable: true }) hub_id: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note: string | null;
  @Column({ type: 'bigint' }) cash_journal_entry_id: string;
  @Column({ type: 'bigint', nullable: true }) created_by: string | null;
  @ManyToOne(() => StaffMemberEntity, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'staff_member_id' }) staff_member: StaffMemberEntity;
  @ManyToOne(() => CashFundEntity, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fund_id' }) fund: CashFundEntity;
  @ManyToOne(() => HubEntity, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'hub_id' }) hub: HubEntity | null;
  @ManyToOne(() => CashJournalEntryEntity, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cash_journal_entry_id' }) cash_journal_entry: CashJournalEntryEntity;
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) creator: UserEntity | null;
  @CreateDateColumn({ type: 'timestamp' }) created_at: Date;
}

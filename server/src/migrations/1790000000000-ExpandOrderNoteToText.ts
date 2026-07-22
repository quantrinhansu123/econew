import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandOrderNoteToText1790000000000 implements MigrationInterface {
  name = 'ExpandOrderNoteToText1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "note" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "note" TYPE character varying(500)
      USING LEFT("note", 500)
    `);
  }
}

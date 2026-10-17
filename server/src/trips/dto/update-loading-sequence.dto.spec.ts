import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { ManifestEntity } from '../../manifests/manifest.entity';
import { UpdateLoadingSequenceDto } from './update-loading-sequence.dto';

describe('loading sequence note validation and persistence', () => {
  it('accepts a note for an empty manifest', async () => {
    const dto = plainToInstance(UpdateLoadingSequenceDto, { items: [], note: 'Gọi trước khi giao' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects non-text notes and invalid loading positions', async () => {
    const dto = plainToInstance(UpdateLoadingSequenceDto, {
      items: [{ waybill_id: 1, loading_position: 0 }], note: { text: 'invalid' },
    });
    expect((await validate(dto)).map(error => error.property)).toEqual(expect.arrayContaining(['items', 'note']));
  });

  it('maps the manifest note as a persistent nullable text column', () => {
    const noteColumn = getMetadataArgsStorage().columns.find(column => column.target === ManifestEntity && column.propertyName === 'note');
    expect(noteColumn?.options).toMatchObject({ type: 'text', nullable: true });
  });
});

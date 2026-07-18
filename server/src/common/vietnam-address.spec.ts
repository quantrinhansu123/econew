import { extractVietnamAddressParts } from './vietnam-address';

describe('extractVietnamAddressParts', () => {
  it('tách phường và quận từ địa chỉ có tiền tố đầy đủ', () => {
    expect(extractVietnamAddressParts(
      '215i Nguyễn Trãi, Phường Nguyễn Cư Trinh, Quận 1, TP HCM',
    )).toEqual({
      ward: 'Phường Nguyễn Cư Trinh',
      district: 'Quận 1',
    });
  });

  it('tách được dạng viết tắt phổ biến', () => {
    expect(extractVietnamAddressParts(
      '12 Lê Lợi, P. Bến Nghé, Q. 1, TP.HCM',
    )).toEqual({
      ward: 'P. Bến Nghé',
      district: 'Q. 1',
    });
  });

  it('không đoán tên đường thành địa bàn khi thiếu tiền tố', () => {
    expect(extractVietnamAddressParts('129 Trần Đại Nghĩa, Bình Chánh')).toEqual({
      ward: '',
      district: '',
    });
  });
});

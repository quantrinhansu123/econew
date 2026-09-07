import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InlineSelect from './InlineSelect';

describe('InlineSelect', () => {
  const options = ['Kg', 'Khối', 'Trọn gói', 'Chuyến', 'Lô'];

  it('renders plain text when editable is false', () => {
    const html = renderToStaticMarkup(
      <InlineSelect
        value="Trọn gói"
        options={options}
        editable={false}
        onSave={async () => {}}
      />,
    );
    expect(html).toContain('Trọn gói');
    expect(html).not.toContain('<select');
  });

  it('renders fallback dash when value is empty and editable is false', () => {
    const html = renderToStaticMarkup(
      <InlineSelect
        value=""
        options={options}
        editable={false}
        onSave={async () => {}}
      />,
    );
    expect(html).toContain('—');
  });

  it('renders select with options when editable is true', () => {
    const html = renderToStaticMarkup(
      <InlineSelect
        value="Trọn gói"
        options={options}
        editable={true}
        label="ĐVT cước"
        onSave={async () => {}}
      />,
    );
    expect(html).toContain('<select');
    expect(html).toContain('aria-label="ĐVT cước"');
    expect(html).toContain('value="Kg"');
    expect(html).toContain('value="Trọn gói"');
    expect(html).toContain('value="Khối"');
  });

  it('includes custom value in options if not present in options list', () => {
    const html = renderToStaticMarkup(
      <InlineSelect
        value="Tấn"
        options={options}
        editable={true}
        onSave={async () => {}}
      />,
    );
    expect(html).toContain('value="Tấn"');
  });
});

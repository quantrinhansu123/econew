import { parseWaybillImages } from '../../lib/waybillImages';

interface Props {
  value?: string | null;
  altPrefix: string;
}

export default function PrintImageGrid({ value, altPrefix }: Props) {
  const images = parseWaybillImages(value);
  if (!images.length) return null;

  return (
    <div className="print-image-grid">
      {images.map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt={`${altPrefix} ${index + 1}`}
          className="print-image-thumbnail"
          loading="eager"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ))}
    </div>
  );
}

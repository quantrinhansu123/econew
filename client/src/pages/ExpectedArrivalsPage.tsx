import LoadPlanningBoardPanel from './warehouse/load-planning/LoadPlanningBoardPanel';

export default function ExpectedArrivalsPage() {
  return (
    <LoadPlanningBoardPanel
      bannerTitle="Dự kiến xe đến"
      bannerDescription="Xe đang vận chuyển — sắp xếp theo giờ đến kho. Chỉ hiển thị dòng trạng thái Đang vận chuyển."
      forcedLoadStatuses={['IN_TRANSIT']}
    />
  );
}
